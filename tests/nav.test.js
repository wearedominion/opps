// Menu system (DOM-141 — NAV-1..NAV-5).
//
// The drawer was one overlay that owned every route in the client; the tab bar
// plus two header entries is eight routes spread across three places. These
// tests hold the properties that made that swap safe: nothing kept a route
// only the drawer had, exactly one control lights at a time, and the bar sits
// under every overlay rather than through them.
// Part of the suite; run it all with `node tests/run.js`.

const { fs, path, assert, ROOT, readAllCss, test } = require('./harness');

console.log('\nmenu system (DOM-141)');

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const css = readAllCss();
const js = fs.readdirSync(path.join(ROOT, 'js'))
  .filter(f => f.endsWith('.js'))
  .map(f => ({ f, src: fs.readFileSync(path.join(ROOT, 'js', f), 'utf8') }));

// Comments still say the words — the markup and the rules must not.
const stripHtmlComments = s => s.replace(/<!--[\s\S]*?-->/g, '');
const stripCssComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '');
const stripJsComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// ── NAV-1: the drawer is gone ────────────────
test('no hamburger and no drawer survive anywhere in the client', () => {
  const markup = stripHtmlComments(html);
  assert.ok(!/hamb|drawer/i.test(markup), 'index.html still carries drawer markup');
  assert.ok(!/id="btn-menu"/.test(markup), 'the hamburger button is still mounted');

  const rules = stripCssComments(css);
  assert.ok(!/\.drawer|\.hamb\b/.test(rules), 'a drawer or hamburger rule is still in the cascade');

  for (const { f, src } of js) {
    const code = stripJsComments(src);
    assert.ok(!/openDrawer|closeDrawer|navTo\s*\(/.test(code),
      'js/' + f + ' still calls the drawer API');
  }
});

// ── the legacy screens are gone, not merely unreachable (Jake, 2026-09-15) ──
test('ACTIVITIES and SPOTS left the client, and took their code with them', () => {
  const markup = stripHtmlComments(html);
  for (const id of ['tab-hood', 'tab-props']) {
    assert.ok(!markup.includes(id), id + ' is still mounted');
  }
  for (const f of ['js/hood.js', 'js/properties.js']) {
    assert.ok(!fs.existsSync(path.join(ROOT, f)), f + ' still exists');
    assert.ok(!markup.includes(f), f + ' is still loaded by index.html');
  }
  // the identifiers those files owned must not survive as callers with no callee
  const dead = /doActivity|renderProps|buyProp|collectSpots|collectIncome|spotsAccruedTotal|incomeReady/;
  for (const { f, src } of js) {
    assert.ok(!dead.test(stripJsComments(src)), 'js/' + f + ' still calls into a deleted screen');
  }
  const rules = stripCssComments(css);
  for (const sel of ['.job-card', '.do-job-btn', '.prop-card', '.prop-grid']) {
    assert.ok(!rules.includes(sel), sel + ' is styling a screen that no longer exists');
  }
});

test('the client boots onto a tab, so the bar is never blank on first paint', () => {
  const main = fs.readFileSync(path.join(ROOT, 'js/main.js'), 'utf8');
  const boot = (main.match(/showTab\('(\w+)'\)/) || [])[1];
  const markup = stripHtmlComments(html);
  const tabs = (markup.match(/class="tabbar-btn"[^>]*data-nav="(\w+)"/g) || [])
    .map(m => m.match(/data-nav="(\w+)"/)[1]);
  assert.ok(tabs.includes(boot),
    'the client boots onto "' + boot + '", which is not one of the five tabs — ' +
    'the bar would show no gold tab at launch');
  // and the markup's own starting screen must be that same tab
  assert.ok(new RegExp('class="tab active" id="tab-' + boot + '"').test(markup),
    'the markup starts on a different screen than showTab() does');
});

// ── the Hospital survived the screen it used to live on ──
test('the Hospital is app chrome now, and outlives any one screen', () => {
  const markup = stripHtmlComments(html);
  const card = markup.indexOf('id="hospital-card"');
  assert.ok(card > -1, 'the Hospital card is gone — the defeat flow has no surface');
  // it must sit outside every .tab, or it dies with whichever screen holds it
  const tabsBefore = (markup.slice(0, card).match(/<div class="tab[ "]/g) || []).length;
  assert.strictEqual(tabsBefore, 0, 'the Hospital card is inside a screen again');
  // the paid exit is the point of the card staying (DOM-76)
  assert.ok(markup.includes('id="hospital-iap-btn"'), 'the SKIP THE WAIT offer went with it');
  // nothing navigates to surface it any more — it is already wherever you are
  const combat = fs.readFileSync(path.join(ROOT, 'js/combat.js'), 'utf8');
  assert.ok(!/showTab\('hood'\)/.test(combat), 'combat still routes to the deleted ACTIVITIES screen');
  assert.ok(/renderHospital\(\)/.test(combat), 'combat no longer surfaces the Hospital at all');
});

// ── NAV-1 acceptance: eight destinations, all reachable ──
test('every destination the drawer used to own has a replacement entry point', () => {
  const markup = stripHtmlComments(html);
  // five tabs, from the bar
  for (const nav of ['map', 'jobs', 'fight', 'plugs', 'crew']) {
    assert.ok(new RegExp('class="tabbar-btn"[^>]*data-nav="' + nav + '"').test(markup),
      nav + ' has no tab in the bottom bar');
  }
  // store and profile, from the header
  assert.ok(/class="hdr-store"[^>]*data-nav="store"/.test(markup), 'no Store entry in the header');
  assert.ok(/class="hdr-profile"[^>]*data-nav="profile"/.test(markup), 'no Profile entry in the header');
  // settings, from inside Profile — and nowhere else
  const profile = fs.readFileSync(path.join(ROOT, 'js/profile.js'), 'utf8');
  assert.ok(/pf-gear-btn[\s\S]{0,200}showTab\('settings'\)|showTab\('settings'\)/.test(profile),
    'Profile has no route into Settings');
});

test('Settings goes back to Profile, not to the screen before it', () => {
  const settings = fs.readFileSync(path.join(ROOT, 'js/settings.js'), 'utf8');
  assert.ok(/st-back[\s\S]{0,120}showTab\(\\?'profile\\?'\)/.test(settings),
    'the Settings back button does not route to Profile');
});

// ── NAV-2: the bar's shape ───────────────────
test('the bar is five tabs with a divider between each adjacent pair', () => {
  const bar = html.slice(html.indexOf('<nav class="tabbar"'), html.indexOf('</nav>'));
  const tabs = bar.match(/class="tabbar-btn"/g) || [];
  const divs = bar.match(/class="tabbar-div"/g) || [];
  assert.strictEqual(tabs.length, 5, 'the bar has ' + tabs.length + ' tabs, not five');
  assert.strictEqual(divs.length, 4, 'dividers go between pairs only, never at the ends');
  // left to right: Hood, Moves, OPPS, Plugs, Crew
  assert.deepStrictEqual((bar.match(/data-nav="(\w+)"/g) || []).map(m => m.slice(10, -1)),
    ['map', 'jobs', 'fight', 'plugs', 'crew'], 'the tabs are out of order');
});

// ── one gold thing at a time ─────────────────
test('no screen lights two nav controls, and Profile answers for Settings', () => {
  const markup = stripHtmlComments(html);
  const navs = (markup.match(/data-nav="(\w+)"/g) || []).map(m => m.slice(10, -1));
  const dupes = navs.filter((n, i) => navs.indexOf(n) !== i);
  assert.deepStrictEqual(dupes, [], 'two controls claim the same screen: ' + dupes.join(', '));

  // Settings has no control of its own — Profile carries its down state, which
  // is the whole reason data-nav-also exists.
  assert.ok(!navs.includes('settings'), 'Settings has a nav control of its own');
  assert.ok(/data-nav="profile" data-nav-also="settings"/.test(markup),
    'nothing stays gold while Settings is open');

  const ui = fs.readFileSync(path.join(ROOT, 'js/ui.js'), 'utf8');
  assert.ok(/dataset\.nav === name \|\| b\.dataset\.navAlso === name/.test(ui),
    'showTab no longer honours data-nav-also');
});

// ── z-order: under every overlay, over every screen ──
test('the bar sits below every scrim, sheet and modal in the cascade', () => {
  const rules = stripCssComments(css);
  const bar = rules.slice(rules.indexOf('.tabbar {'));
  const z = Number((bar.match(/z-index:\s*(\d+)/) || [])[1]);
  assert.strictEqual(z, 45, 'the tab bar is not at z 45');

  // Every overlay in the client must outrank it. Screen-internal layers (the
  // map's own 1-9 stack) sit under the bar by design and are excluded.
  const all = [...rules.matchAll(/z-index:\s*(\d+)/g)].map(m => Number(m[1]));
  const overlays = all.filter(n => n > 9 && n !== z && n !== 10);
  assert.ok(overlays.every(n => n > z),
    'an overlay would render under the tab bar: ' + overlays.filter(n => n < z).join(', '));
});

// ── content clearance ────────────────────────
test('scrolling screens end above the bar, and the map lifts its own furniture', () => {
  const nav = fs.readFileSync(path.join(ROOT, 'css/15-nav.css'), 'utf8');
  const pad = Number((nav.match(/main\s*{\s*padding-bottom:\s*(\d+)px/) || [])[1]);
  assert.ok(pad >= 100, 'the scroll body clears the bar by ' + pad + 'px, needs 100');
  assert.ok(/\.map-sel-card\s*{\s*bottom:\s*84px/.test(nav),
    'the parcel-select card does not clear the bar');
  assert.ok(/\.map-hint\s*{\s*padding-bottom:/.test(nav),
    'the map hint still sits behind the bar');
});

// ── NAV-3: the Store entry is the loudest thing up there ──
test('the Store tile outsizes the button beside it and never stops moving', () => {
  const rules = stripCssComments(css);
  const store = rules.slice(rules.indexOf('.hdr-store {'), rules.indexOf('.hdr-store:hover'));
  assert.ok(/width:\s*44px/.test(store) && /height:\s*44px/.test(store),
    'the Store tile is not 44px');
  const hdrBtn = rules.slice(rules.indexOf('.hdr-btn {'));
  assert.ok(/width:\s*38px/.test(hdrBtn.slice(0, 400)),
    'the Messages button moved — the Store tile must stay the larger of the two');
  assert.ok(/animation:\s*sheen/.test(rules.slice(rules.indexOf('.hdr-store::after'))),
    'the Store tile lost its sheen');
  // the sheen is stopped for anyone who asked for less motion
  assert.ok(/prefers-reduced-motion[\s\S]*?button::after[\s\S]*?animation:\s*none/.test(rules),
    'the sheen ignores prefers-reduced-motion');
});
