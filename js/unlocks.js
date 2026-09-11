// ─────────────────────────────────────────────
//  UNLOCK GATES
//
//  One implementation of "is this available yet". Before this, five call sites
//  across jobs.js and combat.js each wrote their own `G.level < x.levelReq`
//  comparison with their own copy — "REQUIRES RANK 3", "RANK 3", "You need a
//  higher rank!" — which is how a gate quietly drifts out of step with the rule
//  it is supposed to enforce.
//
//  TWO KINDS OF GATE, deliberately kept apart:
//
//  1. CONTENT gates live on the content row itself (`levelReq` on a job, an
//     enemy, an item). They are already data and stay there — one number next to
//     the thing it gates is the right place for it.
//  2. CAPABILITY gates are level -> value mappings that belong to no single row
//     (the Spots offline-accrual cap; gear and Moves tiers when those exist).
//     Those live in data/unlocks.json as curve objects.
//
//  See docs/specs/04-game-data-spec.md §3.8 and DOM-66.
// ─────────────────────────────────────────────

// Level a content row requires. Absent means available from level 1.
function requiredLevel(entity) {
  return (entity && entity.levelReq) || 1;
}

function isUnlocked(entity, level) {
  const lvl = typeof level === 'number' ? level : (typeof G !== 'undefined' ? G.level : 1);
  return lvl >= requiredLevel(entity);
}

// The one place lock copy is written. Returns '' when unlocked, so callers can
// render it unconditionally.
function lockLabel(entity, level) {
  return isUnlocked(entity, level) ? '' : 'REQUIRES LEVEL ' + requiredLevel(entity);
}

// A level -> value capability from data/unlocks.json, evaluated at that level.
function capabilityAt(name, level) {
  const caps = (typeof UNLOCKS !== 'undefined' && UNLOCKS && UNLOCKS.capabilities) || null;
  if (!caps || !(name in caps)) {
    throw new Error('unlocks.json has no capability "' + name + '"');
  }
  const lvl = typeof level === 'number' ? level : (typeof G !== 'undefined' ? G.level : 1);
  return evalCurve(caps[name], lvl);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { requiredLevel, isUnlocked, lockLabel, capabilityAt };
}
