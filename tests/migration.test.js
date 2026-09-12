// Golden-file test for the save migration chain and the Clout -> level
// derivation. Required by docs/specs/04-game-data-spec.md §7.4.
//
// No test runner in this repo yet, so this is a plain Node script:
//   node tests/migration.test.js
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

console.log('\nsave migration — full chain v1 -> v4');

test('fixture migrates to the current schema version', () => {
  const { save, upgraded, fromFuture } = migrate(clone(FIXTURE));
  assert.strictEqual(save.schemaVersion, SCHEMA_VERSION);
  assert.strictEqual(upgraded, true);
  assert.strictEqual(fromFuture, false);
});

test('golden: a v1 fixture migrates all the way to the exact expected v4 save', () => {
  const save = plain(migrate(clone(FIXTURE)).save);
  // v1 -> v2: level 5 under the v1 curve had cleared 100+160+256+409 = 925,
  //           plus xp remainder 200 plus rep 340 = 1465 clout.
  // v2 -> v3: money -> cash, and the three pools collapse to {current, max, lastTick}.
  // v3 -> v4: inventory array -> per-instance {level, duplicates} map.
  assert.deepStrictEqual(save, {
    schemaVersion: 4,
    level: 5,
    clout: 1465,
    levelGranted: 5,
    cash: 4120,
    moves:   { current: 7,   max: 18,  lastTick: 1757000000000 },
    stamina: { current: 8,   max: 10,  lastTick: 0 },
    health:  { current: 130, max: 160, lastTick: 0 },
    attack: 22, defense: 13,
    inventory: { knife: { level: 0, duplicates: 0 }, vest: { level: 0, duplicates: 0 } },
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
    equipped: { weapon: 'knife' },
  });
});

test('golden: a v2 fixture produces the exact expected v4 save', () => {
  const save = plain(migrate(clone(FIXTURE_V2)).save);
  assert.deepStrictEqual(save, {
    schemaVersion: 4,
    level: 11,
    clout: 1465,
    levelGranted: 11,
    cash: 8800,
    moves:   { current: 4,  max: 22,  lastTick: 1757199000000 },
    stamina: { current: 2,  max: 6,   lastTick: 0 },
    health:  { current: 90, max: 205, lastTick: 0 },
    attack: 40, defense: 25,
    inventory: { knife: { level: 0, duplicates: 0 }, vest: { level: 0, duplicates: 0 },
                 glock: { level: 0, duplicates: 0 } },
    properties: { corner: 3 },
    jobProgress: { lookout: 10, runner: 8 },
    playerId: 'p_test_0002',
    lastSeen: 1757200000000,
    crewMemberCount: 5,
    lieutenantsRewarded: 5,
    recruitedBy: null,
    skillPts: 35,
    equipped: { weapon: 'glock' },
  });
});

test('golden: a v3 fixture produces the exact expected v4 save', () => {
  const save = plain(migrate(clone(FIXTURE_V3)).save);
  const expected = clone(FIXTURE_V3);
  expected.schemaVersion = 4;
  // The ONLY change v3 -> v4 makes: every owned id becomes a fresh instance.
  expected.inventory = {
    knife: { level: 0, duplicates: 0 }, vest:  { level: 0, duplicates: 0 },
    glock: { level: 0, duplicates: 0 }, bando: { level: 0, duplicates: 0 },
    mac11: { level: 0, duplicates: 0 },
  };
  assert.deepStrictEqual(save, expected);
});

test('v3 -> v4: an empty inventory array becomes an empty map', () => {
  const { save } = migrate({ schemaVersion: 3, level: 1, clout: 0, inventory: [] });
  assert.deepStrictEqual(plain(save.inventory), {});
  assert.strictEqual(save.schemaVersion, 4);
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
  assert.deepStrictEqual(tune('combat.winHealthLoss', TUNE), [5, 20]);
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
