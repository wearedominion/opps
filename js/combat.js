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

var ENEMY_PORTRAITS = {
  snitch:  'assets/portraits/enemy-snitch.png',
  stick:   'assets/portraits/enemy-stick.png',
  oppcrew: 'assets/portraits/enemy-oppcrew.png',
  jackers: 'assets/portraits/enemy-jackers.png',
  rival:   'assets/portraits/enemy-rival.png',
  fed:     'assets/portraits/enemy-fed.png',
};

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
  return { atk: G.attack, def: G.defense, hp: G.health.current };
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

// ── Render enemies list ───────────────────────
function renderEnemies() {
  var container = $('enemy-list');
  if (!container) return;
  container.innerHTML = '';
  ENEMIES.forEach(function(e) {
    var locked = !isUnlocked(e);
    var portrait = ENEMY_PORTRAITS[e.id];
    var threat = locked ? 8 : enemyThreat(e);
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
        '<div class="enemy-reward">Reward: $' + e.reward.cash[0].toLocaleString() + '–$' + e.reward.cash[1].toLocaleString() + '</div>' +
      '</div>' +
      (locked
        ? '<div class="enemy-locked">' + lockLabel(e) + '</div>'
        : '<button class="attack-btn" onclick="startCombat(\'' + e.id + '\')">SLIDE ON \'EM</button>');
    container.appendChild(div);
  });
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

  combatEnemy = Object.assign({}, e);
  _fight = { eHp: e.hp, round: 0, over: false };

  var portraitEl = $('c-enemy-portrait');
  if (portraitEl) {
    var src = ENEMY_PORTRAITS[e.id];
    portraitEl.src = src || '';
    portraitEl.style.display = src ? 'block' : 'none';
  }
  var iconEl = $('c-enemy-icon');
  if (iconEl) iconEl.textContent = '';

  $('c-enemy-name').textContent = e.name;
  $('combat-result').textContent = '';
  $('close-combat').style.display = 'none';
  _setActionButtons(true);
  _drawBars();

  var st = fmStats(_playerFighter(), _enemyFighter(e), _fightCfg(), 300, Math.random);
  var pct = Math.round(st.pWin * 100);
  var oddsEl = $('c-odds');
  if (oddsEl) {
    oddsEl.textContent = '~' + pct + '% WIN';
    // Red here is combat semantics, which is where the contract allows it.
    oddsEl.style.color = pct >= 60 ? 'var(--green)' : pct >= 45 ? 'var(--chrome)' : 'var(--red)';
  }

  $('combat-overlay').classList.add('open');
  GameState.save();
}

function _drawBars() {
  if (!combatEnemy || !_fight) return;
  $('c-player-hp').style.width = Math.max(0, G.health.current / G.health.max * 100) + '%';
  $('c-enemy-hp').style.width = Math.max(0, _fight.eHp / combatEnemy.hp * 100) + '%';
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
    _endFight(true);
    return;
  }
  debit('health', r.toPlayer, REASON.COMBAT_DAMAGE, { ref: { enemyId: combatEnemy.id, round: _fight.round } });
  _drawBars();
  if (G.health.current <= 0) {
    _endFight(false);
    return;
  }
  $('combat-result').textContent = 'Round ' + _fight.round + ': dealt ' + r.toEnemy + ' — took ' + r.toPlayer;
  $('combat-result').style.color = 'var(--body)';
  GameState.save();
}

// The emergency exit. Escape ends the fight with no defeat loss and no
// hospital; a failed run eats the opponent's hit and the fight continues.
function runAway() {
  if (!combatEnemy || !_fight || _fight.over) return;
  if (Math.random() < tune('combat.runAwayChance')) {
    _fight.over = true;
    _setActionButtons(false);
    $('combat-result').textContent = 'YOU GOT AWAY.';
    $('combat-result').style.color = 'var(--body)';
    log('Ran from ' + combatEnemy.name + ' — no harm, no reward', 'info');
    $('close-combat').style.display = 'inline-block';
    GameState.save();
    return;
  }
  var r = fmRound(_playerFighter(), _enemyFighter(combatEnemy), _fightCfg(), Math.random, false);
  debit('health', r.toPlayer, REASON.COMBAT_DAMAGE, { ref: { enemyId: combatEnemy.id, ran: true } });
  _drawBars();
  if (G.health.current <= 0) { _endFight(false); return; }
  $('combat-result').textContent = 'Couldn\'t get away — took ' + r.toPlayer;
  $('combat-result').style.color = 'var(--red)';
  GameState.save();
}

function _endFight(enemyDead) {
  var enemy = combatEnemy;
  _fight.over = true;
  _setActionButtons(false);

  if (enemyDead) {
    var cashWon = rand(enemy.reward.cash[0], enemy.reward.cash[1]);
    credit('cash', cashWon, REASON.FIGHT_REWARD, { ref: { enemyId: enemy.id } });
    addClout(enemy.reward.clout, REASON.FIGHT_REWARD, { enemyId: enemy.id });
    $('combat-result').textContent = 'YOU SMOKED HIM! +$' + cashWon.toLocaleString();
    $('combat-result').style.color = 'var(--green)';
    log('Smoked ' + enemy.name + ' -- won $' + cashWon.toLocaleString() + ' + ' + enemy.reward.clout + ' Clout', 'win');
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
    $('combat-result').textContent = 'YOU CAUGHT AN L! Lost $' + cashLost.toLocaleString() + ' — HOSPITALIZED';
    $('combat-result').style.color = 'var(--red)';
    log('Got beat by ' + enemy.name + ' -- lost $' + cashLost.toLocaleString() + ', kept ' + cloutLost + ' Clout. Hospitalized.', 'loss');
    Sound.loss();
  }
  updateHUD();
  renderHospital();
  $('close-combat').style.display = 'inline-block';
  GameState.save();
}

function closeCombat() {
  combatEnemy = null;
  _fight = null;
  $('combat-overlay').classList.remove('open');
  // Landing in the Hospital is a consequence of losing — surface it.
  if (isHospitalized()) { showTab('hood'); renderHospital(); }
}
