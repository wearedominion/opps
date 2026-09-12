// ─────────────────────────────────────────────
//  STORE
// ─────────────────────────────────────────────

function renderStore() {
  const container = $('store-list');
  container.innerHTML = '';
  STORE_ITEMS.forEach(item => {
    const owned = ownsGear(item.id);
    const locked = G.level < (item.levelReq || 1);
    const canAfford = G.cash >= item.price;
    const div = document.createElement('div');
    div.className = 'store-item';
    div.innerHTML = `
      <div class="item-name">${item.name}</div>
      <div class="item-desc">${item.desc}</div>
      <div class="item-price">$${item.price.toLocaleString()}</div>
      <button class="buy-btn" onclick="buyItem('${item.id}')" ${owned || locked || !canAfford ? 'disabled' : ''}>
        ${owned ? '✓ EQUIPPED' : locked ? 'LEVEL ' + item.levelReq : canAfford ? 'BUY' : 'BROKE'}
      </button>
    `;
    container.appendChild(div);
  });
}

function buyItem(itemId) {
  const item = STORE_ITEMS.find(i => i.id === itemId);
  if (!item) return;
  if (G.level < (item.levelReq || 1)) { toast('Locked until level ' + item.levelReq + '!', true); return; }
  if (G.cash < item.price) { toast("You're broke for that!", true); return; }
  if (ownsGear(itemId)) { toast('Already equipped!', true); return; }
  debit('cash', item.price, REASON.GEAR_BUY, { ref: { itemId: item.id } });
  grantGear(itemId);
  G.attack += item.atk || 0;
  G.defense += item.def || 0;
  if (item.hp) {
    G.health.max += item.hp;
    credit('health', item.hp, REASON.GEAR_BUY, { ref: { itemId: item.id } });
  }
  log(`Bought ${item.name} — ${item.desc}`, 'info');
  toast(`${item.name} equipped!`);
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

  // Stats are banked incrementally, same as purchases: each level up to the
  // hard cap adds the global per-level gain. Levels past the cap cost Cash
  // and grant nothing but display — the prestige track.
  const cap = tune('gear.statCapLevel');
  if (inst.level <= cap) {
    const gain = tune('gear.statGainPerLevel');
    G.attack += gain.attack;
    G.defense += gain.defense;
    if (gain.hpBonus) {
      G.health.max += gain.hpBonus;
      credit('health', gain.hpBonus, REASON.GEAR_UPGRADE, { ref: { itemId: itemId } });
    }
    log(`Upgraded ${item.name} to LV ${inst.level}`, 'win');
  } else {
    log(`Upgraded ${item.name} to LV ${inst.level} — prestige`, 'win');
  }
  toast(`${item.name} LV ${inst.level}!`);
  updateHUD();
  renderStats();
  GameState.save();
}
