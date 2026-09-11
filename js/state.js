// ─────────────────────────────────────────────
//  GAME STATE
// ─────────────────────────────────────────────

// Save-format version. Bump by EXACTLY 1 per BREAKING change (rename, restructure,
// remove, re-key, unit change) and add the matching entry to MIGRATIONS below.
// Additive changes — a new field with a default in the G literal — are NOT breaking
// and MUST NOT bump this. See docs/specs/03-game-architecture.md §3.4.
const SCHEMA_VERSION = 1;

const G = {
  schemaVersion: SCHEMA_VERSION,
  level: 1, xp: 0, xpNext: 100,
  money: 500,
  rep: 0,
  energy: 10, maxEnergy: 10,
  health: 100, maxHealth: 100,
  attack: 10, defense: 5,
  inventory: [],
  properties: {},
  jobProgress: {},
  playerId: null,
  lastSeen: 0,
  lastEnergyTick: 0,
  crewMemberCount: 0,
  recruitedBy: null,
  gems: 0,

  // ── Player Profile (docs/tdds/2026-09-09-player-profile.md) ──
  // Additive with safe defaults — NOT a breaking change, so no SCHEMA_VERSION bump.
  // Read defensively everywhere (G.equipped || {}).
  skillPts: 0,          // unspent skill points, +5 per level
  stamina: 10,          // Fighter pool — current
  maxStamina: 10,       // Fighter pool — max
  equipped: {},         // { slotId: itemId } — slot ids and item ids are permanent save keys
  // NOTE: the "Max Moves" skill raises the EXISTING G.maxEnergy. The design handoff
  // proposed a separate `maxMoves` field, but maxEnergy already is the Moves pool
  // (fiction maps energy -> Moves in the render layer only). One field, one concept.
};

// ─────────────────────────────────────────────
//  SAVE MIGRATIONS
//  Keyed by the version being migrated FROM.
//  Each is PURE: (save) -> save, and sets schemaVersion to the next number.
//  No Date.now(), no RNG, no dependence on loaded content.
// ─────────────────────────────────────────────

const MIGRATIONS = {
  // 1: (s) => { /* breaking change here */ s.schemaVersion = 2; return s; },
};

// Runs the chain fully in memory. Never persists intermediate versions.
function migrate(saved) {
  let s = saved;
  let v = s.schemaVersion || 1;          // pre-versioning saves are treated as v1
  if (v > SCHEMA_VERSION) return { save: s, fromFuture: true, upgraded: false };
  const from = v;
  while (v < SCHEMA_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) break;                    // missing step: stop rather than corrupt
    s = step(s);
    v = s.schemaVersion;
  }
  return { save: s, fromFuture: false, upgraded: v !== from };
}

// ─────────────────────────────────────────────
//  GAMESTATE ABSTRACTION
//  Swap out localStorage calls here when
//  Jest SDK becomes available
// ─────────────────────────────────────────────

const GameState = {
  // Set when a save newer than this client is loaded. While true we never write,
  // so a stale client can't clobber a newer save from another device.
  _fromFuture: false,

  async save() {
    if (this._fromFuture) return;
    G.schemaVersion = SCHEMA_VERSION;
    if (typeof JestSDK !== 'undefined') {
      await JestSDK.data.set('g', G);
    } else {
      try { localStorage.setItem('opps_gamestate', JSON.stringify(G)); } catch(e) {
        console.warn('GameState.save failed:', e);
      }
    }
  },

  // Durable write — awaits platform acknowledgement where the SDK supports it.
  // Use after a migration or anything that must not be lost (see §3.2).
  async saveDurable() {
    await this.save();
    if (this._fromFuture) return;
    try {
      if (typeof JestSDK !== 'undefined' && JestSDK.data && typeof JestSDK.data.flush === 'function') {
        await JestSDK.data.flush();
      }
    } catch(e) {
      console.warn('GameState.flush failed:', e);
    }
  },

  async load() {
    let raw = null;
    if (typeof JestSDK !== 'undefined') {
      const data = await JestSDK.data.getAll();
      raw = data.g ?? null;
    } else {
      try {
        const saved = localStorage.getItem('opps_gamestate');
        raw = saved ? JSON.parse(saved) : null;
      } catch(e) {
        console.warn('GameState.load failed:', e);
        return null;
      }
    }
    if (!raw) return null;

    let result;
    try {
      result = migrate(raw);
    } catch(e) {
      console.warn('GameState.migrate failed, loading save as-is:', e);
      return raw;
    }

    this._fromFuture = result.fromFuture;
    if (result.fromFuture) {
      console.warn('Save is from a newer client (v' + raw.schemaVersion + ' > v' + SCHEMA_VERSION + '); loading read-only.');
    }
    this._needsWriteback = result.upgraded;
    return result.save;
  },

  apply(saved) {
    Object.assign(G, saved);
    // A migrated save is written back once, durably, after it is applied.
    if (this._needsWriteback) {
      this._needsWriteback = false;
      this.saveDurable();
    }
  }
};
