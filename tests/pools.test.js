// Regen engine, Moves and Stamina pools.
// Part of the suite; run it all with `node tests/run.js`.

const {
  fs, path, assert, ROOT, TUNE, tune, migrate, G, JOBS_DATA, FIXTURE_V2, clone, test,
} = require('./harness');

console.log('\nregen engine');

// regen.js reads the G and TUNING globals and calls tune() — wire them up.
global.TUNING = TUNE;
global.tune = tune;
const { regenPool, regenAll, secondsToFull, REGEN_POOLS } = require(path.join(ROOT, 'js/regen.js'));

const T0 = 1_700_000_000_000;                      // fixed epoch; nothing here uses Date.now()
const SEC = 1000, MIN = 60 * SEC;
const MOVES_EVERY = tune('pools.moves.regenSeconds', TUNE) * SEC;
function pools(over) {
  global.G = {
    moves:   { current: 0, max: 10,  lastTick: T0 },
    stamina: { current: 0, max: 3,   lastTick: T0 },
    health:  { current: 0, max: 100, lastTick: T0 },
  };
  Object.assign(global.G, over || {});
  return global.G;
}

test('all three pools advance from one call, each at its own rate', () => {
  const G = pools();
  regenAll(T0 + 15 * MIN);
  assert.strictEqual(G.moves.current, 3);     // 300s each -> 3
  assert.strictEqual(G.stamina.current, 3);   // 180s each -> 5, clamped to max 3
  assert.strictEqual(G.health.current, 75);   // 60s each x 5 -> 75
});

test('health credits its regenAmount, not one per tick', () => {
  const G = pools();
  regenPool('health', T0 + 3 * MIN);
  assert.strictEqual(G.health.current, 15);   // 3 ticks x 5
});

test('a pool never exceeds its max, however long the gap', () => {
  const G = pools();
  regenAll(T0 + 3650 * 24 * 60 * MIN);        // ten years
  REGEN_POOLS.forEach(p => assert.strictEqual(G[p].current, G[p].max, p));
});

test('the partial interval is carried, not discarded', () => {
  // The old tick set lastTick = Date.now() when it granted, discarding however
  // far past the boundary the check had landed — so each grant drifted a little
  // later than the one before. Advancing by whole ticks keeps the phase.
  const G = pools();
  for (let t = 10 * SEC; t < MOVES_EVERY; t += 10 * SEC) regenPool('moves', T0 + t);
  assert.strictEqual(G.moves.current, 0, 'nothing granted before a full interval');
  regenPool('moves', T0 + MOVES_EVERY);
  assert.strictEqual(G.moves.current, 1, 'granted exactly on the interval boundary');
});

test('offline catch-up and online ticking give the identical result', () => {
  // This is the acceptance criterion: one code path, so a player who closes the
  // tab and one who watches it must end up in the same place.
  const span = 47 * MIN + 23 * SEC;             // deliberately not a round number
  const offline = pools();
  regenAll(T0 + span);
  const offlineState = JSON.parse(JSON.stringify(offline));

  const online = pools();
  for (let t = 10 * SEC; t <= span; t += 10 * SEC) regenAll(T0 + t);
  regenAll(T0 + span);

  REGEN_POOLS.forEach(p => {
    assert.strictEqual(online[p].current, offlineState[p].current, p + ' current');
    assert.strictEqual(online[p].lastTick, offlineState[p].lastTick, p + ' lastTick');
  });
});

test('a full pool does not bank time while it sits there', () => {
  // Otherwise a player idling at max for days would refill instantly the moment
  // they spent anything — the offline-farming hole.
  const G = pools({ moves: { current: 10, max: 10, lastTick: T0 } });
  regenPool('moves', T0 + 10 * 24 * 60 * MIN);   // ten days at full
  assert.strictEqual(G.moves.current, 10);
  G.moves.current = 0;                            // now spend the lot
  assert.strictEqual(regenPool('moves', T0 + 10 * 24 * 60 * MIN + 1 * SEC), 0,
    'no backlog paid out');
});

test('a clock moved backwards re-anchors instead of stalling', () => {
  const G = pools();
  assert.strictEqual(regenPool('moves', T0 - 5 * 24 * 60 * MIN), 0, 'no credit');
  assert.strictEqual(G.moves.lastTick, T0 - 5 * 24 * 60 * MIN, 're-anchored to the new now');
  // and regen resumes normally from there rather than waiting out the rewind
  regenPool('moves', T0 - 5 * 24 * 60 * MIN + MOVES_EVERY);
  assert.strictEqual(G.moves.current, 1);
});

test('a clock moved forwards is bounded by max, not unlimited', () => {
  // Cannot be fully defended client-side. It IS bounded: the most a jump buys is
  // one full refill, exactly what waiting buys. Real defence needs the server to
  // own the timestamps — docs/specs/08-economy-schema.md §8.
  const G = pools();
  regenPool('moves', T0 + 100 * 365 * 24 * 60 * MIN);
  assert.strictEqual(G.moves.current, G.moves.max);
});

test('a pool with no tick yet anchors without paying out', () => {
  const G = pools({ moves: { current: 0, max: 10, lastTick: 0 } });
  assert.strictEqual(regenPool('moves', T0), 0);
  assert.strictEqual(G.moves.lastTick, T0);
});

test('secondsToFull counts progress already made toward the next tick', () => {
  const G = pools({ moves: { current: 8, max: 10, lastTick: T0 } });
  assert.strictEqual(secondsToFull('moves', T0), 600);            // 2 ticks x 300s
  assert.strictEqual(secondsToFull('moves', T0 + 100 * SEC), 500); // 100s already served
  G.moves.current = 10;
  assert.strictEqual(secondsToFull('moves', T0), 0);              // already full
});

test('an unknown pool is a no-op rather than a crash', () => {
  pools();
  assert.strictEqual(regenPool('nope', T0 + MIN), 0);
});

console.log('\nMoves pool — DOM-70 locked rules pinned as data contracts');

test('starting pool is 10 and regen is 1 per 5 minutes', () => {
  assert.strictEqual(tune('start.moves', TUNE), 10);
  assert.strictEqual(tune('pools.moves.regenSeconds', TUNE), 300);
  assert.strictEqual(tune('pools.moves.regenAmount', TUNE), 1);
});

test('one skill point buys +1 max Moves', () => {
  assert.strictEqual(tune('skills.cost.moves', TUNE), 1);
  assert.strictEqual(tune('skills.grant.moves', TUNE), 1);
});

test('level-up refills the pools', () => {
  assert.strictEqual(tune('progression.levelUpRefillsPools', TUNE), true);
});

test('every job costs Moves from data, and no energy field survives', () => {
  JOBS_DATA.forEach(j => {
    assert.ok(Number.isInteger(j.moves) && j.moves > 0, j.id + ' moves');
    assert.ok(!('energy' in j), j.id + ' still has energy');
  });
});

test('the save has a moves pool and no energy fields (v3 migration output)', () => {
  const { save } = migrate(clone(FIXTURE_V2));
  assert.deepStrictEqual(Object.keys(save.moves).sort(), ['current', 'lastTick', 'max']);
  ['energy', 'maxEnergy', 'lastEnergyTick'].forEach(k => assert.ok(!(k in save), k));
});


console.log('\nStamina pool — DOM-69 locked rules pinned as data contracts');

test('starting pool is 3 and regen is 1 per 3 minutes', () => {
  assert.strictEqual(tune('start.stamina', TUNE), 3);
  assert.strictEqual(tune('pools.stamina.regenSeconds', TUNE), 180);
  assert.strictEqual(tune('pools.stamina.regenAmount', TUNE), 1);
});

test('two skill points buy +1 max Stamina — deliberately the expensive stat', () => {
  assert.strictEqual(tune('skills.cost.stamina', TUNE), 2);
  assert.strictEqual(tune('skills.grant.stamina', TUNE), 1);
  assert.strictEqual(tune('skills.cost.moves', TUNE), 1, 'against 1 for Moves');
  assert.strictEqual(tune('skills.cost.health', TUNE), 1, 'and 1 for Health');
});

test('a fight costs 1, charged once at entry — never in the round loop or refunded', () => {
  assert.strictEqual(tune('combat.staminaPerFight', TUNE), 1);
  // "One charge for the whole battle" is a code shape, not a knob: the single
  // stamina debit sits in startCombat's entry gate; hitEm/runAway/_endFight
  // never touch the pool, and nothing credits it back (no refund on run or
  // defeat). Pin the shape so a refactor that moves the debit fails loudly.
  const src = fs.readFileSync(path.join(ROOT, 'js/combat.js'), 'utf8');
  const debits = src.match(/debit\('stamina'/g) || [];
  assert.strictEqual(debits.length, 1, 'exactly one stamina debit in combat.js');
  assert.ok(src.indexOf("debit('stamina'") < src.indexOf('function hitEm'),
    'the debit comes before the round loop');
  assert.ok(!/credit\('stamina'/.test(src), 'combat.js refunds stamina');
});

test('stamina regen continues while hospitalized; only health pauses (open decision 2)', () => {
  // Ratified 2026-09-12 (Jake): the 30-minute lockout is the punishment — the
  // player walks out with stamina banked and re-engages immediately.
  const G = pools({ hospitalizedUntil: T0 + 30 * MIN });
  assert.strictEqual(regenPool('stamina', T0 + 3 * MIN), 1, 'stamina paused');
  assert.strictEqual(regenPool('moves', T0 + 5 * MIN), 1, 'moves paused');
  assert.strictEqual(regenPool('health', T0 + 3 * MIN), 0, 'health regenned in the Hospital');
});
