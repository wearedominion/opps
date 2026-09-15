// Purchases never bank stats (DOM-120).
// Part of the suite; run it all with `node tests/run.js`.

const {
  fs, path, assert, ROOT, loadLoadout, migrate, SCHEMA_VERSION, G, STORE_DATA, FIXTURE,
  FIXTURE_V2, FIXTURE_V3, clone, plain, test,
} = require('./harness');

// ─────────────────────────────────────────────
//  DOM-120 — FW1: purchases never bank stats
//
//  The migration itself landed under DOM-75 (buyItem stopped banking, stats
//  became derived, MIGRATIONS[4] un-banks legacy saves). These are the checks
//  DOM-120's AC asked for that were never written: migration idempotency, and
//  regression guards so the banking cannot quietly come back.
// ─────────────────────────────────────────────

test('migration is idempotent — an already-migrated save passes through untouched', () => {
  const once = migrate(clone(FIXTURE)).save;
  const twice = migrate(clone(once));
  assert.deepStrictEqual(plain(twice.save), plain(once), 'a second migrate changed the save');
  assert.strictEqual(twice.upgraded, false, 'a current save must not report as upgraded');
  assert.strictEqual(twice.fromFuture, false);
});

test('migration is idempotent for every fixture in the chain', () => {
  for (const [name, fx] of [['v1', FIXTURE], ['v2', FIXTURE_V2], ['v3', FIXTURE_V3]]) {
    const once = migrate(clone(fx)).save;
    const twice = migrate(clone(once));
    assert.deepStrictEqual(plain(twice.save), plain(once), name + ' is not idempotent');
    assert.strictEqual(twice.upgraded, false, name + ' re-reports as upgraded');
  }
});

test('a save from a newer client is refused rather than downgraded', () => {
  const future = clone(FIXTURE);
  future.schemaVersion = SCHEMA_VERSION + 1;
  const { save, fromFuture, upgraded } = migrate(future);
  assert.strictEqual(fromFuture, true);
  assert.strictEqual(upgraded, false);
  assert.strictEqual(save.schemaVersion, SCHEMA_VERSION + 1, 'the save was mutated on the way out');
});

test('buying gear never touches attack or defense', () => {
  // Regression guard for the whole point of FW1: owning is not fielding.
  const src = fs.readFileSync(path.join(ROOT, 'js/store.js'), 'utf8');
  const buy = src.slice(src.indexOf('function buyItem('), src.indexOf('function gearUpgradeCost('));
  assert.ok(buy.length > 100, 'buyItem was not found');
  for (const bad of ['G.attack', 'G.defense', 'G.atk', 'G.def', 'health.max']) {
    assert.ok(!buy.includes(bad), 'buyItem writes ' + bad + ' again — stats must stay derived');
  }
  // it must still take the money and record ownership
  assert.ok(buy.includes("debit('cash'"), 'buyItem stopped charging for the item');
  assert.ok(buy.includes('grantGear('), 'buyItem stopped recording ownership');
});

test('upgrading gear never banks stats either', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/store.js'), 'utf8');
  const up = src.slice(src.indexOf('function upgradeGear('));
  for (const bad of ['G.attack', 'G.defense']) {
    assert.ok(!up.includes(bad), 'upgradeGear writes ' + bad + ' — upgrade gains derive too');
  }
});

test('attack and defense are derived in exactly one place', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/state.js'), 'utf8');
  assert.ok(/function effAttack\(\)\s*\{\s*return G\.attack\s*\+\s*fieldedStats\(\)\.atk/.test(src));
  assert.ok(/function effDefense\(\)\s*\{\s*return G\.defense\s*\+\s*fieldedStats\(\)\.def/.test(src));
  // base stats move only where they are supposed to: the starting grant and
  // level-up grants. Anywhere else is banking creeping back in.
  const files = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js'));
  const writers = [];
  for (const f of files) {
    const body = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
    if (/G\.(attack|defense)\s*(\+=|-=|=[^=])/.test(body)) writers.push(f);
  }
  assert.deepStrictEqual(writers, ['main.js'],
    'base attack/defense are written outside the start + level-up grants: ' + writers.join(', '));
});

test('fielding and benching move derived stats immediately and reversibly', () => {
  // The AC that makes equipping meaningful: the same item can go in and come
  // back out, and the numbers land exactly where they started.
  const S = loadLoadout({
    attack: 10, defense: 5, crewMemberCount: 0,
    inventory: { glock: { level: 0, duplicates: 0, src: 'bought' },
                 vest:  { level: 0, duplicates: 0, src: 'bought' } },
    loadout: {},
  });
  const glock = STORE_DATA.find(i => i.id === 'glock');
  const vest  = STORE_DATA.find(i => i.id === 'vest');

  const baseAtk = S.effAttack(), baseDef = S.effDefense();
  assert.strictEqual(baseAtk, 10, 'an empty loadout is base only');
  assert.strictEqual(baseDef, 5);

  S.G.loadout.weapon = ['glock'];
  S.G.loadout.armor  = ['vest'];
  assert.strictEqual(S.effAttack(), 10 + glock.atk, 'fielding did not raise attack');
  assert.strictEqual(S.effDefense(), 5 + vest.def, 'fielding did not raise defense');

  // bench the weapon only — defense must be untouched
  S.G.loadout.weapon = [];
  assert.strictEqual(S.effAttack(), baseAtk, 'benching the weapon did not restore attack');
  assert.strictEqual(S.effDefense(), 5 + vest.def, 'benching the weapon moved defense');

  // bench everything — back exactly where we started, nothing banked on the way
  S.G.loadout.armor = [];
  assert.strictEqual(S.effAttack(), baseAtk);
  assert.strictEqual(S.effDefense(), baseDef);
  assert.strictEqual(S.G.attack, 10, 'the base stat was mutated by fielding');
  assert.strictEqual(S.G.defense, 5, 'the base stat was mutated by fielding');
});

test('combat settles on derived stats, never on the banked base', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/combat.js'), 'utf8');
  assert.ok(src.includes('effAttack()') && src.includes('effDefense()'),
    'combat stopped reading the derived stats');
  assert.ok(!/G\.attack|G\.defense/.test(src),
    'combat reads the base stat directly, so fielded gear would not count');
});
