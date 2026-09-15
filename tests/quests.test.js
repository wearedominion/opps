// Plug quests (DOM-90).
// Part of the suite; run it all with `node tests/run.js`.

const {
  fs, path, vm, assert, ROOT, TUNE, tune, STORE_DATA, ENEMIES_DATA, JOBS_DATA,
  QUESTS_DATA, plain, test,
} = require('./harness');

console.log('\nPlug quests — DOM-90 one-shot bonus contract');

const TARGETS_DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/econ-sim/targets.json'), 'utf8'));
const MOVES_PER_HOUR_T = 3600 / tune('pools.moves.regenSeconds', TUNE) * tune('pools.moves.regenAmount', TUNE);

test('the quest catalog: one per plug, unique, gate-ordered, every step reachable at its gate', () => {
  assert.strictEqual(QUESTS_DATA.length, 5);
  assert.strictEqual(new Set(QUESTS_DATA.map(q => q.id)).size, 5);
  assert.strictEqual(new Set(QUESTS_DATA.map(q => q.plug)).size, 5, 'one quest per plug in v1');
  // The roster moved to data/plugs.json in DOM-123; check the ids, not the source text.
  const plugIds = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/plugs.json'), 'utf8')).map(p => p.id);
  QUESTS_DATA.forEach(q => {
    assert.ok(plugIds.includes(q.plug), q.id + ' names an unknown plug ' + q.plug);
    assert.ok(q.reward.cash > 0 && q.reward.clout > 0, q.id + ' has an empty reward');
    q.steps.forEach(s => {
      const pool = s.type === 'job' ? JOBS_DATA : s.type === 'fight' ? ENEMIES_DATA : STORE_DATA;
      const row = pool.find(r => r.id === s.id);
      assert.ok(row, q.id + ' step references unknown ' + s.type + ' ' + s.id);
      assert.ok(row.levelReq <= q.levelReq,
        q.id + ' (L' + q.levelReq + ') needs ' + s.id + ' gated at L' + row.levelReq);
      if (s.type !== 'item') assert.ok(s.count >= 1);
    });
    if (q.reward.item) assert.ok(STORE_DATA.find(i => i.id === q.reward.item), q.id + ' rewards unknown item');
  });
  const gates = QUESTS_DATA.map(q => q.levelReq);
  assert.deepStrictEqual(gates, [...gates].sort((a, b) => a - b));
});

test('the bonus rule holds: hours × best-job income at the gate, bounded by the break-even anchor', () => {
  const jobRate = L => Math.max(...JOBS_DATA.filter(j => j.levelReq <= L)
    .map(j => (j.cash[0] + j.cash[1]) / 2 / j.moves)) * MOVES_PER_HOUR_T;
  const jobCpm = L => Math.max(...JOBS_DATA.filter(j => j.levelReq <= L).map(j => j.clout / j.moves));
  QUESTS_DATA.forEach(q => {
    const rule = q.hours * jobRate(q.levelReq);
    assert.ok(Math.abs(q.reward.cash - rule) / rule <= 0.05,
      q.id + ' cash $' + q.reward.cash + ' vs rule $' + Math.round(rule));
    assert.strictEqual(q.reward.clout,
      Math.max(1, Math.round(q.hours * jobCpm(q.levelReq) * MOVES_PER_HOUR_T)), q.id + ' clout');
    // A quest bonus must never reach the fight break-even anchor's scale —
    // that is what "does not obsolete the Moves ladder" means in hours.
    assert.ok(q.hours < TARGETS_DATA.breakEven.hoursOfJobIncome,
      q.id + ' bonus (' + q.hours + 'h) rivals the ' + TARGETS_DATA.breakEven.hoursOfJobIncome + 'h anchor');
  });
});

test('quest_reward is a registered ledger reason and both hooks are wired (code shape)', () => {
  const ledgerSrc = fs.readFileSync(path.join(ROOT, 'js/ledger.js'), 'utf8');
  assert.ok(/QUEST_REWARD:\s*'quest_reward'/.test(ledgerSrc));
  const jobsSrc = fs.readFileSync(path.join(ROOT, 'js/jobs.js'), 'utf8');
  assert.ok(/Quests\.onJob\(job\.id\)/.test(jobsSrc), 'doJob does not feed quest counters');
  const combatSrc = fs.readFileSync(path.join(ROOT, 'js/combat.js'), 'utf8');
  const winBlock = combatSrc.slice(combatSrc.indexOf('if (enemyDead)'), combatSrc.indexOf('} else {'));
  assert.ok(/Quests\.onFightWin\(enemy\.id\)/.test(winBlock), 'fight WIN does not feed quest counters');
});

// state.js + quests.js in one vm: the tracking/claim layer under test.
function loadQuests(over) {
  const rows = [];
  const ctx = {
    console, JSON, Object, Math, Array, Date,
    QUESTS: QUESTS_DATA,
    STORE_ITEMS: STORE_DATA,
    tune: p => tune(p, TUNE),
    REASON: { QUEST_REWARD: 'quest_reward' },
    credit: (pool, amt, reason, meta) => { rows.push({ pool, amt, reason, questId: meta && meta.ref && meta.ref.questId }); return amt; },
    addClout: (amt, reason, meta) => { rows.push({ pool: 'clout', amt, reason, questId: meta && meta.questId }); },
    toast: () => {}, log: () => {}, updateHUD: () => {},
    $: () => null,
    // state.js's own GameState wins over any stub; localStorage keeps its
    // save() quiet instead of console-warning through every claim test.
    localStorage: { getItem: () => null, setItem: () => {} },
  };
  ctx.globalThis = ctx;
  const src = fs.readFileSync(path.join(ROOT, 'js/state.js'), 'utf8')
    + '\n' + fs.readFileSync(path.join(ROOT, 'js/quests.js'), 'utf8')
    + '\n;globalThis.__q = { G, Quests, claimQuest, questComplete, questProgress, questFor };';
  vm.runInNewContext(src, ctx);
  const Q = ctx.__q;
  Object.assign(Q.G, over || {});
  return { ...Q, rows };
}

test('counters: gated by level, capped at the step target, never counted after claim', () => {
  const Q = loadQuests({ level: 1, quests: {}, inventory: {} });
  Q.Quests.onFightWin('snitch');                       // snitch_problem is gated L2
  assert.ok(!Q.G.quests.snitch_problem || Q.G.quests.snitch_problem.p[0] === 0,
    'a locked quest banked progress');
  Q.G.level = 2;
  for (let i = 0; i < 9; i++) Q.Quests.onFightWin('snitch');
  assert.strictEqual(Q.G.quests.snitch_problem.p[0], 3, 'counter ran past the step target');
  const q = QUESTS_DATA.find(x => x.id === 'snitch_problem');
  assert.ok(Q.questComplete(q));
});

test('claim: pays cash + clout through the ledger exactly once, then refuses forever', () => {
  const Q = loadQuests({ level: 2, cash: 0, inventory: {},
    quests: { snitch_problem: { p: [3], claimed: false } } });
  Q.claimQuest('snitch_problem');
  const q = QUESTS_DATA.find(x => x.id === 'snitch_problem');
  assert.deepStrictEqual(plain(Q.rows), [
    { pool: 'cash', amt: q.reward.cash, reason: 'quest_reward', questId: 'snitch_problem' },
    { pool: 'clout', amt: q.reward.clout, reason: 'quest_reward', questId: 'snitch_problem' },
  ]);
  Q.claimQuest('snitch_problem');
  assert.strictEqual(Q.rows.length, 2, 'a second claim paid again');
});

test('claim refuses an incomplete quest and pays nothing', () => {
  const Q = loadQuests({ level: 2, inventory: {},
    quests: { snitch_problem: { p: [2], claimed: false } } });
  Q.claimQuest('snitch_problem');
  assert.strictEqual(Q.rows.length, 0);
  assert.strictEqual(Q.G.quests.snitch_problem.claimed, false);
});

test('item steps check live ownership; the gear reward lands own-once with src quest', () => {
  const big = QUESTS_DATA.find(x => x.id === 'the_big_one');
  const done = { p: big.steps.map(s => s.type === 'item' ? 0 : s.count), claimed: false };
  const Q = loadQuests({ level: 7, inventory: {}, loadout: {}, crewMemberCount: 0,
    quests: { the_big_one: JSON.parse(JSON.stringify(done)) } });
  assert.ok(!Q.questComplete(big), 'complete without owning the required item');
  Q.G.inventory.glock = { level: 0, duplicates: 0, src: 'bought' };
  assert.ok(Q.questComplete(big), 'live ownership not seen');
  Q.claimQuest('the_big_one');
  assert.strictEqual(Q.G.inventory[big.reward.item].src, 'quest');
  assert.ok((Q.G.loadout.utility || []).indexOf(big.reward.item) !== -1, 'reward not auto-fielded');
});
