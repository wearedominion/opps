// Save migration chain.
// Part of the suite; run it all with `node tests/run.js`.

const {
  assert, levelFromClout, rankForLevel, TABLE, RANKS, MAX_LEVEL, migrate, SCHEMA_VERSION,
  G, FIXTURE, FIXTURE_V2, FIXTURE_V3, clone, plain, test,
} = require('./harness');

console.log('\nsave migration — full chain v1 -> v5');

test('fixture migrates to the current schema version', () => {
  const { save, upgraded, fromFuture } = migrate(clone(FIXTURE));
  assert.strictEqual(save.schemaVersion, SCHEMA_VERSION);
  assert.strictEqual(upgraded, true);
  assert.strictEqual(fromFuture, false);
});

test('golden: a v1 fixture migrates all the way to the exact expected v5 save', () => {
  const save = plain(migrate(clone(FIXTURE)).save);
  // v1 -> v2: level 5 under the v1 curve had cleared 100+160+256+409 = 925,
  //           plus xp remainder 200 plus rep 340 = 1465 clout.
  // v2 -> v3: money -> cash, and the three pools collapse to {current, max, lastTick}.
  // v3 -> v4: inventory array -> per-instance {level, duplicates} map.
  // v4 -> v5: gear un-banks (knife −5 ATK, vest −10 DEF), the loadout seeds
  //           the best owned item per type, `equipped` (placeholder) dies.
  assert.deepStrictEqual(save, {
    schemaVersion: 5,
    level: 5,
    clout: 1465,
    levelGranted: 5,
    cash: 4120,
    moves:   { current: 7,   max: 18,  lastTick: 1757000000000 },
    stamina: { current: 8,   max: 10,  lastTick: 0 },
    health:  { current: 130, max: 160, lastTick: 0 },
    attack: 17, defense: 3,
    inventory: { knife: { level: 0, duplicates: 0, src: 'bought' },
                 vest:  { level: 0, duplicates: 0, src: 'bought' } },
    loadout: { weapon: ['knife'], armor: ['vest'] },
    properties: { corner: 2 },
    jobProgress: { lookout: 10, runner: 4 },
    playerId: 'p_test_0001',
    lastSeen: 1757000000000,
    crewMemberCount: 3,
    // Pre-v3 crew was never owed per-recruit Clout — the migration seeds the
    // high-water mark to the existing count so nothing is back-paid on boot.
    lieutenantsRewarded: 3,
    recruitedBy: null,
    skillPts: 5,
  });
});

test('golden: a v2 fixture produces the exact expected v5 save', () => {
  const save = plain(migrate(clone(FIXTURE_V2)).save);
  assert.deepStrictEqual(save, {
    schemaVersion: 5,
    level: 11,
    clout: 1465,
    levelGranted: 11,
    cash: 8800,
    moves:   { current: 4,  max: 22,  lastTick: 1757199000000 },
    stamina: { current: 2,  max: 6,   lastTick: 0 },
    health:  { current: 90, max: 205, lastTick: 0 },
    // v5 un-banks knife+glock (−20 ATK) and vest (−10 DEF); the loadout takes
    // the best weapon (glock 15 > knife 5) and the only armor.
    attack: 20, defense: 15,
    inventory: { knife: { level: 0, duplicates: 0, src: 'bought' },
                 vest:  { level: 0, duplicates: 0, src: 'bought' },
                 glock: { level: 0, duplicates: 0, src: 'bought' } },
    loadout: { weapon: ['glock'], armor: ['vest'] },
    properties: { corner: 3 },
    jobProgress: { lookout: 10, runner: 8 },
    playerId: 'p_test_0002',
    lastSeen: 1757200000000,
    crewMemberCount: 5,
    lieutenantsRewarded: 5,
    recruitedBy: null,
    skillPts: 35,
  });
});

test('golden: a v3 fixture produces the exact expected v5 save', () => {
  const save = plain(migrate(clone(FIXTURE_V3)).save);
  const expected = clone(FIXTURE_V3);
  expected.schemaVersion = 5;
  // v3 -> v4: every owned id becomes a fresh instance (v5 stamps src).
  expected.inventory = {
    knife: { level: 0, duplicates: 0, src: 'bought' }, vest:  { level: 0, duplicates: 0, src: 'bought' },
    glock: { level: 0, duplicates: 0, src: 'bought' }, bando: { level: 0, duplicates: 0, src: 'bought' },
    mac11: { level: 0, duplicates: 0, src: 'bought' },
  };
  // v4 -> v5 un-banks the shipped stats: knife+glock −20 ATK, vest+bando
  // −30 DEF, bando −10 max HP (mac11 shipped 0/0/0 under the stat-ratio bug).
  expected.attack = 88 - 20;
  expected.defense = 61 - 30;
  expected.health.max = 240 - 10;
  expected.loadout = { weapon: ['glock'], armor: ['vest'], utility: ['bando'] };
  delete expected.equipped;
  assert.deepStrictEqual(save, expected);
});

test('v3 -> v4: an empty inventory array becomes an empty map', () => {
  const { save } = migrate({ schemaVersion: 3, level: 1, clout: 0, inventory: [] });
  assert.deepStrictEqual(plain(save.inventory), {});
  assert.strictEqual(save.schemaVersion, SCHEMA_VERSION);
});

test('v3 -> v4: a junk inventory becomes empty rather than crashing the chain', () => {
  [undefined, null, 'knife', 42, { knife: true }].forEach(junk => {
    const { save } = migrate({ schemaVersion: 3, level: 1, clout: 0, inventory: junk });
    assert.deepStrictEqual(plain(save.inventory), {}, String(junk));
  });
});

test('every legacy field is gone, not just shadowed', () => {
  const { save } = migrate(clone(FIXTURE));
  ['xp', 'xpNext', 'rep', 'money', 'energy', 'maxEnergy', 'lastEnergyTick',
   'maxStamina', 'maxHealth', 'gems'].forEach(k => assert.ok(!(k in save), k + ' still present'));
});

test('the gems balance is destroyed, not converted', () => {
  // No hard currency in v1 of the game. A player holding 250 gems keeps no
  // trace of them — deliberate, and the reason this is a breaking migration.
  assert.strictEqual(FIXTURE_V2.gems, 250);
  const { save } = migrate(clone(FIXTURE_V2));
  assert.ok(!('gems' in save));
  assert.strictEqual(save.cash, FIXTURE_V2.money);   // and cash is untouched by it
});

test('all three pools land on the same shape', () => {
  const { save } = migrate(clone(FIXTURE_V2));
  ['moves', 'stamina', 'health'].forEach(pool => {
    assert.deepStrictEqual(Object.keys(save[pool]).sort(), ['current', 'lastTick', 'max'], pool);
    assert.strictEqual(typeof save[pool].current, 'number', pool + '.current');
    assert.strictEqual(typeof save[pool].max, 'number', pool + '.max');
  });
});

test('only Moves carries a tick forward — the other pools never had one', () => {
  const { save } = migrate(clone(FIXTURE_V2));
  assert.strictEqual(save.moves.lastTick, FIXTURE_V2.lastEnergyTick);
  assert.strictEqual(save.stamina.lastTick, 0);
  assert.strictEqual(save.health.lastTick, 0);
});

test('a save predating a pool field falls back to a frozen default, not tuning', () => {
  // Deliberately NOT tune() — a migration must be pure and content-independent,
  // so it cannot vary with whatever tuning shipped that day.
  const save = plain(migrate({ schemaVersion: 2, level: 1, clout: 0, money: 10 }).save);
  assert.deepStrictEqual(save.stamina, { current: 0, max: 3, lastTick: 0 });
  assert.deepStrictEqual(save.health,  { current: 0, max: 100, lastTick: 0 });
  assert.deepStrictEqual(save.moves,   { current: 0, max: 10, lastTick: 0 });
});

test('migration is deterministic (same input, same output)', () => {
  assert.deepStrictEqual(plain(migrate(clone(FIXTURE)).save), plain(migrate(clone(FIXTURE)).save));
});

test('a level-1 v1 save keeps exactly what it earned', () => {
  const { save } = migrate({ schemaVersion: 1, level: 1, xp: 50, xpNext: 100, rep: 20 });
  assert.strictEqual(save.clout, 70);
  assert.strictEqual(save.levelGranted, 1);
  assert.strictEqual(save.schemaVersion, SCHEMA_VERSION);
});

test('a pre-versioning save (no schemaVersion) runs the whole chain', () => {
  const { save } = migrate({ level: 1, xp: 10, rep: 5 });
  assert.strictEqual(save.schemaVersion, SCHEMA_VERSION);
  assert.strictEqual(save.clout, 15);
  assert.strictEqual(save.cash, 0);
});

test('a save from the future is left untouched and flagged', () => {
  const future = { schemaVersion: SCHEMA_VERSION + 1, clout: 999 };
  const r = migrate(clone(future));
  assert.strictEqual(r.fromFuture, true);
  assert.strictEqual(r.upgraded, false);
  assert.deepStrictEqual(plain(r.save), future);
});

test('a current-version save is not re-migrated', () => {
  const cur = { schemaVersion: SCHEMA_VERSION, clout: 500, level: 4, levelGranted: 4, cash: 1 };
  const r = migrate(clone(cur));
  assert.strictEqual(r.upgraded, false);
  assert.deepStrictEqual(plain(r.save), cur);
});

test('the default G literal is already at the current version and shape', () => {
  assert.strictEqual(G.schemaVersion, SCHEMA_VERSION);
  assert.strictEqual(G.clout, 0);
  assert.strictEqual(G.levelGranted, 1);
  assert.strictEqual(typeof G.cash, 'number');
  ['moves', 'stamina', 'health'].forEach(pool => {
    assert.deepStrictEqual(Object.keys(G[pool]).sort(), ['current', 'lastTick', 'max'], pool);
  });
  ['money', 'energy', 'maxEnergy', 'maxStamina', 'maxHealth', 'gems', 'xp', 'rep']
    .forEach(k => assert.ok(!(k in G), k + ' still in the G literal'));
});


console.log('\nmigrated players land where the new curve puts them');

test('the fixture player moves from level 5 to level 9', () => {
  const { save } = migrate(clone(FIXTURE));
  assert.strictEqual(save.level, 5);                        // migration does not re-derive
  assert.strictEqual(levelFromClout(save.clout, TABLE), 9); // syncLevel() does, on load
});

test('and its rank title moves with it, because titles are ~1.2 levels wide', () => {
  // This USED to assert the opposite: under 10-level bands the fixture's 5 -> 9
  // move stayed inside the first band and the title never changed. DOM-124
  // spread 100 titles over 120 levels, so a four-level move is now three
  // titles. Worth pinning rather than deleting: it is the visible consequence
  // of the ruling, and the thing a player would notice on their next load.
  assert.strictEqual(rankForLevel(5, RANKS, MAX_LEVEL), RANKS[3]);
  assert.strictEqual(rankForLevel(9, RANKS, MAX_LEVEL), RANKS[6]);
  assert.notStrictEqual(rankForLevel(5, RANKS, MAX_LEVEL), rankForLevel(9, RANKS, MAX_LEVEL));
});
