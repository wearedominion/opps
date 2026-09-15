// S3 Opps List + engage modal (DOM-112).
// Part of the suite; run it all with `node tests/run.js`.

const { fs, path, vm, assert, ROOT, test } = require('./harness');

console.log('\nopps list');

//  DOM-112 — Opps List
//
//  The card's two derived readings (the HP rating and the threat gauge's
//  severity-by-position) plus the dossier-code invariants. js/combat.js
//  declares only vars and functions at the top level, so it loads in a vm
//  with ENEMIES handed in.
// ─────────────────────────────────────────────

console.log('\nDOM-112 — Opps List');

const ENEMY_DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/enemies.json'), 'utf8'));

// Runs the WHOLE of js/combat.js in a vm against a hand-built context, because
// it is a plain script with no exports.
//
// TRIPWIRE: that context is the complete list of globals combat.js may touch at
// TOP LEVEL. Add a new top-level reference to the file — a const reading another
// global, a call at load time — and all of these tests fail with a bare
// ReferenceError naming the global, not the test. If that happens, the fix is
// almost always to add the name here, not to change combat.js. Anything inside
// a function body is fine: it is never evaluated by this harness.
function loadCombat(enemies) {
  const src = fs.readFileSync(path.join(ROOT, 'js/combat.js'), 'utf8')
    + '\n;globalThis.__c = { oppHpRating, oppThreatTone };';
  // registerScreen: js/combat.js claims the 'fight' tab at load (DOM-127) and
  // there is no showTab in here to claim it from.
  const ctx = { console, Math, JSON, Object, Date, ENEMIES: enemies || ENEMY_DATA,
                document: { addEventListener() {} }, registerScreen: () => {} };
  vm.runInNewContext(src, ctx);
  return ctx.__c;
}

test('enemy codes are unique, well-formed, and pinned to the generator rule', () => {
  const codes = ENEMY_DATA.map(e => e.code);
  assert.strictEqual(new Set(codes).size, codes.length, 'duplicate dossier code');
  for (const e of ENEMY_DATA) {
    assert.ok(/^[A-Z]-\d{2}$/.test(e.code), e.id + ' has a malformed code: ' + e.code);
    assert.strictEqual(e.code[0], e.id[0].toUpperCase(), e.id + ' code letter does not match its id');
  }
  // index is the position in level order — the same order gen-catalog writes
  const ordered = ENEMY_DATA.slice().sort((a, b) => a.levelReq - b.levelReq || a.id.localeCompare(b.id));
  ordered.forEach((e, i) => {
    assert.strictEqual(e.code.slice(2), String(i + 1).padStart(2, '0'),
      e.id + ' code index is out of step with level order');
  });
});

test('the HP gauge spreads the whole roster across 1–8 instead of bunching at 1', () => {
  const { oppHpRating } = loadCombat();
  const ratings = ENEMY_DATA.map(e => oppHpRating(e));
  for (const r of ratings) {
    assert.ok(Number.isInteger(r) && r >= 1 && r <= 8, 'rating out of range: ' + r);
  }
  // the point of the log scale: the weakest reads 1, the toughest 8, and the
  // roster uses most of the gauge rather than collapsing into one block
  const byHp = ENEMY_DATA.slice().sort((a, b) => a.hp - b.hp);
  assert.strictEqual(oppHpRating(byHp[0]), 1);
  assert.strictEqual(oppHpRating(byHp[byHp.length - 1]), 8);
  assert.ok(new Set(ratings).size >= 6, 'the HP gauge only uses ' + new Set(ratings).size + ' of its 8 steps');
  // and it is monotonic — more HP never reads as fewer blocks
  for (let i = 1; i < byHp.length; i++) {
    assert.ok(oppHpRating(byHp[i]) >= oppHpRating(byHp[i - 1]), 'HP rating is not monotonic');
  }
});

test('the HP gauge degrades rather than throwing on a junk roster', () => {
  assert.strictEqual(loadCombat([{ id: 'only', hp: 50 }]).oppHpRating({ hp: 50 }), 1);
  assert.strictEqual(loadCombat([{ id: 'a', hp: 0 }]).oppHpRating({ hp: 0 }), 1);
  assert.strictEqual(loadCombat().oppHpRating({}), 1);
});

test('threat severity is encoded by POSITION — 1-2 grey, 3-5 chrome, 6-8 red', () => {
  const { oppThreatTone } = loadCombat();
  const tones = [0, 1, 2, 3, 4, 5, 6, 7].map(oppThreatTone);
  assert.deepStrictEqual(tones, ['lo', 'lo', 'mid', 'mid', 'mid', 'hi', 'hi', 'hi']);
});

test('the Opps List screen holds no hard-coded hexes', () => {
  // Rarity/severity colour lives in tokens; the renderer only names classes.
  const src = fs.readFileSync(path.join(ROOT, 'js/combat.js'), 'utf8');
  const render = src.slice(src.indexOf('function renderEnemies'), src.indexOf('function oppLocate'));
  assert.ok(!/#[0-9a-fA-F]{6}/.test(render), 'renderEnemies hard-codes a hex');
  assert.ok(!/style\.color\s*=/.test(render), 'renderEnemies sets an inline colour');
});
