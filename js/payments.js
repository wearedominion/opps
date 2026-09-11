// ─────────────────────────────────────────────
//  PAYMENTS
//
//  v1 sells Stamina/Moves refreshes and heals DIRECTLY — there is no hard
//  currency (docs/oppsDefinitions.md, Monetization). The gem pack / gem spend
//  catalogue that used to live here was removed with the `gems` balance.
//
//  The GameState/payments seam is deliberately intact so a hard currency can be
//  reintroduced later without reopening this module: purchases still verify
//  server-side before anything is granted, and grants still route through one
//  function.
//
//  The catalogue is data (data/monetization.json), per 04-game-data-spec §6.
//  STILL OUTSTANDING from that section: the server must mirror SKU -> grant as
//  the authoritative source and must never trust the client, and the move needs
//  a TDD. Today server/index.js only verifies the receipt signature.
// ─────────────────────────────────────────────

// Update VERIFY_URL to your deployed server URL before going live
const VERIFY_URL = 'http://localhost:3000/api/verify-purchase';

const Payments = {
  _products: [], // official product list from Jest

  async init() {
    if (typeof JestSDK === 'undefined') return;
    try {
      this._products = await JestSDK.payments.getProducts();
    } catch (e) {
      console.warn('Payments.init: getProducts failed:', e);
    }
    await this._recoverIncomplete();
  },

  // Re-grant and complete any purchases that were interrupted (crash, disconnect)
  async _recoverIncomplete() {
    try {
      const { purchases } = await JestSDK.payments.getIncompletePurchases();
      for (const p of purchases) {
        await this._grantAndComplete(p.productSku, p.purchaseToken, p.purchaseSigned);
      }
    } catch (e) {
      console.warn('Payments._recoverIncomplete failed:', e);
    }
  },

  async buy(sku) {
    if (typeof JestSDK === 'undefined') {
      toast('Purchases require the Jest platform.', true);
      return;
    }
    // Refuse before charging when the effect can't grant anything — the removed
    // gem flow pre-checked too. A pool can still fill during the verify
    // round-trip; _grantAndComplete reports that case honestly.
    const product = IAP_PRODUCTS.find(p => p.sku === sku);
    const fx = product && product.effect;
    if (fx && fx.type === 'refillPool' && G[fx.pool] && G[fx.pool].current >= G[fx.pool].max) {
      toast('Already full — nothing to refill.', true);
      return;
    }
    let result;
    try {
      result = await JestSDK.payments.beginPurchase({ productSku: sku });
    } catch (e) {
      toast('Purchase failed. Try again.', true);
      return;
    }
    if (result.outcome === 'cancel') return;
    if (result.outcome === 'error') { toast('Purchase error. Try again.', true); return; }
    await this._grantAndComplete(sku, result.purchaseToken, result.purchaseSigned);
  },

  async _grantAndComplete(sku, purchaseToken, purchaseSigned) {
    // Verify server-side before granting — prevents client-side spoofing
    let data;
    try {
      const resp = await fetch(VERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purchaseSigned }),
      });
      data = await resp.json();
    } catch (e) {
      toast('Could not verify purchase. Try again later.', true);
      return;
    }

    if (!data.valid || data.sku !== sku) {
      toast('Purchase verification failed.', true);
      return;
    }

    const product = IAP_PRODUCTS.find(p => p.sku === sku);
    if (product) {
      const applied = this._applyEffect(product);
      log(`Purchased ${product.name}`, 'gold');
      // Don't claim a grant that clamped to nothing (pool filled during the
      // verify round-trip, or a recovered purchase re-applied after the fact).
      if (applied > 0) toast(product.name + ' applied!');
      else toast(product.name + ': already full, nothing granted.', true);
      updateHUD();
      GameState.save();
      renderStore();
    } else {
      // Verified a SKU this build has no catalogue entry for. Complete the
      // purchase anyway so the platform does not retry it forever, but say so.
      console.warn('Verified purchase for unknown SKU:', sku);
    }

    try {
      await JestSDK.payments.completePurchase({ purchaseToken });
    } catch (e) {
      console.warn('completePurchase failed:', e);
    }
  },

  // Returns the amount actually granted (0 when the effect clamped to nothing).
  _applyEffect(product) {
    const fx = product.effect || {};
    if (fx.type === 'refillPool' && G[fx.pool]) {
      return credit(fx.pool, G[fx.pool].max - G[fx.pool].current, REASON.IAP_GRANT,
             { ref: { sku: product.sku } });
    }
    console.warn('Unknown purchase effect:', fx);
    return 0;
  },

  // Returns display price: official from Jest if available, mock otherwise
  getPrice(sku) {
    const official = this._products.find(p => p.sku === sku);
    if (official) return `${official.price} ${official.currency}`;
    return IAP_PRODUCTS.find(p => p.sku === sku)?.mockPrice ?? '—';
  },
};

function renderIapSection() {
  const el = $('iap-section');
  if (!el) return;
  if (!IAP_PRODUCTS.length) { el.innerHTML = ''; return; }

  el.innerHTML = `
    <div class="card">
      <div class="card-title">SKIP THE WAIT</div>
      <div class="iap-grid">
        ${IAP_PRODUCTS.map(p => `
          <div class="iap-card${p.badge ? ' iap-featured' : ''}">
            ${p.badge ? `<div class="iap-badge">${p.badge}</div>` : ''}
            <div class="iap-name">${p.name}</div>
            <div class="iap-desc">${p.desc}</div>
            <div class="iap-price">${Payments.getPrice(p.sku)}</div>
            <button class="buy-btn" onclick="Payments.buy('${p.sku}')">BUY</button>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}
