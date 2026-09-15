// ─────────────────────────────────────────────
//  PLUGS — NPC contacts with portraits + dialog
//
//  The roster lives in data/plugs.json and arrives as the PLUGS global
//  (js/main.js). It used to be a literal array right here; DOM-123 moved it
//  out so plug content ships without a code change (tenet T4).
// ─────────────────────────────────────────────

// Per-plug dialog progress (in-session only)
const _plugState = {};

// Quest status chip for a plug card (DOM-90). Locked states name the gate
// (contract: state the gate, not the refusal); a claimable quest is the one
// state worth shouting about.
function _plugQuestChip(plug) {
  const q = questFor(plug.id);
  if (!q) return '';
  if (questClaimed(q)) return '<span class="plug-quest-chip done">JOB DONE</span>';
  if (!questUnlocked(q)) return '<span class="plug-quest-chip locked">JOB · LV ' + q.levelReq + '</span>';
  if (questComplete(q)) return '<span class="plug-quest-chip claim">COLLECT REWARD</span>';
  const p = questProgress(q);
  return '<span class="plug-quest-chip">JOB · ' + p.done + '/' + p.total + '</span>';
}

// A 12px-gap column of horizontal cards (screens/04-plugs.md). Only LETS GO
// is clickable — the prototype gives the card itself no affordance, so neither
// do we rather than leaving an invisible hit target.
function renderPlugs() {
  var container = $('plugs-grid');
  if (!container) return;
  container.innerHTML = '';
  PLUGS.forEach(function(plug, idx) {
    var portrait = PORTRAITS.plugs[plug.id];
    var card = document.createElement('div');
    card.className = 'plug-card';
    card.innerHTML =
      // No entry → the empty wrap is the placeholder: --surface behind the scrim.
      '<div class="plug-portrait-img">' +
        (portrait ? '<img src="' + portrait + '" alt="' + plug.name + '" loading="lazy">' : '') +
        '<div class="plug-card-scrim"></div>' +
      '</div>' +
      '<div class="plug-info">' +
        '<div class="plug-name">' + plug.name + '</div>' +
        '<div class="plug-moniker">' + plug.moniker + '</div>' +
        '<div class="plug-line">' + plug.line + '</div>' +
        _plugQuestChip(plug) +
        '<div class="plug-action">' +
          '<button class="plug-go-btn">LETS GO</button>' +
        '</div>' +
      '</div>';
    card.querySelector('.plug-go-btn').onclick = function() { openPlug(idx); };
    container.appendChild(card);
  });
}

function openPlug(idx) {
  const plug = PLUGS[idx];
  if (!plug) return;
  // Dialogue position is per-session, not saved: reopening a plug mid-run
  // picks up where you left off, but a reload starts the pitch over.
  if (!_plugState[idx]) _plugState[idx] = { line: 0 };

  const overlay = $('plug-overlay');
  overlay.dataset.idx = idx;
  _renderPlugDialog(idx);
  overlay.classList.add('open');
}

// Largest size (<= 21px) at which the name fits the pill's usable width,
// measured with the actually-rendered font rather than guessed from length —
// BIG HOMIE MARCO is the case that forces it.
const PLUG_NAME_MAX = 21, PLUG_NAME_MIN = 14, PLUG_NAME_AVAIL = 218;
let _plugNameCv = null;
function plugNameSize(name) {
  try {
    if (!_plugNameCv) _plugNameCv = document.createElement('canvas');
    const ctx = _plugNameCv.getContext('2d');
    if (!ctx) return PLUG_NAME_MAX;
    for (let px = PLUG_NAME_MAX; px >= PLUG_NAME_MIN; px--) {
      ctx.font = '400 ' + px + "px 'Anton', sans-serif";
      // letter-spacing:1px is not part of measureText, so add it back.
      if (ctx.measureText(name).width + name.length <= PLUG_NAME_AVAIL) return px;
    }
  } catch (e) { /* no canvas → fall through to the minimum, which always fits */ }
  return PLUG_NAME_MIN;
}

// Clicking the scrim dismisses, same as LATER. Guarded on the target so a
// click inside the panel does not close it.
function plugScrim(ev) {
  if (ev && ev.target && ev.target.id === 'plug-overlay') closePlug();
}

function _renderPlugDialog(idx) {
  const plug = PLUGS[idx];
  const state = _plugState[idx] || { line: 0 };
  const li = Math.min(state.line, plug.dialog.length - 1);
  const isLast = li >= plug.dialog.length - 1;

  var portrait = PORTRAITS.plugs[plug.id];
  var portraitEl = $('plug-modal-portrait');
  // No entry → hide the img and let the wrap's --surface fill stand in.
  portraitEl.hidden = !portrait;
  if (portrait) { portraitEl.src = portrait; portraitEl.alt = plug.name; }
  else { portraitEl.removeAttribute('src'); portraitEl.alt = ''; }
  const nameEl = $('plug-modal-name');
  nameEl.textContent = plug.name;
  nameEl.style.fontSize = plugNameSize(plug.name) + 'px';
  $('plug-modal-moniker').textContent = plug.moniker;
  $('plug-modal-text').textContent = plug.dialog[li];
  $('plug-modal-count').textContent = `${li + 1} / ${plug.dialog.length}`;

  const btn = $('plug-modal-cta');
  btn.textContent = plugCtaLabel(plug, isLast);
  // The final line is the one action worth promoting, so it takes the chrome
  // primary; every other line advances the dialogue and stays secondary.
  // These were three inline hex assignments (#bfce1c / #15120e / #e9e4db plus a
  // translucent-white border) that no stylesheet could reach.
  // When the plug's quest is claimable, COLLECT is the region's one primary
  // instead (contract: one primary per region) — the CTA stays secondary then.
  const q = questFor(plug.id);
  const claimable = q && questUnlocked(q) && !questClaimed(q) && questComplete(q);
  btn.classList.toggle('is-final', isLast && !claimable);
  _renderQuestPanel(plug);
}

// NEXT walks the pitch. On the last line the label names what the press
// actually does: the first run-through recruits the plug (RUN IT), and every
// later one runs the job they offer (GO — the prototype's label). 04-plugs.md
// writes this as "RUN IT / recruit action"; the prototype ships a flat GO.
// Splitting on `plugsRecruited` is the one reading that satisfies both.
function plugCtaLabel(plug, isLast) {
  if (!isLast) return 'NEXT';
  return plugRecruited(plug.id) ? 'GO' : 'RUN IT';
}

function plugRecruited(plugId) {
  return (G.plugsRecruited || []).indexOf(plugId) !== -1;
}

// Default XP awards, used until the XP system lands (DOM-124 is blocked on a
// ratification). These are the prototype's own fallbacks; once xp-system.json
// exists, `plugs.recruit` / `plugs.jobBase` replace them here.
const PLUG_XP_RECRUIT = 35, PLUG_XP_JOB = 50;

// Committing the last line: first time recruits the plug, later times run the
// job. Returns the award so the caller (and the tests) can see what happened
// without reaching into G.
function plugCommit(plugId) {
  if (!G.plugsRecruited) G.plugsRecruited = [];
  const first = !plugRecruited(plugId);
  if (first) G.plugsRecruited.push(plugId);
  const award = first
    ? { amount: PLUG_XP_RECRUIT, label: 'PLUG RECRUITED', first: true }
    : { amount: PLUG_XP_JOB,     label: 'JOB DONE',       first: false };
  // DOM-124 defines awardXp and the XP toast. Guarded so Plugs ships and
  // starts persisting recruits now; the award becomes visible when it lands.
  if (typeof awardXp === 'function') awardXp(award.amount, award.label);
  GameState.save();
  return award;
}

// The quest panel under the dialog (DOM-90): steps with live progress, the
// rule-priced bonus, and COLLECT when the work is done.
function _renderQuestPanel(plug) {
  const host = $('plug-quest-panel');
  if (!host) return;
  const q = questFor(plug.id);
  if (!q) { host.innerHTML = ''; host.hidden = true; return; }
  host.hidden = false;

  const stepName = s =>
    s.type === 'job' ? ((JOBS.find(j => j.id === s.id) || {}).name || s.id)
    : s.type === 'fight' ? ((ENEMIES.find(e => e.id === s.id) || {}).name || s.id)
    : 'Carry a ' + ((STORE_ITEMS.find(i => i.id === s.id) || {}).name || s.id);

  const locked = !questUnlocked(q);
  const claimed = questClaimed(q);
  const complete = !locked && questComplete(q);

  const steps = q.steps.map((s, i) => {
    const got = locked ? 0 : questStepProgress(q, i);
    const need = questStepTarget(s);
    const on = got >= need;
    return '<div class="plug-quest-step' + (on ? ' on' : '') + '">' +
      '<span class="pq-dot"></span>' +
      '<span class="pq-label">' + stepName(s) + '</span>' +
      '<span class="pq-count">' + got + '/' + need + '</span>' +
    '</div>';
  }).join('');

  const item = q.reward.item ? STORE_ITEMS.find(i => i.id === q.reward.item) : null;
  const reward = '<span class="pq-cash">$' + q.reward.cash.toLocaleString() + '</span>'
    + ' + ' + q.reward.clout.toLocaleString() + ' CLOUT'
    + (item ? ' + ' + item.name : '');

  host.innerHTML =
    '<div class="plug-quest-head">' +
      '<span class="plug-quest-title">' + q.name + '</span>' +
      (locked ? '<span class="plug-quest-chip locked">LV ' + q.levelReq + '</span>' : '') +
    '</div>' +
    '<div class="plug-quest-desc">' + q.desc + '</div>' +
    steps +
    '<div class="plug-quest-foot">' +
      '<span class="pq-reward">' + reward + '</span>' +
      (claimed
        ? '<span class="plug-quest-chip done">JOB DONE</span>'
        : '<button class="pq-claim' + (complete ? ' ready' : '') + '"' +
            (complete ? ' onclick="claimQuest(\'' + q.id + '\')"' : ' disabled') + '>' +
            (complete ? 'COLLECT' : locked ? 'LV ' + q.levelReq : 'IN PROGRESS') +
          '</button>') +
    '</div>';
}

function advancePlug() {
  const overlay = $('plug-overlay');
  const idx = parseInt(overlay.dataset.idx, 10);
  const plug = PLUGS[idx];
  const state = _plugState[idx] || { line: 0 };
  if (state.line >= plug.dialog.length - 1) {
    plugCommit(plug.id);
    closePlug();
    renderPlugs();   // the CTA and any quest chip change once recruited
    return;
  }
  state.line++;
  _plugState[idx] = state;
  _renderPlugDialog(idx);
}

function closePlug() {
  $('plug-overlay').classList.remove('open');
}
