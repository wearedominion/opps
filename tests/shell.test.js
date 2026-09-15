// Chrome Money v0.2 shell fields (DOM-110).
// Part of the suite; run it all with `node tests/run.js`.

const { assert, migrate, G, FIXTURE, clone, plain, test } = require('./harness');

console.log('\nChrome Money v0.2 shell fields (DOM-110) — additive, defensively read');

test('the G literal carries the v0.2 shell defaults', () => {
  assert.strictEqual(G.soundOn, true);
  assert.strictEqual(G.handle, null);
  assert.strictEqual(G.gold, 0);
  assert.deepStrictEqual(plain(G.supplies), {});
  assert.deepStrictEqual(plain(G.turf), {});
});


test('an older save without the fields keeps the defaults through apply()', () => {
  // GameState.apply is Object.assign(G, saved): a migrated save that predates
  // the fields must not clobber the literal's defaults with undefined.
  const migrated = migrate(clone(FIXTURE)).save;
  assert.strictEqual('soundOn' in migrated, false); // migrations do not invent the field
  const applied = Object.assign(clone(plain(G)), plain(migrated));
  assert.strictEqual(applied.soundOn, true);
  assert.strictEqual(applied.gold, 0);
  assert.strictEqual(applied.handle, null);
  assert.deepStrictEqual(applied.supplies, {});
  assert.deepStrictEqual(applied.turf, {});
});

test('a save that already carries the fields wins over the defaults', () => {
  const saved = Object.assign(plain(migrate(clone(FIXTURE)).save),
                              { soundOn: false, gold: 120, handle: 'BIG WORM' });
  const applied = Object.assign(clone(plain(G)), saved);
  assert.strictEqual(applied.soundOn, false);
  assert.strictEqual(applied.gold, 120);
  assert.strictEqual(applied.handle, 'BIG WORM');
});


// ─────────────────────────────────────────────
//  DOM-123 — JSON-first data files
//
//  Shape tests, not content tests: they pin the contract each consumer screen
//  reads (ids, slot keys, required fields, cross-file references) and assert
//  that a row carrying junk or missing an optional field does not throw. The
//  numbers themselves are placeholders and are free to move.
// ─────────────────────────────────────────────
