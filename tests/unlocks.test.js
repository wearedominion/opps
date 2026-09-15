// Level gates.
// Part of the suite; run it all with `node tests/run.js`.

const { fs, path, assert, ROOT, ENEMIES_DATA, JOBS_DATA, test } = require('./harness');

console.log('\nunlock gates');

// unlocks.js reads both of these off the global scope, the way the browser
// hands them to it. In the flat suite `evalCurve` happened to already be in
// scope from the curve-evaluation section above it; requiring it here makes
// that dependency explicit instead of order-of-appearance luck.
const { evalCurve } = require(path.join(ROOT, 'js/tuning.js'));
const UNLOCKS_DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/unlocks.json'), 'utf8'));
global.UNLOCKS = UNLOCKS_DATA;
global.evalCurve = evalCurve;
const { requiredLevel, isUnlocked, lockLabel, capabilityAt } =
  require(path.join(ROOT, 'js/unlocks.js'));

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
