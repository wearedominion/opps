// ─────────────────────────────────────────────
//  FIGHT MATH (DOM-72)
//
//  One pure implementation of the turn-based round model, shared by the
//  client (js/combat.js steps it round by round) and the simulator/generator
//  (tools/econ-sim resolve whole fights to price rewards and enemy stats).
//  Nothing here reads G, TUNING or the DOM — inputs in, numbers out.
//
//  The model (constants from tuning.combat):
//  · Each round both sides deal damage (locked rule), SEQUENTIALLY per the
//    ticket's flow: the player's hit lands first; a killed enemy never
//    counterattacks. No double KO — first pool to zero ends the fight.
//  · Damage to the ENEMY is a share of the ENEMY's own max pool, scaled by
//    the attack/defense ratio — enemy HP displays scale freely per band
//    without changing how long a fight lasts.
//  · Damage to the PLAYER is referenced to BASE health (tuning start.health),
//    not the player's current max — so skill-built max Health buys real extra
//    rounds. That is the tank build.
//  · The attacker's OPENING hit is scaled by (1 + firstStrikeEdge): picking
//    the fight is worth something. The enemy-stat solve in gen-catalog.js
//    absorbs the whole first-mover advantage — band-appropriate matchups are
//    calibrated back to the pricing nominal p0.
// ─────────────────────────────────────────────

// atk vs def → damage multiplier in (0, 2); 1 at parity.
function fmRatio(atk, def) {
  return (2 * atk) / (atk + def);
}

// One hit. poolRef is what the share is taken of (enemy max HP for hits on
// the enemy; BASE health for hits on the player).
function fmHit(atk, def, poolRef, cfg, rng) {
  const noise = 1 - cfg.damageSpread + 2 * cfg.damageSpread * rng();
  return Math.max(1, Math.round(cfg.roundDamageShare * fmRatio(atk, def) * poolRef * noise));
}

// One full round from the player's perspective. `first` marks the fight's
// opening round (first-strike edge applies to the player's hit).
// Returns the two damages; the caller applies them.
function fmRound(player, enemy, cfg, rng, first) {
  let toEnemy = fmHit(player.atk, enemy.def, enemy.maxHp, cfg, rng);
  if (first) toEnemy = Math.round(toEnemy * (1 + cfg.firstStrikeEdge));
  const toPlayer = fmHit(enemy.atk, player.def, cfg.baseHp, cfg, rng);
  return { toEnemy: toEnemy, toPlayer: toPlayer };
}

// Auto-resolve one whole fight (sim/generator use; the client steps rounds
// itself so the player can Run between them).
// player: {atk, def, hp}   enemy: {atk, def, maxHp}
// Returns {win, playerHpLoss, rounds}.
function fmFight(player, enemy, cfg, rng) {
  let pHp = player.hp, eHp = enemy.maxHp, rounds = 0;
  for (;;) {
    rounds++;
    const r = fmRound(player, enemy, cfg, rng, rounds === 1);
    eHp -= r.toEnemy;
    if (eHp <= 0) {         // a killed enemy never counterattacks
      return { win: true, playerHpLoss: player.hp - pHp, rounds: rounds };
    }
    pHp -= r.toPlayer;
    if (pHp <= 0) {
      return { win: false, playerHpLoss: player.hp, rounds: rounds };
    }
    if (rounds > 200) {     // spread can't stall this long; guard anyway
      return { win: false, playerHpLoss: player.hp - Math.max(0, pHp), rounds: rounds };
    }
  }
}

// Monte-Carlo aggregate for pricing and calibration.
function fmStats(player, enemy, cfg, iters, rng) {
  let wins = 0, lossHpWin = 0, lossHpAll = 0, rounds = 0;
  const n = iters || 2000;
  for (let i = 0; i < n; i++) {
    const f = fmFight(player, enemy, cfg, rng);
    if (f.win) { wins++; lossHpWin += f.playerHpLoss; }
    lossHpAll += f.playerHpLoss;
    rounds += f.rounds;
  }
  return {
    pWin: wins / n,
    meanHpLossOnWin: wins ? lossHpWin / wins : 0,
    meanHpLossOverall: lossHpAll / n,
    meanRounds: rounds / n,
  };
}

// Deterministic RNG (mulberry32) so generated catalogs are reproducible.
function fmSeededRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { fmRatio, fmHit, fmRound, fmFight, fmStats, fmSeededRng };
}
