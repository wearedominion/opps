// ─────────────────────────────────────────────
//  TUNING ACCESS
//
//  data/tuning.json is the source of truth for every economy and balance
//  constant. Game logic reads it through tune() and holds no numbers of its own.
//
//  There is deliberately NO fallback value. A fallback silently becomes the
//  balance the first time a fetch fails or a path is renamed, and nobody finds
//  out until the numbers are wrong in production — so tune() throws, and the
//  game refuses to boot on a missing or incomplete tuning file (see
//  assertTuningReady, called from init()). Fail at boot, loudly, once.
//
//  See docs/specs/04-game-data-spec.md §3.7 and 08-economy-schema.md §2.
// ─────────────────────────────────────────────

// Paths game logic depends on. A missing one aborts boot rather than surfacing
// later as NaN in a meter. Add a path here whenever code starts reading it.
const TUNING_REQUIRED = [
  'start.cash', 'start.attack', 'start.defense',
  'start.moves', 'start.stamina', 'start.health',
  'progression.maxLevel', 'progression.skillPointsPerLevel', 'progression.levelsPerRank',
  'progression.levelUpRefillsPools',
  'progression.autoStatGainPerLevel.attack', 'progression.autoStatGainPerLevel.defense',
  'progression.autoStatGainPerLevel.health', 'progression.autoStatGainPerLevel.moves',
  'pools.moves.regenSeconds', 'pools.stamina.regenSeconds', 'pools.health.regenSeconds',
  'pools.moves.regenAmount', 'pools.stamina.regenAmount', 'pools.health.regenAmount',
  'skills.cost.moves', 'skills.cost.stamina', 'skills.cost.health',
  'skills.cost.attack', 'skills.cost.defense',
  'skills.grant.moves', 'skills.grant.stamina', 'skills.grant.health',
  'skills.grant.attack', 'skills.grant.defense',
  'combat.winHealthLoss', 'combat.defeatHealthRemaining', 'combat.defeatCloutShare',
  'crew.cloutPerRecruit',
  'loot.defeatLossRate',
  'crew.attackPerLieutenant', 'crew.defensePerLieutenant',
  'hoodActions.restMovesCost', 'hoodActions.restHealAmount',
  'hoodActions.launderMovesCost', 'hoodActions.launderRate',
];

// Read a dotted path out of the loaded tuning file. Throws rather than guessing.
function tune(path, source) {
  const root = source || (typeof TUNING !== 'undefined' ? TUNING : null);
  if (!root) throw new Error('tuning.json is not loaded (read of "' + path + '")');
  const parts = path.split('.');
  let node = root;
  for (let i = 0; i < parts.length; i++) {
    if (node === null || typeof node !== 'object' || !(parts[i] in node)) {
      throw new Error('tuning.json has no value at "' + path + '"');
    }
    node = node[parts[i]];
  }
  return node;
}

// Every required path that is missing. Empty array means the file is usable.
function missingTuningPaths(source) {
  const root = source || (typeof TUNING !== 'undefined' ? TUNING : null);
  if (!root) return TUNING_REQUIRED.slice();
  return TUNING_REQUIRED.filter(p => {
    try { tune(p, root); return false; } catch (e) { return true; }
  });
}

// Refuse to start, loudly: console plus a full-screen diagnostic overlay.
// Shared by every data-file boot gate, not just tuning.
function bootFail(msg) {
  console.error(msg);
  if (typeof document !== 'undefined' && document.body) {
    const el = document.createElement('pre');
    el.setAttribute('role', 'alert');
    el.style.cssText = 'position:fixed;inset:0;z-index:9999;margin:0;padding:24px;'
      + 'background:#0b0b0c;color:#e0523f;font:13px/1.5 ui-monospace,monospace;'
      + 'white-space:pre-wrap;overflow:auto';
    el.textContent = msg;
    document.body.appendChild(el);
  }
}

// Boot gate. Returns true when the game may start.
function assertTuningReady() {
  const missing = missingTuningPaths();
  if (!missing.length) return true;
  bootFail('data/tuning.json is missing or incomplete — the game cannot start.\n'
         + missing.length + ' required value(s) unavailable:\n  ' + missing.join('\n  '));
  return false;
}

// ─────────────────────────────────────────────
//  CURVE EVALUATION
//
//  Anything that scales with an integer input — player level, upgrade level,
//  tier — is a curve object rather than a number plus a multiplier in code.
//  Four shapes, documented in docs/specs/08-economy-schema.md §1.
//
//  The input is 1-INDEXED. `{base: 105, ratio: 1.05}` yields 105 at n = 1, which
//  is what reproduces data/progression.json; writing base 100 shifts every level
//  by one step.
// ─────────────────────────────────────────────

function evalCurve(curve, n, scale) {
  if (!curve || typeof curve !== 'object') {
    throw new Error('evalCurve: not a curve object: ' + JSON.stringify(curve));
  }
  const i = Math.max(1, Math.floor(n || 1));
  let value;
  switch (curve.type) {
    case 'constant':
      value = curve.value;
      break;
    case 'linear':
      value = curve.base + curve.step * (i - 1);
      break;
    case 'geometric':
      value = curve.base * Math.pow(curve.ratio, i - 1);
      break;
    case 'table': {
      const rows = curve.values || [];
      if (!rows.length) throw new Error('evalCurve: table curve has no values');
      value = rows[Math.min(i, rows.length) - 1];      // clamp to the last entry
      break;
    }
    default:
      throw new Error('evalCurve: unknown curve type "' + curve.type + '"');
  }

  // `scaleBy` names a field on the entity the curve is applied to (e.g. an item's
  // own price). The caller passes the value; the curve only says to use it.
  if (curve.scaleBy) {
    if (typeof scale !== 'number') {
      throw new Error('evalCurve: curve scaleBy "' + curve.scaleBy + '" needs a scale argument');
    }
    value = value * scale;
  }

  // Round ONCE, at the end, and only for geometric — the one shape that is
  // inherently fractional. Rounding before scaling would be a real defect: the
  // gear upgrade curve has base 1.0, so an early level would round to 1 and then
  // multiply, quantising every price to a multiple of the item's cost. The other
  // shapes are returned as authored, because some of them are rates (0.03) that
  // rounding would destroy.
  return curve.type === 'geometric' ? Math.round(value) : value;
}

// Read a curve out of tuning and evaluate it in one call.
function tuneCurve(path, n, scale) { return evalCurve(tune(path), n, scale); }

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { tune, missingTuningPaths, TUNING_REQUIRED, evalCurve, tuneCurve };
}
