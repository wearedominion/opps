// ─────────────────────────────────────────────
//  TRANSACTION LEDGER
//
//  Every balance change in the game goes through applyDelta(). Nothing writes
//  G.cash, G.clout, G.skillPts or a pool's `current` directly any more — that
//  single funnel is what makes support, refunds and faucet/drain dashboards
//  possible later rather than impossible, and it is the only way to know whether
//  the economy actually balances.
//
//  SESSION-ONLY. Rows live in memory and are gone on reload. The Jest Player
//  store is capped at 1 MB for the whole save and a ledger grows without bound,
//  so persisting it needs a trim policy that has not been designed. Telemetry
//  (DOM-78) is where rows should go to survive; until then this serves live
//  inspection and the in-session summary.
//
//  NOT AN ANTI-CHEAT MECHANISM. Combat settles against snapshots, so there is no
//  cross-player write and no server adjudicating anything — a client-side ledger
//  records what this client did, which is useful and is not the same as proof.
//  See docs/specs/08-economy-schema.md §4 and §8.
// ─────────────────────────────────────────────

// Locked enum, mirroring 08-economy-schema.md §4.1. ADDING a code is safe;
// RENAMING one invalidates every dashboard built on it, so treat these as
// permanent keys in the same way as content ids.
//
// Convention: the REASON names the event, the RESOURCE names what moved. One
// completed Move writes `move_payout` twice — once for cash, once for clout.
const REASON = Object.freeze({
  STARTING_GRANT:    'starting_grant',
  MOVE_PAYOUT:       'move_payout',
  MOVE_COST:         'move_cost',
  SPOT_COLLECT:      'spot_collect',
  SPOT_BUY:          'spot_buy',
  LAUNDER_PAYOUT:    'launder_payout',
  REST_HEAL:         'rest_heal',
  FIGHT_REWARD:      'fight_reward',
  FIGHT_DEFEAT_LOSS: 'fight_defeat_loss',
  FIGHT_COST:        'fight_cost',
  COMBAT_DAMAGE:     'combat_damage',
  REGEN:             'regen',
  LEVEL_UP_GRANT:    'level_up_grant',
  RECRUIT_BONUS:     'recruit_bonus',
  IAP_GRANT:         'iap_grant',
  QUEST_REWARD:      'quest_reward',
  OBJECTIVE_CLEARED: 'objective_cleared',
  DAILY_GOAL:        'daily_goal',
  PLUG_RECRUIT:      'plug_recruit',
  GEAR_BUY:          'gear_buy',
  GEAR_UPGRADE:      'gear_upgrade',
  REROLL_FEE:        'reroll_fee',
  HEAL_COST:         'heal_cost',
  HOSPITAL_HEAL:     'hospital_heal',
  RESPEC_COST:       'respec_cost',
  SKILL_ALLOC:       'skill_alloc',
  ADMIN_ADJUST:      'admin_adjust',
});
const REASON_CODES = Object.freeze(Object.keys(REASON).map(k => REASON[k]));

// Pools are {current, max}; everything else is a flat number on G.
const LEDGER_POOLS = ['moves', 'stamina', 'health'];
const LEDGER_FLAT  = ['cash', 'clout', 'skillPts'];

// Cash you worked for, as opposed to cash you were handed. Drives the Daily
// Grind meter on MAKE MOVES; deliberately excludes STARTING_GRANT and
// IAP_GRANT so neither a fresh save nor a purchase completes the daily.
const EARNED_CASH_REASONS = Object.freeze([
  REASON.MOVE_PAYOUT, REASON.FIGHT_REWARD, REASON.QUEST_REWARD,
  REASON.SPOT_COLLECT, REASON.LAUNDER_PAYOUT,
]);

const LEDGER_MAX_ROWS = 500;   // ring buffer; oldest dropped first
let _ledger = [];
let _seenKeys = Object.create(null);
let _seq = 0;

function ledgerRows()  { return _ledger.slice(); }
function ledgerClear() { _ledger = []; _seenKeys = Object.create(null); _seq = 0; }

function _read(resource) {
  if (LEDGER_POOLS.indexOf(resource) !== -1) return G[resource].current;
  return G[resource] || 0;
}

function _write(resource, value) {
  if (LEDGER_POOLS.indexOf(resource) !== -1) G[resource].current = value;
  else G[resource] = value;
}

// Clamp a proposed balance to what the resource allows.
function _clamp(resource, value) {
  if (LEDGER_POOLS.indexOf(resource) !== -1) return Math.max(0, Math.min(G[resource].max, value));
  return Math.max(0, value);
}

// THE funnel. Returns the delta actually applied, which may be smaller than
// requested once clamping is done — callers that care (a purchase, a fee) must
// check rather than assume.
function applyDelta(resource, delta, reason, ref) {
  if (LEDGER_POOLS.indexOf(resource) === -1 && LEDGER_FLAT.indexOf(resource) === -1) {
    throw new Error('ledger: unknown resource "' + resource + '"');
  }
  if (REASON_CODES.indexOf(reason) === -1) {
    throw new Error('ledger: unknown reason code "' + reason + '"');
  }
  // Clout is monotonic by design — it is progression, not a currency, and
  // nothing in the game may take it back.
  if (resource === 'clout' && delta < 0) {
    throw new Error('ledger: clout cannot be debited (attempted ' + delta + ' for ' + reason + ')');
  }

  const opts = ref || {};
  // Idempotency is session-scoped and exists to stop a double-tap or a double
  // render applying the same action twice. With no server there are no network
  // retries to deduplicate, so this is deliberately narrow.
  if (opts.idem) {
    if (_seenKeys[opts.idem]) return 0;
    _seenKeys[opts.idem] = true;
  }

  const before = _read(resource);
  const after = _clamp(resource, before + delta);
  const applied = after - before;
  // No row for a no-op. Covers both a fully clamped change and a genuine zero —
  // "refill a pool that is already full" is the common one, and a ledger full of
  // zero-delta rows makes the real movements harder to find for no gain.
  if (applied === 0) return 0;
  _write(resource, after);

  _ledger.push({
    id: ++_seq,
    ts: Date.now(),
    resource: resource,
    delta: applied,
    balanceAfter: after,
    reason: reason,
    ref: opts.ref || null,
    idem: opts.idem || null,
  });
  if (_ledger.length > LEDGER_MAX_ROWS) _ledger.shift();

  // The Daily Grind counts money you EARNED today (DOM-115). The ledger is the
  // only place that sees every payout, so the tally is taken here rather than
  // at seven separate credit sites where one would inevitably be missed. The
  // starting grant and IAP top-ups are excluded: they are not earnings.
  if (resource === 'cash' && applied > 0 && EARNED_CASH_REASONS.indexOf(reason) !== -1
      && typeof mvNoteDailyCash === 'function') {
    mvNoteDailyCash(applied);
  }
  return applied;
}

function credit(resource, amount, reason, ref) {
  return applyDelta(resource, Math.abs(amount), reason, ref);
}
function debit(resource, amount, reason, ref) {
  return applyDelta(resource, -Math.abs(amount), reason, ref);
}

// Faucets vs drains per resource, for the in-session view and as the shape the
// telemetry dashboard wants. Money supply is credits minus debits — no netting,
// because snapshot combat means no row is a transfer between two wallets.
function ledgerSummary(resource) {
  const out = {};
  _ledger.forEach(row => {
    if (resource && row.resource !== resource) return;
    const r = out[row.resource] || (out[row.resource] = { credits: 0, debits: 0, net: 0, byReason: {} });
    if (row.delta > 0) r.credits += row.delta; else r.debits += -row.delta;
    r.net += row.delta;
    r.byReason[row.reason] = (r.byReason[row.reason] || 0) + row.delta;
  });
  return out;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    REASON, REASON_CODES, LEDGER_POOLS, LEDGER_FLAT, LEDGER_MAX_ROWS,
    applyDelta, credit, debit, ledgerRows, ledgerSummary, ledgerClear,
  };
}
