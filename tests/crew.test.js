// Crew, capacity and loadout (DOM-75).
// Part of the suite; run it all with `node tests/run.js`.

const {
  fs, path, vm, assert, ROOT, rankForLevel, TUNE, tune, loadLoadout, G, STORE_DATA, plain,
  test,
} = require('./harness');

console.log('\nCrew, capacity & loadout — DOM-75 locked rules');

// state.js in a vm with real tuning + the live catalog: the loadout layer under test.
test('the crew knobs are the ratified rule: 5 per slot, weapon→armor→vehicle, cap +3', () => {
  assert.strictEqual(tune('crew.lieutenantsPerSlot', TUNE), 5);
  assert.deepStrictEqual(tune('crew.slotRotation', TUNE), ['weapon', 'armor', 'vehicle']);
  assert.strictEqual(tune('crew.maxBonusSlotsPerType', TUNE), 3);
  assert.strictEqual(tune('crew.cloutPerRecruit', TUNE), 250);
});

test('the flat per-Lieutenant ATK/DEF bonus is retired (ratified 2026-09-13)', () => {
  assert.ok(!('attackPerLieutenant' in TUNE.crew) && !('defensePerLieutenant' in TUNE.crew),
    'the unbounded stat faucet is back');
  const crewSrc = fs.readFileSync(path.join(ROOT, 'js/crew.js'), 'utf8');
  assert.ok(!/getBonus/.test(crewSrc), 'crew.js still carries the stat bonus');
});

test('slot capacity: 1 per type base, +1 per 5 Lieutenants round-robin, capped at +3', () => {
  const capAt = (n, type) => loadLoadout({ crewMemberCount: n }).slotCapacity(type);
  assert.deepStrictEqual([0, 5, 10, 15, 20, 45, 200].map(n => capAt(n, 'weapon')),
    [1, 2, 2, 2, 3, 4, 4]);
  assert.deepStrictEqual([0, 5, 10, 15, 25, 45].map(n => capAt(n, 'armor')),
    [1, 1, 2, 2, 3, 4]);
  assert.deepStrictEqual([0, 10, 15, 30, 45].map(n => capAt(n, 'vehicle')),
    [1, 1, 2, 3, 4]);
  // utility sits outside the rotation: always the base slot
  assert.deepStrictEqual([0, 45, 500].map(n => capAt(n, 'utility')), [1, 1, 1]);
});

test('combat stats derive from the fielded loadout — owning is not fielding', () => {
  const S = loadLoadout({
    attack: 10, defense: 5, crewMemberCount: 0,
    inventory: { glock: { level: 0, duplicates: 0, src: 'bought' },
                 knife: { level: 12, duplicates: 0, src: 'bought' },
                 vest:  { level: 0, duplicates: 0, src: 'bought' } },
    loadout: { weapon: ['glock'] },
  });
  const glock = STORE_DATA.find(i => i.id === 'glock');
  assert.strictEqual(S.effAttack(), 10 + glock.atk, 'only the fielded weapon counts');
  assert.strictEqual(S.effDefense(), 5, 'owned-but-benched vest adds nothing');
});

test('upgrade gains derive per instance, capped at the stat cap', () => {
  const S = loadLoadout({});
  const knife = STORE_DATA.find(i => i.id === 'knife');
  const st = S.gearItemStats(knife, { level: 12 });
  const cap = tune('gear.statCapLevel', TUNE);
  const gain = tune('gear.statGainPerLevel', TUNE);
  assert.strictEqual(st.atk, knife.atk + cap * gain.attack, 'level 12 pays like level 10');
  assert.strictEqual(st.def, knife.def + cap * gain.defense);
});

test('capacity gates the loadout: a second weapon only counts with the Crew slot', () => {
  const base = {
    attack: 10, defense: 5,
    inventory: { glock: { level: 0, duplicates: 0, src: 'bought' },
                 knife: { level: 0, duplicates: 0, src: 'bought' } },
    loadout: { weapon: ['glock', 'knife'] },
  };
  const glock = STORE_DATA.find(i => i.id === 'glock');
  const knife = STORE_DATA.find(i => i.id === 'knife');
  const solo = loadLoadout(Object.assign({ crewMemberCount: 0 }, JSON.parse(JSON.stringify(base))));
  assert.strictEqual(solo.effAttack(), 10 + glock.atk, 'over-capacity secondary leaked into combat');
  const crewed = loadLoadout(Object.assign({ crewMemberCount: 5 }, JSON.parse(JSON.stringify(base))));
  assert.strictEqual(crewed.effAttack(), 10 + glock.atk + knife.atk, '5 Lieutenants = the weapon slot');
});

test('autoFieldGear fills an open slot and refuses when the type is full', () => {
  const S = loadLoadout({
    crewMemberCount: 0,
    inventory: { glock: { level: 0, duplicates: 0, src: 'bought' },
                 knife: { level: 0, duplicates: 0, src: 'bought' } },
    loadout: {},
  });
  assert.strictEqual(S.autoFieldGear('glock'), true);
  assert.strictEqual(S.autoFieldGear('glock'), true, 'already fielded reports success');
  assert.strictEqual(S.autoFieldGear('knife'), false, 'no free weapon slot at zero crew');
  assert.deepStrictEqual(plain(S.G.loadout.weapon), ['glock']);
});

test('nothing banks gear stats any more (code shape)', () => {
  const storeSrc = fs.readFileSync(path.join(ROOT, 'js/store.js'), 'utf8');
  assert.ok(!/G\.(attack|defense)\s*\+=/.test(storeSrc), 'store.js banks stats');
  assert.ok(!/G\.health\.max\s*\+=/.test(storeSrc), 'store.js banks max HP');
  const combatSrc = fs.readFileSync(path.join(ROOT, 'js/combat.js'), 'utf8');
  assert.ok(/atk:\s*effAttack\(\),\s*def:\s*effDefense\(\)/.test(combatSrc),
    'combat does not read the derived stats');
});

test('the combat snapshot freezes stats + loadout with CP = A × (H + D) at fight entry', () => {
  const combatSrc = fs.readFileSync(path.join(ROOT, 'js/combat.js'), 'utf8');
  const writes = combatSrc.match(/G\.combatSnapshot\s*=/g) || [];
  assert.strictEqual(writes.length, 1, 'exactly one snapshot write, at entry');
  assert.ok(combatSrc.indexOf('G.combatSnapshot') < combatSrc.indexOf('function hitEm'),
    'snapshot is written at entry, not mid-fight');
  assert.ok(/cp:\s*pf\.atk\s*\*\s*\(pf\.hp\s*\+\s*pf\.def\)/.test(combatSrc), 'the CP proxy formula');
});

test('acquisition source lands on the instance: bought vs dropped', () => {
  // the drop grant moved to js/drops.js with the DOM-18 rarity roll; jobs and
  // combat both route through rollDrop rather than granting directly
  const storeSrc = fs.readFileSync(path.join(ROOT, 'js/store.js'), 'utf8');
  const dropsSrc = fs.readFileSync(path.join(ROOT, 'js/drops.js'), 'utf8');
  assert.ok(/grantGear\([^)]+,\s*'bought'\)/.test(storeSrc), 'purchases are not tagged');
  assert.ok(/grantGear\([^)]+,\s*'dropped'\)/.test(dropsSrc), 'drops are not tagged');
});

test('the catalog has real stats and no HP items (stat-ratio fix + bando fold)', () => {
  assert.ok(STORE_DATA.every(i => i.hp === 0), 'fielded-gear HP has no pool plumbing');
  const ladder = STORE_DATA.filter(i => i.levelReq >= 10);
  assert.ok(ladder.every(i => i.atk + i.def > 0),
    'the zero-stat gear ladder is back (gen-catalog STAT_RATIO_PER_10)');
});

test('the public Profile exposes the loadout, never raw stats (DOM-75 acceptance)', () => {
  const profileSrc = fs.readFileSync(path.join(ROOT, 'js/profile.js'), 'utf8');
  const fn = profileSrc.match(/function pfPublicProjection[\s\S]*?\n\}/);
  assert.ok(fn, 'pfPublicProjection not found');
  const ctx = {
    console, JSON, Object, Math,
    STORE_ITEMS: STORE_DATA,
    tune: p => tune(p, TUNE),
    rankForLevel: () => 'SOLDIER',
    G: {},
  };
  ctx.globalThis = ctx;
  vm.runInNewContext(fn[0]
    + '\nfunction pfFindItem(id){return STORE_ITEMS.find(i=>i.id===id)||null;}'
    + '\nfunction pfTierLabel(it){const t=it.tier||1;return t<=4?"COMMON":t<=8?"RARE":t<=12?"ELITE":"LEGEND";}'
    + '\nglobalThis.__proj = pfPublicProjection;', ctx);
  const pub = ctx.__proj({
    handle: 'OPP', level: 12, clout: 5000,
    attack: 40, defense: 30, cash: 99999, skillPts: 9,
    health: { current: 10, max: 100 },
    inventory: { glock: { level: 3, duplicates: 0, src: 'bought' } },
    loadout: { weapon: ['glock'] },
    combatSnapshot: { cp: 123456 },
  });
  assert.deepStrictEqual(Object.keys(pub).sort(), ['clout', 'gear', 'handle', 'level', 'rank']);
  assert.deepStrictEqual(plain(pub.gear), [{ type: 'weapon', slot: 0, name: 'Glock 19', tier: 'COMMON', level: 3 }]);
});
