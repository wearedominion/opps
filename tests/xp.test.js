// FW5 action awards — data/xp-system.json and js/xp.js (DOM-124).
// Part of the suite; run it all with `node tests/run.js`.

const {
  fs, path, assert, ROOT, TABLE, RANKS, MAX_LEVEL, XP_SPEC, XP, test,
} = require('./harness');

const { XP_PATHS, XP_UNPAID, XpAwards, xpWeight, xpScale, xpToClout, xpMarkFirst, awardXp, addXP } = XP;
const SPEC_SRC = path.join(ROOT, 'docs/design/chrome-money-v0.2/design_reference/xp-system.json');

// ─────────────────────────────────────────────
//  The spec, and what was taken from it
// ─────────────────────────────────────────────

test('every weight the engine reads resolves in the shipped spec', () => {
  // xpWeight() returns null rather than throwing, because a failed fetch must
  // not take the game down mid-action — which means a typo'd path would pay
  // nothing, silently, forever. This is where that gets caught instead: the
  // engine declares every path it reads and each one has to be a number here.
  const missing = XP_PATHS.filter(p => typeof xpWeight(p, XP_SPEC) !== 'number');
  assert.deepStrictEqual(missing, [], 'unresolvable paths in XP_PATHS');
  assert.ok(XP_PATHS.length >= 30, 'the tables are covered, not sampled');
});

test('every actionXp category has a resolver — none is silently unhandled', () => {
  // Guards against the spec growing a category that nothing reads. Walks the
  // file rather than a list, so a new table shows up here the day it lands.
  const covered = new Set(XP_PATHS.map(p => p.split('.')[0]));
  for (const category of Object.keys(XP_SPEC.actionXp)) {
    assert.ok(covered.has(category), 'actionXp.' + category + ' has no resolver in js/xp.js');
  }
});

test('the opps formula reproduces all six of the spec\'s own targets', () => {
  // The AC names F-09 = 65; the spec ships its own worked answers, so check
  // against every one of them rather than the single quoted example.
  const targets = XP_SPEC.actionXp.opps.targets;
  assert.strictEqual(targets.length, 6);
  for (const t of targets) {
    assert.strictEqual(XpAwards.opp(t.risk, t.threat, false, XP_SPEC), t.xp,
      t.code + ' ' + t.name + ' (' + t.risk + ', threat ' + t.threat + ')');
  }
  // and the clean-kill bonus is on top of that, not folded into it
  const f09 = targets[targets.length - 1];
  assert.strictEqual(XpAwards.opp(f09.risk, f09.threat, true, XP_SPEC),
    f09.xp + XP_SPEC.actionXp.opps.cleanKillBonus);
});

test('a plug prices its own recruit and job, falling back to the flat table', () => {
  const byPlug = XP_SPEC.actionXp.plugs.byPlug;
  for (const p of byPlug) {
    assert.strictEqual(XpAwards.plugRecruit(p.slotId, XP_SPEC), p.recruitXp, p.slotId);
    assert.strictEqual(XpAwards.plugJob(p.slotId, XP_SPEC), p.jobXp, p.slotId);
  }
  // DEX is the one whose job is priced above the base — the case a flat lookup
  // would get wrong without anyone noticing.
  assert.notStrictEqual(XpAwards.plugJob('plug-dex', XP_SPEC), XP_SPEC.actionXp.plugs.jobBase);
  // an unknown plug still pays, from the table
  assert.strictEqual(XpAwards.plugRecruit('plug-nobody', XP_SPEC), XP_SPEC.actionXp.plugs.recruit);
});

test('the streak bonus accumulates per day and stops at the cap', () => {
  const per = XP_SPEC.actionXp.missions.daily.streakBonusPerDay;
  const cap = XP_SPEC.actionXp.missions.daily.streakBonusCap;
  assert.strictEqual(XpAwards.streak(0, XP_SPEC), 0);
  assert.strictEqual(XpAwards.streak(3, XP_SPEC), per * 3);
  assert.strictEqual(XpAwards.streak(cap / per, XP_SPEC), cap);
  assert.strictEqual(XpAwards.streak(999, XP_SPEC), cap, 'an unbounded streak is not an unbounded faucet');
});

// ─────────────────────────────────────────────
//  The curve that was NOT adopted
// ─────────────────────────────────────────────

test('the curve did not come along with the award tables', () => {
  // Jake's ruling: harvest actionXp, leave the 1-100 curve behind, "note that
  // in the file or README so nobody re-adopts it by accident". This is that
  // note with teeth — data/progression.json stays the only level authority.
  const shipped = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/xp-system.json'), 'utf8'));
  assert.deepStrictEqual(Object.keys(shipped).sort(), ['actionXp', 'meta']);
  assert.ok(!shipped.levels, 'a levels block is back in data/xp-system.json');
  // Curve FIELDS, not the word: meta.adopted names totalXpToMax on purpose, so
  // that a reader knows exactly which number was declined. Walk the keys.
  const curveKeys = ['totalXpToReach', 'xpToNext', 'totalXpToMax', 'levels'];
  const found = [];
  (function walk(node, at) {
    if (!node || typeof node !== 'object') return;
    for (const k of Object.keys(node)) {
      if (curveKeys.indexOf(k) !== -1) found.push(at + k);
      walk(node[k], at + k + '.');
    }
  })(shipped, '');
  assert.deepStrictEqual(found, [], 'curve fields are back in the award spec');
  const raw = fs.readFileSync(path.join(ROOT, 'data/xp-system.json'), 'utf8');
  assert.ok(/progression\.json/.test(raw), 'the file has to say where the curve lives');
});

test('the 100 rank titles are the handoff\'s, unedited, and ranks.json is their only home', () => {
  const source = JSON.parse(fs.readFileSync(SPEC_SRC, 'utf8'));
  assert.deepStrictEqual(RANKS, source.levels.map(l => l.title),
    'ranks.json has drifted from the design source it was lifted from');
  assert.strictEqual(RANKS.length, 100);
  // and the titles live in exactly one file — not copied into a screen
  const strays = fs.readdirSync(path.join(ROOT, 'js'))
    .filter(f => f.endsWith('.js'))
    .filter(f => /'STREET DON'|"STREET DON"/.test(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8')));
  assert.deepStrictEqual(strays, [], 'a rank title is hardcoded in js/ as well as ranks.json');
});

// ─────────────────────────────────────────────
//  Weights → Clout
// ─────────────────────────────────────────────

test('a weight is denominated at level 1 and grows with the repo curve', () => {
  assert.strictEqual(xpScale(1, TABLE), 1, 'level 1 is the denomination point');
  assert.strictEqual(xpToClout(60, 1, TABLE), 60);
  // the shape is the curve's own, not a constant multiplier
  assert.strictEqual(xpScale(50, TABLE), TABLE[49].cloutToNext / TABLE[0].cloutToNext);
  assert.ok(xpScale(120, TABLE) > xpScale(50, TABLE));
  assert.ok(xpScale(50, TABLE) > xpScale(2, TABLE));
});

test('an award is the same fraction of a level at the cap as at the start', () => {
  // The scale policy, stated as the property it exists to produce. If DOM-67
  // rules differently this is the test that should fail first and loudest.
  const weight = XP_SPEC.actionXp.missions.daily.dailyGrind;
  const fraction = L => xpToClout(weight, L, TABLE) / TABLE[L - 1].cloutToNext;
  const atOne = fraction(1);
  for (const L of [2, 25, 60, 100, 119]) {
    assert.ok(Math.abs(fraction(L) - atOne) < 0.001, 'level ' + L + ' pays a different share of a level');
  }
});

test('the cap keeps paying, and no real award rounds away to nothing', () => {
  // The last row prices no further level (cloutToNext: null). Falling to a zero
  // scale there would silently stop paying the players who play the most.
  assert.strictEqual(TABLE[TABLE.length - 1].cloutToNext, null);
  assert.ok(xpToClout(10, MAX_LEVEL, TABLE) > 0, 'a capped player still earns');
  assert.strictEqual(xpToClout(1, 1, TABLE), 1);
  assert.strictEqual(xpToClout(0, 1, TABLE), 0, 'nothing is still nothing');
  // no table at all (fetch missed): pay the weight rather than crash or zero out
  assert.strictEqual(xpToClout(35, 9, []), 35);
});

// ─────────────────────────────────────────────
//  Paying
// ─────────────────────────────────────────────

function payer(level) {
  const paid = [];
  const state = { level: level || 1, xpFirsts: {} };
  return {
    paid, state,
    award: (weight, label, opts) => awardXp(weight, label, Object.assign(
      { state, level: state.level, table: TABLE, addClout: null }, opts)),
  };
}

// awardXp reaches for the globals a browser has; give it ones we can read back.
global.addClout = function (amt, reason, ref) { (global.__paid = global.__paid || []).push({ amt, reason, ref }); };
global.REASON = require(path.join(ROOT, 'js/ledger.js')).REASON;
global.log = function () {};

test('awardXp pays through addClout, attributably', () => {
  global.__paid = [];
  const p = payer(1);
  const clout = p.award(XpAwards.objective(XP_SPEC), 'OBJECTIVE CLEARED',
    { reason: global.REASON.OBJECTIVE_CLEARED, ref: { moveId: 'take_the_block' } });
  assert.strictEqual(clout, XP_SPEC.actionXp.missions.mainStory.perObjective);
  assert.deepStrictEqual(global.__paid, [{
    amt: clout, reason: 'objective_cleared', ref: { moveId: 'take_the_block' },
  }], 'every point has to be traceable to what produced it');
});

test('a missing spec pays nothing rather than guessing', () => {
  global.__paid = [];
  const p = payer(1);
  const warned = [];
  const realWarn = console.warn; console.warn = m => warned.push(m);
  try {
    assert.strictEqual(p.award(xpWeight('missions.daily.dailyGrind', null), 'DAILY'), 0);
  } finally { console.warn = realWarn; }
  assert.deepStrictEqual(global.__paid, []);
  assert.strictEqual(warned.length, 1, 'and says so, rather than failing silently');
});

test('the first-time bonus doubles once, and only once', () => {
  global.__paid = [];
  const p = payer(1);
  const weight = XP_SPEC.actionXp.misc.robbery;
  const first  = p.award(weight, null, { firstId: 'misc:robbery' });
  const second = p.award(weight, null, { firstId: 'misc:robbery' });
  assert.strictEqual(first, weight * 2, 'misc.firstTimeBonus is x2');
  assert.strictEqual(second, weight);
  // a different action has its own first time
  assert.strictEqual(p.award(weight, null, { firstId: 'misc:flip' }), weight * 2);
  assert.deepStrictEqual(Object.keys(p.state.xpFirsts).sort(), ['misc:flip', 'misc:robbery']);
});

test('xpMarkFirst reports a first time exactly once, and survives an old save', () => {
  const old = {};                                  // a save written before G.xpFirsts existed
  assert.strictEqual(xpMarkFirst('a', old), true);
  assert.strictEqual(xpMarkFirst('a', old), false);
  assert.deepStrictEqual(old.xpFirsts, { a: true });
  assert.strictEqual(xpMarkFirst('', old), false, 'an award with no id is never "first"');
});

// ─────────────────────────────────────────────
//  What this file deliberately does not pay
// ─────────────────────────────────────────────

test('the categories the repo already prices are not paid a second time', () => {
  // "Side hustles" in Make Moves ARE jobs.json rows — DOM-115 re-skinned the job
  // loop rather than replacing it — and doJob() already pays job.clout. Opps are
  // paid enemy.reward.clout by combat.js. Both are level-scaled and calibrated by
  // DOM-67; paying the spec's flat table on top would pay twice for one action.
  assert.deepStrictEqual(XP_UNPAID.slice(), ['opps', 'missions.sideHustles']);
  for (const kind of ['standard', 'timed', 'multiTarget']) {
    assert.strictEqual(addXP(kind), 0, kind + ' paid from the spec as well as jobs.json');
  }
  // the weights still resolve — the spec is the spec, it just is not the payer
  assert.strictEqual(typeof XpAwards.sideHustle('timed', XP_SPEC), 'number');
});

test('nothing outside js/xp.js calls the unpaid resolvers', () => {
  // The behavioural check above covers Make Moves. This covers the next screen:
  // a territory or store ticket reaching for XpAwards.opp would reopen the
  // double-pay quietly. Comments are stripped first — DOM-129's lesson was that
  // a grep otherwise matches the paragraph explaining the rule.
  const offenders = [];
  for (const f of fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js'))) {
    if (f === 'xp.js') continue;
    const code = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    if (/XpAwards\.(opp|sideHustle)\s*\(/.test(code)) offenders.push('js/' + f);
  }
  assert.deepStrictEqual(offenders, []);
});

test('Make Moves pays per objective, and the completion bonus on the last one', () => {
  global.__paid = [];
  global.G = { level: 1, xpFirsts: {} };
  global.PROGRESSION = TABLE;
  global.XP_SYSTEM = XP_SPEC;
  try {
    const perObjective = addXP('mainStory', { id: 'take_the_block' });
    const completion   = addXP('mainStory', { id: 'take_the_block', completed: true });
    assert.strictEqual(perObjective, XP_SPEC.actionXp.missions.mainStory.perObjective);
    assert.strictEqual(completion, XP_SPEC.actionXp.missions.mainStory.completion.base);
    assert.ok(completion > perObjective, 'finishing the card is worth more than a beat of it');
    assert.deepStrictEqual(global.__paid.map(r => r.reason),
      ['objective_cleared', 'quest_reward']);
    // the daily is the spec's number too
    assert.strictEqual(addXP('daily'), XP_SPEC.actionXp.missions.daily.dailyGrind);
  } finally {
    delete global.G; delete global.PROGRESSION; delete global.XP_SYSTEM;
  }
});
