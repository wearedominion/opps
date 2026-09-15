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
    // A health SKU bought while hospitalized is never "nothing to grant":
    // the discharge is the value even at full health (DOM-93 — the catalogue
    // copy promises "you walk out now", so full health must not refuse it).
    const product = IAP_PRODUCTS.find(p => p.sku === sku);
    const fx = product && product.effect;
    const hospitalExit = fx && fx.pool === 'health'
        && typeof isHospitalized === 'function' && isHospitalized();
    if (fx && !hospitalExit && (fx.type === 'refillPool' || fx.type === 'grantPool')
        && G[fx.pool] && G[fx.pool].current >= G[fx.pool].max) {
      toast('Already full — nothing to grant.', true);
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
      const wasHospitalized = typeof isHospitalized === 'function' && isHospitalized();
      const applied = this._applyEffect(product);
      log(`Purchased ${product.name}`, 'gold');
      // Don't claim a grant that clamped to nothing (pool filled during the
      // verify round-trip, or a recovered purchase re-applied after the fact).
      // A Hospital discharge counts as a real grant even when the health
      // credit clamped to zero (DOM-93 — walking out is what was bought).
      const discharged = wasHospitalized
        && !(typeof isHospitalized === 'function' && isHospitalized());
      if (applied > 0 || discharged) toast(product.name + ' applied!');
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
  //
  // Effect shapes (data/monetization.json):
  //   refillPool {pool}          — top the pool to max. Health only in v1: the
  //                                Hospital heal is the one SKU whose value is
  //                                the wait it skips, not the actions it buys.
  //   grantPool  {pool, amount}  — fixed points, clamped at max. Ratified
  //                                2026-09-12 (Jake) for Stamina after the sim
  //                                showed a full refill scales with the pool
  //                                (60-cap refresh ≈ 33.6h of top-job income
  //                                in fight EV); extended to Moves for the
  //                                same reason (cap 200). 09 §12.
  _applyEffect(product) {
    const fx = product.effect || {};
    const pool = G[fx.pool];
    if ((fx.type === 'refillPool' || fx.type === 'grantPool') && pool) {
      // A paid health grant is also the Hospital's premium exit: leaving the
      // player "healed" but locked out would make the SKU a lie. Same
      // discharge the Cash early-out performs (hospital.js).
      if (fx.pool === 'health' && typeof isHospitalized === 'function' && isHospitalized()) {
        G.hospitalizedUntil = null;
        log('Walked out of the Hospital — premium heal', 'gold');
        if (typeof renderHospital === 'function') renderHospital();
      }
      const amount = fx.type === 'grantPool' ? fx.amount : pool.max - pool.current;
      return credit(fx.pool, amount, REASON.IAP_GRANT, { ref: { sku: product.sku } });
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

// ─────────────────────────────────────────────
//  OFFER SURFACING (DOM-76)
//
//  Conversion happens at the pain moment, not in a store tab. The three
//  moments: out of Stamina mid-session, out of Moves, sitting in the
//  Hospital. The first two raise a one-tap offer sheet the instant a gate
//  refuses; the Hospital's offer is a persistent button on the Hospital
//  card (hospital.js) — a popup on top of a 30-minute wait would just get
//  dismissed.
//
//  Throttled per pool (monetization.offerCooldownSeconds) so a player
//  hammering an empty button gets the plain toast, not a nag loop.
// ─────────────────────────────────────────────

const OFFER_SKU_BY_POOL = { stamina: 'boost_stamina', moves: 'boost_moves' };
const OFFER_TITLE_BY_POOL = { stamina: 'OUT OF STAMINA', moves: 'OUT OF MOVES' };
const _offerLastShown = {};

// Called from a refusal gate: always shows the refusal toast, and — cooldown
// permitting — raises the matching offer sheet over it.
function surfaceOffer(pool, refusalMsg) {
  toast(refusalMsg, true);
  const sku = OFFER_SKU_BY_POOL[pool];
  const product = sku && IAP_PRODUCTS.find(p => p.sku === sku);
  if (!product) return;
  const now = Date.now();
  const cooldownMs = tune('monetization.offerCooldownSeconds') * 1000;
  if (_offerLastShown[pool] && now - _offerLastShown[pool] < cooldownMs) return;
  _offerLastShown[pool] = now;
  $('offer-title').textContent = OFFER_TITLE_BY_POOL[pool];
  $('offer-desc').textContent = product.desc;
  const buyBtn = $('offer-buy-btn');
  buyBtn.textContent = product.name.toUpperCase() + ' · ' + Payments.getPrice(product.sku);
  buyBtn.onclick = () => { closeOffer(); Payments.buy(product.sku); };
  $('offer-overlay').classList.add('open');
}

function closeOffer() {
  $('offer-overlay').classList.remove('open');
}

// The IAP catalogue renders as rows in the Store's SUPPLIES tab now
// (DOM-116). renderIapSection() and its SKIP THE WAIT card are gone:
// they were a second place to buy a consumable, on a card the v0.2
// design has no slot for. renderStore() below is what refreshes them.
