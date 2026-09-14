// ─────────────────────────────────────────────
//  PLUGS — NPC contacts with portraits + dialog
// ─────────────────────────────────────────────

const PLUGS_DATA = [
  {
    id: 'plug-tommy',
    name: 'TOMMY',
    moniker: 'THE FENCE',
    line: "Got a buyer lined up for anything you can move tonight. No questions asked.",
    dialog: [
      "Ay, look who finally pulled up. You been sittin’ on merchandise — I can smell it from here.",
      "I got a buyer waitin’ out the back of the pawn shop on 5th. No names, no paper trail, cash on the spot.",
      "Anything you boosted — jewelry, tools, electronics — bring it through before sunrise.",
      "Move fast and I’ll cut you 70. That’s family rates, homie. We in business?"
    ]
  },
  {
    id: 'plug-theresa',
    name: 'THERESA',
    moniker: 'THE CONNECT',
    line: "Can re-up your stash at half price — but she needs a favor handled first.",
    dialog: [
      "Mijo, you came at the right time. My re-up just landed and it’s heavy.",
      "I’ll front you product at half price. Half. Nobody in this city gets that deal.",
      "But first — a favor. There’s a snitch downtown runnin’ his mouth about my shipments.",
      "Make that problem disappear and the discount’s yours. Don’t keep me waiting."
    ]
  },
  {
    id: 'plug-kylie',
    name: 'KYLIE',
    moniker: 'THE LOOKOUT',
    line: "Knows where the Rival Crew lays their heads. That intel won’t stay fresh long.",
    dialog: [
      "Psst. Keep walkin’, act normal. I’ve had eyes on the Rival Crew all week.",
      "They lay their heads at a spot off 7th & Lenox. Lights out by 2AM, one man on the door.",
      "This intel won’t stay fresh — they rotate spots every few days.",
      "Hit ’em while they’re sleepin’. And remember who put you on."
    ]
  },
  {
    id: 'plug-marco',
    name: 'BIG HOMIE MARCO',
    moniker: 'THE MECHANIC',
    line: "Needs parts boosted off the Auto Theft Ring. Help him out and he owes you one.",
    dialog: [
      "Big dog! Just the hustler I been waitin’ on. Shop’s dry and I got orders stackin’ up.",
      "That Auto Theft Ring out by the airport is sittin’ on a warehouse full of parts. Engines, rims, catalytics — all of it boosted anyway.",
      "Run up in there and liberate me some inventory. They won’t hand it over polite, so come strapped.",
      "Every crate you bring back, I’m payin’ top dollar. Cash, no questions. We got a deal or what?"
    ]
  },
  {
    id: 'plug-dex',
    name: 'DEX',
    moniker: 'THE TWEAKER',
    line: "Wants to put you onto a bigger play downtown. Pull up when you’re ready.",
    dialog: [
      "Yo yo yo — okay okay, listen. LISTEN. I seen somethin’ downtown you need to know about.",
      "Armored truck. Same route every Thursday. Parks behind the bank for exactly six minutes. SIX.",
      "I counted. Twice. Maybe three times. Point is — that’s a whole bag just sittin’ there, homie.",
      "Pull up Thursday and I’ll show you the spot. This is the big one, I’m tellin’ you."
    ]
  }
];

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

function renderPlugs() {
  var container = $('plugs-grid');
  if (!container) return;
  container.innerHTML = '';
  PLUGS_DATA.forEach(function(plug, idx) {
    var portrait = PORTRAITS.plugs[plug.id];
    var card = document.createElement('div');
    card.className = 'plug-card';
    card.onclick = function() { openPlug(idx); };
    card.innerHTML =
      // No entry → the empty wrap is the placeholder: a chrome-ringed circle on --well.
      '<div class="plug-portrait-img">' +
        (portrait ? '<img src="' + portrait + '" alt="' + plug.name + '" loading="lazy">' : '') +
      '</div>' +
      '<div class="plug-info">' +
        '<div>' +
          '<div class="plug-name">' + plug.name + '</div>' +
          '<div class="plug-moniker">' + plug.moniker + '</div>' +
          '<div class="plug-line">' + plug.line + '</div>' +
          _plugQuestChip(plug) +
        '</div>' +
        '<div class="plug-action">' +
          '<button class="plug-go-btn">LETS GO</button>' +
        '</div>' +
      '</div>';
    container.appendChild(card);
  });
}

function openPlug(idx) {
  const plug = PLUGS_DATA[idx];
  if (!plug) return;
  if (!_plugState[idx]) _plugState[idx] = { line: 0 };

  const overlay = $('plug-overlay');
  overlay.dataset.idx = idx;
  _renderPlugDialog(idx);
  overlay.classList.add('open');
}

function _renderPlugDialog(idx) {
  const plug = PLUGS_DATA[idx];
  const state = _plugState[idx] || { line: 0 };
  const li = Math.min(state.line, plug.dialog.length - 1);
  const isLast = li >= plug.dialog.length - 1;

  var portrait = PORTRAITS.plugs[plug.id];
  var portraitEl = $('plug-modal-portrait');
  // No entry → hide the img and let the wrap's --well fill stand in.
  portraitEl.hidden = !portrait;
  if (portrait) { portraitEl.src = portrait; portraitEl.alt = plug.name; }
  else { portraitEl.removeAttribute('src'); portraitEl.alt = ''; }
  $('plug-modal-name').textContent = plug.name;
  $('plug-modal-moniker').textContent = plug.moniker;
  $('plug-modal-text').textContent = plug.dialog[li];
  $('plug-modal-count').textContent = `${li + 1} / ${plug.dialog.length}`;

  const btn = $('plug-modal-cta');
  btn.textContent = isLast ? 'GO' : 'NEXT';
  // The final line is the one action worth promoting, so it takes the chrome
  // primary; every other line advances the dialogue and stays secondary.
  // These were three inline hex assignments (#bfce1c / #15120e / #e9e4db plus a
  // translucent-white border) that no stylesheet could reach.
  // When the plug's quest is claimable, COLLECT is the region's one primary
  // instead (contract: one primary per region) — GO stays secondary then.
  const q = questFor(plug.id);
  const claimable = q && questUnlocked(q) && !questClaimed(q) && questComplete(q);
  btn.classList.toggle('is-final', isLast && !claimable);
  _renderQuestPanel(plug);
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
  const plug = PLUGS_DATA[idx];
  const state = _plugState[idx] || { line: 0 };
  if (state.line >= plug.dialog.length - 1) {
    closePlug();
    return;
  }
  state.line++;
  _plugState[idx] = state;
  _renderPlugDialog(idx);
}

function closePlug() {
  $('plug-overlay').classList.remove('open');
}
