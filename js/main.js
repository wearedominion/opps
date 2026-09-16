// ─────────────────────────────────────────────
//  GAME DATA — populated from JSON files
// ─────────────────────────────────────────────

let JOBS = [];
let QUESTS = [];   // data/quests.json — Plug quests (DOM-90)
let ENEMIES = [];
// Item definitions (data/gear.json). THE single source of truth for every item
// in the game — storefront stock and drop-only alike (DOM-123). The old
// data/store.json was this same catalog under a narrower name; it is gone.
let GEAR = [];
// Transitional alias for GEAR, kept so the pre-v0.2 renderers keep reading the
// catalog under their old name. New code uses GEAR; the alias is deleted when
// DOM-116 (Store) and DOM-117 (Profile GEAR) rebuild the last of those screens.
let STORE_ITEMS = [];
let PROPERTIES = [];
let RANK_NAMES = [];
// Skill definitions (data/skills.json) — identity and copy only. Point costs
// and per-point grants stay in tuning.json; a skill row names its tuning key.
let SKILLS = [];
// Plug roster (data/plugs.json), migrated out of PLUGS_DATA in js/plugs.js.
let PLUGS = [];
// MAKE MOVES content (data/moves.json): featured job, side hustles, daily,
// turf, hood ops, sightings. Placeholder content — see the file's _note.
let MOVES = null;

// data/xp-system.json — what each action is worth, as WEIGHTS (DOM-124).
// Not a curve: data/progression.json is still the only authority on levels.
// js/xp.js turns a weight into Clout.
let XP_SYSTEM = null;

// data/crew.json — the NPC half of the CREW roster (DOM-114). MY ROSTER is not
// in here: it is the player's real Lieutenants, built from the referral feed.
let CREW_DATA = null;

// data/slots.json — the seven paper-doll gear slots and their labels.
// data/storefront.json — what the Store sells that is not a gear.json row.
let SLOTS = null;
let STOREFRONT = null;

// data/messages.json — the Messages overlay's threads (DOM-119).
let MESSAGES = null;
// City configuration (data/city.json): seed + parameters for THE HOOD. The
// city is generated from the seed, never stored building-by-building.
let CITY = null;
// Leaderboard rows (data/leaderboard.json). STUB for v1 (DOM-122): there is no
// source to read from — saves are per-user blobs and server/ only verifies
// purchases. Every row is ALREADY a public projection, so a live source can
// replace the file without the screen changing. See the file's _contract.
let LEADERBOARD = null;
// Economy tunables (data/tuning.json). Object, not an array — see 04-game-data-spec §3.6.
// Null until loadGameData() resolves; economy callers must guard (`TUNING?.loot`).
let TUNING = null;
// Clout -> level table (data/progression.json). Array of {level, cloutToNext};
// cloutToNext is null on the last row only. Empty until loadGameData() resolves.
let PROGRESSION = [];
// Purchasable SKUs (data/monetization.json). v1 sells refreshes and heals directly.
let IAP_PRODUCTS = [];
// Level -> capability gates (data/unlocks.json). Content gates stay on their own rows.
let UNLOCKS = null;
// Platform-login config (data/platform.json); Auth falls back to defaults.
let PLATFORM = {};
// Portrait art by entity id (data/portraits.json). A missing entry (or a failed
// fetch) renders the styled placeholder circle, never a broken image.
let PORTRAITS = { enemies: {}, plugs: {} };

// ─────────────────────────────────────────────
//  MAIN — INIT
// ─────────────────────────────────────────────

// One level's worth of rewards. Called once per level crossed, never directly —
// go through syncLevel() so the high-water mark stays honest.
// A brand-new player's opening balances. The defaults in the G literal exist only
// so the object is well-formed before data loads — these are the real values.
function applyStartingState() {
  const now = Date.now();
  G.createdAt = now;          // "Member since" (DOM-111) — set once, never moved
  G.attack  = tune('start.attack');
  G.defense = tune('start.defense');
  // Opening balances are credited, not assigned, so a new player's first rows are
  // in the ledger and the money supply reconciles from row one.
  G.cash = 0;
  credit('cash', tune('start.cash'), REASON.STARTING_GRANT);
  ['moves', 'stamina', 'health'].forEach(pool => {
    const max = tune('start.' + pool);
    G[pool] = { current: 0, max: max, lastTick: now };
    credit(pool, max, REASON.STARTING_GRANT);
  });
}

function applyLevelGrants() {
  // BALANCE FLAG (Bobby): these automatic gains compete with the 1-point ATTACK /
  // DEFENSE / MAX HEALTH skill sinks, which grant +1 each. Still true, but it is now
  // a data argument, not a code one — set tuning.progression.autoStatGainPerLevel to
  // zeroes and all stat growth becomes player-allocated. Owned by DOM-66.
  const gain = tune('progression.autoStatGainPerLevel');
  G.moves.max  += gain.moves;
  G.health.max += gain.health;
  G.attack     += gain.attack;
  G.defense    += gain.defense;
  credit('skillPts', tune('progression.skillPointsPerLevel'), REASON.LEVEL_UP_GRANT,
         { ref: { level: G.level } });
  // Level-up fully refills Stamina, Moves and Health (docs/profileScreen.md §4).
  // Once the Hospital exists this is also the free release —
  // see DOM-66's note on banking a level before a session.
  if (tune('progression.levelUpRefillsPools')) {
    // DOM-82 (ratified option 1, 2026-09-12): a level-up is also the free
    // Hospital release, in the same transaction as the refill — clear the
    // state FIRST so the health credit isn't wasted on a hospitalized pool.
    // Banking a nearly-complete level as an escape hatch is accepted play:
    // it rewards planning and the ceiling is one level's worth.
    G.hospitalizedUntil = null;
    ['moves', 'stamina', 'health'].forEach(pool => {
      credit(pool, G[pool].max - G[pool].current, REASON.LEVEL_UP_GRANT,
             { ref: { level: G.level } });
    });
  }
}

// The ONE place G.level changes. Derives level from cumulative Clout and pays
// out any levels not yet granted. Returns how many levels were newly granted.
//
// Rewards are a RATCHET, tracked by G.levelGranted. A retuned table can lower a
// player's derived level; when it does we lower the display but never claw back
// skill points or stats, and we don't re-grant them if they climb back.
function syncLevel() {
  if (!PROGRESSION.length) return 0;              // no table: leave the saved level alone
  const target = levelFromClout(G.clout);
  G.level = target;
  const granted = G.levelGranted || 1;
  let gained = 0;
  for (let l = granted + 1; l <= target; l++) { applyLevelGrants(); gained++; }
  if (target > granted) G.levelGranted = target;
  return gained;
}

// Clout is monotonic — there is no subtractClout, by design. `reason` is required
// so every point is attributable to what produced it; the four sources are Moves,
// fight wins, fight losses and recruiting.
function addClout(amt, reason, ref) {
  if (!(amt > 0)) return;
  credit('clout', amt, reason, { ref: ref || null });
  const leveledUp = syncLevel() > 0;
  if (leveledUp) {
    // The level-up variant of the XP pill (DOM-119): same component, gold
    // ground. The banner stays — it is the bigger, slower celebration.
    if (typeof xpToast === 'function') xpToast(amt, 'LEVEL ' + G.level, true);
    showLevelUp();
    renderJobs();
    renderEnemies();
    if (typeof renderProfile === 'function') renderProfile();
  }
  updateHUD();

  // Rank milestones are a natural "you're invested — claim your account" moment.
  // Throttled + guarded inside Auth; a no-op for registered players and in
  // plain-browser dev.
  if (leveledUp && typeof Auth !== 'undefined' && G.level >= Auth.rankThreshold()) {
    Auth.promptRegister('rank_' + G.level);
  }
}

// Regen lives in js/regen.js — one lazy, timestamp-driven implementation for
// Moves, Stamina and Health. Offline catch-up is not a separate code path: a
// pool is worth whatever its lastTick and the clock say, whenever you ask.

// ─────────────────────────────────────────────
//  LOAD JSON DATA FROM CDN
// ─────────────────────────────────────────────

async function loadGameData() {
  const setProgress = typeof JestSDK !== 'undefined' ? p => JestSDK.setLoadingProgress(p) : () => {};
  let done = 0;
  const track = async (promise) => {
    const result = await promise;
    setProgress(Math.round((++done / 22) * 80)); // files cover 0→80%
    return result;
  };

  try {
    const [jobs, enemies, gear, properties, ranks, tuning, progression, monetization, unlocks, quests, skills, plugs, moves, city, leaderboard, platform, portraits, xpSystem, crewData, slots, storefront, messages] = await Promise.all([
      track(fetch('data/jobs.json').then(r => r.json())),
      track(fetch('data/enemies.json').then(r => r.json())),
      track(fetch('data/gear.json').then(r => r.json())),
      track(fetch('data/properties.json').then(r => r.json())),
      track(fetch('data/ranks.json').then(r => r.json())),
      track(fetch('data/tuning.json').then(r => r.json())),
      track(fetch('data/progression.json').then(r => r.json())),
      track(fetch('data/monetization.json').then(r => r.json())),
      track(fetch('data/unlocks.json').then(r => r.json())),
      // Quest content — a miss degrades to plugs-without-quests, not a dead app.
      track(fetch('data/quests.json').then(r => r.json()).catch(() => [])),
      // Skill / plug / Make Moves / city content (DOM-123). Each degrades to an
      // empty screen rather than a dead app, matching the quests treatment
      // above — none of them gate boot the way tuning and progression do.
      track(fetch('data/skills.json').then(r => r.json()).catch(() => [])),
      track(fetch('data/plugs.json').then(r => r.json()).catch(() => [])),
      track(fetch('data/moves.json').then(r => r.json()).catch(() => null)),
      track(fetch('data/city.json').then(r => r.json()).catch(() => null)),
      track(fetch('data/leaderboard.json').then(r => r.json()).catch(() => null)),
      // Optional config — a miss must not block core data or the loader (T5).
      track(fetch('data/platform.json').then(r => r.json()).catch(() => ({}))),
      // Optional art map — a miss degrades to placeholder circles, not a dead app.
      track(fetch('data/portraits.json').then(r => r.json()).catch(() => null)),
      // Action award weights (DOM-124). A miss means actions pay no Clout bonus
      // — the job and fight grants in jobs.json/enemies.json are unaffected, so
      // this degrades to a quieter game, not a dead one.
      track(fetch('data/xp-system.json').then(r => r.json()).catch(() => null)),
      // NPC roster for CREW. A miss leaves HITTERS/DEALERS empty and MY ROSTER
      // — the real Lieutenants and the invite CTA — still rendering.
      track(fetch('data/crew.json').then(r => r.json()).catch(() => null)),
      // Gear-slot labels and the Store's own shelves. A miss leaves the Store
      // showing gear by raw slot key and no supplies, not a dead app.
      track(fetch('data/slots.json').then(r => r.json()).catch(() => null)),
      track(fetch('data/storefront.json').then(r => r.json()).catch(() => null)),
      // Messages content. A miss leaves the header button disabled rather
      // than opening an empty inbox.
      track(fetch('data/messages.json').then(r => r.json()).catch(() => null)),
    ]);

    JOBS        = jobs;
    ENEMIES     = enemies;
    GEAR        = gear;
    STORE_ITEMS = GEAR;   // transitional alias — same array, not a copy
    PROPERTIES  = properties;
    RANK_NAMES  = ranks;
    TUNING      = tuning;
    PROGRESSION = (progression && progression.levels) || [];
    IAP_PRODUCTS = monetization;
    UNLOCKS      = unlocks;
    QUESTS       = quests || [];
    SKILLS       = skills || [];
    PLUGS        = plugs || [];
    MOVES        = moves || null;
    CITY         = city || null;
    LEADERBOARD  = leaderboard || null;
    PLATFORM    = platform || {};
    XP_SYSTEM   = xpSystem || null;
    CREW_DATA   = crewData || null;
    SLOTS       = slots || null;
    STOREFRONT  = storefront || null;
    MESSAGES    = messages || null;
    PORTRAITS   = {
      enemies: (portraits && portraits.enemies) || {},
      plugs:   (portraits && portraits.plugs)   || {},
    };

  } catch (err) {
    console.error('Failed to load game data:', err);
  }
}

// ─────────────────────────────────────────────
//  BOOT
// ─────────────────────────────────────────────

async function init() {
  if (typeof JestSDK !== 'undefined') {
    await JestSDK.init();
    JestSDK.setLoadingProgress(0);
    G.playerId = JestSDK.getPlayer().playerId;
  }

  // Read guest vs registered before anything schedules notifications.
  await Auth.init();

  await loadGameData(); // progress: 0 → 80%

  // Nothing below here is safe without tuning data — every balance number comes
  // from it. Stop rather than run the economy on whatever the code happens to hold.
  if (!assertTuningReady()) return;

  // The level table gets the same gate: an empty PROGRESSION silently disables
  // all levelling (syncLevel returns 0, the HUD reads "MAX"), which a shape
  // change in a CDN-deployed progression.json would otherwise cause without a
  // single console error.
  if (!PROGRESSION.length) {
    bootFail('data/progression.json is missing, empty, or has no `levels` array — the game cannot start.');
    return;
  }

  const saved = await GameState.load();
  if (saved) {
    GameState.apply(saved);
    // Level is derived, so reconcile it against the current table on every load.
    // This is what makes the curve retunable without a migration.
    syncLevel();
    regenAll();          // offline catch-up — the same call the timer makes
    log('Welcome back. Your empire awaits.', 'info');
  } else {
    applyStartingState();
    G.lastSeen = Date.now();
    log('Moves refill every ' + tune('pools.moves.regenSeconds') + ' seconds. Stack your bread.', 'info');
  }

  // Init crew — checks entry payload for invite, fetches member count
  await Crew.init();

  // Init payments — fetches product list, recovers any incomplete purchases
  await Payments.init();

  // Schedule everything that applies (re-engagement, income, moves) — or, for
  // a guest, clear anything an older build scheduled for them.
  Notify.scheduleAll();

  if (typeof JestSDK !== 'undefined') JestSDK.setLoadingProgress(90);

  renderJobs();
  renderEnemies();
  renderStore();
  renderProps();
  if (typeof msgRenderBadge === 'function' && MESSAGES) msgRenderBadge();
  renderHospital();   // releases lazily if the timer ran out while away (DOM-72)
  updateHUD();

  // Seed the whole nav from one call so the bottom tab and section label can't
  // drift out of step with the markup's starting screen. The client used to
  // boot onto ACTIVITIES, which was never one of the tabs — with that screen
  // gone (DOM-142) the landing screen is The Hood, the bar's first tab.
  showTab('map');

  if (typeof JestSDK !== 'undefined') JestSDK.setLoadingProgress(100); // dismisses loading overlay

  // Display refresh only. Regen is computed from timestamps on read, so this
  // interval changes nothing about how much a player earns — it just means the
  // meters move while they watch. One timer, not two: the old pair kept a
  // separate `lastSeen` clock for offline catch-up, which could disagree with
  // the per-pool ticks.
  setInterval(() => {
    G.lastSeen = Date.now();
    if (regenAll() > 0) { updateHUD(); GameState.save(); }
    // Hospital countdown + lazy discharge ride the same heartbeat (DOM-72).
    if (G.hospitalizedUntil !== null) { renderHospital(); updateHUD(); }
  }, 10000);
}

init();
