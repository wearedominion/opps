// ─────────────────────────────────────────────
//  REGEN ENGINE — one implementation, three pools
//
//  Lazy and timestamp-driven: a pool is worth whatever its `lastTick` and the
//  clock say it is worth, computed on read. There is no live accumulator, so
//  OFFLINE CATCH-UP AND ONLINE TICKING ARE THE SAME CODE PATH — the interval in
//  init() only exists to refresh the display, and deleting it would cost
//  correctness nothing. The previous design had two: `lastSeen` for offline and
//  `lastEnergyTick` for online, which could disagree.
//
//  Rates are data (tuning.pools.<pool>.regenSeconds / .regenAmount).
//
//  CLIENT-SIDE ONLY, and that is a real limit: a player who moves their device
//  clock forward gets free regen. It is bounded — a pool never exceeds its max,
//  so the most a jump can buy is one full refill, exactly what waiting buys —
//  but it cannot be closed here. Real defence needs the server to own the
//  timestamps. See docs/specs/08-economy-schema.md §8.
// ─────────────────────────────────────────────

const REGEN_POOLS = ['moves', 'stamina', 'health'];

// Advance one pool to `now`. Returns how much was credited.
function regenPool(pool, now) {
  const p = G[pool];
  if (!p) return 0;
  now = now || Date.now();

  // The Hospital runs its own timer (DOM-72, ratified): while hospitalized,
  // health does not trickle back through regen — the timer (or the Cash
  // early-out) is the only way back. Keep the anchor current so no regen
  // time banks up behind the lockout.
  if (pool === 'health' && typeof G.hospitalizedUntil === 'number' && G.hospitalizedUntil > now) {
    p.lastTick = now;
    return 0;
  }

  // No tick yet, or the clock moved backwards. Re-anchor without crediting:
  // leaving lastTick in the future would stall regen until real time caught up.
  if (!p.lastTick || p.lastTick > now) { p.lastTick = now; return 0; }

  // A full pool must keep its tick current. Otherwise time banks up while the
  // player sits at max and pays out the instant they spend — which is exactly
  // the offline-farming hole the Hospital shield exists to close.
  if (p.current >= p.max) { p.lastTick = now; return 0; }

  const every = tune('pools.' + pool + '.regenSeconds') * 1000;
  const amount = tune('pools.' + pool + '.regenAmount');
  const ticks = Math.floor((now - p.lastTick) / every);
  if (ticks <= 0) return 0;

  // Credit EVERY elapsed tick, not one per call. The old online path granted at
  // most 1 per check however long had passed, which is why a separate offline
  // path existed at all.
  const applied = credit(pool, ticks * amount, REASON.REGEN);
  // Advance by whole ticks — never `= now`, which would discard the part-interval
  // already served and make every grant drift a little later than the last.
  p.lastTick += ticks * every;
  if (p.current >= p.max) p.lastTick = now;
  return applied;
}

// Advance every pool. Returns the total credited across all of them.
function regenAll(now) {
  now = now || Date.now();
  return REGEN_POOLS.reduce((sum, pool) => sum + regenPool(pool, now), 0);
}

// Seconds until `pool` reaches full. 0 when it already is.
// Accounts for progress already made toward the next tick.
function secondsToFull(pool, now) {
  const p = G[pool];
  if (!p || p.current >= p.max) return 0;
  now = now || Date.now();
  const every = tune('pools.' + pool + '.regenSeconds');
  const amount = tune('pools.' + pool + '.regenAmount');
  const ticksNeeded = Math.ceil((p.max - p.current) / amount);
  const elapsed = Math.max(0, Math.min(every * 1000, now - (p.lastTick || now)));
  return Math.max(0, Math.round(ticksNeeded * every - elapsed / 1000));
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { REGEN_POOLS, regenPool, regenAll, secondsToFull };
}
