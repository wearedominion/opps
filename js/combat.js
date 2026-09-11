// ─────────────────────────────────────────────
//  COMBAT
// ─────────────────────────────────────────────

var ENEMY_PORTRAITS = {
  snitch:  'assets/portraits/enemy-snitch.png',
  stick:   'assets/portraits/enemy-stick.png',
  oppcrew: 'assets/portraits/enemy-oppcrew.png',
  jackers: 'assets/portraits/enemy-jackers.png',
  rival:   'assets/portraits/enemy-rival.png',
  fed:     'assets/portraits/enemy-fed.png',
};

var ENEMY_THREAT = {
  snitch:  2,
  stick:   4,
  oppcrew: 3,
  jackers: 6,
  rival:   6,
  fed:     8,
};

var combatEnemy = null;

// ── Simulation canvas ─────────────────────────
var Sim = (function() {
  var _pts = null, _t0 = 0, _raf = 0, _timer = null;
  var _result = null, _phase = null, _canvas = null;

  function start(threat) {
    if (_phase === 'run') return;
    var lo = Math.max(5, Math.round((90 - threat * 7.5) / 5) * 5);
    var hi = Math.min(95, lo + 25);
    var win = Math.random() < (lo + hi) / 200;
    var N = 130, pts = [], end = win ? 68 + Math.random() * 22 : 12 + Math.random() * 20, p = 50;
    for (var i = 0; i < N; i++) {
      var t = i / (N - 1);
      var drift = (end - p) * (0.02 + 0.1 * t * t);
      var noise = (Math.random() - 0.5) * 14 * (1 - 0.6 * t);
      p = Math.max(4, Math.min(96, p + drift + noise));
      pts.push(p);
    }
    pts[N - 1] = end;
    _pts = pts; _result = win ? 'W' : 'L'; _phase = 'run'; _t0 = performance.now();
    _setPhaseUI();
    cancelAnimationFrame(_raf);
    function loop() {
      var t = (performance.now() - _t0) / 5000;
      if (_canvas) draw(_canvas, Math.min(1, t));
      if (t >= 1) {
        _phase = 'done'; _setPhaseUI();
        _timer = setTimeout(function() { end_(true); }, 1500);
        return;
      }
      _raf = requestAnimationFrame(loop);
    }
    _raf = requestAnimationFrame(loop);
  }

  function draw(cv, t) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    var ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!_pts) return;
    var n = Math.max(2, Math.floor(_pts.length * t));
    function px(i) { return 10 + (w - 20) * (i / (_pts.length - 1)); }
    function py(v) { return h - 12 - (h - 24) * (v / 100); }
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(10, py(50)); ctx.lineTo(w - 10, py(50)); ctx.stroke();
    ctx.setLineDash([]);
    function line(color, mapFn, glow) {
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.shadowColor = glow; ctx.shadowBlur = 8;
      ctx.beginPath();
      for (var i = 0; i < n; i++) { var y = py(mapFn(_pts[i])); if (i) ctx.lineTo(px(i), y); else ctx.moveTo(px(i), y); }
      ctx.stroke(); ctx.shadowBlur = 0;
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(px(n - 1), py(mapFn(_pts[n - 1])), 3, 0, 7); ctx.fill();
    }
    line('#e23b2e', function(v) { return 100 - v; }, 'rgba(226,59,46,0.8)');
    line('#bfce1c', function(v) { return v; },       'rgba(191,206,28,0.8)');
  }

  function end_(closeAfter) {
    cancelAnimationFrame(_raf); clearTimeout(_timer); _phase = null;
    if (_canvas) { var c = _canvas.getContext('2d'); if (c) c.clearRect(0, 0, _canvas.width, _canvas.height); }
    if (closeAfter) _applyResult();
  }

  function _setPhaseUI() {
    var simWrap  = $('sim-canvas-wrap');
    var infoWrap = $('combat-info-wrap');
    var resultEl = $('sim-result');
    if (_phase === 'run') {
      if (simWrap)  simWrap.style.display  = 'block';
      if (infoWrap) infoWrap.style.opacity = '0.3';
      if (resultEl) resultEl.style.opacity = '0';
    } else if (_phase === 'done') {
      if (resultEl) {
        resultEl.textContent = _result === 'W' ? 'W' : 'L';
        resultEl.style.color = _result === 'W' ? '#bfce1c' : '#e23b2e';
        resultEl.style.opacity = '1';
      }
    } else {
      if (simWrap)  simWrap.style.display  = 'none';
      if (infoWrap) infoWrap.style.opacity = '1';
      if (resultEl) resultEl.style.opacity = '0';
    }
  }

  function _applyResult() {
    var enemy = combatEnemy;
    if (!enemy) { closeCombat(); return; }
    if (_result === 'W') {
      var moneyWon = rand(enemy.reward.money[0], enemy.reward.money[1]);
      G.money += moneyWon; G.rep += enemy.reward.rep;
      addXP(enemy.reward.xp);
      G.health = Math.max(5, G.health - rand(5, 20));
      updateHUD();
      $('combat-result').textContent = 'YOU SMOKED HIM!';
      $('combat-result').style.color = 'var(--green)';
      log('Smoked ' + enemy.name + ' -- won $' + moneyWon + ' + ' + enemy.reward.xp + ' XP', 'win');
      Sound.win();
    } else {
      var moneyLost = Math.floor(G.money * 0.1);
      G.money = Math.max(0, G.money - moneyLost); G.health = 5;
      updateHUD();
      $('combat-result').textContent = 'YOU CAUGHT AN L! Lost $' + moneyLost;
      $('combat-result').style.color = 'var(--red)';
      log('Got beat by ' + enemy.name + ' -- lost $' + moneyLost, 'loss');
      Sound.loss();
    }
    $('close-combat').style.display = 'inline-block';
    GameState.save();
  }

  function setCanvas(el) { _canvas = el; }
  return { start: start, draw: draw, end: end_, setCanvas: setCanvas };
})();

// ── Render enemies list ───────────────────────
function renderEnemies() {
  var container = $('enemy-list');
  if (!container) return;
  container.innerHTML = '';
  ENEMIES.forEach(function(e) {
    var locked = G.level < e.lvlReq;
    var portrait = ENEMY_PORTRAITS[e.id];
    var threat = ENEMY_THREAT[e.id] || 5;
    var bars = '';
    for (var i = 0; i < 8; i++) bars += (i < threat ? '█' : '░');
    var div = document.createElement('div');
    div.className = 'enemy-card';
    div.innerHTML =
      '<div class="enemy-portrait-wrap">' +
        (portrait ? '<img class="enemy-portrait" src="' + portrait + '" alt="' + e.name + '" loading="lazy">'
                  : '<div class="enemy-avatar"></div>') +
      '</div>' +
      '<div class="enemy-info">' +
        '<div class="enemy-name">' + e.name + '</div>' +
        '<div class="enemy-role">' + (e.role || '') + '</div>' +
        '<div class="enemy-stats"><span class="threat-bar">' + bars + '<span class="threat-label">THREAT</span></span></div>' +
        '<div class="enemy-reward">Reward: $' + e.reward.money[0] + '–$' + e.reward.money[1] + '</div>' +
      '</div>' +
      (locked
        ? '<div class="enemy-locked">RANK ' + e.lvlReq + '</div>'
        : '<button class="attack-btn" onclick="startCombat(\'' + e.id + '\')">SLIDE ON \'EM</button>');
    container.appendChild(div);
  });
}

// ── Start combat ──────────────────────────────
function startCombat(enemyId) {
  if (G.health < 20) { toast('Too hurt to fight! Rest up first.', true); return; }
  var e = ENEMIES.find(function(x) { return x.id === enemyId; });
  if (!e) return;
  combatEnemy = Object.assign({}, e);

  var portraitEl = $('c-enemy-portrait');
  if (portraitEl) {
    var src = ENEMY_PORTRAITS[e.id];
    portraitEl.src = src || '';
    portraitEl.style.display = src ? 'block' : 'none';
  }
  var iconEl = $('c-enemy-icon');
  if (iconEl) iconEl.textContent = '';

  $('c-enemy-name').textContent = e.name;
  $('c-player-hp').style.width = '100%';
  $('c-enemy-hp').style.width = '100%';
  $('combat-log').innerHTML = '';
  $('combat-result').textContent = '';
  $('close-combat').style.display = 'none';

  var threat = ENEMY_THREAT[e.id] || 5;
  var lo = Math.max(5, Math.round((90 - threat * 7.5) / 5) * 5);
  var hi = Math.min(95, lo + 25);
  var oddsEl = $('c-odds');
  if (oddsEl) {
    oddsEl.textContent = lo + '–' + hi + '% WIN';
    oddsEl.style.color = lo >= 60 ? '#bfce1c' : lo >= 45 ? '#f5902a' : '#e23b2e';
  }

  var canvas = $('sim-canvas');
  if (canvas) Sim.setCanvas(canvas);
  var simWrap = $('sim-canvas-wrap');
  if (simWrap) simWrap.style.display = 'none';
  var infoWrap = $('combat-info-wrap');
  if (infoWrap) infoWrap.style.opacity = '1';
  var resultEl = $('sim-result');
  if (resultEl) resultEl.style.opacity = '0';

  $('combat-overlay').classList.add('open');
}

function hitEm() {
  if (!combatEnemy) return;
  Sim.start(ENEMY_THREAT[combatEnemy.id] || 5);
}

function closeCombat() {
  Sim.end(false);
  $('combat-overlay').classList.remove('open');
}
