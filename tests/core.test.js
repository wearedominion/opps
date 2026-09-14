// Golden-file test for the save migration chain and the Clout -> level
// derivation. Required by docs/specs/04-game-data-spec.md §7.4.
//
// No test runner in this repo yet, so this is a plain Node script:
//   node tests/core.test.js
// Exits non-zero on the first failure. Move it into a runner when one is adopted.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const { levelFromClout, cloutToReach, cloutProgress, rankForLevel } = require(path.join(ROOT, 'js/progression.js'));
const TABLE = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/progression.json'))).levels;
const RANKS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/ranks.json'), 'utf8'));
const TUNE  = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/tuning.json'), 'utf8'));
const { tune, missingTuningPaths, TUNING_REQUIRED } = require(path.join(ROOT, 'js/tuning.js'));
const PER_RANK = TUNE.progression.levelsPerRank;

// state.js is a plain script, not a module — run it in a sandbox and export the
// bindings we need. Top-level const/let live in the context's lexical scope, so
// they have to be handed out explicitly.
function loadState() {
  const src = fs.readFileSync(path.join(ROOT, 'js/state.js'), 'utf8')
    + '\n;globalThis.__t = { migrate, SCHEMA_VERSION, MIGRATIONS, G };';
  const ctx = { console, Date, JSON, Object, Math };
  vm.runInNewContext(src, ctx);
  return ctx.__t;
}

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { console.error('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; }
}

const { migrate, SCHEMA_VERSION, G } = loadState();
const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/save-v1.json'), 'utf8'));
const FIXTURE_V2 = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/save-v2.json'), 'utf8'));
const FIXTURE_V3 = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/save-v3.json'), 'utf8'));
const clone = o => JSON.parse(JSON.stringify(o));
// state.js runs in a vm context, so objects the migration CREATES carry that
// realm's Object.prototype and deepStrictEqual rejects them as not
// reference-equal. Round-tripping through JSON normalises the prototype without
// loosening value comparison.
const plain = o => JSON.parse(JSON.stringify(o));

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

console.log('\ntuning access');

test('every path game logic requires is present in tuning.json', () => {
  assert.deepStrictEqual(missingTuningPaths(TUNE), []);
});

test('tune() reads nested paths', () => {
  assert.strictEqual(tune('loot.defeatLossRate', TUNE), 0.10);
  assert.strictEqual(tune('progression.skillPointsPerLevel', TUNE), 5);
  assert.strictEqual(tune('combat.roundDamageShare', TUNE), 0.25);
});

test('tune() returns an explicit null rather than treating it as missing', () => {
  assert.strictEqual(tune('gear.maxUpgradeLevel', TUNE), null);
});

test('tune() throws on a missing path instead of returning a default', () => {
  // The whole point: a silent fallback becomes the balance the first time a path
  // is renamed, and nobody finds out until the numbers are wrong in production.
  assert.throws(() => tune('loot.nope', TUNE), /no value at "loot.nope"/);
  assert.throws(() => tune('nope.at.all', TUNE), /no value at/);
});

test('tune() throws when the file never loaded', () => {
  assert.throws(() => tune('loot.burnRate', null), /not loaded/);
});

test('a broken tuning file is reported path by path, not as one failure', () => {
  const broken = JSON.parse(JSON.stringify(TUNE));
  delete broken.loot;
  delete broken.skills.cost;
  const missing = missingTuningPaths(broken);
  assert.ok(missing.includes('loot.defeatLossRate'));
  assert.ok(missing.includes('skills.cost.moves'));
  assert.ok(!missing.includes('progression.maxLevel'));
});

test('an absent tuning file reports every required path', () => {
  assert.strictEqual(missingTuningPaths(null).length, TUNING_REQUIRED.length);
});

test('the defeat loss rate is a proportion, and there is no burn to configure', () => {
  const rate = tune('loot.defeatLossRate', TUNE);
  assert.ok(rate > 0 && rate <= 1, 'defeatLossRate must be a proportion');
  // Fights settle against a snapshot, so no Cash moves between wallets and there
  // is nothing to skim. burnRate belonged to the transfer model and is gone.
  assert.throws(() => tune('loot.burnRate', TUNE), /no value at/);
});

console.log('\ncurve evaluation');

const { evalCurve } = require(path.join(ROOT, 'js/tuning.js'));

test('all four curve shapes evaluate', () => {
  assert.strictEqual(evalCurve({ type: 'constant', value: 5 }, 9), 5);
  assert.strictEqual(evalCurve({ type: 'linear', base: 3600, step: 600 }, 5), 6000);
  assert.strictEqual(evalCurve({ type: 'geometric', base: 105, ratio: 1.05 }, 1), 105);
  assert.strictEqual(evalCurve({ type: 'table', values: [1, 2, 3] }, 2), 2);
});

test('curves are 1-indexed, and that is what matches the shipped table', () => {
  // The generating curve is documentation (data/README.md), not a tuning key —
  // data/progression.json is the single authority. This literal pins the
  // 1-indexing convention against the table it generated.
  const c = { type: 'geometric', base: 110, ratio: 1.1 };
  const bad = TABLE.filter(e => e.cloutToNext !== null && evalCurve(c, e.level) !== e.cloutToNext);
  assert.strictEqual(bad.length, 0, 'all 120 rows must reproduce');
  // base is the value AT level 1, not the value before it
  assert.strictEqual(evalCurve(c, 1), TABLE[0].cloutToNext);
});

test('a table curve clamps to its last entry instead of going undefined', () => {
  assert.strictEqual(evalCurve({ type: 'table', values: [10, 20] }, 99), 20);
});

test('scaleBy multiplies by the caller-supplied value and demands one', () => {
  const c = { type: 'geometric', base: 1, ratio: 1.6, scaleBy: 'itemPrice' };
  assert.strictEqual(evalCurve(c, 3, 200), 512);
  assert.throws(() => evalCurve(c, 3), /needs a scale argument/);
});

test('an unknown or malformed curve throws rather than returning NaN', () => {
  assert.throws(() => evalCurve({ type: 'wat' }, 1), /unknown curve type/);
  assert.throws(() => evalCurve(null, 1), /not a curve object/);
  assert.throws(() => evalCurve({ type: 'table', values: [] }, 1), /no values/);
});

console.log('\nunlock gates');

const UNLOCKS_DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/unlocks.json'), 'utf8'));
global.UNLOCKS = UNLOCKS_DATA;
global.evalCurve = evalCurve;
const { requiredLevel, isUnlocked, lockLabel, capabilityAt } =
  require(path.join(ROOT, 'js/unlocks.js'));
const JOBS_DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/jobs.json'), 'utf8'));
const ENEMIES_DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/enemies.json'), 'utf8'));

test('content without a levelReq is available from level 1', () => {
  assert.strictEqual(requiredLevel({}), 1);
  assert.strictEqual(isUnlocked({}, 1), true);
});

test('the gate opens exactly at the required level', () => {
  const job = { levelReq: 7 };
  assert.strictEqual(isUnlocked(job, 6), false);
  assert.strictEqual(isUnlocked(job, 7), true);
  assert.strictEqual(isUnlocked(job, 8), true);
});

test('lock copy is written in one place and is empty once unlocked', () => {
  assert.strictEqual(lockLabel({ levelReq: 5 }, 4), 'REQUIRES LEVEL 5');
  assert.strictEqual(lockLabel({ levelReq: 5 }, 5), '');
});

test('jobs and enemies use the same field name, so one gate serves both', () => {
  // They did not: enemies carried `lvlReq` and jobs `levelReq`, one concept with
  // two names, which is what forced five separate comparisons in the first place.
  JOBS_DATA.forEach(j => assert.ok('levelReq' in j, j.id));
  ENEMIES_DATA.forEach(e => {
    assert.ok('levelReq' in e, e.id);
    assert.ok(!('lvlReq' in e), e.id + ' still has lvlReq');
  });
});

test('capability gates evaluate their curve at the given level', () => {
  const c = UNLOCKS_DATA.capabilities.spotOfflineCapSeconds;
  assert.strictEqual(capabilityAt('spotOfflineCapSeconds', 1), evalCurve(c, 1));
  assert.strictEqual(capabilityAt('spotOfflineCapSeconds', 10), evalCurve(c, 10));
  assert.ok(capabilityAt('spotOfflineCapSeconds', 10) > capabilityAt('spotOfflineCapSeconds', 1));
});

test('an unknown capability throws instead of silently gating nothing', () => {
  assert.throws(() => capabilityAt('nope', 1), /no capability "nope"/);
});

console.log('\nledger');

const L = require(path.join(ROOT, 'js/ledger.js'));
global.credit = L.credit; global.debit = L.debit; global.REASON = L.REASON;

function wallet(over) {
  L.ledgerClear();
  global.G = {
    cash: 1000, clout: 0, skillPts: 0,
    moves:   { current: 5, max: 10, lastTick: 0 },
    stamina: { current: 1, max: 3,  lastTick: 0 },
    health:  { current: 50, max: 100, lastTick: 0 },
  };
  Object.assign(global.G, over || {});
  return global.G;
}

test('a balance change writes exactly one row carrying the resulting balance', () => {
  const G = wallet();
  const applied = L.debit('cash', 250, L.REASON.GEAR_BUY, { ref: { itemId: 'knife' } });
  assert.strictEqual(applied, -250);
  assert.strictEqual(G.cash, 750);
  const rows = L.ledgerRows();
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].resource, 'cash');
  assert.strictEqual(rows[0].delta, -250);
  assert.strictEqual(rows[0].balanceAfter, 750);
  assert.strictEqual(rows[0].reason, 'gear_buy');
  assert.deepStrictEqual(rows[0].ref, { itemId: 'knife' });
});

test('pools are written through their `current`, and clamp to max', () => {
  const G = wallet();
  const applied = L.credit('moves', 99, L.REASON.REGEN);
  assert.strictEqual(applied, 5, 'only the room that existed');
  assert.strictEqual(G.moves.current, 10);
  assert.strictEqual(L.ledgerRows()[0].balanceAfter, 10);
});

test('cash cannot go negative', () => {
  const G = wallet({ cash: 100 });
  const applied = L.debit('cash', 500, L.REASON.GEAR_BUY);
  assert.strictEqual(applied, -100);
  assert.strictEqual(G.cash, 0);
});

test('clout cannot be debited, at all', () => {
  // It is progression, not a currency. Nothing in the game may take it back, and
  // a bug that tries should be loud rather than quietly rewriting a player's level.
  wallet();
  assert.throws(() => L.debit('clout', 10, L.REASON.ADMIN_ADJUST), /clout cannot be debited/);
  assert.throws(() => L.applyDelta('clout', -1, L.REASON.ADMIN_ADJUST), /clout cannot be debited/);
});

test('an unknown resource or reason code throws', () => {
  wallet();
  assert.throws(() => L.credit('gems', 5, L.REASON.IAP_GRANT), /unknown resource/);
  assert.throws(() => L.credit('cash', 5, 'free_money'), /unknown reason code/);
});

test('every reason code in the enum is a usable string', () => {
  wallet();
  L.REASON_CODES.forEach(code => {
    assert.strictEqual(typeof code, 'string');
    assert.doesNotThrow(() => L.credit('cash', 1, code), code);
  });
});

test('an idempotency key applies once, however many times it is replayed', () => {
  const G = wallet();
  const key = 'fight:abc123';
  L.debit('cash', 100, L.REASON.FIGHT_DEFEAT_LOSS, { idem: key });
  const second = L.debit('cash', 100, L.REASON.FIGHT_DEFEAT_LOSS, { idem: key });
  const third  = L.debit('cash', 100, L.REASON.FIGHT_DEFEAT_LOSS, { idem: key });
  assert.strictEqual(second, 0);
  assert.strictEqual(third, 0);
  assert.strictEqual(G.cash, 900, 'debited once, not three times');
  assert.strictEqual(L.ledgerRows().length, 1, 'and only one row');
});

test('a no-op writes no row at all', () => {
  const G = wallet({ moves: { current: 10, max: 10, lastTick: 0 } });
  assert.strictEqual(L.credit('moves', 5, L.REASON.REGEN), 0, 'fully clamped');
  assert.strictEqual(L.credit('moves', 0, L.REASON.LEVEL_UP_GRANT), 0, 'genuine zero');
  assert.strictEqual(L.ledgerRows().length, 0, 'nothing moved, so nothing to record');
  // "refill a pool that is already full" fires on every level-up and would
  // otherwise write a zero row for each pool that happened to be topped up.
});

test('the buffer is bounded and drops the oldest rows', () => {
  wallet({ cash: 0 });
  for (let i = 0; i < L.LEDGER_MAX_ROWS + 50; i++) L.credit('cash', 1, L.REASON.MOVE_PAYOUT);
  const rows = L.ledgerRows();
  assert.strictEqual(rows.length, L.LEDGER_MAX_ROWS);
  assert.strictEqual(rows[rows.length - 1].balanceAfter, L.LEDGER_MAX_ROWS + 50);
  assert.ok(rows[0].id > 1, 'oldest rows were dropped, not the newest');
});

test('the summary separates faucets from drains, per resource and per reason', () => {
  wallet({ cash: 0 });
  L.credit('cash', 300, L.REASON.MOVE_PAYOUT);
  L.credit('cash', 200, L.REASON.SPOT_COLLECT);
  L.debit('cash', 120, L.REASON.GEAR_BUY);
  const s = L.ledgerSummary('cash').cash;
  assert.strictEqual(s.credits, 500);
  assert.strictEqual(s.debits, 120);
  assert.strictEqual(s.net, 380);
  assert.strictEqual(s.byReason.move_payout, 300);
  assert.strictEqual(s.byReason.gear_buy, -120);
  assert.strictEqual(global.G.cash, 380, 'and the summary agrees with the wallet');
});

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

console.log('\nfight math — DOM-72 round model');

const FM = require(path.join(ROOT, 'js/fightmath.js'));
const STORE_DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/store.json'), 'utf8'));
const FIGHT_CFG = {
  roundDamageShare: tune('combat.roundDamageShare', TUNE),
  damageSpread: tune('combat.damageSpread', TUNE),
  firstStrikeEdge: tune('combat.firstStrikeEdge', TUNE),
  baseHp: tune('start.health', TUNE),
};
// The generator's expected-loadout formula, mirrored (DOM-75): start stats +
// the best item PER TYPE at or below the band, upgrades at level 0 — the
// zero-crew one-slot-per-type baseline the enemies are solved against.
function loadoutAt(band) {
  const best = {};
  for (const i of STORE_DATA) {
    if (i.levelReq > band) continue;
    if (!best[i.type] || i.atk + i.def > best[i.type].atk + best[i.type].def) best[i.type] = i;
  }
  const picks = Object.keys(best).map(t => best[t]);
  return {
    atk: tune('start.attack', TUNE) + picks.reduce((s, i) => s + i.atk, 0),
    def: tune('start.defense', TUNE) + picks.reduce((s, i) => s + i.def, 0),
    hp: tune('start.health', TUNE),
  };
}

test('damage ratio is 1 at parity and stays inside (0, 2)', () => {
  assert.strictEqual(FM.fmRatio(10, 10), 1);
  assert.ok(FM.fmRatio(1, 1000) > 0);
  assert.ok(FM.fmRatio(1000, 1) < 2);
});

test('a killed enemy never counterattacks (sequential rounds)', () => {
  // spread 0 makes it deterministic: parity damage kills the enemy on round 4
  // (28 + 25 + 25 + 25), and the enemy's counters are the 1-damage floor. The
  // player takes exactly rounds − 1 counters — the dying blow never lands.
  const cfg = Object.assign({}, FIGHT_CFG, { damageSpread: 0 });
  const f = FM.fmFight({ atk: 10000, def: 10000, hp: 100 },
                       { atk: 100, def: 10000, maxHp: 100 }, cfg, FM.fmSeededRng(1));
  assert.strictEqual(f.win, true);
  assert.strictEqual(f.rounds, 4);
  assert.strictEqual(f.playerHpLoss, f.rounds - 1, 'the dying blow landed');
});

test('generated enemies sit near the pricing nominal at their bands (L10/50/110)', () => {
  [10, 50, 110].forEach(band => {
    const e = ENEMIES_DATA.filter(x => x.levelReq <= band).slice(-1)[0];
    const st = FM.fmStats(loadoutAt(band), { atk: e.atk, def: e.def, maxHp: e.hp },
                          FIGHT_CFG, 3000, FM.fmSeededRng(42 + band));
    assert.ok(st.pWin > 0.38 && st.pWin < 0.62,
      'L' + band + ' vs ' + e.id + ' pWin ' + st.pWin.toFixed(3));
  });
});

test('the tank build works: more max Health, more wins', () => {
  const band = 50;
  const e = ENEMIES_DATA.filter(x => x.levelReq <= band).slice(-1)[0];
  const enemy = { atk: e.atk, def: e.def, maxHp: e.hp };
  const base = loadoutAt(band);
  const tank = Object.assign({}, base, { hp: base.hp * 2 });
  const pBase = FM.fmStats(base, enemy, FIGHT_CFG, 4000, FM.fmSeededRng(7)).pWin;
  const pTank = FM.fmStats(tank, enemy, FIGHT_CFG, 4000, FM.fmSeededRng(7)).pWin;
  assert.ok(pTank > pBase + 0.05, 'tank ' + pTank.toFixed(3) + ' vs base ' + pBase.toFixed(3));
});

test('the G literal carries hospitalizedUntil: null (08 §3 single-field shape)', () => {
  assert.strictEqual(G.hospitalizedUntil, null);
});

test('level-up releases from the Hospital in the refill transaction (DOM-82)', () => {
  // applyLevelGrants lives in main.js, which runs init() on load — extract
  // just the function and run it against a hospitalized G in a sandbox.
  const mainSrc = fs.readFileSync(path.join(ROOT, 'js/main.js'), 'utf8');
  const fn = mainSrc.match(/function applyLevelGrants\(\) \{[\s\S]*?\n\}/);
  assert.ok(fn, 'applyLevelGrants not found in main.js');
  const sandbox = {
    console, Math, Object,
    G: {
      level: 5, skillPts: 0, hospitalizedUntil: 9999999999999,
      moves:   { current: 0, max: 10,  lastTick: 0 },
      stamina: { current: 0, max: 3,   lastTick: 0 },
      health:  { current: 0, max: 100, lastTick: 0 },
      attack: 10, defense: 5,
    },
    tune: p => tune(p, TUNE),
    credit: (res, amt) => {
      const G = sandbox.G;
      if (res === 'skillPts') { G.skillPts += amt; return amt; }
      const applied = Math.min(amt, G[res].max - G[res].current);
      G[res].current += applied;
      return applied;
    },
    REASON: { LEVEL_UP_GRANT: 'level_up_grant' },
  };
  vm.runInNewContext(fn[0] + '; applyLevelGrants();', sandbox);
  assert.strictEqual(sandbox.G.hospitalizedUntil, null, 'still hospitalized');
  // Pools refill to their (possibly grown) max — the release and the refill
  // are one transaction, never one without the other.
  assert.strictEqual(sandbox.G.health.current, sandbox.G.health.max, 'health not refilled');
  assert.strictEqual(sandbox.G.moves.current, sandbox.G.moves.max);
  assert.strictEqual(sandbox.G.stamina.current, sandbox.G.stamina.max);
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

console.log('\nCrew, capacity & loadout — DOM-75 locked rules');

// state.js in a vm with real tuning + the live catalog: the loadout layer under test.
function loadLoadout(over) {
  const ctx = {
    console, JSON, Object, Math, Date,
    tune: p => tune(p, TUNE),
    STORE_ITEMS: STORE_DATA,
  };
  ctx.globalThis = ctx;
  const src = fs.readFileSync(path.join(ROOT, 'js/state.js'), 'utf8')
    + '\n;globalThis.__s = { G, slotCapacity, gearItemStats, fieldedGear, fieldedStats,'
    + ' effAttack, effDefense, autoFieldGear, grantGear };';
  vm.runInNewContext(src, ctx);
  const S = ctx.__s;
  Object.assign(S.G, over || {});
  return S;
}

test('the crew knobs are the ratified rule: 5 per slot, weapon→armor→vehicle, cap +3', () => {
  assert.strictEqual(tune('crew.lieutenantsPerSlot', TUNE), 5);
  assert.deepStrictEqual(tune('crew.slotRotation', TUNE), ['weapon', 'armor', 'vehicle']);
  assert.strictEqual(tune('crew.maxBonusSlotsPerType', TUNE), 3);
  assert.strictEqual(tune('crew.cloutPerRecruit', TUNE), 250);
});

test('the flat per-Lieutenant ATK/DEF bonus is retired (ratified 2026-09-13)', () => {
  assert.ok(!('attackPerLieutenant' in TUNE.crew) && !('defensePerLieutenant' in TUNE.crew),
    'the unbounded stat faucet is back');
  const crewSrc = fs.readFileSync(path.join(ROOT, 'js/crew.js'), 'utf8');
  assert.ok(!/getBonus/.test(crewSrc), 'crew.js still carries the stat bonus');
});

test('slot capacity: 1 per type base, +1 per 5 Lieutenants round-robin, capped at +3', () => {
  const capAt = (n, type) => loadLoadout({ crewMemberCount: n }).slotCapacity(type);
  assert.deepStrictEqual([0, 5, 10, 15, 20, 45, 200].map(n => capAt(n, 'weapon')),
    [1, 2, 2, 2, 3, 4, 4]);
  assert.deepStrictEqual([0, 5, 10, 15, 25, 45].map(n => capAt(n, 'armor')),
    [1, 1, 2, 2, 3, 4]);
  assert.deepStrictEqual([0, 10, 15, 30, 45].map(n => capAt(n, 'vehicle')),
    [1, 1, 2, 3, 4]);
  // utility sits outside the rotation: always the base slot
  assert.deepStrictEqual([0, 45, 500].map(n => capAt(n, 'utility')), [1, 1, 1]);
});

test('combat stats derive from the fielded loadout — owning is not fielding', () => {
  const S = loadLoadout({
    attack: 10, defense: 5, crewMemberCount: 0,
    inventory: { glock: { level: 0, duplicates: 0, src: 'bought' },
                 knife: { level: 12, duplicates: 0, src: 'bought' },
                 vest:  { level: 0, duplicates: 0, src: 'bought' } },
    loadout: { weapon: ['glock'] },
  });
  const glock = STORE_DATA.find(i => i.id === 'glock');
  assert.strictEqual(S.effAttack(), 10 + glock.atk, 'only the fielded weapon counts');
  assert.strictEqual(S.effDefense(), 5, 'owned-but-benched vest adds nothing');
});

test('upgrade gains derive per instance, capped at the stat cap', () => {
  const S = loadLoadout({});
  const knife = STORE_DATA.find(i => i.id === 'knife');
  const st = S.gearItemStats(knife, { level: 12 });
  const cap = tune('gear.statCapLevel', TUNE);
  const gain = tune('gear.statGainPerLevel', TUNE);
  assert.strictEqual(st.atk, knife.atk + cap * gain.attack, 'level 12 pays like level 10');
  assert.strictEqual(st.def, knife.def + cap * gain.defense);
});

test('capacity gates the loadout: a second weapon only counts with the Crew slot', () => {
  const base = {
    attack: 10, defense: 5,
    inventory: { glock: { level: 0, duplicates: 0, src: 'bought' },
                 knife: { level: 0, duplicates: 0, src: 'bought' } },
    loadout: { weapon: ['glock', 'knife'] },
  };
  const glock = STORE_DATA.find(i => i.id === 'glock');
  const knife = STORE_DATA.find(i => i.id === 'knife');
  const solo = loadLoadout(Object.assign({ crewMemberCount: 0 }, JSON.parse(JSON.stringify(base))));
  assert.strictEqual(solo.effAttack(), 10 + glock.atk, 'over-capacity secondary leaked into combat');
  const crewed = loadLoadout(Object.assign({ crewMemberCount: 5 }, JSON.parse(JSON.stringify(base))));
  assert.strictEqual(crewed.effAttack(), 10 + glock.atk + knife.atk, '5 Lieutenants = the weapon slot');
});

test('autoFieldGear fills an open slot and refuses when the type is full', () => {
  const S = loadLoadout({
    crewMemberCount: 0,
    inventory: { glock: { level: 0, duplicates: 0, src: 'bought' },
                 knife: { level: 0, duplicates: 0, src: 'bought' } },
    loadout: {},
  });
  assert.strictEqual(S.autoFieldGear('glock'), true);
  assert.strictEqual(S.autoFieldGear('glock'), true, 'already fielded reports success');
  assert.strictEqual(S.autoFieldGear('knife'), false, 'no free weapon slot at zero crew');
  assert.deepStrictEqual(plain(S.G.loadout.weapon), ['glock']);
});

test('nothing banks gear stats any more (code shape)', () => {
  const storeSrc = fs.readFileSync(path.join(ROOT, 'js/store.js'), 'utf8');
  assert.ok(!/G\.(attack|defense)\s*\+=/.test(storeSrc), 'store.js banks stats');
  assert.ok(!/G\.health\.max\s*\+=/.test(storeSrc), 'store.js banks max HP');
  const combatSrc = fs.readFileSync(path.join(ROOT, 'js/combat.js'), 'utf8');
  assert.ok(/atk:\s*effAttack\(\),\s*def:\s*effDefense\(\)/.test(combatSrc),
    'combat does not read the derived stats');
});

test('the combat snapshot freezes stats + loadout with CP = A × (H + D) at fight entry', () => {
  const combatSrc = fs.readFileSync(path.join(ROOT, 'js/combat.js'), 'utf8');
  const writes = combatSrc.match(/G\.combatSnapshot\s*=/g) || [];
  assert.strictEqual(writes.length, 1, 'exactly one snapshot write, at entry');
  assert.ok(combatSrc.indexOf('G.combatSnapshot') < combatSrc.indexOf('function hitEm'),
    'snapshot is written at entry, not mid-fight');
  assert.ok(/cp:\s*pf\.atk\s*\*\s*\(pf\.hp\s*\+\s*pf\.def\)/.test(combatSrc), 'the CP proxy formula');
});

test('acquisition source lands on the instance: bought vs dropped', () => {
  const storeSrc = fs.readFileSync(path.join(ROOT, 'js/store.js'), 'utf8');
  const jobsSrc = fs.readFileSync(path.join(ROOT, 'js/jobs.js'), 'utf8');
  assert.ok(/grantGear\([^)]+,\s*'bought'\)/.test(storeSrc), 'purchases are not tagged');
  assert.ok(/grantGear\([^)]+,\s*'dropped'\)/.test(jobsSrc), 'drops are not tagged');
});

test('the catalog has real stats and no HP items (stat-ratio fix + bando fold)', () => {
  assert.ok(STORE_DATA.every(i => i.hp === 0), 'fielded-gear HP has no pool plumbing');
  const ladder = STORE_DATA.filter(i => i.levelReq >= 10);
  assert.ok(ladder.every(i => i.atk + i.def > 0),
    'the zero-stat gear ladder is back (gen-catalog STAT_RATIO_PER_10)');
});

test('the public Profile exposes the loadout, never raw stats (DOM-75 acceptance)', () => {
  const profileSrc = fs.readFileSync(path.join(ROOT, 'js/profile.js'), 'utf8');
  const fn = profileSrc.match(/function pfPublicProjection[\s\S]*?\n\}/);
  assert.ok(fn, 'pfPublicProjection not found');
  const ctx = {
    console, JSON, Object, Math,
    STORE_ITEMS: STORE_DATA,
    tune: p => tune(p, TUNE),
    rankForLevel: () => 'SOLDIER',
    G: {},
  };
  ctx.globalThis = ctx;
  vm.runInNewContext(fn[0]
    + '\nfunction pfFindItem(id){return STORE_ITEMS.find(i=>i.id===id)||null;}'
    + '\nfunction pfTierLabel(it){const t=it.tier||1;return t<=4?"COMMON":t<=8?"RARE":t<=12?"ELITE":"LEGEND";}'
    + '\nglobalThis.__proj = pfPublicProjection;', ctx);
  const pub = ctx.__proj({
    handle: 'OPP', level: 12, clout: 5000,
    attack: 40, defense: 30, cash: 99999, skillPts: 9,
    health: { current: 10, max: 100 },
    inventory: { glock: { level: 3, duplicates: 0, src: 'bought' } },
    loadout: { weapon: ['glock'] },
    combatSnapshot: { cp: 123456 },
  });
  assert.deepStrictEqual(Object.keys(pub).sort(), ['clout', 'gear', 'handle', 'level', 'rank']);
  assert.deepStrictEqual(plain(pub.gear), [{ type: 'weapon', slot: 0, name: 'Glock 19', tier: 'COMMON', level: 3 }]);
});

console.log('\nPlug quests — DOM-90 one-shot bonus contract');

const QUESTS_DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/quests.json'), 'utf8'));
const TARGETS_DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/econ-sim/targets.json'), 'utf8'));
const MOVES_PER_HOUR_T = 3600 / tune('pools.moves.regenSeconds', TUNE) * tune('pools.moves.regenAmount', TUNE);

test('the quest catalog: one per plug, unique, gate-ordered, every step reachable at its gate', () => {
  assert.strictEqual(QUESTS_DATA.length, 5);
  assert.strictEqual(new Set(QUESTS_DATA.map(q => q.id)).size, 5);
  assert.strictEqual(new Set(QUESTS_DATA.map(q => q.plug)).size, 5, 'one quest per plug in v1');
  const plugsSrc = fs.readFileSync(path.join(ROOT, 'js/plugs.js'), 'utf8');
  QUESTS_DATA.forEach(q => {
    assert.ok(plugsSrc.includes("'" + q.plug + "'"), q.id + ' names an unknown plug ' + q.plug);
    assert.ok(q.reward.cash > 0 && q.reward.clout > 0, q.id + ' has an empty reward');
    q.steps.forEach(s => {
      const pool = s.type === 'job' ? JOBS_DATA : s.type === 'fight' ? ENEMIES_DATA : STORE_DATA;
      const row = pool.find(r => r.id === s.id);
      assert.ok(row, q.id + ' step references unknown ' + s.type + ' ' + s.id);
      assert.ok(row.levelReq <= q.levelReq,
        q.id + ' (L' + q.levelReq + ') needs ' + s.id + ' gated at L' + row.levelReq);
      if (s.type !== 'item') assert.ok(s.count >= 1);
    });
    if (q.reward.item) assert.ok(STORE_DATA.find(i => i.id === q.reward.item), q.id + ' rewards unknown item');
  });
  const gates = QUESTS_DATA.map(q => q.levelReq);
  assert.deepStrictEqual(gates, [...gates].sort((a, b) => a - b));
});

test('the bonus rule holds: hours × best-job income at the gate, bounded by the break-even anchor', () => {
  const jobRate = L => Math.max(...JOBS_DATA.filter(j => j.levelReq <= L)
    .map(j => (j.cash[0] + j.cash[1]) / 2 / j.moves)) * MOVES_PER_HOUR_T;
  const jobCpm = L => Math.max(...JOBS_DATA.filter(j => j.levelReq <= L).map(j => j.clout / j.moves));
  QUESTS_DATA.forEach(q => {
    const rule = q.hours * jobRate(q.levelReq);
    assert.ok(Math.abs(q.reward.cash - rule) / rule <= 0.05,
      q.id + ' cash $' + q.reward.cash + ' vs rule $' + Math.round(rule));
    assert.strictEqual(q.reward.clout,
      Math.max(1, Math.round(q.hours * jobCpm(q.levelReq) * MOVES_PER_HOUR_T)), q.id + ' clout');
    // A quest bonus must never reach the fight break-even anchor's scale —
    // that is what "does not obsolete the Moves ladder" means in hours.
    assert.ok(q.hours < TARGETS_DATA.breakEven.hoursOfJobIncome,
      q.id + ' bonus (' + q.hours + 'h) rivals the ' + TARGETS_DATA.breakEven.hoursOfJobIncome + 'h anchor');
  });
});

test('quest_reward is a registered ledger reason and both hooks are wired (code shape)', () => {
  const ledgerSrc = fs.readFileSync(path.join(ROOT, 'js/ledger.js'), 'utf8');
  assert.ok(/QUEST_REWARD:\s*'quest_reward'/.test(ledgerSrc));
  const jobsSrc = fs.readFileSync(path.join(ROOT, 'js/jobs.js'), 'utf8');
  assert.ok(/Quests\.onJob\(job\.id\)/.test(jobsSrc), 'doJob does not feed quest counters');
  const combatSrc = fs.readFileSync(path.join(ROOT, 'js/combat.js'), 'utf8');
  const winBlock = combatSrc.slice(combatSrc.indexOf('if (enemyDead)'), combatSrc.indexOf('} else {'));
  assert.ok(/Quests\.onFightWin\(enemy\.id\)/.test(winBlock), 'fight WIN does not feed quest counters');
});

// state.js + quests.js in one vm: the tracking/claim layer under test.
function loadQuests(over) {
  const rows = [];
  const ctx = {
    console, JSON, Object, Math, Array, Date,
    QUESTS: QUESTS_DATA,
    STORE_ITEMS: STORE_DATA,
    tune: p => tune(p, TUNE),
    REASON: { QUEST_REWARD: 'quest_reward' },
    credit: (pool, amt, reason, meta) => { rows.push({ pool, amt, reason, questId: meta && meta.ref && meta.ref.questId }); return amt; },
    addClout: (amt, reason, meta) => { rows.push({ pool: 'clout', amt, reason, questId: meta && meta.questId }); },
    toast: () => {}, log: () => {}, updateHUD: () => {},
    $: () => null,
    // state.js's own GameState wins over any stub; localStorage keeps its
    // save() quiet instead of console-warning through every claim test.
    localStorage: { getItem: () => null, setItem: () => {} },
  };
  ctx.globalThis = ctx;
  const src = fs.readFileSync(path.join(ROOT, 'js/state.js'), 'utf8')
    + '\n' + fs.readFileSync(path.join(ROOT, 'js/quests.js'), 'utf8')
    + '\n;globalThis.__q = { G, Quests, claimQuest, questComplete, questProgress, questFor };';
  vm.runInNewContext(src, ctx);
  const Q = ctx.__q;
  Object.assign(Q.G, over || {});
  return { ...Q, rows };
}

test('counters: gated by level, capped at the step target, never counted after claim', () => {
  const Q = loadQuests({ level: 1, quests: {}, inventory: {} });
  Q.Quests.onFightWin('snitch');                       // snitch_problem is gated L2
  assert.ok(!Q.G.quests.snitch_problem || Q.G.quests.snitch_problem.p[0] === 0,
    'a locked quest banked progress');
  Q.G.level = 2;
  for (let i = 0; i < 9; i++) Q.Quests.onFightWin('snitch');
  assert.strictEqual(Q.G.quests.snitch_problem.p[0], 3, 'counter ran past the step target');
  const q = QUESTS_DATA.find(x => x.id === 'snitch_problem');
  assert.ok(Q.questComplete(q));
});

test('claim: pays cash + clout through the ledger exactly once, then refuses forever', () => {
  const Q = loadQuests({ level: 2, cash: 0, inventory: {},
    quests: { snitch_problem: { p: [3], claimed: false } } });
  Q.claimQuest('snitch_problem');
  const q = QUESTS_DATA.find(x => x.id === 'snitch_problem');
  assert.deepStrictEqual(plain(Q.rows), [
    { pool: 'cash', amt: q.reward.cash, reason: 'quest_reward', questId: 'snitch_problem' },
    { pool: 'clout', amt: q.reward.clout, reason: 'quest_reward', questId: 'snitch_problem' },
  ]);
  Q.claimQuest('snitch_problem');
  assert.strictEqual(Q.rows.length, 2, 'a second claim paid again');
});

test('claim refuses an incomplete quest and pays nothing', () => {
  const Q = loadQuests({ level: 2, inventory: {},
    quests: { snitch_problem: { p: [2], claimed: false } } });
  Q.claimQuest('snitch_problem');
  assert.strictEqual(Q.rows.length, 0);
  assert.strictEqual(Q.G.quests.snitch_problem.claimed, false);
});

test('item steps check live ownership; the gear reward lands own-once with src quest', () => {
  const big = QUESTS_DATA.find(x => x.id === 'the_big_one');
  const done = { p: big.steps.map(s => s.type === 'item' ? 0 : s.count), claimed: false };
  const Q = loadQuests({ level: 7, inventory: {}, loadout: {}, crewMemberCount: 0,
    quests: { the_big_one: JSON.parse(JSON.stringify(done)) } });
  assert.ok(!Q.questComplete(big), 'complete without owning the required item');
  Q.G.inventory.glock = { level: 0, duplicates: 0, src: 'bought' };
  assert.ok(Q.questComplete(big), 'live ownership not seen');
  Q.claimQuest('the_big_one');
  assert.strictEqual(Q.G.inventory[big.reward.item].src, 'quest');
  assert.ok((Q.G.loadout.utility || []).indexOf(big.reward.item) !== -1, 'reward not auto-fielded');
});

console.log('\nMonetization — DOM-76 v1 SKUs');

const IAP_DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/monetization.json'), 'utf8'));

test('the catalog sells exactly the three v1 SKUs, fully specified', () => {
  assert.deepStrictEqual(IAP_DATA.map(p => p.sku).sort(),
    ['boost_moves', 'boost_stamina', 'full_heal']);
  IAP_DATA.forEach(p => {
    ['id', 'sku', 'name', 'desc', 'mockPrice', 'effect'].forEach(k =>
      assert.ok(k in p, p.id + ' missing ' + k));
    assert.ok(['grantPool', 'refillPool'].includes(p.effect.type), p.id + ' effect type');
  });
});

test('refreshes are fixed-point grants sized to the starting pool, not refills', () => {
  // Ratified 2026-09-12 (Jake): a refill-to-max scales with the skill-built
  // pool (stamina cap 60 ≈ 33.6h of top-job income in fight EV per $0.99) —
  // the grant is pinned instead. Extended to Moves for the same reason
  // (cap 200). Sim §Q1 owns the numbers.
  const st = IAP_DATA.find(p => p.sku === 'boost_stamina');
  assert.deepStrictEqual(st.effect,
    { type: 'grantPool', pool: 'stamina', amount: tune('start.stamina', TUNE) });
  const mv = IAP_DATA.find(p => p.sku === 'boost_moves');
  assert.deepStrictEqual(mv.effect,
    { type: 'grantPool', pool: 'moves', amount: tune('start.moves', TUNE) });
  const heal = IAP_DATA.find(p => p.sku === 'full_heal');
  assert.deepStrictEqual(heal.effect, { type: 'refillPool', pool: 'health' },
    'the heal is the one refill — its value is the wait it skips, not actions');
});

test('the offer cooldown is a knob, not a literal', () => {
  assert.ok(tune('monetization.offerCooldownSeconds', TUNE) > 0);
});

test('no gems identifier survives in the client (DOM-76 acceptance)', () => {
  const files = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js'))
    .map(f => 'js/' + f).concat(['index.html']);
  const banned = ['GEM_PACKS', 'GEM_SPENDS', 'renderGemSection', 'h-gems', 'gem-section', 'G.gems'];
  files.forEach(f => {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    banned.forEach(tok => assert.ok(!src.includes(tok), f + ' still carries ' + tok));
  });
});

// payments.js is a plain script — run it in a sandbox with the seams stubbed.
// _applyEffect can be driven directly; buy() runs against the stubbed Jest SDK
// and verify endpoint below (every purchase "succeeds" and verifies), so the
// pre-charge guard and grant plumbing are testable end to end.
function loadPayments(g) {
  let lastSku = null;
  const ctx = {
    console, Date, JSON, Object, Math,
    G: g,
    IAP_PRODUCTS: IAP_DATA,
    REASON: { IAP_GRANT: 'iap_grant' },
    tune: p => tune(p, TUNE),
    log: () => {}, updateHUD: () => {}, renderStore: () => {},
    renderHospital: () => {}, $: () => null,
    toast: (msg) => { ctx._toasts.push(msg); },
    isHospitalized: () => typeof g.hospitalizedUntil === 'number' && g.hospitalizedUntil > 0,
    credit: (pool, amt, reason, meta) => {
      ctx._rows.push({ pool, amt, reason, sku: meta && meta.ref && meta.ref.sku });
      const applied = Math.min(amt, g[pool].max - g[pool].current);
      g[pool].current += applied;
      return applied;
    },
    _rows: [],
    _toasts: [],
    _purchases: [],
    _completed: [],
    GameState: { save: () => {} },
    JestSDK: {
      payments: {
        beginPurchase: async ({ productSku }) => {
          lastSku = productSku;
          ctx._purchases.push(productSku);
          return { outcome: 'success', purchaseToken: 'tok', purchaseSigned: 'signed' };
        },
        completePurchase: async ({ purchaseToken }) => { ctx._completed.push(purchaseToken); },
      },
    },
    fetch: async () => ({ json: async () => ({ valid: true, sku: lastSku }) }),
  };
  ctx.globalThis = ctx;
  const src = fs.readFileSync(path.join(ROOT, 'js/payments.js'), 'utf8')
    + '\n;globalThis.__p = Payments;';
  vm.runInNewContext(src, ctx);
  return {
    Payments: ctx.__p, rows: ctx._rows, G: g,
    toasts: ctx._toasts, purchases: ctx._purchases, completed: ctx._completed,
  };
}

test('grantPool credits the fixed amount through the ledger as iap_grant', () => {
  const h = loadPayments({
    hospitalizedUntil: null,
    stamina: { current: 1, max: 10 },
  });
  const applied = h.Payments._applyEffect(IAP_DATA.find(p => p.sku === 'boost_stamina'));
  assert.strictEqual(applied, 3);
  assert.strictEqual(h.G.stamina.current, 4, 'grant is additive, not a refill');
  assert.deepStrictEqual(h.rows, [{ pool: 'stamina', amt: 3, reason: 'iap_grant', sku: 'boost_stamina' }]);
});

test('grantPool clamps at max and reports what actually landed', () => {
  const h = loadPayments({
    hospitalizedUntil: null,
    stamina: { current: 9, max: 10 },
  });
  const applied = h.Payments._applyEffect(IAP_DATA.find(p => p.sku === 'boost_stamina'));
  assert.strictEqual(applied, 1, 'only the headroom landed');
  assert.strictEqual(h.G.stamina.current, 10);
});

test('the premium heal discharges the Hospital, not just the health bar', () => {
  const h = loadPayments({
    hospitalizedUntil: Date.now() + 30 * 60 * 1000,
    health: { current: 0, max: 100 },
  });
  const applied = h.Payments._applyEffect(IAP_DATA.find(p => p.sku === 'full_heal'));
  assert.strictEqual(applied, 100);
  assert.strictEqual(h.G.hospitalizedUntil, null, 'still locked in the Hospital');
});

// DOM-93 flow 3: hospitalized at FULL health, the "already full" guard must
// not eat the discharge — walking out is what the SKU sells ("you walk out
// now"). Unreachable through gameplay today (regen pauses, rest is gated,
// gear hp credits raise max and current together, level-up clears the state
// before crediting), but one reorder away, so the guard is hospital-aware.
test('a hospitalized full heal at full health still buys the discharge', async () => {
  const h = loadPayments({
    hospitalizedUntil: Date.now() + 30 * 60 * 1000,
    health: { current: 100, max: 100 },
  });
  await h.Payments.buy('full_heal');
  assert.deepStrictEqual(h.purchases, ['full_heal'], 'guard refused before charging');
  assert.strictEqual(h.G.hospitalizedUntil, null, 'still locked in the Hospital');
  assert.deepStrictEqual(h.completed, ['tok'], 'purchase never completed');
  assert.ok(h.toasts.some(t => t === 'Full Heal applied!'),
    'success toast missing — got: ' + JSON.stringify(h.toasts));
  assert.ok(!h.toasts.some(t => t.includes('Already full')),
    'refused a purchase that had a discharge to grant');
});

test('a boost at a full pool still refuses before charging', async () => {
  const h = loadPayments({
    hospitalizedUntil: null,
    stamina: { current: 3, max: 3 },
  });
  await h.Payments.buy('boost_stamina');
  assert.deepStrictEqual(h.purchases, [], 'charged despite a full pool');
  assert.deepStrictEqual(h.rows, [], 'granted despite a full pool');
  assert.ok(h.toasts.some(t => t.includes('Already full')), 'refusal toast missing');
});

test('a healthy full heal at full health still refuses before charging', async () => {
  const h = loadPayments({
    hospitalizedUntil: null,
    health: { current: 100, max: 100 },
  });
  await h.Payments.buy('full_heal');
  assert.deepStrictEqual(h.purchases, [], 'charged despite full health and no Hospital');
  assert.ok(h.toasts.some(t => t.includes('Already full')), 'refusal toast missing');
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

console.log('\nmigrated players land where the new curve puts them');

test('the fixture player moves from level 5 to level 9', () => {
  const { save } = migrate(clone(FIXTURE));
  assert.strictEqual(save.level, 5);                        // migration does not re-derive
  assert.strictEqual(levelFromClout(save.clout, TABLE), 9); // syncLevel() does, on load
});

test('and keeps its rank title, because bands are wider than the move', () => {
  // Under the r=1.10 curve the fixture lands at level 9, still inside the first
  // 10-level band. Bands absorb small level moves; the second band starts at 11.
  assert.strictEqual(rankForLevel(9, RANKS, PER_RANK), 'Shorty');
  assert.strictEqual(rankForLevel(11, RANKS, PER_RANK), 'Soldier');
});

console.log('\n' + passed + ' passed' + (process.exitCode ? ', SOME FAILED' : '') + '\n');
