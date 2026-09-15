// Tab visibility (DOM-129).
//
// Screens are stacked siblings; only `.active` should be on screen. That held
// by luck rather than by rule — `.tab { display: none }` and a screen's own
// `.mv { display: flex }` tie at (0,1,0), and the later one wins, so Make Moves
// rendered on top of every other screen. These tests re-decide it by rule.
// Part of the suite; run it all with `node tests/run.js`.

const { fs, path, assert, ROOT, readAllCss, test } = require('./harness');

console.log('\ntab visibility');

// ── a very small CSS reader ──────────────────
// Enough to answer "which rule wins `display` on this element", not a general
// parser. Nested blocks (@media, @supports) are unwrapped so their rules count;
// @keyframes and @font-face are dropped, since their preludes never match an
// element.
function styleRules(cssText) {
  const src = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
  const SKIP = /^@(keyframes|-\w+-keyframes|font-face|property|counter-style)/i;
  const out = [];
  const open = [];
  let i = 0, preludeStart = 0;
  while (i < src.length) {
    if (src[i] === '{') {
      open.push({ prelude: src.slice(preludeStart, i).trim(), bodyStart: i + 1 });
      preludeStart = ++i;
    } else if (src[i] === '}') {
      const blk = open.pop();
      if (blk && !/^@/.test(blk.prelude) && !open.some(b => SKIP.test(b.prelude)) && !SKIP.test(blk.prelude)) {
        for (const sel of blk.prelude.split(',')) {
          if (sel.trim()) out.push({ selector: sel.trim(), body: src.slice(blk.bodyStart, i) });
        }
      }
      preludeStart = ++i;
    } else i++;
  }
  return out;
}

// The last `display` in a block is the one that stands.
function declaredDisplay(body) {
  let found = null;
  for (const decl of body.split(';')) {
    const m = /^\s*display\s*:\s*([^;!]+?)\s*(!important)?\s*$/i.exec(decl);
    if (m) found = { value: m[1].trim().toLowerCase(), important: !!m[2] };
  }
  return found;
}

const COMBINATOR = /[\s>+~]/;
const rightmost = sel => sel.split(/[\s>+~]+/).filter(Boolean).pop() || '';

// Parse one compound (no combinators) into what it demands of an element.
// Anything we cannot evaluate without a live DOM marks the compound unsupported.
function parseCompound(comp) {
  const out = { tag: null, id: null, classes: [], not: [], ok: true };
  let i = 0;
  while (i < comp.length) {
    const c = comp[i];
    if (c === '.') {
      const m = /^\.([\w-]+)/.exec(comp.slice(i));
      if (!m) { out.ok = false; break; }
      out.classes.push(m[1]); i += m[0].length;
    } else if (c === '#') {
      const m = /^#([\w-]+)/.exec(comp.slice(i));
      if (!m) { out.ok = false; break; }
      out.id = m[1]; i += m[0].length;
    } else if (c === ':') {
      const m = /^:not\(([^()]*)\)/.exec(comp.slice(i));
      if (!m) { out.ok = false; break; }          // :hover, ::before, … — not at rest
      out.not.push(parseCompound(m[1].trim())); i += m[0].length;
    } else if (c === '*') { i++; }
    else {
      const m = /^[\w-]+/.exec(comp.slice(i));
      if (!m) { out.ok = false; break; }
      out.tag = m[0].toLowerCase(); i += m[0].length;
    }
  }
  return out;
}

function specificity(comp) {
  let a = comp.id ? 1 : 0, b = comp.classes.length, c = comp.tag ? 1 : 0;
  for (const n of comp.not) {                      // :not() adds nothing itself
    const s = specificity(n);
    a += s[0]; b += s[1]; c += s[2];
  }
  return [a, b, c];
}

const beats = (x, y) => x[0] !== y[0] ? x[0] > y[0] : x[1] !== y[1] ? x[1] > y[1] : x[2] > y[2];

function matches(comp, el) {
  if (!comp.ok) return false;
  if (comp.id && comp.id !== el.id) return false;
  if (comp.tag && comp.tag !== el.tag) return false;
  if (!comp.classes.every(c => el.classes.has(c))) return false;
  return comp.not.every(n => !matches(n, el));
}

// Every element in index.html carrying the `tab` class, in both states.
function tabElements() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const out = [];
  const re = /<(\w+)((?:[^>"]|"[^"]*")*?)>/g;
  let m;
  while ((m = re.exec(html))) {
    const cls = /class="([^"]*)"/.exec(m[2]);
    if (!cls || !cls[1].split(/\s+/).includes('tab')) continue;
    const id = /id="([^"]*)"/.exec(m[2]);
    out.push({ tag: m[1].toLowerCase(), id: id ? id[1] : null, classList: cls[1].split(/\s+/).filter(Boolean) });
  }
  return out;
}

const asState = (t, active) => ({
  tag: t.tag, id: t.id,
  classes: new Set(t.classList.filter(c => c !== 'active').concat(active ? ['active'] : [])),
});

// The cascade, for `display` only: highest specificity wins; a tie goes to
// whichever was declared later. `!important` outranks both.
function winningDisplay(rules, el) {
  let best = null;
  for (const r of rules) {
    if (COMBINATOR.test(r.selector)) continue;      // needs ancestors; see the guard below
    const comp = parseCompound(r.selector);
    if (!comp.ok || !matches(comp, el)) continue;
    const d = declaredDisplay(r.body);
    if (!d) continue;
    const spec = specificity(comp);
    if (!best || (d.important && !best.important) ||
        (d.important === best.important && !beats(best.spec, spec))) {
      best = { value: d.value, important: d.important, spec, selector: r.selector };
    }
  }
  return best;
}

const RULES = styleRules(readAllCss());
const TABS = tabElements();

test('every screen is a tab, and they are the only things the shell stacks', () => {
  // A floor, not a count: it catches a screen falling out of the shell by
  // accident. Re-baselined from 10 to 9 when the ACTIVITIES and SPOTS screens
  // were deleted on purpose (DOM-142) — move it deliberately, never to make a
  // red test go green.
  assert.ok(TABS.length >= 9, 'expected the full screen set, found ' + TABS.length);
  const ids = TABS.map(t => t.id);
  assert.deepStrictEqual(ids.filter(id => !id), [], 'a .tab element has no id to show');
  assert.strictEqual(new Set(ids).size, ids.length, 'two tabs share an id');
});

test('an inactive tab is hidden — whatever else its screen declares', () => {
  for (const t of TABS) {
    const win = winningDisplay(RULES, asState(t, false));
    assert.ok(win, '#' + t.id + ' has no display rule at all');
    assert.strictEqual(win.value, 'none',
      '#' + t.id + ' stays on screen while inactive: "' + win.selector +
      '" wins with display:' + win.value + '. This is DOM-129 — scope the rule to ' +
      '.tab.<screen>.active instead of declaring display on the bare screen class.');
  }
});

test('an active tab is actually shown, and Make Moves still gets its flex column', () => {
  for (const t of TABS) {
    const win = winningDisplay(RULES, asState(t, true));
    assert.ok(win && win.value !== 'none',
      '#' + t.id + ' cannot be shown: ' + (win ? win.selector + ' -> ' + win.value : 'no rule'));
  }
  const jobs = TABS.find(t => t.id === 'tab-jobs');
  assert.ok(jobs, 'the Make Moves tab is gone');
  assert.strictEqual(winningDisplay(RULES, asState(jobs, true)).value, 'flex',
    'Make Moves lost its flex column — the screen is a vertical stack (02-moves.md)');
});

test('nothing can put a tab on screen unless it demands .active', () => {
  // The crisp version of what DOM-129 broke. A rule may hide a tab however it
  // likes, but the moment it gives one a visible display it has to say which
  // state that is for — otherwise the screen renders on top of every other one,
  // which is exactly what `.mv { display: flex }` did.
  //
  // Selector text is what is checked here, not a computed winner, so rules with
  // combinators (`.app.is-map .tab.active`) are covered too: only the rightmost
  // compound decides which element is targeted.
  for (const r of RULES) {
    const d = declaredDisplay(r.body);
    if (!d || d.value === 'none') continue;
    const comp = parseCompound(rightmost(r.selector));
    if (!comp.ok) continue;
    // A universal rightmost (`.bar-mini > *`) matches anything on its own; which
    // elements it really reaches is decided by ancestors this reader does not
    // evaluate. Nothing to say about it, so say nothing rather than cry wolf.
    if (!comp.id && !comp.classes.length) continue;
    if (comp.classes.includes('active')) continue;          // states its state
    for (const t of TABS) {
      for (const active of [false, true]) {
        assert.ok(!matches(comp, asState(t, active)),
          '"' + r.selector + '" gives #' + t.id + ' display:' + d.value +
          ' without requiring .active, so the screen shows whether or not it is ' +
          'the one open (DOM-129). Scope it to .tab.<screen>.active.');
      }
    }
  }
});

test('every tab that hides itself by id also says how it comes back', () => {
  // #tab-map predates the .tab convention and carries its own pair of rules. An
  // id outranks .tab entirely, so the shell cannot cover for it: if the hide
  // half ever loses its partner the screen is unreachable rather than merely
  // mis-stacked. Cheap to pin, and it is the only tab doing this.
  const byId = RULES.filter(r => declaredDisplay(r.body) && /^#[\w-]+/.test(r.selector.trim()));
  for (const r of byId) {
    const comp = parseCompound(rightmost(r.selector));
    if (!comp.ok || declaredDisplay(r.body).value !== 'none') continue;
    const tab = TABS.find(t => matches(comp, asState(t, false)));
    if (!tab) continue;
    const shown = winningDisplay(RULES, asState(tab, true));
    assert.ok(shown && shown.value !== 'none',
      '"' + r.selector + '" hides #' + tab.id + ' with no rule to show it again');
  }
});
