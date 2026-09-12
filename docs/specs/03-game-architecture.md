# 03 — Game Architecture

**Status:** v1.1 · Authoritative (refreshed 2026-09-12: Clout/ledger era — `addXP`,
`G.money`/`G.rep`/`G.gems` and the nav drawer are gone)
**Read before:** writing or modifying any game system (`js/*.js`).

This document defines **how the game is structured in code**: the required systems, the module
pattern every system follows, the state model, the boot sequence, and the exact recipe for adding
a new system without breaking anything.

---

## 1. Mental model

OPPS is a **single-page, tab-based application** with no framework. It is organized as a set of
**independent systems**, each in its own file under `js/`, coordinated by three shared concerns:

- **State** — one global object `G` (the save game) behind the `GameState` persistence seam.
  Every balance change to `G` goes through the **ledger** (`js/ledger.js` `credit`/`debit` with
  a reason code) — systems never mutate `G.cash` or a pool directly.
- **Data** — content loaded from JSON into module-level arrays at boot; constants read through
  `tune()`/`tuneCurve()` (`js/tuning.js`), which **throws** on a missing path rather than guess.
- **UI shell** — `index.html` defines every tab and overlay; systems render into fixed element
  IDs and are shown/hidden by `showTab()`. Navigation is a five-tab bottom bar (Hood, Map,
  Moves, Opps, Empire) with the Empire screens behind a chip row — the old sidebar drawer is
  gone (Chrome Money contract in [`CLAUDE.md`](../../CLAUDE.md)).

```
          ┌─────────────────────────────────────────────┐
          │                 index.html                   │
          │ header/HUD · bottom tab bar · tab containers │
          │  overlays (combat, plug, level-up, toast)    │
          └───────────────┬──────────────────────────────┘
                          │ element IDs
   ┌──────────────────────┼───────────────────────────────────┐
   │        SYSTEMS (js/*.js, plain <script> load order)       │
   │  hood jobs combat hospital store properties plugs crew    │
   │  map map3d stats profile notifications payments sound     │
   │  hud ui auth                                              │
   └──────────────────────┬───────────────────────────────────┘
                          │ credit/debit (js/ledger.js) + reads
             ┌────────────▼───────────┐        ┌──────────────────┐
             │   G  (game state)      │◄──────►│  GameState        │
             │   js/state.js          │  save  │  (localStorage /  │
             └────────────▲───────────┘  load  │   Jest SDK)       │
                          │                     └──────────────────┘
             ┌────────────┴───────────┐
             │  DATA arrays + TUNING  │  loaded once at boot from data/*.json
             │  JOBS ENEMIES STORE…   │  read via tune()/tuneCurve()
             └────────────────────────┘
```

---

## 2. Required systems & components

These systems exist today and are **load-bearing**. Understand the ones you touch. Do not merge
their responsibilities.

| File | Global surface | Responsibility |
|---|---|---|
| `js/state.js` | `G`, `GameState`, `SCHEMA_VERSION`, `migrate`, `ownsGear`/`gearInstance`/`grantGear` | The save-game object, the save migrations, **and** the single persistence seam (save/load/apply). |
| `js/tuning.js` | `tune`, `tuneCurve`, `missingTuningPaths`, `TUNING_REQUIRED` | Reads `data/tuning.json` by dotted path; **throws** on missing values — no silent defaults. |
| `js/ledger.js` | `credit`, `debit`, `REASON`, `ledgerRows`, `ledgerSummary` | The one funnel every balance change goes through: clamps, records a reasoned row, returns the applied delta. |
| `js/progression.js` | `levelFromClout`, `cloutToReach`, `cloutProgress`, `rankForLevel` | Pure Clout → level/rank derivation against `data/progression.json` (also required by node for the sim/tests). |
| `js/regen.js` | `regenPool`, `regenAll`, `secondsToFull` | ONE timestamp-based regen engine for all three pools; pauses health while hospitalized. |
| `js/unlocks.js` | `isUnlocked`, `lockLabel` | Level/rank gating for content rows. |
| `js/ui.js` | `$`, `showTab`, `log`, `toast`, `rand`, `showLevelUp` | Shared UI helpers used by everyone; owns the bottom tab bar + Empire chip row. |
| `js/auth.js` | `Auth` | Guest vs registered identity (SDK-gated). |
| `js/hud.js` | `updateHUD`, `collectIncome` | Renders the persistent stat header; computes Spot income. |
| `js/main.js` | `init`, `addClout`, `syncLevel`, `applyLevelGrants`, `loadGameData` | Boot orchestration, Clout awards + level derivation + level-up grants, JSON loading. |
| `js/jobs.js` | `renderJobs`, `doJob` | Moves tab (the jobs content ladder). |
| `js/fightmath.js` | `fmRatio`, `fmRound`, `fmFight`, `fmStats`, `fmSeededRng` | The pure combat round model — shared verbatim by the client, the simulator and the catalog generator. |
| `js/hospital.js` | `isHospitalized`, `hospitalize`, `syncHospital`, `hospitalHealNow`, `renderHospital` | The defeat lockout: timer, prorated Cash early-out, Hood-tab card. |
| `js/combat.js` | `renderEnemies`, `startCombat`, `hitEm`, `runAway`, `closeCombat` | Opps list + the interactive turn-based round loop (driven by `fightmath.js`). |
| `js/store.js` | `renderStore`, `buyItem`, `upgradeGear` | The Plug (gear) tab: purchases + the upgrade track. |
| `js/properties.js` | `renderProps`, `buyProp`, `collectSpots` | Spots (accruing passive income) tab. |
| `js/hood.js` | `doActivity` | Hood activities (collect / rest / launder). |
| `js/stats.js` | `renderStats` | Stats tab. |
| `js/profile.js` | `renderProfile`, skill allocation + equip pickers | Player Profile (skill points, equipped gear). |
| `js/plugs.js` | `renderPlugs`, `openPlug`, `advancePlug`, `closePlug`, `PLUGS_DATA` | NPC connects + dialog modal. |
| `js/crew.js` | `Crew`, `renderCrew`, `crewRefresh` | Referral-based crew system (SDK-gated). |
| `js/map.js` | `GameMap` | 2D pan/zoom SVG city map. |
| `js/map3d.js` | `Map3D`, `toggleMap3D` | Optional WebGL 3D map (Three.js, lazy-loaded). |
| `js/payments.js` | `Payments`, `renderIapSection` | Direct-purchase SKUs from `data/monetization.json` (no hard currency), server receipt verify before grant (SDK-gated). |
| `js/notifications.js` | `Notify` | Scheduled Jest push notifications (SDK-gated). |
| `js/sound.js` | `Sound` | Synthesized Web Audio feedback (no assets). |

> A change that adds a new player-facing feature almost always means **a new file here**, not
> edits sprawled across existing ones. See §6.

---

## 3. The state model (`G` + `GameState`)

### 3.1 `G` — the save game
`G` (in `js/state.js`) is a single plain object holding **all persistent player state**. The
current shape (`SCHEMA_VERSION` 4 — the `G` literal in `js/state.js` is the source of truth):
`schemaVersion` · `clout` (lifetime, cumulative — the progression source of truth) · `level` +
`levelGranted` (derived cache + reward high-water mark) · `cash` · the three pools `moves` /
`stamina` / `health` (one shared `{current, max, lastTick}` shape) · `attack` / `defense` ·
`hospitalizedUntil` (epoch ms or null) · `inventory` (`{itemId: {level, duplicates}}`) ·
`properties` + `spots` (per-Spot accrual anchors) · `jobProgress` · `skillPts` + `equipped` ·
identity/social fields (`playerId`, `lastSeen`, `crewMemberCount`, `lieutenantsRewarded`,
`recruitedBy`, `lastRegisterPromptAt`). See [`08-economy-schema.md`](./08-economy-schema.md) §3
for the field-by-field contract. The prototype's `xp`/`xpNext`/`rep`/`money`/`energy`/`gems`
fields no longer exist — the migrations in §3.4 rewrite old saves.

**Rules:**
- **All persistent player state lives on `G`.** If your feature needs to remember something across
  sessions, it is a field on `G` — not a separate `localStorage` key, not a module global.
- **New fields MUST be additive and safe-by-default.** `GameState.apply()` does
  `Object.assign(G, saved)`, so a returning player's save won't contain your new field. Give it a
  sensible default in the `G` literal, and **never assume it exists** — read with a fallback
  (`G.spots[id] || null`, `G.properties[id] || 0`).
- **Do not rename or repurpose existing fields.** Old saves depend on them. Migrate additively.
- Keep `G` **JSON-serializable** (no functions, DOM nodes, class instances, or circular refs) —
  it is round-tripped through `JSON.stringify`/SDK storage.

### 3.2 `GameState` — the persistence seam (tenet T6)
`GameState` is the **only** code that knows whether we persist to `localStorage` (dev) or the Jest
SDK (prod):

```js
GameState.save()   // writes G to JestSDK.data or localStorage
GameState.load()   // returns saved object or null
GameState.apply(s) // Object.assign(G, s)
```

**This is the returning-player mechanism.** On Jest, `G` is the player's saved state, persisted
through the Jest **Player data** store and read back when they return to the game — across
sessions *and* devices. `GameState` maps directly onto the Jest Player API:

- **Reference:** Jest SDK overview → <https://docs.jest.com/sdk> ·
  Player data (save/retrieve) → <https://docs.jest.com/sdk/player>
- **Under the hood** (inside `js/state.js` only): save uses `JestSDK.data.set('g', G)`; load uses
  `JestSDK.data.getAll()` and reads the `g` key. The Player store also offers
  `JestSDK.data.get(key)`, `.delete(key)`, and `.flush()` — see below.

**Rules:**
- **Never call `localStorage` or `JestSDK.data.*` outside `js/state.js`.** Everywhere else, call
  `GameState.save()` / `GameState.load()`.
- **Call `GameState.save()` after any mutation of `G`** that should persist (see the action
  pattern in §5.2). Existing systems save at the end of each user action.
- Persistence is **async**; treat `save()`/`load()` as promises. Don't block UI on them.
- **Respect the Jest Player-store constraints** (per the docs): stored data is capped at **1 MB
  per app** and must be **JSON-serializable**, and reads are **snapshots** — mutating a loaded
  object does not persist until you `set` again. Keep `G` compact; do not let it grow unbounded
  (e.g. ever-growing logs/history belong outside the save or in a bounded structure).
- **Durability (recommended enhancement):** for saves that must not be lost — a completed
  purchase, a returning-player-critical checkpoint — `GameState.save()` SHOULD `await`
  `JestSDK.data.flush()` after the `set` so the platform acknowledges the write. And the game
  SHOULD save on **App lifecycle** background/exit events (<https://docs.jest.com/sdk> → App
  lifecycle) rather than relying only on the periodic timer, so returning players never lose
  progress. Both are additive to `GameState` and keep the seam intact. *(Not yet implemented —
  see the Jest integration map in [`07-external-systems.md`](./07-external-systems.md) §2.)*

### 3.3 Data arrays
Content is loaded once at boot into module-level globals declared in `js/main.js`: `JOBS`,
`ENEMIES`, `STORE_ITEMS`, `PROPERTIES`, `RANK_NAMES`, `PROGRESSION`, `IAP_PRODUCTS`, `UNLOCKS`,
and `TUNING` (read only through `tune()`/`tuneCurve()`). Systems read these to render. They are
**content, not state** — never mutate them at runtime, and never persist them into `G`. The
faucet/sink catalogs (jobs, enemies, store, properties) are **generated** by
`tools/econ-sim/gen-catalog.js` against the ratified pacing targets — hand-editing a payout
invalidates the solve ([`09-economy-pacing-targets.md`](./09-economy-pacing-targets.md)).

### 3.4 Save versioning & migration (implementation pattern)

The **policy** for save compatibility lives in
[`04-game-data-spec.md`](./04-game-data-spec.md) §7. This section is the **code pattern** that
implements it — and it lives **entirely inside `js/state.js`**, behind the `GameState` seam, so no
other system knows migrations exist.

**Why lazy client-side migration:** OPPS has no authoritative game server that owns saves — each
save is a single per-user blob in the Jest Player store, read/written by the client. So the
correct migration point is **the client, at load**: each player upgrades their own save the next
time they open the game. This is naturally sharded (no batch job, no contention) and spreads the
cost over time.

**The mechanism:** stamp `G` with an integer `schemaVersion`. On load, run migrations
**sequentially, in memory**, from the stored version up to `SCHEMA_VERSION`, then write once.

```js
const SCHEMA_VERSION = 4;                 // bump by exactly 1 per BREAKING change

// Each migration is PURE: (save) -> save, and sets schemaVersion to the next number.
// The REAL chain (js/state.js — see its comments for the full reasoning):
const MIGRATIONS = {
  1: (s) => { /* xp + xpNext + rep -> cumulative clout */          s.schemaVersion = 2; return s; },
  2: (s) => { /* money -> cash; energy/stamina/health -> the
                 shared pool shape; gems removed */                s.schemaVersion = 3; return s; },
  3: (s) => { /* inventory array-of-ids -> per-instance map */     s.schemaVersion = 4; return s; },
};

function migrate(saved) {
  let s = saved, v = s.schemaVersion || 1;           // pre-versioning saves == v1
  if (v > SCHEMA_VERSION) return { save: s, fromFuture: true }; // newer save (other device)
  while (v < SCHEMA_VERSION) { s = MIGRATIONS[v](s); v = s.schemaVersion; }
  return { save: s, fromFuture: false };
}

// GameState.load(): parse -> migrate() in memory -> return save (apply()).
// If migrate changed the version, GameState.save() once and await JestSDK.data.flush().
// If fromFuture: apply defensively and DO NOT overwrite the store from this stale client.
```

**Implementation rules (MUST):**
- **Migrate fully in memory, then write once.** Never persist intermediate versions between steps.
  If the app is killed mid-migration, nothing was written and the next launch re-runs the whole
  chain from the original version. (The save is a single key → atomic at the store level.)
- **Pair the post-migration write with `flush()`** so the upgraded save is acknowledged (see
  §3.2). 
- **Additive changes are NOT migrations.** A new field with a default in the `G` literal is filled
  automatically by `apply()`'s `Object.assign` — no migration needed. Only **breaking** changes
  (rename, restructure, remove, re-key, unit change) get a migration and a version bump.
- **Migrations are pure & deterministic** — no `Date.now()`, no RNG, no dependence on loaded
  content/`DATA`. This makes them unit-testable and safe to re-run.
- **Guard the "save from the future."** If `schemaVersion > SCHEMA_VERSION`, do **not** migrate
  down; load what you can and avoid overwriting the store from the stale client (see the policy in
  [`04-game-data-spec.md`](./04-game-data-spec.md) §7 for why this matters with multi-device sync
  and stale caches).
- **Every migration ships with a golden-file test** (fixture at version N → asserts the exact
  version-CURRENT result). This is a CI regression gate
  ([`06-technical-requirements.md`](./06-technical-requirements.md) §4).

---

## 4. Boot sequence & script load order

### 4.1 Load order is a contract
`index.html` loads scripts as plain `<script>` tags **in a fixed order**. Because systems share
globals, **order matters**. The current order is:

```
jestsdk.js (external) → state → tuning → ledger → progression → regen →
unlocks → ui → auth → sound → map → hud → jobs → fightmath → hospital →
combat → store → properties → hood → stats → profile → crew → plugs →
notifications → payments → map3d → main
```

**Rules:**
- `js/state.js` loads first (everything needs `G`/`GameState`). `js/ui.js` loads early (everything
  needs `$`, `log`, `toast`). `js/main.js` loads **last** and calls `init()`.
- A new system's `<script>` tag goes **after its dependencies and before `main.js`**. If your
  system is optional/heavy (like `map3d.js`), place it late and lazy-load its library.
- Do not rely on load order for anything except *definition* availability. Runtime wiring happens
  in `init()` and in `showTab()` — not at script-parse time.

### 4.2 `init()` (in `js/main.js`)
Boot does, in order: SDK `init()` (if present) + capture `playerId` → `Auth.init()` →
`loadGameData()` (JSON, drives loading progress 0→80%) → `GameState.load()` (migrations run
inside the seam) + apply + `regenAll()` offline catch-up → `Crew.init()` → `Payments.init()` →
`Notify.scheduleAll()` → initial renders (`renderJobs`, `renderEnemies`, `renderStore`,
`renderIapSection`, `renderProps`, `renderHospital`, `updateHUD`) → `showTab('hood')` → SDK
loading progress 100% → one 10-second heartbeat (display refresh + save when regen credited;
regen itself is timestamp-based, so the interval never changes what a player earns).

**If your system needs boot-time setup**, add a single call in `init()` at the right point, and
make it **null-safe and SDK-guarded**. Follow the existing `Crew.init()` / `Payments.init()`
pattern (both no-op cleanly when the SDK is absent). **Never let a boot step throw** — wrap
fallible work in try/catch so a failure can't stop the game from becoming playable (tenet T5).

### 4.3 Loading progress
When the SDK is present, boot reports progress via `JestSDK.setLoadingProgress(0..100)`; reaching
100 dismisses the platform loading overlay. If you add meaningful boot work, keep the progress
monotonic and always reach 100 — even on error paths.

---

## 5. The module pattern (how systems are written)

Two shapes are used. Match the one closest to your system; do not invent a third.

### 5.1 Namespaced object / IIFE (for systems with private state)
Used by `Sound`, `Crew`, `Payments`, `Notify`, `GameMap`, `Map3D`, `Auth`. Encapsulate internals;
expose a small API on one global:

```js
const MySystem = (() => {
  let _private = null;              // module-private state (NOT persistent player state)
  function _helper() { /* ... */ }  // underscore-prefixed = private
  async function init() { /* SDK-guarded, try/catch, null-safe */ }
  function doThing() { /* ... */ }
  return { init, doThing };         // public surface only
})();
```

### 5.2 Render + action functions (for tab-driven content systems)
Used by `jobs`, `combat`, `store`, `properties`, `hood`, `stats`, `plugs`. Two responsibilities:

- **`renderX()`** — rebuild the tab's DOM from `DATA` + `G`. Idempotent; safe to call anytime.
- **`doX(id)` / action handlers** — validate → mutate `G` → give feedback → re-render → save.

The canonical action sequence (follow it exactly):

```js
function doJob(jobId) {
  const job = JOBS.find(j => j.id === jobId);
  if (!job) return;                                          // 1. resolve + guard
  if (G.moves.current < job.moves) { toast('Not enough Moves!', true); return; } // 2. validate cost
  if (!isUnlocked(job)) { toast(lockLabel(job), true); return; }
  debit('moves', job.moves, REASON.MOVE_COST, { ref: { jobId: job.id } });  // 3. spend (ledger)
  const earned = rand(job.cash[0], job.cash[1]);
  credit('cash', earned, REASON.MOVE_PAYOUT, { ref: { jobId: job.id } });   // 4. grant (ledger)
  addClout(job.clout, REASON.MOVE_PAYOUT, { jobId: job.id }); // 5. Clout via the shared helper
  log(`${job.name} — earned $${earned} + ${job.clout} Clout`, 'win'); // 6. feed line (no emoji)
  toast(`+$${earned} | +${job.clout} CLOUT`);                // 7. transient toast
  updateHUD();                                                // 8. refresh HUD
  renderJobs();                                               // 9. refresh this tab
  GameState.save();                                           // 10. persist
  Notify.movesFull();                                         // 11. (optional) schedule notification
}
```

> **Naming decision (DOM-70, 2026-09-12):** the `jobs` identifiers (`jobs.js`, `jobs.json`,
> `JOBS`, `renderJobs`, `doJob`) deliberately do NOT rename to `moves`. "Moves" names the pacing
> **pool** (`G.moves`, `pools.moves`, `REASON.MOVE_COST`); "jobs" names the **content ladder** the
> pool is spent on — the same two-things collision `oppsDefinitions.md` flags, resolved by giving
> each thing its own name rather than one name to both. Only the nav label says MOVES, because the
> player sees the activity, not the pool. One more deliberate survivor: the `--energy-fill` CSS
> token, which the Chrome Money contract specifies by name — it renames when that contract does.

**Every state-mutating action MUST:** validate before mutating, give the player feedback
(`toast` and/or `log`), call `updateHUD()` if HUD-visible stats changed, re-render its tab, and
call `GameState.save()`.

### 5.3 Rendering rules
- Render into the **fixed element IDs** defined in `index.html`. If your system needs a new tab or
  overlay, add its container to `index.html` and wire it into the nav + `showTab()`.
- Use the `$(id)` helper from `js/ui.js`; never re-implement DOM lookups.
- **Never hardcode colors/spacing/fonts** — use classes and tokens from
  [`CLAUDE.md` — UI Implementation Contract](../../CLAUDE.md) (tenet T7). Prefer adding a
  class to `css/styles.css` over long inline styles.
- Guard DOM access: elements can be absent (`const el = $('x'); if (!el) return;`), as combat/map
  code does. This keeps systems resilient (tenet T5).
- Re-render lazily where possible: `showTab()` calls `renderStats`, `renderCrew`, `renderPlugs`,
  and `GameMap.init()` on demand. Heavy tabs should render when shown, not eagerly at boot.

### 5.4 Shared helpers you MUST reuse (do not reinvent)
| Need | Use | From |
|---|---|---|
| Element lookup | `$(id)` | `ui.js` |
| Switch tab | `showTab(name)` | `ui.js` |
| Persistent event line | `log(msg, cls)` | `ui.js` |
| Transient message | `toast(msg, isBad)` | `ui.js` |
| Random int in range | `rand(min, max)` | `ui.js` |
| Award Clout + handle level-ups | `addClout(amount, reason, ref)` | `main.js` |
| Grant / spend any balance | `credit(...)` / `debit(...)` + a `REASON` code | `ledger.js` |
| Read a tuning constant / curve | `tune(path)` / `tuneCurve(path, n)` | `tuning.js` |
| Level-gate a content row | `isUnlocked(row)` / `lockLabel(row)` | `unlocks.js` |
| Refresh stat header | `updateHUD()` | `hud.js` |
| Property income total | `collectIncome()` | `hud.js` |
| Save / load | `GameState.save()` / `.load()` | `state.js` |
| Audio feedback | `Sound.click/win/loss()` | `sound.js` |

---

## 6. Adding a NEW system — the recipe

Follow every step. Anything marked **MUST** is a merge gate.

1. **Write a TDD first** ([`TDD-TEMPLATE.md`](./TDD-TEMPLATE.md)) and get it reviewed
   (tenet T9 / [`06-technical-requirements.md`](./06-technical-requirements.md)). **MUST.**
2. **Create `js/<system>.js`.** Pick the module shape from §5. Keep one responsibility per file.
   **MUST.**
3. **Put content in JSON.** If the system has content (definitions, tunables, monetization/store
   config), it goes in `data/<system>.json` per [`04-game-data-spec.md`](./04-game-data-spec.md),
   loaded in `loadGameData()`. **MUST** (JSON-first, tenet T4). Hardcoding content in JS requires a
   called-out exception in the TDD.
4. **Add persistent state as fields on `G`** with safe defaults; read defensively. Never add a new
   storage key. **MUST** (tenet T6).
5. **Add UI to `index.html`** — a tab container and/or overlay, plus a nav item wired to
   `showTab('<system>')` if it's a tab. Match the style guide. **MUST** (tenet T7).
6. **Register the script** in `index.html` in the correct load order (after deps, before
   `main.js`). Lazy-load any heavy library. **MUST.**
7. **Wire boot** — if needed, add one guarded call in `init()`; add a `renderX()` call to the
   initial render block or to `showTab()`.
8. **SDK-gate anything platform-specific** with `typeof JestSDK !== 'undefined'` + a working
   fallback. **MUST** (tenets T3/T5).
9. **Feedback + persistence** — every action follows the §5.2 sequence.
10. **Tests** — add unit tests for logic and regression coverage; e2e if it's a critical flow
    (see [`06-technical-requirements.md`](./06-technical-requirements.md) §4). **MUST** for
    non-trivial logic.
11. **Verify both environments** — plain browser (fallback) and Jest — and confirm the core game
    still boots if your system fails to load.

---

## 7. Cross-cutting rules

- **Progression math lives in `addClout()` / `syncLevel()` / `applyLevelGrants()`** (`main.js`),
  on the pure derivation in `js/progression.js` — level is always **derived** from lifetime
  Clout, never stored as truth. Level-up side effects (pool refills, skill points, auto stat
  gains, Hospital release) belong in `applyLevelGrants()`. Don't duplicate leveling logic
  elsewhere.
- **Economy is `G.cash` and `G.clout`, moved only by the ledger.** Every grant and spend is a
  `credit()`/`debit()` with a `REASON` code (`js/ledger.js`) — never a direct `G.cash +=`. Keep
  the HUD in sync via `updateHUD()`. Money supply is Σ credits − Σ debits by contract
  ([`08-economy-schema.md`](./08-economy-schema.md) §4).
- **Combat outcomes come from one model**: the pure round math in `js/fightmath.js`, driven
  interactively by `combat.js` and reused verbatim by the economy simulator and catalog
  generator. If you add power progression (gear, crew), feed it into the fighter stats there —
  don't fork a second combat resolver.
- **Notifications, payments, crew, sound, and the 3D map are optional enhancers.** Their failure
  is non-fatal by design. Preserve that.
- **No blocking dialogs / `alert` / `confirm` / `prompt`.** Use `toast`, `log`, the feed, and the
  overlay pattern (see combat/plug overlays).
- **Time is timestamp-based, not tick-based** for anything that must survive backgrounding (see
  pool regen using per-pool `lastTick` timestamps (`js/regen.js`)). Don't rely on `setInterval` for
  correctness across sessions.

---

## 8. Anti-patterns (do NOT do these)

- ❌ Reading/writing `localStorage` or `JestSDK.data` outside `state.js`.
- ❌ Mutating a balance directly (`G.cash += x`, `G.moves.current -= y`) instead of going through
  the ledger's `credit`/`debit` with a `REASON` code.
- ❌ Adding a second global state object, or stashing persistent state in module variables.
- ❌ Hardcoding content that should be JSON (jobs, enemies, items, spots, store packs, tunables).
- ❌ Assuming the Jest SDK, WebGL, Web Audio, or a CDN library exists without a guard/fallback.
- ❌ Sprawling a feature across many existing files instead of a new `js/<system>.js`.
- ❌ Inline hex colors / new fonts / arbitrary radii instead of style-guide tokens.
- ❌ Mutating the loaded `DATA` arrays at runtime.
- ❌ Letting a boot step throw and stall the load overlay.
- ❌ Renaming/removing a `G` field that existing saves depend on.
