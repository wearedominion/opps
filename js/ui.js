// ─────────────────────────────────────────────
//  UI HELPERS
// ─────────────────────────────────────────────

function $(id) { return document.getElementById(id); }

// Screen labels shown in the scroll body's section caption.
// The map is deliberately absent — it is the one screen with no label.
const SECTION_TITLES = {
  map: 'THE HOOD', jobs: 'MAKE MOVES', fight: 'OPPS LIST', plugs: 'PLUGS',
  crew: 'CREW', profile: 'PLAYER PROFILE', hood: 'ACTIVITIES',
  props: 'SPOTS', store: 'THE PLUG', stats: 'STATS', settings: 'SETTINGS',
};

function showTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  const tab = $('tab-' + name);
  if (tab) tab.classList.add('active');

  // drawer item sync — screens without a drawer entry light nothing
  document.querySelectorAll('.drawer-item').forEach(b => {
    b.classList.toggle('active', b.dataset.nav === name);
  });

  // The map fills the body: no padding, no scroll, no section label.
  const app = $('app');
  if (app) app.classList.toggle('is-map', name === 'map');

  const title = $('section-title');
  if (title) title.textContent = SECTION_TITLES[name] || '';
  if (name === 'stats')  renderStats();
  if (name === 'crew')   renderCrew();
  if (name === 'map')    GameMap.init();
  if (name === 'plugs')  renderPlugs();
  if (name === 'profile' && typeof renderProfile === 'function') renderProfile();
}

// ── NAV DRAWER (v0.2 OVERLAYS.md) ───────────────
// The drawer stays mounted; .open drives the translateX/opacity animation.
function openDrawer() {
  const d = $('drawer'), s = $('drawer-scrim');
  if (!d || !s) return;
  d.classList.add('open');
  s.classList.add('open');
  d.setAttribute('aria-hidden', 'false');
}
function closeDrawer() {
  const d = $('drawer'), s = $('drawer-scrim');
  if (!d || !s) return;
  d.classList.remove('open');
  s.classList.remove('open');
  d.setAttribute('aria-hidden', 'true');
}
// Drawer navigation: switch screen, then close the drawer over it.
function navTo(name) {
  showTab(name);
  closeDrawer();
}

function log(msg, cls = '') {
  const feed = $('feed');
  const line = document.createElement('div');
  line.className = 'feed-line ' + cls;
  // the newest line is the only coloured one; older lines drop to --ghost.
  // CSS keys that off :first-child, so nothing to set here.
  const now = new Date();
  line.textContent = '[' + now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0') + '] ' + msg;
  feed.insertBefore(line, feed.firstChild);
  while (feed.children.length > 30) feed.removeChild(feed.lastChild);
}

// `bad` is a semantic marker only — refusal toasts render the contract's one
// toast style; no stylesheet targets .bad (red is combat-only, DOM-98).
function toast(msg, bad = false) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast show' + (bad ? ' bad' : '');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.className = 'toast'; }, 2500);
}

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function showLevelUp() {
  const banner = $('levelup-banner');
  const rank = rankForLevel(G.level);
  $('levelup-sub').textContent = 'You are now "' + rank + '" (Level ' + G.level + ')';
  banner.classList.add('show');
  log('LEVEL ' + G.level + ' - "' + rank + '"', 'gold');
  setTimeout(() => { banner.classList.remove('show'); }, 3000);
}

// ── METRICS / CURRENCIES PANEL ──────────────────
function openMetrics() {
  const el = $('metrics-overlay');
  if (!el) return;
  updateHUD();
  el.classList.add('open');
}
function closeMetrics() {
  const el = $('metrics-overlay');
  if (el) el.classList.remove('open');
}
