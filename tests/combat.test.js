// Fight math (DOM-72 round model).
// Part of the suite; run it all with `node tests/run.js`.

const {
  fs, path, vm, assert, ROOT, TUNE, tune, G, STORE_DATA, ENEMIES_DATA, test,
} = require('./harness');

console.log('\nfight math — DOM-72 round model');

const FM = require(path.join(ROOT, 'js/fightmath.js'));
const FIGHT_CFG = {
  roundDamageShare: tune('combat.roundDamageShare', TUNE),
  damageSpread: tune('combat.damageSpread', TUNE),
  firstStrikeEdge: tune('combat.firstStrikeEdge', TUNE),
  baseHp: tune('start.health', TUNE),
};
// The generator's expected-loadout formula, mirrored (DOM-75): start stats +
// the best item PER TYPE at or below the band, upgrades at level 0 — the
// zero-crew one-slot-per-type baseline the enemies are solved against.
function loadoutAt(band) {
  const best = {};
  for (const i of STORE_DATA) {
    // the buyable floor, exactly as the generator solves it: drop-only
    // rarities (DOM-18) sit ABOVE nominal by design and never anchor enemies
    if (i.dropOnly || i.levelReq > band) continue;
    if (!best[i.type] || i.atk + i.def > best[i.type].atk + best[i.type].def) best[i.type] = i;
  }
  const picks = Object.keys(best).map(t => best[t]);
  return {
    atk: tune('start.attack', TUNE) + picks.reduce((s, i) => s + i.atk, 0),
    def: tune('start.defense', TUNE) + picks.reduce((s, i) => s + i.def, 0),
    hp: tune('start.health', TUNE),
  };
}

test('damage ratio is 1 at parity and stays inside (0, 2)', () => {
  assert.strictEqual(FM.fmRatio(10, 10), 1);
  assert.ok(FM.fmRatio(1, 1000) > 0);
  assert.ok(FM.fmRatio(1000, 1) < 2);
});

test('a killed enemy never counterattacks (sequential rounds)', () => {
  // spread 0 makes it deterministic: parity damage kills the enemy on round 4
  // (28 + 25 + 25 + 25), and the enemy's counters are the 1-damage floor. The
  // player takes exactly rounds − 1 counters — the dying blow never lands.
  const cfg = Object.assign({}, FIGHT_CFG, { damageSpread: 0 });
  const f = FM.fmFight({ atk: 10000, def: 10000, hp: 100 },
                       { atk: 100, def: 10000, maxHp: 100 }, cfg, FM.fmSeededRng(1));
  assert.strictEqual(f.win, true);
  assert.strictEqual(f.rounds, 4);
  assert.strictEqual(f.playerHpLoss, f.rounds - 1, 'the dying blow landed');
});

test('generated enemies sit near the pricing nominal at their bands (L10/50/110)', () => {
  [10, 50, 110].forEach(band => {
    const e = ENEMIES_DATA.filter(x => x.levelReq <= band).slice(-1)[0];
    const st = FM.fmStats(loadoutAt(band), { atk: e.atk, def: e.def, maxHp: e.hp },
                          FIGHT_CFG, 3000, FM.fmSeededRng(42 + band));
    assert.ok(st.pWin > 0.38 && st.pWin < 0.62,
      'L' + band + ' vs ' + e.id + ' pWin ' + st.pWin.toFixed(3));
  });
});

test('the tank build works: more max Health, more wins', () => {
  const band = 50;
  const e = ENEMIES_DATA.filter(x => x.levelReq <= band).slice(-1)[0];
  const enemy = { atk: e.atk, def: e.def, maxHp: e.hp };
  const base = loadoutAt(band);
  const tank = Object.assign({}, base, { hp: base.hp * 2 });
  const pBase = FM.fmStats(base, enemy, FIGHT_CFG, 4000, FM.fmSeededRng(7)).pWin;
  const pTank = FM.fmStats(tank, enemy, FIGHT_CFG, 4000, FM.fmSeededRng(7)).pWin;
  assert.ok(pTank > pBase + 0.05, 'tank ' + pTank.toFixed(3) + ' vs base ' + pBase.toFixed(3));
});

test('the G literal carries hospitalizedUntil: null (08 §3 single-field shape)', () => {
  assert.strictEqual(G.hospitalizedUntil, null);
});

test('level-up releases from the Hospital in the refill transaction (DOM-82)', () => {
  // applyLevelGrants lives in main.js, which runs init() on load — extract
  // just the function and run it against a hospitalized G in a sandbox.
  const mainSrc = fs.readFileSync(path.join(ROOT, 'js/main.js'), 'utf8');
  const fn = mainSrc.match(/function applyLevelGrants\(\) \{[\s\S]*?\n\}/);
  assert.ok(fn, 'applyLevelGrants not found in main.js');
  const sandbox = {
    console, Math, Object,
    G: {
      level: 5, skillPts: 0, hospitalizedUntil: 9999999999999,
      moves:   { current: 0, max: 10,  lastTick: 0 },
      stamina: { current: 0, max: 3,   lastTick: 0 },
      health:  { current: 0, max: 100, lastTick: 0 },
      attack: 10, defense: 5,
    },
    tune: p => tune(p, TUNE),
    credit: (res, amt) => {
      const G = sandbox.G;
      if (res === 'skillPts') { G.skillPts += amt; return amt; }
      const applied = Math.min(amt, G[res].max - G[res].current);
      G[res].current += applied;
      return applied;
    },
    REASON: { LEVEL_UP_GRANT: 'level_up_grant' },
  };
  vm.runInNewContext(fn[0] + '; applyLevelGrants();', sandbox);
  assert.strictEqual(sandbox.G.hospitalizedUntil, null, 'still hospitalized');
  // Pools refill to their (possibly grown) max — the release and the refill
  // are one transaction, never one without the other.
  assert.strictEqual(sandbox.G.health.current, sandbox.G.health.max, 'health not refilled');
  assert.strictEqual(sandbox.G.moves.current, sandbox.G.moves.max);
  assert.strictEqual(sandbox.G.stamina.current, sandbox.G.stamina.max);
});
