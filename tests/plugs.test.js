// S4 Plugs + dialogue popup (DOM-113).
// Part of the suite; run it all with `node tests/run.js`.

const {
  fs, path, vm, assert, ROOT, readAllCss, SCHEMA_VERSION, G, test,
} = require('./harness');

// ─────────────────────────────────────────────
//  DOM-113 — S4 Plugs + plug dialogue popup
// ─────────────────────────────────────────────

// plugs.js is a plain script too. It leans on globals the browser supplies
// ($, PLUGS, PORTRAITS, GameState, questFor…), so the sandbox stubs only what
// the recruit path actually touches and exports the pure helpers.
function loadPlugs(saved) {
  const src = fs.readFileSync(path.join(ROOT, 'js/plugs.js'), 'utf8')
    + '\n;globalThis.__t = { plugCtaLabel, plugRecruited, plugCommit, plugNameSize,'
    + ' PLUG_XP_RECRUIT, G };';
  const saves = [];
  // A fake canvas with a measureText proportional to px * characters. Without
  // this `document` is undefined, plugNameSize throws on the first call and
  // every name returns the minimum — which makes any assertion about sizing
  // pass even if the measurement loop were deleted.
  const ctx = {
    console, JSON, Object, Math, Array,
    G: { plugsRecruited: saved === undefined ? [] : saved },
    GameState: { save: () => saves.push(1) },
    document: {
      createElement: () => ({
        getContext: () => ({
          font: '',
          measureText(t) {
            const px = parseInt(/\b(\d+)px/.exec(this.font)[1], 10);
            return { width: t.length * px * 0.62 };
          },
        }),
      }),
    },
    // The screen claims its tab at load (DOM-127); in here there is no showTab
    // to claim it from, so swallow the call and test the pure functions.
    registerScreen: () => {},
    questFor: () => null,
    $: () => null,
  };
  vm.runInNewContext(src, ctx);
  return Object.assign({}, ctx.__t, { saves });
}

const PLUGS_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/plugs.json'), 'utf8'));

test('plugs — NEXT walks the pitch; the last line names what it commits', () => {
  const P = loadPlugs();
  const tommy = PLUGS_JSON[0];
  assert.strictEqual(P.plugCtaLabel(tommy, false), 'NEXT');
  // not yet recruited → the final press is the recruit
  assert.strictEqual(P.plugCtaLabel(tommy, true), 'RUN IT');
});

test('plugs — once recruited, the final press runs the job instead', () => {
  const P = loadPlugs(['plug-tommy']);
  const tommy = PLUGS_JSON[0];
  assert.strictEqual(P.plugRecruited('plug-tommy'), true);
  assert.strictEqual(P.plugCtaLabel(tommy, true), 'GO');
  // a different plug is untouched by tommy's recruit
  assert.strictEqual(P.plugCtaLabel(PLUGS_JSON[1], true), 'RUN IT');
});

test('plugs — the first commit recruits and pays once', () => {
  const P = loadPlugs();
  const first = P.plugCommit('plug-dex');
  assert.deepStrictEqual(
    { amount: first.amount, label: first.label, first: first.first, awarded: first.awarded },
    { amount: P.PLUG_XP_RECRUIT, label: 'PLUG RECRUITED', first: true, awarded: true });
  assert.deepStrictEqual(Array.from(P.G.plugsRecruited), ['plug-dex']);
  assert.strictEqual(P.saves.length, 1);
});

test('plugs — pressing again pays NOTHING, however many times it is pressed', () => {
  // Regression guard for the faucet review caught on #35. Reopening a recruited
  // plug lands on the commit CTA; if a repeat press paid, that is XP per tap
  // with no Stamina, cash or cooldown behind it. Inert today only because
  // awardXp does not exist — and that guard dies when DOM-124 lands.
  const P = loadPlugs();
  P.plugCommit('plug-dex');                 // the recruit
  const savesAfterRecruit = P.saves.length;

  for (let i = 0; i < 25; i++) {
    const again = P.plugCommit('plug-dex');
    assert.strictEqual(again.amount, 0, 'press ' + (i + 1) + ' paid XP');
    assert.strictEqual(again.awarded, false);
    assert.strictEqual(again.first, false);
  }
  // roster is a set, not a tally, and a no-op does not rewrite the save
  assert.deepStrictEqual(Array.from(P.G.plugsRecruited), ['plug-dex']);
  assert.strictEqual(P.saves.length, savesAfterRecruit,
    'a press that pays nothing still hit the disk');
});

test('plugs — finishing the pitch rewinds it, so reopening is not a one-tap loop', () => {
  // The other half of the faucet: closePlug() left the saved line pinned at the
  // last index, so reopening showed the commit CTA immediately.
  const src = fs.readFileSync(path.join(ROOT, 'js/plugs.js'), 'utf8');
  const advance = src.slice(src.indexOf('function advancePlug('));
  const commitBranch = advance.slice(0, advance.indexOf('state.line++'));
  assert.ok(/_plugState\[idx\]\s*=\s*\{\s*line:\s*0\s*\}/.test(commitBranch),
    'advancePlug does not rewind the dialogue when it commits');
});

test('plugs — a save with no plugsRecruited yet does not throw', () => {
  const P = loadPlugs(null);
  const a = P.plugCommit('plug-kylie');
  assert.strictEqual(a.first, true);
  assert.deepStrictEqual(Array.from(P.G.plugsRecruited), ['plug-kylie']);
});

test('plugs — plugsRecruited is an additive field, so no SCHEMA_VERSION bump', () => {
  assert.deepStrictEqual(Array.from(G.plugsRecruited), []);
  assert.strictEqual(SCHEMA_VERSION, 5);
});

test('plugs — the name pill measures, rather than always returning one size', () => {
  const P = loadPlugs();
  // Every name in the v1 roster fits at the maximum — including BIG HOMIE
  // MARCO, confirmed in the browser at 21px with no overflow. So the roster
  // alone cannot prove the measurement loop runs.
  for (const plug of PLUGS_JSON) {
    assert.strictEqual(P.plugNameSize(plug.name), 21,
      plug.name + ' should fit the pill at the max size');
  }
  // Force the loop with names the pill genuinely cannot hold, and assert it
  // steps down monotonically rather than jumping straight to the floor.
  const long  = P.plugNameSize('BIG HOMIE MARCO THE MECHANIC');
  const huge  = P.plugNameSize('BIG HOMIE MARCO THE MECHANIC OF EAST CALDERO');
  assert.ok(long < 21, 'an over-long name did not shrink at all (' + long + 'px)');
  assert.ok(huge <= long, 'a longer name came back larger: ' + huge + ' > ' + long);
  assert.ok(huge >= 14, 'sizing fell below the 14px floor (' + huge + 'px)');
});

test('plugs — the screen is built to the 04-plugs.md geometry', () => {
  const css = readAllCss();
  assert.ok(/\.plugs-grid\s*\{[^}]*gap:\s*12px/.test(css), 'the column gap is 12px');
  assert.ok(/\.plug-card\s*\{[^}]*border:\s*1px solid var\(--border-gold\)/.test(css),
    'plugs are the gold-bordered surface');
  assert.ok(/\.plug-portrait-img\s*\{[^}]*width:\s*146px/.test(css), 'portrait column is 146px');
  assert.ok(/\.plug-info\s*\{[^}]*min-height:\s*206px/.test(css), 'info column is 206px tall');
  assert.ok(/\.plug-modal\s*\{[^}]*max-width:\s*330px/.test(css), 'popup is 330px wide');
  assert.ok(/\.plug-modal-portrait-wrap\s*\{[^}]*height:\s*288px/.test(css), 'popup portrait is 288px');
  assert.ok(/\.plug-modal-text\s*\{[^}]*min-height:\s*84px/.test(css), 'dialogue holds 84px');
});

test('plugs — the popup markup carries the ids the renderer writes into', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  for (const id of ['plug-modal-portrait', 'plug-modal-name', 'plug-modal-moniker',
                    'plug-modal-text', 'plug-modal-count', 'plug-modal-cta',
                    'plug-quest-panel', 'plugs-grid']) {
    assert.ok(html.includes('id="' + id + '"'), 'missing #' + id);
  }
  // LATER is the dismiss; the old corner X is gone with it
  assert.ok(html.includes('LATER'), 'the popup has no LATER button');
  assert.ok(!html.includes('plug-modal-close'), 'the retired close X survived');
});

test('plugs — no hard-coded v0.1 hexes survive in the plug rules', () => {
  const css = readAllCss();
  const block = css.slice(css.indexOf('/* ── PLUGS (S4, DOM-113)'),
                          css.indexOf('/* ── COMBAT PORTRAIT ── */'));
  assert.ok(block.length > 500, 'the plug block was not found');
  // rgba scrims are allowed (they are alpha, not palette); named hexes are not
  assert.ok(!/#[0-9a-f]{3,6}/i.test(block), 'a raw hex survived in the plug rules');
});
