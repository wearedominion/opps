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

// Five bottom tabs. Plugs / Gear / Spots / Stats / Crew live inside Empire
// behind the chip row — five fit a 390pt screen, so do not add a sixth.
// Profile has no tab of its own; it opens from the header identity button.
const EMPIRE_SCREENS = ['plugs', 'store', 'props', 'stats', 'crew'];
const TOP_TABS = ['hood', 'map', 'jobs', 'fight'];

function showTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  const tab = $('tab-' + name);
  if (tab) tab.classList.add('active');

  // bottom tab: an Empire screen lights the Empire tab, not one of its own
  const inEmpire = EMPIRE_SCREENS.indexOf(name) !== -1;
  const topTab = inEmpire ? 'empire' : (TOP_TABS.indexOf(name) !== -1 ? name : null);
  document.querySelectorAll('.tabbar-btn').forEach(b => b.classList.remove('active'));
  if (topTab) {
    const btn = $('tab-btn-' + topTab);
    if (btn) btn.classList.add('active');
  }

  // chip row is visible only inside Empire
  const chips = $('empire-chips');
  if (chips) chips.hidden = !inEmpire;
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  if (inEmpire) {
    const chip = $('chip-' + name);
    if (chip) chip.classList.add('active');
  }

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
