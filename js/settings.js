// ─────────────────────────────────────────────
//  SETTINGS (DOM-111 — screens/08-settings.md)
//
//  Preferences + account. Two groups: a sound toggle that gates the global
//  WebAudio click, and two mutually-exclusive account expanders.
//
//  Persistent state is `G.soundOn` alone. `acctOpen` / `contactOpen` are
//  session-only and live in the DOM as an `open` class, matching the repo's
//  showTab() pattern — no store (v0.2 README §State & data).
// ─────────────────────────────────────────────

// Contact details the CONTACT DEVELOPER card publishes. Not gameplay data, so
// not a JSON file — but named once here rather than inlined in three places.
const SETTINGS_CONTACT = {
  email: 'dev@oppsgame.io',
  discord: 'discord.gg/opps',
};

// Inline stroked SVG only — no emoji, no icon fonts (CLAUDE.md). stroke-width 2,
// round caps/joins, sized 18px in the 38px icon wells.
const SETTINGS_ICONS = {
  speaker: '<path d="M11 5 6 9H2v6h4l5 4V5z"></path><path d="M15.5 8.5a5 5 0 0 1 0 7"></path><path d="M18.5 5.5a9 9 0 0 1 0 13"></path>',
  person: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>',
  envelope: '<rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="m22 7-10 6L2 7"></path>',
};

function _stIcon(name, gold) {
  return '<span class="st-well' + (gold ? ' gold' : '') + '">'
    + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
    + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + SETTINGS_ICONS[name] + '</svg></span>';
}

// ── Account values ───────────────────────────────────────────────────────────
// The design doc's values (LIL WASH, OPP-4471-9X, MAR 2025, EASTSIDE KINGS) are
// prototype placeholders — the handoff's own caveat is "ship the schema; tune
// the data". These read the real save instead, in the typography the doc
// specifies. A field the repo genuinely has no source for says so rather than
// inventing one.
function stAccountRows() {
  return [
    { label: 'Handle',       value: G.handle || 'NOT SET',            display: true },
    { label: 'Player ID',    value: G.playerId || 'GUEST',            display: false },
    { label: 'Member since', value: stMemberSince(),                  display: false },
    { label: 'Crew',         value: stCrewLabel(),                    display: true },
  ];
}

// "MAR 2025" from G.createdAt. Saves made before the field existed read null —
// an honest dash, not a fabricated date.
const ST_MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
function stMemberSince() {
  if (!G.createdAt) return '—';
  const d = new Date(G.createdAt);
  if (isNaN(d.getTime())) return '—';
  return ST_MONTHS[d.getMonth()] + ' ' + d.getFullYear();
}

// Crew is SDK-stubbed and has no NAME in the repo — only a Lieutenant count
// (js/crew.js). Render the count, which is real, rather than a made-up gang name.
function stCrewLabel() {
  const n = G.crewMemberCount || 0;
  if (!n) return 'NO CREW YET';
  return n + ' LIEUTENANT' + (n === 1 ? '' : 'S');
}

// ── Render ───────────────────────────────────────────────────────────────────
function renderSettings() {
  const root = $('st-root');
  if (!root) return;

  const on = G.soundOn !== false;   // defensive: an older save may lack the field
  const rows = stAccountRows().map(r =>
    '<div class="st-row">'
      + '<span class="st-row-k">' + r.label + '</span>'
      + '<span class="st-row-v' + (r.display ? ' display' : '') + '">' + stEsc(r.value) + '</span>'
    + '</div>'
  ).join('');

  const contactRows = [
    { label: 'Email', value: SETTINGS_CONTACT.email },
    { label: 'Discord', value: SETTINGS_CONTACT.discord },
  ].map(r =>
    '<div class="st-row">'
      + '<span class="st-row-k">' + r.label + '</span>'
      + '<span class="st-row-v">' + stEsc(r.value) + '</span>'
    + '</div>'
  ).join('');

  root.innerHTML =
    '<div class="st-group">'
      + '<div class="st-heading">PREFERENCES</div>'
      + '<div class="st-card st-sound">'
        + _stIcon('speaker', true)
        + '<div class="st-sound-text">'
          + '<div class="st-title">SOUND EFFECTS</div>'
          + '<div class="st-sub">UI clicks &amp; in-game cues · '
            + '<span class="st-state" id="st-sound-state">' + (on ? 'ON' : 'OFF') + '</span></div>'
        + '</div>'
        // A real checkbox: the track and knob are presentation, the input
        // carries the state and the keyboard affordance. The track is a
        // SIBLING of the input so plain `input:checked ~ .st-track` styles it
        // — `:has()` on the label would read better but is too new for the
        // device range this game targets (CLAUDE.md, tech requirements).
        + '<label class="st-toggle" aria-label="Sound effects">'
          + '<input type="checkbox" id="st-sound" onchange="setSound(this.checked)"' + (on ? ' checked' : '') + '>'
          + '<span class="st-track"><span class="st-knob"></span></span>'
        + '</label>'
      + '</div>'
    + '</div>'

    + '<div class="st-group">'
      + '<div class="st-heading">ACCOUNT</div>'
      + '<div class="st-expanders">'
        + stExpander('acct', 'person', 'ACCOUNT INFO', rows)
        + stExpander('contact', 'envelope', 'CONTACT DEVELOPER',
            '<p class="st-prose">Found a bug or got an idea for the streets? Hit the team direct.</p>'
            + contactRows
            + '<button class="st-report" onclick="reportBug()">REPORT A BUG</button>')
      + '</div>'
    + '</div>';
}

function stExpander(id, icon, title, body) {
  return '<div class="st-card st-exp" id="st-exp-' + id + '">'
    + '<button class="st-exp-head" onclick="toggleExpander(\'' + id + '\')" aria-expanded="false">'
      + _stIcon(icon)
      + '<span class="st-title">' + title + '</span>'
      + '<span class="st-chev" aria-hidden="true">&#8250;</span>'
    + '</button>'
    + '<div class="st-exp-body">' + body + '</div>'
  + '</div>';
}

function stEsc(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ── Actions ──────────────────────────────────────────────────────────────────

// §5.2 sequence, minus the parts a preference has no business doing: validate,
// mutate G, re-render the tab, save. No toast — the toggle IS the feedback, and
// no HUD value changed.
function setSound(on) {
  Sound.setEnabled(on);                       // writes G.soundOn
  const state = $('st-sound-state');
  if (state) state.textContent = on ? 'ON' : 'OFF';
  GameState.save();
  // Confirm the new state audibly. Only on the way ON — a click after you
  // silence things would be the one sound you definitely didn't ask for.
  if (on) Sound.click();
}

// Session-only, and mutually exclusive: opening one closes the other.
function toggleExpander(id) {
  const me = $('st-exp-' + id);
  if (!me) return;
  const opening = !me.classList.contains('open');
  document.querySelectorAll('#st-root .st-exp').forEach(el => {
    el.classList.remove('open');
    const head = el.querySelector('.st-exp-head');
    if (head) head.setAttribute('aria-expanded', 'false');
  });
  if (opening) {
    me.classList.add('open');
    const head = me.querySelector('.st-exp-head');
    if (head) head.setAttribute('aria-expanded', 'true');
  }
}

// No alert/confirm (contract). Hands off to the mail client; if the platform
// blocks navigation there is nothing to fall back to but telling them the
// address, which the card is already showing.
function reportBug() {
  const subject = encodeURIComponent('OPPS bug report');
  const body = encodeURIComponent(
    '\n\n---\nPlayer ID: ' + (G.playerId || 'guest')
    + '\nLevel: ' + G.level
    + '\nSave version: ' + G.schemaVersion);
  try {
    window.location.href = 'mailto:' + SETTINGS_CONTACT.email + '?subject=' + subject + '&body=' + body;
  } catch (_) {
    toast('Email ' + SETTINGS_CONTACT.email);
  }
}

// This screen claims its tab (DOM-127). Sound state and the expanders are
// rebuilt on entry, so the panel always reflects the live save.
registerScreen('settings', renderSettings);
