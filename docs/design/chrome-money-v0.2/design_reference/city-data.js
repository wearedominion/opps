/* ============================================================================
 * OPPS — City / Building data module
 * ----------------------------------------------------------------------------
 * Single source of truth for the procedural city. Produces the city as DATA
 * (plain objects), so every consumer — the 2D SVG atlas, the 3D WebGL view,
 * and any future gameplay system (territory control, building ownership,
 * upgrades, events) — reads the same building objects rather than re-deriving
 * geometry of its own.
 *
 * Loaded as a plain global script (window.OPPSCity); no build step, no imports.
 *   const city = window.OPPSCity.generateCity();   // -> { buildings, ... }
 *
 * A "building" is a first-class object you can extend with gameplay state:
 *   { id, x, y, w, h, tier, gold }
 * Future features should attach their own fields (owner, level, hp, …) to
 * these objects rather than tracking a parallel list.
 * ==========================================================================*/
(function (root) {
  'use strict';

  // ---- Tunable configuration -------------------------------------------------
  var CITY = {
    seed: 20260611,
    W: 1240,          // full map canvas (SVG user units)
    H: 2300,

    // Downtown core: parcels closer to this point trend toward taller tiers,
    // the outskirts toward single-family homes.
    downtown: { x: 400, y: 1000, radius: 1450, falloff: 1.6, peak: 4.2 },

    // Visible-city extent used for pan / zoom clamping + centering. Narrower
    // than W/H because the outer canvas carries bleed (roads, river tails).
    // panMargin = fraction of city width you may overscroll past each edge.
    bounds: { w: 1100, h: 1980, cx: 381, cy: 866, panMargin: 0.2 },

    // Five building size tiers, smallest -> largest. `frac` is the footprint
    // as a fraction of its parcel cell (used by the 2D atlas); `color3d`,
    // `hBase`, `hSpan` drive the 3D extrusion (height = footprint-edge *
    // (hBase + rand*hSpan)). 2D fill/edge are the flat-map greys.
    tiers: [
      { id: 1, name: 'Single-family house', frac: 0.46, fill2d: '#1f2229', edge2d: '#2a2e37', color3d: 0x434b59, hBase: 0.85, hSpan: 0.2 },
      { id: 2, name: 'Townhouse / small multi-unit', frac: 0.58, fill2d: '#282d36', edge2d: '#343b46', color3d: 0x4e5667, hBase: 1.5, hSpan: 0.5 },
      { id: 3, name: 'Mid-rise', frac: 0.70, fill2d: '#333a45', edge2d: '#404853', color3d: 0x5a6376, hBase: 2.5, hSpan: 0.7 },
      { id: 4, name: 'High-rise', frac: 0.83, fill2d: '#3f4754', edge2d: '#4d5664', color3d: 0x667085, hBase: 4.0, hSpan: 1.1 },
      { id: 5, name: 'Downtown skyscraper', frac: 0.96, fill2d: '#4c5666', edge2d: '#5b6571', color3d: 0x737e94, hBase: 5.5, hSpan: 2.5 }
    ],

    // Rare "objective" building (drops/special targets), independent of tiers.
    gold: { fill2d: '#39352a', edge2d: '#474132', color3d: 0x39352a },

    // Territory control. Each building is owned by the nearest anchor whose
    // normalised distance (dist / radius) <= 1, else 'neutral'. Anchors line up
    // with the turf pins on the map. This is the seed of the ownership system —
    // gameplay can flip a building's `owner` at runtime (see claimSel).
    factions: {
      player:  { id: 'player',  name: 'Your Crew',        color: '#f5902a' },
      rival:   { id: 'rival',   name: 'Rival Territory',   color: '#e23b2e' },
      neutral: { id: 'neutral', name: 'Unclaimed',         color: '#5b6571' }
    },
    territory: {
      anchors: [
        { x: 430, y: 1010, owner: 'player', turf: 'BASE',            radius: 380 },
        { x: 845, y: 968,  owner: 'rival',  turf: 'CALDERO CARTEL',  radius: 320 },
        { x: 905, y: 1640, owner: 'rival',  turf: 'THE HOOK',        radius: 300 },
        { x: 600, y: 1352, owner: 'rival',  turf: 'MERCER ST CRIPS', radius: 250 },
        { x: 815, y: 2040, owner: 'rival',  turf: 'HELLHOUNDS MC',   radius: 300 },
        { x: 470, y: 360,  owner: 'rival',  turf: 'CROFT SOCIETY',   radius: 280 }
      ]
    },

    // 3D view camera + sun. `target` is the orbit pivot (player BASE); `sun.dir`
    // is a direction vector (un-normalised ok) the renderer scales by `dist`.
    // Shared here so the 2D and 3D views agree on where "home" is.
    camera: {
      target: { x: 430, y: 1010 },
      orbit: { phi: 0.95, dist: 780, phiRange: [0.3, 1.25], distRange: [240, 2100] },
      sun: { dir: [0.62, 0.46, -0.64], dist: 2600, intensity: 1.56 }
    }
  };

  // Flat palette for everything that isn't a building. Tier colours are folded
  // in (bldgTiers / bldgTierEdges) so the 2D renderer can index by tier.
  function makeColors() {
    return {
      bg: '#494741', road: '#494741', block: '#121214', blockEdge: '#1b1c20',
      bldg: '#262a31', bldgEdge: '#31363e',
      bldgY: CITY.gold.fill2d, bldgYEdge: CITY.gold.edge2d,
      water: '#073245', park: '#1d2419', parkEdge: '#272f20',
      label: '#8a919c', laneY: '#d1b55d', ave: '#63666d',
      bldgTiers: CITY.tiers.map(function (t) { return t.fill2d; }),
      bldgTierEdges: CITY.tiers.map(function (t) { return t.edge2d; })
    };
  }

  // ---- Generation ------------------------------------------------------------
  function generateCity(seed) {
    var W = CITY.W, H = CITY.H, dt = CITY.downtown;
    var s = (seed == null ? CITY.seed : seed) >>> 0;
    var rnd = function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    var C = makeColors();

    // non-uniform street grid
    var px = [0], py = [0], ax = 0, ay = 0, seg;
    for (;;) { seg = 92 + rnd() * 82; if (ax + seg > W - 70) break; ax += seg; px.push(ax); }
    px.push(W);
    for (;;) { seg = 96 + rnd() * 74; if (ay + seg > H - 76) break; ay += seg; py.push(ay); }
    py.push(H);

    // blocks + building parcels + parks
    var blocks = [], bldgs = [], parks = [];
    var fracByTier = [0].concat(CITY.tiers.map(function (t) { return t.frac; })); // 1-indexed
    for (var i = 0; i < px.length - 1; i++) for (var j = 0; j < py.length - 1; j++) {
      var mL = i % 3 === 0 ? 15 : 9, mR = (i + 1) % 3 === 0 ? 15 : 9, mT = j % 4 === 1 ? 15 : 9, mB = (j + 1) % 4 === 1 ? 15 : 9;
      var x0 = px[i] + mL, x1 = px[i + 1] - mR, y0 = py[j] + mT, y1 = py[j + 1] - mB;
      var bw = x1 - x0, bh = y1 - y0;
      if (bw < 28 || bh < 28) continue;
      if (rnd() < 0.04) { parks.push({ x: x0, y: y0, w: bw, h: bh }); continue; }
      blocks.push({ x: x0, y: y0, w: bw, h: bh });
      var cols = bw > 112 ? 3 : bw > 70 ? 2 : 1, rows = bh > 120 ? 3 : bh > 78 ? 2 : 1;
      var gw = (bw - 8) / cols, gh = (bh - 8) / rows;
      for (var a = 0; a < cols; a++) for (var b = 0; b < rows; b++) {
        var r1 = rnd();
        if (r1 < 0.18) continue;
        // parcel centre -> distance from downtown core -> size tier
        var cxp = x0 + (a + 0.5) * gw, cyp = y0 + (b + 0.5) * gh;
        var closeness = Math.max(0, 1 - Math.hypot(cxp - dt.x, cyp - dt.y) / dt.radius); // 1 at core, 0 at edge
        var mean = 1 + Math.pow(closeness, dt.falloff) * dt.peak; // outskirts ~ single-family, core ~ skyscraper
        var tier = Math.max(1, Math.min(5, Math.round(mean + (rnd() - 0.5) * 2.0)));
        var frac = fracByTier[tier];
        var pw = Math.max(10, Math.min(gw - 4, gw * frac + (rnd() - 0.5) * 5));
        var ph = Math.max(10, Math.min(gh - 4, gh * frac + (rnd() - 0.5) * 5));
        var jx = (gw - pw) * (0.3 + rnd() * 0.4), jy = (gh - ph) * (0.3 + rnd() * 0.4);
        bldgs.push({
          id: 'b' + bldgs.length,
          x: x0 + 4 + a * gw + jx, y: y0 + 4 + b * gh + jy,
          w: pw, h: ph, tier: tier, gold: r1 > 0.94,
          yl: r1 > 0.94 // legacy alias kept for existing renderers
        });
      }
    }
    parks.push({ x: 1000, y: 260, w: 200, h: 170 }, { x: 250, y: 420, w: 170, h: 130 }, { x: 140, y: 1160, w: 200, h: 160 }, { x: 700, y: 1700, w: 300, h: 230 }, { x: 1010, y: 1430, w: 160, h: 140 });

    // assign territory ownership: nearest in-range anchor wins, else neutral
    var anchors = CITY.territory.anchors;
    bldgs.forEach(function (b) {
      var bx = b.x + b.w / 2, by = b.y + b.h / 2, best = null, bestN = Infinity;
      for (var k = 0; k < anchors.length; k++) {
        var an = anchors[k], nd = Math.hypot(bx - an.x, by - an.y) / an.radius;
        if (nd <= 1 && nd < bestN) { bestN = nd; best = an; }
      }
      b.owner = best ? best.owner : 'neutral';
      b.turf = best ? best.turf : '';
    });

    // major-road lane markings + crosswalks
    var vLines = [], hLines = [];
    for (var vi = 1; vi < px.length - 1; vi++) if (vi % 3 === 0) vLines.push(px[vi]);
    for (var hj = 1; hj < py.length - 1; hj++) if (hj % 4 === 1) hLines.push(py[hj]);
    var cross = [];
    vLines.forEach(function (x) {
      hLines.forEach(function (y) {
        cross.push({ x1: x - 13, y1: y - 21, x2: x + 13, y2: y - 21 });
        cross.push({ x1: x - 13, y1: y + 21, x2: x + 13, y2: y + 21 });
        cross.push({ x1: x - 21, y1: y - 13, x2: x - 21, y2: y + 13 });
        cross.push({ x1: x + 21, y1: y - 13, x2: x + 21, y2: y + 13 });
      });
    });
    var avenues = ['M-12 460 L1252 1240', 'M-12 1900 L860 -12', 'M180 2312 L1252 1430', 'M-12 980 L640 -12', 'M520 2312 L1252 1860', 'M-12 1560 L760 2312', 'M620 -12 L1252 760'];
    var river = 'M980 -20 C 900 360, 1060 620, 860 940 C 700 1190, 520 1330, 540 1620 C 556 1860, 430 2080, 470 2320';
    var bridges = [['M880 300', 'L990 312'], ['M880 766', 'L1000 752'], ['M600 1208', 'L716 1244'], ['M478 1500', 'L604 1488'], ['M414 2012', 'L548 1996']];
    var pins = [
      { x: 430, y: 1010, color: '#f5902a', label: 'BASE',            sub: 'Your turf \u00b7 Downtown', pulse: true },
      { x: 845, y: 968,  color: '#e23b2e', label: 'CALDERO CARTEL',  sub: 'East Caldero \u00b7 8/8' },
      { x: 905, y: 1640, color: '#e23b2e', label: 'THE HOOK',        sub: 'Harborside \u00b7 6/8' },
      { x: 600, y: 1352, color: '#e23b2e', label: 'MERCER ST CRIPS', sub: 'Dunbar Flats \u00b7 5/8' },
      { x: 815, y: 2040, color: '#e23b2e', label: 'HELLHOUNDS MC',   sub: 'Salton Corridor \u00b7 7/8' },
      { x: 470, y: 360,  color: '#e23b2e', label: 'CROFT SOCIETY',   sub: 'Corona Heights \u00b7 6/8' },
      { x: 700, y: 1480, color: '#bfce1c', label: 'DROP',            sub: 'Reward \u00b7 19:48' },
      { x: 250, y: 1850, color: '#bfce1c', label: 'STASH',           sub: 'Reward \u00b7 $400' }
    ];
    var labels = [
      { x: 70,  y: 205,  t: 'Westshore',       sub: 'The Coast',       size: 21, rot: 0,  op: 0.82 },
      { x: 360, y: 258,  t: 'Corona Heights',  sub: 'The Hill',        size: 21, rot: 0,  op: 0.82 },
      { x: 980, y: 232,  t: 'Colinas Hills',   sub: 'The Hills',       size: 21, rot: 0,  op: 0.85 },
      { x: 250, y: 945,  t: 'Downtown',        sub: 'The Core',        size: 26, rot: 0,  op: 1 },
      { x: 822, y: 832,  t: 'East Caldero',    sub: 'The East',        size: 22, rot: 72, op: 0.78 },
      { x: 520, y: 1288, t: 'Dunbar Flats',    sub: 'The Flats',       size: 22, rot: 0,  op: 0.8 },
      { x: 96,  y: 1440, t: 'Holloway Park',   sub: 'The Commons',     size: 21, rot: 0,  op: 0.82 },
      { x: 770, y: 1560, t: 'Harborside',      sub: 'The Port',        size: 21, rot: 0,  op: 0.85 },
      { x: 255, y: 2010, t: 'Valle Verde',     sub: 'The Valle',       size: 22, rot: 0,  op: 0.8 },
      { x: 760, y: 2120, t: 'Salton Corridor', sub: 'End of the Line', size: 20, rot: 0,  op: 0.8 }
    ];

    return {
      W: W, H: H, C: C,
      blocks: blocks, bldgs: bldgs, parks: parks,
      vLines: vLines, hLines: hLines, cross: cross,
      avenues: avenues, river: river, bridges: bridges,
      pins: pins, labels: labels,
      // shared definitions so the 3D view and gameplay read the same tiers/bounds
      tiers: CITY.tiers, gold: CITY.gold, bounds: CITY.bounds, factions: CITY.factions, camera: CITY.camera
    };
  }

  var api = { CITY: CITY, generateCity: generateCity };
  if (root) root.OPPSCity = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
