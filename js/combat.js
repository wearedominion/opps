// ─────────────────────────────────────────────
//  COMBAT (DOM-72 — turn-based rounds)
//
//  Each round both sides deal damage (locked rule): ATTACK computes both hits
//  from the same starting state and applies both, so a dying blow still lands
//  and a double KO is possible — a double KO wins the fight AND hospitalizes.
//  RUN is the emergency exit: runAwayChance to escape with no defeat loss; a
//  failed run eats the opponent's hit and the fight continues.
//
//  The math lives in js/fightmath.js, shared verbatim with the simulator and
//  the catalog generator — the generator solves enemy ATK/DEF per band so a
//  band-appropriate fight sits at ~50% win against the expected loadout.
//
//  0 Health = defeated, then hospitalized, in the same transaction that
//  resolves the fight (js/hospital.js). Stamina is debited when the fight
//  STARTS — running away does not refund it.
// ─────────────────────────────────────────────

var combatEnemy = null;     // static catalog row of the current opponent
var _fight = null;          // { eHp, round, over } — live fight state, never saved

function _fightCfg() {
  return {
    roundDamageShare: tune('combat.roundDamageShare'),
    damageSpread: tune('combat.damageSpread'),
    firstStrikeEdge: tune('combat.firstStrikeEdge'),
    baseHp: tune('start.health'),
  };
}

function _playerFighter() {
  // Derived, not banked (DOM-75): base stats plus the capacity-limited loadout.
  return { atk: effAttack(), def: effDefense(), hp: G.health.current };
}

function _enemyFighter(e) {
  return { atk: e.atk, def: e.def, maxHp: e.hp };
}

// Threat 1–8 from the model itself: quick Monte Carlo of the real matchup,
// mapped so ~50% win reads as 4 blocks. Replaces the old hardcoded map that
// only covered the six legacy enemies.
function enemyThreat(e) {
  const st = fmStats(_playerFighter(), _enemyFighter(e), _fightCfg(), 200, Math.random);
  return Math.max(1, Math.min(8, Math.round((1 - st.pWin) * 8)));
}

// ── Opps List (DOM-112 — screens/03-opps.md) ──
//
//  One card per opp: portrait with its dossier code, identity, ENGAGE + the
//  reward capsule, then the HP and THREAT gauges. Deliberately four rows and
//  no more — the doc's ~144px card height is what the layout buys.

// The gold map pin, filled (the one filled icon in the set — OVERLAYS.md).
const OPP_PIN_SVG =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">'
  + '<path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>';

// HP as a 1–8 rating, the same scale THREAT uses.
//
// The prototype's opps carry hp 2–5 — an 8-point RATING, not hit points — and
// the doc's "width = hp/8" reads against that. Repo enemies carry real HP, so
// the rating is derived from it.
//
// The scale is LOGARITHMIC across the roster because the roster is: the Local
// Snitch has 40 HP and The Don has six figures. Linear against the roster max
// rounds every early opp to the same single block, which is a gauge that tells
// a new player nothing. Log spreads all 17 across the full eight.
function oppHpRating(e) {
  let lo = Infinity, hi = 0;
  for (const x of ENEMIES) {
    const v = x.hp || 0;
    if (v > 0) { if (v < lo) lo = v; if (v > hi) hi = v; }
  }
  const v = e.hp || 0;
  if (!(v > 0) || !(hi > lo)) return 1;                  // single-row roster
  const t = (Math.log(v) - Math.log(lo)) / (Math.log(hi) - Math.log(lo));
  return Math.max(1, Math.min(8, Math.round(1 + t * 7)));
}

// Severity by position (03-opps.md): 1–2 grey, 3–5 chrome, 6–8 red. The
// gauge is the ONLY severity signal on the card — there is no risk chip.
function oppThreatTone(i) { return i < 2 ? 'lo' : i < 5 ? 'mid' : 'hi'; }

function _oppGauge(label, inner) {
  return '<div class="opp-gauge"><span class="opp-gauge-k">' + label + '</span>' + inner + '</div>';
}

function renderEnemies() {
  var container = $('enemy-list');
  if (!container) return;
  container.innerHTML = '';
  ENEMIES.forEach(function(e) {
    var locked = !isUnlocked(e);
    var portrait = PORTRAITS.enemies[e.id];
    // A locked opp still shows a real reading, not a scare number: threat is
    // what it would be, and the card stays at full contrast (contract:
    // "state the gate, not the refusal").
    var threat = enemyThreat(e);
    var hp = oppHpRating(e);

    var segs = '';
    for (var i = 0; i < 8; i++) {
      segs += '<i class="opp-seg ' + oppThreatTone(i) + (i < threat ? ' on' : '') + '"></i>';
    }

    var cash = '$' + e.reward.cash[0].toLocaleString() + '–' + e.reward.cash[1].toLocaleString();

    var div = document.createElement('div');
    div.className = 'opp-card';
    div.innerHTML =
      '<div class="opp-top">' +
        '<div class="opp-portrait">' +
          (portrait ? '<img src="' + portrait + '" alt="' + e.name + '" loading="lazy">' : '') +
          '<span class="opp-scrim"></span>' +
          '<span class="opp-code">' + (e.code || '') + '</span>' +
          '<button class="opp-pin" onclick="oppLocate(\'' + e.id + '\')" ' +
            'aria-label="Find ' + e.name + ' on The Hood">' + OPP_PIN_SVG + '</button>' +
        '</div>' +
        '<div class="opp-id">' +
          '<div class="opp-name">' + e.name + '</div>' +
          '<div class="opp-role">' + (e.role || '') + '</div>' +
        '</div>' +
        '<div class="opp-actions">' +
          (locked
            ? '<span class="opp-engage locked">LEVEL ' + requiredLevel(e) + '</span>'
            : '<button class="opp-engage" onclick="startCombat(\'' + e.id + '\')">ENGAGE</button>') +
          // One capsule, one segment: the optional bonus-drop segment has no
          // per-enemy source in this repo (drops.js rolls a global rarity
          // ladder, not a named drop per opp), so it is left off rather than
          // invented. See the PR.
          '<div class="opp-reward"><span class="opp-cash">' + cash + '</span></div>' +
        '</div>' +
      '</div>' +
      '<div class="opp-gauges">' +
        _oppGauge('HP', '<div class="opp-hp"><div class="opp-hp-fill" style="width:' + (hp / 8 * 100) + '%"></div></div>') +
        _oppGauge('THREAT', '<div class="opp-threat">' + segs + '</div>') +
      '</div>';
    container.appendChild(div);
  });
}

// The pin jumps to The Hood. Centring the map on THIS opp needs per-opp
// positions, which arrive with the city data in DOM-118 — until then it opens
// the map rather than pretending to a precision it does not have.
function oppLocate(enemyId) {
  showTab('map');
}

// ── Start combat ──────────────────────────────
function startCombat(enemyId) {
  syncHospital();
  if (isHospitalized()) {
    toast("You're laid up in the Hospital!", true);
    showTab('hood');
    renderHospital();
    return;
  }
  var staminaCost = tune('combat.staminaPerFight');
  // Pain moment #1 (DOM-76): the refusal is also the Stamina Boost offer.
  if (G.stamina.current < staminaCost) { surfaceOffer('stamina', 'Not enough Stamina!'); return; }
  if (G.health.current <= 1) { toast('Too hurt to fight! Rest up first.', true); return; }
  var e = ENEMIES.find(function(x) { return x.id === enemyId; });
  if (!e || !isUnlocked(e)) return;

  // The stake is placed when the fight starts; Run does not refund it.
  debit('stamina', staminaCost, REASON.FIGHT_COST, { ref: { enemyId: e.id } });

  // Combat snapshot (DOM-75): freeze the stats and loadout the fight is fought
  // with, plus the CP = A × (H + D) matchmaking proxy, stored at write time.
  // Deliberately separate from the live Cash balance, which settles at
  // resolution. Capture trigger and staleness rules are an open decision
  // (owner: Bill) — entry-capture is the v1 placeholder.
  var pf = _playerFighter();
  G.combatSnapshot = {
    atk: pf.atk, def: pf.def, hp: pf.hp,
    loadout: JSON.parse(JSON.stringify(G.loadout || {})),
    cp: pf.atk * (pf.hp + pf.def),
    at: Date.now(),
  };

  combatEnemy = Object.assign({}, e);
  _fight = {
    eHp: e.hp, round: 0, over: false,
    // Round-history for the sparkline well (DOM-103), as HP percentages.
    // You may walk in hurt; the opp always starts full.
    hist: [{ you: Math.max(0, G.health.current / G.health.max * 100), opp: 100 }],
  };

  var portraitEl = $('c-enemy-portrait');
  if (portraitEl) {
    var src = PORTRAITS.enemies[e.id];
    portraitEl.src = src || '';
    portraitEl.style.display = src ? 'block' : 'none';
  }
  $('c-enemy-name').textContent = e.name;
  var roleEl = $('c-enemy-role');
  if (roleEl) roleEl.textContent = (e.code ? e.code + ' · ' : '') + (e.role || '');
  $('combat-result').textContent = '';
  $('close-combat').style.display = 'none';
  _simState('idle');
  _setActionButtons(true);
  _drawBars();

  var st = fmStats(_playerFighter(), _enemyFighter(e), _fightCfg(), 300, Math.random);
  var pct = Math.round(st.pWin * 100);
  var oddsEl = $('c-odds');
  if (oddsEl) {
    // The real number, not the prototype's threat-derived placeholder
    // (`90 − threat × 7.5`): this repo has an actual fight model, so the
    // figure is a Monte Carlo of the matchup. Thresholds and type are the
    // doc's — success >= 60, gold >= 45, danger below.
    oddsEl.textContent = pct + '%';
    oddsEl.className = 'eng-odds ' + (pct >= 60 ? 'good' : pct >= 45 ? 'even' : 'bad');
  }

  $('combat-overlay').classList.add('open');
  _clearSpark();
  _drawSpark(); // just the midline until the first round lands
  GameState.save();
}

// The engage modal's sim window has three states (OVERLAYS.md): idle shows the
// odds, running swaps in the fight trace, done stamps the W/L over a wash.
function _simState(state) {
  var sim = $('eng-sim');
  if (sim) sim.className = 'eng-sim is-' + state;
}

// The VS row's two HP bars are gone in v0.2 — the trace carries both sides'
// health, one point per round. Kept as the single place that knows that, so
// the round handlers read the same as before.
function _drawBars() { /* HP now reads off the trace; see _pushSparkPoint */ }

// ── Sparkline well (DOM-103) ──────────────────
// The contract's .combat-log well: both HP traces round by round. SVG, not
// canvas — the lines are stroked by .combat-spark .you / .opp so the palette
// lives in the stylesheet tokens (chrome = you, --red = opp), exactly as the
// DOM-42 well worked before the DOM-72 rebuild dropped it.

function _pushSparkPoint() {
  if (!_fight || !combatEnemy) return;
  _simState('running');   // the trace replaces the odds once a round lands
  _fight.hist.push({
    you: Math.max(0, G.health.current / G.health.max * 100),
    opp: Math.max(0, _fight.eHp / combatEnemy.hp * 100),
  });
  _drawSpark();
}

function _drawSpark() {
  var well = $('combat-log'), svg = $('combat-spark');
  if (!well || !svg || !_fight) return;
  var w = well.clientWidth, h = well.clientHeight;
  if (!w || !h) return;
  // 1 user unit = 1 px, so strokes never distort.
  svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
  var padX = 4, padY = 6;
  function py(v) { return h - padY - (h - padY * 2) * (v / 100); }
  var mid = $('spark-mid');
  if (mid) {
    mid.setAttribute('x1', padX); mid.setAttribute('x2', w - padX);
    mid.setAttribute('y1', py(50)); mid.setAttribute('y2', py(50));
  }
  var pts = _fight.hist;
  if (pts.length < 2) return;
  function px(i) { return padX + (w - padX * 2) * (i / (pts.length - 1)); }
  function trace(id, dotId, key) {
    var d = '';
    for (var i = 0; i < pts.length; i++) {
      d += (i ? 'L' : 'M') + px(i).toFixed(1) + ' ' + py(pts[i][key]).toFixed(1);
    }
    var el = $(id);
    if (el) el.setAttribute('d', d);
    var dot = $(dotId);
    if (dot) {
      dot.setAttribute('cx', px(pts.length - 1).toFixed(1));
      dot.setAttribute('cy', py(pts[pts.length - 1][key]).toFixed(1));
    }
  }
  trace('spark-opp', 'spark-dot-opp', 'opp');
  trace('spark-you', 'spark-dot-you', 'you');
}

function _clearSpark() {
  ['spark-you', 'spark-opp'].forEach(function(id) {
    var el = $(id); if (el) el.removeAttribute('d');
  });
  ['spark-dot-you', 'spark-dot-opp'].forEach(function(id) {
    var el = $(id);
    if (el) { el.removeAttribute('cx'); el.removeAttribute('cy'); }
  });
  var res = $('spark-result');
  if (res) { res.textContent = ''; res.className = 'eng-stamp'; }
}

function _setActionButtons(enabled) {
  ['hit-btn', 'run-btn'].forEach(function(id) {
    var el = $(id);
    if (el) el.disabled = !enabled;
  });
}

// One round, sequential per the ticket's flow: the player's hit lands first
// and a killed enemy never counterattacks; otherwise the counter lands and
// 0 Health resolves the fight as a defeat.
function hitEm() {
  if (!combatEnemy || !_fight || _fight.over) return;
  _fight.round++;
  var r = fmRound(_playerFighter(), _enemyFighter(combatEnemy), _fightCfg(), Math.random, _fight.round === 1);
  _fight.eHp -= r.toEnemy;
  if (_fight.eHp <= 0) {
    _drawBars();
    _pushSparkPoint();
    _endFight(true);
    return;
  }
  debit('health', r.toPlayer, REASON.COMBAT_DAMAGE, { ref: { enemyId: combatEnemy.id, round: _fight.round } });
  _drawBars();
  _pushSparkPoint();
  if (G.health.current <= 0) {
    _endFight(false);
    return;
  }
  $('combat-result').textContent = 'ROUND ' + _fight.round + ' · DEALT ' + r.toEnemy + ' · TOOK ' + r.toPlayer;
  $('combat-result').className = 'eng-caption';
  GameState.save();
}

// The emergency exit. Escape ends the fight with no defeat loss and no
// hospital; a failed run eats the opponent's hit and the fight continues.
function runAway() {
  if (!combatEnemy || !_fight || _fight.over) return;
  if (Math.random() < tune('combat.runAwayChance')) {
    _fight.over = true;
    _setActionButtons(false);
    _simState('done');
    $('combat-result').textContent = 'YOU GOT AWAY.';
    $('combat-result').className = 'eng-caption';
    log('Ran from ' + combatEnemy.name + ' — no harm, no reward', 'info');
    $('close-combat').style.display = 'inline-block';
    GameState.save();
    return;
  }
  var r = fmRound(_playerFighter(), _enemyFighter(combatEnemy), _fightCfg(), Math.random, false);
  debit('health', r.toPlayer, REASON.COMBAT_DAMAGE, { ref: { enemyId: combatEnemy.id, ran: true } });
  _drawBars();
  _pushSparkPoint();
  if (G.health.current <= 0) { _endFight(false); return; }
  $('combat-result').textContent = "COULDN'T GET AWAY · TOOK " + r.toPlayer;
  $('combat-result').className = 'eng-caption bad';
  GameState.save();
}

function _endFight(enemyDead) {
  var enemy = combatEnemy;
  _fight.over = true;
  _setActionButtons(false);

  // Stamp the well; the traces stay on screen — the player just watched them.
  _simState('done');
  var res = $('spark-result');
  if (res) {
    res.textContent = enemyDead ? 'W' : 'L';
    res.className = 'eng-stamp show ' + (enemyDead ? 'win' : 'loss');
  }

  if (enemyDead) {
    var cashWon = rand(enemy.reward.cash[0], enemy.reward.cash[1]);
    credit('cash', cashWon, REASON.FIGHT_REWARD, { ref: { enemyId: enemy.id } });
    addClout(enemy.reward.clout, REASON.FIGHT_REWARD, { enemyId: enemy.id });
    $('combat-result').textContent = '+$' + cashWon.toLocaleString() + ' · +' + enemy.reward.clout + ' CLOUT';
    $('combat-result').className = 'eng-caption good';
    log('Smoked ' + enemy.name + ' -- won $' + cashWon.toLocaleString() + ' + ' + enemy.reward.clout + ' Clout', 'win');
    Quests.onFightWin(enemy.id);
    rollDrop(enemy.name); // fight wins roll the rarity ladder too (DOM-18)
    Sound.win();
  } else {
    // The loss is a share of the CURRENT balance at resolution, never a
    // reserved amount (DOM-68 locked rule). defeatLossCap is ratified null
    // (uncapped, DOM-79) but wired so capping is a tuning change, no release.
    var cashLost = Math.floor(G.cash * tune('loot.defeatLossRate'));
    var lossCap = tune('loot.defeatLossCap');
    if (lossCap !== null) cashLost = Math.min(cashLost, lossCap);
    // debit() returns the (negative) applied delta; flip it for display.
    cashLost = -debit('cash', cashLost, REASON.FIGHT_DEFEAT_LOSS, { ref: { enemyId: enemy.id } });
    // Losing still teaches you something. Expressed as a share of the win so it
    // tracks content difficulty automatically instead of needing its own table.
    var cloutLost = Math.floor(enemy.reward.clout * tune('combat.defeatCloutShare'));
    addClout(cloutLost, REASON.FIGHT_REWARD, { enemyId: enemy.id, outcome: 'loss' });
    // 0 Health = hospitalized, in the same transaction that resolves the fight.
    hospitalize();
    $('combat-result').textContent = '-$' + cashLost.toLocaleString() + ' · HOSPITALIZED';
    $('combat-result').className = 'eng-caption bad';
    log('Got beat by ' + enemy.name + ' -- lost $' + cashLost.toLocaleString() + ', kept ' + cloutLost + ' Clout. Hospitalized.', 'loss');
    Sound.loss();
  }
  updateHUD();
  renderHospital();
  $('close-combat').style.display = 'inline-block';
  GameState.save();
}

function closeCombat() {
  _simState('idle');
  combatEnemy = null;
  _fight = null;
  $('combat-overlay').classList.remove('open');
  // Landing in the Hospital is a consequence of losing — surface it.
  if (isHospitalized()) { showTab('hood'); renderHospital(); }
}

// This screen claims its tab (DOM-127). Threat is derived from live stats, so
// the list is rebuilt on entry rather than cached.
registerScreen('fight', renderEnemies);
