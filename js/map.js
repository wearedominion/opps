// ─────────────────────────────────────────────
//  MAP — Interactive city map (pan / zoom / pinch)
//  Ported from standalone component (React → vanilla JS)
// ─────────────────────────────────────────────

const GameMap = (() => {
  // Internal state
  let _el = null;      // outer clip container
  let _xf = null;      // inner transform element
  let _chip = null;    // zoom label
  let _ptrs = new Map();
  let _mv = null;      // { s, tx, ty }
  let _dataCache = null;

  // ── data ──────────────────────────────────────

  // data/city.json is the city (DOM-123 extracted it; DOM-118 is what finally
  // reads it). The seed, the five building tiers, the downtown falloff, the
  // faction territory anchors, the labels and the pins all come from the file —
  // only the street grid is still derived here, because it is generated from
  // the seed rather than authored. Falls back to the built-ins if the fetch
  // missed, which keeps a dead network from taking the map down.
  function cityFile() {
    return (typeof CITY !== 'undefined' && CITY) || null;
  }

  function mapData() {
    if (_dataCache) return _dataCache;
    const city = cityFile();
    const W = (city && city.W) || 1240, H = (city && city.H) || 2300;
    let s = ((city && city.seed) || 20260611) >>> 0;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };

    const TIERS = (city && city.tiers) || [];
    const DOWN = (city && city.downtown) || null;
    const FACTIONS = (city && city.factions) || {};
    const ANCHORS = (city && city.territory && city.territory.anchors) || [];

    // Which tier a parcel is, biased towards the skyline downtown. The file
    // gives the shape of that bias (radius / falloff / peak) but not the
    // formula, so this is the reading: proximity raises the floor of the roll,
    // and `peak` says how far up it can push.
    function tierFor(cx, cy) {
      if (!TIERS.length) return null;
      let bias = 0;
      if (DOWN) {
        const d = Math.hypot(cx - DOWN.x, cy - DOWN.y) / DOWN.radius;
        const near = Math.pow(Math.max(0, 1 - d), DOWN.falloff || 1);
        bias = near * ((DOWN.peak || 4) / TIERS.length);
      }
      const roll = Math.min(0.999, rnd() * (1 - bias) + bias);
      for (const t of TIERS) if (roll < t.frac) return t;
      return TIERS[TIERS.length - 1];
    }

    // Territory is the anchors' business; a parcel belongs to the first anchor
    // whose radius covers it. G.turf overrides that for anything the player has
    // taken, which is why claiming redraws rather than regenerating.
    function ownerFor(cx, cy) {
      for (const a of ANCHORS) {
        if (Math.hypot(cx - a.x, cy - a.y) <= a.radius) return { owner: a.owner, turf: a.turf };
      }
      return { owner: 'neutral', turf: null };
    }
    // Chrome Money map palette (CLAUDE.md, structural change #5).
    // Values are literals because this SVG is built in JS — CSS custom
    // properties cannot reach it.
    const C = {
      road: '#17171c', block: '#0b0b0c', blockEdge: '#15151a',
      bldg: '#1f1f28', bldgEdge: '#2a2a34', bldgY: '#241f16', bldgYEdge: '#332c1f',
      water: '#0e2430', park: '#141a17', parkEdge: '#1b231d',
      label: '#8e8e9a', district: '#55555f', laneY: '#a8873f', ave: '#26262e'
    };
    const px = [0], py = [0];
    let ax = 0;
    for (;;) { const seg = 92 + rnd() * 82; if (ax + seg > W - 70) break; ax += seg; px.push(ax); }
    px.push(W);
    let ay = 0;
    for (;;) { const seg = 96 + rnd() * 74; if (ay + seg > H - 76) break; ay += seg; py.push(ay); }
    py.push(H);

    const blocks = [], bldgs = [], parks = [];
    for (let i = 0; i < px.length - 1; i++) {
      for (let j = 0; j < py.length - 1; j++) {
        const mL = i % 3 === 0 ? 15 : 9, mR = (i + 1) % 3 === 0 ? 15 : 9;
        const mT = j % 4 === 1 ? 15 : 9, mB = (j + 1) % 4 === 1 ? 15 : 9;
        const x0 = px[i] + mL, x1 = px[i + 1] - mR, y0 = py[j] + mT, y1 = py[j + 1] - mB;
        const bw = x1 - x0, bh = y1 - y0;
        if (bw < 28 || bh < 28) continue;
        if (rnd() < 0.04) { parks.push({ x: x0, y: y0, w: bw, h: bh }); continue; }
        blocks.push({ x: x0, y: y0, w: bw, h: bh });
        const cols = bw > 112 ? 3 : bw > 70 ? 2 : 1, rows = bh > 120 ? 3 : bh > 78 ? 2 : 1;
        const gw = (bw - 8) / cols, gh = (bh - 8) / rows;
        for (let a = 0; a < cols; a++) {
          for (let b = 0; b < rows; b++) {
            const r1 = rnd();
            if (r1 < 0.22) continue;
            const pw = Math.max(14, gw - 6 - rnd() * gw * 0.32);
            const ph = Math.max(14, gh - 6 - rnd() * gh * 0.32);
            const bx = x0 + 4 + a * gw + rnd() * Math.max(0, gw - pw - 4);
            const by = y0 + 4 + b * gh + rnd() * Math.max(0, gh - ph - 4);
            const tier = tierFor(bx + pw / 2, by + ph / 2);
            const own = ownerFor(bx + pw / 2, by + ph / 2);
            bldgs.push({
              // Stable id from the grid position, not an array index: it has to
              // survive a regeneration so a claim in G.turf still points at the
              // same parcel next boot.
              id: 'p' + i + '-' + j + '-' + a + '-' + b,
              x: bx, y: by, w: pw, h: ph, yl: r1 > 0.91,
              tier: tier ? tier.id : 1,
              tierName: tier ? tier.name : 'Parcel',
              fill: tier ? tier.fill2d : null,
              edge: tier ? tier.edge2d : null,
              owner: own.owner, turf: own.turf,
              objective: r1 > 0.985,
            });
          }
        }
      }
    }
    parks.push(
      { x: 1000, y: 260, w: 200, h: 170 }, { x: 250, y: 420, w: 170, h: 130 },
      { x: 140, y: 1160, w: 200, h: 160 }, { x: 700, y: 1700, w: 300, h: 230 },
      { x: 1010, y: 1430, w: 160, h: 140 }
    );

    const vLines = [], hLines = [];
    for (let i = 1; i < px.length - 1; i++) if (i % 3 === 0) vLines.push(px[i]);
    for (let j = 1; j < py.length - 1; j++) if (j % 4 === 1) hLines.push(py[j]);
    const cross = [];
    vLines.forEach(x => hLines.forEach(y => {
      cross.push({ x1: x - 13, y1: y - 21, x2: x + 13, y2: y - 21 });
      cross.push({ x1: x - 13, y1: y + 21, x2: x + 13, y2: y + 21 });
      cross.push({ x1: x - 21, y1: y - 13, x2: x - 21, y2: y + 13 });
      cross.push({ x1: x + 21, y1: y - 13, x2: x + 21, y2: y + 13 });
    }));

    const avenues = [
      'M-12 460 L1252 1240', 'M-12 1900 L860 -12', 'M180 2312 L1252 1430',
      'M-12 980 L640 -12', 'M520 2312 L1252 1860', 'M-12 1560 L760 2312', 'M620 -12 L1252 760'
    ];
    const river = 'M980 -20 C 900 360, 1060 620, 860 940 C 700 1190, 520 1330, 540 1620 C 556 1860, 430 2080, 470 2320';
    const bridges = [
      ['M880 300', 'L990 312'], ['M880 766', 'L1000 752'],
      ['M600 1208', 'L716 1244'], ['M478 1500', 'L604 1488'], ['M414 2012', 'L548 1996']
    ];
    const pins = [
      { x: 430, y: 1010, color: '#e8c98a', label: 'BASE',          sub: 'Your turf',    pulse: true },
      { x: 560, y: 860,  color: '#e0523f', label: 'RIVAL CREW',    sub: 'Threat 3/8' },
      { x: 700, y: 580,  color: '#e0523f', label: 'UNDERCOVER',    sub: 'Threat 8/8' },
      { x: 1080,y: 420,  color: '#e0523f', label: 'RIVAL BOSS',    sub: 'Threat 6/8' },
      { x: 820, y: 2040, color: '#e0523f', label: 'AUTO RING',     sub: 'Threat 6/8' },
      { x: 700, y: 1500, color: '#4fd39a', label: 'DROP',          sub: 'Reward · 19:48' },
      { x: 260, y: 1840, color: '#4fd39a', label: 'STASH',         sub: 'Reward · $400' }
    ];
    const labels = [
      { x: 80,   y: 170,  t: 'Northside',   size: 22 },
      { x: 1008, y: 238,  t: 'Barett Park', size: 20 },
      { x: 480,  y: 640,  t: 'Old Town',    size: 22 },
      { x: 300,  y: 950,  t: 'Downtown',    size: 26 },
      { x: 100,  y: 1450, t: 'Industrial',  size: 24 },
      { x: 580,  y: 1280, t: 'Midtown',     size: 22 },
      { x: 870,  y: 1580, t: 'The Docks',   size: 20 },
      { x: 860,  y: 2120, t: 'Airport',     size: 24 },
      { x: 300,  y: 2020, t: 'Southside',   size: 24 }
    ];
    _dataCache = {
      W, H, C, blocks, bldgs, vLines, hLines, cross,
      parks:    (city && city.parks)    || parks,
      avenues:  (city && city.avenues)  || avenues,
      river:    (city && city.river)    || river,
      bridges:  (city && city.bridges)  || bridges,
      pins:     (city && city.pins)     || pins,
      labels:   (city && city.labels)   || labels,
      factions: FACTIONS,
    };
    return _dataCache;
  }

  // A parcel's owner, with the player's claims on top of the anchors. G.turf is
  // the persistent half — the anchors are the map's starting state.
  function bldgOwner(b) {
    const claimed = (typeof G !== 'undefined' && G && G.turf) ? G.turf[b.id] : null;
    return claimed ? claimed.owner : b.owner;
  }

  function bldgById(id) {
    const d = mapData();
    for (const b of d.bldgs) if (b.id === id) return b;
    return null;
  }

  // ── SVG builder ───────────────────────────────

  function buildSVG() {
    const d = mapData();
    const { W, H, C } = d;
    const ns = 'http://www.w3.org/2000/svg';

    // Helper: create SVG element
    const el = (tag, attrs, content) => {
      let s = `<${tag}`;
      for (const [k, v] of Object.entries(attrs)) {
        if (v !== null && v !== undefined) s += ` ${k}="${v}"`;
      }
      s += content !== undefined ? `>${content}</${tag}>` : '/>';
      return s;
    };

    let out = `<svg viewBox="0 0 ${W} ${H}" xmlns="${ns}" width="${W}" height="${H}" style="display:block;touch-action:none;">`;

    // Background
    out += el('rect', { x: 0, y: 0, width: W, height: H, fill: C.road });

    // Blocks
    out += '<g>';
    d.blocks.forEach(b => { out += el('rect', { x: b.x, y: b.y, width: b.w, height: b.h, rx: 2.5, fill: C.block, stroke: C.blockEdge, 'stroke-width': 1 }); });
    out += '</g>';

    // Buildings. Tier decides the fill; a faction that owns the parcel gets a
    // 2.2px stroke in its colour instead of the 1px tier edge, so territory
    // reads at a glance without a separate overlay.
    out += '<g id="map-bldgs">';
    d.bldgs.forEach(b => {
      const own = bldgOwner(b);
      const fac = d.factions && d.factions[own];
      const owned = own !== 'neutral' && fac;
      out += el('rect', {
        x: b.x, y: b.y, width: b.w, height: b.h, rx: 1.5,
        fill: b.fill || (b.yl ? C.bldgY : C.bldg),
        stroke: owned ? fac.color : (b.edge || (b.yl ? C.bldgYEdge : C.bldgEdge)),
        'stroke-width': owned ? 2.2 : 1,
        'data-bid': b.id,
      });
    });
    out += '</g>';

    // Selection highlight lives in its own group so picking a parcel repaints
    // two rects rather than the whole city.
    out += '<g id="map-sel"></g>';

    // Parks
    out += '<g>';
    d.parks.forEach(p => { out += el('rect', { x: p.x, y: p.y, width: p.w, height: p.h, rx: 6, fill: C.park, stroke: C.parkEdge, 'stroke-width': 1 }); });
    out += '</g>';

    // Major road lane markings (vertical)
    out += '<g>';
    d.vLines.forEach(x => { out += el('line', { x1: x, y1: 0, x2: x, y2: H, stroke: '#a8873f', 'stroke-width': 1.6, 'stroke-dasharray': '11 13', opacity: 0.65 }); });
    out += '</g>';

    // Major road lane markings (horizontal)
    out += '<g>';
    d.hLines.forEach(y => { out += el('line', { x1: 0, y1: y, x2: W, y2: y, stroke: C.laneY, 'stroke-width': 2, opacity: 0.85 }); });
    out += '</g>';

    // Crosswalks
    out += '<g>';
    d.cross.forEach(c => { out += el('line', { x1: c.x1, y1: c.y1, x2: c.x2, y2: c.y2, stroke: '#a8873f', 'stroke-width': 7, 'stroke-dasharray': '2.4 2.6', opacity: 0.7 }); });
    out += '</g>';

    // River (back shadow)
    out += el('path', { d: d.river, fill: 'none', stroke: C.road, 'stroke-width': 58, 'stroke-linecap': 'round' });
    // River
    out += el('path', { d: d.river, fill: 'none', stroke: C.water, 'stroke-width': 46, 'stroke-linecap': 'round' });

    // Avenues
    out += '<g>';
    d.avenues.forEach(p => { out += el('path', { d: p, fill: 'none', stroke: C.ave, 'stroke-width': 28, 'stroke-linecap': 'round', opacity: 0.7 }); });
    out += '</g>';

    // Bridges
    out += '<g>';
    d.bridges.forEach(([m, l]) => { out += el('path', { d: m + l, fill: 'none', stroke: '#2a2a34', 'stroke-width': 10, 'stroke-linecap': 'round' }); });
    out += '</g>';

    // Pulse animation style
    out += `<style>@keyframes mappulse{0%{transform:scale(1);opacity:0.9}60%{transform:scale(2.4);opacity:0}100%{transform:scale(2.4);opacity:0}}</style>`;

    // Pins
    d.pins.forEach(p => {
      out += '<g>';
      if (p.pulse) {
        out += el('circle', { cx: p.x, cy: p.y, r: 9, fill: 'none', stroke: p.color, 'stroke-width': 2, style: 'transform-box:fill-box;transform-origin:center;animation:mappulse 2.4s ease-out infinite' });
      }
      out += el('ellipse', { cx: p.x, cy: p.y + 13, rx: 7, ry: 2.4, fill: 'rgba(0,0,0,0.35)' });
      out += `<path d="M${p.x - 6} ${p.y + 2} L${p.x + 6} ${p.y + 2} L${p.x} ${p.y + 14} Z" fill="${p.color}"/>`;
      out += el('circle', { cx: p.x, cy: p.y - 1, r: 8.5, fill: p.color, stroke: '#161208', 'stroke-width': 2 });
      out += el('circle', { cx: p.x, cy: p.y - 1, r: 3, fill: '#161208' });
      if (p.label) {
        const lw = p.label.length * 6.6 + 18;
        out += '<g>';
        const lh = p.sub ? 26 : 16;
        out += el('rect', { x: p.x + 12, y: p.y - 12, width: lw, height: lh, rx: lh / 2, fill: 'rgba(17,17,22,0.9)', stroke: '#26262e', 'stroke-width': 1 });
        out += el('text', { x: p.x + 19, y: p.y - 1, fill: p.color, style: `font:400 9px Anton,sans-serif;letter-spacing:1px` }, p.label);
        if (p.sub) out += el('text', { x: p.x + 19, y: p.y + 10, fill: '#8e8e9a', style: `font:400 8px 'Space Grotesk',sans-serif` }, p.sub);
        out += '</g>';
      }
      out += '</g>';
    });

    // District labels
    d.labels.forEach(l => {
      // District names sit back from the pins, but by colour rather than by
      // opacity — the contract bans dimming content, and --ghost lands on
      // almost exactly the same rendered value as --muted at 0.55 did.
      out += el('text', { x: l.x, y: l.y, class: 'district-label', fill: C.district, style: `font:400 ${l.size}px Anton,sans-serif;letter-spacing:2px;text-transform:uppercase` }, l.t);
    });

    out += '</svg>';
    return out;
  }

  // ── transform helpers ─────────────────────────

  function view() {
    if (!_mv) {
      const c = _el;
      const minS = _minS();
      const W = c ? c.clientWidth : 360;
      const H = c ? c.clientHeight : 600;
      _mv = { s: minS, tx: (W - 1240 * minS) / 2, ty: (H - 2300 * minS) / 2 };
    }
    return _mv;
  }

  function _minS() {
    return _el ? Math.min(_el.clientWidth / 1240, _el.clientHeight / 2300) : 0.31;
  }

  function apply() {
    if (!_xf || !_el) return;
    const v = view();
    const cW = _el.clientWidth, cH = _el.clientHeight;
    const mW = 1240 * v.s, mH = 2300 * v.s;
    // Center if map fits container; clamp to edges if it overflows
    v.tx = mW <= cW ? (cW - mW) / 2 : Math.min(0, Math.max(cW - mW, v.tx));
    v.ty = mH <= cH ? (cH - mH) / 2 : Math.min(0, Math.max(cH - mH, v.ty));
    _xf.style.transform = `translate(${v.tx}px,${v.ty}px) scale(${v.s})`;
    if (_chip) _chip.textContent = v.s.toFixed(1) + '×';
    _labelSafe(v);
  }

  // The control stack (+ / zoom chip / − / ⊡ / ⌖ / 3D) is a fixed HTML overlay
  // in the top-right corner; district labels are painted into the SVG at world
  // coordinates. Nothing else arbitrates between the two, so any label whose
  // chip would slide under that corner is skipped for as long as it intersects
  // the stack's footprint (DOM-63). Runs on every pan/zoom via apply().
  function _labelSafe(v) {
    if (!_xf || !_el) return;
    const texts = _xf.querySelectorAll('text.district-label');
    if (!texts.length) return;
    const cr = _el.getBoundingClientRect();
    if (!cr.width) return; // map tab not displayed; nothing to arbitrate
    const ctrls = _el.parentElement && _el.parentElement.querySelector('.map-controls');
    const pad = 8;
    // Everything right of the stack's left edge, down to its bottom edge.
    const zx = ctrls ? ctrls.getBoundingClientRect().left - cr.left - pad : cr.width - 60;
    const zh = ctrls ? ctrls.getBoundingClientRect().bottom - cr.top + pad : 280;
    texts.forEach(t => {
      let b = t._bb;
      if (!b || !b.width) b = t._bb = t.getBBox(); // world-space, constant per build
      if (!b.width) return;
      const sx = b.x * v.s + v.tx, sy = b.y * v.s + v.ty;
      const hit = sx + b.width * v.s > zx && sy < zh && sy + b.height * v.s > 0;
      t.style.visibility = hit ? 'hidden' : 'visible';
    });
  }

  function zoomBy(f, cx, cy) {
    const v = view();
    const ns = Math.min(3, Math.max(_minS(), v.s * f));
    const k = ns / v.s;
    v.tx = cx - (cx - v.tx) * k;
    v.ty = cy - (cy - v.ty) * k;
    v.s = ns;
    apply();
  }

  // ── pointer events (pan + pinch) ─────────────

  // A tap selects, a drag pans. Tracked by distance travelled rather than by
  // a click handler, because the SVG is inside the element that captures the
  // pointer for panning — a plain click fires after every drag.
  let _downAt = null;
  const TAP_SLOP = 6;

  function onDown(e) {
    e.preventDefault();
    _ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    _downAt = _ptrs.size === 1 ? { x: e.clientX, y: e.clientY, id: e.pointerId, moved: 0 } : null;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
    if (_el) _el.style.cursor = 'grabbing';
  }

  function onMove(e) {
    const p = _ptrs.get(e.pointerId);
    if (!p) return;
    if (_ptrs.size === 2) {
      const ids = [..._ptrs.keys()];
      const a0 = _ptrs.get(ids[0]), b0 = _ptrs.get(ids[1]);
      const d0 = Math.hypot(a0.x - b0.x, a0.y - b0.y);
      _ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const a1 = _ptrs.get(ids[0]), b1 = _ptrs.get(ids[1]);
      const d1 = Math.hypot(a1.x - b1.x, a1.y - b1.y);
      if (d0 > 0 && _el) {
        const r = _el.getBoundingClientRect();
        zoomBy(d1 / d0, (a1.x + b1.x) / 2 - r.left, (a1.y + b1.y) / 2 - r.top);
      }
    } else {
      const v = view();
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (_downAt && _downAt.id === e.pointerId) _downAt.moved += Math.abs(dx) + Math.abs(dy);
      v.tx += dx;
      v.ty += dy;
      _ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      apply();
    }
  }

  function onUp(e) {
    if (_downAt && _downAt.id === e.pointerId && _downAt.moved <= TAP_SLOP) {
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      const bid = hit && hit.getAttribute && hit.getAttribute('data-bid');
      if (bid) selectParcel(bid); else if (hit && hit.closest && hit.closest('#map-container')) deselectParcel();
    }
    _downAt = null;
    _ptrs.delete(e.pointerId);
    if (_el && _ptrs.size === 0) _el.style.cursor = 'grab';
  }

  function onDbl(e) {
    if (!_el) return;
    const r = _el.getBoundingClientRect();
    zoomBy(1.6, e.clientX - r.left, e.clientY - r.top);
  }

  function onWheel(e) {
    e.preventDefault();
    if (!_el) return;
    const r = _el.getBoundingClientRect();
    zoomBy(Math.exp(-e.deltaY * 0.0022), e.clientX - r.left, e.clientY - r.top);
  }

  // ── public API ────────────────────────────────

  function init() {
    const container = document.getElementById('map-container');
    if (!container) return;
    _el = container;
    _mv = null; // reset so view() recalculates on next call

    // Build and inject SVG into transform wrapper
    let xf = document.getElementById('map-xf');
    if (!xf) {
      xf = document.createElement('div');
      xf.id = 'map-xf';
      xf.style.cssText = 'position:absolute;top:0;left:0;transform-origin:0 0;will-change:transform;';
      container.appendChild(xf);
    }
    xf.innerHTML = buildSVG();
    _xf = xf;
    _chip = document.getElementById('map-zoom-chip');

    // Attach pointer events
    container.addEventListener('pointerdown', onDown, { passive: false });
    container.addEventListener('pointermove', onMove, { passive: false });
    container.addEventListener('pointerup', onUp);
    container.addEventListener('pointercancel', onUp);
    container.addEventListener('dblclick', onDbl);
    container.addEventListener('wheel', onWheel, { passive: false });

    // Initial fit
    requestAnimationFrame(apply);
  }

  // ── MODES: 2d · 3d · overview ────────────────
  // Mutually exclusive and session-only. Each keeps its own pan/zoom, so
  // switching away and back does not lose where you were looking.

  let _mode = '2d';
  const HINTS = {
    '2d':       'DRAG TO PAN · SCROLL / PINCH TO ZOOM · ⌖ BASE · ⊡ FULL CITY',
    '3d':       'DRAG TO ORBIT · RIGHT-DRAG / TWO-FINGER TO PAN · SCROLL TO ZOOM · DOUBLE-TAP TO RESET',
    'overview': 'DRAG TO PAN · PINCH TO ZOOM',
  };

  function setMode(mode) {
    if (mode !== '2d' && mode !== '3d' && mode !== 'overview') return;
    _mode = mode;
    const outer = document.querySelector('.map-outer');
    if (outer) outer.setAttribute('data-mode', mode);
    if (mode === 'overview') ovBuild();
    if (mode === '3d' && typeof toggleMap3D === 'function' && !_3dOn) { _3dOn = true; toggleMap3D(); }
    if (mode !== '3d' && _3dOn && typeof toggleMap3D === 'function') { _3dOn = false; toggleMap3D(); }
    const hint = document.querySelector('.map-hint');
    if (hint) hint.textContent = HINTS[mode];
    renderSelCard();
    syncModeButtons();
  }
  let _3dOn = false;

  function syncModeButtons() {
    document.querySelectorAll('[data-mapmode]').forEach(b => {
      b.classList.toggle('is-active', b.getAttribute('data-mapmode') === _mode);
    });
    const ov = document.getElementById('map-overview-btn');
    if (ov) ov.classList.toggle('is-active', _mode === 'overview');
  }

  // ── OVERVIEW ─────────────────────────────────
  // The illustrated raster. Its own pan/zoom, clamped so an edge of the image
  // can never come into view — the clamp is recomputed from the cover-fit size
  // on every apply, because that size depends on the container.
  //
  // The <img> is SIZED to that cover box by ovApply() and centred, rather than
  // being wrapper-sized with object-fit: cover (DOM-134). The two are not
  // interchangeable: object-fit crops inside the element box, so a wrapper-sized
  // img translated by tx reveals tx pixels of the wrapper's own background and
  // never the cropped raster. Clamping that against the cover size — which is
  // what this did — is looser than the truth by (cover - wrap) * s / 2, which is
  // how a black sliver got to the edge of the frame, and how a pan was allowed
  // at 1.0x where none should be. Sizing the element to the cover box makes the
  // clamp below exact, and lets pan reach the crop the raster was hiding.

  const OV_MIN = 1, OV_MAX = 1.8;
  let _ov = { s: 1, tx: 0, ty: 0 };
  let _ovPtrs = new Map();
  let _ovBuilt = false;

  function ovEls() {
    return { wrap: document.getElementById('map-overview'), img: document.getElementById('map-overview-img') };
  }

  function ovCoverSize(wrap) {
    const iw = 1200, ih = 2150;
    const scale = Math.max(wrap.clientWidth / iw, wrap.clientHeight / ih);
    return { w: iw * scale, h: ih * scale };
  }

  function ovApply() {
    const { wrap, img } = ovEls();
    if (!wrap || !img) return;
    const cover = ovCoverSize(wrap);
    // Give the element the cover box and centre it, so transform-origin:center
    // scales it about the wrapper's centre and the clamp below is the real one.
    img.style.width  = cover.w + 'px';
    img.style.height = cover.h + 'px';
    img.style.left   = (wrap.clientWidth  - cover.w) / 2 + 'px';
    img.style.top    = (wrap.clientHeight - cover.h) / 2 + 'px';
    _ov.s = Math.max(OV_MIN, Math.min(OV_MAX, _ov.s));
    const maxX = Math.max(0, (cover.w * _ov.s - wrap.clientWidth) / 2);
    const maxY = Math.max(0, (cover.h * _ov.s - wrap.clientHeight) / 2);
    _ov.tx = Math.max(-maxX, Math.min(maxX, _ov.tx));
    _ov.ty = Math.max(-maxY, Math.min(maxY, _ov.ty));
    img.style.transform = 'translate(' + _ov.tx + 'px,' + _ov.ty + 'px) scale(' + _ov.s + ')';
  }

  function ovZoom(f) { _ov.s *= f; ovApply(); }
  function ovReset() { _ov = { s: 1, tx: 0, ty: 0 }; ovApply(); }

  function ovBuild() {
    const { wrap } = ovEls();
    if (!wrap || _ovBuilt) { ovApply(); return; }
    _ovBuilt = true;
    wrap.addEventListener('pointerdown', e => {
      _ovPtrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { wrap.setPointerCapture(e.pointerId); } catch (_) {}
    });
    wrap.addEventListener('pointermove', e => {
      const p = _ovPtrs.get(e.pointerId);
      if (!p) return;
      if (_ovPtrs.size >= 2) {
        const ids = [..._ovPtrs.keys()];
        const a0 = _ovPtrs.get(ids[0]), b0 = _ovPtrs.get(ids[1]);
        const d0 = Math.hypot(a0.x - b0.x, a0.y - b0.y);
        _ovPtrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const a1 = _ovPtrs.get(ids[0]), b1 = _ovPtrs.get(ids[1]);
        const d1 = Math.hypot(a1.x - b1.x, a1.y - b1.y);
        if (d0 > 0) { _ov.s *= d1 / d0; ovApply(); }
        return;
      }
      _ov.tx += e.clientX - p.x;
      _ov.ty += e.clientY - p.y;
      _ovPtrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      ovApply();
    });
    const end = e => { _ovPtrs.delete(e.pointerId); };
    wrap.addEventListener('pointerup', end);
    wrap.addEventListener('pointercancel', end);
    wrap.addEventListener('wheel', e => {
      e.preventDefault();
      ovZoom(e.deltaY < 0 ? 1.12 : 1 / 1.12);
    }, { passive: false });
    ovApply();
  }

  // ── SELECTION + CLAIM ────────────────────────

  let _sel = null;   // selected parcel id, session-only

  function drawSelection() {
    const g = document.getElementById('map-sel');
    if (!g) return;
    const b = _sel ? bldgById(_sel) : null;
    if (!b) { g.innerHTML = ''; renderSelCard(); return; }
    // Two rects, per 01-hood.md: an outer blinking halo and a tight inner edge.
    g.innerHTML =
      '<rect x="' + (b.x - 6) + '" y="' + (b.y - 6) + '" width="' + (b.w + 12) + '" height="' + (b.h + 12) +
        '" rx="4" fill="none" stroke="#e8c98a" stroke-width="1.6" opacity="0.55" class="map-sel-blink"/>' +
      '<rect x="' + (b.x - 2.5) + '" y="' + (b.y - 2.5) + '" width="' + (b.w + 5) + '" height="' + (b.h + 5) +
        '" rx="3" fill="none" stroke="#f3e0b4" stroke-width="2.6"/>';
    renderSelCard();
  }

  function selectParcel(id) { _sel = id; drawSelection(); }
  function deselectParcel() { _sel = null; drawSelection(); }

  function renderSelCard() {
    const host = document.getElementById('map-sel-card');
    if (!host) return;
    const b = _sel ? bldgById(_sel) : null;
    if (!b || _mode === 'overview') { host.innerHTML = ''; host.hidden = true; return; }
    host.hidden = false;
    const d = mapData();
    const own = bldgOwner(b);
    const fac = (d.factions && d.factions[own]) || { name: 'Unclaimed', color: '#5b6571' };
    const mine = own === 'player';
    const name = b.objective ? 'Objective Site' : b.tierName;
    const claimed = (typeof G !== 'undefined' && G && G.turf) ? G.turf[b.id] : null;
    const turf = (claimed && claimed.turf) || b.turf;
    host.innerHTML =
      '<div class="map-card-row">' +
        '<span class="map-card-swatch" style="background:' + fac.color + '"></span>' +
        '<span class="map-card-body">' +
          '<span class="map-card-k">PARCEL ' + b.id.toUpperCase() + (turf ? ' · ' + turf : '') + '</span>' +
          '<span class="map-card-name">' + name + '</span>' +
          '<span class="map-card-own">' +
            '<span class="map-card-dot" style="background:' + fac.color + '"></span>' +
            '<span style="color:' + (own === 'neutral' ? '#8e8e9a' : fac.color) + '">' +
              (own === 'neutral' ? 'UNCLAIMED' : fac.name.toUpperCase()) + '</span>' +
          '</span>' +
        '</span>' +
        '<button class="map-card-x" onclick="GameMap.deselect()" aria-label="Deselect">✕</button>' +
      '</div>' +
      (mine
        ? '<div class="map-card-owned">◆ CONTROLLED BY YOUR CREW</div>'
        : '<button class="map-card-claim sheen" onclick="GameMap.claim()">CLAIM TURF</button>');
  }

  // Claiming pays from the territory table DOM-124 landed — by building tier,
  // and more for an objective site. The award engine is the only thing that
  // knows what a tier is worth, so nothing is priced here.
  function claimSelected() {
    const b = _sel ? bldgById(_sel) : null;
    if (!b) return;
    if (bldgOwner(b) === 'player') { if (typeof toast === 'function') toast('Already yours.', true); return; }
    if (!G.turf) G.turf = {};
    G.turf[b.id] = { owner: 'player', turf: b.turf || 'YOUR BLOCK', at: Date.now() };

    if (typeof awardXp === 'function' && typeof XpAwards !== 'undefined') {
      const weight = b.objective ? XpAwards.territoryObjective() : XpAwards.territoryBuilding(b.tier);
      awardXp(weight, 'TURF CLAIMED', {
        reason: (typeof REASON !== 'undefined' ? REASON.QUEST_REWARD : 'quest_reward'),
        ref: { parcel: b.id, tier: b.tier },
        toast: true,
      });
    }
    if (typeof GameState !== 'undefined') GameState.save();
    // Repaint the parcel's stroke without regenerating the city.
    const rect = document.querySelector('[data-bid="' + b.id + '"]');
    const fac = mapData().factions && mapData().factions.player;
    if (rect && fac) { rect.setAttribute('stroke', fac.color); rect.setAttribute('stroke-width', '2.2'); }
    drawSelection();
  }

  function zoomIn()  { zoomBy(1.5, _el ? _el.clientWidth / 2 : 180, _el ? _el.clientHeight / 2 : 300); }
  function zoomOut() { zoomBy(1 / 1.5, _el ? _el.clientWidth / 2 : 180, _el ? _el.clientHeight / 2 : 300); }
  function reset() {
    const c = _el, s = _minS();
    const W = c ? c.clientWidth : 360, H = c ? c.clientHeight : 600;
    _mv = { s, tx: (W - 1240 * s) / 2, ty: (H - 2300 * s) / 2 };
    apply();
  }
  // Put a city-coordinate point in the middle of the viewport. apply() still
  // clamps to the map edges, so a point near a corner lands as close as the
  // map allows rather than panning empty space into view.
  //
  // Takes the map to 2D first (DOM-134). Centering only means anything on the
  // 2D layer, and callers arrive from other screens — a show-on-map button
  // pressed while the map was left in Overview or 3D used to centre a hidden
  // layer and look like it had done nothing. Doing it here rather than in each
  // caller is what makes every show-on-map affordance self-sufficient.
  //
  // Before reading _el, deliberately: leaving 3D re-runs init(), which captures
  // the container afresh and nulls _mv. Setting _mv after that is what makes it
  // win over the default fit init() queues for the next frame.
  function centerOn(x, y, scale) {
    if (_mode !== '2d') setMode('2d');
    if (!_el) return;
    const s = scale || 1;
    _mv = { s: s, tx: _el.clientWidth / 2 - x * s, ty: _el.clientHeight / 2 - y * s };
    apply();
  }
  // The base sits at the bounds centre from city.json.
  function centerBase() { centerOn(381, 866, 1); }

  return {
    init, zoomIn, zoomOut, reset, centerBase, centerOn, data: mapData,
    select: selectParcel, deselect: deselectParcel, claim: claimSelected,
    ovZoom: ovZoom, ovReset: ovReset, ovApply: ovApply,
    setMode: setMode, mode: () => _mode, ownerOf: bldgOwner, byId: bldgById,
  };
})();

// This screen claims its tab (DOM-127). The Hood is idempotent: init() no-ops once the city is built.
registerScreen('map', () => GameMap.init());
