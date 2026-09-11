// ─────────────────────────────────────────────
//  UI HELPERS
// ─────────────────────────────────────────────

function $(id) { return document.getElementById(id); }

// Screen labels shown in the scroll body's section caption.
// The map is deliberately absent — it is the one screen with no label.
const SECTION_TITLES = {
  map: 'THE HOOD', jobs: 'MAKE MOVES', fight: 'OPPS LIST', plugs: 'PLUGS',
  crew: 'CREW', profile: 'PLAYER PROFILE', hood: 'ACTIVITIES',
  props: 'SPOTS', store: 'THE PLUG', stats: 'STATS',
};

function showTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const tab = $('tab-' + name);
  if (tab) tab.classList.add('active');
  const navItem = $('nav-' + name);
  if (navItem) navItem.classList.add('active');

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
  closeNav();
}

function log(msg, cls = '') {
  const feed = $('feed');
  const line = document.createElement('div');
  line.className = 'feed-line ' + cls;
  const now = new Date();
  line.textContent = '[' + now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0') + '] ' + msg;
  feed.insertBefore(line, feed.firstChild);
  while (feed.children.length > 30) feed.removeChild(feed.lastChild);
}

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
  const rank = RANK_NAMES[Math.min(G.level - 1, RANK_NAMES.length - 1)];
  $('levelup-sub').textContent = 'You are now "' + rank + '" (Rank ' + G.level + ')';
  banner.classList.add('show');
  log('RANKED UP to "' + rank + '" (Rank ' + G.level + ')!', 'gold');
  setTimeout(() => { banner.classList.remove('show'); }, 3000);
}

// ── NAV DRAWER ─────────────────────────────────
function openNav() {
  document.querySelector('nav').classList.add('open');
  document.getElementById('nav-overlay').classList.add('open');
}
function closeNav() {
  document.querySelector('nav').classList.remove('open');
  document.getElementById('nav-overlay').classList.remove('open');
}
function toggleNav() {
  document.querySelector('nav').classList.contains('open') ? closeNav() : openNav();
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
