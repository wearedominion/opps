// Clout -> level derivation and rank bands.
// Part of the suite; run it all with `node tests/run.js`.

const {
  assert, levelFromClout, cloutToReach, cloutProgress, rankForLevel, TABLE, RANKS, TUNE,
  tune, PER_RANK, test,
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


console.log('\nrank bands');

test('a rank covers exactly levelsPerRank levels', () => {
  assert.strictEqual(PER_RANK, tune('progression.levelsPerRank', TUNE));
  for (let L = 1; L <= 10; L++) assert.strictEqual(rankForLevel(L, RANKS, 10), RANKS[0], 'L' + L);
  for (let L = 11; L <= 20; L++) assert.strictEqual(rankForLevel(L, RANKS, 10), RANKS[1], 'L' + L);
});

test('every band boundary lands on the right name', () => {
  for (let i = 0; i < RANKS.length; i++) {
    assert.strictEqual(rankForLevel(i * 10 + 1, RANKS, 10), RANKS[i], 'first of band ' + i);
    assert.strictEqual(rankForLevel(i * 10 + 10, RANKS, 10), RANKS[i], 'last of band ' + i);
  }
});

test('the top rank absorbs everything above the list', () => {
  // The last name's band starts at level 91 and the cap is 120, so the top rank
  // spans 30 levels rather than 10. Deliberate: 12 names would make every band
  // uniform. Add them to the END of ranks.json — never reorder.
  const top = RANKS[RANKS.length - 1];
  assert.strictEqual(rankForLevel(90, RANKS, 10), RANKS[RANKS.length - 2]);  // band below
  assert.strictEqual(rankForLevel(91, RANKS, 10), top);                      // top band starts
  assert.strictEqual(rankForLevel(120, RANKS, 10), top);                     // and runs to the cap
  assert.strictEqual(RANKS.length * 10, 100);
  assert.strictEqual(TABLE.length, 120);
});

test('the band width is data, not a literal', () => {
  assert.strictEqual(rankForLevel(12, RANKS, 12), RANKS[0]);   // 12-level bands
  assert.strictEqual(rankForLevel(13, RANKS, 12), RANKS[1]);
  assert.strictEqual(rankForLevel(2, RANKS, 1), RANKS[1]);     // 1-level bands = old behaviour
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
