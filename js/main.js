// ─────────────────────────────────────────────
//  GAME DATA — populated from JSON files
// ─────────────────────────────────────────────

let JOBS = [];
let ENEMIES = [];
let STORE_ITEMS = [];
let PROPERTIES = [];
let RANK_NAMES = [];

// ─────────────────────────────────────────────
//  MAIN — INIT
// ─────────────────────────────────────────────

const SKILL_POINTS_PER_LEVEL = 5;

function addXP(amt) {
  G.xp += amt;
  while (G.xp >= G.xpNext) {
    G.xp -= G.xpNext;
    G.level++;
    G.xpNext = Math.floor(G.xpNext * 1.6);
    G.maxEnergy += 2;
    G.energy = G.maxEnergy;
    G.maxHealth += 15;
    G.health = G.maxHealth;
    G.attack += 3;
    G.defense += 2;
    // Level-up grants 5 skill points and fully refills Stamina, Moves and Health
    // (docs/profileScreen.md §4). Moves == G.energy, refilled above.
    G.skillPts = (G.skillPts || 0) + SKILL_POINTS_PER_LEVEL;
    G.maxStamina = G.maxStamina || 10;
    G.stamina = G.maxStamina;
    // BALANCE FLAG (Bobby): the automatic +3 attack / +2 defense / +15 maxHealth above
    // competes with the 1-point ATTACK / DEFENSE / MAX HEALTH skill sinks, which grant +1.
    // Left as-is deliberately — changing it is an economy decision, not an implementation one.
    showLevelUp();
    renderJobs();
    renderEnemies();
    if (typeof renderProfile === 'function') renderProfile();
  }
  updateHUD();
}

// ─────────────────────────────────────────────
//  ENERGY REGEN — timestamp based
//  Safe when tab is backgrounded or killed
// ─────────────────────────────────────────────

const ENERGY_REGEN_SECONDS = 60; // 1 energy per 60 seconds

function applyOfflineEnergyRegen() {
  const lastSeen = G.lastSeen || Date.now();
  const secondsElapsed = Math.floor((Date.now() - lastSeen) / 1000);
  const energyToAdd = Math.floor(secondsElapsed / ENERGY_REGEN_SECONDS);
  if (energyToAdd > 0) {
    G.energy = Math.min(G.maxEnergy, G.energy + energyToAdd);
  }
}

function tickEnergyRegen() {
  G.lastSeen = Date.now();
  if (G.energy < G.maxEnergy) {
    const lastTick = G.lastEnergyTick || Date.now();
    const secondsElapsed = Math.floor((Date.now() - lastTick) / 1000);
    if (secondsElapsed >= ENERGY_REGEN_SECONDS) {
      G.energy = Math.min(G.maxEnergy, G.energy + 1);
      G.lastEnergyTick = Date.now();
      updateHUD();
      GameState.save();
    }
  }
}

// ─────────────────────────────────────────────
//  LOAD JSON DATA FROM CDN
// ─────────────────────────────────────────────

async function loadGameData() {
  const setProgress = typeof JestSDK !== 'undefined' ? p => JestSDK.setLoadingProgress(p) : () => {};
  let done = 0;
  const track = async (promise) => {
    const result = await promise;
    setProgress(Math.round((++done / 5) * 80)); // files cover 0→80%
    return result;
  };

  try {
    const [jobs, enemies, store, properties, ranks] = await Promise.all([
      track(fetch('data/jobs.json').then(r => r.json())),
      track(fetch('data/enemies.json').then(r => r.json())),
      track(fetch('data/store.json').then(r => r.json())),
      track(fetch('data/properties.json').then(r => r.json())),
      track(fetch('data/ranks.json').then(r => r.json())),
    ]);

    JOBS        = jobs;
    ENEMIES     = enemies;
    STORE_ITEMS = store;
    PROPERTIES  = properties;
    RANK_NAMES  = ranks;

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

  await loadGameData(); // progress: 0 → 80%

  const saved = await GameState.load();
  if (saved) {
    GameState.apply(saved);
    applyOfflineEnergyRegen();
    log('Welcome back. Your empire awaits.', 'info');
  } else {
    G.lastSeen = Date.now();
    G.lastEnergyTick = Date.now();
    log('Moves refill every 60 seconds. Stack your bread.', 'info');
  }

  // Init crew — checks entry payload for invite, fetches member count
  await Crew.init();

  // Init payments — fetches product list, recovers any incomplete purchases
  await Payments.init();

  // Schedule re-engagement (resets timer each session) + income reminder if player has spots
  Notify.reEngage();
  Notify.incomeReady();

  if (typeof JestSDK !== 'undefined') JestSDK.setLoadingProgress(90);

  renderJobs();
  renderEnemies();
  renderStore();
  renderProps();
  updateHUD();

  // Seed the whole nav from one call so the bottom tab, chip row and section
  // label can't drift out of step with the markup's starting screen.
  showTab('hood');

  if (typeof JestSDK !== 'undefined') JestSDK.setLoadingProgress(100); // dismisses loading overlay

  // Energy regen tick — checks every 10s, grants 1 energy per full 60s interval
  setInterval(tickEnergyRegen, 10000);
  // Keep lastSeen current in memory so offline regen is accurate on next load
  setInterval(() => { G.lastSeen = Date.now(); }, 5000);
}

init();
