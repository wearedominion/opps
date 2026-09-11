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

  function mapData() {
    if (_dataCache) return _dataCache;
    const W = 1240, H = 2300;
    let s = 20260611 >>> 0;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    // Chrome Money map palette (claude.md, structural change #5).
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
            bldgs.push({
              x: x0 + 4 + a * gw + rnd() * Math.max(0, gw - pw - 4),
              y: y0 + 4 + b * gh + rnd() * Math.max(0, gh - ph - 4),
              w: pw, h: ph, yl: r1 > 0.91
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
    _dataCache = { W, H, C, blocks, bldgs, parks, vLines, hLines, cross, avenues, river, bridges, pins, labels };
    return _dataCache;
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

    // Buildings
    out += '<g>';
    d.bldgs.forEach(b => { out += el('rect', { x: b.x, y: b.y, width: b.w, height: b.h, rx: 1.5, fill: b.yl ? C.bldgY : C.bldg, stroke: b.yl ? C.bldgYEdge : C.bldgEdge, 'stroke-width': 1 }); });
    out += '</g>';

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
      out += el('text', { x: l.x, y: l.y, fill: C.district, style: `font:400 ${l.size}px Anton,sans-serif;letter-spacing:2px;text-transform:uppercase` }, l.t);
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

  function onDown(e) {
    e.preventDefault();
    _ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
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
      v.tx += e.clientX - p.x;
      v.ty += e.clientY - p.y;
      _ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      apply();
    }
  }

  function onUp(e) {
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

  function zoomIn()  { zoomBy(1.5, _el ? _el.clientWidth / 2 : 180, _el ? _el.clientHeight / 2 : 300); }
  function zoomOut() { zoomBy(1 / 1.5, _el ? _el.clientWidth / 2 : 180, _el ? _el.clientHeight / 2 : 300); }
  function reset() {
    const c = _el, s = _minS();
    const W = c ? c.clientWidth : 360, H = c ? c.clientHeight : 600;
    _mv = { s, tx: (W - 1240 * s) / 2, ty: (H - 2300 * s) / 2 };
    apply();
  }
  function centerBase() {
    if (!_el) return;
    _mv = { s: 1, tx: _el.clientWidth / 2 - 381, ty: _el.clientHeight / 2 - 866 };
    apply();
  }

  return { init, zoomIn, zoomOut, reset, centerBase, data: mapData };
})();
