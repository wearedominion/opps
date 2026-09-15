// The JSON data files (DOM-123).
// Part of the suite; run it all with `node tests/run.js`.

const { fs, path, assert, ROOT, TUNE, QUESTS_DATA, CITY_DATA, test } = require('./harness');

console.log('\nDOM-123 — data files');

const readData = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
const GEAR_DATA   = readData('gear.json');
const SKILLS_DATA = readData('skills.json');
const PLUGS_DATA_ = readData('plugs.json');
const MOVES_DATA  = readData('moves.json');

// The 7 permanent slot keys (DOM-121). Order is the paper-doll reading order.
const SLOT_IDS = ['head', 'torso', 'handR', 'handL', 'legs', 'ride', 'stash'];

test('gear.json — ids are unique, lowercase, and stable save keys', () => {
  const ids = GEAR_DATA.map(g => g.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'duplicate item id');
  for (const id of ids) {
    assert.strictEqual(id, id.toLowerCase(), id + ' is not lowercase');
    assert.ok(/^[a-z0-9]+$/.test(id), id + ' has characters that are awkward as a save key');
  }
});

test('gear.json — every item carries the fields a screen reads', () => {
  for (const g of GEAR_DATA) {
    for (const k of ['id', 'name', 'desc', 'type', 'slot', 'tier', 'levelReq', 'rarity', 'price']) {
      assert.ok(g[k] !== undefined, g.id + ' is missing ' + k);
    }
    for (const k of ['atk', 'def', 'hp', 'price', 'tier', 'levelReq']) {
      assert.strictEqual(typeof g[k], 'number', g.id + '.' + k + ' is not a number');
    }
  }
});

test('gear.json — every item sits in one of the 7 permanent slots', () => {
  for (const g of GEAR_DATA) {
    assert.ok(SLOT_IDS.includes(g.slot), g.id + ' has unknown slot "' + g.slot + '"');
  }
});

test('gear.json — slot agrees with the legacy type it was derived from', () => {
  // The transitional `type` and the new `slot` must not drift apart while both
  // exist; DOM-120/DOM-121 retire `type`.
  const ALLOWED = {
    weapon:  ['handR', 'handL'],
    armor:   ['torso', 'handL', 'head', 'legs'],
    vehicle: ['ride'],
    utility: ['stash'],
  };
  for (const g of GEAR_DATA) {
    assert.ok(ALLOWED[g.type], g.id + ' has unknown type "' + g.type + '"');
    assert.ok(ALLOWED[g.type].includes(g.slot),
      g.id + ': type ' + g.type + ' cannot sit in slot ' + g.slot);
  }
});

test('gear.json — the storefront is the non-dropOnly subset, and every one has a vendor', () => {
  const buyable = GEAR_DATA.filter(g => !g.dropOnly);
  assert.ok(buyable.length > 0, 'nothing is buyable');
  assert.ok(buyable.length < GEAR_DATA.length, 'nothing is drop-only');
  for (const g of buyable) assert.ok(g.plug, g.id + ' is buyable with no vendor');
  for (const g of GEAR_DATA.filter(g => g.dropOnly)) {
    assert.ok(!g.plug, g.id + ' is drop-only but carries a vendor');
  }
});

test('gear.json — a row with junk or missing optional fields does not throw', () => {
  const junk = { id: 'mystery', name: 'Mystery Box', type: 'weapon', slot: 'handR',
                 tier: 1, levelReq: 1, rarity: 'grey', price: 1, unexpected: { deep: true } };
  // the defensive reads a renderer makes
  assert.strictEqual(junk.atk || 0, 0);
  assert.strictEqual(junk.desc || '', '');
  assert.strictEqual(!!junk.dropOnly, false);
  assert.strictEqual(SLOT_IDS.includes(junk.slot), true);
});

test('skills.json — one row per tuning skill, with the copy the overlays read', () => {
  const ids = SKILLS_DATA.map(s => s.id);
  assert.deepStrictEqual(ids.slice().sort(), Object.keys(TUNE.skills.cost).sort(),
    'skills.json and tuning.skills.cost disagree on the skill set');
  for (const sk of SKILLS_DATA) {
    for (const k of ['id', 'label', 'build', 'tuning', 'effect', 'buildMeaning', 'note']) {
      assert.ok(sk[k], sk.id + ' is missing ' + k);
    }
    // costs live in tuning.json only — a copy here would drift
    assert.strictEqual(sk.cost, undefined, sk.id + ' duplicates a tuning number');
    assert.ok(TUNE.skills.cost[sk.tuning] !== undefined,
      sk.id + ' points at unknown tuning key "' + sk.tuning + '"');
  }
});

test('plugs.json — matches the roster quests and portraits key off', () => {
  const ids = PLUGS_DATA_.map(p => p.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'duplicate plug id');
  for (const p of PLUGS_DATA_) {
    for (const k of ['id', 'name', 'moniker', 'line']) assert.ok(p[k], p.id + ' is missing ' + k);
    assert.ok(Array.isArray(p.dialog) && p.dialog.length > 0, p.id + ' has no dialog');
  }
  // every quest hangs off a plug that exists — a dangling ref strands the quest
  for (const q of QUESTS_DATA) {
    assert.ok(ids.includes(q.plug), 'quest ' + q.id + ' references unknown plug ' + q.plug);
  }
});

test('moves.json — the sections Make Moves renders are all present', () => {
  assert.ok(MOVES_DATA.featured && MOVES_DATA.featured.objectives.length > 0);
  assert.ok(Array.isArray(MOVES_DATA.side) && MOVES_DATA.side.length > 0);
  assert.ok(MOVES_DATA.daily && MOVES_DATA.daily.goal);
  assert.ok(MOVES_DATA.turf && MOVES_DATA.hoodOps.length === 4);
  assert.ok(Array.isArray(MOVES_DATA.sightings));
  const ids = MOVES_DATA.side.map(q => q.id).concat(MOVES_DATA.featured.id, MOVES_DATA.daily.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'duplicate quest id');
});

test('moves.json — carries no XP numbers (xp-system.json owns them)', () => {
  const blob = JSON.stringify(MOVES_DATA.featured) + JSON.stringify(MOVES_DATA.side)
             + JSON.stringify(MOVES_DATA.daily);
  assert.ok(!/"xp"/.test(blob), 'moves.json duplicates an XP value');
  for (const q of MOVES_DATA.side.concat(MOVES_DATA.featured)) {
    assert.ok(q.kind, q.id + ' has no kind — XP cannot be resolved for it');
  }
});

test('city.json — reproduces the prototype city parameters', () => {
  assert.strictEqual(CITY_DATA.seed, 20260611, 'seed changed — the city would regenerate differently');
  assert.strictEqual(CITY_DATA.W, 1240);
  assert.strictEqual(CITY_DATA.H, 2300);
  assert.strictEqual(CITY_DATA.tiers.length, 5);
  assert.strictEqual(CITY_DATA.territory.anchors.length, 6);
  assert.strictEqual(CITY_DATA.pins.length, 8);
  assert.strictEqual(CITY_DATA.labels.length, 10);
  for (const t of CITY_DATA.tiers) {
    for (const k of ['id', 'name', 'frac', 'fill2d', 'edge2d', 'color3d', 'hBase', 'hSpan']) {
      assert.ok(t[k] !== undefined, 'tier ' + t.id + ' is missing ' + k);
    }
    assert.ok(/^#[0-9a-f]{6}$/.test(t.color3d), 'tier ' + t.id + ' color3d is not a hex string');
  }
});

test('city.json — stores the seed, never the generated buildings', () => {
  assert.strictEqual(CITY_DATA.buildings, undefined);
  assert.strictEqual(CITY_DATA.bldgs, undefined);
});

test('city.json — every turf anchor names a faction that exists, and pins are semantic', () => {
  for (const a of CITY_DATA.territory.anchors) {
    assert.ok(CITY_DATA.factions[a.owner], 'anchor ' + a.turf + ' has unknown owner ' + a.owner);
  }
  // Pins carry a kind, not a colour: the renderer resolves chrome/red/green
  // from the Chrome Money tokens (CLAUDE.md §Map palette).
  for (const pin of CITY_DATA.pins) {
    assert.ok(['player', 'rival', 'drop'].includes(pin.kind), pin.label + ' has unknown kind');
    assert.strictEqual(pin.color, undefined, pin.label + ' hard-codes a colour');
  }
  // the retired amber must not survive the migration anywhere in the file
  assert.ok(!/#f5902a|#bfce1c/i.test(JSON.stringify(CITY_DATA)), 'a retired v1.0 hex survived');
});
