#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
//  DOM-67 — Economy simulator & pacing targets
//
//  A model, not production code. Answers, numerically:
//    A. Cash/hour and Clout/hour per activity per level band
//    B. Time-to-level across all 120 levels, per player profile
//    C. Gear affordability at each price point
//    D. The four questions from the systems review (see §Q1–Q4 below)
//
//  Every game constant is read from data/*.json through the game's own
//  js/tuning.js — there is no second copy to drift. Pacing targets and
//  modelling assumptions live in targets.json and are labelled as such.
//
//  Run:  node tools/econ-sim/sim.js            (report to stdout + out/*.json|csv)
//        node tools/econ-sim/sim.js --html     (also render out/report.html, the
//                                               publish-ready dashboard, from
//                                               template.html — same run, same data)
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const fs = require('fs');
const path = require('path');
const { tune, evalCurve } = require('../../js/tuning.js');

const ROOT = path.join(__dirname, '..', '..');
const readJSON = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));

const TUNING      = readJSON('data/tuning.json');
const PROGRESSION = readJSON('data/progression.json').levels;
const JOBS        = readJSON('data/jobs.json');
const ENEMIES     = readJSON('data/enemies.json');
const STORE       = readJSON('data/store.json');
const PROPERTIES  = readJSON('data/properties.json');
const UNLOCKS     = readJSON('data/unlocks.json');
const TARGETS     = readJSON('tools/econ-sim/targets.json');

const T = p => tune(p, TUNING);

// ── Derived game constants ───────────────────────────────────────────────────
const MOVES_PER_HOUR   = 3600 / T('pools.moves.regenSeconds')   * T('pools.moves.regenAmount');
const STAMINA_PER_HOUR = 3600 / T('pools.stamina.regenSeconds') * T('pools.stamina.regenAmount');
const HEALTH_PER_HOUR  = 3600 / T('pools.health.regenSeconds')  * T('pools.health.regenAmount');
const DEFEAT_LOSS_RATE = T('loot.defeatLossRate');
const DEFEAT_CLOUT_SHARE = T('combat.defeatCloutShare');
const MAX_LEVEL = T('progression.maxLevel');

const mean = ([a, b]) => (a + b) / 2;

// Cumulative Clout required to REACH level L (1-indexed; level 1 = 0).
const cumClout = [0, 0];
for (let l = 2; l <= MAX_LEVEL; l++) {
  cumClout[l] = cumClout[l - 1] + PROGRESSION[l - 2].cloutToNext;
}

function levelForClout(c) {
  let l = 1;
  while (l < MAX_LEVEL && c >= cumClout[l + 1]) l++;
  return l;
}

// ── Activity models ──────────────────────────────────────────────────────────

// Best unlocked job by a metric, at level L.
function bestJob(level, metric) {
  const open = JOBS.filter(j => j.levelReq <= level);
  return open.reduce((a, b) => (metric(b) > metric(a) ? b : a), open[0]);
}
const cloutPerMove = j => j.clout / j.moves;
const cashPerMove  = j => mean(j.cash) / j.moves;

// Best unlocked enemy by mean cash reward, at level L.
// NOTE: the catalog tops out at levelReq 5 — rewards flatline from there (finding F2).
function bestEnemy(level) {
  const open = ENEMIES.filter(e => e.levelReq <= level);
  return open.reduce((a, b) => (mean(b.reward.cash) > mean(a.reward.cash) ? b : a), open[0]);
}

// Fight EV at win probability p against enemy e, holding balance B.
// Snapshot combat (08-economy-schema.md §4.2): win mints an absolute roll,
// loss destroys a proportion of your own Cash.
function fightCashEV(e, p, balance) {
  return p * mean(e.reward.cash) - (1 - p) * DEFEAT_LOSS_RATE * balance;
}
function fightCloutEV(e, p) {
  return p * e.reward.clout
       + (1 - p) * Math.floor(e.reward.clout * DEFEAT_CLOUT_SHARE);
}
// The balance at which fighting stops minting and starts destroying.
function breakEven(e, p) {
  return (p * mean(e.reward.cash)) / ((1 - p) * DEFEAT_LOSS_RATE);
}

// Expected Health cost per fight: winners take winHealthLoss, losers drop to
// defeatHealthRemaining. Health regen then bounds sustainable fight rate.
function fightHealthCost(p, maxHealth) {
  const winDmg = mean(T('combat.winHealthLoss'));
  const lossDmg = maxHealth - T('combat.defeatHealthRemaining');
  return p * winDmg + (1 - p) * lossDmg;
}
// Fights/hour a player can sustain: limited by stamina regen AND health regen.
function sustainableFightsPerHour(p, maxHealth) {
  const byStamina = STAMINA_PER_HOUR / T('combat.staminaPerFight');
  const byHealth  = HEALTH_PER_HOUR / fightHealthCost(p, maxHealth);
  return { byStamina, byHealth, effective: Math.min(byStamina, byHealth) };
}

// Spot income per collect, owning one of everything affordable is modelled
// elsewhere; here: one of each catalog entry.
const SPOT_INCOME_ALL = PROPERTIES.reduce((s, pr) => s + pr.income, 0);
const SPOT_COST_ALL   = PROPERTIES.reduce((s, pr) => s + pr.price, 0);
const GEAR_COST_ALL   = STORE.reduce((s, i) => s + i.price, 0);

// ── A. Cash/hour & Clout/hour per activity per level band ────────────────────
const BANDS = [1, 2, 3, 5, 7, 10, 15, 20, 30, 50, 80, 120];
const p0 = TARGETS.assumptions.winProbabilityNominal;

function ratesAtLevel(L, balance) {
  const jc = bestJob(L, cloutPerMove);
  const jm = bestJob(L, cashPerMove);
  const e  = bestEnemy(L);
  const fights = sustainableFightsPerHour(p0, T('start.health')); // base pool
  return {
    level: L,
    jobCashPerHour:  cashPerMove(jm) * MOVES_PER_HOUR,
    jobCloutPerHour: cloutPerMove(jc) * MOVES_PER_HOUR,
    bestJobId: jm.id,
    fightCashPerHourAtBE0:  fightCashEV(e, p0, 0) * fights.effective,       // fresh wallet
    fightCashPerHourAtBal:  fightCashEV(e, p0, balance) * fights.effective, // typical wallet
    fightCloutPerHour: fightCloutEV(e, p0) * fights.effective,
    bestEnemyId: e.id,
    fightsPerHour: fights.effective,
    fightRateLimiter: fights.byHealth < fights.byStamina ? 'health' : 'stamina',
    spotCashPerDayIntended: SPOT_INCOME_ALL * TARGETS.assumptions.spotCollectsPerDay,
    breakEven: breakEven(e, p0),
  };
}

// ── B. Time-to-level, day-by-day integration per profile ─────────────────────
// Clout/day at level L for a profile: moves regen share into the best Clout job,
// stamina regen share into fights (health-capped), plus level-up is free.
function simulateProgression(profile, horizonDays) {
  const movesPerDay   = MOVES_PER_HOUR * 24 * profile.movesUse;
  const staminaPerDay = STAMINA_PER_HOUR * 24 * profile.staminaUse;
  let clout = 0;
  const levelAtDay = [levelForClout(0)];
  const daysToLevel = new Array(MAX_LEVEL + 1).fill(null);
  daysToLevel[1] = 0;
  for (let day = 1; day <= horizonDays; day++) {
    const L = levelForClout(clout);
    const jc = bestJob(L, cloutPerMove);
    const e  = bestEnemy(L);
    const fr = sustainableFightsPerHour(p0, T('start.health'));
    const fightsPerDay = Math.min(staminaPerDay, fr.byHealth * 24 * profile.staminaUse);
    clout += movesPerDay * cloutPerMove(jc) + fightsPerDay * fightCloutEV(e, p0);
    const newL = levelForClout(clout);
    levelAtDay[day] = newL;
    for (let l = L + 1; l <= newL; l++) if (daysToLevel[l] === null) daysToLevel[l] = day;
  }
  return { levelAtDay, daysToLevel };
}

// ── C. Gear affordability ────────────────────────────────────────────────────
function gearAffordability(L) {
  const r = ratesAtLevel(L, 0);
  const cashPerHour = r.jobCashPerHour; // jobs only: the guaranteed income
  return STORE.map(i => ({
    id: i.id, price: i.price,
    hoursOfJobs: i.price / cashPerHour,
  }));
}

// ── D. The four questions ────────────────────────────────────────────────────

// Q1 — Can paid Stamina out-earn its price?
function q1() {
  const e = bestEnemy(MAX_LEVEL);
  const perFightFreshWallet = fightCashEV(e, 0.70, 0); // band ceiling, empty wallet
  const basePool = T('start.stamina');
  const cap = T('pools.stamina.maxCap');
  return {
    bestEnemy: e.id, meanReward: mean(e.reward.cash),
    perFightMax: perFightFreshWallet,
    cashPerRefreshBasePool: perFightFreshWallet * basePool,
    cashPerRefreshCapPool: perFightFreshWallet * cap,
    jobsHoursEquivalentCapPool: (perFightFreshWallet * cap) / ratesAtLevel(MAX_LEVEL, 0).jobCashPerHour,
    note: 'A refresh grants max-pool fights. Cash/refresh scales with stamina max ('
        + basePool + ' base, ' + cap + ' cap via skills).',
  };
}

// Q2 — How fast does Cash inflate with no recurring sink?
// Maxed player: all gear and spots owned, fights at break-even (net 0).
function q2() {
  const committed = TARGETS.playerProfiles.committed;
  const r = ratesAtLevel(MAX_LEVEL, 0);
  const jobsPerDay = r.jobCashPerHour * 24 * committed.movesUse;
  const spotsPerDay = r.spotCashPerDayIntended;
  const perWeek = (jobsPerDay + spotsPerDay) * 7;
  return {
    jobsCashPerDay: jobsPerDay,
    spotsCashPerDay: spotsPerDay,
    cashPerWeek: perWeek,
    oneTimeSinkTotal: GEAR_COST_ALL + SPOT_COST_ALL,
    weeksToOutgrowAllSinks: (GEAR_COST_ALL + SPOT_COST_ALL) / perWeek,
  };
}

// Q3 — Do bots mint more than players destroy?
// Every fight is vs a snapshot: wins mint, losses destroy 10% of the winner's
// own wallet. Net mint per fight = p·R − (1−p)·L·B — positive below break-even.
function q3() {
  const e = bestEnemy(10);
  const rows = [0.35, 0.5, 0.7].map(p => ({
    p,
    breakEven: breakEven(e, p),
    netMintPerFightAt1k: fightCashEV(e, p, 1000),
    netMintPerFightAt10k: fightCashEV(e, p, 10000),
    netMintPerFightAt50k: fightCashEV(e, p, 50000),
  }));
  return { enemy: e.id, meanReward: mean(e.reward.cash), rows };
}

// Q4 — Does a new player who loses everything recover?
// Worst realistic run: burn the whole starting Stamina pool on losses.
function q4() {
  const startCash = T('start.cash');
  const pool = T('start.stamina');
  const afterLosses = startCash * Math.pow(1 - DEFEAT_LOSS_RATE, pool);
  const lost = startCash - afterLosses;
  const j = bestJob(1, cashPerMove);
  const movesAvailable = T('start.moves');
  const cashFromStartingMoves = movesAvailable * cashPerMove(j);
  const shortfall = Math.max(0, lost - cashFromStartingMoves);
  const minutesRegen = shortfall > 0
    ? (shortfall / cashPerMove(j)) * T('pools.moves.regenSeconds') / 60 : 0;
  // Health lockout: defeat leaves defeatHealthRemaining; fighting needs 20 HP
  // (prototype gate in combat.js), healed by regen alone.
  const hpFloor = T('combat.defeatHealthRemaining');
  const minutesToFight = (20 - hpFloor) / T('pools.health.regenAmount')
                       * T('pools.health.regenSeconds') / 60;
  return {
    startCash, lossesModelled: pool, cashAfterLosses: afterLosses, cashLost: lost,
    bestJobId: j.id, cashFromStartingMoves, shortfall, minutesOfRegenToRecover: minutesRegen,
    minutesUntilFightingAgain: minutesToFight,
  };
}

// Bonus finding — the launder faucet, quantified.
function launder() {
  const rate = T('hoodActions.launderRate');
  const cost = T('hoodActions.launderMovesCost');
  const laundersPerDayCommitted =
    MOVES_PER_HOUR * 24 * TARGETS.playerProfiles.committed.movesUse / cost;
  return {
    rate, movesCost: cost,
    laundersPerDayCommitted,
    dailyMultiplier: Math.pow(1 + rate, laundersPerDayCommitted),
  };
}

// Spots exploit ceiling as built (prototype: full income per tap, min 60s).
function spotsExploit() {
  const perHour = 3600 / T('spots.collectMinimumSeconds') * SPOT_INCOME_ALL;
  return { perCollect: SPOT_INCOME_ALL, perHourCeiling: perHour };
}

// ── Report ───────────────────────────────────────────────────────────────────
const fmt = n => n >= 100 ? Math.round(n).toLocaleString('en-US')
                          : (Math.round(n * 10) / 10).toLocaleString('en-US');

function pad(s, w) { s = String(s); return s.length >= w ? s : s + ' '.repeat(w - s.length); }
function rpad(s, w) { s = String(s); return s.length >= w ? s : ' '.repeat(w - s.length) + s; }

function table(headers, rows, widths) {
  const out = [];
  out.push(headers.map((h, i) => pad(h, widths[i])).join('  '));
  out.push(widths.map(w => '─'.repeat(w)).join('──'));
  rows.forEach(r => out.push(r.map((c, i) => (typeof c === 'number' ? rpad(fmt(c), widths[i]) : pad(c, widths[i]))).join('  ')));
  return out.join('\n');
}

function run() {
  const L = [];
  const say = s => L.push(s);

  say('════════════════════════════════════════════════════════════════════');
  say(' DOM-67 — OPPS economy simulator');
  say(' constants: data/tuning.json v' + TUNING.version
    + ' · curve eval: js/tuning.js · targets: tools/econ-sim/targets.json');
  say('════════════════════════════════════════════════════════════════════');

  say('\n■ A. Rates per activity per level band (win p = ' + p0 + ', base pools)');
  say('  Fights: cash EV shown at empty wallet — see break-even column for where');
  say('  fighting turns Cash-negative. Fight rate is HEALTH-limited, not stamina.');
  const bandRows = BANDS.map(l => {
    const r = ratesAtLevel(l, 0);
    return [l, r.bestJobId, r.jobCashPerHour, r.jobCloutPerHour, r.bestEnemyId,
            r.fightCashPerHourAtBE0, r.fightCloutPerHour, r.fightsPerHour, r.breakEven];
  });
  say(table(
    ['lvl', 'job', 'job $/h', 'job C/h', 'enemy', 'fight $/h', 'fight C/h', 'f/h', 'break-even $'],
    bandRows, [4, 9, 8, 8, 8, 10, 10, 5, 12]));

  say('\n■ B. Time-to-level (day-by-day, best Clout strategy per profile)');
  const horizon = 3650;
  const profiles = Object.entries(TARGETS.playerProfiles)
    .filter(([k]) => k !== '_comment');
  const sims = profiles.map(([name, prof]) => [name, simulateProgression(prof, horizon)]);
  say('\n  Level at day 1 / 7 / 30 (targets: '
    + TARGETS.levelByDay.day1 + ' / ' + TARGETS.levelByDay.day7 + ' / ' + TARGETS.levelByDay.day30 + '):');
  sims.forEach(([name, s]) => {
    say('    ' + pad(name, 10) + '  L' + s.levelAtDay[1] + ' / L' + s.levelAtDay[7] + ' / L' + s.levelAtDay[30]);
  });
  say('\n  Days to reach level (committed profile):');
  const committedSim = sims.find(([n]) => n === 'committed')[1];
  const marks = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 119, 120];
  say('    ' + marks.map(l => 'L' + l + ':' + (committedSim.daysToLevel[l] === null ? '>' + horizon : committedSim.daysToLevel[l])).join('  '));

  say('\n  Full 120-level curve written to tools/econ-sim/out/time-to-level.csv');

  say('\n■ C. Gear affordability (hours of best-job income to afford, no gates exist yet)');
  [1, 3, 5, 7].forEach(l => {
    const rows = gearAffordability(l).map(g => g.id + ' ' + fmt(g.hoursOfJobs) + 'h');
    say('    L' + l + ': ' + rows.join(' · '));
  });

  say('\n■ Q1. Can paid Stamina out-earn its price?  YES — and it scales with the pool.');
  const a1 = q1();
  say('    Best fight EV (p=0.70 band ceiling, empty wallet): $' + fmt(a1.perFightMax) + '/fight vs ' + a1.bestEnemy);
  say('    Cash per $0.99 refresh: $' + fmt(a1.cashPerRefreshBasePool) + ' (base pool of ' + T('start.stamina') + ')'
    + '  →  $' + fmt(a1.cashPerRefreshCapPool) + ' (skill-built pool of ' + T('pools.stamina.maxCap') + ')');
  say('    The cap-pool refresh equals ' + fmt(a1.jobsHoursEquivalentCapPool) + ' hours of top-job grinding.');

  say('\n■ Q2. Cash inflation with no recurring sink (maxed committed player):');
  const a2 = q2();
  say('    Jobs $' + fmt(a2.jobsCashPerDay) + '/day + Spots $' + fmt(a2.spotsCashPerDay) + '/day'
    + '  →  $' + fmt(a2.cashPerWeek) + '/week with nothing to buy.');
  say('    Entire one-time sink catalog (all gear + all spots) = $' + fmt(a2.oneTimeSinkTotal)
    + ' — outgrown in ' + fmt(a2.weeksToOutgrowAllSinks * 7) + ' days.');

  say('\n■ Q3. Do bots mint more than players destroy?  YES below break-even.');
  const a3 = q3();
  say('    vs ' + a3.enemy + ' (mean reward $' + fmt(a3.meanReward) + '):');
  say(table(['p(win)', 'break-even $', 'net/fight @$1k', '@$10k', '@$50k'],
    a3.rows.map(r => [String(r.p), r.breakEven, r.netMintPerFightAt1k, r.netMintPerFightAt10k, r.netMintPerFightAt50k]),
    [7, 12, 14, 10, 10]));
  say('    Every wallet below break-even mints on net; nothing self-limits it');
  say('    (the opponent is a snapshot and loses nothing).');

  say('\n■ Q4. Does a wiped new player recover?  YES — within one session.');
  const a4 = q4();
  say('    Lose all ' + a4.lossesModelled + ' starting fights: $' + fmt(a4.startCash) + ' → $' + fmt(a4.cashAfterLosses)
    + ' (−$' + fmt(a4.cashLost) + ').');
  say('    Starting Moves alone earn back ~$' + fmt(a4.cashFromStartingMoves)
    + ' (' + a4.bestJobId + '); shortfall $' + fmt(a4.shortfall)
    + (a4.shortfall > 0 ? ' ≈ ' + fmt(a4.minutesOfRegenToRecover) + ' min of Moves regen.' : ' — recovered before regen matters.'));
  say('    Health lockout after a defeat: ~' + fmt(a4.minutesUntilFightingAgain) + ' min to fight again.');
  say('    Proportional loss means Cash never reaches 0 — there is no wipe state.');

  say('\n■ F. Findings the model surfaces beyond the four questions');
  const lf = launder();
  say('  F1 LAUNDER: +' + (lf.rate * 100) + '% of balance per ' + lf.movesCost + ' Moves compounds to a ×'
    + lf.dailyMultiplier.toExponential(2) + ' DAILY multiplier ('
    + fmt(lf.laundersPerDayCommitted) + ' launders/day committed). Zero it before any other tuning matters.');
  const sx = spotsExploit();
  say('  F2 SPOTS AS BUILT: full income per tap, min 60s → $' + fmt(sx.perHourCeiling)
    + '/h ceiling owning one of each (vs top job $' + fmt(ratesAtLevel(7, 0).jobCashPerHour) + '/h).');
  say('     No accrual rate exists in tuning.json — DOM-74 must add one before Spots can be tuned.');
  const fr = sustainableFightsPerHour(p0, T('start.health'));
  say('  F3 FIGHT RATE: health regen caps fighting at ' + fmt(fr.byHealth) + '/h at p=' + p0
    + ' (stamina alone would allow ' + fmt(fr.byStamina) + '/h) — the Hospital/heal loop, not Stamina, paces combat.');
  say('  F4 CONTENT CEILING: job and enemy catalogs top out at levelReq 7 and 5.');
  say('     Every rate above is FLAT from level 7 to 120 — Clout/day never grows,');
  say('     while cloutToNext grows ×1.1/level. The curve is fine; the catalogs starve it (DOM-71).');
  const grinderDays = sims.find(([n]) => n === 'grinder')[1].daysToLevel[120];
  say('  F5 THE CAP IS UNREACHABLE: level 120 needs ' + fmt(cumClout[120])
    + ' Clout ≈ ' + (committedSim.daysToLevel[120] === null ? '>' + horizon : fmt(committedSim.daysToLevel[120]))
    + ' days committed / ' + (grinderDays === null ? '>' + horizon : fmt(grinderDays)) + ' days grinding non-stop.');

  // ── outputs ────────────────────────────────────────────────────────────────
  const outDir = path.join(__dirname, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const csv = ['level,cumClout,daysCasual,daysCommitted,daysGrinder'];
  const byName = Object.fromEntries(sims);
  for (let l = 1; l <= MAX_LEVEL; l++) {
    csv.push([l, cumClout[l],
      byName.casual.daysToLevel[l] ?? '', byName.committed.daysToLevel[l] ?? '',
      byName.grinder.daysToLevel[l] ?? ''].join(','));
  }
  fs.writeFileSync(path.join(outDir, 'time-to-level.csv'), csv.join('\n') + '\n');

  const json = {
    generated: new Date().toISOString(),
    tuningVersion: TUNING.version,
    horizonDays: horizon,
    bands: BANDS.map(l => ratesAtLevel(l, 0)),
    levelByDay: Object.fromEntries(sims.map(([n, s]) => [n, { d1: s.levelAtDay[1], d7: s.levelAtDay[7], d30: s.levelAtDay[30] }])),
    daysToCap: Object.fromEntries(sims.map(([n, s]) => [n, s.daysToLevel[MAX_LEVEL]])),
    ttl: Array.from({ length: MAX_LEVEL }, (_, i) => [i + 1,
      byName.casual.daysToLevel[i + 1], byName.committed.daysToLevel[i + 1], byName.grinder.daysToLevel[i + 1]]),
    fightRate: sustainableFightsPerHour(p0, T('start.health')),
    q1: q1(), q2: q2(), q3: q3(), q4: q4(),
    launder: launder(), spotsExploit: spotsExploit(),
    targets: TARGETS,
  };
  fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(json, null, 2) + '\n');

  say('\nWrote tools/econ-sim/out/results.json and time-to-level.csv');
  if (process.argv.includes('--html')) {
    buildHtml(json, outDir);
    say('Wrote tools/econ-sim/out/report.html — publish-ready dashboard');
  }
  console.log(L.join('\n'));
}

// ── HTML report ──────────────────────────────────────────────────────────────
// Renders template.html into out/report.html. Every number on the page comes
// from THIS run's results object, so charts and prose can never disagree.
function buildHtml(json, outDir) {
  const tpl = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8');

  const money  = n => '$' + Math.round(n).toLocaleString('en-US');
  const shortK = n => n >= 1000 ? (Math.round(n / 100) / 10).toLocaleString('en-US').replace(/\.0$/, '') + 'K'
                                : String(Math.round(n));
  const years  = d => d === null ? '>' + Math.round(json.horizonDays / 365) + ' years'
                                 : '~' + (d / 365).toFixed(1) + ' years';
  const signed = n => (n >= 0 ? '+' : '−') + money(Math.abs(n)).slice(1).replace(/^/, '$');

  const jobCeiling   = Math.max(...JOBS.map(j => j.levelReq));
  const enemyCeiling = Math.max(...ENEMIES.map(e => e.levelReq));
  const beNominal    = breakEven(bestEnemy(MAX_LEVEL), p0);
  const committedJobPerHour = ratesAtLevel(MAX_LEVEL, 0).jobCashPerHour;
  const t = json.targets;
  const lb = json.levelByDay.committed;

  const beRows = json.q3.rows.map(r => {
    const cells = [r.netMintPerFightAt1k, r.netMintPerFightAt10k, r.netMintPerFightAt50k]
      .map(v => `<td class="${v >= 0 ? 'pos' : 'neg'}">${v >= 0 ? '+' : '−'}${money(Math.abs(v))}</td>`).join('');
    const label = r.p === 0.35 ? ' (band floor)' : r.p === 0.7 ? ' (band ceiling)' : ' (nominal)';
    return `          <tr><td>${r.p.toFixed(2)}${label}</td><td class="money">${money(r.breakEven)}</td>${cells}</tr>`;
  }).join('\n');

  const chartBandLevels = [1, 2, 3, 5, 7, 20, 50, MAX_LEVEL];
  const chartBands = chartBandLevels.map(l => {
    const r = json.bands.find(b => b.level === l) || ratesAtLevel(l, 0);
    return { l, job: Math.round(r.jobCashPerHour), fight: Math.round(r.fightCashPerHourAtBE0) };
  });
  let flatFromIndex = null;
  for (let i = 0; i < chartBands.length; i++) {
    const rest = chartBands.slice(i);
    if (rest.every(b => b.job === rest[0].job && b.fight === rest[0].fight)) { flatFromIndex = i; break; }
  }
  if (flatFromIndex === chartBands.length - 1) flatFromIndex = null; // nothing flat to annotate

  const prof = k => Math.round(t.playerProfiles[k].movesUse * 100) + '% moves · '
                  + Math.round(t.playerProfiles[k].staminaUse * 100) + '% stamina';
  const fShare = t.faucetShareOfCashIncome;
  const liveJobs = json.q2.jobsCashPerDay, liveSpots = json.q2.spotsCashPerDay;
  const liveMovesShare = Math.round(liveJobs / (liveJobs + liveSpots) * 100);

  const paceFast = lb.d30 > t.levelByDay.day30;
  const capDays = json.daysToCap.committed;

  const tokens = {
    GENERATED_DATE: json.generated.slice(0, 10),
    TUNING_VERSION: String(json.tuningVersion),
    MAX_LEVEL: String(MAX_LEVEL),
    P_NOMINAL: String(p0),
    LOSS_RATE: Math.round(DEFEAT_LOSS_RATE * 100) + '%',
    BAND_MIN: String(T('matchmaking.winRateBandMin')),
    BAND_MAX: String(T('matchmaking.winRateBandMax')),
    SPOT_COLLECTS: String(t.assumptions.spotCollectsPerDay),
    JOB_CEILING: String(jobCeiling),

    Q1_CAP: money(json.q1.cashPerRefreshCapPool),
    Q1_CAP_POOL: String(T('pools.stamina.maxCap')),
    Q1_BASE_POOL: String(T('start.stamina')),
    Q1_BASE: money(json.q1.cashPerRefreshBasePool),
    Q1_HOURS: String(Math.round(json.q1.jobsHoursEquivalentCapPool)),
    Q2_PER_WEEK: '$' + shortK(json.q2.cashPerWeek),
    Q2_OUTGROW_DAYS: (Math.round(json.q2.weeksToOutgrowAllSinks * 70) / 10).toString(),
    Q2_SINK_TOTAL: money(json.q2.oneTimeSinkTotal),
    Q3_RANGE: '$' + shortK(json.q3.rows[0].breakEven) + '–' + shortK(json.q3.rows[json.q3.rows.length - 1].breakEven),
    Q3_REWARD: money(json.q3.meanReward),
    Q4_LOSSES: String(json.q4.lossesModelled),
    Q4_LOST: money(json.q4.cashLost),
    Q4_START: money(json.q4.startCash),
    Q4_EARNBACK: money(json.q4.cashFromStartingMoves),

    T_D1: String(t.levelByDay.day1), T_D7: String(t.levelByDay.day7), T_D30: String(t.levelByDay.day30),
    L_D1: String(lb.d1), L_D7: String(lb.d7), L_D30: String(lb.d30),
    PACE_CLASS: paceFast ? 'neg' : 'pos',
    PACE_VERDICT: paceFast ? 'too fast' : 'on pace',
    CAP_YEARS: years(json.daysToCap.grinder),
    CAP_DAYS: capDays === null ? '&gt;' + Math.round(json.horizonDays / 365) + ' years' : years(capDays).replace('~', ''),
    CAP_CLASS: capDays === null || capDays > 365 * 3 ? 'neg' : 'pos',
    CAP_VERDICT: capDays === null || capDays > 365 * 3 ? 'wall' : 'ok',
    T_FAUCETS: [fShare.moves, fShare.fights, fShare.spots].map(v => Math.round(v * 100)).join(' / '),
    L_FAUCETS: '≈' + liveMovesShare + ' / − / ' + (100 - liveMovesShare),
    T_SESSIONS: t.session.sessionsPerDay + ' × ~' + t.session.minutesPerSession + ' min',
    T_HOSPITAL: Math.round(t.hospitalizedShareOfPlayers * 100) + '%',
    P_CASUAL: prof('casual'), P_COMMITTED: prof('committed'), P_GRINDER: prof('grinder'),

    BE_NOMINAL: money(beNominal),
    BE_HOURS: String(Math.round(beNominal / committedJobPerHour * 10) / 10),
    BE_ROWS: beRows,

    F1_MULT: Math.round(json.launder.dailyMultiplier / 1000).toLocaleString('en-US') + ',000',
    F1_RATE: Math.round(json.launder.rate * 100) + '%',
    F1_COST: String(json.launder.movesCost),
    F1_PER_DAY: String(Math.round(json.launder.laundersPerDayCommitted)),
    F2_CEILING: money(json.spotsExploit.perHourCeiling),
    F2_MIN: String(T('spots.collectMinimumSeconds')),
    F2_TOPJOB: money(committedJobPerHour),
    F3_BY_HEALTH: String(Math.round(json.fightRate.byHealth * 10) / 10),
    F3_BY_STAMINA: String(Math.round(json.fightRate.byStamina)),
    F4_JOB_CEIL: String(jobCeiling),
    F4_ENEMY_CEIL: String(enemyCeiling),
    F5_HOURS: String(Math.max(...gearAffordability(jobCeiling).map(g => Math.round(g.hoursOfJobs * 10) / 10))),

    DATA: JSON.stringify({
      maxLevel: MAX_LEVEL,
      horizonDays: json.horizonDays,
      ttl: json.ttl,
      bands: chartBands,
      flatFromIndex,
      targets: [[t.levelByDay.day1, 1], [t.levelByDay.day7, 7], [t.levelByDay.day30, 30]],
    }),
  };

  let html = tpl;
  for (const [k, v] of Object.entries(tokens)) html = html.split('%%' + k + '%%').join(v);
  const leftover = html.match(/%%[A-Z0-9_]+%%/g);
  if (leftover) throw new Error('template tokens unreplaced: ' + [...new Set(leftover)].join(', '));
  fs.writeFileSync(path.join(outDir, 'report.html'), html);
}

run();
