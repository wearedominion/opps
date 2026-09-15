// ─────────────────────────────────────────────
//  XP — what an action is worth (DOM-124)
//
//  There is no XP currency. Clout is the one currency and the thing levels are
//  derived from (js/progression.js); `data/xp-system.json` is a design spec that
//  was written against a different economy, and this file is the seam between
//  the two. Jake's ruling, 2026-09-15, option (a): keep one currency and the
//  repo's 1.10 curve, harvest the spec for content.
//
//  So the numbers in xp-system.json are treated as WEIGHTS — what one action is
//  worth relative to another — and `xpScale()` turns a weight into Clout.
//
//  ── The scale, and the open question ────────
//
//  A weight is denominated at level 1 and grown by the curve: an award is the
//  same fraction of a level at 120 as it is at 1. That is a choice, and it is
//  the one thing here DOM-67 should overrule if it disagrees — which is why it
//  is a single function with a single constant rather than numbers sprinkled
//  through the tables.
//
//  Why it cannot be a flat multiplier: the repo's grants are level-scaled
//  geometric (jobs pay 7 → 22,950 Clout, enemies 15 → 12,049) because the last
//  level alone costs 8.4M. The spec's tables are flat (opps 12 → 65 across its
//  whole roster) because its curve tops out at 2.2M lifetime, 41× cheaper. No
//  constant maps a flat table onto a geometric curve: it either over-pays the
//  early game or under-pays the late game by orders of magnitude.
//
//  ── What this file does NOT pay ─────────────
//
//  Two of the spec's categories describe actions the repo already prices, both
//  level-scaled and both calibrated by DOM-67:
//
//    * opps            — js/combat.js pays `enemy.reward.clout` on a win
//    * sideHustles     — js/jobs.js `doJob()` pays `job.clout`
//                        ("side hustles" in Make Moves ARE jobs.json; DOM-115
//                         re-skinned the job loop, it did not replace it)
//
//  Paying the spec table on top of those would double-pay; paying it instead of
//  them would overwrite a calibrated economy with a flat table. So the weights
//  are resolvable here — the resolvers exist and are tested, because the spec
//  is the spec — but nothing calls them to pay. XP_UNPAID says so out loud, and
//  a test pins that no call site pays them.
// ─────────────────────────────────────────────

// Weights are denominated at this level: scale(XP_SCALE_LEVEL) === 1.
const XP_SCALE_LEVEL = 1;

// Categories deliberately left to the existing, DOM-67-calibrated grants.
const XP_UNPAID = Object.freeze(['opps', 'missions.sideHustles']);

// Clout to clear a given level. At the cap the table stops pricing levels; keep
// paying at the last priced rate rather than collapsing to zero, because a
// capped player still earns Clout and still reads it on the HUD.
function xpCloutToNext(level, table) {
  const rows = table || (typeof PROGRESSION !== 'undefined' ? PROGRESSION : null);
  if (!rows || !rows.length) return 0;
  const idx = Math.min(Math.max(1, level || 1), rows.length) - 1;
  if (rows[idx] && rows[idx].cloutToNext !== null) return rows[idx].cloutToNext;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].cloutToNext !== null) return rows[i].cloutToNext;
  }
  return 0;
}

// How much a level-1 weight is worth at `level`.
function xpScale(level, table) {
  const base = xpCloutToNext(XP_SCALE_LEVEL, table);
  if (!base) return 1;                       // no table: pay the weight as-is
  return xpCloutToNext(level, table) / base;
}

// A weight, in Clout, for a player at `level`. Never rounds a real award to 0.
function xpToClout(weight, level, table) {
  if (!(weight > 0)) return 0;
  return Math.max(1, Math.round(weight * xpScale(level, table)));
}

// ── READING THE SPEC ────────────────────────
// Dotted lookup into actionXp. Returns null rather than throwing: a failed
// fetch must not take the game down mid-action. The loudness lives in the
// tests instead — XP_PATHS is every path the code below reads, and a test
// asserts each one resolves to a number in the shipped file.
const XP_PATHS = Object.freeze([
  'missions.mainStory.perObjective', 'missions.mainStory.completion.base',
  'missions.daily.dailyGrind', 'missions.daily.login',
  'missions.daily.streakBonusPerDay', 'missions.daily.streakBonusCap',
  'missions.sideHustles.base', 'missions.sideHustles.byKind.standard',
  'missions.sideHustles.byKind.timed', 'missions.sideHustles.byKind.multiTarget',
  'plugs.recruit', 'plugs.jobBase',
  'opps.base.Low', 'opps.base.Medium', 'opps.base.High',
  'opps.perThreat.Low', 'opps.perThreat.Medium', 'opps.perThreat.High',
  'opps.cleanKillBonus',
  'territory.claimBuildingByTier.1', 'territory.claimBuildingByTier.2',
  'territory.claimBuildingByTier.3', 'territory.claimBuildingByTier.4',
  'territory.claimBuildingByTier.5',
  'territory.claimObjectiveBuilding', 'territory.claimTurf',
  'territory.defendRaid', 'territory.hold24h',
  'misc.robbery', 'misc.shakedownDealer', 'misc.flipProduct', 'misc.escapeHeat',
]);

function xpWeight(path, doc) {
  const root = doc || (typeof XP_SYSTEM !== 'undefined' ? XP_SYSTEM : null);
  if (!root || !root.actionXp) return null;
  let node = root.actionXp;
  const parts = String(path).split('.');
  for (let i = 0; i < parts.length; i++) {
    if (node === null || typeof node !== 'object') return null;
    node = node[parts[i]];
  }
  return typeof node === 'number' ? node : null;
}

// A plug can price its own recruit/job; the flat table is the fallback.
function xpPlugWeight(plugId, field, fallbackPath, doc) {
  const root = doc || (typeof XP_SYSTEM !== 'undefined' ? XP_SYSTEM : null);
  const list = root && root.actionXp && root.actionXp.plugs && root.actionXp.plugs.byPlug;
  if (list && list.length) {
    for (let i = 0; i < list.length; i++) {
      if (list[i].slotId === plugId && typeof list[i][field] === 'number') return list[i][field];
    }
  }
  return xpWeight(fallbackPath, doc);
}

// ── THE TABLES, RESOLVED ────────────────────
// One resolver per actionXp category. Each returns a WEIGHT, not Clout —
// awardXp() is what converts. `opp` and `sideHustle` are here because the spec
// defines them; see XP_UNPAID for why nothing calls them to pay.
const XpAwards = {
  objective:       doc => xpWeight('missions.mainStory.perObjective', doc),
  missionComplete: doc => xpWeight('missions.mainStory.completion.base', doc),

  daily: doc => xpWeight('missions.daily.dailyGrind', doc),
  login: doc => xpWeight('missions.daily.login', doc),
  streak: (days, doc) => {
    const per = xpWeight('missions.daily.streakBonusPerDay', doc);
    const cap = xpWeight('missions.daily.streakBonusCap', doc);
    if (per === null || cap === null) return null;
    return Math.min(cap, per * Math.max(0, days || 0));
  },

  plugRecruit: (plugId, doc) => xpPlugWeight(plugId, 'recruitXp', 'plugs.recruit', doc),
  plugJob:     (plugId, doc) => xpPlugWeight(plugId, 'jobXp', 'plugs.jobBase', doc),

  territoryBuilding:  (tier, doc) => xpWeight('territory.claimBuildingByTier.' + tier, doc),
  territoryObjective: doc => xpWeight('territory.claimObjectiveBuilding', doc),
  territoryTurf:      doc => xpWeight('territory.claimTurf', doc),
  defendRaid:         doc => xpWeight('territory.defendRaid', doc),
  hold24h:            doc => xpWeight('territory.hold24h', doc),

  misc: (action, doc) => xpWeight('misc.' + action, doc),

  // UNPAID (XP_UNPAID) — resolvable, never called to pay.
  sideHustle: (kind, doc) => {
    const byKind = xpWeight('missions.sideHustles.byKind.' + kind, doc);
    return byKind === null ? xpWeight('missions.sideHustles.base', doc) : byKind;
  },
  opp: (risk, threat, cleanKill, doc) => {
    const base = xpWeight('opps.base.' + risk, doc);
    const per  = xpWeight('opps.perThreat.' + risk, doc);
    if (base === null || per === null) return null;
    const bonus = cleanKill ? (xpWeight('opps.cleanKillBonus', doc) || 0) : 0;
    return base + per * Math.max(0, threat || 0) + bonus;
  },
};

// ── FIRST-TIME BONUS ────────────────────────
// `misc.firstTimeBonus`: ×2 on the first completion of a uniquely-IDed action.
// Marks as it reads, so a caller cannot double it twice. G.xpFirsts is an
// additive field with a default — no SCHEMA_VERSION bump, and an old save just
// gets its bonuses again, which is a gift rather than a loss.
function xpMarkFirst(id, state) {
  const g = state || (typeof G !== 'undefined' ? G : null);
  if (!g || !id) return false;
  if (!g.xpFirsts) g.xpFirsts = {};
  if (g.xpFirsts[id]) return false;
  g.xpFirsts[id] = true;
  return true;
}

// ── PAYING ──────────────────────────────────
// The single payer. Takes a WEIGHT (from XpAwards), converts at the player's
// level and hands it to addClout(), which is still the one place G.level moves
// and the one place the level-up toast and skill points come from.
//
// opts: { reason, ref, firstId, toast, level, table, state }
function awardXp(weight, label, opts) {
  const o = opts || {};
  if (weight === null || weight === undefined) {
    console.warn('awardXp: no weight for "' + (label || '?') + '" — is data/xp-system.json loaded?');
    return 0;
  }
  if (!(weight > 0)) return 0;

  const g = o.state || (typeof G !== 'undefined' ? G : null);
  let w = weight;
  if (o.firstId && xpMarkFirst(o.firstId, g)) w *= 2;

  const level = o.level || (g && g.level) || 1;
  const clout = xpToClout(w, level, o.table);
  if (!clout) return 0;

  const reason = o.reason
    || (typeof REASON !== 'undefined' ? REASON.QUEST_REWARD : 'quest_reward');
  // Read the level either side of the credit: addClout is where the boundary is
  // detected, and it fires the loud pill itself for the direct callers that
  // never come through here (jobs, fights). Knowing whether it did is what
  // stops the quiet pill below from immediately replacing it (DOM-136) —
  // xpToast replaces rather than queues, so the gold variant used to survive
  // ~0ms on exactly the awards most likely to level you up.
  const levelBefore = (g && g.level) || 1;
  if (typeof addClout === 'function') addClout(clout, reason, o.ref || null);
  const levelAfter = (g && g.level) || 1;
  const leveled = levelAfter > levelBefore;
  if (label && typeof log === 'function') {
    log(label + ' — +' + clout.toLocaleString() + ' Clout', 'gold');
  }
  // The v0.2 XP pill (DOM-119) when it is loaded, the plain toast otherwise —
  // an award must never be silent just because the shell overlay is missing.
  if (o.toast) {
    const loud = leveled || !!o.levelUp;
    if (typeof xpToast === 'function') {
      xpToast(clout, leveled ? 'LEVEL ' + levelAfter : label, loud);
    } else if (typeof toast === 'function') {
      toast('+' + clout.toLocaleString() + ' CLOUT');
    }
  }
  return clout;
}

// Make Moves pays by `kind` (js/jobs.js). Only the main story and the daily are
// paid from the spec — the other three kinds belong to jobs.json rows that
// doJob() already pays, so paying here would pay twice for one action.
function addXP(kind, opts) {
  const o = opts || {};
  if (kind === 'mainStory') {
    if (o.completed) {
      return awardXp(XpAwards.missionComplete(o.doc), o.title || 'MISSION COMPLETE', {
        reason: (typeof REASON !== 'undefined' ? REASON.QUEST_REWARD : 'quest_reward'),
        ref: o.id ? { moveId: o.id } : null,
      });
    }
    return awardXp(XpAwards.objective(o.doc), 'OBJECTIVE CLEARED', {
      reason: (typeof REASON !== 'undefined' ? REASON.OBJECTIVE_CLEARED : 'objective_cleared'),
      ref: o.id ? { moveId: o.id } : null,
    });
  }
  if (kind === 'daily') {
    return awardXp(XpAwards.daily(o.doc), o.title || 'DAILY GRIND', {
      reason: (typeof REASON !== 'undefined' ? REASON.DAILY_GOAL : 'daily_goal'),
      ref: { daily: o.id || 'daily_grind' },
    });
  }
  return 0;   // standard / timed / multiTarget — see XP_UNPAID
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    XP_SCALE_LEVEL, XP_UNPAID, XP_PATHS,
    xpCloutToNext, xpScale, xpToClout, xpWeight, xpPlugWeight,
    XpAwards, xpMarkFirst, awardXp, addXP,
  };
}
