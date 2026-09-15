// ─────────────────────────────────────────────
//  PROGRESSION — Clout → level
//
//  Clout is CUMULATIVE and monotonic: it is a lifetime total that is never
//  spent and never decremented. Level is DERIVED from it against the table in
//  data/progression.json — it is a cache, not a source of truth.
//
//  That derivation is the point. Retuning the curve reprices every level for
//  every player on their next load, with no migration. The previous design
//  decremented a remainder (G.xp -= G.xpNext), which froze each player at
//  whatever level the curve happened to give them the day they earned it.
//
//  Consequence, deliberate: if the table is ever retuned UPWARD, a player's
//  derived level can go DOWN on reload. Retune with that in mind.
//
//  Pure functions, table injected, so they are testable without a DOM.
//  See docs/specs/08-economy-schema.md §3.
// ─────────────────────────────────────────────

// Total Clout required to have REACHED a given level (level 1 = 0).
function cloutToReach(level, table) {
  const rows = table || (typeof PROGRESSION !== 'undefined' ? PROGRESSION : null);
  if (!rows || !rows.length) return 0;
  let acc = 0;
  for (let i = 0; i < rows.length && rows[i].level < level; i++) {
    if (rows[i].cloutToNext === null) break;   // level cap: nothing further to clear
    acc += rows[i].cloutToNext;
  }
  return acc;
}

// Level for a lifetime Clout total. Clamps at the table's last row.
function levelFromClout(clout, table) {
  const rows = table || (typeof PROGRESSION !== 'undefined' ? PROGRESSION : null);
  // No table (fetch failed, or called before boot): report level 1 rather than
  // inventing a curve. Callers must not overwrite a saved level with this.
  if (!rows || !rows.length) return 1;
  const total = Math.max(0, clout || 0);
  let acc = 0;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].cloutToNext === null) return rows[i].level;   // cap
    if (total < acc + rows[i].cloutToNext) return rows[i].level;
    acc += rows[i].cloutToNext;
  }
  return rows[rows.length - 1].level;
}

// Progress within the current level — everything the HUD and Profile need.
// `need` is 0 and `pct` 100 at the level cap.
function cloutProgress(clout, table) {
  const rows = table || (typeof PROGRESSION !== 'undefined' ? PROGRESSION : null);
  const total = Math.max(0, clout || 0);
  const level = levelFromClout(total, rows);
  const row = rows && rows.length ? rows[level - 1] : null;
  const need = row && row.cloutToNext !== null ? row.cloutToNext : 0;
  const into = need ? total - cloutToReach(level, rows) : 0;
  return {
    level: level,
    into: into,
    need: need,
    toNext: need ? need - into : 0,
    pct: need ? Math.max(0, Math.min(100, (into / need) * 100)) : 100,
    atCap: !need,
  };
}

// Rank title for a level. The list is SPREAD across the level cap: 100 titles
// over 120 levels gives each title one or two levels, and level 1 and level 120
// always land on the first and last title. That replaces the old fixed-width
// bands (10 names × 10 levels), which could only cover the list by leaving the
// top name as a 20-level plateau (DOM-124, Jake's option (a) — "the 100 rank
// titles remapped across the existing 120 levels").
//
// `names` is ordered and positional: ranks.json index 0 is the first title. Do
// not reorder it, and note that changing the cap or the length of the list
// retitles every existing player — it is flavour, not a grant, so nothing is
// lost, but it is visible.
function rankForLevel(level, names, maxLevel) {
  const list = names || (typeof RANK_NAMES !== 'undefined' ? RANK_NAMES : null);
  if (!list || !list.length) return '';
  const cap = maxLevel
    || (typeof TUNING !== 'undefined' && TUNING && TUNING.progression
        && TUNING.progression.maxLevel)
    || list.length;
  const idx = Math.floor((Math.max(1, level || 1) - 1) * list.length / Math.max(1, cap));
  return list[Math.min(Math.max(0, idx), list.length - 1)];
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { cloutToReach, levelFromClout, cloutProgress, rankForLevel };
}
