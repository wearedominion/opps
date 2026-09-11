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

  const rank = rankForLevel(G.level);

  // header pill — rank only; everything else is in the panel
  set('h-level', rank);

  // metrics panel hero
  set('m-clout', G.clout.toLocaleString());
  set('m-level', G.level);
  set('m-rank', rank);

  // metrics panel rows
  set('h-cash', '$' + G.cash.toLocaleString());
  set('h-moves', G.moves.current + '/' + G.moves.max);
  set('h-health', G.health.current + '/' + G.health.max);
  set('h-stamina', G.stamina.current + ' / ' + G.stamina.max);

  const cp = cloutProgress(G.clout);
  set('xp-label', cp.atCap ? 'MAX' : cp.into.toLocaleString() + ' / ' + cp.need.toLocaleString());
  bar('xp-bar', cp.pct);

  set('moves-label', G.moves.current + ' / ' + G.moves.max);
  bar('moves-bar', (G.moves.current / G.moves.max) * 100);

  set('health-label', G.health.current + ' / ' + G.health.max);
  bar('health-bar', (G.health.current / G.health.max) * 100);

  set('collect-income', '$' + collectIncome());
}
