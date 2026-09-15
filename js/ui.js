// ─────────────────────────────────────────────
//  UI HELPERS
// ─────────────────────────────────────────────

function $(id) { return document.getElementById(id); }

// Screen labels shown in the scroll body's section caption.
// The map is deliberately absent — it is the one screen with no label.
const SECTION_TITLES = {
  map: 'THE HOOD', jobs: 'MAKE MOVES', fight: 'OPPS LIST', plugs: 'PLUGS',
  crew: 'CREW', profile: 'PLAYER PROFILE',
  store: 'THE PLUG', stats: 'STATS', settings: 'SETTINGS',
};

function showTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  const tab = $('tab-' + name);
  if (tab) tab.classList.add('active');

  // Nav down-state sync (DOM-141). Every nav control — the five bottom tabs and
  // the two header entries — declares the screen it stands for in data-nav, so
  // this stays one loop no matter how many of them there are, and showTab()
  // never learns a screen's name. `data-nav-also` covers the one control that
  // answers for two screens: Profile stays gold while you are in Settings,
  // because Settings is reached through it (DOM-146).
  document.querySelectorAll('[data-nav]').forEach(b => {
    b.classList.toggle('active', b.dataset.nav === name || b.dataset.navAlso === name);
  });

  // The map fills the body: no padding, no scroll, no section label.
  const app = $('app');
  if (app) app.classList.toggle('is-map', name === 'map');

  const title = $('section-title');
  if (title) title.textContent = SECTION_TITLES[name] || '';

  // Whatever the screen registered for itself. Tabs that are static markup
  // register nothing and simply render no further.
  const render = SCREEN_RENDERERS[name];
  if (render) render();
}

// ── SCREEN REGISTRY (DOM-127) ───────────────
// This replaced a stack of `if (name === ...)` lines that every screen ticket
// had to edit, which made two concurrent screens conflict here over work that
// had nothing to do with each other. A screen now registers its own renderer
// from its own file — js/plugs.js owns the 'plugs' line — so adding a screen
// touches no shared file at all. Registration runs at load; every screen script
// is below js/ui.js in index.html, which is what makes that safe.
const SCREEN_RENDERERS = {};

function registerScreen(name, render) {
  if (SCREEN_RENDERERS[name]) {
    console.warn('screen "' + name + '" is registered twice — the later one wins');
  }
  SCREEN_RENDERERS[name] = render;
}

// The nav drawer and its openDrawer/closeDrawer/navTo trio were deleted in
// DOM-142. Nothing wraps showTab() any more: a nav control calls it directly,
// because there is no longer an overlay that has to close behind the jump.

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
