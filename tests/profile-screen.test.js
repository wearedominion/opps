// S8a Profile — identity, SKILLS, LEADERBOARD + overlays (DOM-117).
// GEAR tab is DOM-130; the stats overlay and its counters are DOM-131.
// Part of the suite; run it all with `node tests/run.js`.

const {
  fs, path, vm, assert, ROOT, readAllCss, RANKS, MAX_LEVEL, TUNE, tune, STORE_DATA, test,
} = require('./harness');

const BOARD = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/leaderboard.json'), 'utf8'));
const PROFILE_SRC = fs.readFileSync(path.join(ROOT, 'js/profile.js'), 'utf8');

function loadProfile(over) {
  const o = over || {};
  let root = '', overlays = '';
  const G = Object.assign({
    level: 12, clout: 5000, skillPts: 6, handle: 'LIL WASH',
    moves: { current: 10, max: 10 }, stamina: { current: 3, max: 3 }, health: { current: 100, max: 100 },
    attack: 10, defense: 5, cash: 500, inventory: {}, loadout: {}, supplies: {},
  }, o.G || {});
  const P = require(path.join(ROOT, 'js/progression.js'));
  const ctx = {
    console, JSON, Object, Math, Array, String, Number,
    G,
    RANK_NAMES: RANKS, TUNING: TUNE, PROGRESSION: JSON.parse(fs.readFileSync(path.join(ROOT, 'data/progression.json'), 'utf8')).levels,
    LEADERBOARD: 'board' in o ? o.board : BOARD,
    STORE_ITEMS: STORE_DATA,
    RARITY_LABELS: { grey: 'COMMON', green: 'UNCOMMON', blue: 'RARE', purple: 'EPIC', orange: 'LEGENDARY', mythic: 'MYTHIC' },
    tune: p => tune(p, TUNE),
    rankForLevel: (lv, n, c) => P.rankForLevel(lv, RANKS, tune('progression.maxLevel', TUNE)),
    cloutProgress: c => P.cloutProgress(c, ctxTable()),
    cloutToReach: lv => P.cloutToReach(lv, ctxTable()),
    levelFromClout: c => P.levelFromClout(c, ctxTable()),
    ownsGear: id => !!G.inventory[id],
    fieldedStats: () => ({ atk: 0, def: 0 }),
    gearInstance: id => G.inventory[id] || null,
    slotCapacity: () => 1,
    $: id => id === 'pf-root' ? { set innerHTML(v) { root = v; } }
            : id === 'pf-overlays' ? { set innerHTML(v) { overlays = v; } } : null,
    registerScreen: () => {}, showTab: () => {}, toast: () => {}, log: () => {},
    updateHUD: () => {}, GameState: { save: () => {} }, renderStats: () => {},
    autoFieldGear: () => false, effAttack: () => 0, effDefense: () => 0,
    credit: (pool, n) => { if (G[pool] && typeof G[pool].max === 'number') { G[pool].max += n; G[pool].current += n; } else { G[pool] = (G[pool] || 0) + n; } return n; },
    debit: (k, n) => { G[k] = (G[k] || 0) - n; return n; },
    REASON: { SKILL_ALLOC: 'skill_alloc' },
  };
  function ctxTable() { return ctx.PROGRESSION; }
  const src = PROFILE_SRC
    + '\n;globalThis.__t = { renderProfile, pfShowTab, pfStage, pfResetPending, pfOpenConfirm,'
    + ' pfCommitSkills, pfPublicProjection, pfBoardRows, pfRankRows, pfOpenRanks, pfOpenPublic,'
    + ' pfClosePublic, pfPendingCost, SKILL_DEFS, G };';
  vm.runInNewContext(src, ctx);
  ctx.__t.renderProfile();
  // Live accessors, not getters through Object.assign — that copies the getter's
  // VALUE, which silently froze `overlays` at load time and made every overlay
  // assertion read an empty string.
  const api = Object.assign({}, ctx.__t);
  Object.defineProperty(api, 'root', { get: () => root });
  Object.defineProperty(api, 'overlays', { get: () => overlays });
  api.rerender = () => { ctx.__t.renderProfile(); return api; };
  return api;
}

console.log('\nS8a Profile — DOM-117');

// ─────────────────────────────────────────────
//  Staging is blue; gold never marks spending
// ─────────────────────────────────────────────

test('a staged point is blue everywhere, and gold is left to money', () => {
  // 07-profile.md is explicit. The v0.1 screen marked staging in green and put
  // the + stepper in gold, which made an uncommitted spend look like a
  // purchase — the one thing gold means everywhere else in the app.
  const css = readAllCss();
  assert.ok(/\.pf-skill-val\.staged\s*\{[^}]*color:\s*var\(--xp\)/.test(css), 'the staged value is not blue');
  assert.ok(/\.pf-tab-badge\s*\{[^}]*background:\s*var\(--xp\)/.test(css), 'the points badge is not blue');
  assert.ok(/\.pf-step\.inc\s*\{[^}]*color:\s*var\(--xp\)/.test(css), 'the + stepper is not blue');
  assert.ok(!/\.pf-step\.inc\s*\{[^}]*var\(--chrome\)/.test(css), 'the + stepper is still gold');
  assert.ok(!/\.pf-seg\.staged/.test(css), 'the gold staged segment is back');
});

test('staging shows the move, not just the destination', () => {
  const p = loadProfile();
  p.pfStage('moves', 1); p.pfStage('moves', 1);
  const r = p.rerender().root;
  assert.ok(/10 <span class="pf-arrow">&rarr;<\/span> 12/.test(r), 'the from-value is gone: ' + r.slice(0, 0));
  assert.ok(/\+2 · 2 PTS/.test(r), 'the delta does not price itself');
  // a 2-point skill costs double, and says so
  const q = loadProfile();
  q.pfStage('stamina', 1);
  assert.ok(/\+1 · 2 PTS/.test(q.rerender().root), 'stamina staged at the wrong price');
});

test('points commit only through the confirm overlay', () => {
  const p = loadProfile();
  p.pfStage('moves', 1);
  assert.strictEqual(p.G.moves.max, 10, 'staging spent a point on its own');
  assert.strictEqual(p.G.skillPts, 6);
  p.pfCommitSkills();
  assert.strictEqual(p.G.moves.max, 12, 'the grant is per-rank, not per-point');
  assert.strictEqual(p.G.skillPts, 5);
  assert.strictEqual(p.pfPendingCost({}), 0);
  // RESET drops staged ranks without touching the wallet
  const q = loadProfile();
  q.pfStage('moves', 1); q.pfStage('moves', 1); q.pfResetPending();
  assert.strictEqual(q.G.skillPts, 6);
  assert.strictEqual(q.G.moves.max, 10);
});

test('the lock button says what it will do, and refuses when there is nothing', () => {
  const p = loadProfile();
  assert.ok(/NOTHING TO LOCK/.test(p.root));
  p.pfStage('moves', 1);
  assert.ok(/LOCK IN 1 PT\s*</.test(p.rerender().root), 'singular point');
  p.pfStage('moves', 1);
  assert.ok(/LOCK IN 2 PTS\s*</.test(p.rerender().root));
});

// ─────────────────────────────────────────────
//  Ranks
// ─────────────────────────────────────────────

test('the ranks popup lists every title once, and marks where you are', () => {
  const p = loadProfile();
  const rows = p.pfRankRows();
  assert.strictEqual(rows.length, RANKS.length, 'a title is missing or doubled');
  // .join, not deepStrictEqual: the array is built inside the vm and carries
  // that realm's Array.prototype, which deepStrictEqual rejects outright.
  assert.strictEqual(rows.map(r => r.name).join('|'), RANKS.join('|'),
    'the popup has drifted from ranks.json');
  assert.strictEqual(rows[0].level, 1);
  assert.ok(rows[rows.length - 1].level <= MAX_LEVEL);
  // exactly one YOU
  assert.strictEqual(rows.filter(r => r.you).length, 1);
  // and levels only ever climb
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i].level > rows[i - 1].level, 'row ' + i);
});

test('the identity header names the rank you are climbing towards', () => {
  const p = loadProfile();
  assert.ok(/XP TO [A-Z]/.test(p.root), 'the XP label is not naming a rank');
  assert.ok(!/TO NEXT</.test(p.root), 'the old generic label is back');
});

// ─────────────────────────────────────────────
//  Leaderboard, and the self/public boundary
// ─────────────────────────────────────────────

test('the board shows the stub plus you, ordered by clout', () => {
  const p = loadProfile();
  const rows = p.pfBoardRows();
  assert.strictEqual(rows.length, BOARD.rows.length + 1, 'the player is not on their own board');
  assert.strictEqual(rows.filter(r => r.you).length, 1);
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i - 1].clout >= rows[i].clout, 'the board is out of order at ' + i);
    assert.strictEqual(rows[i].pos, i + 1, 'positions are not renumbered');
  }
});

test('a board rank comes from the level, not the row\'s stored string', () => {
  // DOM-124 replaced the ten band names with 100 titles, so every `rank` string
  // baked into the stub names a rank that no longer exists. One rank source was
  // that ticket's acceptance criterion.
  const p = loadProfile();
  for (const r of p.pfBoardRows()) {
    assert.ok(RANKS.indexOf(r.rank) !== -1, r.handle + ' has a rank that is not in ranks.json: ' + r.rank);
  }
  const stale = BOARD.rows.filter(r => RANKS.indexOf(r.rank) === -1);
  assert.ok(stale.length > 0, 'the stub was fixed — this guard can go');
});

test('the public profile can only show what the projection carries', () => {
  // The self/public boundary is drawn in exactly one function. This asserts the
  // overlay is downstream of it, so a field the projection drops cannot be
  // rendered even by mistake.
  const p = loadProfile({ G: { cash: 999999, skillPts: 42, attack: 77, defense: 66 } });
  const projected = p.pfPublicProjection(p.G);
  for (const banned of ['attack', 'defense', 'health', 'moves', 'stamina', 'cash', 'skillPts', 'inventory', 'loadout']) {
    assert.ok(!(banned in projected), 'the projection leaks ' + banned);
  }
  p.pfShowTab('board');
  p.pfOpenPublic(p.pfBoardRows().find(r => r.you).pos);
  const html = p.overlays;
  assert.ok(/THIS IS WHAT THE STREETS SEE/.test(html), 'your own row does not read as yours');
  for (const n of ['999999', '999,999', '42', '77', '66']) {
    assert.ok(html.indexOf(n) === -1, 'a private number reached the public overlay: ' + n);
  }
});

test('someone else\'s profile offers the opp actions; your own does not', () => {
  const p = loadProfile();
  p.pfShowTab('board');
  const other = p.pfBoardRows().find(r => !r.you);
  p.pfOpenPublic(other.pos);
  assert.ok(/MARK AS OPP/.test(p.overlays) && /MESSAGE/.test(p.overlays));
  assert.ok(/is-other/.test(p.overlays), 'another player gets the self border');
  p.pfClosePublic();
  p.pfOpenPublic(p.pfBoardRows().find(r => r.you).pos);
  assert.ok(!/MARK AS OPP/.test(p.overlays), 'you can mark yourself as an opp');
  assert.ok(/is-self/.test(p.overlays));
});

test('a missing leaderboard file still leaves you a board with you on it', () => {
  const p = loadProfile({ board: null });
  const rows = p.pfBoardRows();
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].you, true);
  assert.ok(/LEADERBOARD/.test(p.root));
});

// ─────────────────────────────────────────────
//  What this ticket deliberately did not build
// ─────────────────────────────────────────────

test('the stats overlay is not faked while its counters do not exist', () => {
  // Six counters — DEAD OPPS, ROBBERIES, CAR THEFTS, HOES and the rest — and
  // none of them is counted anywhere yet. That is DOM-131, split out of this
  // ticket for exactly that reason. An overlay of zeroes would look shipped.
  const src = PROFILE_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const counter of ['DEAD OPPS', 'CAR THEFTS', 'ROBBERIES']) {
    assert.ok(src.indexOf(counter) === -1, 'a stats-overlay counter is being rendered: ' + counter);
  }
  assert.ok(/function pfOpenStats/.test(src), 'the STATS button has no handler at all');
  assert.ok(/showTab\('stats'\)/.test(src), 'the STATS button is dead rather than routed');
});
