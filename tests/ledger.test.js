// The transaction ledger.
// Part of the suite; run it all with `node tests/run.js`.

const { path, assert, ROOT, G, test } = require('./harness');

console.log('\nledger');

const L = require(path.join(ROOT, 'js/ledger.js'));
global.credit = L.credit; global.debit = L.debit; global.REASON = L.REASON;

function wallet(over) {
  L.ledgerClear();
  global.G = {
    cash: 1000, clout: 0, skillPts: 0,
    moves:   { current: 5, max: 10, lastTick: 0 },
    stamina: { current: 1, max: 3,  lastTick: 0 },
    health:  { current: 50, max: 100, lastTick: 0 },
  };
  Object.assign(global.G, over || {});
  return global.G;
}

test('a balance change writes exactly one row carrying the resulting balance', () => {
  const G = wallet();
  const applied = L.debit('cash', 250, L.REASON.GEAR_BUY, { ref: { itemId: 'knife' } });
  assert.strictEqual(applied, -250);
  assert.strictEqual(G.cash, 750);
  const rows = L.ledgerRows();
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].resource, 'cash');
  assert.strictEqual(rows[0].delta, -250);
  assert.strictEqual(rows[0].balanceAfter, 750);
  assert.strictEqual(rows[0].reason, 'gear_buy');
  assert.deepStrictEqual(rows[0].ref, { itemId: 'knife' });
});

test('pools are written through their `current`, and clamp to max', () => {
  const G = wallet();
  const applied = L.credit('moves', 99, L.REASON.REGEN);
  assert.strictEqual(applied, 5, 'only the room that existed');
  assert.strictEqual(G.moves.current, 10);
  assert.strictEqual(L.ledgerRows()[0].balanceAfter, 10);
});

test('cash cannot go negative', () => {
  const G = wallet({ cash: 100 });
  const applied = L.debit('cash', 500, L.REASON.GEAR_BUY);
  assert.strictEqual(applied, -100);
  assert.strictEqual(G.cash, 0);
});

test('clout cannot be debited, at all', () => {
  // It is progression, not a currency. Nothing in the game may take it back, and
  // a bug that tries should be loud rather than quietly rewriting a player's level.
  wallet();
  assert.throws(() => L.debit('clout', 10, L.REASON.ADMIN_ADJUST), /clout cannot be debited/);
  assert.throws(() => L.applyDelta('clout', -1, L.REASON.ADMIN_ADJUST), /clout cannot be debited/);
});

test('an unknown resource or reason code throws', () => {
  wallet();
  assert.throws(() => L.credit('gems', 5, L.REASON.IAP_GRANT), /unknown resource/);
  assert.throws(() => L.credit('cash', 5, 'free_money'), /unknown reason code/);
});

test('every reason code in the enum is a usable string', () => {
  wallet();
  L.REASON_CODES.forEach(code => {
    assert.strictEqual(typeof code, 'string');
    assert.doesNotThrow(() => L.credit('cash', 1, code), code);
  });
});

test('an idempotency key applies once, however many times it is replayed', () => {
  const G = wallet();
  const key = 'fight:abc123';
  L.debit('cash', 100, L.REASON.FIGHT_DEFEAT_LOSS, { idem: key });
  const second = L.debit('cash', 100, L.REASON.FIGHT_DEFEAT_LOSS, { idem: key });
  const third  = L.debit('cash', 100, L.REASON.FIGHT_DEFEAT_LOSS, { idem: key });
  assert.strictEqual(second, 0);
  assert.strictEqual(third, 0);
  assert.strictEqual(G.cash, 900, 'debited once, not three times');
  assert.strictEqual(L.ledgerRows().length, 1, 'and only one row');
});

test('a no-op writes no row at all', () => {
  const G = wallet({ moves: { current: 10, max: 10, lastTick: 0 } });
  assert.strictEqual(L.credit('moves', 5, L.REASON.REGEN), 0, 'fully clamped');
  assert.strictEqual(L.credit('moves', 0, L.REASON.LEVEL_UP_GRANT), 0, 'genuine zero');
  assert.strictEqual(L.ledgerRows().length, 0, 'nothing moved, so nothing to record');
  // "refill a pool that is already full" fires on every level-up and would
  // otherwise write a zero row for each pool that happened to be topped up.
});

test('the buffer is bounded and drops the oldest rows', () => {
  wallet({ cash: 0 });
  for (let i = 0; i < L.LEDGER_MAX_ROWS + 50; i++) L.credit('cash', 1, L.REASON.MOVE_PAYOUT);
  const rows = L.ledgerRows();
  assert.strictEqual(rows.length, L.LEDGER_MAX_ROWS);
  assert.strictEqual(rows[rows.length - 1].balanceAfter, L.LEDGER_MAX_ROWS + 50);
  assert.ok(rows[0].id > 1, 'oldest rows were dropped, not the newest');
});

test('the summary separates faucets from drains, per resource and per reason', () => {
  wallet({ cash: 0 });
  L.credit('cash', 300, L.REASON.MOVE_PAYOUT);
  L.credit('cash', 200, L.REASON.SPOT_COLLECT);
  L.debit('cash', 120, L.REASON.GEAR_BUY);
  const s = L.ledgerSummary('cash').cash;
  assert.strictEqual(s.credits, 500);
  assert.strictEqual(s.debits, 120);
  assert.strictEqual(s.net, 380);
  assert.strictEqual(s.byReason.move_payout, 300);
  assert.strictEqual(s.byReason.gear_buy, -120);
  assert.strictEqual(global.G.cash, 380, 'and the summary agrees with the wallet');
});
