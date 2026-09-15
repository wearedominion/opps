// S10 Messages + XP toast — the two shell-level overlays (DOM-119).
// Part of the suite; run it all with `node tests/run.js`.

const {
  fs, path, vm, assert, ROOT, readAllCss, TABLE, XP_SPEC, test,
} = require('./harness');

const THREADS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/messages.json'), 'utf8'));

function loadMessages(over) {
  const o = over || {};
  const els = {};
  const saves = [];
  const timers = [];
  const G = Object.assign({ msgRead: {}, level: 1, clout: 0 }, o.G || {});
  function stubEl(id) {
    if (!els[id]) {
      els[id] = {
        id, value: '', textContent: '', innerHTML: '', hidden: false, disabled: true,
        scrollTop: 0, scrollHeight: 100, offsetWidth: 1,
        classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
                     toggle(c, on) { if (on) this._s.add(c); else this._s.delete(c); },
                     contains(c) { return this._s.has(c); } },
        setAttribute(k, v) { this[k] = v; }, focus() {},
      };
    }
    return els[id];
  }
  const ctx = {
    console, JSON, Object, Math, Array, String, Number, Date, Set,
    MESSAGES: 'threads' in o ? o.threads : THREADS,
    G,
    $: stubEl,
    GameState: { save: () => saves.push(1) },
    // A real enough clock: the close now defers its innerHTML clear by one
    // animation, and a stub that never fires would hide whether it lands.
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: id => { if (timers[id - 1]) timers[id - 1].dead = true; },
    toast: () => {},
  };
  const src = fs.readFileSync(path.join(ROOT, 'js/messages.js'), 'utf8')
    + '\n;globalThis.__t = { openMessages, closeMessages, openThread, msgSend, msgKey,'
    + ' msgTotalUnread, msgUnread, msgThreads, msgThreadById, msgAll, msgInitials,'
    + ' msgRenderBadge, renderMessages, xpToast, G };';
  vm.runInNewContext(src, ctx);
  // defineProperty, not a getter through Object.assign — that copies the
  // getter's VALUE, so `html` would freeze as the empty string it was at
  // load time and every markup assertion would read nothing.
  // Fire every pending timer, in order, skipping the cleared ones.
  const tick = () => {
    const due = timers.splice(0, timers.length);
    due.forEach(t => { if (!t.dead) t.fn(); });
  };
  const api = Object.assign({}, ctx.__t, { els: stubEl, saves, tick, timers });
  Object.defineProperty(api, 'html', { get: () => stubEl('messages-overlay').innerHTML });
  return api;
}

console.log('\nS10 Messages + XP toast — DOM-119');

// ─────────────────────────────────────────────
//  Unread is a promise the badge has to keep
// ─────────────────────────────────────────────

test('the badge counts what is unread, and opening a thread clears it for good', () => {
  const m = loadMessages();
  const total = THREADS.threads.reduce((s, t) => s + t.unread, 0);
  assert.strictEqual(m.msgTotalUnread(), total);

  const loud = THREADS.threads.find(t => t.unread > 0);
  m.openThread(loud.id);
  assert.strictEqual(m.msgUnread(loud), 0, 'opening did not clear the thread');
  assert.strictEqual(m.msgTotalUnread(), total - loud.unread);
  // and it persists — a badge that came back on reload would be a lie
  assert.strictEqual(m.G.msgRead[loud.id], loud.unread);
  assert.strictEqual(m.saves.length, 1, 'the read state was not saved');
  // re-opening is not another save
  m.openThread(loud.id);
  assert.strictEqual(m.saves.length, 1);
});

test('a save that already read a thread does not light its badge again', () => {
  const loud = THREADS.threads.find(t => t.unread > 0);
  const m = loadMessages({ G: { msgRead: { [loud.id]: loud.unread } } });
  assert.strictEqual(m.msgUnread(loud), 0);
});

test('the header button enables itself only once the threads are there', () => {
  const m = loadMessages();
  m.msgRenderBadge();
  const btn = m.els('btn-msgs');
  assert.strictEqual(btn.disabled, false, 'the button is still the DOM-110 stub');
  assert.ok(/openMessages/.test(btn.onclick || ''), 'the button does not open anything');
  const badge = m.els('msg-badge');
  assert.strictEqual(badge.hidden, false);
  // and it stays off when there is nothing to show
  const quiet = loadMessages({ threads: null });
  quiet.msgRenderBadge();
  assert.strictEqual(quiet.els('msg-badge').hidden, true);
  assert.strictEqual(quiet.msgTotalUnread(), 0);
});

// ─────────────────────────────────────────────
//  List and thread
// ─────────────────────────────────────────────

test('the list shows every thread, its last line and its unread count', () => {
  const m = loadMessages();
  m.openMessages();
  const html = m.html;
  for (const t of THREADS.threads) {
    assert.ok(html.indexOf(t.name) !== -1, t.id + ' is missing from the list');
    const last = t.messages[t.messages.length - 1];
    assert.ok(html.indexOf(last.text.slice(0, 20)) !== -1, t.id + ' shows no snippet');
  }
  assert.strictEqual((html.match(/msg-unread/g) || []).length,
    THREADS.threads.filter(t => t.unread > 0).length, 'unread badges do not match the data');
});

test('initials come from the name, however it is punctuated', () => {
  const m = loadMessages();
  assert.strictEqual(m.msgInitials('THERESA'), 'T');
  assert.strictEqual(m.msgInitials("MALIK ‘TRIGGA’"), 'MT');
  assert.strictEqual(m.msgInitials('BIG HOMIE MARCO'), 'BH');
  assert.strictEqual(m.msgInitials(''), '?', 'a nameless thread still gets an avatar');
});

test('a reply lands in the thread, and Enter is what sends it', () => {
  const m = loadMessages();
  const t = THREADS.threads[0];
  m.openThread(t.id);
  const before = m.msgAll(t).length;

  m.els('msg-input').value = '   ';
  m.msgSend();
  assert.strictEqual(m.msgAll(t).length, before, 'whitespace was sent as a message');

  m.els('msg-input').value = 'On it tonight.';
  m.msgKey({ key: 'Enter', preventDefault() {} });
  const after = m.msgAll(t);
  assert.strictEqual(after.length, before + 1);
  assert.strictEqual(after[after.length - 1].from, 'me');
  assert.strictEqual(after[after.length - 1].text, 'On it tonight.');
  assert.strictEqual(m.els('msg-input').value, '', 'the composer kept the text');
  // any other key does nothing
  m.els('msg-input').value = 'not yet';
  m.msgKey({ key: 'a', preventDefault() {} });
  assert.strictEqual(m.msgAll(t).length, before + 1);
});

test('a reply is session-only, and never pretends to have been saved', () => {
  // There is no messaging backend and the SDK exposes none. Persisting a reply
  // would make an inbox nobody can receive from look like a real one.
  const m = loadMessages();
  const t = THREADS.threads[0];
  m.openThread(t.id);
  const saves = m.saves.length;
  m.els('msg-input').value = 'hello';
  m.msgSend();
  assert.strictEqual(m.saves.length, saves, 'a reply was written to the save');
  const stateSrc = fs.readFileSync(path.join(ROOT, 'js/state.js'), 'utf8');
  assert.ok(!/msgSent|msgThreads\s*:/.test(stateSrc), 'the save grew a message store');
  assert.ok(/msgRead/.test(stateSrc), 'read state is not saved, so badges will come back');
});

// ─────────────────────────────────────────────
//  The XP toast, which is not about XP
// ─────────────────────────────────────────────

test('the pill names Clout, because that is what landed', () => {
  // OVERLAYS.md writes it as "+{n} XP". DOM-124 settled that there is no XP and
  // the award tables pay Clout, so the receipt names the currency that moved.
  const m = loadMessages();
  m.xpToast(35, 'ROBBERY', false);
  const el = m.els('xp-toast');
  assert.ok(/\+35 CLOUT/.test(el.innerHTML), el.innerHTML);
  assert.ok(!/\bXP\b/.test(el.innerHTML), 'the pill promises XP');
  assert.ok(el.classList.contains('show'));
  assert.ok(!el.classList.contains('is-levelup'));
});

test('a level-up is the loud variant of the same pill', () => {
  const m = loadMessages();
  m.xpToast(250, 'LEVEL 3', true);
  const el = m.els('xp-toast');
  assert.ok(el.classList.contains('is-levelup'));
  const css = readAllCss();
  assert.ok(/\.xp-toast\.is-levelup\s*\{[^}]*background:\s*var\(--gold-chrome\)/.test(css));
  assert.ok(/\.xp-toast\.is-levelup \.xpt-amt[^{]*\{[^}]*color:\s*var\(--ink\)/.test(css));
  // and the normal one is gold ink on the card ground
  assert.ok(/\.xpt-amt\s*\{[^}]*color:\s*var\(--gold\)/.test(css));
});

test('nothing is announced when nothing was awarded', () => {
  const m = loadMessages();
  const el = m.els('xp-toast');
  m.xpToast(0, 'NOTHING', false);
  assert.ok(!el.classList.contains('show'), 'a zero award still popped a receipt');
});

test('the award engine reaches for the pill, and still speaks without it', () => {
  // js/xp.js must not depend on this file being loaded: an award that went
  // silent because a shell overlay was missing is worse than a plain toast.
  const src = fs.readFileSync(path.join(ROOT, 'js/xp.js'), 'utf8');
  assert.ok(/typeof xpToast === 'function'/.test(src), 'the award never fires the pill');
  assert.ok(/else if \(typeof toast === 'function'\)/.test(src), 'no fallback when the pill is absent');
});

test('the overlay sits above the app and never traps a tap when closed', () => {
  const css = readAllCss();
  const shut = /\.messages-overlay\s*\{([^}]*)\}/.exec(css)[1];
  const open = /\.messages-overlay\.open\s*\{([^}]*)\}/.exec(css)[1];
  assert.ok(/z-index:\s*55/.test(shut));
  // display:none cannot animate, so the closed state is inert by visibility
  // and pointer-events instead — the box is always laid out now, and
  // pointer-events is the whole of what keeps it from eating a tap.
  assert.ok(/visibility:\s*hidden/.test(shut), 'a closed inbox is still visible');
  assert.ok(/pointer-events:\s*none/.test(shut), 'a closed inbox still traps taps');
  assert.ok(!/display:\s*none/.test(shut), 'display:none is back, and the .22s cannot run');
  assert.ok(/visibility:\s*visible/.test(open) && /pointer-events:\s*auto/.test(open));
  assert.ok(/\.xp-toast\s*\{[^}]*pointer-events:\s*none/.test(css), 'the toast would eat a tap');
  assert.ok(/\.xp-toast\s*\{[^}]*z-index:\s*90/.test(css));
});

test('the open and close both have something to animate', () => {
  const css = readAllCss();
  const shut = /\.messages-overlay\s*\{([^}]*)\}/.exec(css)[1];
  const open = /\.messages-overlay\.open\s*\{([^}]*)\}/.exec(css)[1];
  // Both states carry the transition, or the close plays at full speed.
  assert.ok(/transition:[^;]*opacity\s*\.22s/.test(shut) && /transform\s*\.22s/.test(shut));
  assert.ok(/transition:[^;]*opacity\s*\.22s/.test(open) && /transform\s*\.22s/.test(open));
  // visibility is discrete: it must flip at 0s on open and be held back the
  // full .22s on close, or the sheet is yanked out from under its own fade.
  assert.ok(/visibility\s+0s\s+\.22s/.test(shut), 'close hides the sheet before it has faded');
  assert.ok(/visibility\s+0s(?!\s+\.)/.test(open), 'open delays visibility and shows nothing');
  assert.ok(/opacity:\s*0/.test(shut) && /translateY\(8px\)/.test(shut));
  assert.ok(/opacity:\s*1/.test(open) && /translateY\(0\)/.test(open));
});

test('closing keeps the sheet up for exactly one animation, then empties it', () => {
  const m = loadMessages();
  m.openMessages();
  assert.ok(/msg-sheet/.test(m.html), 'nothing opened');

  m.closeMessages();
  assert.ok(/msg-sheet/.test(m.html), 'the sheet was emptied mid-close, so nothing animates out');
  assert.strictEqual(m.timers[m.timers.length - 1].ms, 220, 'the clear must match the .22s');

  m.tick();
  assert.strictEqual(m.html, '', 'the sheet never got cleared');
});

test('reopening inside the close window is not wiped by the stale timer', () => {
  const m = loadMessages();
  m.openMessages();
  m.closeMessages();
  m.openMessages();     // back inside the 220ms
  m.tick();             // the close's timer comes due anyway
  assert.ok(/msg-sheet/.test(m.html), 'a stale close timer blanked a reopened inbox');
});

// ─────────────────────────────────────────────
//  DOM-136 — one award, one pill
// ─────────────────────────────────────────────

// awardXp credits through addClout, and addClout is where the level boundary
// is detected and the loud pill fired. Both then wanted to speak. Because
// xpToast REPLACES rather than queues, the last word won — and the last word
// was awardXp's quiet one, so the gold variant lived ~0ms on exactly the
// awards most likely to level you up.
//
// The real xpToast from js/messages.js, the real awardXp from js/xp.js, and an
// addClout shaped like the one in js/main.js. Asserted on the pill's final
// state, which is what a player actually sees.
function awardThrough(opts) {
  const o = opts || {};
  const m = loadMessages();
  const XPM = require(path.join(ROOT, 'js/xp.js'));
  const state = { level: o.level || 3, clout: 0 };
  const fired = [];
  const saved = { xpToast: global.xpToast, addClout: global.addClout, log: global.log, toast: global.toast };

  global.xpToast = (amt, label, loud) => { fired.push({ amt, label, loud: !!loud }); m.xpToast(amt, label, loud); };
  global.log = () => {};
  global.toast = () => {};
  global.addClout = (amt, reason, ref) => {
    state.clout += amt;
    if (o.levels) {                       // the js/main.js level-up branch
      state.level += 1;
      global.xpToast(amt, 'LEVEL ' + state.level, true);
    }
  };
  try {
    const clout = XPM.awardXp(o.weight || 40, o.label || 'TURF CLAIMED',
      { state, table: TABLE, toast: true });
    return { fired, pill: m.els('xp-toast'), clout, state };
  } finally { Object.assign(global, saved); }
}

test('a levelling award ends on the loud pill, not the quiet one', () => {
  const r = awardThrough({ levels: true, label: 'TURF CLAIMED' });
  assert.ok(r.clout > 0, 'nothing was awarded, so nothing was announced');
  const last = r.fired[r.fired.length - 1];
  assert.ok(last.loud, 'the quiet award pill replaced the level-up pill');
  assert.strictEqual(last.label, 'LEVEL ' + r.state.level);
  // and the pill actually left standing says so
  assert.ok(r.pill.classList.contains('is-levelup'), 'the gold ground is gone');
  assert.ok(/LEVEL /.test(r.pill.innerHTML), r.pill.innerHTML);
});

test('an award that levels nobody still names what was done', () => {
  const r = awardThrough({ levels: false, label: 'TURF CLAIMED' });
  const last = r.fired[r.fired.length - 1];
  assert.strictEqual(last.loud, false);
  assert.strictEqual(last.label, 'TURF CLAIMED');
  assert.ok(!r.pill.classList.contains('is-levelup'));
  assert.ok(/TURF CLAIMED/.test(r.pill.innerHTML), r.pill.innerHTML);
});

test('addClout still speaks for itself on the paths that never reach awardXp', () => {
  // Jobs and fights credit Clout directly. That hook is what announces a level
  // to them, so awardXp must not be where it lives.
  const src = fs.readFileSync(path.join(ROOT, 'js/main.js'), 'utf8');
  const fn = /function addClout[\s\S]*?\n}/.exec(src)[0];
  assert.ok(/xpToast\(amt, 'LEVEL ' \+ G\.level, true\)/.test(fn),
    'addClout no longer fires the level-up pill, and the test above is testing a fiction');
});
