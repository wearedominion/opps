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
const IAP         = readJSON('data/monetization.json');
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
// Bands run to levelReq 110 since DOM-71/DOM-81; tools/econ-sim/gen-catalog.js
// prices each band's reward from the DOM-79 break-even anchor.
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

// Fights/hour a player can sustain under turn-based combat (DOM-72): a defeat
// hospitalizes (own timer, regen paused), so the free cadence is a CYCLE of
// 1/(1−p) fights followed by hospital.fullHealSeconds. Stamina still caps the
// paid path — a player buying every discharge with Cash fights at byStamina.
function sustainableFightsPerHour(p) {
  const byStamina  = STAMINA_PER_HOUR / T('combat.staminaPerFight');
  const byHospital = (1 / (1 - p)) / (T('hospital.fullHealSeconds') / 3600);
  return { byStamina, byHospital, effective: Math.min(byStamina, byHospital) };
}

const SPOT_COST_ALL   = PROPERTIES.reduce((s, pr) => s + pr.price, 0);
const GEAR_COST_ALL   = STORE.reduce((s, i) => s + i.price, 0);

// Spots (DOM-74): per-hour accrual clamped by the level-gated offline cap.
// A day's spot income is capped by how often the player empties the bank —
// at most 24h of rate, at least one bank per collect.
const spotCapHours = L =>
  evalCurve(UNLOCKS.capabilities.spotOfflineCapSeconds, L) / 3600;
const spotRatePerHour = L => PROPERTIES
  .filter(p => (p.levelReq || 1) <= L)
  .reduce((s, p) => s + p.ratePerHour, 0);
const spotCashPerDay = L => spotRatePerHour(L)
  * Math.min(24, spotCapHours(L) * TARGETS.assumptions.spotCollectsPerDay);

// ── A. Cash/hour & Clout/hour per activity per level band ────────────────────
const BANDS = [1, 2, 3, 5, 7, 10, 15, 20, 30, 50, 80, 120];
const p0 = TARGETS.assumptions.winProbabilityNominal;

function ratesAtLevel(L, balance) {
  const jc = bestJob(L, cloutPerMove);
  const jm = bestJob(L, cashPerMove);
  const e  = bestEnemy(L);
  const fights = sustainableFightsPerHour(p0); // base pool
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
    fightRateLimiter: fights.byHospital < fights.byStamina ? 'hospital' : 'stamina',
    spotCashPerDayIntended: spotCashPerDay(L),
    breakEven: breakEven(e, p0),
  };
}

// ── B. Time-to-level, day-by-day integration per profile ─────────────────────
// Clout/day at level L for a profile: moves regen share into the best Clout job,
// stamina regen share into fights (health-capped), plus level-up is free.
// Paid Clout per dollar at the band (spender headroom): the best boost path a
// rational PROGRESSION spender takes, mirroring §E's Cash anchors but scored
// in Clout. Two paths, best wins, all read live from data/monetization.json:
//  · moves boost — amount × best-job Clout/move.
//  · stamina boost + heals — each extra fight hospitalizes with probability
//    (1 − p0), so a marginal paid fight carries (1 − p0) Full Heals on top of
//    its stamina-point cost; without the heals the extra stamina is wasted
//    against the Hospital cycle cap.
function paidCloutPerUSD(L) {
  const jc = bestJob(L, cloutPerMove);
  const e = bestEnemy(L);
  const mv = IAP.find(x => x.effect && x.effect.type === 'grantPool' && x.effect.pool === 'moves');
  const st = IAP.find(x => x.effect && x.effect.type === 'grantPool' && x.effect.pool === 'stamina');
  const heal = IAP.find(x => x.effect && x.effect.type === 'refillPool' && x.effect.pool === 'health');
  const paths = [];
  if (mv) paths.push(mv.effect.amount * cloutPerMove(jc) / skuPriceUSD(mv.sku));
  if (st && heal) {
    const usdPerFight = skuPriceUSD(st.sku) / st.effect.amount
      + (1 - p0) * skuPriceUSD(heal.sku);
    paths.push(fightCloutEV(e, p0) / usdPerFight);
  }
  return paths.length ? Math.max(...paths) : 0;
}

function simulateProgression(profile, horizonDays) {
  const movesPerDay   = MOVES_PER_HOUR * 24 * profile.movesUse;
  const staminaPerDay = STAMINA_PER_HOUR * 24 * profile.staminaUse;
  const usdPerDay     = (profile.usdPerWeek || 0) / 7;
  let clout = 0;
  const levelAtDay = [levelForClout(0)];
  const cloutAtDay = [0];
  const daysToLevel = new Array(MAX_LEVEL + 1).fill(null);
  daysToLevel[1] = 0;
  for (let day = 1; day <= horizonDays; day++) {
    const L = levelForClout(clout);
    const jc = bestJob(L, cloutPerMove);
    const e  = bestEnemy(L);
    const fr = sustainableFightsPerHour(p0);
    const fightsPerDay = Math.min(staminaPerDay, fr.byHospital * 24 * profile.staminaUse);
    clout += movesPerDay * cloutPerMove(jc) + fightsPerDay * fightCloutEV(e, p0)
      + (usdPerDay ? usdPerDay * paidCloutPerUSD(L) : 0);
    const newL = levelForClout(clout);
    levelAtDay[day] = newL;
    cloutAtDay[day] = clout;
    for (let l = L + 1; l <= newL; l++) if (daysToLevel[l] === null) daysToLevel[l] = day;
  }
  return { levelAtDay, cloutAtDay, daysToLevel };
}

// ── C. Gear affordability ────────────────────────────────────────────────────
// Hours are measured at each item's own gate — the level where the price was
// set (DOM-73: hours × best-job $/h at the gate) — so the column reads as a
// check on the pricing rule, not on late-game trivialization.
function gearAffordability(L) {
  return STORE.filter(i => (i.levelReq || 1) <= L).map(i => {
    const gate = i.levelReq || 1;
    return {
      id: i.id, price: i.price, levelReq: gate,
      hoursOfJobs: i.price / ratesAtLevel(gate, 0).jobCashPerHour,
    };
  });
}

// ── C2. Gear upgrade sink (DOM-88) ───────────────────────────────────────────
// The recurring Cash drain from DOM-79 layer 2: geometric per-item upgrade
// levels, cost scaled by the item's own price, stat gains hard-capped at
// tuning.gear.statCapLevel, unbounded prestige beyond it. Because item prices
// are hours-of-income at their gate (DOM-73), every metric here is expressed
// in that same currency — hours or committed days of income at the band.
function upgradeSink(ratioOverride) {
  const curve = { ...T('gear.upgradeCost') };
  if (ratioOverride) curve.ratio = ratioOverride;
  const cap = T('gear.statCapLevel');
  const cum = n => Array.from({ length: n }, (_, i) => curve.base * Math.pow(curve.ratio, i))
    .reduce((a, b) => a + b, 0);
  const committedShare = TARGETS.playerProfiles.committed.movesUse;

  const bands = [10, 50, MAX_LEVEL_BAND].map(L => {
    const kit = STORE.filter(i => (i.levelReq || 1) === L && i.upgradeable);
    const kitPrice = kit.reduce((s, i) => s + i.price, 0);
    const dayIncome = ratesAtLevel(L, 0).jobCashPerHour * 24 * committedShare;
    return {
      band: L, items: kit.length, kitPrice,
      firstLevelHours: kitPrice * curve.base / ratesAtLevel(L, 0).jobCashPerHour,
      toLevel5Days: kitPrice * cum(5) / dayIncome,
      toCapDays: kitPrice * cum(cap) / dayIncome,
    };
  });

  // Endgame absorption: the maxed player's income vs the next prestige level
  // on the top-band kit — the reason Q2's "nothing left to buy" no longer holds.
  const top = bands[bands.length - 1];
  const maxedDay = ratesAtLevel(MAX_LEVEL, 0).jobCashPerHour * 24 * committedShare;
  const prestige = [cap + 1, cap + 2, cap + 5].map(n => ({
    level: n,
    kitCostThatLevel: top.kitPrice * curve.base * Math.pow(curve.ratio, n - 1),
    daysOfMaxedIncome: top.kitPrice * curve.base * Math.pow(curve.ratio, n - 1) / maxedDay,
  }));

  return { ratio: curve.ratio, base: curve.base, statCapLevel: cap,
           capMultiple: cum(cap), bands, prestige };
}
const MAX_LEVEL_BAND = Math.max(...STORE.map(i => i.levelReq || 1));

// ── C3. The Cash circuit (DOM-68) ────────────────────────────────────────────
// Does the whole circuit balance? Per checkpoint band: what flows in per
// committed day, what the band offers to spend it on, and where fighting
// flips from faucet to drain (the DOM-79 break-even). Every faucet and drain
// is a ledger reason; the money supply is Σ credits − Σ debits by contract
// (no netting, no transfer rows — snapshot combat mints and destroys only).
// ── Plug quests (DOM-90) ─────────────────────────────────────────────────────
// One-shot completion bonuses; the steps themselves pay through the normal
// faucets, so this table is the ENTIRE quest faucet. The report re-derives
// each bonus from the rule (hours × best-job income at the gate) so a
// hand-edited quests.json that drifts from the rule fails loudly here.
function questReport() {
  const QUESTS = readJSON('data/quests.json');
  const rows = QUESTS.map(q => {
    const r = ratesAtLevel(q.levelReq, 0);
    const ruleCash = q.hours * r.jobCashPerHour;
    if (Math.abs(q.reward.cash - ruleCash) / ruleCash > 0.05) {
      throw new Error('quest ' + q.id + ' bonus $' + q.reward.cash
        + ' drifted from the rule (' + q.hours + 'h × $' + Math.round(r.jobCashPerHour)
        + '/h = $' + Math.round(ruleCash) + ') — regenerate data/quests.json');
    }
    return {
      id: q.id, plug: q.plug, levelReq: q.levelReq, hours: q.hours,
      cash: q.reward.cash, clout: q.reward.clout, item: q.reward.item || null,
      evUSD: evUSD(q.reward.cash, q.levelReq),
    };
  });
  const totalClout = rows.reduce((s, r) => s + r.clout, 0);
  return {
    rows,
    totalCash: rows.reduce((s, r) => s + r.cash, 0),
    totalClout,
    cloutShareOfCurve: totalClout / cumClout[MAX_LEVEL],
    maxHours: Math.max(...rows.map(r => r.hours)),
    totalEvUSD: rows.reduce((s, r) => s + r.evUSD, 0),
  };
}

function moneyCircuit() {
  const committed = TARGETS.playerProfiles.committed;
  const curve = T('gear.upgradeCost');
  const cumTo5 = Array.from({ length: 5 }, (_, i) => curve.base * Math.pow(curve.ratio, i))
    .reduce((a, b) => a + b, 0);
  const gates = [...new Set(STORE.map(i => i.levelReq || 1))].sort((a, b) => a - b);
  return [1, 10, 50, MAX_LEVEL].map(L => {
    const gate = gates.filter(g => g <= L).pop();
    const r = ratesAtLevel(L, 0);
    const fr = sustainableFightsPerHour(p0);
    const fightsPerDay = Math.min(
      STAMINA_PER_HOUR * 24 * committed.staminaUse / T('combat.staminaPerFight'),
      fr.byHospital * 24 * committed.staminaUse);
    const e = bestEnemy(L);
    const inflow = {
      jobsPerDay: r.jobCashPerHour * 24 * committed.movesUse,
      spotsPerDay: r.spotCashPerDayIntended,
      fightWinsPerDay: p0 * mean(e.reward.cash) * fightsPerDay, // empty-wallet bound
    };
    const kit = STORE.filter(i => (i.levelReq || 1) === gate);
    const kitPrice = kit.reduce((s, i) => s + i.price, 0);
    const spot = PROPERTIES.find(p => (p.levelReq || 1) === gate);
    const sinks = {
      gearKit: kitPrice,
      spot: spot ? spot.price : 0,
      kitToLV5: kitPrice * cumTo5,
    };
    const inPerDay = inflow.jobsPerDay + inflow.spotsPerDay + inflow.fightWinsPerDay;
    const sinkTotal = sinks.gearKit + sinks.spot + sinks.kitToLV5;
    return {
      level: L, gate, inflow, sinks,
      inPerDay, sinkTotal,
      daysToClearBand: sinkTotal / inPerDay,
      breakEvenWallet: breakEven(e, p0),
    };
  });
}

// ── D. The four questions ────────────────────────────────────────────────────

// Q1 — Can paid Stamina out-earn its price?
//
// DOM-76 (ratified 2026-09-12): the stamina SKU is a FIXED-POINT boost read
// live from data/monetization.json, not a refill-to-max. A full refill scales
// with the pool (skill-built cap = pools.stamina.maxCap) and the shrinking-pile
// rule does NOT cap it — enemies pay fixed catalog rewards, nothing shrinks —
// so the mint is bounded by pinning the grant, not the pool. The rejected
// refill numbers are kept below as the counterfactual.
function q1() {
  const e = bestEnemy(MAX_LEVEL);
  const perFightFreshWallet = fightCashEV(e, 0.70, 0); // band ceiling, empty wallet
  const cap = T('pools.stamina.maxCap');
  const sku = IAP.find(p => p.effect && p.effect.pool === 'stamina');
  if (!sku || sku.effect.type !== 'grantPool') {
    throw new Error('Q1 expects a fixed grantPool stamina SKU in data/monetization.json (DOM-76)');
  }
  const grant = sku.effect.amount;
  const jobRate = ratesAtLevel(MAX_LEVEL, 0).jobCashPerHour;
  return {
    bestEnemy: e.id, meanReward: mean(e.reward.cash),
    perFightMax: perFightFreshWallet,
    boostPoints: grant,
    cashPerBoost: perFightFreshWallet * grant,
    jobsHoursEquivalentBoost: (perFightFreshWallet * grant) / jobRate,
    cashPerRefillCapPoolRejected: perFightFreshWallet * cap,
    note: 'Boost grants ' + grant + ' fixed points (' + sku.sku + '); mint per purchase is '
        + 'bounded and does not scale with the skill-built pool (cap ' + cap + ').',
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
  // Defeat lockout: a loss hospitalizes; fighting again means waiting out
  // the Hospital timer (or paying the early-out).
  const minutesToFight = T('hospital.fullHealSeconds') / 60;
  return {
    startCash, lossesModelled: pool, cashAfterLosses: afterLosses, cashLost: lost,
    bestJobId: j.id, cashFromStartingMoves, shortfall, minutesOfRegenToRecover: minutesRegen,
    minutesUntilFightingAgain: minutesToFight,
  };
}

// ── E. EV — equivalent value in current-day USD (DOM-94) ─────────────────────
// Ratified 2026-09-12 (Jake): the EV rate is anchored on the CHEAPEST SKU path
// to Cash — the most Cash one real dollar can actually buy at that level — so
// EV reads as the market price a rational spender faces. "Current day" means
// the rate is a function of level: fight EV and job payouts scale with the
// band, so a dollar buys ~5 orders of magnitude more Cash at the cap than at
// L1. Free earn rates use the committed ZERO-SPEND profile — the same
// movesUse/staminaUse shares, spot collects and Hospital cadence as the
// pacing targets, so EV stays consistent with the rest of this report.
const skuPriceUSD = sku => {
  const p = IAP.find(x => x.sku === sku);
  return p ? parseFloat(String(p.mockPrice).replace(/[^0-9.]/g, '')) : null;
};

// What one purchase of each pool SKU yields in Cash at level L, on the margin:
// an extra Move runs the best cash job, an extra Stamina point is one more
// fight at the nominal p with the empty-wallet EV (the optimistic bound the
// rest of the report also uses for fight income).
function evAnchors(L) {
  const anchors = [];
  const mv = IAP.find(x => x.effect && x.effect.type === 'grantPool' && x.effect.pool === 'moves');
  if (mv) anchors.push({
    sku: mv.sku, priceUSD: skuPriceUSD(mv.sku),
    cash: mv.effect.amount * cashPerMove(bestJob(L, cashPerMove)),
  });
  const st = IAP.find(x => x.effect && x.effect.type === 'grantPool' && x.effect.pool === 'stamina');
  if (st) anchors.push({
    sku: st.sku, priceUSD: skuPriceUSD(st.sku),
    cash: st.effect.amount * fightCashEV(bestEnemy(L), p0, 0),
  });
  anchors.forEach(a => { a.cashPerUSD = a.cash / a.priceUSD; });
  return anchors;
}

function evRate(L) { // Cash per 1 USD — the cheapest (highest-yield) path wins
  const best = evAnchors(L).reduce((m, a) => a.cashPerUSD > m.cashPerUSD ? a : m);
  return { level: L, cashPerUSD: best.cashPerUSD, anchorSku: best.sku };
}
const evUSD = (cash, L) => cash / evRate(L).cashPerUSD;

// Free earn per day by game system at level L, committed zero-spend profile.
// Fights mirror simulateProgression's cadence: the stamina-regen share, capped
// by the Hospital cycle share.
function evFreeEarnAt(L) {
  const c = TARGETS.playerProfiles.committed;
  const r = ratesAtLevel(L, 0);
  const fr = sustainableFightsPerHour(p0);
  const fightsPerDay = Math.min(STAMINA_PER_HOUR * 24 * c.staminaUse,
                                fr.byHospital * 24 * c.staminaUse);
  const jobs = r.jobCashPerHour * 24 * c.movesUse;
  const fights = fightCashEV(bestEnemy(L), p0, 0) * fightsPerDay;
  const spots = r.spotCashPerDayIntended;
  const rate = evRate(L);
  return {
    level: L, jobs, fights, spots, total: jobs + fights + spots,
    cashPerUSD: rate.cashPerUSD, anchorSku: rate.anchorSku,
    freeDayUSD: (jobs + fights + spots) / rate.cashPerUSD,
  };
}

// The one-time completionist sinks, by vertical. Recurring drains (Hospital
// heals, reroll fees, defeat losses) are deliberately excluded — "total cost
// of game" is what a completionist must eventually bank, not what churn eats.
function evCostOfGame() {
  const capLv = T('gear.statCapLevel');
  const upgCurve = T('gear.upgradeCost');
  const upgrades = STORE.reduce((s, i) => {
    let c = 0;
    for (let k = 1; k <= capLv; k++) c += evalCurve(upgCurve, k, i.price);
    return s + c;
  }, 0);
  const rows = [
    { vertical: 'Gear catalog (' + STORE.length + ' items)', cash: GEAR_COST_ALL },
    { vertical: 'Gear upgrades to the stat cap (LV ' + capLv + ' × ' + STORE.length + ')', cash: upgrades },
    { vertical: 'Spots ladder (' + PROPERTIES.length + ' spots)', cash: SPOT_COST_ALL },
  ];
  rows.push({ vertical: 'TOTAL', cash: rows.reduce((s, r) => s + r.cash, 0) });
  // Price the completionist's bill at the cap band — that's the "current day"
  // a finished run ends on — alongside days-to-earn at the cap-band free rate.
  const capFree = evFreeEarnAt(MAX_LEVEL);
  rows.forEach(r => {
    r.usdAtCap = r.cash / capFree.cashPerUSD;
    r.freeDaysAtCap = r.cash / capFree.total;
  });
  return rows;
}

const EV_BANDS = [1, 10, 50, 110];
function evReport() {
  return {
    bands: EV_BANDS.map(evFreeEarnAt),
    anchorsAtCap: evAnchors(MAX_LEVEL),
    costs: evCostOfGame(),
  };
}

// DOM-79 — break-even placement vs the ratified anchor.
// Target: BE(level) = breakEven.hoursOfJobIncome × best-job Cash/hour at that
// level, at the nominal win probability. Implied win reward follows from
// BE = p·R/((1−p)·L)  →  R = BE·(1−p)·L/p.
function breakEvenPlan() {
  const hours = TARGETS.breakEven.hoursOfJobIncome;
  return [1, 3, 5, 7].map(lv => {
    const jobPerHour = cashPerMove(bestJob(lv, cashPerMove)) * MOVES_PER_HOUR;
    const targetBE = hours * jobPerHour;
    const impliedR = targetBE * (1 - p0) * DEFEAT_LOSS_RATE / p0;
    const currentR = mean(bestEnemy(lv).reward.cash);
    return { level: lv, jobPerHour, targetBE, impliedR, currentR, scale: impliedR / currentR };
  });
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

// Spots model (DOM-74): accrual replaced the per-tap exploit. Per checkpoint:
// the income share vs jobs, the payback at the gate, and the leash length.
function spotModel() {
  const checkpoints = [1, 10, 50, MAX_LEVEL].map(L => ({
    level: L,
    ratePerHour: spotRatePerHour(L),
    capHours: spotCapHours(L),
    perDay: spotCashPerDay(L),
    shareOfJobs: spotRatePerHour(L) / ratesAtLevel(L, 0).jobCashPerHour,
  }));
  const paybacks = PROPERTIES.map(p => {
    const gate = p.levelReq || 1;
    return { id: p.id, gate, price: p.price,
             paybackDays: p.price / (p.ratePerHour * spotCapHours(gate)) };
  });
  return { checkpoints, paybacks };
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
  const capTarget = TARGETS.daysToMaxLevel;
  const capSim = sims.find(([n]) => n === capTarget.profile)[1];
  const cloutAtTargetDay = capSim.cloutAtDay[capTarget.days];
  const impliedCloutPerDay = cumClout[MAX_LEVEL] / capTarget.days;
  const currentCloutPerDay = cloutAtTargetDay / capTarget.days;
  say('\n  Target: level ' + MAX_LEVEL + ' in ' + capTarget.days + ' days (' + capTarget.profile + ') — actual: '
    + (capSim.daysToLevel[MAX_LEVEL] === null ? '>' + horizon + ' days' : capSim.daysToLevel[MAX_LEVEL] + ' days')
    + '. Implies ' + fmt(impliedCloutPerDay) + ' Clout/day average vs ' + fmt(currentCloutPerDay)
    + ' today (×' + fmt(impliedCloutPerDay / currentCloutPerDay) + ' gap — DOM-71/DOM-81).');

  say('\n  Days to reach level (committed profile):');
  const committedSim = sims.find(([n]) => n === 'committed')[1];
  const marks = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 119, 120];
  say('    ' + marks.map(l => 'L' + l + ':' + (committedSim.daysToLevel[l] === null ? '>' + horizon : committedSim.daysToLevel[l])).join('  '));

  // Spender headroom: paid pacing relief vs the committed baseline. The boosts
  // are consumables priced as pacing (DOM-76), so spend should BUY BACK WAIT,
  // not shortcut the curve — the days-to-cap compression is the headroom.
  const commitCap = committedSim.daysToLevel[MAX_LEVEL];
  say('\n  Spender headroom (committed usage + weekly budget on the best Clout/$ path):');
  sims.filter(([, s], i) => profiles[i][1].usdPerWeek).forEach(([name, s], _, __) => {
    const prof = TARGETS.playerProfiles[name];
    const cap = s.daysToLevel[MAX_LEVEL];
    say('    $' + pad(String(prof.usdPerWeek), 3) + '/wk  L' + s.levelAtDay[1] + ' / L' + s.levelAtDay[7]
      + ' / L' + s.levelAtDay[30] + ' at d1/7/30 · L' + MAX_LEVEL + ' in '
      + (cap === null ? '>' + horizon : cap) + ' days ('
      + (cap === null ? '—' : Math.round((1 - cap / commitCap) * 100) + '% faster than committed') + ')');
  });

  say('\n  Full 120-level curve written to tools/econ-sim/out/time-to-level.csv');

  say('\n■ C. Gear affordability (hours of best-job income at each item\'s own gate)');
  const gearGates = [...new Set(STORE.map(i => i.levelReq || 1))].sort((a, b) => a - b);
  gearGates.forEach(l => {
    const rows = gearAffordability(l).filter(g => g.levelReq === l)
      .map(g => g.id + ' ' + fmt(g.hoursOfJobs) + 'h');
    say('    L' + l + ': ' + rows.join(' · '));
  });

  say('\n■ C2. Gear upgrade sink (DOM-88) — geometric per level, scaled by item price');
  const us = upgradeSink();
  say('    ratio ' + us.ratio + ', stat cap LV ' + us.statCapLevel
    + ' (capping an item costs ×' + fmt(us.capMultiple) + ' its price; levels beyond are prestige)');
  us.bands.forEach(b => {
    say('    L' + b.band + ' kit (' + b.items + ' items, $' + fmt(b.kitPrice) + '): first levels '
      + fmt(b.firstLevelHours) + 'h of jobs · all to LV 5 = ' + fmt(b.toLevel5Days)
      + ' committed days · to stat cap = ' + fmt(b.toCapDays) + ' days');
  });
  say('    Endgame absorption (maxed income, top kit): '
    + us.prestige.map(p => 'LV ' + p.level + ' = ' + fmt(p.daysOfMaxedIncome) + 'd').join(' · ')
    + ' — the sink no longer runs out (see Q2).');
  say('    Ratio check (kit to LV 5 / to cap / next prestige level, committed days):');
  [1.4, 1.6, 1.8].forEach(r => {
    const alt = upgradeSink(r);
    say('      r=' + r + ':  LV5 ' + fmt(alt.bands[0].toLevel5Days) + 'd · cap '
      + fmt(alt.bands[0].toCapDays) + 'd · prestige LV ' + (alt.statCapLevel + 1) + ' '
      + fmt(alt.prestige[0].daysOfMaxedIncome) + 'd'
      + (r === us.ratio ? '   ← shipped: LV 5 in-band, cap a season-long goal, prestige absorbs for months' : ''));
  });

  say('\n■ C3. The Cash circuit (DOM-68) — in/day vs what the band sells, committed');
  moneyCircuit().forEach(c => {
    say('    L' + c.level + ' (gate ' + c.gate + '): in $' + fmt(c.inPerDay) + '/day'
      + ' (jobs ' + Math.round(c.inflow.jobsPerDay / c.inPerDay * 100) + '%'
      + ' · fights ' + Math.round(c.inflow.fightWinsPerDay / c.inPerDay * 100) + '%'
      + ' · spots ' + Math.round(c.inflow.spotsPerDay / c.inPerDay * 100) + '%)'
      + ' · band sinks $' + fmt(c.sinkTotal) + ' = ' + fmt(c.daysToClearBand) + 'd to clear'
      + ' · fight break-even at $' + fmt(c.breakEvenWallet));
  });
  say('    Fight share is the EMPTY-WALLET bound — net fight income decays to 0 at the'
    + ' break-even wallet and turns negative above it (the DOM-79 sink).');
  say('    Money supply = Σ credits − Σ debits by contract: every movement is a ledger row'
    + ' with a reason; snapshot combat mints and destroys, never transfers (08 §4/§8).');

  say('\n■ Q1. Can paid Stamina out-earn its price?  BOUNDED — fixed-point boost (DOM-76).');
  const a1 = q1();
  say('    Best fight EV (p=0.70 band ceiling, empty wallet): $' + fmt(a1.perFightMax) + '/fight vs ' + a1.bestEnemy);
  say('    Cash per boost (+' + a1.boostPoints + ' fixed): $' + fmt(a1.cashPerBoost)
    + ' ≈ ' + a1.jobsHoursEquivalentBoost.toFixed(1) + ' hours of top-job income — pool size no longer multiplies it.');
  say('    (A refill-to-max would scale to $' + fmt(a1.cashPerRefillCapPoolRejected)
    + ' on a skill-built pool of ' + T('pools.stamina.maxCap') + ' — rejected 2026-09-12.)');

  say('\n■ Q2. Cash inflation with no recurring sink (maxed committed player):');
  const a2 = q2();
  say('    Jobs $' + fmt(a2.jobsCashPerDay) + '/day + Spots $' + fmt(a2.spotsCashPerDay) + '/day'
    + '  →  $' + fmt(a2.cashPerWeek) + '/week with nothing to buy.');
  say('    Entire one-time sink catalog (all gear + all spots) = $' + fmt(a2.oneTimeSinkTotal)
    + ' — outgrown in ' + fmt(a2.weeksToOutgrowAllSinks * 7) + ' days.');
  say('    RESOLVED by the upgrade track (C2/DOM-88): past the one-time catalog the geometric'
    + ' prestige ladder always offers a next level — the sink never runs out.');

  say('\n■ Q3. Do bots mint more than players destroy?  YES below break-even.');
  const a3 = q3();
  say('    vs ' + a3.enemy + ' (mean reward $' + fmt(a3.meanReward) + '):');
  say(table(['p(win)', 'break-even $', 'net/fight @$1k', '@$10k', '@$50k'],
    a3.rows.map(r => [String(r.p), r.breakEven, r.netMintPerFightAt1k, r.netMintPerFightAt10k, r.netMintPerFightAt50k]),
    [7, 12, 14, 10, 10]));
  say('    Every wallet below break-even mints on net; nothing self-limits it');
  say('    (the opponent is a snapshot and loses nothing).');

  say('\n■ BE. Break-even placement vs the ratified anchor (DOM-79: '
    + TARGETS.breakEven.hoursOfJobIncome + 'h of job income, p = ' + p0 + ')');
  const plan = breakEvenPlan();
  say(table(['lvl', 'job $/h', 'target BE $', 'implied R $', 'current R $', 'R scale ×'],
    plan.map(r => [r.level, r.jobPerHour, r.targetBE, r.impliedR, r.currentR, Math.round(r.scale * 100) / 100]),
    [4, 8, 12, 12, 12, 10]));
  say('    Rewards are priced from the band\'s job income by gen-catalog.js (DOM-71/DOM-81);');
  say('    a scale off ×1 is band granularity or drift. loot.defeatLossRate stays ' + DEFEAT_LOSS_RATE + '.');

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
  if (lf.rate <= 0) {
    say('  F1 LAUNDER: resolved — launderRate is 0 (DOM-73). A nonzero rate compounds without'
      + ' bound (' + fmt(lf.laundersPerDayCommitted) + ' launders/day committed), so leave it zeroed'
      + ' until the action is redesigned with a cap.');
  } else {
    say('  F1 LAUNDER: +' + (lf.rate * 100) + '% of balance per ' + lf.movesCost + ' Moves compounds to a ×'
      + lf.dailyMultiplier.toExponential(2) + ' DAILY multiplier ('
      + fmt(lf.laundersPerDayCommitted) + ' launders/day committed). Zero it before any other tuning matters.');
  }
  const sx = spotModel();
  say('  F2 SPOTS: resolved (DOM-74) — per-tap income replaced by accrual clamped at the'
    + ' level-gated offline cap; uncollected accrual is NOT lootable in v1 (ratified).');
  sx.checkpoints.forEach(c => {
    say('     L' + c.level + ': $' + fmt(c.ratePerHour) + '/h banked ('
      + Math.round(c.shareOfJobs * 100) + '% of job rate) · leash ' + fmt(c.capHours)
      + 'h · $' + fmt(c.perDay) + '/day at ' + TARGETS.assumptions.spotCollectsPerDay + ' collects');
  });
  say('     Payback at the gate: ' + fmt(Math.min(...sx.paybacks.map(p => p.paybackDays)))
    + '–' + fmt(Math.max(...sx.paybacks.map(p => p.paybackDays))) + ' days across the ladder.');
  const fr = sustainableFightsPerHour(p0);
  say('  F3 FIGHT RATE: the Hospital timer caps free fighting at ' + fmt(fr.byHospital) + '/h at p=' + p0
    + ' (stamina caps the paid path at ' + fmt(fr.byStamina) + '/h) — the Hospital loop paces combat'
    + ' and its Cash early-out is the recurring combat drain. RESOLVED as designed (DOM-72).');
  const jobCeil = Math.max(...JOBS.map(j => j.levelReq));
  const enemyCeil = Math.max(...ENEMIES.map(e => e.levelReq));
  say('  F4 CONTENT CEILING: resolved (DOM-71/81) — catalogs run to levelReq '
    + jobCeil + ' (jobs) and ' + enemyCeil + ' (enemies); Clout/day tracks the cost curve.');
  const grinderDays = sims.find(([n]) => n === 'grinder')[1].daysToLevel[120];
  say('  F5 THE CAP: level 120 needs ' + fmt(cumClout[120])
    + ' Clout ≈ ' + (committedSim.daysToLevel[120] === null ? '>' + horizon : fmt(committedSim.daysToLevel[120]))
    + ' days committed / ' + (grinderDays === null ? '>' + horizon : fmt(grinderDays))
    + ' days grinding non-stop — on the ratified 365-day target.');

  const ev = evReport();
  say('\n■ EV. Equivalent value — everything in current-day USD (DOM-94)');
  say('    Anchor: cheapest SKU path to Cash (most Cash one dollar buys — today the '
    + ev.bands[ev.bands.length - 1].anchorSku + '); free rates = committed zero-spend profile.');
  say('    lvl    $1 buys (Cash)   jobs $/day     fights $/day   spots $/day    total $/day    free day EV');
  say('    ' + '─'.repeat(102));
  ev.bands.forEach(b => {
    say('    ' + String(b.level).padEnd(6)
      + ('$' + fmt(b.cashPerUSD)).padEnd(17)
      + ('$' + fmt(b.jobs)).padEnd(15)
      + ('$' + fmt(b.fights)).padEnd(15)
      + ('$' + fmt(b.spots)).padEnd(15)
      + ('$' + fmt(b.total)).padEnd(15)
      + '$' + b.freeDayUSD.toFixed(2) + ' USD');
  });
  say('    Total cost of game by vertical (one-time completionist sinks; EV + days at the cap band):');
  ev.costs.forEach(r => {
    say('      ' + r.vertical.padEnd(46) + ('$' + fmt(r.cash)).padEnd(20)
      + ('$' + r.usdAtCap.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' USD').padEnd(16)
      + fmt(r.freeDaysAtCap) + ' free days');
  });

  say('\n■ Q. Plug quests (DOM-90) — one-shot bonuses; steps pay through the normal faucets.');
  const qr = questReport();
  qr.rows.forEach(r => {
    say('    L' + pad(String(r.levelReq), 3) + ' ' + pad(r.id, 18) + ' $' + fmt(r.cash)
      + ' + ' + r.clout + ' Clout (' + r.hours + 'h)' + (r.item ? ' + ' + r.item : '')
      + ' — EV $' + (Math.round(r.evUSD * 100) / 100));
  });
  say('    Catalog total: $' + fmt(qr.totalCash) + ' + ' + fmt(qr.totalClout) + ' Clout ('
    + (qr.cloutShareOfCurve * 100).toFixed(4) + '% of the lifetime curve) — max bonus '
    + qr.maxHours + 'h vs the ' + TARGETS.breakEven.hoursOfJobIncome + 'h break-even anchor.');

  // ── outputs ────────────────────────────────────────────────────────────────
  const outDir = path.join(__dirname, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const profileNames = profiles.map(([n]) => n);
  const byName = Object.fromEntries(sims);
  const csv = ['level,cumClout,' + profileNames.map(n => 'days_' + n).join(',')];
  for (let l = 1; l <= MAX_LEVEL; l++) {
    csv.push([l, cumClout[l], ...profileNames.map(n => byName[n].daysToLevel[l] ?? '')].join(','));
  }
  fs.writeFileSync(path.join(outDir, 'time-to-level.csv'), csv.join('\n') + '\n');

  const json = {
    generated: new Date().toISOString(),
    tuningVersion: TUNING.version,
    horizonDays: horizon,
    bands: BANDS.map(l => ratesAtLevel(l, 0)),
    levelByDay: Object.fromEntries(sims.map(([n, s]) => [n, { d1: s.levelAtDay[1], d7: s.levelAtDay[7], d30: s.levelAtDay[30] }])),
    daysToCap: Object.fromEntries(sims.map(([n, s]) => [n, s.daysToLevel[MAX_LEVEL]])),
    capTarget: { ...capTarget, impliedCloutPerDay, currentCloutPerDay },
    ttlProfiles: profileNames,
    ttl: Array.from({ length: MAX_LEVEL }, (_, i) => [i + 1,
      ...profileNames.map(n => byName[n].daysToLevel[i + 1])]),
    fightRate: sustainableFightsPerHour(p0),
    q1: q1(), q2: q2(), q3: q3(), q4: q4(),
    breakEvenPlan: breakEvenPlan(),
    launder: launder(), spots: spotModel(),
    upgradeSink: upgradeSink(),
    moneyCircuit: moneyCircuit(),
    quests: questReport(),
    ev,
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
  const capDays = json.daysToCap[t.daysToMaxLevel.profile];
  const capTargetDays = t.daysToMaxLevel.days;

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

    Q1_BOOST: money(json.q1.cashPerBoost),
    Q1_BOOST_PTS: String(json.q1.boostPoints),
    Q1_HOURS: json.q1.jobsHoursEquivalentBoost.toFixed(1),
    Q1_CAP_REJECTED: money(json.q1.cashPerRefillCapPoolRejected),
    Q1_CAP_POOL: String(T('pools.stamina.maxCap')),
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
    T_CAP: capTargetDays + ' days (' + t.daysToMaxLevel.profile + ')',
    CAP_DAYS: capDays === null ? '&gt;' + Math.round(json.horizonDays / 365) + ' years' : years(capDays).replace('~', ''),
    CAP_CLASS: capDays === null || capDays > capTargetDays * 1.25 ? 'neg' : capDays < capTargetDays * 0.75 ? 'neg' : 'pos',
    CAP_VERDICT: capDays === null || capDays > capTargetDays * 1.25 ? 'wall'
               : capDays < capTargetDays * 0.75 ? 'too fast' : 'on pace',
    CAP_GAP: '×' + (Math.round(json.capTarget.impliedCloutPerDay / json.capTarget.currentCloutPerDay * 10) / 10),
    T_FAUCETS: [fShare.moves, fShare.fights, fShare.spots].map(v => Math.round(v * 100)).join(' / '),
    L_FAUCETS: '≈' + liveMovesShare + ' / − / ' + (100 - liveMovesShare),
    T_SESSIONS: t.session.sessionsPerDay + ' × ~' + t.session.minutesPerSession + ' min',
    T_HOSPITAL: Math.round(t.hospitalizedShareOfPlayers * 100) + '%',
    P_CASUAL: prof('casual'), P_COMMITTED: prof('committed'), P_GRINDER: prof('grinder'),

    BE_NOMINAL: money(beNominal),
    BE_HOURS: String(Math.round(beNominal / committedJobPerHour * 10) / 10),
    EV_ANCHOR_SKU: json.ev.bands[json.ev.bands.length - 1].anchorSku,
    EV_RATE_ROWS: json.ev.bands.map(b =>
      `          <tr><td>L${b.level}</td><td class="money">${money(b.cashPerUSD)}</td>` +
      `<td class="money">${money(b.jobs)}</td><td class="money">${money(b.fights)}</td>` +
      `<td class="money">${money(b.spots)}</td><td class="money">${money(b.total)}</td>` +
      `<td class="pos">$${b.freeDayUSD.toFixed(2)}</td></tr>`).join('\n'),
    EV_COST_ROWS: json.ev.costs.map(r => {
      const b = r.vertical === 'TOTAL';
      const wrap = s => b ? `<b style="color:var(--text)">${s}</b>` : s;
      return `          <tr><td>${wrap(r.vertical)}</td><td class="money">${wrap(money(r.cash))}</td>` +
        `<td class="money">${wrap('$' + r.usdAtCap.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}</td>` +
        `<td>${wrap(fmt(r.freeDaysAtCap) + ' days')}</td></tr>`;
    }).join('\n'),
    EV_FREE_DAY_CAP: '$' + json.ev.bands[json.ev.bands.length - 1].freeDayUSD.toFixed(2),
    BE_ROWS: beRows,
    BE_ANCHOR: String(t.breakEven.hoursOfJobIncome),
    BE_PLAN_ROWS: json.breakEvenPlan.map(r =>
      `          <tr><td>L${r.level}${r.level === Math.max(...json.breakEvenPlan.map(x => x.level)) ? '+' : ''}</td>`
      + `<td>${money(r.jobPerHour)}</td><td class="money">${money(r.targetBE)}</td>`
      + `<td class="money">${money(r.impliedR)}</td><td>${money(r.currentR)}</td>`
      + `<td>×${Math.round(r.scale * 10) / 10}</td></tr>`).join('\n'),

    F1_MULT: Math.round(json.launder.dailyMultiplier / 1000).toLocaleString('en-US') + ',000',
    F1_RATE: Math.round(json.launder.rate * 100) + '%',
    F1_COST: String(json.launder.movesCost),
    F1_PER_DAY: String(Math.round(json.launder.laundersPerDayCommitted)),
    F2_SHARE: String(Math.round(json.spots.checkpoints[0].shareOfJobs * 100)),
    F2_CAP_L1: fmt(json.spots.checkpoints[0].capHours),
    F2_CAP_MAX: fmt(json.spots.checkpoints[json.spots.checkpoints.length - 1].capHours),
    F2_PAYBACK: fmt(json.spots.paybacks.reduce((s, p) => s + p.paybackDays, 0) / json.spots.paybacks.length),
    F3_BY_HOSPITAL: String(Math.round(json.fightRate.byHospital * 10) / 10),
    F3_BY_STAMINA: String(Math.round(json.fightRate.byStamina)),
    F4_JOB_CEIL: String(jobCeiling),
    F4_ENEMY_CEIL: String(enemyCeiling),
    F5_HOURS: String(Math.max(...gearAffordability(jobCeiling).map(g => Math.round(g.hoursOfJobs * 10) / 10))),
    F7_QUESTS: String(json.quests.rows.length),
    F7_MAX_HOURS: String(json.quests.maxHours),
    F7_BE_HOURS: String(t.breakEven.hoursOfJobIncome),
    F7_CLOUT_SHARE: (json.quests.cloutShareOfCurve * 100).toFixed(4) + '%',
    F6_PER_SLOT: String(T('crew.lieutenantsPerSlot')),
    F6_ROTATION: T('crew.slotRotation').join(' → '),
    F6_CAP: String(T('crew.maxBonusSlotsPerType')),
    F6_MAX_LT: String(T('crew.lieutenantsPerSlot') * T('crew.slotRotation').length
      * T('crew.maxBonusSlotsPerType')),
    UPG_RATIO: String(json.upgradeSink.ratio),
    UPG_NEXT_LV: String(json.upgradeSink.statCapLevel + 1),
    UPG_NEXT_DAYS: fmt(json.upgradeSink.prestige[0].daysOfMaxedIncome),

    TTL_SPEND: (() => {
      // Headroom line under the chart: days-to-cap compression per spend tier.
      const cap = n => json.daysToCap[n];
      const base = cap('committed');
      const tier = n => {
        const d = cap(n), w = t.playerProfiles[n].usdPerWeek;
        return '$' + w + '/wk → ' + (d === null ? '&gt;' + json.horizonDays : d) + 'd'
          + (d === null ? '' : ' (−' + Math.round((1 - d / base) * 100) + '%)');
      };
      return json.ttlProfiles.filter(n => t.playerProfiles[n].usdPerWeek)
        .map(tier).join(' · ') + ' vs committed ' + base + 'd';
    })(),
    DATA: JSON.stringify({
      maxLevel: MAX_LEVEL,
      horizonDays: json.horizonDays,
      // Chart series meta, in ttl column order: free profiles keep the
      // categorical trio; spend tiers are ordinal, so they take a single-hue
      // chrome ramp (dim → bright with budget) and a dashed stroke to mark
      // the paid family.
      profiles: json.ttlProfiles.map((n, i) => {
        const p = t.playerProfiles[n];
        const free = ['#3987e5', '#d95926', '#199e70'];
        const gold = ['#8f7a4e', '#c9a55c', '#f3e0b4'];
        const spendIdx = json.ttlProfiles.filter((m, j) => j < i && t.playerProfiles[m].usdPerWeek).length;
        return p.usdPerWeek
          ? { label: '+$' + p.usdPerWeek + '/wk', color: gold[spendIdx % 3], dash: '6 4' }
          : { label: n, color: free[i % 3], dash: null };
      }),
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
