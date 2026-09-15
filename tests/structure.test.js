// The DOM-127 structure itself: the properties that stop css/, js/ and tests/
// growing a single append point again. These are the only tests in the suite
// that assert about the repo's shape rather than the game's behaviour.
// Part of the suite; run it all with `node tests/run.js`.

const { fs, path, assert, ROOT, cssFiles, test } = require('./harness');

console.log('\nDOM-127 — no file has a single append point');

test('every stylesheet on disk is linked exactly once, and every link resolves', () => {
  const onDisk = fs.readdirSync(path.join(ROOT, 'css')).filter(f => f.endsWith('.css')).sort();
  const linked = cssFiles().map(h => h.replace(/^css\//, ''));

  const dupes = linked.filter((h, i) => linked.indexOf(h) !== i);
  assert.deepStrictEqual(dupes, [], 'linked twice, so its rules apply twice: ' + dupes.join(', '));

  assert.deepStrictEqual(linked.slice().sort(), onDisk,
    'css/ and index.html disagree — a stylesheet is either orphaned or missing');

  for (const rel of cssFiles()) {
    assert.ok(fs.existsSync(path.join(ROOT, rel)), rel + ' is linked but does not exist');
  }
});

test('showTab dispatches through the registry and grew no branches back', () => {
  const ui = fs.readFileSync(path.join(ROOT, 'js/ui.js'), 'utf8');
  const body = ui.slice(ui.indexOf('function showTab('), ui.indexOf('// ── SCREEN REGISTRY'));
  assert.ok(/SCREEN_RENDERERS\[name\]/.test(body), 'showTab no longer dispatches through the table');
  // One named screen legitimately survives in showTab: the map is the only tab
  // that drops the body padding, and that is a layout class, not a renderer.
  // What must not come back is a branch that dispatches rendering.
  assert.ok(!/if \(name === '/.test(body),
    'a screen was wired with an if-branch instead of registerScreen — see CLAUDE.md §Adding a screen');
  const named = (body.match(/name === '([a-z]+)'/g) || []);
  assert.deepStrictEqual(named, ["name === 'map'"],
    'showTab special-cases a screen by name: ' + named.join(', '));
});

test('each screen registers itself, from its own file, exactly once', () => {
  const names = {};
  for (const f of fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
    const re = /registerScreen\('([^']+)'/g;
    let m;
    while ((m = re.exec(src))) {
      assert.ok(!names[m[1]], "'" + m[1] + "' is registered in two files — the later load wins silently");
      names[m[1]] = f;
    }
  }
  assert.ok(Object.keys(names).length > 0, 'no screen registers itself any more');
  assert.ok(!Object.values(names).includes('ui.js'),
    'ui.js registers a screen — that puts the shared append point back');
  // The point of the exercise: the file that owns the renderer owns the line.
  assert.strictEqual(names.plugs, 'plugs.js');
  assert.strictEqual(names.jobs, 'jobs.js');
});

test('no test file depends on another, so the runner can order them freely', () => {
  const dir = path.join(__dirname);
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.test.js'))) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    const re = /require\('\.\/([^']+)'\)/g;
    let m;
    while ((m = re.exec(src))) {
      assert.strictEqual(m[1], 'harness',
        f + " requires ./" + m[1] + " — areas must share only the harness, or run order matters again");
    }
  }
});
