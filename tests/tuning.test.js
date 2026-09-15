// Tuning access and curve evaluation.
// Part of the suite; run it all with `node tests/run.js`.

const {
  path, assert, ROOT, TABLE, TUNE, tune, missingTuningPaths, TUNING_REQUIRED, test,
} = require('./harness');

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

// tune() and missingTuningPaths() fall back to a global TUNING when no source is
// passed, so the two tests below — which describe the "never loaded" case — have
// to clear it themselves. In the flat suite they got that for free by sitting
// above the section that sets the global; with files discovered by name, run
// order is not something to lean on.
function withNoTuningGlobal(fn) {
  const had = Object.prototype.hasOwnProperty.call(global, 'TUNING');
  const prev = global.TUNING;
  delete global.TUNING;
  try { return fn(); } finally { if (had) global.TUNING = prev; }
}

test('tune() throws when the file never loaded', () => {
  withNoTuningGlobal(() => assert.throws(() => tune('loot.burnRate', null), /not loaded/));
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
  withNoTuningGlobal(() =>
    assert.strictEqual(missingTuningPaths(null).length, TUNING_REQUIRED.length));
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
