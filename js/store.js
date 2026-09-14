// ─────────────────────────────────────────────
//  STORE
// ─────────────────────────────────────────────

function renderStore() {
  const container = $('store-list');
  container.innerHTML = '';
  STORE_ITEMS.forEach(item => {
    // Drop-only rarities (blue+) never reach a store: rarity is the thing
    // Cash can't buy (DOM-18). They surface in the Profile gear tab instead.
    if (item.dropOnly) return;
    const owned = ownsGear(item.id);
    const locked = G.level < (item.levelReq || 1);
    const canAfford = G.cash >= item.price;
    const div = document.createElement('div');
    // Rarity shows as name ink + a 1px border tint (CLAUDE.md "Rarity") —
    // stores only ever carry COMMON/UNCOMMON, the drop tiers never render here.
    div.className = 'store-item rar-' + RARITY_LABELS[item.rarity];
    div.innerHTML = `
      <div class="item-name tier-${RARITY_LABELS[item.rarity]}">${item.name}</div>
      <div class="item-desc">${item.desc}</div>
      <div class="item-price">$${item.price.toLocaleString()}</div>
      <button class="buy-btn" onclick="buyItem('${item.id}')" ${owned || locked || !canAfford ? 'disabled' : ''}>
        ${owned ? 'OWNED' : locked ? 'LEVEL ' + item.levelReq : canAfford ? 'BUY' : 'BROKE'}
      </button>
    `;
    container.appendChild(div);
  });
}

function buyItem(itemId) {
  const item = STORE_ITEMS.find(i => i.id === itemId);
  if (!item) return;
  if (item.dropOnly) { toast('Not for sale. It drops or it doesn\'t.', true); return; }
  if (G.level < (item.levelReq || 1)) { toast('Locked until level ' + item.levelReq + '!', true); return; }
  if (G.cash < item.price) { toast("You're broke for that!", true); return; }
  if (ownsGear(itemId)) { toast('Already owned!', true); return; }
  debit('cash', item.price, REASON.GEAR_BUY, { ref: { itemId: item.id } });
  grantGear(itemId, 'bought');
  // Owning is not fielding (DOM-75): stats are never banked here — they derive
  // from the loadout. Fielding on purchase is a convenience when a slot is open.
  const fielded = autoFieldGear(itemId);
  log(`Bought ${item.name} — ${item.desc}`, 'info');
  toast(fielded ? `${item.name} — fielded!` : `${item.name} — in the stash. Slots full.`);
  updateHUD();
  renderStore();
  renderStats();
  GameState.save();
}

// ─────────────────────────────────────────────
//  GEAR UPGRADES (DOM-88 — the recurring Cash sink, DOM-79 layer 2)
// ─────────────────────────────────────────────

// Cost to take an owned item from its current level to the next. The curve is
// global and scales by the item's own price (tuning.gear.upgradeCost); curves
// are 1-indexed, so the first upgrade (level 0 -> 1) evaluates at n = 1.
function gearUpgradeCost(item) {
  const inst = gearInstance(item.id);
  const level = inst ? inst.level : 0;
  return tuneCurve('gear.upgradeCost', level + 1, item.price);
}

function upgradeGear(itemId) {
  if (!tune('gear.upgradeEnabled')) { toast('Upgrades are shut down.', true); return; }
  const item = STORE_ITEMS.find(i => i.id === itemId);
  const inst = gearInstance(itemId);
  if (!item || !inst) return;
  if (!item.upgradeable) { toast("Can't upgrade that.", true); return; }
  const maxLevel = tune('gear.maxUpgradeLevel');
  if (maxLevel !== null && inst.level >= maxLevel) { toast('Fully upgraded!', true); return; }
  const cost = gearUpgradeCost(item);
  if (G.cash < cost) { toast("You're broke for that!", true); return; }

  debit('cash', cost, REASON.GEAR_UPGRADE, { ref: { itemId: itemId, level: inst.level + 1 } });
  inst.level += 1;

  // Nothing is banked (DOM-75): levels up to the stat cap raise the item's
  // DERIVED contribution while it is fielded (gearItemStats); levels past the
  // cap cost Cash and grant nothing but display — the prestige track.
  const cap = tune('gear.statCapLevel');
  log(`Upgraded ${item.name} to LV ${inst.level}` + (inst.level <= cap ? '' : ' — prestige'), 'win');
  toast(`${item.name} LV ${inst.level}!`);
  updateHUD();
  renderStats();
  GameState.save();
}
