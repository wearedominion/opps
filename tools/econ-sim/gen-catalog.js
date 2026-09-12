#!/usr/bin/env node
// DOM-71 / DOM-81 / DOM-73 — faucet + sink catalog generator.
//
// Writes data/jobs.json, data/enemies.json and data/store.json from the
// ratified design (2026-09-11, Jake):
//   · static tier ladder, gates every 10 levels from L10 to L110 (DOM-71)
//   · Clout income mix 60:35:5 moves:fights:recruiting, grind-led; recruiting
//     is flavour, so moves+fights carry the whole target at 60:35 (DOM-81)
//   · payouts geometric in gate level at the progression curve's own ratio
//   · every win reward priced from the DOM-79 break-even anchor:
//     R = BE·(1−p)·L/p with BE = hoursOfJobIncome × job$/h at the band
//   · mastery (`times`) is cosmetic; drop tables live on tier-top jobs and
//     run the full ladder now that the gear catalog does (DOM-73)
//   · gear (DOM-73, 2026-09-11): per-Plug inventory as data, own-once
//     additive stats, prices = hours of best-job income at the gating level
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
const EARLY_JOBS = [
  { id: 'lookout',  name: 'Be a Lookout',    moves: 1, levelReq: 1, times: 10, cash: [20, 40],    shape: 10.0, drops: [] },
  { id: 'runner',   name: 'Run Packages',    moves: 2, levelReq: 1, times: 8,  cash: [50, 90],    shape: 10.0, drops: [] },
  { id: 'boost',    name: 'Boost a Whip',    moves: 3, levelReq: 2, times: 6,  cash: [100, 180],  shape: 10.5, drops: [{ item: 'knife', rate: 0.05 }] },
  { id: 'stash',    name: 'Guard the Stash', moves: 2, levelReq: 2, times: 8,  cash: [80, 130],   shape: 11.0, drops: [] },
  { id: 'shake',    name: 'Shake a Block',   moves: 3, levelReq: 3, times: 5,  cash: [150, 250],  shape: 11.5, drops: [] },
  { id: 'hit',      name: 'Pull a Lick',     moves: 4, levelReq: 3, times: 4,  cash: [200, 400],  shape: 12.0, drops: [{ item: 'burner', rate: 0.04 }] },
  { id: 'move',     name: 'Move Weight',     moves: 5, levelReq: 5, times: 3,  cash: [400, 700],  shape: 13.0, drops: [{ item: 'vest', rate: 0.04 }] },
  { id: 'takeover', name: 'Block Takeover',  moves: 6, levelReq: 7, times: 2,  cash: [600, 1000], shape: 14.0, drops: [{ item: 'glock', rate: 0.03 }] },
];

// Each gate's tier-top job drops that gate's weapon at a low rate (the free
// lottery beside the purchase path — own-once, so the EV vanishes on hit).
const NEW_JOBS = [
  { id: 'traphouse',  name: 'Run a Trap House',        gate: 10,  moves: 6, times: 3, drops: [{ item: 'bando', rate: 0.03 }, { item: 'mac11', rate: 0.025 }] },
  { id: 'fixfight',   name: 'Fix a Fight',             gate: 20,  moves: 6, times: 3, drops: [{ item: 'ak', rate: 0.025 }] },
  { id: 'hijack',     name: 'Hijack a Shipment',       gate: 30,  moves: 7, times: 3, drops: [{ item: 'pump', rate: 0.025 }] },
  { id: 'precinct',   name: 'Flip a Precinct',         gate: 40,  moves: 7, times: 2, drops: [{ item: 'switchie', rate: 0.025 }] },
  { id: 'docks',      name: 'Run the Docks',           gate: 50,  moves: 7, times: 2, drops: [{ item: 'drummy', rate: 0.025 }] },
  { id: 'club',       name: 'Own the Night Club',      gate: 60,  moves: 8, times: 2, drops: [{ item: 'carbine', rate: 0.025 }] },
  { id: 'contract',   name: 'Rig the City Contract',   gate: 70,  moves: 8, times: 2, drops: [{ item: 'sniper', rate: 0.025 }] },
  { id: 'interstate', name: 'Run Guns Interstate',     gate: 80,  moves: 8, times: 2, drops: [{ item: 'beltfed', rate: 0.025 }] },
  { id: 'judge',      name: 'Buy a Judge',             gate: 90,  moves: 8, times: 2, drops: [{ item: 'fiftycal', rate: 0.025 }] },
  { id: 'commission', name: 'Take the Commission Seat', gate: 100, moves: 8, times: 2, drops: [{ item: 'minigun', rate: 0.025 }] },
  { id: 'runcity',    name: 'Run the City',            gate: 110, moves: 8, times: 2, drops: [{ item: 'arsenal', rate: 0.025 }] },
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
const STAT_RATIO_PER_10 = { hp: 1.45 };

const FIGHT_CFG = {
  roundDamageShare: T('combat.roundDamageShare'),
  damageSpread: T('combat.damageSpread'),
  firstStrikeEdge: T('combat.firstStrikeEdge'),
  baseHp: T('start.health'),
};

// Expected loadout at a band: starting stats plus every generated item at or
// below the gate, at upgrade level 0 — the conservative kit-owner baseline.
function loadoutAt(gear, band) {
  const owned = gear.filter(i => i.levelReq <= band);
  return {
    atk: T('start.attack') + owned.reduce((s, i) => s + i.atk, 0),
    def: T('start.defense') + owned.reduce((s, i) => s + i.def, 0),
    hp: T('start.health'),
  };
}

// Solve the enemy-stat multiplier m so pWin(loadout vs m×loadout) ≈ p0.
// Deterministic (seeded rng) so regenerated catalogs are reproducible; solved
// once — the ratios are band-invariant and gear is knob-independent.
let _enemyStatMult = null;
function enemyStatMult(gear) {
  if (_enemyStatMult !== null) return _enemyStatMult;
  const L = loadoutAt(gear, 50);
  const pWinAt = m => fmStats(L,
    { atk: m * L.atk, def: m * L.def, maxHp: 1000 },
    FIGHT_CFG, 4000, fmSeededRng(0xD0A472)).pWin;
  let lo = 0.5, hi = 3;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (pWinAt(mid) > p0) lo = mid; else hi = mid;
  }
  _enemyStatMult = (lo + hi) / 2;
  return _enemyStatMult;
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
const GEAR_CONTENT = [
  // legacy six — ids are load-bearing (saves, drop tables)
  { id: 'knife',    name: 'Switchblade',      type: 'weapon',  gate: 1,   price: 200, stats: { atk: 5 } },
  { id: 'burner',   name: 'Burner Phone',     type: 'utility', gate: 2,   price: 600, stats: { atk: 5, def: 5 } },
  { id: 'vest',     name: 'Bulletproof Vest', type: 'armor',   gate: 3,   price: 500, stats: { def: 10 } },
  { id: 'glock',    name: 'Glock 19',         type: 'weapon',  gate: 5,   stats: { atk: 15 } },
  { id: 'bando',    name: 'Safe House',       type: 'utility', gate: 7,   stats: { def: 20, hp: 10 } },
  { id: 'ak',       name: 'Draco',            type: 'weapon',  gate: 20 },
  // the ladder
  { id: 'mac11',    name: 'MAC-11',           type: 'weapon',  gate: 10 },
  { id: 'stabvest', name: 'Stab Vest',        type: 'armor',   gate: 10 },
  { id: 'dirtbike', name: 'Dirt Bike',        type: 'vehicle', gate: 10 },
  { id: 'kevlar',   name: 'Kevlar Hoodie',    type: 'armor',   gate: 20 },
  { id: 'boxchevy', name: 'Box Chevy',        type: 'vehicle', gate: 20 },
  { id: 'pump',     name: 'Pump Shotty',      type: 'weapon',  gate: 30 },
  { id: 'plates',   name: 'Steel Plates',     type: 'armor',   gate: 30 },
  { id: 'coupe',    name: 'Foreign Coupe',    type: 'vehicle', gate: 30 },
  { id: 'switchie', name: 'Switchie',         type: 'weapon',  gate: 40 },
  { id: 'ballistic', name: 'Ballistic Shield', type: 'armor',  gate: 40 },
  { id: 'blacksuv', name: 'Blacked-Out SUV',  type: 'vehicle', gate: 40 },
  { id: 'drummy',   name: 'Drummy',           type: 'weapon',  gate: 50 },
  { id: 'dragonskin', name: 'Dragon Skin',    type: 'armor',   gate: 50 },
  { id: 'armsedan', name: 'Armored Sedan',    type: 'vehicle', gate: 50 },
  { id: 'carbine',  name: 'Chopped Carbine',  type: 'weapon',  gate: 60 },
  { id: 'fullkev',  name: 'Full Kevlar Suit', type: 'armor',   gate: 60 },
  { id: 'sprinter', name: 'Stash Sprinter',   type: 'vehicle', gate: 60 },
  { id: 'sniper',   name: 'Rooftop Rifle',    type: 'weapon',  gate: 70 },
  { id: 'fedvest',  name: 'Fed-Grade Vest',   type: 'armor',   gate: 70 },
  { id: 'lowkey',   name: 'Low-Key Limo',     type: 'vehicle', gate: 70 },
  { id: 'beltfed',  name: 'Belt-Fed',         type: 'weapon',  gate: 80 },
  { id: 'bunker',   name: 'Bunker Gear',      type: 'armor',   gate: 80 },
  { id: 'gunboat',  name: 'Harbor Gunboat',   type: 'vehicle', gate: 80 },
  { id: 'fiftycal', name: 'Fifty Cal',        type: 'weapon',  gate: 90 },
  { id: 'titanium', name: 'Titanium Weave',   type: 'armor',   gate: 90 },
  { id: 'helo',     name: 'Private Helo',     type: 'vehicle', gate: 90 },
  { id: 'minigun',  name: 'Minigun',          type: 'weapon',  gate: 100 },
  { id: 'exorig',   name: 'Exo Rig',          type: 'armor',   gate: 100 },
  { id: 'jet',      name: 'Private Jet',      type: 'vehicle', gate: 100 },
  { id: 'arsenal',  name: 'The Arsenal',      type: 'weapon',  gate: 110, plug: 'plug-dex' },
  { id: 'fortress', name: 'Mobile Fortress',  type: 'armor',   gate: 110, plug: 'plug-dex' },
  { id: 'yacht',    name: 'Armored Yacht',    type: 'vehicle', gate: 110, plug: 'plug-dex' },
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
      drops: j.drops,
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
    const s = item.stats ?? GEAR_STATS_BY_TYPE[item.type](item.gate);
    const atk = Math.round(s.atk || 0), def = Math.round(s.def || 0), hp = Math.round(s.hp || 0);
    const price = item.price ?? nice(GEAR_HOURS_BY_TYPE[item.type] * jobCashPerHour(item.gate));
    const desc = [atk && `+${atk} ATK`, def && `+${def} DEF`, hp && `+${hp} HP`]
      .filter(Boolean).join(' ');
    return {
      id: item.id, name: item.name, desc,
      type: item.type,
      tier: gates.indexOf(item.gate) + 1,
      levelReq: item.gate,
      plug: item.plug ?? PLUG_BY_TYPE[item.type],
      price, atk, def, hp,
      upgradeable: true,
    };
  }).sort((a, b) => a.levelReq - b.levelReq || a.id.localeCompare(b.id));

  // Enemies. Rewards priced from the band's job income (DOM-79/71/81);
  // ATK/DEF solved so the band matchup sits at p0 against the expected
  // loadout (DOM-72); HP keeps the legacy display trend.
  const m = enemyStatMult(gear);
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

  return { jobsOut, enemies, gear, spots };
}

function writeCatalogs(E, M, K) {
  const { jobsOut, enemies, gear, spots } = buildCatalogs(E, M, K);
  fs.writeFileSync(path.join(ROOT, 'data/jobs.json'), JSON.stringify(jobsOut, null, 2) + '\n');
  fs.writeFileSync(path.join(ROOT, 'data/enemies.json'), JSON.stringify(enemies, null, 2) + '\n');
  fs.writeFileSync(path.join(ROOT, 'data/store.json'), JSON.stringify(gear, null, 2) + '\n');
  fs.writeFileSync(path.join(ROOT, 'data/properties.json'), JSON.stringify(spots, null, 2) + '\n');
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
  const { jobsOut, enemies, gear, spots } = buildCatalogs(E, M, K);
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
  console.log('Gear price rule (hours of best-job income at the gate; starters authored):');
  for (const g of [...new Set(gear.map(i => i.levelReq))]) {
    const rows = gear.filter(i => i.levelReq === g).map(i =>
      `${i.id} $${i.price.toLocaleString()} (${(i.price / (bestCpmAt(g) * MOVES_PER_HOUR)).toFixed(1)}h)`);
    console.log(`  L${g}: ${rows.join(' · ')}`);
  }
  console.log('Spot rule (rate = ' + SPOT_RATE_SHARE * 100 + '% of gate job $/h; price = '
    + SPOT_PAYBACK_DAYS + ' days of once-daily full-bank collects at the gate):');
  for (const s of spots) {
    const daily = s.ratePerHour * spotCapHoursAt(s.levelReq);
    console.log(`  L${s.levelReq}: ${s.id} $${s.ratePerHour.toLocaleString()}/h · cap `
      + `${spotCapHoursAt(s.levelReq).toFixed(1)}h · $${s.price.toLocaleString()} `
      + `(payback ${(s.price / daily).toFixed(1)}d)`);
  }
  console.log('Enemy stats solved against the round model (DOM-72): multiplier ×'
    + enemyStatMult(gear).toFixed(3) + ' of the band loadout. Matchup check (p(win) at band):');
  console.log('  ' + [1, 10, 50, 110].map(b => {
    const e = enemies.filter(x => x.levelReq <= b).slice(-1)[0];
    const st = fmStats(loadoutAt(gear, b), { atk: e.atk, def: e.def, maxHp: e.hp },
                       FIGHT_CFG, 4000, fmSeededRng(0xBEEF + b));
    return 'L' + b + ' vs ' + e.id + ': ' + (st.pWin * 100).toFixed(1) + '%';
  }).join(' · '));
  console.log('Wrote data/jobs.json (' + jobsOut.length + ' jobs), data/enemies.json ('
    + enemies.length + ' enemies), data/store.json (' + gear.length + ' gear items) and '
    + 'data/properties.json (' + spots.length + ' spots).');
}

main();
