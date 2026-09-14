// map3d.js — WebGL 3D night-city view
// Ported from CityMap3D React component to vanilla JS
// Requires: Three.js r160 (lazy-loaded), Map.data() from map.js

var Map3D = (function () {
  var _host = null;
  var _dead = false;
  var _raf = 0;
  var _renderer = null;
  var _ro = null;
  var _overlay = null;
  var _detach = [];
  var _active = false;

  var THREE_URL = 'https://unpkg.com/three@0.160.0/build/three.min.js';

  function _loadThree(cb) {
    if (window.THREE) { cb(window.THREE); return; }
    var s = document.createElement('script');
    s.src = THREE_URL;
    s.onload = function () { cb(window.THREE); };
    s.onerror = function () { _showErr('Failed to load Three.js — check connection.'); };
    document.head.appendChild(s);
  }

  function _showErr(msg) {
    if (_host) {
      _host.innerHTML =
        '<div style="position:absolute;inset:0;display:flex;align-items:center;' +
        'justify-content:center;color:#8e8e9a;font:12px \'Space Grotesk\',sans-serif;' +
        'text-align:center;padding:20px;">3D view failed to load.<br>' + msg + '</div>';
    }
  }

  function init(hostEl) {
    if (_active) return;
    _host = hostEl;
    _dead = false;
    _active = true;
    hostEl.innerHTML =
      '<div style="position:absolute;inset:0;display:flex;align-items:center;' +
      'justify-content:center;color:#55555f;font:11px \'Space Grotesk\',sans-serif;' +
      'letter-spacing:2px;">LOADING 3D…</div>';
    _loadThree(_build);
  }

  function _build(THREE) {
    var host = _host;
    if (!host || _dead) return;
    host.innerHTML = '';

    var data = GameMap.data();
    var W = data.W, H = data.H, cx = W / 2, cz = H / 2;
    function X(x) { return x - cx; }
    function Z(y) { return y - cz; }

    // scene / renderer / camera
    var scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0c10);
    scene.fog = new THREE.FogExp2(0x0b0c10, 0.00036);

    _renderer = new THREE.WebGLRenderer({ antialias: true });
    _renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    var domEl = _renderer.domElement;
    domEl.style.cssText = 'position:absolute;inset:0;display:block;touch-action:none;cursor:grab;';
    host.appendChild(domEl);

    var camera = new THREE.PerspectiveCamera(46, 1, 1, 9000);

    // night lighting
    scene.add(new THREE.AmbientLight(0x3a4150, 1.05));
    var moon = new THREE.DirectionalLight(0x93a7cc, 0.9);
    moon.position.set(420, 900, -320);
    scene.add(moon);
    scene.add(new THREE.HemisphereLight(0x2b3140, 0x141210, 0.5));

    // ground
    var ground = new THREE.Mesh(
      new THREE.PlaneGeometry(W + 900, H + 900),
      // Contract map palette: ground reads as #17171c (the .map-outer base).
      // The emissive follows it cool — the old 0x232219 was the retired warm grey.
      new THREE.MeshLambertMaterial({ color: 0x17171c, emissive: 0x111116, emissiveIntensity: 0.85 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.5;
    scene.add(ground);

    // instanced helpers
    var boxGeo = new THREE.BoxGeometry(1, 1, 1);
    var M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), Sv = new THREE.Vector3(), Pv = new THREE.Vector3();
    function setI(inst, i, x, y, z, sx, sy, sz) {
      Pv.set(x, y, z); Sv.set(sx, sy, sz); M4.compose(Pv, Q, Sv); inst.setMatrixAt(i, M4);
    }

    // block plates
    var plates = new THREE.InstancedMesh(
      boxGeo, new THREE.MeshLambertMaterial({ color: 0x16161a }), data.blocks.length);
    data.blocks.forEach(function (b, i) {
      setI(plates, i, X(b.x + b.w / 2), 1.5, Z(b.y + b.h / 2), b.w, 3, b.h);
    });
    scene.add(plates);

    // parks
    if (data.parks.length) {
      var parks = new THREE.InstancedMesh(
        boxGeo, new THREE.MeshLambertMaterial({ color: 0x1d2419 }), data.parks.length);
      data.parks.forEach(function (p, i) {
        setI(parks, i, X(p.x + p.w / 2), 2.2, Z(p.y + p.h / 2), p.w, 4.4, p.h);
      });
      scene.add(parks);
    }

    // buildings
    function bH(b, i) {
      var r = (((i + 3) * 2654435761) >>> 0) % 1000 / 1000;
      var dt = Math.max(0, 1 - Math.hypot(b.x + b.w / 2 - 430, b.y + b.h / 2 - 1010) / 520);
      return 16 + r * 46 + dt * 72 * (0.4 + r);
    }
    var grays = data.bldgs.filter(function (b) { return !b.yl; });
    var golds = data.bldgs.filter(function (b) { return b.yl; });
    var col = new THREE.Color();
    var bInst = new THREE.InstancedMesh(
      boxGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), grays.length);
    grays.forEach(function (b, i) {
      var h = bH(b, i);
      setI(bInst, i, X(b.x + b.w / 2), 3 + h / 2, Z(b.y + b.h / 2),
           Math.max(8, b.w - 3), h, Math.max(8, b.h - 3));
      var v = 0.82 + ((((i + 11) * 1103515245) >>> 0) % 100) / 100 * 0.38;
      col.setRGB(0.16 * v, 0.175 * v, 0.205 * v);
      bInst.setColorAt(i, col);
    });
    if (bInst.instanceColor) bInst.instanceColor.needsUpdate = true;
    scene.add(bInst);
    if (golds.length) {
      var gInst = new THREE.InstancedMesh(boxGeo,
        new THREE.MeshLambertMaterial({ color: 0x39352a, emissive: 0x221d10, emissiveIntensity: 0.6 }),
        golds.length);
      golds.forEach(function (b, i) {
        var h = bH(b, i + 7);
        setI(gInst, i, X(b.x + b.w / 2), 3 + h / 2, Z(b.y + b.h / 2),
             Math.max(8, b.w - 3), h, Math.max(8, b.h - 3));
      });
      scene.add(gInst);
    }

    // river — bezier tube
    var riverPts = [];
    var segs = [
      [[980,-20],[900,360],[1060,620],[860,940]],
      [[860,940],[700,1190],[520,1330],[540,1620]],
      [[540,1620],[556,1860],[430,2080],[470,2320]]
    ];
    segs.forEach(function (sg) {
      for (var t = 0; t <= 24; t++) {
        var u = t / 24, mv = 1 - u;
        var px = mv*mv*mv*sg[0][0] + 3*mv*mv*u*sg[1][0] + 3*mv*u*u*sg[2][0] + u*u*u*sg[3][0];
        var py = mv*mv*mv*sg[0][1] + 3*mv*mv*u*sg[1][1] + 3*mv*u*u*sg[2][1] + u*u*u*sg[3][1];
        riverPts.push(new THREE.Vector3(X(px), 0, Z(py)));
      }
    });
    var riverMesh = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(riverPts), 220, 23, 8, false),
      new THREE.MeshLambertMaterial({ color: 0x073245, emissive: 0x0e3a50, emissiveIntensity: 1.15 })
    );
    riverMesh.scale.y = 0.05;
    riverMesh.position.y = 1.2;
    scene.add(riverMesh);

    // road markings
    var yellowMat = new THREE.MeshBasicMaterial({ color: 0xd1b55d });
    data.hLines.forEach(function (y) {
      var ln = new THREE.Mesh(boxGeo, yellowMat);
      ln.scale.set(W, 0.3, 2);
      ln.position.set(0, 0.25, Z(y));
      scene.add(ln);
    });
    var dashLen = 11, dashGap = 13;
    var perLine = Math.ceil(H / (dashLen + dashGap));
    var dashMat = new THREE.MeshBasicMaterial({ color: 0xc9ccd2, transparent: true, opacity: 0.55 });
    var dashes = new THREE.InstancedMesh(boxGeo, dashMat, data.vLines.length * perLine);
    var di = 0;
    data.vLines.forEach(function (x) {
      for (var k = 0; k < perLine; k++)
        setI(dashes, di++, X(x), 0.25, Z(k * (dashLen + dashGap) + dashLen / 2), 1.6, 0.3, dashLen);
    });
    dashes.count = di;
    scene.add(dashes);

    // crosswalks
    if (data.cross && data.cross.length) {
      var cwMat = new THREE.MeshBasicMaterial({ color: 0xd9dce1, transparent: true, opacity: 0.5 });
      var cw = new THREE.InstancedMesh(boxGeo, cwMat, data.cross.length);
      data.cross.forEach(function (c, i) {
        var lx = Math.abs(c.x2 - c.x1), ly = Math.abs(c.y2 - c.y1);
        setI(cw, i, X((c.x1 + c.x2) / 2), 0.22, Z((c.y1 + c.y2) / 2),
             Math.max(lx, 7), 0.3, Math.max(ly, 7));
      });
      scene.add(cw);
    }

    // avenues
    var aveMat = new THREE.MeshLambertMaterial({ color: 0x63666d, emissive: 0x2c2d31, emissiveIntensity: 0.9 });
    var aveLineMat = new THREE.MeshBasicMaterial({ color: 0xd1b55d });
    data.avenues.forEach(function (av) {
      var m = av.match(/M([-\d.]+) ([-\d.]+) L([-\d.]+) ([-\d.]+)/);
      if (!m) return;
      var x1 = +m[1], y1 = +m[2], x2 = +m[3], y2 = +m[4];
      var len = Math.hypot(x2 - x1, y2 - y1);
      var rot = -Math.atan2(y2 - y1, x2 - x1);
      var box = new THREE.Mesh(boxGeo, aveMat);
      box.scale.set(len, 1.6, 34); box.rotation.y = rot;
      box.position.set(X((x1 + x2) / 2), 0.8, Z((y1 + y2) / 2));
      scene.add(box);
      var line = new THREE.Mesh(boxGeo, aveLineMat);
      line.scale.set(len, 0.3, 2.2); line.rotation.y = rot;
      line.position.set(X((x1 + x2) / 2), 1.85, Z((y1 + y2) / 2));
      scene.add(line);
    });

    // bridges
    var briMat = new THREE.MeshLambertMaterial({ color: 0x55534c });
    var briEdgeMat = new THREE.MeshLambertMaterial({ color: 0x2f3034 });
    (data.bridges || []).forEach(function (b) {
      var m1 = b[0].match(/M([-\d.]+) ([-\d.]+)/), m2 = b[1].match(/L([-\d.]+) ([-\d.]+)/);
      if (!m1 || !m2) return;
      var x1 = +m1[1], y1 = +m1[2], x2 = +m2[1], y2 = +m2[2];
      var len = Math.hypot(x2 - x1, y2 - y1) + 16;
      var rot = -Math.atan2(y2 - y1, x2 - x1);
      var edge = new THREE.Mesh(boxGeo, briEdgeMat);
      edge.scale.set(len, 2, 19); edge.rotation.y = rot;
      edge.position.set(X((x1 + x2) / 2), 2.6, Z((y1 + y2) / 2));
      scene.add(edge);
      var deck = new THREE.Mesh(boxGeo, briMat);
      deck.scale.set(len, 2, 14); deck.rotation.y = rot;
      deck.position.set(X((x1 + x2) / 2), 3.4, Z((y1 + y2) / 2));
      scene.add(deck);
    });

    // animated marker pins
    var pinsAnim = [];
    data.pins.forEach(function (p) {
      var g = new THREE.Group();
      g.position.set(X(p.x), 0, Z(p.y));
      var c = new THREE.Color(p.color);
      var beam = new THREE.Mesh(
        new THREE.CylinderGeometry(2.4, 2.4, 92, 10, 1, true),
        new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.32,
          blending: THREE.AdditiveBlending, depthWrite: false })
      );
      beam.position.y = 46; g.add(beam);
      var orb = new THREE.Mesh(
        new THREE.SphereGeometry(7, 18, 14),
        new THREE.MeshBasicMaterial({ color: c })
      );
      orb.position.y = 98; g.add(orb);
      var halo = new THREE.Mesh(
        new THREE.SphereGeometry(11.5, 18, 14),
        new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.22,
          blending: THREE.AdditiveBlending, depthWrite: false })
      );
      halo.position.y = 98; g.add(halo);
      var ring = new THREE.Mesh(
        new THREE.RingGeometry(10, 13.5, 40),
        new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.8,
          side: THREE.DoubleSide, depthWrite: false })
      );
      ring.rotation.x = -Math.PI / 2; ring.position.y = 2.6; g.add(ring);
      var light = new THREE.PointLight(c, 1.5, 280, 1.6);
      light.position.y = 42; g.add(light);
      scene.add(g);
      pinsAnim.push({ orb: orb, halo: halo, ring: ring, base: 98,
        speed: p.pulse ? 1.4 : 1, ph: ((p.x * 7 + p.y) % 360) / 360 * Math.PI * 2 });
    });

    // HTML label overlay
    _overlay = document.createElement('div');
    _overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;';
    host.appendChild(_overlay);
    function mkLabel(html, css) {
      var el = document.createElement('div');
      el.innerHTML = html;
      el.style.cssText = 'position:absolute;left:0;top:0;white-space:nowrap;will-change:transform;' + css;
      _overlay.appendChild(el);
      return el;
    }
    var tracked = [];
    data.labels.forEach(function (l) {
      // District ink matches the 2D map: solid --ghost (#55555f), no alpha dim
      // (contract bans opacity below 1 on content) and no text-shadow (the one
      // sanctioned shadow is --modal-shadow).
      var el = mkLabel(l.t.toUpperCase(),
        'font:400 ' + Math.round((l.size || 20) * 0.85) + 'px Anton,sans-serif;' +
        'letter-spacing:2px;color:#55555f;');
      tracked.push({ el: el, v: new THREE.Vector3(X(l.x), 5, Z(l.y)), dy: 0, cx: true });
    });
    data.pins.forEach(function (p) {
      var el = mkLabel(
        '<div style="font:400 12px Anton,sans-serif;letter-spacing:1px;color:' + p.color + '">' +
          p.label + '</div>' +
        (p.sub ? '<div style="font:400 10px \'Space Grotesk\',sans-serif;color:#8e8e9a;margin-top:1px">' +
          p.sub + '</div>' : ''),
        'background:rgba(17,17,22,0.9);border:1px solid #26262e;' +
        'border-radius:999px;padding:4px 9px;'
      );
      tracked.push({ el: el, v: new THREE.Vector3(X(p.x), 122, Z(p.y)), dy: -14, cx: true });
    });

    // orbit camera
    var tgt = new THREE.Vector3(X(430), 0, Z(1010));
    var theta = 0, phi = 0.95, dist = 780;
    var PHI_MIN = 0.3, PHI_MAX = 1.25, DIST_MIN = 240, DIST_MAX = 2100;
    function clampAll() {
      tgt.x = Math.max(-cx, Math.min(cx, tgt.x));
      tgt.z = Math.max(-cz, Math.min(cz, tgt.z));
      phi = Math.max(PHI_MIN, Math.min(PHI_MAX, phi));
      dist = Math.max(DIST_MIN, Math.min(DIST_MAX, dist));
    }
    function applyCam() {
      camera.position.set(
        tgt.x + dist * Math.sin(phi) * Math.sin(theta),
        dist * Math.cos(phi),
        tgt.z + dist * Math.sin(phi) * Math.cos(theta)
      );
      camera.lookAt(tgt);
    }
    function pan(dx, dy) {
      var k = dist * 0.0012;
      tgt.x += -Math.sin(theta) * dy * k - Math.cos(theta) * dx * k;
      tgt.z += -Math.cos(theta) * dy * k + Math.sin(theta) * dx * k;
      clampAll();
    }
    var ptrs = new Map();
    var lastPinch = 0, lastAngle = 0, lastCenter = null;
    function on3D(t, fn, opts) {
      domEl.addEventListener(t, fn, opts);
      _detach.push(function () { domEl.removeEventListener(t, fn, opts); });
    }
    on3D('contextmenu', function (e) { e.preventDefault(); });
    on3D('pointerdown', function (e) {
      try { domEl.setPointerCapture(e.pointerId); } catch (_) {}
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, b: e.button, type: e.pointerType });
      domEl.style.cursor = 'grabbing';
      // reset two-finger state on finger count change
      lastPinch = 0; lastCenter = null;
    });
    on3D('pointermove', function (e) {
      var p = ptrs.get(e.pointerId);
      if (!p) return;
      var dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (ptrs.size === 1) {
        if (p.b === 2) {
          // right-click drag → pan
          pan(dx, dy);
        } else if (p.type === 'touch') {
          // single-finger swipe → pan
          pan(dx, dy);
        } else {
          // mouse left-drag → orbit/rotate
          theta -= dx * 0.0052; phi -= dy * 0.0042; clampAll();
        }
      } else if (ptrs.size === 2) {
        var vals = [];
        ptrs.forEach(function (v) { vals.push(v); });
        var d2    = Math.hypot(vals[0].x - vals[1].x, vals[0].y - vals[1].y);
        var ang2  = Math.atan2(vals[1].y - vals[0].y, vals[1].x - vals[0].x);
        var cx2   = (vals[0].x + vals[1].x) / 2;
        var cy2   = (vals[0].y + vals[1].y) / 2;
        if (lastPinch) {
          // pinch → zoom
          dist *= lastPinch / d2;
          // two-finger twist → rotate
          var dA = ang2 - lastAngle;
          if (dA >  Math.PI) dA -= Math.PI * 2;
          if (dA < -Math.PI) dA += Math.PI * 2;
          theta -= dA;
        }
        // center movement → pan
        if (lastCenter) pan(cx2 - lastCenter.x, cy2 - lastCenter.y);
        lastPinch = d2; lastAngle = ang2; lastCenter = { x: cx2, y: cy2 };
        clampAll();
      }
    });
    function endPtr(e) {
      ptrs.delete(e.pointerId);
      lastPinch = 0; lastCenter = null;
      if (!ptrs.size) domEl.style.cursor = 'grab';
    }
    on3D('pointerup', endPtr);
    on3D('pointercancel', endPtr);
    on3D('wheel', function (e) { e.preventDefault(); dist *= Math.exp(e.deltaY * 0.0011); clampAll(); }, { passive: false });
    on3D('dblclick', function () { tgt.set(X(430), 0, Z(1010)); theta = 0; phi = 0.95; dist = 780; });

    // resize
    function resize() {
      var w = host.clientWidth || 1, h = host.clientHeight || 1;
      _renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    _ro = new ResizeObserver(resize);
    _ro.observe(host);
    resize();

    // animate
    var clock = new THREE.Clock();
    var sp = new THREE.Vector3();
    function tick() {
      if (_dead) return;
      var t = clock.getElapsedTime();
      pinsAnim.forEach(function (p) {
        p.orb.position.y = p.base + Math.sin(t * 2.1 * p.speed + p.ph) * 4;
        p.halo.position.y = p.orb.position.y;
        var u = (t * 0.7 * p.speed + p.ph) % 1;
        var sc = 1 + u * 2.6;
        p.ring.scale.set(sc, sc, 1);
        p.ring.material.opacity = 0.8 * (1 - u);
      });
      applyCam();
      _renderer.render(scene, camera);
      var w = host.clientWidth, h = host.clientHeight;
      tracked.forEach(function (L) {
        sp.copy(L.v).project(camera);
        if (sp.z > 1) { L.el.style.display = 'none'; return; }
        L.el.style.display = '';
        var sx = (sp.x * 0.5 + 0.5) * w - (L.cx ? L.el.offsetWidth / 2 : 0);
        var sy = (-sp.y * 0.5 + 0.5) * h + (L.dy || 0) - (L.dy ? L.el.offsetHeight : 0);
        L.el.style.transform = 'translate(' + sx.toFixed(1) + 'px,' + sy.toFixed(1) + 'px)';
      });
      _raf = requestAnimationFrame(tick);
    }
    tick();
  }

  function destroy() {
    _dead = true;
    _active = false;
    cancelAnimationFrame(_raf);
    _detach.forEach(function (f) { f(); });
    _detach = [];
    if (_ro) { _ro.disconnect(); _ro = null; }
    if (_overlay && _overlay.parentNode) _overlay.parentNode.removeChild(_overlay);
    _overlay = null;
    if (_renderer) {
      if (_renderer.domElement.parentNode) _renderer.domElement.parentNode.removeChild(_renderer.domElement);
      _renderer.dispose();
      _renderer = null;
    }
  }

  function isActive() { return _active; }

  return { init: init, destroy: destroy, isActive: isActive };
})();

// ── 2D / 3D toggle ───────────────────────────────
function toggleMap3D() {
  var container = document.getElementById('map-container');
  var btn = document.getElementById('map-3d-btn');
  if (!container) return;
  if (Map3D.isActive()) {
    Map3D.destroy();
    container.innerHTML = '';
    GameMap.init();
    if (btn) { btn.textContent = '3D'; btn.classList.remove('active-mode'); }
  } else {
    var xf = document.getElementById('map-xf');
    if (xf) xf.innerHTML = '';
    Map3D.init(container);
    if (btn) { btn.textContent = '2D'; btn.classList.add('active-mode'); }
  }
}
