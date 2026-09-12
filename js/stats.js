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
  const ownedIds = Object.keys(G.inventory);
  if (ownedIds.length === 0) {
    inv.innerHTML = '<span class="card-note">No gear yet. Visit the Plug.</span>';
  } else {
    const cap = tune('gear.statCapLevel');
    inv.innerHTML = ownedIds.map(id => {
      const item = STORE_ITEMS.find(i => i.id === id);
      if (!item) return '';
      const inst = gearInstance(id);
      // Levels past the stat cap are pure prestige (DOM-88) — label them so the
      // player knows the stats stopped and the number is the point.
      const lv = inst.level > 0
        ? ` <span class="gear-level">LV ${inst.level}${inst.level > cap ? ' · PRESTIGE' : ''}</span>`
        : '';
      const upgrade = item.upgradeable && tune('gear.upgradeEnabled')
        ? `<button class="gear-upgrade-btn" onclick="upgradeGear('${id}')"
             ${G.cash < gearUpgradeCost(item) ? 'disabled' : ''}>
             UPGRADE $${gearUpgradeCost(item).toLocaleString()}
           </button>`
        : '';
      return `<div class="gear-chip">${item.name}${lv}${upgrade}</div>`;
    }).join('');
  }
}
