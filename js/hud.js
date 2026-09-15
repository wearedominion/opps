// ─────────────────────────────────────────────
//  HUD
// ─────────────────────────────────────────────

// What a collect is worth RIGHT NOW — accrued since the last collect, clamped
// by the level-gated offline cap (DOM-74). Every display of "income ready"
// (HUD, stats, notifications) reads this one number.
function collectIncome() {
  return Math.floor(spotsAccruedTotal(Date.now()));
}

function updateHUD() {
  const set = (id, val) => { const el = $(id); if (el) el.textContent = val; };
  const bar = (id, pct) => { const el = $(id); if (el) el.style.width = Math.max(0, Math.min(100, pct)) + '%'; };

  const rank = rankForLevel(G.level);

  // header clout cluster — CLOUT value, rank title, 4px XP mini-bar
  set('h-clout', G.clout.toLocaleString());
  set('h-rank', rank);

  // level chip on the header's Profile entry (DOM-145) — the only place the
  // raw level number shows outside the metrics panel
  set('h-profile-lv', G.level);

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
  bar('h-xp-mini', cp.pct);

  set('moves-label', G.moves.current + ' / ' + G.moves.max);
  bar('moves-bar', (G.moves.current / G.moves.max) * 100);

  set('health-label', G.health.current + ' / ' + G.health.max);
  bar('health-bar', (G.health.current / G.health.max) * 100);

  set('collect-income', '$' + collectIncome());
}
