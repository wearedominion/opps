// S6 Make Moves + log modal (DOM-115).
// Part of the suite; run it all with `node tests/run.js`.

const { fs, path, vm, assert, ROOT, readAllCss, G, test } = require('./harness');

// ─────────────────────────────────────────────
//  DOM-115 — S6 Make Moves + log modal
// ─────────────────────────────────────────────

// jobs.js leans on browser globals; the sandbox supplies only what the pure
// helpers touch and exports them. doJob() is not exercised here — it is
// unchanged by DOM-115 and already covered by the economy tests.
function loadMoves(over) {
  const src = fs.readFileSync(path.join(ROOT, 'js/jobs.js'), 'utf8')
    + '\n;globalThis.__t = { mvJobStatus, mvCountdown, mvAgo, mvTodayKey, mvDailyCash,'
    + ' mvNoteDailyCash, mvDailyRewardLabel, mvLogLabel, mvCloutRows, mvMoney,'
    + ' MV_XP_DAILY_FALLBACK, G };';
  const ctx = Object.assign({
    console, JSON, Object, Math, Array, Date, Number, String,
    G: { jobProgress: {}, moveObjective: 0, dailyCash: 0, dailyCashDate: null },
    JOBS: [], ENEMIES: [], QUESTS: [], MOVES: null,
    document: { querySelector: () => null, querySelectorAll: () => [] },
    // The screen claims its tab at load (DOM-127); in here there is no showTab
    // to claim it from, so swallow the call and test the pure functions.
    registerScreen: () => {},
    setInterval: () => 0, clearInterval: () => {},
    $: () => null,
  }, over || {});
  vm.runInNewContext(src, ctx);
  return Object.assign({}, ctx.__t, { ctx });
}

test('make moves — the hustle chip is derived from live job state, not authored', () => {
  const M = loadMoves();
  const job = { id: 'runner', times: 5 };
  assert.strictEqual(M.mvJobStatus(job), 'NEW');          // never run
  M.G.jobProgress.runner = 2;
  assert.strictEqual(M.mvJobStatus(job), 'ACTIVE');       // part-way
  M.G.jobProgress.runner = 5;
  assert.strictEqual(M.mvJobStatus(job), 'DONE');         // mastered
  // a job carrying an expiry is TIMED regardless of progress
  assert.strictEqual(M.mvJobStatus({ id: 'runner', times: 5, expiresAt: Date.now() + 1000 }), 'TIMED');
});

test('make moves — the countdown is mm:ss and never runs negative', () => {
  const M = loadMoves();
  assert.strictEqual(M.mvCountdown(19 * 60000 + 48000), '19:48');
  assert.strictEqual(M.mvCountdown(65000), '01:05');
  assert.strictEqual(M.mvCountdown(0), '00:00');
  assert.strictEqual(M.mvCountdown(-5000), '00:00', 'an expired hustle reads 00:00, not -00:05');
});

test('make moves — sighting ages read in minutes then hours', () => {
  const M = loadMoves();
  assert.strictEqual(M.mvAgo(240), '4M AGO');
  assert.strictEqual(M.mvAgo(1320), '22M AGO');
  assert.strictEqual(M.mvAgo(3600), '1H AGO');
  assert.strictEqual(M.mvAgo(20), '1M AGO', 'a fresh sighting rounds up, never to 0M');
});

test('make moves — the daily tally resets on a new local date', () => {
  const M = loadMoves();
  M.mvNoteDailyCash(400);
  M.mvNoteDailyCash(250);
  assert.strictEqual(M.mvDailyCash(), 650);
  assert.strictEqual(M.G.dailyCashDate, M.mvTodayKey());
  // yesterday's total does not carry over
  M.G.dailyCashDate = '2020-01-01';
  assert.strictEqual(M.mvDailyCash(), 0, 'a stale date reads as zero earned today');
  M.mvNoteDailyCash(100);
  assert.strictEqual(M.mvDailyCash(), 100, 'the first earning of a new day starts the count over');
});

test('make moves — only earned cash counts toward the daily, not grants', () => {
  // The tally is taken inside the ledger funnel, so the guard is the reason
  // list rather than the call site.
  const src = fs.readFileSync(path.join(ROOT, 'js/ledger.js'), 'utf8')
    + '\n;globalThis.__t = { EARNED_CASH_REASONS, REASON };';
  const ctx = { console, JSON, Object, Math, Date, G: {} };
  vm.runInNewContext(src, ctx);
  const { EARNED_CASH_REASONS, REASON } = ctx.__t;
  const earned = Array.from(EARNED_CASH_REASONS);
  assert.ok(earned.includes(REASON.MOVE_PAYOUT), 'running a move is earning');
  assert.ok(earned.includes(REASON.FIGHT_REWARD), 'winning a fight is earning');
  assert.ok(!earned.includes(REASON.STARTING_GRANT), 'a fresh save must not complete the daily');
  assert.ok(!earned.includes(REASON.IAP_GRANT), 'buying cash must not complete the daily');
});

test('make moves — the clout log reads the ledger, newest first, credits only', () => {
  const rows = [
    { id: 1, ts: 1000, resource: 'clout', delta: 7,  reason: 'move_payout', ref: { jobId: 'runner' } },
    { id: 2, ts: 2000, resource: 'cash',  delta: 50, reason: 'move_payout', ref: null },
    { id: 3, ts: 3000, resource: 'clout', delta: 14, reason: 'fight_reward', ref: { enemyId: 'snitch' } },
  ];
  const M = loadMoves({
    ledgerRows: () => rows.slice(),
    JOBS: [{ id: 'runner', name: 'Run Packages' }],
    ENEMIES: [{ id: 'snitch', name: 'Local Snitch' }],
  });
  const got = M.mvCloutRows();
  assert.deepStrictEqual(got.map(r => r.id), [3, 1], 'cash rows are excluded and clout is newest-first');
  // the ref names the source, so the log is not five identical lines
  assert.strictEqual(M.mvLogLabel(got[0]), 'Beat Local Snitch');
  assert.strictEqual(M.mvLogLabel(got[1]), 'Run Packages');
  // an unknown ref still renders something readable
  assert.strictEqual(M.mvLogLabel({ reason: 'recruit_bonus', ref: null }), 'Crew recruited');
});

test('make moves — the daily XP label falls back to the figure 02-moves.md prints', () => {
  const M = loadMoves();
  assert.strictEqual(M.MV_XP_DAILY_FALLBACK, 20);
  assert.strictEqual(M.mvDailyRewardLabel(), 'XP +20');
  // once DOM-124 ships xp-system.json, the file wins
  const M2 = loadMoves({ XP_SYSTEM: { actionXp: { dailyGrind: 30 } } });
  assert.strictEqual(M2.mvDailyRewardLabel(), 'XP +30');
});

test('make moves — the DONE state derives from jobProgress, with no second list', () => {
  // The AC asks for `sideDone` to persist. It is deliberately not a save field:
  // mvJobStatus() derives DONE from G.jobProgress[job.id], so a parallel list
  // would be duplicate bookkeeping able to disagree with the mastery meter.
  const stateSrc = fs.readFileSync(path.join(ROOT, 'js/state.js'), 'utf8');
  assert.ok(!/^\s*sideDone\s*:/m.test(stateSrc),
    'sideDone is back on G — the DONE state already derives from jobProgress');
  const M = loadMoves();
  const job = { id: 'runner', times: 3 };
  M.G.jobProgress.runner = 3;
  assert.strictEqual(M.mvJobStatus(job), 'DONE', 'mastery is what makes a hustle DONE');
});

test('make moves — side hustles render the real jobs, not the placeholders', () => {
  // data/moves.json still carries the prototype's three placeholder hustles.
  // If a future edit ever points the section at them, doJob() — and with it the
  // Moves sink, Quests.onJob and rollDrop — goes unreachable. Guard that.
  const src = fs.readFileSync(path.join(ROOT, 'js/jobs.js'), 'utf8');
  assert.ok(/function mvHustles\(\)[\s\S]*?JOBS\.map/.test(src),
    'mvHustles must map over JOBS');
  assert.ok(/onclick="doJob\(/.test(src), 'the hustle CTA must still call doJob');
  assert.ok(!/MOVES\.side/.test(src), 'the placeholder side array must stay unused');
});

test('make moves — doJob still spends Moves and feeds quests and drops', () => {
  // DOM-115 re-skins the screen; it must not have re-tuned the loop underneath.
  const src = fs.readFileSync(path.join(ROOT, 'js/jobs.js'), 'utf8');
  const body = src.slice(src.indexOf('function doJob(jobId)'));
  for (const call of ["debit('moves'", "credit('cash'", 'addClout(', 'Quests.onJob(', 'rollDrop(', "surfaceOffer('moves'"]) {
    assert.ok(body.includes(call), 'doJob lost ' + call);
  }
});

test('make moves — the screen is built to the 02-moves.md geometry', () => {
  const css = readAllCss();
  assert.ok(/\.mv\s*\{[^}]*gap:\s*18px/.test(css), 'the screen column is an 18px gap');
  assert.ok(/\.mv-feat\s*\{[^}]*border:\s*1px solid var\(--border-gold\)/.test(css));
  assert.ok(/\.mv-feat-band\s*\{[^}]*height:\s*118px/.test(css), 'the header band is 118px');
  assert.ok(/\.mv-feat-title\s*\{[^}]*font-size:\s*30px/.test(css));
  assert.ok(/\.mv-obj-dot\s*\{[^}]*width:\s*14px/.test(css), 'objective dots are 14px');
  assert.ok(/\.mv-hustles\s*\{[^}]*gap:\s*9px/.test(css), 'hustles sit on a 9px gap');
  assert.ok(/\.mv-spotted\s*\{[^}]*border:\s*1px solid var\(--border-danger\)/.test(css));
  assert.ok(/\.clout-log\s*\{[^}]*max-height:\s*82%/.test(css), 'the log sheet caps at 82%');
  assert.ok(/\.clout-log\s*\{[^}]*border-bottom:\s*none/.test(css), 'the sheet has no bottom edge');
});

test('make moves — XP rewards are blue and cash rewards are gold', () => {
  const css = readAllCss();
  assert.ok(/\.mv-xp-reward\s*\{[^}]*color:\s*var\(--xp\)/.test(css), 'XP reward is --xp');
  assert.ok(/\.mv-reward\s*\{[^}]*color:\s*var\(--gold\)/.test(css), 'cash reward is --gold');
  assert.ok(/\.mv-hus-reward\s*\{[^}]*color:\s*var\(--gold\)/.test(css));
});
