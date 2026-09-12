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

// ── Simulation ────────────────────────────────
var Sim = (function() {
  var _pts = null, _t0 = 0, _raf = 0, _timer = null;
  var _result = null, _phase = null, _well = null;

  function start(threat) {
    if (_phase === 'run') return;
    // A tap during the result window settles the finished fight now, rather than
    // leaving its pending timer to fire mid-way through the new run.
    if (_phase === 'done') end_(true);
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
      if (_well) draw(_well, Math.min(1, t));
      if (t >= 1) {
        _phase = 'done'; _setPhaseUI();
        _timer = setTimeout(function() { end_(true); }, 1500);
        return;
      }
      _raf = requestAnimationFrame(loop);
    }
    _raf = requestAnimationFrame(loop);
  }

  // Renders the exchange into the .combat-log well as SVG. Deliberately not a
  // canvas: the two lines are stroked by .combat-spark .you / .opp in the
  // stylesheet, so the palette lives in the token set instead of being
  // hardcoded here. The old canvas version carried #bfce1c / #e23b2e plus a
  // shadowBlur glow, none of which CSS could reach or the contract allows.
  function draw(well, t) {
    if (!well) return;
    var svg = document.getElementById('combat-spark');
    if (!svg || !_pts) return;
    var w = well.clientWidth, h = well.clientHeight;
    if (!w || !h) return;

    // 1 user unit = 1 px, so strokes never distort.
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);

    var padX = 4, padY = 6;
    var n = Math.max(2, Math.floor(_pts.length * t));
    function px(i) { return padX + (w - padX * 2) * (i / (_pts.length - 1)); }
    function py(v) { return h - padY - (h - padY * 2) * (v / 100); }

    var mid = document.getElementById('spark-mid');
    if (mid) {
      mid.setAttribute('x1', padX); mid.setAttribute('x2', w - padX);
      mid.setAttribute('y1', py(50)); mid.setAttribute('y2', py(50));
    }

    // The opp line is the player's line mirrored about the midpoint — one
    // series, two readings, exactly as the canvas version plotted it.
    function path(id, dotId, mapFn) {
      var d = '', i, y;
      for (i = 0; i < n; i++) {
        y = py(mapFn(_pts[i]));
        d += (i ? 'L' : 'M') + px(i).toFixed(1) + ' ' + y.toFixed(1);
      }
      var el = document.getElementById(id);
      if (el) el.setAttribute('d', d);
      var dot = document.getElementById(dotId);
      if (dot) {
        dot.setAttribute('cx', px(n - 1).toFixed(1));
        dot.setAttribute('cy', py(mapFn(_pts[n - 1])).toFixed(1));
      }
    }
    path('spark-opp', 'spark-dot-opp', function(v) { return 100 - v; });
    path('spark-you', 'spark-dot-you', function(v) { return v; });
  }

  function _clearSpark() {
    ['spark-you', 'spark-opp'].forEach(function(id) {
      var el = document.getElementById(id); if (el) el.removeAttribute('d');
    });
    ['spark-dot-you', 'spark-dot-opp'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) { el.removeAttribute('cx'); el.removeAttribute('cy'); }
    });
  }

  function end_(closeAfter) {
    cancelAnimationFrame(_raf); clearTimeout(_timer); _phase = null;
    // Only wipe the chart when tearing the fight down. On a result we leave it
    // on screen — the player just watched it, and clearing mid-result stranded
    // the two head dots on an empty well.
    if (!closeAfter) _clearSpark();
    if (closeAfter) _applyResult();
  }

  // Contract: never dim content to signal state. The info block is hidden
  // outright while the exchange runs and restored after, rather than dropped
  // to 0.3 opacity as it was before.
  function _setPhaseUI() {
    var well     = $('combat-log');
    var infoWrap = $('combat-info-wrap');
    var resultEl = $('sim-result');
    if (_phase === 'run') {
      if (well)     well.hidden = false;
      if (infoWrap) infoWrap.hidden = true;
      if (resultEl) { resultEl.textContent = ''; resultEl.className = 'combat-spark-result'; }
    } else if (_phase === 'done') {
      if (resultEl) {
        resultEl.textContent = _result === 'W' ? 'W' : 'L';
        resultEl.className = 'combat-spark-result show ' + (_result === 'W' ? 'win' : 'loss');
      }
    } else {
      if (well)     well.hidden = true;
      if (infoWrap) infoWrap.hidden = false;
      if (resultEl) { resultEl.textContent = ''; resultEl.className = 'combat-spark-result'; }
    }
  }

  function _applyResult() {
    var enemy = combatEnemy;
    if (!enemy) { closeCombat(); return; }
    if (_result === 'W') {
      var cashWon = rand(enemy.reward.cash[0], enemy.reward.cash[1]);
      credit('cash', cashWon, REASON.FIGHT_REWARD, { ref: { enemyId: enemy.id } });
      addClout(enemy.reward.clout, REASON.FIGHT_REWARD, { enemyId: enemy.id });
      const hit = tune('combat.winHealthLoss');
      const floor = tune('combat.defeatHealthRemaining');
      const dmg = Math.min(rand(hit[0], hit[1]), Math.max(0, G.health.current - floor));
      debit('health', dmg, REASON.COMBAT_DAMAGE, { ref: { enemyId: enemy.id } });
      updateHUD();
      $('combat-result').textContent = 'YOU SMOKED HIM!';
      $('combat-result').style.color = 'var(--green)';
      log('Smoked ' + enemy.name + ' -- won $' + cashWon + ' + ' + enemy.reward.clout + ' Clout', 'win');
      Sound.win();
    } else {
      // The loss is a share of the CURRENT balance at resolution, never a
      // reserved amount (DOM-68 locked rule). defeatLossCap is ratified null
      // (uncapped, DOM-79) but wired so capping is a tuning change, no release.
      var cashLost = Math.floor(G.cash * tune('loot.defeatLossRate'));
      var lossCap = tune('loot.defeatLossCap');
      if (lossCap !== null) cashLost = Math.min(cashLost, lossCap);
      // debit() returns the (negative) applied delta; flip it for display —
      // this used to print "Lost $-16".
      cashLost = -debit('cash', cashLost, REASON.FIGHT_DEFEAT_LOSS, { ref: { enemyId: enemy.id } });
      // Never negative: a player already below the floor takes no further damage.
      debit('health', Math.max(0, G.health.current - tune('combat.defeatHealthRemaining')),
            REASON.COMBAT_DAMAGE, { ref: { enemyId: enemy.id } });
      // Losing still teaches you something. Expressed as a share of the win so it
      // tracks content difficulty automatically instead of needing its own table.
      var cloutLost = Math.floor(enemy.reward.clout * tune('combat.defeatCloutShare'));
      addClout(cloutLost, REASON.FIGHT_REWARD, { enemyId: enemy.id, outcome: 'loss' });
      updateHUD();
      $('combat-result').textContent = 'YOU CAUGHT AN L! Lost $' + cashLost;
      $('combat-result').style.color = 'var(--red)';
      log('Got beat by ' + enemy.name + ' -- lost $' + cashLost + ', kept ' + cloutLost + ' Clout', 'loss');
      Sound.loss();
    }
    $('close-combat').style.display = 'inline-block';
    GameState.save();
  }

  function setWell(el) { _well = el; }
  return { start: start, draw: draw, end: end_, setWell: setWell, clear: _clearSpark };
})();

// ── Render enemies list ───────────────────────
function renderEnemies() {
  var container = $('enemy-list');
  if (!container) return;
  container.innerHTML = '';
  ENEMIES.forEach(function(e) {
    var locked = !isUnlocked(e);
    var portrait = ENEMY_PORTRAITS[e.id];
    var threat = ENEMY_THREAT[e.id] || 5;
    // Contract: --red on --ghost. Split the run so the empty blocks are not
    // also red — a rating should read as "4 of 8", not "8, some dimmer".
    var bars = '<span class="threat-on">' + '█'.repeat(threat) + '</span>' +
               '<span class="threat-off">' + '░'.repeat(8 - threat) + '</span>';
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
        '<div class="enemy-reward">Reward: $' + e.reward.cash[0] + '–$' + e.reward.cash[1] + '</div>' +
      '</div>' +
      (locked
        ? '<div class="enemy-locked">' + lockLabel(e) + '</div>'
        : '<button class="attack-btn" onclick="startCombat(\'' + e.id + '\')">SLIDE ON \'EM</button>');
    container.appendChild(div);
  });
}

// ── Start combat ──────────────────────────────
function startCombat(enemyId) {
  if (G.health.current < 20) { toast('Too hurt to fight! Rest up first.', true); return; }
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
  $('combat-result').textContent = '';
  $('close-combat').style.display = 'none';

  var threat = ENEMY_THREAT[e.id] || 5;
  var lo = Math.max(5, Math.round((90 - threat * 7.5) / 5) * 5);
  var hi = Math.min(95, lo + 25);
  var oddsEl = $('c-odds');
  if (oddsEl) {
    oddsEl.textContent = lo + '–' + hi + '% WIN';
    // Red here is combat semantics, which is where the contract allows it.
    oddsEl.style.color = lo >= 60 ? 'var(--green)' : lo >= 45 ? 'var(--chrome)' : 'var(--red)';
  }

  var well = $('combat-log');
  if (well) { Sim.setWell(well); well.hidden = true; Sim.clear(); }
  var infoWrap = $('combat-info-wrap');
  if (infoWrap) infoWrap.hidden = false;
  var resultEl = $('sim-result');
  if (resultEl) { resultEl.textContent = ''; resultEl.className = 'combat-spark-result'; }

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
