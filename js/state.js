// ─────────────────────────────────────────────
//  GAME STATE
// ─────────────────────────────────────────────

// Save-format version. Bump by EXACTLY 1 per BREAKING change (rename, restructure,
// remove, re-key, unit change) and add the matching entry to MIGRATIONS below.
// Additive changes — a new field with a default in the G literal — are NOT breaking
// and MUST NOT bump this. See docs/specs/03-game-architecture.md §3.4.
const SCHEMA_VERSION = 3;

const G = {
  schemaVersion: SCHEMA_VERSION,
  level: 1,             // DERIVED from clout — a cache, not a source of truth
  clout: 0,             // lifetime cumulative, monotonic, never spent (was xp + rep)
  levelGranted: 1,      // high-water mark: highest level whose rewards were paid out
  cash: 500,            // the only at-risk currency; no bank

  // The three pools share one shape so one regen implementation can serve all of
  // them (DOM-65). `lastTick` is epoch ms of the last regen CREDIT, not of the
  // last read. These numbers are placeholders — applyStartingState() overwrites
  // them from data/tuning.json `start` for every new player.
  moves:   { current: 10,  max: 10,  lastTick: 0 },   // PvE pacing (was energy)
  stamina: { current: 3,   max: 3,   lastTick: 0 },   // fight pacing
  health:  { current: 100, max: 100, lastTick: 0 },   // combat HP

  attack: 10, defense: 5,
  inventory: [],
  properties: {},
  jobProgress: {},
  playerId: null,
  lastSeen: 0,
  crewMemberCount: 0,
  lieutenantsRewarded: 0,   // high-water mark: Lieutenants already paid Clout for
  recruitedBy: null,
  lastRegisterPromptAt: 0, // throttles guest register/sign-in nudges (Auth); additive, no SCHEMA_VERSION bump

  // ── Player Profile (docs/tdds/2026-09-09-player-profile.md) ──
  skillPts: 0,          // unspent skill points, +5 per level
  equipped: {},         // { slotId: itemId } — slot ids and item ids are permanent save keys
};

// ─────────────────────────────────────────────
//  SAVE MIGRATIONS
//  Keyed by the version being migrated FROM.
//  Each is PURE: (save) -> save, and sets schemaVersion to the next number.
//  No Date.now(), no RNG, no dependence on loaded content.
// ─────────────────────────────────────────────

const MIGRATIONS = {
  // v1 -> v2: xp + xpNext + rep  ->  clout (cumulative)
  //
  // Under v1, `xp` was a REMAINDER: addXP() did `G.xp -= G.xpNext` on each level,
  // so the stored number was progress within the current level, not a lifetime
  // total. Lifetime Clout therefore has to be reconstructed — sum every v1
  // threshold the player already cleared, then add the remainder and their rep
  // (rep merges into Clout per docs/oppsDefinitions.md).
  //
  // The v1 curve constants are frozen here on purpose. This function must stay
  // pure and must NOT read data/progression.json or TUNING (§7.3) — a migration
  // that depends on loaded content is neither testable nor re-runnable.
  //
  // Deliberate consequence: level is re-derived from the new table after this
  // runs, and the v1 curve (x1.6) was far steeper than the v2 table (x1.05), so
  // existing players will LEVEL UP on first load — materially so. Their Clout is
  // what they actually earned; only the price of a level changed. Preserving the
  // old level instead would mean fabricating a Clout total to justify it, which
  // bakes the broken curve into the new system permanently.
  1: (s) => {
    const V1_BASE = 100, V1_RATIO = 1.6;
    let cleared = 0, step = V1_BASE;
    for (let l = 1; l < (s.level || 1); l++) {
      cleared += step;
      step = Math.floor(step * V1_RATIO);
    }
    s.clout = cleared + (s.xp || 0) + (s.rep || 0);
    // Their v1 level was already paid for. Without this the reward loop would
    // re-grant every level they already have on first load.
    s.levelGranted = s.level || 1;
    delete s.xp; delete s.xpNext; delete s.rep;
    s.schemaVersion = 2;
    return s;
  },

  // v2 -> v3: terminology migration + pool restructure.
  //   money                               -> cash
  //   energy / maxEnergy / lastEnergyTick -> moves   {current, max, lastTick}
  //   stamina / maxStamina                -> stamina {current, max, lastTick}
  //   health / maxHealth                  -> health  {current, max, lastTick}
  //   gems                                -> removed (no hard currency in v1)
  //
  // The three pools collapse to ONE shape so a single regen implementation can
  // serve all of them. `lastEnergyTick` becomes moves.lastTick; the other two
  // pools never had a tick because they never regenerated.
  //
  // The fallbacks below are FROZEN LITERALS, not tuning reads. A migration must
  // stay pure and independent of loaded content (§7.3), and they only apply to
  // saves old enough to predate the field. A wrong-but-deterministic default is
  // far safer here than one that varies with whatever tuning shipped that day.
  2: (s) => {
    const mv = { current: s.energy  ?? 0, max: s.maxEnergy  ?? 10,  lastTick: s.lastEnergyTick || 0 };
    const st = { current: s.stamina ?? 0, max: s.maxStamina ?? 3,   lastTick: 0 };
    const hp = { current: s.health  ?? 0, max: s.maxHealth  ?? 100, lastTick: 0 };
    s.cash = s.money ?? 0;
    s.moves = mv;
    s.stamina = st;
    s.health = hp;
    delete s.money;
    delete s.energy; delete s.maxEnergy; delete s.lastEnergyTick;
    delete s.maxStamina; delete s.maxHealth;
    delete s.gems;
    // Crew recruited before v3 was never owed per-recruit Clout — seed the
    // high-water mark so _awardNewLieutenants doesn't back-pay the whole crew
    // on first boot. Same reasoning as levelGranted in the v1 migration.
    s.lieutenantsRewarded = s.crewMemberCount || 0;
    s.schemaVersion = 3;
    return s;
  },
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
      // A half-migrated save must never be loaded into current-shape code, and
      // the intact stored save must never be clobbered by whatever this session
      // does — start fresh in memory, write-protected.
      console.warn('GameState.migrate failed; starting fresh in memory, stored save preserved:', e);
      this._fromFuture = true;
      return null;
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
