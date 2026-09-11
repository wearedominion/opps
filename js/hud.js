// ─────────────────────────────────────────────
//  HUD
// ─────────────────────────────────────────────

function collectIncome() {
  let total = 0;
  PROPERTIES.forEach(p => {
    if (G.properties[p.id]) total += p.income * G.properties[p.id];
  });
  return total;
}

function updateHUD() {
  const set = (id, val) => { const el = $(id); if (el) el.textContent = val; };
  const bar = (id, pct) => { const el = $(id); if (el) el.style.width = Math.max(0, Math.min(100, pct)) + '%'; };

  const rank = (typeof RANK_NAMES !== 'undefined' && RANK_NAMES.length)
    ? RANK_NAMES[Math.min(G.level - 1, RANK_NAMES.length - 1)] : '';

  // header pills — rank and gems only; everything else is in the panel
  set('h-level', rank);
  set('h-gems', G.gems || 0);

  // metrics panel hero
  set('m-clout', G.xp.toLocaleString());
  set('m-level', G.level);
  set('m-rank', rank);

  // metrics panel rows
  set('h-money', '$' + G.money.toLocaleString());
  set('h-rep', G.rep);
  set('m-gems', G.gems || 0);
  set('h-energy', G.energy + '/' + G.maxEnergy);
  set('h-health', G.health + '/' + G.maxHealth);
  set('h-stamina', (G.stamina || 0) + ' / ' + (G.maxStamina || 0));

  set('xp-label', G.xp + ' / ' + G.xpNext);
  bar('xp-bar', (G.xp / G.xpNext) * 100);

  set('energy-label', G.energy + ' / ' + G.maxEnergy);
  bar('energy-bar', (G.energy / G.maxEnergy) * 100);

  set('health-label', G.health + ' / ' + G.maxHealth);
  bar('health-bar', (G.health / G.maxHealth) * 100);

  set('collect-income', '$' + collectIncome());
}
