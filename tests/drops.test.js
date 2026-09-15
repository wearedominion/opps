// Rarity and drops (DOM-18).
// Part of the suite; run it all with `node tests/run.js`.

const {
  fs, path, vm, assert, ROOT, TUNE, tune, readAllCss, STORE_DATA, test,
} = require('./harness');

console.log('\nRarity & drops — DOM-18 order-of-magnitude loot contract');

test('the drop ladder is the ratified order of magnitude, checked rarest-first', () => {
  const d = tune('drops.rarityChance', TUNE);
  assert.strictEqual(d.grey, 0.99);
  assert.strictEqual(d.green, 0.099);
  assert.strictEqual(d.blue, 0.0099);
  assert.strictEqual(d.purple, 0.00099);
  assert.strictEqual(d.orange, 0, 'orange is the reserved DOM-92 shelf in v1');
  assert.strictEqual(d.mythic, 0, 'mythic is plumbed but reserved');
  const proc = tune('drops.procChance', TUNE);
  assert.ok(proc > 0 && proc < 1, 'the proc gate is a real probability');
  const dropsSrc = fs.readFileSync(path.join(ROOT, 'js/drops.js'), 'utf8');
  assert.ok(/RARITY_ORDER = \['mythic', 'orange', 'purple', 'blue', 'green', 'grey'\]/.test(dropsSrc),
    'the ladder must be checked rarest-first');
});

test('every item is authored into a tier; drop-only holds exactly for blue+', () => {
  const steps = { grey: 0, green: 0, blue: 1, purple: 2, orange: 3 };
  STORE_DATA.forEach(i => {
    assert.ok(i.rarity in steps, i.id + ' has rarity "' + i.rarity + '"');
    assert.strictEqual(!!i.dropOnly, steps[i.rarity] > 0, i.id + ': dropOnly must mirror the tier');
    if (i.dropOnly) assert.ok(!i.plug, i.id + ': drop-only gear must have no vendor');
    else assert.ok(i.plug && i.price > 0, i.id + ': buyable without a vendor or price');
  });
  assert.ok(!STORE_DATA.some(i => i.rarity === 'mythic'), 'mythic is reserved: no v1 items');
});

test('the drop tiers cover every main gate: 3 blues + 1 purple per gate, 5 oranges', () => {
  [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110].forEach(g => {
    const blues = STORE_DATA.filter(i => i.rarity === 'blue' && i.levelReq === g);
    assert.strictEqual(blues.length, 3, 'L' + g + ' blues');
    assert.strictEqual(new Set(blues.map(i => i.type)).size, 3, 'L' + g + ': one blue per type');
    assert.strictEqual(STORE_DATA.filter(i => i.rarity === 'purple' && i.levelReq === g).length, 1,
      'L' + g + ' purple');
  });
  assert.strictEqual(STORE_DATA.filter(i => i.rarity === 'orange').length, 5);
});

test('the stat premium is ~+15% per rarity step over the gate’s green baseline', () => {
  const steps = { blue: 1, purple: 2, orange: 3 };
  STORE_DATA.filter(i => i.dropOnly).forEach(i => {
    const base = STORE_DATA.find(b =>
      b.rarity === 'green' && b.type === i.type && b.levelReq === i.levelReq);
    assert.ok(base, i.id + ' has no green baseline at its gate');
    const want = 1.15 ** steps[i.rarity];
    const got = (i.atk + i.def) / (base.atk + base.def);
    assert.ok(Math.abs(got - want) < 0.07,
      i.id + ' premium ' + got.toFixed(3) + ' vs rule ' + want.toFixed(3));
    const priceGot = i.price / base.price;
    assert.ok(Math.abs(priceGot - want) < 0.07,
      i.id + ' notional price premium ' + priceGot.toFixed(3) + ' (the DOM-88 upgrade base)');
  });
});

test('the enemy solve and the cash sinks read the buyable floor only (code shape)', () => {
  const genSrc = fs.readFileSync(path.join(ROOT, 'tools/econ-sim/gen-catalog.js'), 'utf8');
  assert.ok(/i\.dropOnly \|\| i\.levelReq > band/.test(genSrc),
    'gen-catalog loadoutAt must skip drop-only gear');
  const simSrc = fs.readFileSync(path.join(ROOT, 'tools/econ-sim/sim.js'), 'utf8');
  assert.ok(/const BUYABLE\s*=\s*STORE\.filter\(i => !i\.dropOnly\)/.test(simSrc),
    'sim cash-sink math must be buyable-only');
});

test('stores never sell a drop tier: render skips and buy refuses (code shape)', () => {
  // DOM-116 rebuilt the shelves: the per-item `if (item.dropOnly) return;`
  // became a filter on the list. Same rule, different shape. The behavioural
  // version of this — render a catalogue and assert no drop tier appears —
  // lives in tests/store-screen.test.js; this stays a cheap code-shape check.
  const storeSrc = fs.readFileSync(path.join(ROOT, 'js/store.js'), 'utf8');
  assert.ok(/filter\(i => !i\.dropOnly/.test(storeSrc), 'renderStore lists drop-only gear');
  assert.ok(/if \(item\.dropOnly\) \{ toast\(/.test(storeSrc), 'buyItem would sell drop-only gear');
});

test('both faucets roll: doJob and the fight-win branch call rollDrop (code shape)', () => {
  assert.ok(/rollDrop\(job\.name\)/.test(fs.readFileSync(path.join(ROOT, 'js/jobs.js'), 'utf8')));
  assert.ok(/rollDrop\(enemy\.name\)/.test(fs.readFileSync(path.join(ROOT, 'js/combat.js'), 'utf8')));
});

test('drop tiers surface as aspirational, and the primary slot keeps its rarity edge', () => {
  // review bounce, PR #27: "visible as aspirational" must actually render,
  // and .pf-slot.primary (0,2,0) must not bury the single-class .rar-* tint
  const pfSrc = fs.readFileSync(path.join(ROOT, 'js/profile.js'), 'utf8');
  assert.ok(/i\.dropOnly && !ownsGear\(i\.id\)/.test(pfSrc), 'no aspirational drop surface');
  assert.ok(/VAULTED/.test(pfSrc), 'oranges need the VAULTED chip');
  assert.ok(/DROP ONLY/.test(pfSrc), 'blue/purple need the DROP ONLY chip');
  const css = readAllCss();
  ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'].forEach(t => {
    assert.ok(css.includes('.pf-slot.primary.rar-' + t),
      'primary slot loses the ' + t + ' rarity edge to the gold border');
  });
});

test('rarity name ink survives .pf-inv-name (code shape)', () => {
  // DOM-102, third strike of the same specificity disease: .pf-inv-name
  // declares color at (0,1,0) after the bare .tier-* block, so without the
  // explicit pairs the stash/picker/teaser names render plain --text.
  const css = readAllCss();
  ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'].forEach(t => {
    assert.ok(css.includes('.pf-inv-name.tier-' + t),
      'inventory names lose the ' + t + ' rarity ink to .pf-inv-name');
  });
});

test('the combat sparkline well is emitted, not just styled (code shape)', () => {
  // DOM-103: the DOM-72 rebuild dropped the well but kept its CSS. The
  // contract's selector table requires it, so the markup and the renderer
  // must both reference it or it silently orphans again.
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(html.includes('id="combat-log"'), 'combat modal lost the .combat-log well');
  assert.ok(html.includes('id="combat-spark"'), 'well lost its spark SVG');
  const combatSrc = fs.readFileSync(path.join(ROOT, 'js/combat.js'), 'utf8');
  assert.ok(/_pushSparkPoint\(\)/.test(combatSrc), 'rounds no longer feed the spark');
  assert.ok(/spark-you/.test(combatSrc) && /spark-opp/.test(combatSrc),
    'spark renderer no longer strokes both traces');
});

// Real state.js + drops.js in a vm, Math.random scripted per call. Call order
// inside one roll: proc gate, then ONE random per ladder tier (rarest first)
// until a tier hits, then the pool pick.
function loadDrops(over, randSeq) {
  const seq = randSeq.slice();
  const ctx = {
    console, JSON, Object, Array, Date,
    Math: Object.assign(Object.create(Math), { random: () => (seq.length ? seq.shift() : 0.999999) }),
    STORE_ITEMS: STORE_DATA,
    tune: p => tune(p, TUNE),
    toast: () => {}, log: () => {},
    localStorage: { getItem: () => null, setItem: () => {} },
  };
  ctx.globalThis = ctx;
  const src = fs.readFileSync(path.join(ROOT, 'js/state.js'), 'utf8')
    + '\n' + fs.readFileSync(path.join(ROOT, 'js/drops.js'), 'utf8')
    + '\n;globalThis.__d = { G, rollDrop, rollDropRarity };';
  vm.runInNewContext(src, ctx);
  const D = ctx.__d;
  Object.assign(D.G, over || {});
  return D;
}

test('the proc gate holds: a missed roll grants nothing', () => {
  const D = loadDrops({ level: 10, inventory: {}, loadout: {} }, [0.5]);
  assert.strictEqual(D.rollDrop('test'), null);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(D.G.inventory)), {});
});

test('a grey lands with src dropped and auto-fields', () => {
  // proc hits; mythic..green miss on 0.5; grey hits; pool pick 0
  const D = loadDrops({ level: 1, inventory: {}, loadout: {} },
    [0.0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.0, 0.0]);
  const item = D.rollDrop('test');
  assert.ok(item && item.rarity === 'grey');
  assert.strictEqual(D.G.inventory[item.id].src, 'dropped');
  assert.ok((D.G.loadout[item.type] || []).indexOf(item.id) !== -1, 'not auto-fielded');
});

test('rarest-first: a sub-purple roll returns purple, and 0.0 can never mint a reserved tier', () => {
  // even a 0.0 roll fails `0 < 0` for mythic and orange — the ladder falls to purple
  const D = loadDrops({ level: 10, inventory: {}, loadout: {} },
    [0.0, 0.0, 0.0, 0.0005, 0.0]);
  const item = D.rollDrop('test');
  assert.ok(item && item.rarity === 'purple', 'expected the L10 purple');
  assert.strictEqual(item.levelReq, 10);
});

test('drops are level-gated and pick from the top unlocked gate', () => {
  // a green hit at L20 must come from the L20 gate, never L10
  const D = loadDrops({ level: 20, inventory: {}, loadout: {} },
    [0.0, 0.5, 0.5, 0.5, 0.5, 0.05, 0.0]);
  const item = D.rollDrop('test');
  assert.ok(item && item.rarity === 'green');
  assert.strictEqual(item.levelReq, 20, 'green must drop from the top of the band');
  // and a blue hit below its first gate fizzles entirely
  const D2 = loadDrops({ level: 5, inventory: {}, loadout: {} },
    [0.0, 0.5, 0.5, 0.005]);
  assert.strictEqual(D2.rollDrop('test'), null, 'no blue exists under L10');
});

test('own-once: a farmed-out tier fizzles silently instead of duplicating', () => {
  const D = loadDrops({ level: 10,
    inventory: { fiveseven: { level: 0, duplicates: 0, src: 'dropped' } }, loadout: {} },
    [0.0, 0.0, 0.0, 0.0005, 0.0]);
  assert.strictEqual(D.rollDrop('test'), null, 'the only L10 purple is already owned');
  assert.strictEqual(D.G.inventory.fiveseven.duplicates, 0);
});
