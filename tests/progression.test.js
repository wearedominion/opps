// Clout -> level derivation and rank bands.
// Part of the suite; run it all with `node tests/run.js`.

const {
  assert, levelFromClout, cloutToReach, cloutProgress, rankForLevel, TABLE, RANKS, TUNE,
  tune, MAX_LEVEL, test,
} = require('./harness');

console.log('\nclout -> level derivation');

test('level boundaries match the shipped table', () => {
  assert.strictEqual(levelFromClout(0, TABLE), 1);
  assert.strictEqual(levelFromClout(109, TABLE), 1);
  assert.strictEqual(levelFromClout(110, TABLE), 2);   // first threshold
  assert.strictEqual(levelFromClout(230, TABLE), 2);
  assert.strictEqual(levelFromClout(231, TABLE), 3);
});

test('every level boundary in the table is exact', () => {
  for (let L = 2; L <= 120; L++) {
    const need = cloutToReach(L, TABLE);
    assert.strictEqual(levelFromClout(need, TABLE), L, 'at L' + L);
    assert.strictEqual(levelFromClout(need - 1, TABLE), L - 1, 'just below L' + L);
  }
});

test('lifetime clout for the full table caps at level 120', () => {
  const total = cloutToReach(120, TABLE);
  assert.strictEqual(total, 92707963);
  assert.strictEqual(levelFromClout(total, TABLE), 120);
  assert.strictEqual(levelFromClout(total * 1000, TABLE), 120);   // no overshoot
});

test('negative or missing clout is level 1, not a crash', () => {
  assert.strictEqual(levelFromClout(-50, TABLE), 1);
  assert.strictEqual(levelFromClout(undefined, TABLE), 1);
});

test('a missing table reports level 1 rather than inventing a curve', () => {
  assert.strictEqual(levelFromClout(999999, []), 1);
  assert.strictEqual(levelFromClout(999999, null), 1);
});

test('progress within a level is reported correctly', () => {
  const p = cloutProgress(110 + 50, TABLE);            // 50 into level 2
  assert.strictEqual(p.level, 2);
  assert.strictEqual(p.into, 50);
  assert.strictEqual(p.need, 121);
  assert.strictEqual(p.toNext, 71);
  assert.strictEqual(p.atCap, false);
});

test('at the cap, progress reads as maxed instead of dividing by null', () => {
  const p = cloutProgress(cloutToReach(120, TABLE), TABLE);
  assert.strictEqual(p.level, 120);
  assert.strictEqual(p.atCap, true);
  assert.strictEqual(p.pct, 100);
  assert.strictEqual(p.need, 0);
});


console.log('\nrank titles');

// DOM-124 replaced fixed-width bands with a SPREAD: ranks.json now holds the
// handoff's 100 titles and they are distributed across the 120-level cap, so a
// title lasts one or two levels instead of ten. These four pin the properties
// that make a spread a spread — the old band tests could not survive it, and
// weakening them to "some title comes back" would have pinned nothing.

test('the ends are anchored: level 1 and the cap take the first and last title', () => {
  // The failure this rules out is a mapping that runs out of levels early and
  // leaves the top of the list unreachable, or one that overshoots and clamps a
  // stretch of the end game onto the final title.
  assert.strictEqual(rankForLevel(1, RANKS, MAX_LEVEL), RANKS[0]);
  assert.strictEqual(rankForLevel(MAX_LEVEL, RANKS, MAX_LEVEL), RANKS[RANKS.length - 1]);
  assert.strictEqual(RANKS.length, 100, 'the handoff ships 100 titles');
  assert.strictEqual(MAX_LEVEL, 120);
  assert.strictEqual(TABLE.length, MAX_LEVEL, 'the curve prices every level up to the cap');
});

test('every title is reachable — none is spread past', () => {
  // The point of the change. Under the old 10x10 bands the list ran out at 90
  // and the last name held the remaining 30 levels; a spread has to use all of
  // them, and with 100 titles over 120 levels each one owns one or two.
  const seen = new Set();
  const widths = new Map();
  for (let L = 1; L <= MAX_LEVEL; L++) {
    const title = rankForLevel(L, RANKS, MAX_LEVEL);
    seen.add(title);
    widths.set(title, (widths.get(title) || 0) + 1);
  }
  assert.strictEqual(seen.size, RANKS.length, 'every title is held by some level');
  const spans = Array.from(widths.values());
  assert.strictEqual(Math.min.apply(null, spans), 1);
  assert.strictEqual(Math.max.apply(null, spans), 2, 'no title plateaus');
});

test('titles only ever move forwards', () => {
  // Levelling up must never hand back an earlier title. Guards the arithmetic
  // itself: an off-by-one in the index would show up here before a player saw it.
  let prev = -1;
  for (let L = 1; L <= MAX_LEVEL; L++) {
    const idx = RANKS.indexOf(rankForLevel(L, RANKS, MAX_LEVEL));
    assert.ok(idx >= prev, 'L' + L + ' went backwards in the list');
    prev = idx;
  }
});

test('the cap is data, not a literal', () => {
  // Same list, different cap: the spread has to re-derive rather than assume
  // 120. A hard-coded divisor passes the tests above and fails this one.
  assert.strictEqual(rankForLevel(100, RANKS, 100), RANKS[RANKS.length - 1]);
  assert.strictEqual(rankForLevel(50, RANKS, 100), RANKS[49]);
  assert.strictEqual(rankForLevel(50, RANKS, MAX_LEVEL), RANKS[40]);
});

test('rank degrades to empty rather than undefined when names are missing', () => {
  assert.strictEqual(rankForLevel(5, [], 10), '');
  assert.strictEqual(rankForLevel(5, null, 10), '');
});

test('a junk level still resolves to the first rank', () => {
  assert.strictEqual(rankForLevel(0, RANKS, 10), RANKS[0]);
  assert.strictEqual(rankForLevel(undefined, RANKS, 10), RANKS[0]);
  assert.strictEqual(rankForLevel(-5, RANKS, 10), RANKS[0]);
});
