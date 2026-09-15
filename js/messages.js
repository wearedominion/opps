// ─────────────────────────────────────────────
//  MESSAGES + XP TOAST (S10 — DOM-119)
//
//  The two overlays no screen owns. Both hang off the shell, which is why they
//  live here rather than in a screen file.
//
//  There is no messaging backend and the Jest SDK exposes none, so the threads
//  are content in data/messages.json and a reply the player sends is
//  session-only. That is deliberate: persisting replies would make an inbox
//  nobody can receive from look like a real one. Unread counts DO persist —
//  clearing a badge has to stay cleared across a reload or the badge is a lie.
// ─────────────────────────────────────────────

let msgOpen = false;
let msgThread = null;          // thread id, session-only
const _msgSent = {};           // { threadId: [ {from:'me', text, time} ] } — session-only

const msgEsc = v => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function msgThreads() {
  return (typeof MESSAGES !== 'undefined' && MESSAGES && MESSAGES.threads) || [];
}

function msgThreadById(id) {
  for (const t of msgThreads()) if (t.id === id) return t;
  return null;
}

// Unread is a read-state overlay on the content, kept in the save. A thread the
// player has opened reads zero for good.
function msgUnread(t) {
  const read = (G.msgRead && G.msgRead[t.id]) || 0;
  return Math.max(0, (t.unread || 0) - read);
}

function msgTotalUnread() {
  return msgThreads().reduce((s, t) => s + msgUnread(t), 0);
}

// Every message in a thread: the authored ones, then anything sent this session.
function msgAll(t) {
  return (t.messages || []).concat(_msgSent[t.id] || []);
}

const msgInitials = name => String(name || '?')
  .replace(/[^A-Za-z ]/g, '').trim().split(/\s+/).slice(0, 2)
  .map(w => w.charAt(0).toUpperCase()).join('') || '?';

// ── rendering ────────────────────────────────

function msgRenderBadge() {
  const badge = $('msg-badge');
  const btn = $('btn-msgs');
  if (!badge || !btn) return;
  const n = msgTotalUnread();
  badge.hidden = n === 0;
  badge.textContent = n > 9 ? '9+' : String(n);
  // DOM-110 shipped this button disabled with "not available yet" on it.
  btn.disabled = false;
  btn.setAttribute('aria-label', n ? 'Messages — ' + n + ' unread' : 'Messages');
  btn.setAttribute('onclick', 'openMessages()');
}

function msgRenderList() {
  const rows = msgThreads().map(t => {
    const n = msgUnread(t);
    const all = msgAll(t);
    const last = all[all.length - 1];
    return '<button class="msg-row" onclick="openThread(\'' + msgEsc(t.id) + '\')">' +
        '<span class="msg-av">' + msgEsc(msgInitials(t.name)) + '</span>' +
        '<span class="msg-row-body">' +
          '<span class="msg-row-name">' + msgEsc(t.name) + '</span>' +
          '<span class="msg-row-snip">' + msgEsc(last ? last.text : '') + '</span>' +
        '</span>' +
        '<span class="msg-row-right">' +
          '<span class="msg-row-time">' + msgEsc(t.time) + '</span>' +
          (n ? '<span class="msg-unread">' + n + '</span>' : '') +
        '</span>' +
      '</button>';
  }).join('');
  return '<div class="msg-head">' +
      '<div class="msg-title">MESSAGES</div>' +
      '<button class="msg-x" onclick="closeMessages()" aria-label="Close messages">✕</button>' +
    '</div>' +
    '<div class="msg-list">' + (rows || '<div class="msg-empty">NO MESSAGES</div>') + '</div>';
}

function msgRenderThread(t) {
  const bubbles = msgAll(t).map(m => {
    const mine = m.from === 'me';
    return '<div class="msg-b' + (mine ? ' is-me' : '') + '">' +
        '<div class="msg-bubble">' + msgEsc(m.text) + '</div>' +
        '<div class="msg-time">' + msgEsc(m.time) + '</div>' +
      '</div>';
  }).join('');
  return '<div class="msg-head">' +
      '<button class="msg-back" onclick="openMessages()" aria-label="Back to messages">&lsaquo;</button>' +
      '<div class="msg-head-id">' +
        '<div class="msg-head-name">' + msgEsc(t.name) + '</div>' +
        '<div class="msg-head-role">' + msgEsc(t.role || '') + '</div>' +
      '</div>' +
      '<button class="msg-x" onclick="closeMessages()" aria-label="Close messages">✕</button>' +
    '</div>' +
    '<div class="msg-thread" id="msg-thread-scroll">' + bubbles + '</div>' +
    '<div class="msg-composer">' +
      '<input id="msg-input" class="msg-input" type="text" placeholder="Say something" ' +
        'autocomplete="off" onkeydown="msgKey(event)">' +
      '<button class="msg-send" onclick="msgSend()">SEND</button>' +
    '</div>';
}

// Matches the .22s in css/55-messages.css. The sheet outlives the close by
// exactly one animation.
const MSG_ANIM_MS = 220;

function renderMessages() {
  const host = $('messages-overlay');
  if (!host) return;
  host.classList.toggle('open', msgOpen);
  if (!msgOpen) {
    // Emptying the sheet here would blank it mid-close and there would be
    // nothing left to animate out, which is half of why the .22s never read as
    // an animation. Wait it out instead — and re-check msgOpen, because
    // reopening inside those 220ms must not be wiped by a stale timer.
    clearTimeout(renderMessages._clear);
    renderMessages._clear = setTimeout(() => {
      if (!msgOpen) host.innerHTML = '';
    }, MSG_ANIM_MS);
    msgRenderBadge();
    return;
  }
  clearTimeout(renderMessages._clear);
  const t = msgThread ? msgThreadById(msgThread) : null;
  host.innerHTML = '<div class="msg-sheet">' + (t ? msgRenderThread(t) : msgRenderList()) + '</div>';
  const scroll = $('msg-thread-scroll');
  if (scroll) scroll.scrollTop = scroll.scrollHeight;
  msgRenderBadge();
}

// ── actions ──────────────────────────────────

function openMessages() { msgOpen = true; msgThread = null; renderMessages(); }
function closeMessages() { msgOpen = false; msgThread = null; renderMessages(); }

function openThread(id) {
  const t = msgThreadById(id);
  if (!t) return;
  msgThread = id;
  msgOpen = true;
  // Opening is what clears the badge, and it sticks.
  if (!G.msgRead) G.msgRead = {};
  if (G.msgRead[id] !== (t.unread || 0)) {
    G.msgRead[id] = t.unread || 0;
    if (typeof GameState !== 'undefined') GameState.save();
  }
  renderMessages();
}

function msgKey(ev) {
  if (ev && ev.key === 'Enter') { ev.preventDefault(); msgSend(); }
}

function msgSend() {
  const input = $('msg-input');
  if (!input || !msgThread) return;
  const text = String(input.value || '').trim();
  if (!text) return;
  const d = new Date();
  const time = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  if (!_msgSent[msgThread]) _msgSent[msgThread] = [];
  _msgSent[msgThread].push({ from: 'me', text: text, time: time });
  input.value = '';
  renderMessages();
  const again = $('msg-input');
  if (again) again.focus();
}

// ── XP TOAST ─────────────────────────────────
//
// OVERLAYS.md writes this as `+{n} XP`. There is no XP — DOM-124 settled that
// Clout is the one currency and the award tables pay it — so the pill names
// what actually landed in the wallet. Same call as the Make Moves daily card.

function xpToast(amount, label, levelUp) {
  const el = $('xp-toast');
  if (!el || !(amount > 0)) return;
  el.innerHTML = '<span class="xpt-amt">+' + Number(amount).toLocaleString() + ' CLOUT</span>' +
    (label ? '<span class="xpt-label">' + msgEsc(label) + '</span>' : '');
  el.classList.toggle('is-levelup', !!levelUp);
  // Restart the animation on a repeat award rather than queueing: the pill is a
  // receipt for the last thing you did, and a queue would show stale ones.
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(xpToast._t);
  xpToast._t = setTimeout(() => el.classList.remove('show'), 2200);
}
