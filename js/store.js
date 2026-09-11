// ─────────────────────────────────────────────
//  STORE
// ─────────────────────────────────────────────

function renderStore() {
  const container = $('store-list');
  container.innerHTML = '';
  STORE_ITEMS.forEach(item => {
    const owned = G.inventory.includes(item.id);
    const canAfford = G.cash >= item.price;
    const div = document.createElement('div');
    div.className = 'store-item';
    div.innerHTML = `
      <div class="item-name">${item.name}</div>
      <div class="item-desc">${item.desc}</div>
      <div class="item-price">$${item.price.toLocaleString()}</div>
      <button class="buy-btn" onclick="buyItem('${item.id}')" ${owned || !canAfford ? 'disabled' : ''}>
        ${owned ? '✓ EQUIPPED' : canAfford ? 'BUY' : 'BROKE'}
      </button>
    `;
    container.appendChild(div);
  });
}

function buyItem(itemId) {
  const item = STORE_ITEMS.find(i => i.id === itemId);
  if (!item) return;
  if (G.cash < item.price) { toast("You're broke for that!", true); return; }
  if (G.inventory.includes(itemId)) { toast('Already equipped!', true); return; }
  debit('cash', item.price, REASON.GEAR_BUY, { ref: { itemId: item.id } });
  G.inventory.push(itemId);
  G.attack += item.atk || 0;
  G.defense += item.def || 0;
  if (item.hpBonus) {
    G.health.max += item.hpBonus;
    credit('health', item.hpBonus, REASON.GEAR_BUY, { ref: { itemId: item.id } });
  }
  log(`Bought ${item.name} — ATK +${item.atk} DEF +${item.def}`, 'info');
  toast(`${item.name} equipped!`);
  updateHUD();
  renderStore();
  renderStats();
  GameState.save();
}
