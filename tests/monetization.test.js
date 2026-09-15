// V1 SKUs (DOM-76).
// Part of the suite; run it all with `node tests/run.js`.

const { fs, path, vm, assert, ROOT, TUNE, tune, G, test } = require('./harness');

console.log('\nMonetization — DOM-76 v1 SKUs');

const IAP_DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/monetization.json'), 'utf8'));

test('the catalog sells exactly the three v1 SKUs, fully specified', () => {
  assert.deepStrictEqual(IAP_DATA.map(p => p.sku).sort(),
    ['boost_moves', 'boost_stamina', 'full_heal']);
  IAP_DATA.forEach(p => {
    ['id', 'sku', 'name', 'desc', 'mockPrice', 'effect'].forEach(k =>
      assert.ok(k in p, p.id + ' missing ' + k));
    assert.ok(['grantPool', 'refillPool'].includes(p.effect.type), p.id + ' effect type');
  });
});

test('refreshes are fixed-point grants sized to the starting pool, not refills', () => {
  // Ratified 2026-09-12 (Jake): a refill-to-max scales with the skill-built
  // pool (stamina cap 60 ≈ 33.6h of top-job income in fight EV per $0.99) —
  // the grant is pinned instead. Extended to Moves for the same reason
  // (cap 200). Sim §Q1 owns the numbers.
  const st = IAP_DATA.find(p => p.sku === 'boost_stamina');
  assert.deepStrictEqual(st.effect,
    { type: 'grantPool', pool: 'stamina', amount: tune('start.stamina', TUNE) });
  const mv = IAP_DATA.find(p => p.sku === 'boost_moves');
  assert.deepStrictEqual(mv.effect,
    { type: 'grantPool', pool: 'moves', amount: tune('start.moves', TUNE) });
  const heal = IAP_DATA.find(p => p.sku === 'full_heal');
  assert.deepStrictEqual(heal.effect, { type: 'refillPool', pool: 'health' },
    'the heal is the one refill — its value is the wait it skips, not actions');
});

test('the offer cooldown is a knob, not a literal', () => {
  assert.ok(tune('monetization.offerCooldownSeconds', TUNE) > 0);
});

test('no gems identifier survives in the client (DOM-76 acceptance)', () => {
  const files = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js'))
    .map(f => 'js/' + f).concat(['index.html']);
  const banned = ['GEM_PACKS', 'GEM_SPENDS', 'renderGemSection', 'h-gems', 'gem-section', 'G.gems'];
  files.forEach(f => {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    banned.forEach(tok => assert.ok(!src.includes(tok), f + ' still carries ' + tok));
  });
});

// payments.js is a plain script — run it in a sandbox with the seams stubbed.
// _applyEffect can be driven directly; buy() runs against the stubbed Jest SDK
// and verify endpoint below (every purchase "succeeds" and verifies), so the
// pre-charge guard and grant plumbing are testable end to end.
function loadPayments(g) {
  let lastSku = null;
  const ctx = {
    console, Date, JSON, Object, Math,
    G: g,
    IAP_PRODUCTS: IAP_DATA,
    REASON: { IAP_GRANT: 'iap_grant' },
    tune: p => tune(p, TUNE),
    log: () => {}, updateHUD: () => {}, renderStore: () => {},
    renderHospital: () => {}, $: () => null,
    toast: (msg) => { ctx._toasts.push(msg); },
    isHospitalized: () => typeof g.hospitalizedUntil === 'number' && g.hospitalizedUntil > 0,
    credit: (pool, amt, reason, meta) => {
      ctx._rows.push({ pool, amt, reason, sku: meta && meta.ref && meta.ref.sku });
      const applied = Math.min(amt, g[pool].max - g[pool].current);
      g[pool].current += applied;
      return applied;
    },
    _rows: [],
    _toasts: [],
    _purchases: [],
    _completed: [],
    GameState: { save: () => {} },
    JestSDK: {
      payments: {
        beginPurchase: async ({ productSku }) => {
          lastSku = productSku;
          ctx._purchases.push(productSku);
          return { outcome: 'success', purchaseToken: 'tok', purchaseSigned: 'signed' };
        },
        completePurchase: async ({ purchaseToken }) => { ctx._completed.push(purchaseToken); },
      },
    },
    fetch: async () => ({ json: async () => ({ valid: true, sku: lastSku }) }),
  };
  ctx.globalThis = ctx;
  const src = fs.readFileSync(path.join(ROOT, 'js/payments.js'), 'utf8')
    + '\n;globalThis.__p = Payments;';
  vm.runInNewContext(src, ctx);
  return {
    Payments: ctx.__p, rows: ctx._rows, G: g,
    toasts: ctx._toasts, purchases: ctx._purchases, completed: ctx._completed,
  };
}

test('grantPool credits the fixed amount through the ledger as iap_grant', () => {
  const h = loadPayments({
    hospitalizedUntil: null,
    stamina: { current: 1, max: 10 },
  });
  const applied = h.Payments._applyEffect(IAP_DATA.find(p => p.sku === 'boost_stamina'));
  assert.strictEqual(applied, 3);
  assert.strictEqual(h.G.stamina.current, 4, 'grant is additive, not a refill');
  assert.deepStrictEqual(h.rows, [{ pool: 'stamina', amt: 3, reason: 'iap_grant', sku: 'boost_stamina' }]);
});

test('grantPool clamps at max and reports what actually landed', () => {
  const h = loadPayments({
    hospitalizedUntil: null,
    stamina: { current: 9, max: 10 },
  });
  const applied = h.Payments._applyEffect(IAP_DATA.find(p => p.sku === 'boost_stamina'));
  assert.strictEqual(applied, 1, 'only the headroom landed');
  assert.strictEqual(h.G.stamina.current, 10);
});

test('the premium heal discharges the Hospital, not just the health bar', () => {
  const h = loadPayments({
    hospitalizedUntil: Date.now() + 30 * 60 * 1000,
    health: { current: 0, max: 100 },
  });
  const applied = h.Payments._applyEffect(IAP_DATA.find(p => p.sku === 'full_heal'));
  assert.strictEqual(applied, 100);
  assert.strictEqual(h.G.hospitalizedUntil, null, 'still locked in the Hospital');
});

// DOM-93 flow 3: hospitalized at FULL health, the "already full" guard must
// not eat the discharge — walking out is what the SKU sells ("you walk out
// now"). Unreachable through gameplay today (regen pauses, rest is gated,
// gear hp credits raise max and current together, level-up clears the state
// before crediting), but one reorder away, so the guard is hospital-aware.
test('a hospitalized full heal at full health still buys the discharge', async () => {
  const h = loadPayments({
    hospitalizedUntil: Date.now() + 30 * 60 * 1000,
    health: { current: 100, max: 100 },
  });
  await h.Payments.buy('full_heal');
  assert.deepStrictEqual(h.purchases, ['full_heal'], 'guard refused before charging');
  assert.strictEqual(h.G.hospitalizedUntil, null, 'still locked in the Hospital');
  assert.deepStrictEqual(h.completed, ['tok'], 'purchase never completed');
  assert.ok(h.toasts.some(t => t === 'Full Heal applied!'),
    'success toast missing — got: ' + JSON.stringify(h.toasts));
  assert.ok(!h.toasts.some(t => t.includes('Already full')),
    'refused a purchase that had a discharge to grant');
});

test('a boost at a full pool still refuses before charging', async () => {
  const h = loadPayments({
    hospitalizedUntil: null,
    stamina: { current: 3, max: 3 },
  });
  await h.Payments.buy('boost_stamina');
  assert.deepStrictEqual(h.purchases, [], 'charged despite a full pool');
  assert.deepStrictEqual(h.rows, [], 'granted despite a full pool');
  assert.ok(h.toasts.some(t => t.includes('Already full')), 'refusal toast missing');
});

test('a healthy full heal at full health still refuses before charging', async () => {
  const h = loadPayments({
    hospitalizedUntil: null,
    health: { current: 100, max: 100 },
  });
  await h.Payments.buy('full_heal');
  assert.deepStrictEqual(h.purchases, [], 'charged despite full health and no Hospital');
  assert.ok(h.toasts.some(t => t.includes('Already full')), 'refusal toast missing');
});
