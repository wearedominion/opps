// S2 Settings screen (DOM-111).
// Part of the suite; run it all with `node tests/run.js`.

const { fs, path, vm, assert, ROOT, readAllCss, G, test } = require('./harness');

console.log('\nsettings');

//  DOM-111 — Settings screen
//
//  js/settings.js is a plain script that talks to the DOM. There is no DOM
//  test harness in this repo (and no runner to hang one off), so it runs in a
//  vm sandbox against the smallest fake document that its two stateful
//  behaviours need: the sound toggle and the mutually-exclusive expanders.
// ─────────────────────────────────────────────

console.log('\nDOM-111 — Settings');

function fakeEl(cls, id) {
  const el = {
    id: id || '', textContent: '', innerHTML: '', _cls: new Set(cls ? cls.split(' ') : []),
    _attrs: {}, _kids: [],
    setAttribute(k, v) { this._attrs[k] = v; },
    getAttribute(k) { return this._attrs[k]; },
    querySelector(sel) {
      const want = sel.replace('.', '');
      return this._kids.find(k => k._cls.has(want)) || null;
    },
  };
  el.classList = {
    add: c => el._cls.add(c),
    remove: c => el._cls.delete(c),
    contains: c => el._cls.has(c),
    toggle: (c, on) => (on ? el._cls.add(c) : el._cls.delete(c)),
  };
  return el;
}

function loadSettings(overrides) {
  const src = fs.readFileSync(path.join(ROOT, 'js/settings.js'), 'utf8')
    + '\n;globalThis.__st = { renderSettings, setSound, toggleExpander, stMemberSince,'
    + ' stCrewLabel, stAccountRows, stEsc, SETTINGS_CONTACT };';

  const acct = fakeEl('st-exp', 'st-exp-acct');
  acct._kids.push(fakeEl('st-exp-head'));
  const contact = fakeEl('st-exp', 'st-exp-contact');
  contact._kids.push(fakeEl('st-exp-head'));
  const stateWord = fakeEl('st-state', 'st-sound-state');
  const root = fakeEl('st', 'st-root');
  const byId = { 'st-exp-acct': acct, 'st-exp-contact': contact,
                 'st-sound-state': stateWord, 'st-root': root };

  const saved = [];
  const ctx = {
    console, Date, JSON, Object, Math, String, Array, RegExp,
    G: Object.assign({ soundOn: true, handle: null, playerId: null, createdAt: null,
                       crewMemberCount: 0, level: 1, schemaVersion: 5 }, overrides || {}),
    Sound: { setEnabled(v) { ctx.G.soundOn = !!v; }, click() { ctx.clicked = true; } },
    GameState: { save() { saved.push(true); } },
    $: (id) => byId[id] || null,
    document: {
      querySelectorAll: (sel) => (sel === '#st-root .st-exp' ? [acct, contact] : []),
    },
    window: {},
    toast: () => {},
    // The screen claims its tab at load (DOM-127); nothing to claim it from
    // in here, so swallow the call and test the behaviour.
    registerScreen: () => {},
  };
  vm.runInNewContext(src, ctx);
  return { api: ctx.__st, G: ctx.G, els: byId, saved, ctx };
}

test('the sound toggle writes G.soundOn, persists, and updates the live state word', () => {
  const { api, G: g, els, saved } = loadSettings();
  api.setSound(false);
  assert.strictEqual(g.soundOn, false);
  assert.strictEqual(els['st-sound-state'].textContent, 'OFF');
  assert.strictEqual(saved.length, 1, 'the preference was not saved');
  api.setSound(true);
  assert.strictEqual(g.soundOn, true);
  assert.strictEqual(els['st-sound-state'].textContent, 'ON');
  assert.strictEqual(saved.length, 2);
});

test('turning sound ON confirms audibly; turning it OFF stays silent', () => {
  const off = loadSettings();
  off.api.setSound(false);
  assert.strictEqual(off.ctx.clicked, undefined, 'it clicked on the way to silence');
  const on = loadSettings({ soundOn: false });
  on.api.setSound(true);
  assert.strictEqual(on.ctx.clicked, true);
});

test('expanders are mutually exclusive, and a second tap closes', () => {
  const { api, els } = loadSettings();
  const acct = els['st-exp-acct'], contact = els['st-exp-contact'];

  api.toggleExpander('acct');
  assert.ok(acct.classList.contains('open'));
  assert.ok(!contact.classList.contains('open'));
  assert.strictEqual(acct.querySelector('.st-exp-head').getAttribute('aria-expanded'), 'true');

  api.toggleExpander('contact');            // opening one closes the other
  assert.ok(!acct.classList.contains('open'), 'opening contact left acct open');
  assert.ok(contact.classList.contains('open'));
  assert.strictEqual(acct.querySelector('.st-exp-head').getAttribute('aria-expanded'), 'false');

  api.toggleExpander('contact');            // tapping the open one closes it
  assert.ok(!contact.classList.contains('open'));
  assert.strictEqual(contact.querySelector('.st-exp-head').getAttribute('aria-expanded'), 'false');
});

test('"Member since" formats a real date and refuses to invent one', () => {
  assert.strictEqual(loadSettings({ createdAt: Date.UTC(2025, 2, 14) + 43200000 }).api.stMemberSince(), 'MAR 2025');
  assert.strictEqual(loadSettings().api.stMemberSince(), '—', 'a save without the field got a fabricated date');
  assert.strictEqual(loadSettings({ createdAt: 'not a date' }).api.stMemberSince(), '—');
});

test('the crew row reports the real Lieutenant count, singular and plural', () => {
  assert.strictEqual(loadSettings().api.stCrewLabel(), 'NO CREW YET');
  assert.strictEqual(loadSettings({ crewMemberCount: 1 }).api.stCrewLabel(), '1 LIEUTENANT');
  assert.strictEqual(loadSettings({ crewMemberCount: 12 }).api.stCrewLabel(), '12 LIEUTENANTS');
});

test('account rows read the save, and fall back without inventing identity', () => {
  // Array.from re-homes the sandbox's arrays into this realm — deepStrictEqual
  // compares prototypes, and a vm context has its own Array.prototype.
  const blank = Array.from(loadSettings().api.stAccountRows());
  assert.deepStrictEqual(blank.map(r => r.label), ['Handle', 'Player ID', 'Member since', 'Crew']);
  assert.strictEqual(blank[0].value, 'NOT SET');
  assert.strictEqual(blank[1].value, 'GUEST');
  // identity values take Anton, IDs and dates stay in the grotesque
  assert.deepStrictEqual(blank.map(r => r.display), [true, false, false, true]);

  const real = Array.from(loadSettings({ handle: 'BIG WORM', playerId: 'OPP-4471-9X' }).api.stAccountRows());
  assert.strictEqual(real[0].value, 'BIG WORM');
  assert.strictEqual(real[1].value, 'OPP-4471-9X');
});

test('a handle from the save cannot inject markup', () => {
  const { api } = loadSettings();
  assert.strictEqual(api.stEsc('<img src=x onerror=alert(1)>'),
    '&lt;img src=x onerror=alert(1)&gt;');
  assert.strictEqual(api.stEsc("O'Neil & \"co\""), 'O&#39;Neil &amp; &quot;co&quot;');
});

test('the rendered screen carries both groups, the toggle and both expanders', () => {
  const { api, els } = loadSettings();
  api.renderSettings();
  const html = els['st-root'].innerHTML;
  for (const needle of ['PREFERENCES', 'ACCOUNT', 'SOUND EFFECTS', 'ACCOUNT INFO',
                        'CONTACT DEVELOPER', 'REPORT A BUG', 'st-toggle', 'st-track']) {
    assert.ok(html.includes(needle), 'rendered HTML is missing ' + needle);
  }
  // no emoji as icons, and no browser dialogs (CLAUDE.md)
  assert.ok(!/alert\(|confirm\(|prompt\(/.test(html));
  assert.ok(html.includes(api.SETTINGS_CONTACT.email));
});

test('REPORT A BUG does not carry the sheen — it grants nothing', () => {
  const css = readAllCss();
  const { api, els } = loadSettings();
  api.renderSettings();
  assert.ok(!/class="st-report[^"]*sheen/.test(els['st-root'].innerHTML));
  // and the rule itself must not opt in
  const rule = css.slice(css.indexOf('.st-report {'), css.indexOf('.st-report:hover'));
  assert.ok(!rule.includes('animation'), '.st-report animates');
});
