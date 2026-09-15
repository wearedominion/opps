// Leaderboard stub and the privacy boundary (DOM-122).
// Part of the suite; run it all with `node tests/run.js`.

const {
  fs, path, vm, assert, ROOT, rankForLevel, TUNE, tune, G, STORE_DATA, CITY_DATA, test,
} = require('./harness');

// ─────────────────────────────────────────────
//  DOM-122 — FW3: leaderboard stub + the privacy boundary
// ─────────────────────────────────────────────

const LEADERBOARD_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/leaderboard.json'), 'utf8'));

// The contract, in one place. A leaderboard row and a public projection may
// carry ONLY these keys; everything else is combat intel or private state.
const PUBLIC_ROW_KEYS  = ['clout', 'faction', 'gear', 'handle', 'level', 'pos', 'rank'];
const PUBLIC_GEAR_KEYS = ['level', 'name', 'slot', 'tier', 'type'];
// Anything in here reaching another player is the bug this ticket exists to
// prevent — raw combat stats, pools, wallet, unspent power, or what you own
// but are not carrying.
const PRIVATE_KEYS = [
  'attack', 'defense', 'atk', 'def', 'health', 'moves', 'stamina', 'cash',
  'gold', 'skillPts', 'inventory', 'loadout', 'combatSnapshot', 'cp',
  'playerId', 'createdAt', 'supplies', 'quests', 'jobProgress',
];

test('leaderboard stub — every row carries exactly the public shape', () => {
  assert.ok(Array.isArray(LEADERBOARD_JSON.rows) && LEADERBOARD_JSON.rows.length >= 10);
  LEADERBOARD_JSON.rows.forEach(row => {
    assert.deepStrictEqual(Object.keys(row).sort(), PUBLIC_ROW_KEYS,
      'row ' + row.pos + ' does not match the public row shape');
    row.gear.forEach(g => {
      assert.deepStrictEqual(Object.keys(g).sort(), PUBLIC_GEAR_KEYS,
        'row ' + row.pos + ' has a gear entry outside the public shape');
    });
  });
});

test('leaderboard stub — no private field appears anywhere in the file', () => {
  // Cheap, total, and catches a hand-edit that a per-key check would miss.
  const flat = JSON.stringify(LEADERBOARD_JSON.rows);
  for (const key of PRIVATE_KEYS) {
    assert.ok(!new RegExp('"' + key + '"').test(flat),
      'the leaderboard stub leaks "' + key + '"');
  }
});

test('leaderboard stub — ranked by clout, positions dense from 1, handles unique', () => {
  const rows = LEADERBOARD_JSON.rows;
  assert.deepStrictEqual(rows.map(r => r.pos), rows.map((_, i) => i + 1), 'positions are not 1..n');
  const clouts = rows.map(r => r.clout);
  assert.deepStrictEqual(clouts, clouts.slice().sort((a, b) => b - a), 'rows are not clout-descending');
  assert.strictEqual(new Set(rows.map(r => r.handle)).size, rows.length, 'duplicate handle');
});

test('leaderboard stub — every gear name and faction resolves to real data', () => {
  const names = new Set(STORE_DATA.map(g => g.name));
  const factions = new Set(Object.keys(CITY_DATA.factions));
  for (const row of LEADERBOARD_JSON.rows) {
    assert.ok(factions.has(row.faction), row.handle + ' has unknown faction ' + row.faction);
    for (const g of row.gear) {
      assert.ok(names.has(g.name), row.handle + ' carries unknown gear "' + g.name + '"');
    }
  }
});

test('leaderboard stub — declares itself a stub and states the privacy contract', () => {
  // A future live source replaces the file; the note is how the next person
  // learns these handles are invented rather than real players.
  assert.ok(/stub/i.test(LEADERBOARD_JSON._note), 'the stub does not say it is a stub');
  assert.ok(/not real players/i.test(LEADERBOARD_JSON._note));
  assert.ok(LEADERBOARD_JSON._contract && /Never attack/.test(LEADERBOARD_JSON._contract));
});

test('the projection drops every private field, whatever the save throws at it', () => {
  // The existing DOM-75 test pins one input. This one hands the projection a
  // save carrying EVERY private key at once and asserts none survive — the
  // check that keeps holding as G grows new fields.
  const profileSrc = fs.readFileSync(path.join(ROOT, 'js/profile.js'), 'utf8');
  const fn = profileSrc.match(/function pfPublicProjection[\s\S]*?\n\}/);
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
    + '\nfunction pfTierLabel(it){return "COMMON";}'
    + '\nglobalThis.__proj = pfPublicProjection;', ctx);

  const hostile = {
    handle: 'OPP', level: 12, clout: 5000,
    inventory: { glock: { level: 3, duplicates: 0, src: 'bought' },
                 ak: { level: 9, duplicates: 2, src: 'drop' } },
    loadout: { weapon: ['glock'] },   // ak is owned but BENCHED — must not show
  };
  for (const k of PRIVATE_KEYS) if (!(k in hostile)) hostile[k] = 'LEAK-' + k;

  const pub = ctx.__proj(hostile);
  const flat = JSON.stringify(pub);
  assert.ok(!/LEAK-/.test(flat), 'a private field survived the projection: ' + flat);
  for (const k of PRIVATE_KEYS) {
    assert.ok(!(k in pub), 'the projection exposes "' + k + '"');
  }
  // and the benched item is not in the output
  assert.deepStrictEqual(Array.from(pub.gear).map(g => g.name), ['Glock 19'],
    'an owned-but-benched item reached the public view');
});

test('a stub row and a projected save are the same shape apart from pos and faction', () => {
  // This is what makes the stub swappable for a live source: S8 renders one
  // shape either way.
  const profileSrc = fs.readFileSync(path.join(ROOT, 'js/profile.js'), 'utf8');
  const fn = profileSrc.match(/function pfPublicProjection[\s\S]*?\n\}/);
  const ctx = { console, JSON, Object, Math, STORE_ITEMS: STORE_DATA,
                tune: p => tune(p, TUNE), rankForLevel: () => 'SOLDIER', G: {} };
  ctx.globalThis = ctx;
  vm.runInNewContext(fn[0]
    + '\nfunction pfFindItem(id){return STORE_ITEMS.find(i=>i.id===id)||null;}'
    + '\nfunction pfTierLabel(it){return "COMMON";}'
    + '\nglobalThis.__proj = pfPublicProjection;', ctx);
  const projected = ctx.__proj({
    handle: 'ME', level: 9, clout: 100,
    inventory: { glock: { level: 0, duplicates: 0, src: 'bought' } },
    loadout: { weapon: ['glock'] },
  });
  const stubRow = LEADERBOARD_JSON.rows[0];
  const extra = Object.keys(stubRow).filter(k => !(k in projected));
  assert.deepStrictEqual(extra.sort(), ['faction', 'pos'],
    'the stub row and the projection have drifted apart');
  const missing = Object.keys(projected).filter(k => !(k in stubRow));
  assert.deepStrictEqual(missing, [], 'the stub is missing projection keys: ' + missing.join(', '));
});
