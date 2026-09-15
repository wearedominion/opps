// The rig every tests/*.test.js file requires: the pass counter, the golden
// fixtures, and the sandbox loader for the plain <script> files in js/.
//
// DOM-127 — this file and tests/run.js are the only two files the suite shares.
// A ticket adds tests/<area>.test.js and edits nothing else: the runner finds it
// by name, so there is no list to append to and nothing for two concurrent
// branches to collide on. Resist adding a registry here for the same reason.
//
// Run everything with:
//   node tests/run.js
// Exits non-zero if any test fails.

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

// Read-only catalogs that more than one area asserts against. The flat suite
// had exactly one copy of each and sections further down reused whichever was
// declared above them; keeping a single instance here preserves that, and makes
// the sharing deliberate rather than a side effect of file order.
const STORE_DATA   = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/gear.json'), 'utf8'));
const ENEMIES_DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/enemies.json'), 'utf8'));
const JOBS_DATA    = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/jobs.json'), 'utf8'));
const QUESTS_DATA  = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/quests.json'), 'utf8'));
const CITY_DATA    = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/city.json'), 'utf8'));

// The loadout sandbox, used by the Crew rules and by the DOM-120 banked-stats
// regression guards. Same shape as loadState() above, with the gear catalog and
// tuning wired in the way the browser hands them to state.js.
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

// Every stylesheet the app loads, concatenated in index.html's link order.
// Tests that grep the CSS are asking "does the app declare this?", not "is it in
// this particular file?", so they should not have to track how css/ is split.
function readAllCss() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const hrefs = [];
  const re = /<link[^>]+rel="stylesheet"[^>]+href="(css\/[^"]+)"/g;
  let m;
  while ((m = re.exec(html))) hrefs.push(m[1]);
  if (!hrefs.length) throw new Error('index.html links no local stylesheet');
  return hrefs.map(h => fs.readFileSync(path.join(ROOT, h), 'utf8')).join('\n');
}

// The same list as paths, for tests that scan source files rather than rules.
function cssFiles() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const out = [];
  const re = /<link[^>]+rel="stylesheet"[^>]+href="(css\/[^"]+)"/g;
  let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

// `passed` counts successes, as it always has — it is what the summary prints.
// `ran` counts registrations whatever the outcome, which is what the runner
// checks against each file's `test(` call sites to catch a silent drop.
let passed = 0;
let ran = 0;
const perFile = new Map();
let current = '(unattributed)';

function test(name, fn) {
  ran++;
  perFile.set(current, (perFile.get(current) || 0) + 1);
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { console.error('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; }
}

// Called by the runner immediately before it requires each file, so the counts
// can be attributed. Nothing else should touch it.
function enterFile(name) { current = name; }
function results() { return { passed, ran, perFile }; }

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

module.exports = {
  fs, path, vm, assert, ROOT,
  levelFromClout, cloutToReach, cloutProgress, rankForLevel,
  TABLE, RANKS, TUNE, tune, missingTuningPaths, TUNING_REQUIRED, PER_RANK,
  loadState, loadLoadout, readAllCss, cssFiles, migrate, SCHEMA_VERSION, G,
  STORE_DATA, ENEMIES_DATA, JOBS_DATA, QUESTS_DATA, CITY_DATA,
  FIXTURE, FIXTURE_V2, FIXTURE_V3, clone, plain,
  test, enterFile, results,
};
