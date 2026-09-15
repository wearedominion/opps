// ─────────────────────────────────────────────
//  GAME STATE
// ─────────────────────────────────────────────

// Save-format version. Bump by EXACTLY 1 per BREAKING change (rename, restructure,
// remove, re-key, unit change) and add the matching entry to MIGRATIONS below.
// Additive changes — a new field with a default in the G literal — are NOT breaking
// and MUST NOT bump this. See docs/specs/03-game-architecture.md §3.4.
const SCHEMA_VERSION = 5;

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

  // BASE stats only (start + committed skill points). Gear no longer banks into
  // these (DOM-75): combat reads effAttack()/effDefense(), which add the
  // fielded loadout on top. Anything that mutates these is a base-stat grant.
  attack: 10, defense: 5,
  // Epoch ms or null (08 §3: one field, never a flag plus a timestamp that can
  // disagree). Non-null and in the future = hospitalized: cannot fight, cannot
  // rest, health regen paused, shielded from any future search (DOM-72).
  // Additive field with a default — no SCHEMA_VERSION bump.
  hospitalizedUntil: null,
  // { itemId: { level, duplicates, src } } — per-instance gear state (DOM-88).
  // `level` is the upgrade level (0 = as bought); `duplicates` counts spare
  // copies for when tuning.gear.duplicatesRequired turns on; `src` is the
  // acquisition source ('bought' | 'dropped') for economy telemetry (DOM-75).
  inventory: {},
  // { type: [itemId, ...] } — the fielded loadout (DOM-75). Index 0 is the
  // primary; the rest are Crew-unlocked secondaries. Only items here (within
  // slotCapacity) count in combat — owning is not fielding.
  loadout: {},
  properties: {},
  // { spotId: { lastCollect } } — per-Spot accrual anchors (DOM-74). Additive
  // field with a default, so no SCHEMA_VERSION bump; a save without an anchor
  // for an owned spot anchors at first read (no retro-accrual).
  spots: {},
  jobProgress: {},
  // { questId: { p: [count per step], claimed } } — Plug quest progress
  // (DOM-90). Additive field with a default — no SCHEMA_VERSION bump.
  quests: {},
  // Plug ids whose dialogue has been run to the end at least once
  // (DOM-113). First completion recruits the plug; later ones run the job
  // they offer. Additive field with a default — no SCHEMA_VERSION bump.
  plugsRecruited: [],
  playerId: null,
  lastSeen: 0,
  crewMemberCount: 0,
  lieutenantsRewarded: 0,   // high-water mark: Lieutenants already paid Clout for
  recruitedBy: null,
  lastRegisterPromptAt: 0, // throttles guest register/sign-in nudges (Auth); additive, no SCHEMA_VERSION bump

  // ── Player Profile (docs/tdds/2026-09-09-player-profile.md) ──
  skillPts: 0,          // unspent skill points, +5 per level

  // Frozen at fight entry (DOM-75): { atk, def, hp, loadout, cp, at }. CP is
  // the A × (H + D) matchmaking proxy, stored at write time. Capture trigger
  // and staleness rules are an open decision (owner: Bill) — entry-capture is
  // the v1 placeholder. Additive field with a default — no SCHEMA_VERSION bump.
  combatSnapshot: null,

  // ── Chrome Money v0.2 shell (DOM-110) ──
  // Additive fields with defaults — no SCHEMA_VERSION bump. Of the handoff
  // README's list, `equipped` is deliberately NOT added here: the slot model
  // and its migration land together in DOM-120/DOM-121, and the v4→v5
  // migration above deletes a stale `equipped` on old saves. `maxMoves` /
  // `maxStamina` are not added either — those live as moves.max/stamina.max.
  soundOn: true,        // WebAudio click gate; Settings (DOM-111) owns the toggle
  handle: null,         // player-chosen tag; Settings/Profile own it
  gold: 0,              // premium currency balance; Store (DOM-116) owns it
  supplies: {},         // consumables by id; Store (DOM-116) owns it
  turf: {},             // claimed-turf state; The Hood (DOM-118) owns it
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

  // v3 -> v4: inventory array-of-ids -> per-instance map (DOM-88 gear upgrades).
  //   ["knife", "vest"]  ->  { "knife": { "level": 0, "duplicates": 0 },
  //                            "vest":  { "level": 0, "duplicates": 0 } }
  // Every pre-v4 item starts at upgrade level 0 with no spare copies — exactly
  // the state a fresh purchase creates, so nothing is gained or lost. A junk
  // inventory (not an array) becomes empty rather than crashing the chain.
  3: (s) => {
    const inv = {};
    if (Array.isArray(s.inventory)) {
      for (const id of s.inventory) inv[id] = { level: 0, duplicates: 0 };
    }
    s.inventory = inv;
    s.schemaVersion = 4;
    return s;
  },

  // v4 -> v5: banked gear stats -> derived loadout (DOM-75).
  //
  // Under v4, buying or upgrading gear banked its stats into attack / defense /
  // health.max permanently, and every owned item counted forever. Under v5 only
  // the FIELDED loadout counts, derived at read time — so this migration
  // un-banks: subtract every owned item's shipped stats (plus its capped
  // upgrade gains) back out, leaving attack/defense as base-only (start +
  // committed skill points).
  //
  // The stat table below is the catalog AS SHIPPED under v4, frozen as
  // literals (§7.3: a migration must not read loaded content — the live
  // catalog is regenerated and no longer matches what was banked). Most
  // generated items shipped with 0/0/0 stats (the gen-catalog stat-ratio bug,
  // fixed alongside DOM-75), so their un-bank is the upgrade gains only.
  //
  // Seeds the loadout with the best un-banked item per type — primaries only;
  // Crew-unlocked secondaries are the player's to assign. Stamps every
  // instance src:'bought' (drops existed, but the source was never recorded —
  // 'bought' is the honest majority default). Deletes `equipped`, the
  // prototype Profile's placeholder (its ids never pointed at real items).
  4: (s) => {
    const TABLE = { // id: [type, atk, def, hp] — v4 shipped values, frozen
      knife: ['weapon', 5, 0, 0],    burner: ['utility', 5, 5, 0],
      vest: ['armor', 0, 10, 0],     glock: ['weapon', 15, 0, 0],
      bando: ['utility', 0, 20, 10], dirtbike: ['vehicle', 0, 0, 0],
      mac11: ['weapon', 0, 0, 0],    stabvest: ['armor', 0, 0, 0],
      ak: ['weapon', 30, 0, 0],      boxchevy: ['vehicle', 12, 0, 0],
      kevlar: ['armor', 0, 0, 0],    coupe: ['vehicle', 0, 0, 0],
      plates: ['armor', 0, 0, 0],    pump: ['weapon', 0, 0, 0],
      ballistic: ['armor', 0, 0, 0], blacksuv: ['vehicle', 0, 0, 0],
      switchie: ['weapon', 0, 0, 0], armsedan: ['vehicle', 0, 0, 0],
      dragonskin: ['armor', 0, 0, 0], drummy: ['weapon', 0, 0, 0],
      carbine: ['weapon', 0, 0, 0],  fullkev: ['armor', 0, 0, 0],
      sprinter: ['vehicle', 0, 0, 0], fedvest: ['armor', 0, 0, 0],
      lowkey: ['vehicle', 0, 0, 0],  sniper: ['weapon', 0, 0, 0],
      beltfed: ['weapon', 0, 0, 0],  bunker: ['armor', 0, 0, 0],
      gunboat: ['vehicle', 0, 0, 0], fiftycal: ['weapon', 0, 0, 0],
      helo: ['vehicle', 0, 0, 0],    titanium: ['armor', 0, 0, 0],
      exorig: ['armor', 0, 0, 0],    jet: ['vehicle', 0, 0, 0],
      minigun: ['weapon', 0, 0, 0],  arsenal: ['weapon', 0, 0, 0],
      fortress: ['armor', 0, 0, 0],  yacht: ['vehicle', 0, 0, 0],
    };
    // v4 upgrade banking, frozen: +1 ATK +1 DEF per level up to the cap (10);
    // levels past the cap banked nothing (prestige).
    const GAIN = { atk: 1, def: 1, cap: 10 };
    const best = {}; // type -> { id, power } for loadout seeding
    for (const id of Object.keys(s.inventory || {})) {
      const inst = s.inventory[id];
      inst.src = 'bought';
      const row = TABLE[id];
      if (!row) continue; // unknown id: nothing was banked for it under v4
      const lv = Math.min(inst.level || 0, GAIN.cap);
      const atk = row[1] + lv * GAIN.atk;
      const def = row[2] + lv * GAIN.def;
      s.attack = Math.max(0, (s.attack || 0) - atk);
      s.defense = Math.max(0, (s.defense || 0) - def);
      if (row[3] && s.health && typeof s.health === 'object') {
        s.health.max = Math.max(1, (s.health.max || 1) - row[3]);
        s.health.current = Math.min(s.health.current, s.health.max);
      }
      const power = atk + def + row[3];
      if (!best[row[0]] || power > best[row[0]].power) best[row[0]] = { id: id, power: power };
    }
    s.loadout = {};
    for (const type of Object.keys(best)) s.loadout[type] = [best[type].id];
    delete s.equipped;
    s.schemaVersion = 5;
    return s;
  },
};

// ── Gear ownership helpers (DOM-88) ──────────────────────────────────────────
// The one place that knows the inventory's shape; everything else asks these.
function ownsGear(itemId) {
  return !!(G.inventory && G.inventory[itemId]);
}
function gearInstance(itemId) {
  return (G.inventory && G.inventory[itemId]) || null;
}
function grantGear(itemId, src) {
  if (!G.inventory[itemId]) G.inventory[itemId] = { level: 0, duplicates: 0, src: src || 'bought' };
  return G.inventory[itemId];
}

// ── Loadout & derived combat stats (DOM-75) ──────────────────────────────────
// Cash buys items; only Crew buys the right to equip them. G.loadout holds the
// fielded item ids per type ([0] = primary), slotCapacity() says how many of
// them count, and effAttack()/effDefense() are what combat actually reads.

// Slots for a type: 1 base + Crew grants. Every `crew.lieutenantsPerSlot`
// Lieutenants earns one +1 grant, distributed round-robin over
// `crew.slotRotation` (weapon, then armor, then vehicle, ...), each type
// capped at `crew.maxBonusSlotsPerType` bonus slots. Types outside the
// rotation (utility) stay at the base slot. Clout per recruit is unbounded;
// capacity is not — the power ceiling is deliberate (ratified 2026-09-13).
function slotCapacity(type) {
  const rot = tune('crew.slotRotation');
  const i = rot.indexOf(type);
  if (i === -1) return 1;
  const grants = Math.floor((G.crewMemberCount || 0) / tune('crew.lieutenantsPerSlot'));
  const bonus = Math.floor((grants - i + rot.length - 1) / rot.length);
  return 1 + Math.max(0, Math.min(tune('crew.maxBonusSlotsPerType'), bonus));
}

// One item's contribution while fielded: catalog stats plus upgrade gains up
// to the stat cap (DOM-88 semantics, now derived instead of banked).
function gearItemStats(item, inst) {
  const lv = Math.min(inst ? (inst.level || 0) : 0, tune('gear.statCapLevel'));
  const gain = tune('gear.statGainPerLevel');
  return { atk: (item.atk || 0) + lv * gain.attack, def: (item.def || 0) + lv * gain.defense };
}

// The loadout entries that actually count: owned, type-correct, and within
// capacity. Capacity can shrink (the referral list is re-read every boot), so
// the slice is defensive — over-capacity entries stay assigned but inert.
function fieldedGear() {
  const out = [];
  for (const type of Object.keys(G.loadout || {})) {
    const ids = (G.loadout[type] || []).slice(0, slotCapacity(type));
    for (const id of ids) {
      const item = STORE_ITEMS.find(i => i.id === id);
      if (item && item.type === type && ownsGear(id)) {
        out.push({ item: item, inst: gearInstance(id), type: type });
      }
    }
  }
  return out;
}

function fieldedStats() {
  return fieldedGear().reduce((s, f) => {
    const st = gearItemStats(f.item, f.inst);
    return { atk: s.atk + st.atk, def: s.def + st.def };
  }, { atk: 0, def: 0 });
}

function effAttack()  { return G.attack  + fieldedStats().atk; }
function effDefense() { return G.defense + fieldedStats().def; }

// Field an item in the first open slot of its type. Returns true if it landed;
// false when every unlocked slot is taken (the item stays in the stash).
function autoFieldGear(itemId) {
  const item = STORE_ITEMS.find(i => i.id === itemId);
  if (!item || !ownsGear(itemId)) return false;
  const ids = G.loadout[item.type] = G.loadout[item.type] || [];
  if (ids.indexOf(itemId) !== -1) return true;
  if (ids.length >= slotCapacity(item.type)) return false;
  ids.push(itemId);
  return true;
}

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
