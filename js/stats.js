// ─────────────────────────────────────────────
//  STATS TAB
// ─────────────────────────────────────────────

function renderStats() {
  const grid = $('stat-grid');
  const rank = rankForLevel(G.level);
  const stats = [
    ['RANK', rank],
    ['LEVEL', G.level],
    ['CLOUT', G.clout.toLocaleString()],
    ['ATTACK', G.attack],
    ['DEFENSE', G.defense],
    ['CASH', '$' + G.cash.toLocaleString()],
    ['INCOME/COLLECT', '$' + collectIncome()],
    ['JOBS DONE', Object.values(G.jobProgress).reduce((a, b) => a + b, 0)],
  ];
  grid.innerHTML = stats.map(([l, v]) => `
    <div class="stat-row"><span class="label">${l}</span><span class="val">${v}</span></div>
  `).join('');

  const inv = $('inventory-list');
  if (G.inventory.length === 0) {
    inv.innerHTML = '<span class="card-note">No gear yet. Visit the Plug.</span>';
  } else {
    inv.innerHTML = G.inventory.map(id => {
      const item = STORE_ITEMS.find(i => i.id === id);
      return item ? `<div class="gear-chip">${item.name}</div>` : '';
    }).join('');
  }
}
