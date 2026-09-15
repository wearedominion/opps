#!/usr/bin/env node
// DOM-71 / DOM-81 / DOM-73 — faucet + sink catalog generator.
//
// Writes data/jobs.json, data/enemies.json and data/gear.json from the
// ratified design (2026-09-11, Jake):
//   · static tier ladder, gates every 10 levels from L10 to L110 (DOM-71)
//   · Clout income mix 60:35:5 moves:fights:recruiting, grind-led; recruiting
//     is flavour, so moves+fights carry the whole target at 60:35 (DOM-81)
//   · payouts geometric in gate level at the progression curve's own ratio
//   · every win reward priced from the DOM-79 break-even anchor:
//     R = BE·(1−p)·L/p with BE = hoursOfJobIncome × job$/h at the band
//   · mastery (`times`) is cosmetic; drop tables live on tier-top jobs and
//     run the full ladder now that the gear catalog does (DOM-73)
//   · gear (DOM-73, 2026-09-11; DOM-75, 2026-09-13): per-Plug inventory as
//     data, own-once; only the FIELDED loadout (best per type, zero-crew
//     baseline) counts in combat; prices = hours of best-job income at the gating level
//     (weapon 8h / armor 8h / vehicle 12h / utility 4h; sub-L5 starters keep
//     authored prices). Names and plug assignments are pure content in
//     GEAR_CONTENT — swap them freely, the solve never reads them.
//
// The simulator is the oracle: this script writes candidate catalogs, runs
// tools/econ-sim/sim.js, reads out/results.json, and solves three knobs —
//   E  early gates (1–7)    → casual level 8 at day 1
//   M  mid gates (10–30)    → casual level 40 at day 30
//   K  late gates (40–110)  → committed level 120 at day 365
// No game constant is duplicated here: everything reads data/*.json through
// js/tuning.js, and targets come from tools/econ-sim/targets.json.
//
// Run from the repo root:  node tools/econ-sim/gen-catalog.js

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const readJSON = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const { tune, evalCurve } = require(path.join(ROOT, 'js', 'tuning.js'));
const { fmStats, fmSeededRng } = require(path.join(ROOT, 'js', 'fightmath.js'));

const TUNING = readJSON('data/tuning.json');
const TARGETS = readJSON('tools/econ-sim/targets.json');
const PROGRESSION = readJSON('data/progression.json').levels;
const T = p => tune(p, TUNING);

// ── Model rates (mirrors sim.js definitions, same live sources) ──────────────
const p0 = TARGETS.assumptions.winProbabilityNominal;
const MOVES_PER_HOUR = 3600 / T('pools.moves.regenSeconds') * T('pools.moves.regenAmount');
const STAMINA_PER_HOUR = 3600 / T('pools.stamina.regenSeconds') * T('pools.stamina.regenAmount');

// Fight pacing under turn-based combat (DOM-72): a defeat hospitalizes, so the
// free fight cadence is a CYCLE — 1/(1−p0) fights, then the Hospital timer.
// The Cash early-out buys back up to the stamina cap; the free cycle is the
// pacing baseline, same as the sim.
const FIGHTS_PER_CYCLE = 1 / (1 - p0);
const CYCLE_HOURS = T('hospital.fullHealSeconds') / 3600;
const FIGHTS_PER_HOUR = Math.min(
  STAMINA_PER_HOUR / T('combat.staminaPerFight'),
  FIGHTS_PER_CYCLE / CYCLE_HOURS);

const committed = TARGETS.playerProfiles.committed;
const MOVES_PER_DAY_C = MOVES_PER_HOUR * 24 * committed.movesUse;
const FIGHTS_PER_DAY_C = FIGHTS_PER_HOUR * 24 * committed.staminaUse;

// Clout EV share of the win reward per fight (win + defeatCloutShare on loss).
const EV_SHARE = p0 + (1 - p0) * T('combat.defeatCloutShare');

// Win-Clout : job-clout/move ratio that realizes the ratified mix for the
// committed reference player at any level where both faucets are banded.
const MIX = TARGETS.cloutIncomeMix;
const WC_RATIO = (MIX.fights / MIX.moves) * MOVES_PER_DAY_C / (FIGHTS_PER_DAY_C * EV_SHARE);

// Payouts scale at the progression curve's own ratio so a gate stays worth
// what its levels cost.
const RATIO = PROGRESSION[1].cloutToNext / PROGRESSION[0].cloutToNext;

// ── The ladder ────────────────────────────────────────────────────────────────
// Early jobs keep their ids, flavour, moves costs and cash; clout is re-solved.
// The clout SHAPE is deliberately near-flat (the legacy ×3 ramp to L7 is what
// made day 30 overshoot): early levels are fast because the cost curve is low,
// not because income ramps. Drop tables sit on the tier-top jobs and stop
// where the 6-item gear catalog ends (DOM-73).
// Per-job drop tables are GONE (DOM-18, 2026-09-14): drops now roll globally
// on every job completion and fight win — a proc gate then the rarity ladder,
// both tuning knobs (drops.*). js/drops.js owns the client roll.
const EARLY_JOBS = [
  { id: 'lookout',  name: 'Be a Lookout',    moves: 1, levelReq: 1, times: 10, cash: [20, 40],    shape: 10.0 },
  { id: 'runner',   name: 'Run Packages',    moves: 2, levelReq: 1, times: 8,  cash: [50, 90],    shape: 10.0 },
  { id: 'boost',    name: 'Boost a Whip',    moves: 3, levelReq: 2, times: 6,  cash: [100, 180],  shape: 10.5 },
  { id: 'stash',    name: 'Guard the Stash', moves: 2, levelReq: 2, times: 8,  cash: [80, 130],   shape: 11.0 },
  { id: 'shake',    name: 'Shake a Block',   moves: 3, levelReq: 3, times: 5,  cash: [150, 250],  shape: 11.5 },
  { id: 'hit',      name: 'Pull a Lick',     moves: 4, levelReq: 3, times: 4,  cash: [200, 400],  shape: 12.0 },
  { id: 'move',     name: 'Move Weight',     moves: 5, levelReq: 5, times: 3,  cash: [400, 700],  shape: 13.0 },
  { id: 'takeover', name: 'Block Takeover',  moves: 6, levelReq: 7, times: 2,  cash: [600, 1000], shape: 14.0 },
];

const NEW_JOBS = [
  { id: 'traphouse',  name: 'Run a Trap House',        gate: 10,  moves: 6, times: 3 },
  { id: 'fixfight',   name: 'Fix a Fight',             gate: 20,  moves: 6, times: 3 },
  { id: 'hijack',     name: 'Hijack a Shipment',       gate: 30,  moves: 7, times: 3 },
  { id: 'precinct',   name: 'Flip a Precinct',         gate: 40,  moves: 7, times: 2 },
  { id: 'docks',      name: 'Run the Docks',           gate: 50,  moves: 7, times: 2 },
  { id: 'club',       name: 'Own the Night Club',      gate: 60,  moves: 8, times: 2 },
  { id: 'contract',   name: 'Rig the City Contract',   gate: 70,  moves: 8, times: 2 },
  { id: 'interstate', name: 'Run Guns Interstate',     gate: 80,  moves: 8, times: 2 },
  { id: 'judge',      name: 'Buy a Judge',             gate: 90,  moves: 8, times: 2 },
  { id: 'commission', name: 'Take the Commission Seat', gate: 100, moves: 8, times: 2 },
  { id: 'runcity',    name: 'Run the City',            gate: 110, moves: 8, times: 2 },
];

// Cash per move continues the existing top job's rate geometrically, so the
// cash economy has no seam at the old catalog boundary.
const CASH_ANCHOR_GATE = 7;
const CASH_ANCHOR = (600 + 1000) / 2 / 6; // takeover mean per move

// Early enemies keep ids, flavour and stats; rewards are re-priced. `weight`
// scales an in-band lesser enemy below its band anchor.
const EARLY_ENEMIES = [
  { id: 'snitch',  name: 'Local Snitch',   role: 'Informant',       hp: 40,  atk: 6,  def: 3,  levelReq: 1, weight: 0.5 },
  { id: 'stick',   name: 'Block Bully',    role: 'Street Muscle',   hp: 70,  atk: 12, def: 6,  levelReq: 1, weight: 1.0 },
  { id: 'jackers', name: 'Car Jackers',    role: 'Auto Theft Ring', hp: 90,  atk: 18, def: 8,  levelReq: 2, weight: 1.0 },
  { id: 'oppcrew', name: 'Opp Crew',       role: 'Gang of Hooligans', hp: 120, atk: 20, def: 10, levelReq: 3, weight: 1.0 },
  { id: 'fed',     name: 'Undercover Fed', role: 'Federal Agent',   hp: 160, atk: 25, def: 20, levelReq: 4, weight: 1.0 },
  { id: 'rival',   name: 'Rival Boss',     role: 'Gang Leader',     hp: 200, atk: 30, def: 15, levelReq: 5, weight: 1.0 },
];

const NEW_ENEMIES = [
  { id: 'corner',     name: 'Corner Captain',       role: 'Block Chief',       gate: 10 },
  { id: 'trapboss',   name: 'Trap House Boss',      role: 'Rival Operator',    gate: 20 },
  { id: 'cartel',     name: 'Cartel Runner',        role: 'Supply Muscle',     gate: 30 },
  { id: 'detective',  name: 'Dirty Detective',      role: 'Crooked Cop',       gate: 40 },
  { id: 'syndicate',  name: 'Dock Syndicate',       role: 'Waterfront Crew',   gate: 50 },
  { id: 'kingpin',    name: 'Club Kingpin',         role: 'Nightlife Boss',    gate: 60 },
  { id: 'fixer',      name: 'The Fixer',            role: 'City Hall Broker',  gate: 70 },
  { id: 'gunchief',   name: 'Gun Runner Chief',     role: 'Arms Ring Boss',    gate: 80 },
  { id: 'enforcer',   name: 'Commission Enforcer',  role: 'Syndicate Muscle',  gate: 90 },
  { id: 'shadowboss', name: 'Shadow Boss',          role: 'Underworld Power',  gate: 100 },
  { id: 'thedon',     name: 'The Don',              role: 'The Last Boss',     gate: 110 },
];

// Enemy HP continues the legacy display trend. ATK/DEF are no longer trend
// extrapolations: under turn-based combat (DOM-72) they are CONSUMED by the
// round model, so they are solved — proportional to the expected player
// loadout at the band, scaled so the model's win probability against a
// band-appropriate opponent sits at the pricing nominal p0. One multiplier
// serves every band because the round model is scale-invariant in the ratios.
const STAT_ANCHOR = { hp: 200, gate: 5 };
// atk/def were MISSING here until DOM-75 (undefined ** x → NaN → 0), which
// silently shipped a zero-stat gear ladder above L7. 1.40 per 10 levels is
// what the gear stat-curve comment below always promised.
const STAT_RATIO_PER_10 = { hp: 1.45, atk: 1.40, def: 1.40 };

const FIGHT_CFG = {
  roundDamageShare: T('combat.roundDamageShare'),
  damageSpread: T('combat.damageSpread'),
  firstStrikeEdge: T('combat.firstStrikeEdge'),
  baseHp: T('start.health'),
};

// Expected loadout at a band (DOM-75): the best item per gear type at or
// below the gate, at upgrade level 0 — one slot per type, the zero-crew
// baseline. Owning is no longer fielding: only the capacity-limited loadout
// counts in combat, so the solve prices the floor; Crew-unlocked secondary
// slots lift a player above band nominal, which is the recruiting reward.
function loadoutAt(gear, band) {
  const best = {};
  for (const i of gear) {
    // dropOnly (blue+) is excluded: the solve prices the BUYABLE floor
    // (DOM-18) — a lucky drop lifts a player above nominal, like Crew slots.
    if (i.dropOnly || i.levelReq > band) continue;
    if (!best[i.type] || i.atk + i.def > best[i.type].atk + best[i.type].def) best[i.type] = i;
  }
  const picks = Object.keys(best).map(t => best[t]);
  return {
    atk: T('start.attack') + picks.reduce((s, i) => s + i.atk, 0),
    def: T('start.defense') + picks.reduce((s, i) => s + i.def, 0),
    hp: T('start.health'),
  };
}

// Solve each enemy's ATK/DEF multiplier m so pWin(band loadout vs m×loadout,
// at the enemy's real HP) ≈ p0. Solved PER ENEMY since DOM-75: player and
// enemy HP are absolute while gear stats climb ×1.40 per 10 levels, so round
// counts — and with them the p0 stat ratio — shift by band; the old single
// band-invariant multiplier only ever held because the stat-ratio bug kept
// every band's loadout flat. Deterministic (seeded rng) so regenerated
// catalogs are reproducible; memoized per enemy — gear and enemy HP are
// knob-independent, so the solve is stable across the E/M/K search.
const _enemyMult = {};
function enemyStatMult(gear, e) {
  if (_enemyMult[e.id] !== undefined) return _enemyMult[e.id];
  const L = loadoutAt(gear, e.band);
  const pWinAt = m => fmStats(L,
    { atk: m * L.atk, def: m * L.def, maxHp: e.hp },
    FIGHT_CFG, 4000, fmSeededRng(0xD0A472 + 31 * e.band)).pWin;
  let lo = 0.2, hi = 8;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (pWinAt(mid) > p0) lo = mid; else hi = mid;
  }
  return (_enemyMult[e.id] = (lo + hi) / 2);
}

// ── Gear (DOM-73) ─────────────────────────────────────────────────────────────
// GEAR_CONTENT is the identity layer: ids, display names, types and vendors.
// Everything numeric (stats, prices) is derived below, so renaming an item —
// the planned real-gun content pass included — is a pure content edit here.
// `price` marks an authored starter price (sub-L5 onboarding buys); everything
// else is priced by the rule. `stats` marks authored legacy stats kept for
// save continuity; generated stats ride the enemy power trend (matchmaking
// inputs — DOM-72 owns the combat math that consumes them).
//
// Vendors (per-Plug inventory, ratified 2026-09-11): weapons move through
// Tommy the Fence, armor through Theresa the Connect, vehicles through Big
// Homie Marco the Mechanic, utility through Kylie the Lookout — and the
// L110 endgame kit is Dex's "big one". Ids must exist in js/plugs.js.
// Rarity (DOM-18, ratified 2026-09-14): five authored tiers, an order of
// magnitude apart in drop odds — grey → green → blue → purple → orange.
// The buyable ladder is grey (sub-L10 starters) and green (the main ladder);
// blue/purple/orange are DROP-ONLY variants at the same gates, priced and
// statted at +15% per rarity step over the gate baseline (blue ×1.15,
// purple ×1.32, orange ×1.52) — deliberately under one 10-level climb
// (×1.40) so a lucky drop never outruns progression. Oranges never drop in
// v1 (rate 0 in tuning): the DOM-92 premium/event supply shelf, surfaced as
// aspirational in the Profile gear tab's ON THE STREETS list (VAULTED chip)
// once level-gated into view. The enemy p0 solve reads ONLY the
// buyable baseline (loadoutAt skips dropOnly), so rarity shifts no balance.
const RARITY_STEP = 1.15;
// mythic is plumbed (tokens, labels, odds authored 0) but RESERVED — no v1
// item may carry it; writeCatalogs throws if one appears.
const RARITY_PREMIUM = { grey: 0, green: 0, blue: 1, purple: 2, orange: 3, mythic: 4 };
const rarityMult = r => RARITY_STEP ** RARITY_PREMIUM[r];

// Paper-doll slots (DOM-121). SLOT_IDS is the whole model; GEAR_OFFHAND names
// the items that go in the left hand rather than the right — sidearms, melee,
// and the one shield in the catalog. Everything else follows its type.
const SLOT_IDS = ['head', 'torso', 'handR', 'handL', 'legs', 'ride', 'stash'];
const SLOT_BY_TYPE = { weapon: 'handR', armor: 'torso', vehicle: 'ride', utility: 'stash' };
const GEAR_OFFHAND = new Set(['knife', 'glock', 'fiveseven', 'golddeagle', 'tec9', 'mac11', 'ballistic']);

const GEAR_CONTENT = [
  // legacy six — ids are load-bearing (saves, quest steps)
  { id: 'knife',    name: 'Switchblade',      type: 'weapon',  gate: 1,   rarity: 'grey', price: 200, stats: { atk: 5 } },
  { id: 'burner',   name: 'Burner Phone',     type: 'utility', gate: 2,   rarity: 'grey', price: 600, stats: { atk: 5, def: 5 } },
  { id: 'vest',     name: 'Bulletproof Vest', type: 'armor',   gate: 3,   rarity: 'grey', price: 500, stats: { def: 10 } },
  { id: 'glock',    name: 'Glock 19',         type: 'weapon',  gate: 5,   rarity: 'grey', stats: { atk: 15 } },
  // bando's legacy +10 HP folded into DEF (DOM-75): fielded-gear HP would need
  // pool plumbing regen/hospital don't have, and this was the only hp item.
  { id: 'bando',    name: 'Safe House',       type: 'utility', gate: 7,   rarity: 'grey', stats: { def: 25 } },
  { id: 'ak',       name: 'Draco',            type: 'weapon',  gate: 20,  rarity: 'green' },
  // the green ladder — the buyable baseline the enemy solve is anchored to.
  // Names carry the DOM-18 real-name pass; ids never change.
  { id: 'mac11',    name: 'MAC-11',           type: 'weapon',  gate: 10,  rarity: 'green' },
  { id: 'stabvest', name: 'Stab Vest',        type: 'armor',   gate: 10,  rarity: 'green' },
  { id: 'dirtbike', name: 'Dirt Bike',        type: 'vehicle', gate: 10,  rarity: 'green' },
  { id: 'kevlar',   name: 'Kevlar Hoodie',    type: 'armor',   gate: 20,  rarity: 'green' },
  { id: 'boxchevy', name: 'Box Chevy',        type: 'vehicle', gate: 20,  rarity: 'green' },
  { id: 'pump',     name: 'Mossberg 500',     type: 'weapon',  gate: 30,  rarity: 'green' },
  { id: 'plates',   name: 'AR500 Plates',     type: 'armor',   gate: 30,  rarity: 'green' },
  { id: 'coupe',    name: 'AMG Coupe',        type: 'vehicle', gate: 30,  rarity: 'green' },
  { id: 'switchie', name: 'Switchie',         type: 'weapon',  gate: 40,  rarity: 'green' },
  { id: 'ballistic', name: 'Ballistic Shield', type: 'armor',  gate: 40,  rarity: 'green' },
  { id: 'blacksuv', name: 'Blacked-Out Tahoe', type: 'vehicle', gate: 40, rarity: 'green' },
  { id: 'drummy',   name: 'Drum-Fed AR-15',   type: 'weapon',  gate: 50,  rarity: 'green' },
  { id: 'dragonskin', name: 'Dragon Skin',    type: 'armor',   gate: 50,  rarity: 'green' },
  { id: 'armsedan', name: 'Armored Sedan',    type: 'vehicle', gate: 50,  rarity: 'green' },
  { id: 'carbine',  name: 'M4 Carbine',       type: 'weapon',  gate: 60,  rarity: 'green' },
  { id: 'fullkev',  name: 'Full Kevlar Suit', type: 'armor',   gate: 60,  rarity: 'green' },
  { id: 'sprinter', name: 'Stash Sprinter',   type: 'vehicle', gate: 60,  rarity: 'green' },
  { id: 'sniper',   name: 'Remington 700',    type: 'weapon',  gate: 70,  rarity: 'green' },
  { id: 'fedvest',  name: 'FBI Raid Vest',    type: 'armor',   gate: 70,  rarity: 'green' },
  { id: 'lowkey',   name: 'Low-Key Limo',     type: 'vehicle', gate: 70,  rarity: 'green' },
  { id: 'beltfed',  name: 'M249 SAW',         type: 'weapon',  gate: 80,  rarity: 'green' },
  { id: 'bunker',   name: 'EOD Suit',         type: 'armor',   gate: 80,  rarity: 'green' },
  { id: 'gunboat',  name: 'Harbor Gunboat',   type: 'vehicle', gate: 80,  rarity: 'green' },
  { id: 'fiftycal', name: 'Barrett .50 Cal',  type: 'weapon',  gate: 90,  rarity: 'green' },
  { id: 'titanium', name: 'Titanium Weave',   type: 'armor',   gate: 90,  rarity: 'green' },
  { id: 'helo',     name: 'Private Helo',     type: 'vehicle', gate: 90,  rarity: 'green' },
  { id: 'minigun',  name: 'M134 Minigun',     type: 'weapon',  gate: 100, rarity: 'green' },
  { id: 'exorig',   name: 'Exo Rig',          type: 'armor',   gate: 100, rarity: 'green' },
  { id: 'jet',      name: 'Private Jet',      type: 'vehicle', gate: 100, rarity: 'green' },
  { id: 'arsenal',  name: 'The Arsenal',      type: 'weapon',  gate: 110, rarity: 'green', plug: 'plug-dex' },
  { id: 'fortress', name: 'Mobile Fortress',  type: 'armor',   gate: 110, rarity: 'green', plug: 'plug-dex' },
  { id: 'yacht',    name: 'Armored Yacht',    type: 'vehicle', gate: 110, rarity: 'green', plug: 'plug-dex' },
  // blue — drop-only, one per type per main gate (×1.15 over the baseline)
  { id: 'tec9',     name: 'TEC-9',            type: 'weapon',  gate: 10,  rarity: 'blue' },
  { id: 'ceramic',  name: 'Ceramic Plates',   type: 'armor',   gate: 10,  rarity: 'blue' },
  { id: 'ninja',    name: 'Ninja 400',        type: 'vehicle', gate: 10,  rarity: 'blue' },
  { id: 'ak47',     name: 'AK-47',            type: 'weapon',  gate: 20,  rarity: 'blue' },
  { id: 'iiia',     name: 'Level IIIA Vest',  type: 'armor',   gate: 20,  rarity: 'blue' },
  { id: 'donk',     name: 'Donk Caprice',     type: 'vehicle', gate: 20,  rarity: 'blue' },
  { id: 'spas12',   name: 'SPAS-12',          type: 'weapon',  gate: 30,  rarity: 'blue' },
  { id: 'riot',     name: 'Riot Armor',       type: 'armor',   gate: 30,  rarity: 'blue' },
  { id: 'hellcat',  name: 'Hellcat',          type: 'vehicle', gate: 30,  rarity: 'blue' },
  { id: 'mp5',      name: 'MP5',              type: 'weapon',  gate: 40,  rarity: 'blue' },
  { id: 'lvl4',     name: 'Level IV Plates',  type: 'armor',   gate: 40,  rarity: 'blue' },
  { id: 'escalade', name: 'Armored Escalade', type: 'vehicle', gate: 40,  rarity: 'blue' },
  { id: 'scar17',   name: 'SCAR 17',          type: 'weapon',  gate: 50,  rarity: 'blue' },
  { id: 'jugg',     name: 'Juggernaut Vest',  type: 'armor',   gate: 50,  rarity: 'blue' },
  { id: 'maybach',  name: 'Maybach S680',     type: 'vehicle', gate: 50,  rarity: 'blue' },
  { id: 'hk416',    name: 'HK416',            type: 'weapon',  gate: 60,  rarity: 'blue' },
  { id: 'interceptor', name: 'Interceptor Rig', type: 'armor', gate: 60,  rarity: 'blue' },
  { id: 'gwagon',   name: 'G-Wagon',          type: 'vehicle', gate: 60,  rarity: 'blue' },
  { id: 'svd',      name: 'Dragunov SVD',     type: 'weapon',  gate: 70,  rarity: 'blue' },
  { id: 'spectra',  name: 'Spectra Shield',   type: 'armor',   gate: 70,  rarity: 'blue' },
  { id: 'phantom',  name: 'Rolls Phantom',    type: 'vehicle', gate: 70,  rarity: 'blue' },
  { id: 'm240',     name: 'M240 Bravo',       type: 'weapon',  gate: 80,  rarity: 'blue' },
  { id: 'blastsuit', name: 'Blast Suit',      type: 'armor',   gate: 80,  rarity: 'blue' },
  { id: 'cigboat',  name: 'Cigarette Boat',   type: 'vehicle', gate: 80,  rarity: 'blue' },
  { id: 'tac50',    name: 'TAC-50',           type: 'weapon',  gate: 90,  rarity: 'blue' },
  { id: 'graphene', name: 'Graphene Weave',   type: 'armor',   gate: 90,  rarity: 'blue' },
  { id: 'blackhawk', name: 'Black Hawk',      type: 'vehicle', gate: 90,  rarity: 'blue' },
  { id: 'gau19',    name: 'GAU-19',           type: 'weapon',  gate: 100, rarity: 'blue' },
  { id: 'pwrframe', name: 'Powered Frame',    type: 'armor',   gate: 100, rarity: 'blue' },
  { id: 'g650',     name: 'Gulfstream G650',  type: 'vehicle', gate: 100, rarity: 'blue' },
  { id: 'goldak',   name: 'Gold-Plated AK',   type: 'weapon',  gate: 110, rarity: 'blue' },
  { id: 'citadel',  name: 'Citadel Rig',      type: 'armor',   gate: 110, rarity: 'blue' },
  { id: 'megayacht', name: 'Megayacht',       type: 'vehicle', gate: 110, rarity: 'blue' },
  // purple — drop-only, one per main gate, type rotating (×1.32)
  { id: 'fiveseven', name: 'FN Five-seveN',   type: 'weapon',  gate: 10,  rarity: 'purple' },
  { id: 'boron',    name: 'Boron Carbide Vest', type: 'armor', gate: 20,  rarity: 'purple' },
  { id: 'demon',    name: 'Demon 170',        type: 'vehicle', gate: 30,  rarity: 'purple' },
  { id: 'p90',      name: 'FN P90',           type: 'weapon',  gate: 40,  rarity: 'purple' },
  { id: 'adaptive', name: 'Adaptive Plate Rig', type: 'armor', gate: 50,  rarity: 'purple' },
  { id: 'chiron',   name: 'Chiron',           type: 'vehicle', gate: 60,  rarity: 'purple' },
  { id: 'g28',      name: 'HK G28',           type: 'weapon',  gate: 70,  rarity: 'purple' },
  { id: 'titanshell', name: 'Titan Exoshell', type: 'armor',   gate: 80,  rarity: 'purple' },
  { id: 'stealthhelo', name: 'Stealth Helo',  type: 'vehicle', gate: 90,  rarity: 'purple' },
  { id: 'xm7',      name: 'SIG XM7',          type: 'weapon',  gate: 100, rarity: 'purple' },
  { id: 'aegis',    name: 'Aegis Plate',      type: 'armor',   gate: 110, rarity: 'purple' },
  // orange — never drops in v1 (rate 0): the DOM-92 premium/event shelf (×1.52)
  { id: 'golddeagle', name: 'Gold Desert Eagle', type: 'weapon', gate: 20, rarity: 'orange' },
  { id: 'thebeast', name: 'The Beast',        type: 'vehicle', gate: 40,  rarity: 'orange' },
  { id: 'midas',    name: 'Midas Plate',      type: 'armor',   gate: 60,  rarity: 'orange' },
  { id: 'railgun',  name: 'Railgun Prototype', type: 'weapon', gate: 80,  rarity: 'orange' },
  { id: 'leviathan', name: 'The Leviathan',   type: 'vehicle', gate: 110, rarity: 'orange' },
];

// ── Plug quests (DOM-90) ──────────────────────────────────────────────────────
// Same identity/derivation split: QUEST_CONTENT is names, steps and flavour;
// the completion bonus is priced by rule. Ratified 2026-09-14 (Jake):
//   · steps route through the EXISTING faucets — the jobs and fights a quest
//     requires pay their normal rates while you grind them, so the 60:35
//     Clout mix is untouched by construction;
//   · completion pays a one-time bonus = `hours` of best-job income at the
//     quest's gate (cash + the same hours' worth of best-job Clout);
//   · one-shot per player (finite faucet — the sim checks the totals);
//   · a quest may grant one own-once gear item (counted at catalog price).
// Step ids must exist in the generated catalogs; writeCatalogs validates.
const QUEST_CONTENT = [
  { id: 'fence_run', plug: 'plug-tommy', gate: 1, hours: 1,
    name: 'Move the Merchandise',
    desc: 'Tommy has a buyer out back of the pawn shop. Keep the packages moving until the order is filled.',
    steps: [{ type: 'job', id: 'runner', count: 5 }, { type: 'job', id: 'lookout', count: 3 }] },
  { id: 'snitch_problem', plug: 'plug-theresa', gate: 2, hours: 1.5,
    name: 'The Snitch Problem',
    desc: 'A snitch downtown is running his mouth about Theresa’s shipments. Make the problem disappear.',
    steps: [{ type: 'fight', id: 'snitch', count: 3 }] },
  { id: 'while_they_sleep', plug: 'plug-kylie', gate: 3, hours: 1.5,
    name: 'While They Sleep',
    desc: 'Kylie’s intel: the crew rotates spots every few days. Hit them before it goes stale.',
    steps: [{ type: 'fight', id: 'oppcrew', count: 3 }] },
  { id: 'parts_run', plug: 'plug-marco', gate: 5, hours: 2,
    name: 'Liberate the Inventory',
    desc: 'Marco’s shop is dry. The Auto Theft Ring’s warehouse isn’t — run it, then move the weight.',
    steps: [{ type: 'fight', id: 'jackers', count: 3 }, { type: 'job', id: 'move', count: 4 }] },
  { id: 'the_big_one', plug: 'plug-dex', gate: 7, hours: 3,
    name: 'The Big One',
    desc: 'Six minutes behind the bank, every Thursday. Come strapped, run the block first, then take the truck.',
    steps: [{ type: 'item', id: 'glock' }, { type: 'job', id: 'takeover', count: 5 },
            { type: 'fight', id: 'rival', count: 2 }],
    rewardItem: 'bando' },
];

// ── Spots (DOM-74) ────────────────────────────────────────────────────────────
// Same identity/derivation split as gear: SPOT_CONTENT is names and flavour
// only; rates and prices are derived. Ratified 2026-09-11 (Jake): own-once
// ladder on the same 16 gates; a spot accrues ~10% of its gate's best-job
// $/h; the purchase pays back in ~7 days of once-daily collects at the gate
// (daily value = rate × the level-gated offline cap from data/unlocks.json,
// evaluated at the gate). Uncollected accrual is NOT lootable in v1.
const SPOT_CONTENT = [
  { id: 'corner',    name: 'Corner Store',        gate: 1 },
  { id: 'barber',    name: 'Barber Shop',         gate: 2 },
  { id: 'laundry',   name: 'Laundromat',          gate: 3 },
  { id: 'carwash',   name: 'Car Wash',            gate: 5 },
  { id: 'club',      name: 'Nightclub',           gate: 7 },
  { id: 'pawnshop',  name: 'Pawn Shop',           gate: 10 },
  { id: 'dispo',     name: 'Dispensary',          gate: 20 },
  { id: 'chopshop',  name: 'Chop Shop',           gate: 30 },
  { id: 'diner',     name: '24hr Diner',          gate: 40 },
  { id: 'stripmall', name: 'Strip Mall',          gate: 50 },
  { id: 'casino',    name: 'Underground Casino',  gate: 60 },
  { id: 'towers',    name: 'Apartment Towers',    gate: 70 },
  { id: 'freight',   name: 'Freight Company',     gate: 80 },
  { id: 'privbank',  name: 'Private Bank',        gate: 90 },
  { id: 'highrise',  name: 'Downtown High-Rise',  gate: 100 },
  { id: 'ports',     name: 'The Ports',           gate: 110 },
];
const SPOT_RATE_SHARE = 0.10;   // of best-job $/h at the gate
const SPOT_PAYBACK_DAYS = 7;    // once-daily collects at the gate
const UNLOCKS = readJSON('data/unlocks.json');
const spotCapHoursAt = level =>
  evalCurve(UNLOCKS.capabilities.spotOfflineCapSeconds, level) / 3600;

const PLUG_BY_TYPE = {
  weapon: 'plug-tommy', armor: 'plug-theresa',
  vehicle: 'plug-marco', utility: 'plug-kylie',
};

// Price rule: hours of best-job income at the gating level. A gate's full
// kit lands around 1.3 committed days (~3 casual) — a real save-up target
// beside the DOM-79 8h break-even, at every band.
const GEAR_HOURS_BY_TYPE = { weapon: 8, armor: 8, vehicle: 12, utility: 4 };

// Stat curves ride the enemy trend (×1.40 per 10 levels), anchored to the
// legacy items so there is no seam: weapons to the Draco (30 ATK at L20),
// armor to the Vest (10 DEF at L3). Vehicles are hybrid at 40% of each.
const gearAtk = g => 30 * STAT_RATIO_PER_10.atk ** ((g - 20) / 10);
const gearDef = g => 10 * STAT_RATIO_PER_10.def ** ((g - 3) / 10);
const GEAR_STATS_BY_TYPE = {
  weapon:  g => ({ atk: gearAtk(g), def: 0, hp: 0 }),
  armor:   g => ({ atk: 0, def: gearDef(g), hp: 0 }),
  vehicle: g => ({ atk: 0.4 * gearAtk(g), def: 0.4 * gearDef(g), hp: 0 }),
  utility: g => ({ atk: 0, def: 0, hp: 0 }), // only legacy-authored utilities exist
};

const nice = v => {
  if (v < 100) return Math.max(1, Math.round(v));
  if (v < 1000) return Math.round(v / 5) * 5;
  const m = 10 ** (Math.floor(Math.log10(v)) - 2);
  return Math.round(v / m) * m;
};

// ── Catalog construction for a knob triple ────────────────────────────────────
function buildCatalogs(E, M, K) {
  const cpmAtGate = g =>
    g <= 7 ? null // early jobs use shape × E individually
      : (g <= 30 ? M : K) * RATIO ** g;

  const jobs = [];
  for (const j of EARLY_JOBS) jobs.push({ ...j, cpm: j.shape * E });
  // New gates must strictly out-earn everything before them, whatever the knobs.
  let prevCpm = EARLY_JOBS[EARLY_JOBS.length - 1].shape * E;
  for (const j of NEW_JOBS) {
    const cpm = Math.max(cpmAtGate(j.gate), prevCpm * 1.02);
    prevCpm = cpm;
    jobs.push({ ...j, levelReq: j.gate, cpm });
  }

  // tier = index of the distinct level gate, in order
  const gates = [...new Set(jobs.map(j => j.levelReq))].sort((a, b) => a - b);
  const jobsOut = jobs.map(j => {
    const cashPerMove = j.cash
      ? null // early: keep authored cash
      : CASH_ANCHOR * RATIO ** (j.levelReq - CASH_ANCHOR_GATE);
    const meanCash = j.cash ? null : cashPerMove * j.moves;
    return {
      id: j.id, name: j.name,
      tier: gates.indexOf(j.levelReq) + 1,
      moves: j.moves,
      cash: j.cash ? j.cash : [nice(meanCash * 0.8), nice(meanCash * 1.2)],
      clout: Math.max(1, Math.round(j.cpm * j.moves)),
      levelReq: j.levelReq,
      times: j.times,
    };
  });

  // best job cash/move and clout/move per band, for enemy pricing
  const bestAt = (level, metric) => Math.max(...jobsOut
    .filter(j => j.levelReq <= level)
    .map(metric));
  const jobCashPerHour = L => bestAt(L, j => (j.cash[0] + j.cash[1]) / 2 / j.moves) * MOVES_PER_HOUR;
  const jobCpm = L => bestAt(L, j => j.clout / j.moves);

  // DOM-79 anchor: R = BE·(1−p)·L/p, BE = hoursOfJobIncome × job$/h at band
  const BE_HOURS = TARGETS.breakEven.hoursOfJobIncome;
  const LOSS = T('loot.defeatLossRate');
  const rewardCash = L => BE_HOURS * jobCashPerHour(L) * (1 - p0) * LOSS / p0;

  // Gear (DOM-73). Prices track job income only, so they are independent of
  // the Clout knobs — rebuilt every candidate write purely for convenience.
  // Built before enemies: enemy ATK/DEF are solved against the band loadout.
  const gear = GEAR_CONTENT.map(item => {
    // Paper-doll slot (DOM-121: 7 slots, single-depth; DOM-123 assigned them).
    // Slot ids are SAVE KEYS — permanent, lowercase, never reused. The catalog
    // is authored against the legacy 4-type model, so slot is derived from it:
    // vehicles ride, utilities stash, body armour torso, long guns handR, and
    // anything in GEAR_OFFHAND (sidearms, melee, the shield) handL. `head` and
    // `legs` have no v1 items — see data/README.md.
    const slot = GEAR_OFFHAND.has(item.id) ? 'handL' : SLOT_BY_TYPE[item.type];
    if (!slot) throw new Error(item.id + ': no slot for type "' + item.type + '"');
    // Rarity premium (DOM-18): stats AND the notional price carry ×1.15 per
    // step over the gate baseline. Drop-only items keep a price because the
    // DOM-88 upgrade cost curve scales by it — they just can't be bought.
    const mult = rarityMult(item.rarity);
    const s = item.stats ?? GEAR_STATS_BY_TYPE[item.type](item.gate);
    const atk = Math.round((s.atk || 0) * mult), def = Math.round((s.def || 0) * mult),
          hp = Math.round((s.hp || 0) * mult);
    const price = item.price
      ?? nice(GEAR_HOURS_BY_TYPE[item.type] * jobCashPerHour(item.gate) * mult);
    const desc = [atk && `+${atk} ATK`, def && `+${def} DEF`, hp && `+${hp} HP`]
      .filter(Boolean).join(' ');
    const dropOnly = RARITY_PREMIUM[item.rarity] > 0;
    return {
      id: item.id, name: item.name, desc,
      type: item.type,
      slot,
      tier: gates.indexOf(item.gate) + 1,
      levelReq: item.gate,
      rarity: item.rarity,
      // drop-only gear has no vendor: it never renders in a store
      ...(dropOnly ? { dropOnly: true } : { plug: item.plug ?? PLUG_BY_TYPE[item.type] }),
      price, atk, def, hp,
      upgradeable: true,
    };
  }).sort((a, b) => a.levelReq - b.levelReq || a.id.localeCompare(b.id));

  // Enemies. Rewards priced from the band's job income (DOM-79/71/81);
  // ATK/DEF solved so the band matchup sits at p0 against the expected
  // loadout (DOM-72); HP keeps the legacy display trend.
  const enemies = [
    ...EARLY_ENEMIES.map(e => ({ ...e, band: e.levelReq })),
    ...NEW_ENEMIES.map(e => {
      const steps = (e.gate - STAT_ANCHOR.gate) / 10;
      return {
        ...e, band: e.gate, levelReq: e.gate, weight: 1.0,
        hp: nice(STAT_ANCHOR.hp * STAT_RATIO_PER_10.hp ** steps),
      };
    }),
  ].map(e => {
    const R = rewardCash(e.band) * e.weight;
    const L = loadoutAt(gear, e.band);
    const m = enemyStatMult(gear, e);
    return {
      id: e.id, name: e.name, role: e.role,
      hp: e.hp,
      atk: Math.max(1, Math.round(m * L.atk)),
      def: Math.max(1, Math.round(m * L.def)),
      levelReq: e.levelReq,
      reward: {
        cash: [nice(R * 0.8), nice(R * 1.2)],
        clout: Math.max(1, Math.round(WC_RATIO * jobCpm(e.band) * e.weight)),
      },
    };
  });

  // Spots (DOM-74). rate = share of the gate's job $/h; price = payback days
  // of once-daily collects at the gate, where a day's collect is one full
  // offline bank (rate × the gate's cap hours).
  const spots = SPOT_CONTENT.map(s => {
    const rate = Math.max(1, Math.round(SPOT_RATE_SHARE * jobCashPerHour(s.gate)));
    const price = nice(SPOT_PAYBACK_DAYS * rate * spotCapHoursAt(s.gate));
    return {
      id: s.id, name: s.name,
      desc: `$${rate.toLocaleString('en-US')}/hr while you're away`,
      tier: gates.indexOf(s.gate) + 1,
      levelReq: s.gate,
      price,
      ratePerHour: rate,
    };
  });

  // Plug quests (DOM-90): completion bonus by rule — `hours` of best-job
  // income (cash) and best-job Clout at the gate. Steps pay through the
  // normal faucets while ground, so this bonus is the only new money.
  const quests = QUEST_CONTENT.map(q => {
    const reward = {
      cash: nice(q.hours * jobCashPerHour(q.gate)),
      clout: Math.max(1, Math.round(q.hours * jobCpm(q.gate) * MOVES_PER_HOUR)),
    };
    if (q.rewardItem) reward.item = q.rewardItem;
    return {
      id: q.id, plug: q.plug, name: q.name, desc: q.desc,
      levelReq: q.gate, hours: q.hours,
      steps: q.steps,
      reward,
    };
  }).sort((a, b) => a.levelReq - b.levelReq || a.id.localeCompare(b.id));

  return { jobsOut, enemies, gear, spots, quests };
}

function writeCatalogs(E, M, K) {
  const { jobsOut, enemies, gear, spots, quests } = buildCatalogs(E, M, K);
  // Quest steps and rewards must reference rows the same write produces —
  // a dangling id would strand a quest permanently incompletable in the client.
  for (const q of quests) {
    for (const s of q.steps) {
      const pool = s.type === 'job' ? jobsOut : s.type === 'fight' ? enemies : gear;
      const row = pool.find(r => r.id === s.id);
      if (!row) throw new Error('quest ' + q.id + ' step references unknown ' + s.type + ' "' + s.id + '"');
      if (row.levelReq > q.levelReq) {
        throw new Error('quest ' + q.id + ' (L' + q.levelReq + ') requires ' + s.id
          + ' gated at L' + row.levelReq + ' — uncompletable at its own gate');
      }
      if (s.type === 'item' && row.dropOnly) {
        throw new Error('quest ' + q.id + ' requires drop-only item "' + s.id
          + '" — a 0.99%-or-worse lottery is not a quest step');
      }
    }
    if (q.reward.item && !gear.find(g => g.id === q.reward.item)) {
      throw new Error('quest ' + q.id + ' rewards unknown item "' + q.reward.item + '"');
    }
  }
  // Rarity contract (DOM-18): every item authored into a tier; drop-only iff
  // it carries a premium; buyables keep a vendor; a dangling combination here
  // would strand an item unreachable or leak a drop tier into a store.
  for (const g of gear) {
    if (!(g.rarity in RARITY_PREMIUM)) throw new Error(g.id + ': unknown rarity "' + g.rarity + '"');
    if (!!g.dropOnly !== (RARITY_PREMIUM[g.rarity] > 0)) {
      throw new Error(g.id + ': dropOnly must hold exactly for blue/purple/orange');
    }
    if (g.rarity === 'mythic') throw new Error(g.id + ': mythic is reserved — no v1 items');
    if (!g.dropOnly && !g.plug) throw new Error(g.id + ': buyable item with no vendor');
    if (!SLOT_IDS.includes(g.slot)) throw new Error(g.id + ': unknown slot "' + g.slot + '"');
  }
  fs.writeFileSync(path.join(ROOT, 'data/jobs.json'), JSON.stringify(jobsOut, null, 2) + '\n');
  fs.writeFileSync(path.join(ROOT, 'data/enemies.json'), JSON.stringify(enemies, null, 2) + '\n');
  fs.writeFileSync(path.join(ROOT, 'data/gear.json'), JSON.stringify(gear, null, 2) + '\n');
  fs.writeFileSync(path.join(ROOT, 'data/properties.json'), JSON.stringify(spots, null, 2) + '\n');
  fs.writeFileSync(path.join(ROOT, 'data/quests.json'), JSON.stringify(quests, null, 2) + '\n');
}

function runSim() {
  execFileSync(process.execPath, ['tools/econ-sim/sim.js'], { cwd: ROOT, stdio: 'ignore' });
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/econ-sim/out/results.json'), 'utf8'));
}

// Binary search on a log scale for the smallest knob value where `pred`
// (monotone increasing in the knob) becomes true.
function solveMin(pred, lo, hi, iters = 22) {
  for (let i = 0; i < iters; i++) {
    const mid = Math.sqrt(lo * hi);
    if (pred(mid)) hi = mid; else lo = mid;
  }
  return hi;
}

function main() {
  let E = 1, M = 20, K = 200;

  // E — casual level `day1` at day 1; centre of the integer plateau.
  const d1 = e => { writeCatalogs(e, M, K); return runSim().levelByDay.casual.d1; };
  const t1 = TARGETS.levelByDay.day1;
  const eLo = solveMin(e => d1(e) >= t1, 0.05, 5);
  const eHi = solveMin(e => d1(e) >= t1 + 1, eLo, 25);
  E = Math.sqrt(eLo * eHi);

  // M — casual level `day30` at day 30; centre of the plateau.
  const d30 = m => { writeCatalogs(E, m, K); return runSim().levelByDay.casual.d30; };
  const t30 = TARGETS.levelByDay.day30;
  const mLo = solveMin(m => d30(m) >= t30, 0.001, 500);
  const mHi = solveMin(m => d30(m) >= t30 + 1, mLo, 2500);
  M = Math.sqrt(mLo * mHi);

  // K — committed days to the level cap.
  const capT = TARGETS.daysToMaxLevel;
  const cap = k => {
    writeCatalogs(E, M, k);
    const d = runSim().daysToCap[capT.profile];
    return d === null ? Infinity : d;
  };
  K = solveMin(k => cap(k) <= capT.days, 1e-3, 1e5);

  writeCatalogs(E, M, K);
  const r = runSim();

  // Committed Clout mix at the checkpoint levels, from the written catalogs.
  const { jobsOut, enemies, gear, spots, quests } = buildCatalogs(E, M, K);
  const mixAt = L => {
    const best = m => Math.max(...jobsOut.filter(j => j.levelReq <= L).map(m));
    const cpm = best(j => j.clout / j.moves);
    const bandEnemies = enemies.filter(e => e.levelReq <= L);
    const wc = bandEnemies.reduce((a, b) =>
      ((b.reward.cash[0] + b.reward.cash[1]) > (a.reward.cash[0] + a.reward.cash[1]) ? b : a)).reward.clout;
    const moves = MOVES_PER_DAY_C * cpm;
    const fights = FIGHTS_PER_DAY_C * wc * EV_SHARE;
    return { level: L, moves: moves / (moves + fights), fights: fights / (moves + fights) };
  };

  console.log('DOM-71/DOM-81 catalog generator — solved knobs');
  console.log(`  E (gates 1-7)    = ${E.toFixed(4)}`);
  console.log(`  M (gates 10-30)  = ${M.toFixed(4)}`);
  console.log(`  K (gates 40-110) = ${K.toFixed(4)}`);
  console.log(`  win-clout ratio  = ${WC_RATIO.toFixed(3)} × best job clout/move at band`);
  console.log('Pacing vs targets:');
  console.log(`  casual d1/d7/d30 = ${r.levelByDay.casual.d1}/${r.levelByDay.casual.d7}/${r.levelByDay.casual.d30}` +
    `  (targets ${TARGETS.levelByDay.day1}/${TARGETS.levelByDay.day7}/${TARGETS.levelByDay.day30})`);
  console.log(`  committed days to L120 = ${r.daysToCap.committed}  (target ${capT.days})`);
  console.log('Committed Clout mix (target 60:35 normalized → 63/37):');
  for (const L of [10, 50, 100]) {
    const m = mixAt(L);
    console.log(`  L${L}: moves ${(m.moves * 100).toFixed(0)}% / fights ${(m.fights * 100).toFixed(0)}%`);
  }
  // Gear pricing readback: hours of best-job income at each item's own gate.
  const bestCpmAt = L => Math.max(...jobsOut.filter(j => j.levelReq <= L)
    .map(j => (j.cash[0] + j.cash[1]) / 2 / j.moves));
  console.log('Gear price rule (hours of best-job income at the gate; starters authored; buyables only):');
  for (const g of [...new Set(gear.map(i => i.levelReq))]) {
    const rows = gear.filter(i => i.levelReq === g && !i.dropOnly).map(i =>
      `${i.id} $${i.price.toLocaleString()} (${(i.price / (bestCpmAt(g) * MOVES_PER_HOUR)).toFixed(1)}h)`);
    console.log(`  L${g}: ${rows.join(' · ')}`);
  }
  // Rarity readback (DOM-18): tier counts and the per-action drop pacing the
  // tuned knobs produce (proc gate × rarest-first ladder).
  const proc = T('drops.procChance'), odds = T('drops.rarityChance');
  const perAction = {};
  let miss = 1;
  for (const r of ['mythic', 'orange', 'purple', 'blue', 'green', 'grey']) {
    perAction[r] = proc * miss * odds[r];
    miss *= (1 - odds[r]);
  }
  console.log('Rarity (DOM-18): drop proc ' + (proc * 100).toFixed(0) + '%/action, ladder rarest-first:');
  for (const r of ['grey', 'green', 'blue', 'purple', 'orange', 'mythic']) {
    const n = gear.filter(i => i.rarity === r).length;
    const drop = gear.filter(i => i.rarity === r && i.dropOnly).length ? 'drop-only' : 'buyable';
    console.log('  ' + r + ': ' + n + ' items (' + drop + ') · '
      + (odds[r] * 100).toFixed(4) + '%/proc → ' + (perAction[r] ? '1 per '
      + Math.round(1 / perAction[r]).toLocaleString() + ' actions' : 'never (reserved)'));
  }
  console.log('Spot rule (rate = ' + SPOT_RATE_SHARE * 100 + '% of gate job $/h; price = '
    + SPOT_PAYBACK_DAYS + ' days of once-daily full-bank collects at the gate):');
  for (const s of spots) {
    const daily = s.ratePerHour * spotCapHoursAt(s.levelReq);
    console.log(`  L${s.levelReq}: ${s.id} $${s.ratePerHour.toLocaleString()}/h · cap `
      + `${spotCapHoursAt(s.levelReq).toFixed(1)}h · $${s.price.toLocaleString()} `
      + `(payback ${(s.price / daily).toFixed(1)}d)`);
  }
  console.log('Plug quests (DOM-90): bonus = hours of best-job income at the gate; steps pay through the normal faucets:');
  for (const q of quests) {
    console.log('  L' + q.levelReq + ': ' + q.id + ' — $' + q.reward.cash.toLocaleString()
      + ' + ' + q.reward.clout + ' Clout (' + q.hours + 'h)'
      + (q.reward.item ? ' + ' + q.reward.item : ''));
  }
  console.log('Enemy stats solved per band against the round model (DOM-72/75; multiplier × the '
    + 'band loadout, best item per type). Matchup check (p(win) at band):');
  console.log('  ' + [1, 10, 50, 110].map(b => {
    const e = enemies.filter(x => x.levelReq <= b).slice(-1)[0];
    const st = fmStats(loadoutAt(gear, b), { atk: e.atk, def: e.def, maxHp: e.hp },
                       FIGHT_CFG, 4000, fmSeededRng(0xBEEF + b));
    return 'L' + b + ' vs ' + e.id + ' (×' + (_enemyMult[e.id] || 0).toFixed(2) + '): '
      + (st.pWin * 100).toFixed(1) + '%';
  }).join(' · '));
  console.log('Wrote data/jobs.json (' + jobsOut.length + ' jobs), data/enemies.json ('
    + enemies.length + ' enemies), data/gear.json (' + gear.length + ' gear items), '
    + 'data/properties.json (' + spots.length + ' spots) and data/quests.json (' + quests.length + ' quests).');
}

main();
