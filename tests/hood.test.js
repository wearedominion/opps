// S9 The Hood — 2D / 3D / Overview, selection and the claim (DOM-118).
// Part of the suite; run it all with `node tests/run.js`.

const {
  fs, path, vm, assert, ROOT, readAllCss, CITY_DATA, XP_SPEC, TABLE, test,
} = require('./harness');

const XP = require(path.join(ROOT, 'js/xp.js'));

// js/map.js is an IIFE that only touches the DOM inside its functions, so the
// data layer and the claim can be exercised without one.
function loadMap(over) {
  const o = over || {};
  const paid = [];
  const G = Object.assign({ level: 1, clout: 0, turf: {}, xpFirsts: {} }, o.G || {});
  const ctx = {
    console, JSON, Object, Math, Array, String, Number, Date, Map, Set,
    CITY: 'city' in o ? o.city : CITY_DATA,
    XP_SYSTEM: XP_SPEC, PROGRESSION: TABLE, G,
    // Bound to the spec: the resolvers default to a global XP_SYSTEM, and the
    // required module cannot see the one inside this vm.
    XpAwards: {
      territoryBuilding: t => XP.XpAwards.territoryBuilding(t, XP_SPEC),
      territoryObjective: () => XP.XpAwards.territoryObjective(XP_SPEC),
    },
    awardXp: (weight, label, opts) => {
      const c = XP.xpToClout(weight, G.level, TABLE);
      paid.push({ weight, label, clout: c, ref: opts && opts.ref });
      G.clout += c;
      return c;
    },
    REASON: { TERRITORY_CLAIM: 'territory_claim' },
    toast: () => {}, log: () => {},
    GameState: { save: () => {} },
    registerScreen: () => {},
    document: {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {},
      createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
    },
    requestAnimationFrame: () => {},
    window: {},
  };
  const src = fs.readFileSync(path.join(ROOT, 'js/map.js'), 'utf8')
    + '\n;globalThis.__t = { GameMap };';
  vm.runInNewContext(src, ctx);
  return { map: ctx.__t.GameMap, G, paid };
}

console.log('\nS9 The Hood — DOM-118');

// ─────────────────────────────────────────────
//  The city finally comes from the file
// ─────────────────────────────────────────────

test('the city is data/city.json, not a hardcoded copy of it', () => {
  // DOM-123 extracted this file and nothing ever read it: js/map.js generated
  // from its own literal seed, so every building rendered the same flat grey
  // and the five tiers, the downtown falloff and the faction anchors sat unused.
  const src = fs.readFileSync(path.join(ROOT, 'js/map.js'), 'utf8');
  assert.ok(/cityFile\(\)/.test(src), 'the map is not reading the city file');
  const d = loadMap().map.data();
  assert.strictEqual(d.W, CITY_DATA.W);
  assert.strictEqual(d.H, CITY_DATA.H);
  assert.strictEqual(d.labels.length, CITY_DATA.labels.length, 'labels are still the built-ins');
  assert.strictEqual(d.pins.length, CITY_DATA.pins.length, 'pins are still the built-ins');
  assert.deepStrictEqual(Object.keys(d.factions).sort(), ['neutral', 'player', 'rival']);
});

test('every parcel carries a tier from the file and an owner from the anchors', () => {
  const d = loadMap().map.data();
  assert.ok(d.bldgs.length > 100, 'the city is empty');
  const tierIds = new Set(CITY_DATA.tiers.map(t => t.id));
  const seenTiers = new Set(), owners = new Set(), ids = new Set();
  for (const b of d.bldgs) {
    assert.ok(tierIds.has(b.tier), b.id + ' has an unknown tier ' + b.tier);
    assert.ok(b.fill && b.edge, b.id + ' has no tier colours');
    assert.ok(!ids.has(b.id), 'duplicate parcel id ' + b.id);
    ids.add(b.id); seenTiers.add(b.tier); owners.add(b.owner);
  }
  assert.strictEqual(seenTiers.size, CITY_DATA.tiers.length, 'not every tier is built');
  // the anchors put real territory on the map, not one owner everywhere
  assert.ok(owners.has('player') && owners.has('rival') && owners.has('neutral'), [...owners].join(','));
});

test('the same seed builds the same city twice', () => {
  // The parcel id is a save key — G.turf points at it — so a regeneration that
  // shuffled the grid would silently move every claim onto a different block.
  const a = loadMap().map.data().bldgs.map(b => b.id + ':' + b.tier).join('|');
  const b = loadMap().map.data().bldgs.map(b => b.id + ':' + b.tier).join('|');
  assert.strictEqual(a, b);
});

test('a missing city file leaves a city standing', () => {
  const d = loadMap({ city: null }).map.data();
  assert.ok(d.bldgs.length > 100, 'the map went down with the fetch');
  assert.ok(d.labels.length > 0 && d.pins.length > 0);
});

// ─────────────────────────────────────────────
//  Claiming
// ─────────────────────────────────────────────

test('a claim pays the territory table by tier, and the engine does the pricing', () => {
  // The prices are DOM-124's, read out of data/xp-system.json. Nothing in the
  // map knows what a tier is worth.
  for (const tier of [1, 2, 3, 4, 5]) {
    const { map, G, paid } = loadMap();
    const b = map.data().bldgs.find(x => x.tier === tier && x.owner !== 'player' && !x.objective);
    if (!b) continue;
    map.select(b.id);
    map.claim();
    assert.strictEqual(map.ownerOf(b), 'player', 'tier ' + tier + ' did not change hands');
    assert.ok(G.turf[b.id], 'the claim did not persist');
    assert.strictEqual(paid.length, 1);
    assert.strictEqual(paid[0].weight, XP_SPEC.actionXp.territory.claimBuildingByTier[String(tier)],
      'tier ' + tier + ' paid the wrong weight');
  }
});

test('an objective site is worth more than the block it stands on', () => {
  const { map, paid } = loadMap();
  const obj = map.data().bldgs.find(b => b.objective && b.owner !== 'player');
  if (!obj) return;                                   // seed-dependent; skip rather than fake one
  map.select(obj.id);
  map.claim();
  assert.strictEqual(paid[0].weight, XP_SPEC.actionXp.territory.claimObjectiveBuilding);
  assert.ok(paid[0].weight > XP_SPEC.actionXp.territory.claimBuildingByTier['5']);
});

test('claiming what is already yours pays nothing, however often it is pressed', () => {
  const { map, G, paid } = loadMap();
  const b = map.data().bldgs.find(x => x.owner !== 'player' && !x.objective);
  map.select(b.id);
  map.claim();
  const after = G.clout;
  for (let i = 0; i < 10; i++) map.claim();
  assert.strictEqual(paid.length, 1, 'turf is a repeatable faucet');
  assert.strictEqual(G.clout, after);
});

test('a parcel already inside your own territory is not a free claim', () => {
  const { map, paid } = loadMap();
  const mine = map.data().bldgs.find(x => x.owner === 'player');
  assert.ok(mine, 'the base anchor owns nothing');
  map.select(mine.id);
  map.claim();
  assert.strictEqual(paid.length, 0);
});

// ─────────────────────────────────────────────
//  Modes and geometry
// ─────────────────────────────────────────────

test('the three modes are named, and each has its own hint', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/map.js'), 'utf8');
  for (const mode of ['2d', '3d', 'overview']) {
    assert.ok(new RegExp("'" + mode + "':").test(src), 'no hint copy for ' + mode);
  }
  assert.ok(/DRAG TO ORBIT/.test(src) && /PINCH TO ZOOM/.test(src) && /FULL CITY/.test(src));
  // and the CSS, not a rebuild, is what decides which controls exist
  const css = readAllCss();
  assert.ok(/\[data-mode="overview"\] #map-container\s*\{[^}]*display:\s*none/.test(css));
  assert.ok(/\[data-mode="overview"\] \.map-ov-stack\s*\{[^}]*display:\s*flex/.test(css));
});

test('each control stack sets its own display exactly once', () => {
  // The Overview zoom buttons showed up in 2D because a later shared rule
  // re-declared `display` for the stack that an earlier rule had hidden —
  // both single-class, so the later one won.
  // The precise shape of that bug: one selector list naming BOTH stacks and
  // setting display, which necessarily overrides whichever was hidden.
  const css = readAllCss();
  const shared = css.match(/[^{}]*\.map-ov-stack[^{}]*\{[^}]*display:[^}]*\}/g) || [];
  const both = shared.filter(r => /\.map-2d-stack/.test(r.split('{')[0]));
  assert.deepStrictEqual(both, [], 'one rule sets display for both control stacks');
  // and the unconditional rule hides it, so only a mode can show it
  assert.ok(/(^|\n)\.map-ov-stack\s*\{[^}]*display:\s*none/.test(css),
    '.map-ov-stack is not hidden by default');
});

test('the overview raster is committed, at the size the clamp assumes', () => {
  const art = path.join(ROOT, 'assets/el-caldero-overview.jpg');
  assert.ok(fs.existsSync(art), 'the overview art is missing');
  assert.ok(fs.statSync(art).size > 50000, 'the overview art is a placeholder');
  const src = fs.readFileSync(path.join(ROOT, 'js/map.js'), 'utf8');
  assert.ok(/iw = 1200, ih = 2150/.test(src), 'the cover-fit maths has drifted from the asset');
  assert.ok(/OV_MIN = 1, OV_MAX = 1\.8/.test(src), 'the zoom clamp is not the doc\'s 1 to 1.8');
});

test('the hood is the one screen with no padding, and its vignette never eats a gesture', () => {
  const css = readAllCss();
  assert.ok(/\.map-outer\s*\{[^}]*height:\s*100%/.test(css));
  assert.ok(/\.map-outer\s*\{[^}]*overflow:\s*hidden/.test(css));
  assert.ok(/\.map-vignette\s*\{[^}]*pointer-events:\s*none/.test(css), 'the vignette would swallow taps');
  assert.ok(/\.map-hint\s*\{[^}]*pointer-events:\s*none/.test(css), 'the hint would swallow taps');
});

// ─────────────────────────────────────────────
//  DOM-134 — the Overview clamp, and centering that is visible
// ─────────────────────────────────────────────

// The clamp is geometry, so it is worth running rather than grepping. This
// stub is a real enough DOM for the overview: a wrapper with a size that
// collects its own listeners, and an img whose style object we can read back.
function loadOverview(W, H) {
  const handlers = {};
  const attrs = {};
  const wrap = {
    clientWidth: W, clientHeight: H,
    addEventListener: (ev, fn) => { (handlers[ev] = handlers[ev] || []).push(fn); },
    setPointerCapture: () => {},
  };
  const img = { style: {} };
  const outer = { setAttribute: (k, v) => { attrs[k] = v; } };
  const ctx = {
    console, JSON, Object, Math, Array, String, Number, Date, Map, Set,
    CITY: CITY_DATA, XP_SYSTEM: XP_SPEC, PROGRESSION: TABLE,
    G: { level: 1, clout: 0, turf: {}, xpFirsts: {} },
    toast: () => {}, log: () => {}, GameState: { save: () => {} },
    registerScreen: () => {},
    document: {
      getElementById: id => (id === 'map-overview' ? wrap : id === 'map-overview-img' ? img : null),
      querySelector: sel => (sel === '.map-outer' ? outer : sel === '.map-hint' ? { textContent: '' } : null),
      querySelectorAll: () => [],
      addEventListener: () => {},
      createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
    },
    requestAnimationFrame: () => {},
    window: {},
  };
  const src = fs.readFileSync(path.join(ROOT, 'js/map.js'), 'utf8')
    + '\n;globalThis.__t = { GameMap };';
  vm.runInNewContext(src, ctx);
  const map = ctx.__t.GameMap;

  const fire = (ev, e) => (handlers[ev] || []).forEach(fn => fn(e));
  // One finger down, one move, one up — the pan path, not a synthetic setter.
  const drag = (dx, dy) => {
    fire('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 });
    fire('pointermove', { pointerId: 1, clientX: dx, clientY: dy });
    fire('pointerup', { pointerId: 1 });
  };
  const xf = () => {
    const m = /translate\(([-\d.]+)px,([-\d.]+)px\) scale\(([\d.]+)\)/.exec(img.style.transform);
    assert.ok(m, 'no transform written: ' + img.style.transform);
    return { tx: +m[1], ty: +m[2], s: +m[3] };
  };
  const px = v => parseFloat(v);
  return { map, img, attrs, drag, xf, px, W, H };
}

// 1200x2150 raster in a 402-wide frame: the height is the binding dimension,
// so the cover box is wider than the frame and exactly as tall.
const COVER = (W, H) => {
  const s = Math.max(W / 1200, H / 2150);
  return { w: 1200 * s, h: 2150 * s };
};

test('the overview raster is given its cover box, not cropped inside the wrapper', () => {
  const o = loadOverview(402, 780);
  o.map.setMode('overview');
  const c = COVER(402, 780);
  assert.ok(Math.abs(o.px(o.img.style.width) - c.w) < 0.01, o.img.style.width);
  assert.ok(Math.abs(o.px(o.img.style.height) - c.h) < 0.01, o.img.style.height);
  // and centred, so transform-origin:center scales about the frame's centre
  assert.ok(Math.abs(o.px(o.img.style.left) - (402 - c.w) / 2) < 0.01, o.img.style.left);
  assert.ok(Math.abs(o.px(o.img.style.top) - (780 - c.h) / 2) < 0.01, o.img.style.top);

  // The CSS must not also be cropping: object-fit would put the raster back
  // inside a box the clamp no longer describes.
  const css = readAllCss();
  const rule = /\.map-overview img\s*\{([^}]*)\}/.exec(css);
  assert.ok(rule, 'the overview img rule is gone');
  assert.ok(!/object-fit/.test(rule[1]), 'object-fit is back, and the clamp is a lie again');
  assert.ok(/position:\s*absolute/.test(rule[1]));
});

test('pan stops with the raster edge flush to the frame, never past it', () => {
  const o = loadOverview(402, 780);
  o.map.setMode('overview');
  const c = COVER(402, 780);

  // Drag far right at 1.0x. The cover box is wider than the frame, so there IS
  // room — bounded by exactly the overhang on one side.
  o.drag(5000, 0);
  const v = o.xf();
  assert.ok(Math.abs(v.tx - (c.w - 402) / 2) < 0.01, 'tx clamp: ' + v.tx);
  // The edge of the raster lands exactly on the edge of the frame: left offset
  // plus pan is zero, so no wrapper background shows. This is the invariant the
  // doc states, and the one the old clamp broke.
  assert.ok(Math.abs(o.px(o.img.style.left) + v.tx) < 0.01, 'a background sliver is showing');
});

test('at 1.0x there is no pan along the axis the cover box does not overhang', () => {
  // 402x780 against 1200x2150: height binds, so the cover box is exactly 780
  // tall and vertical pan must be zero. The old clamp allowed it, and what it
  // revealed was #0b0b0c.
  const o = loadOverview(402, 780);
  o.map.setMode('overview');
  o.drag(0, 5000);
  assert.strictEqual(o.xf().ty, 0, 'panned into the wrapper background');
});

test('zooming in opens up pan on both axes, still bounded by the raster', () => {
  const o = loadOverview(402, 780);
  o.map.setMode('overview');
  o.map.ovZoom(100);                 // clamped to OV_MAX
  const v0 = o.xf();
  assert.strictEqual(v0.s, 1.8, 'the zoom clamp moved');
  o.drag(-5000, -5000);
  const c = COVER(402, 780), v = o.xf();
  assert.ok(Math.abs(v.tx + (c.w * 1.8 - 402) / 2) < 0.01, 'tx: ' + v.tx);
  assert.ok(Math.abs(v.ty + (c.h * 1.8 - 780) / 2) < 0.01, 'ty: ' + v.ty);
  o.map.ovReset();
  assert.deepStrictEqual(o.xf(), { tx: 0, ty: 0, s: 1 });
});

test('centering the map takes it to 2D first, whatever mode it was left in', () => {
  // crewGoToMap and the opp card both land here. Centering the hidden 2D layer
  // while Overview or 3D is on screen looks exactly like a dead button.
  const o = loadOverview(402, 780);
  o.map.setMode('overview');
  assert.strictEqual(o.attrs['data-mode'], 'overview');
  o.map.centerOn(381, 866);
  assert.strictEqual(o.attrs['data-mode'], '2d', 'centred a layer nobody can see');

  // and centerBase goes through the same door
  o.map.setMode('overview');
  o.map.centerBase();
  assert.strictEqual(o.attrs['data-mode'], '2d');
});
