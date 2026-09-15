// The asset inventory (DOM-125).
// Part of the suite; run it all with `node tests/run.js`.

const { fs, path, assert, ROOT, test } = require('./harness');

// ─────────────────────────────────────────────
//  DOM-125 — FW6 asset inventory
// ─────────────────────────────────────────────

const PORTRAITS_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/portraits.json'), 'utf8'));

// Enemies known to have no portrait, recorded in assets/README.md. This list
// exists so the test can fail for a NEW faceless roster entry while staying
// green on the gaps that are already written down and owned.
const KNOWN_FACELESS = [
  'corner', 'trapboss', 'cartel', 'detective', 'syndicate',
  'kingpin', 'fixer', 'gunchief', 'enforcer', 'shadowboss', 'thedon',
];

test('assets — every portrait key in the data resolves to a file on disk', () => {
  for (const group of ['plugs', 'enemies']) {
    for (const key of Object.keys(PORTRAITS_JSON[group])) {
      const rel = PORTRAITS_JSON[group][key];
      assert.ok(fs.existsSync(path.join(ROOT, rel)),
        group + '.' + key + ' points at a missing file: ' + rel);
    }
  }
});

test('assets — no portrait entry is keyed to an entity that does not exist', () => {
  const plugIds = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/plugs.json'), 'utf8')).map(p => p.id));
  const enemyIds = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/enemies.json'), 'utf8')).map(e => e.id));
  for (const key of Object.keys(PORTRAITS_JSON.plugs)) {
    assert.ok(plugIds.has(key), 'portraits.plugs.' + key + ' is keyed to no plug');
  }
  for (const key of Object.keys(PORTRAITS_JSON.enemies)) {
    assert.ok(enemyIds.has(key), 'portraits.enemies.' + key + ' is keyed to no enemy');
  }
});

test('assets — a new roster entry cannot ship faceless without being recorded', () => {
  const plugs = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/plugs.json'), 'utf8'));
  const enemies = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/enemies.json'), 'utf8'));
  // Every plug has art; that is a hard rule, there is no gap list for plugs.
  for (const p of plugs) {
    assert.ok(PORTRAITS_JSON.plugs[p.id], 'plug ' + p.id + ' has no portrait');
  }
  // Enemies may be faceless only while they are on the documented gap list.
  const faceless = enemies.filter(e => !PORTRAITS_JSON.enemies[e.id]).map(e => e.id);
  const unexpected = faceless.filter(id => KNOWN_FACELESS.indexOf(id) === -1);
  assert.deepStrictEqual(unexpected, [],
    'new faceless enemies — add art, or record them in assets/README.md');
  // and the list must not rot the other way: art added means the gap closes
  const stale = KNOWN_FACELESS.filter(id => PORTRAITS_JSON.enemies[id]);
  assert.deepStrictEqual(stale, [],
    'these now have art — drop them from KNOWN_FACELESS and assets/README.md');
});

test('assets — no emoji and no data-URI art in production code', () => {
  // The contract is inline stroked SVG only. Typographic glyphs are fine;
  // pictographs are not, and neither is art inlined as base64.
  const files = ['index.html', 'css/styles.css']
    .concat(fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f));
  const emoji = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
  const allowed = new Set(['\u2713', '\u2715', '\u203a', '\u2039']);
  for (const rel of files) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.ok(!/data:image\//.test(src), rel + ' inlines art as a data URI');
    for (const ch of src) {
      if (emoji.test(ch) && !allowed.has(ch)) {
        assert.fail(rel + ' uses U+' + ch.codePointAt(0).toString(16).toUpperCase() + ' as an icon');
      }
    }
  }
});

test('assets — the inventory records the gaps rather than hiding them', () => {
  const readme = fs.readFileSync(path.join(ROOT, 'assets/README.md'), 'utf8');
  for (const id of KNOWN_FACELESS) {
    assert.ok(readme.includes('`' + id + '`'), 'assets/README.md does not list ' + id);
  }
});

// The two rasters the screens consume. Committed binaries are easy to lose in a
// rebase or a stray clean, and nothing else would notice until S7/S9 rendered
// an empty box, so pin them by size as well as existence.
const EXTRACTED_ASSETS = [
  { file: 'assets/el-caldero-overview.jpg', minBytes: 400000, magic: [0xFF, 0xD8, 0xFF] },
  { file: 'assets/mp9-kit.png',             minBytes: 1500000, magic: [0x89, 0x50, 0x4E, 0x47] },
];

test('assets — the overview map and MP9 art are committed and are real images', () => {
  for (const a of EXTRACTED_ASSETS) {
    const full = path.join(ROOT, a.file);
    assert.ok(fs.existsSync(full), a.file + ' is missing — re-extract it from the prototype');
    const buf = fs.readFileSync(full);
    assert.ok(buf.length >= a.minBytes,
      a.file + ' is ' + buf.length + ' bytes — looks like a stub, not the full asset');
    assert.deepStrictEqual(Array.from(buf.subarray(0, a.magic.length)), a.magic,
      a.file + ' does not start with the right magic bytes');
  }
});

test('assets — the prototype resource map is documented, not just the data URIs', () => {
  // The miss that made an earlier pass of this audit wrong: the prototype
  // embeds art TWICE, and grepping only for data: URIs finds 11 of 14 images.
  const readme = fs.readFileSync(path.join(ROOT, 'assets/README.md'), 'utf8');
  assert.ok(/resource map/i.test(readme), 'the second embedding scheme is not documented');
  assert.ok(readme.includes('c80b3bdb-1e5d-4398-bfbb-6c0c8cf3994a'), 'the overview map id is not recorded');
  assert.ok(readme.includes('014b0eba-df01-4a7f-b893-70cfd556706e'), 'the MP9 id is not recorded');
});

test('assets — the prototype placeholder photo is not in the repo', () => {
  // The third image in the resource map is a personal photograph of a child
  // that was sitting in the designer's "Player portrait" slot at export. It is
  // not game art and must never ship. Recorded so nobody "completes the set".
  assert.ok(!fs.existsSync(path.join(ROOT, 'assets/portraits/player.webp')),
    'the prototype placeholder photo was committed — remove it');
  const readme = fs.readFileSync(path.join(ROOT, 'assets/README.md'), 'utf8');
  assert.ok(readme.includes('628457ae-2fce-4760-bc22-98217fcdb538'),
    'the excluded third image is not documented, so someone will extract it again');
});
