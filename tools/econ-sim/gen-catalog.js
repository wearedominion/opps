#!/usr/bin/env node
// DOM-71 / DOM-81 — faucet catalog generator.
//
// Writes data/jobs.json and data/enemies.json from the ratified design
// (2026-09-11, Jake):
//   · static tier ladder, gates every 10 levels from L10 to L110 (DOM-71)
//   · Clout income mix 60:35:5 moves:fights:recruiting, grind-led; recruiting
//     is flavour, so moves+fights carry the whole target at 60:35 (DOM-81)
//   · payouts geometric in gate level at the progression curve's own ratio
//   · every win reward priced from the DOM-79 break-even anchor:
//     R = BE·(1−p)·L/p with BE = hoursOfJobIncome × job$/h at the band
//   · mastery (`times`) is cosmetic; drop tables live on tier-top jobs and
//     end where the gear catalog ends (DOM-73 extends them)
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
const { tune } = require(path.join(ROOT, 'js', 'tuning.js'));

const TUNING = readJSON('data/tuning.json');
const TARGETS = readJSON('tools/econ-sim/targets.json');
const PROGRESSION = readJSON('data/progression.json').levels;
const T = p => tune(p, TUNING);

// ── Model rates (mirrors sim.js definitions, same live sources) ──────────────
const p0 = TARGETS.assumptions.winProbabilityNominal;
const MOVES_PER_HOUR = 3600 / T('pools.moves.regenSeconds') * T('pools.moves.regenAmount');
const STAMINA_PER_HOUR = 3600 / T('pools.stamina.regenSeconds') * T('pools.stamina.regenAmount');
const HEALTH_PER_HOUR = 3600 / T('pools.health.regenSeconds') * T('pools.health.regenAmount');

const fightHealthCost =
  p0 * ((T('combat.winHealthLoss')[0] + T('combat.winHealthLoss')[1]) / 2)
  + (1 - p0) * (T('start.health') - T('combat.defeatHealthRemaining'));
const FIGHTS_PER_HOUR = Math.min(
  STAMINA_PER_HOUR / T('combat.staminaPerFight'),
  HEALTH_PER_HOUR / fightHealthCost);

const committed = TARGETS.playerProfiles.committed;
const MOVES_PER_DAY_C = MOVES_PER_HOUR * 24 * committed.movesUse;
const FIGHTS_PER_DAY_C = Math.min(
  STAMINA_PER_HOUR * 24 * committed.staminaUse / T('combat.staminaPerFight'),
  FIGHTS_PER_HOUR * 24 * committed.staminaUse);

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

const NEW_JOBS = [
  { id: 'traphouse',  name: 'Run a Trap House',        gate: 10,  moves: 6, times: 3, drops: [{ item: 'bando', rate: 0.03 }] },
  { id: 'fixfight',   name: 'Fix a Fight',             gate: 20,  moves: 6, times: 3, drops: [{ item: 'ak', rate: 0.025 }] },
  { id: 'hijack',     name: 'Hijack a Shipment',       gate: 30,  moves: 7, times: 3, drops: [] },
  { id: 'precinct',   name: 'Flip a Precinct',         gate: 40,  moves: 7, times: 2, drops: [] },
  { id: 'docks',      name: 'Run the Docks',           gate: 50,  moves: 7, times: 2, drops: [] },
  { id: 'club',       name: 'Own the Night Club',      gate: 60,  moves: 8, times: 2, drops: [] },
  { id: 'contract',   name: 'Rig the City Contract',   gate: 70,  moves: 8, times: 2, drops: [] },
  { id: 'interstate', name: 'Run Guns Interstate',     gate: 80,  moves: 8, times: 2, drops: [] },
  { id: 'judge',      name: 'Buy a Judge',             gate: 90,  moves: 8, times: 2, drops: [] },
  { id: 'commission', name: 'Take the Commission Seat', gate: 100, moves: 8, times: 2, drops: [] },
  { id: 'runcity',    name: 'Run the City',            gate: 110, moves: 8, times: 2, drops: [] },
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

// Enemy stats continue the existing power trend; they feed matchmaking
// (DOM-72), not the economy model.
const STAT_ANCHOR = { hp: 200, atk: 30, def: 15, gate: 5 };
const STAT_RATIO_PER_10 = { hp: 1.45, atk: 1.40, def: 1.40 };

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

  const enemies = [
    ...EARLY_ENEMIES.map(e => ({ ...e, band: e.levelReq })),
    ...NEW_ENEMIES.map(e => {
      const steps = (e.gate - STAT_ANCHOR.gate) / 10;
      return {
        ...e, band: e.gate, levelReq: e.gate, weight: 1.0,
        hp: nice(STAT_ANCHOR.hp * STAT_RATIO_PER_10.hp ** steps),
        atk: nice(STAT_ANCHOR.atk * STAT_RATIO_PER_10.atk ** steps),
        def: nice(STAT_ANCHOR.def * STAT_RATIO_PER_10.def ** steps),
      };
    }),
  ].map(e => {
    const R = rewardCash(e.band) * e.weight;
    return {
      id: e.id, name: e.name, role: e.role,
      hp: e.hp, atk: e.atk, def: e.def,
      levelReq: e.levelReq,
      reward: {
        cash: [nice(R * 0.8), nice(R * 1.2)],
        clout: Math.max(1, Math.round(WC_RATIO * jobCpm(e.band) * e.weight)),
      },
    };
  });

  return { jobsOut, enemies };
}

function writeCatalogs(E, M, K) {
  const { jobsOut, enemies } = buildCatalogs(E, M, K);
  fs.writeFileSync(path.join(ROOT, 'data/jobs.json'), JSON.stringify(jobsOut, null, 2) + '\n');
  fs.writeFileSync(path.join(ROOT, 'data/enemies.json'), JSON.stringify(enemies, null, 2) + '\n');
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
  const { jobsOut, enemies } = buildCatalogs(E, M, K);
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
  console.log('Wrote data/jobs.json (' + jobsOut.length + ' jobs) and data/enemies.json (' + enemies.length + ' enemies).');
}

main();
