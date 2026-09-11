// ─────────────────────────────────────────────
//  PAYMENTS
// ─────────────────────────────────────────────

// Update VERIFY_URL to your deployed server URL before going live
const VERIFY_URL = 'http://localhost:3000/api/verify-purchase';

const GEM_PACKS = [
  { sku: 'gems_100',  gems: 100,  label: '100',   mockPrice: '$0.99' },
  { sku: 'gems_500',  gems: 550,  label: '550',   mockPrice: '$3.99', badge: 'POPULAR' },
  { sku: 'gems_1200', gems: 1400, label: '1,400', mockPrice: '$7.99' },
  { sku: 'gems_2500', gems: 3000, label: '3,000', mockPrice: '$14.99', badge: 'BEST VALUE' },
];

const GEM_SPENDS = [
  {
    id: 'energy',
    cost: 50,
    label: 'Refill Moves',
    action() { G.energy = G.maxEnergy; },
  },
  {
    id: 'health',
    cost: 75,
    label: 'Full Heal',
    action() { G.health = G.maxHealth; },
  },
];

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

    const pack = GEM_PACKS.find(p => p.sku === sku);
    if (pack) {
      G.gems = (G.gems || 0) + pack.gems;
      log(`Purchased ${pack.label} gems — balance: ${G.gems}`, 'gold');
      toast(`+${pack.gems} gems added!`);
      updateHUD();
      GameState.save();
      renderGemSection();
    }

    try {
      await JestSDK.payments.completePurchase({ purchaseToken });
    } catch (e) {
      console.warn('completePurchase failed:', e);
    }
  },

  spendGems(spendId) {
    const spend = GEM_SPENDS.find(s => s.id === spendId);
    if (!spend) return;
    if ((G.gems || 0) < spend.cost) { toast(`Need ${spend.cost} gems for that.`, true); return; }
    G.gems -= spend.cost;
    spend.action();
    log(`Spent ${spend.cost} gems — ${spend.label}`, 'info');
    toast(`${spend.label} done!`);
    updateHUD();
    GameState.save();
    renderGemSection();
  },

  // Returns display price: official from Jest if available, mock otherwise
  getPrice(sku) {
    const official = this._products.find(p => p.sku === sku);
    if (official) return `${official.price} ${official.currency}`;
    return GEM_PACKS.find(p => p.sku === sku)?.mockPrice ?? '—';
  },
};

function renderGemSection() {
  const el = $('gem-section');
  if (!el) return;

  const balance = G.gems || 0;

  el.innerHTML = `
    <div class="card">
      <div class="card-title">GEM PACKS — LOAD UP</div>
      <div class="gem-grid">
        ${GEM_PACKS.map(pack => `
          <div class="gem-card${pack.badge ? ' gem-featured' : ''}">
            ${pack.badge ? `<div class="gem-badge">${pack.badge}</div>` : ''}
            <div class="gem-amount">${pack.label} <span class="gem-unit">GEMS</span></div>
            <div class="gem-price">${Payments.getPrice(pack.sku)}</div>
            <button class="buy-btn" onclick="Payments.buy('${pack.sku}')">BUY</button>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="card">
      <div class="card-title">
        SPEND GEMS
        <span class="gem-balance-inline">${balance} GEMS</span>
      </div>
      <div class="gem-spend-grid">
        ${GEM_SPENDS.map(s => {
          const canAfford = balance >= s.cost;
          return `
            <div class="gem-spend-card${canAfford ? '' : ' gem-spend-locked'}">
              <div class="gem-spend-label">${s.label}</div>
              <div class="gem-spend-cost">${s.cost} GEMS</div>
              <button class="buy-btn" onclick="Payments.spendGems('${s.id}')" ${canAfford ? '' : 'disabled'}>USE</button>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}
