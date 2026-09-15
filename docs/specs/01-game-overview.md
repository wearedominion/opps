# 01 — Game Overview

**Status:** v1.1 · Authoritative (refreshed 2026-09-12 to the post-migration world: Clout,
Cash-only, three pools, generated catalogs)
**Read before:** pitching or scoping any feature.

This document defines *what OPPS is*: the platforms it runs on, the features it ships, and the
**core tenets** that every change must respect. If a feature idea conflicts with a tenet in §2,
the feature is wrong.

---

## 1. What OPPS is

OPPS — *Street Empire* — is a **mobile-first, incremental street RPG** delivered through the
[Jest](https://jest.com) platform, which runs games inside RCS / iMessage conversations. The
player builds a criminal empire from the ground up: running jobs ("moves"), fighting rivals
("opps"), buying gear, acquiring income-producing properties ("spots"), and growing a crew — all
from a single tap in their messaging app.

- **Genre:** incremental / idle RPG with active combat and social (crew) mechanics. Closest
  reference point: **Mafia Wars** — simple and easy to play, but with **rich graphics**.
- **Multiplayer model:** **asynchronous**, not real-time/synchronous. Players affect each other
  through referrals/crew and shared content, never through live synchronous sessions.
- **Session shape:** short, frequent sessions gated by **three regenerating pools** — Moves
  (PvE), Stamina (fights), Health — at data-driven rates (`data/tuning.json` → `pools`).
- **Tone:** dark, gritty, stylized crime-empire fiction. (Fictional throughout — see §5.)
- **Business model:** free to play, **no hard currency in v1** — purchases are direct
  (pool refreshes and heals, `data/monetization.json`) through Jest's in-app payments; plus
  social features. The prototype's Gems currency was removed with the v3 save migration.

---

## 2. Core tenets (the things you MUST NOT break)

These are the load-bearing pillars. **Every PR is implicitly evaluated against them.**

### T1 — Zero friction
The player taps a link and is playing in seconds. **No installs, no app store, no login walls,
no account creation.** Any feature that adds a mandatory setup step, blocks first play behind a
network round-trip that can fail, or requires the player to leave the conversation, **violates
T1**.

### T2 — Instant, tiny, resilient, everywhere
OPPS loads over a messaging surface on real-world mobile connections. The game **MUST** boot
fast and small — **no long loading times, no massive memory consumption** — and **MUST** run on
**as wide a variety of devices as possible** (iOS and Android, old and new). It **MUST** degrade
gracefully when anything optional is unavailable (offline, slow CDN, missing SDK, WebGL
disabled). See T5. Rich graphics are a goal, but never at the cost of the device-reach or
memory budget.

### T3 — The Jest platform is the runtime, not a hard dependency at dev time
Every Jest SDK call **MUST** be feature-detected (`typeof JestSDK !== 'undefined'`) with a local
fallback so the game is fully playable in a plain browser during development. The SDK is required
in production for platform features (save sync, payments, crew, notifications) but its *absence*
must never crash the game.

### T4 — Data-driven content (JSON-first, remotely deployable)
Balance and content — jobs, enemies, items, spots, ranks, **object prototypes, monetization
config, and store packs** — live in **JSON data files**, not in code. Adding or tuning content
**MUST NOT** require JavaScript changes. **JSON is the required format for all game data**;
deviating from JSON is highly discouraged and any exception **MUST** be explicitly called out and
justified in a TDD. Game data is **deployable on demand**: a developer edits JSON, it is deployed
to the cloud/CDN, and all clients consume the new data without a game code release. See
[`04-game-data-spec.md`](./04-game-data-spec.md).

### T5 — Graceful degradation everywhere
Sound, the 3D map, remote notifications, payments, and crew are **enhancements**. If any of them
fail to load or are unsupported, the core game (jobs → combat → economy → progression) **MUST**
remain fully playable. Wrap optional subsystems in try/catch and null-guards.

### T6 — Single persistence seam
All save/load flows through the `GameState` abstraction in `js/state.js`. This is the **only**
place that knows whether we're on Jest or localStorage. Do not scatter `localStorage` or
`JestSDK.data` calls through the codebase. See [`03-game-architecture.md`](./03-game-architecture.md).

### T7 — Visual system is fixed
All UI follows [`CLAUDE.md` — UI Implementation Contract](../../CLAUDE.md). No new
colors, fonts, radii, or shadows. The dark, gritty aesthetic is part of the product.

### T8 — Fiction stays fiction
OPPS depicts a fictional criminal underworld for entertainment. Content **MUST NOT** provide
real-world instructions for crime, drug synthesis, weapons manufacture, or violence, and **MUST
NOT** target or depict real people. Keep it stylized and game-mechanical.

### T9 — Everything ships through the pipeline
Both **game builds** and **game data** are validated and deployed through a **CI/CD pipeline**
(preferably GitHub-based). The pipeline conditions data/code, runs **unit, regression, and (where
required) e2e tests**, and promotes to **test** then **production** environments. Data and code
**SHOULD NOT** be hand-deployed to production outside this pipeline. See
[`06-technical-requirements.md`](./06-technical-requirements.md) and
[`07-external-systems.md`](./07-external-systems.md).

---

## 3. Platforms supported

| Surface | Support | Notes |
|---|---|---|
| **Jest platform (RCS / iMessage)** | ✅ Primary target | The shipping surface. Game runs inside the Jest webview; state, identity, wallet, and notifications come from the Jest SDK. |
| **Mobile web browser (iOS Safari, Android Chrome)** | ✅ Fully supported | Primary dev/test surface. Uses `localStorage` fallback; SDK-gated features (payments, crew, remote notifications) are inert but the core game works. |
| **Desktop browser** | ✅ Works | Used for development. Layout is mobile-first; navigation is a five-tab bottom bar (Chrome Money contract — the old sidebar/drawer is gone). |
| **Native app stores (iOS/Android)** | ❌ Not a target | OPPS is deliberately store-free. Do not add Cordova/Capacitor/native wrappers (see [`02-tech-architecture.md`](./02-tech-architecture.md)). |

**Orientation:** portrait, mobile-first. **Minimum baseline:** a modern evergreen mobile browser
with ES2017+ JavaScript, `fetch`, and `localStorage`. WebGL is **optional** (3D map only).

---

## 4. Feature inventory (as shipped)

Each feature maps to a tab in the UI (`index.html`) and one or more systems in `js/`. See
[`03-game-architecture.md`](./03-game-architecture.md) for the code behind each.

### 4.1 Core progression
- **Clout & levels** — a single progression stat, **Clout** (the old `xp` + `rep`, merged
  2026-09-11). Level is **derived** from lifetime Clout against `data/progression.json`
  (120 levels, `round(100 · 1.10^L)`, ~92.7M lifetime to cap) — never stored, so the curve is
  retunable with no migration. The `×1.6` curve this section used to describe is gone.
  **The curve is decided; do not carry it as open.** See `data/README.md` and
  [`08-economy-schema.md`](./08-economy-schema.md) §3.
- **Ranks** — 100 titles in `data/ranks.json`, **spread** across the 120-level cap (one or two
  levels each), layered on the Clout-driven level. Leveling refills all three pools, grants
  skill points (`skillPointsPerLevel`), and applies the automatic stat gains in
  `tuning.progression.autoStatGainPerLevel` — all data, no literals.
- **Three pools** (`G.moves` / `G.stamina` / `G.health`, one shared shape) — **Moves** gates
  jobs, **Stamina** gates fights (1 per fight, charged at entry), **Health** is combat HP.
  All three regenerate through one timestamp-based engine (`js/regen.js`) at rates read from
  `data/tuning.json` → `pools` (currently 300s / 180s / 60s per tick), so they accrue while
  the game is closed. Max pools grow via skill points and level-up grants.
- **The Hospital** — reaching 0 Health hospitalizes (`G.hospitalizedUntil`, 30-min timer):
  no fighting or resting, health regen paused; discharge by timer, a prorated Cash heal, or
  level-up. See [`08-economy-schema.md`](./08-economy-schema.md) §9.8.
- **Cash (soft currency `$`)** — the **only** currency, and the only at-risk stat (a defeat
  costs a share of the wallet). Earned from jobs, fights, and Spot income; every movement
  goes through the ledger (`js/ledger.js` `credit`/`debit` with a reason code).
- The prototype's separate **Rep** merged into Clout, and **Gems** were removed — direct
  purchase SKUs (`data/monetization.json`) replaced them.

### 4.2 The Hood (`hood` tab)
Status dashboard + quick activities: **Collect** (pull Spot income), **Rest** (spend Moves to
heal — blocked while hospitalized), **Launder** (rate currently **zeroed** — it minted from the
player's own balance; see 09 §4 finding F1). The **Hospital card** renders here while
hospitalized.

### 4.3 Moves (`jobs` tab)
Repeatable jobs (`data/jobs.json`, **generated** to level 110 by
`tools/econ-sim/gen-catalog.js`) that cost Moves and pay Cash + Clout. Jobs are level-gated;
mastery (`times`) is **cosmetic** — the meter fills once and the job stays runnable (DOM-71).

### 4.4 Opps List / Combat (`fight` tab)
Fight enemies (`data/enemies.json`, generated — ATK/DEF solved so band matchups sit near
p=0.5). Combat is an interactive **turn-based round loop** (HIT 'EM / RUN) on one pure model,
`js/fightmath.js`, shared by the client and the economy simulator. Entering costs 1 Stamina.
Win → Cash + Clout. Lose → lose `loot.defeatLossRate` (10%) of Cash and wake up in the
**Hospital** (see §4.1).

### 4.5 Plugs (`plugs` tab)
NPC "connect" characters with portraits and multi-line dialog (narrative/flavor; currently
in-session only). Data is defined in `js/plugs.js`.

### 4.6 The Plug / Store (`store` tab)
Buy gear (`data/gear.json`, **generated** — prices are hours-of-income at each item's level
gate) that boosts attack/defense; owned gear is **upgradeable** (`upgradeGear`, geometric cost,
stat cap at LV 10 with cosmetic prestige beyond — DOM-88). Ownership is own-once per item
(duplicates tracked for a future consumption rule). Also hosts the direct-purchase SKU section
(`js/payments.js`, `data/monetization.json`) — pool refreshes and heals, no hard currency.

### 4.7 Spots / Properties (`props` tab)
Buy Spots (`data/properties.json`, generated — priced at an exact 7-day payback) that **accrue**
passive income against a per-Spot timestamp, clamped by an offline cap that grows with level;
collected from the Hood. Ownership is **own-once per Spot** — the ladder, not stacking, is the
growth path (DOM-74; the prototype's BUY MORE stacking is gone).

### 4.8 Crew (`crew` tab)
Referral-based social system. Inviting players via the Jest referral link grows your crew;
each member grants +2 ATK / +1 DEF. SDK-gated (`js/crew.js`).

### 4.9 Map (`map` tab)
Interactive stylized city map: a pan/zoom 2D SVG view (`js/map.js`) with an optional WebGL
**3D night-city view** (`js/map3d.js`, Three.js, lazy-loaded).

### 4.10 Stats (`stats` tab)
Read-only summary of rank, level, Clout, attack/defense, Cash, income, jobs done, and inventory.
The **Player Profile** (`js/profile.js`) carries skill-point allocation and gear equipping.

### 4.11 Cross-cutting systems
- **Notifications** (`js/notifications.js`) — schedules Jest push notifications (Moves full,
  income ready, re-engagement).
- **Sound** (`js/sound.js`) — Web Audio click/win/loss tones; no assets, degrades silently.
- **HUD / Feed / Toast** (`js/hud.js`, `js/ui.js`) — persistent stat header, event log, transient
  toasts.

---

## 5. Roadmap & known stubs

Current direction (see also [`../../README.md`](../../README.md)):

- Deeper crew mechanics via the Jest SDK.
- Server-side purchase grants (the SKU → grant mirror; client verifies receipts today — DOM-80)
  and, further out, server-authoritative gameplay writes.
- The matchmaking search/shortlist/reroll surface (`matchmaking.*` tuning exists; nothing reads
  it yet).
- Full Jest SDK integration (state, wallet, identity, referrals, notifications, payments).
- Enemy / item / property artwork to replace placeholders.
- Evaluation of a Godot migration for a potential v2 (out of scope for the current HTML5 build —
  do not build toward it without a TDD).

**Known stubs / inconsistencies to be aware of** (documented, not yet resolved):

- `js/crew.js` social depth is partial, pending Jest SDK capabilities.
- Plug dialog progress is **in-session only** (not persisted).
- Some content lives in JS rather than JSON (plug definitions in `js/plugs.js`; the enemy
  portrait map in `js/combat.js` — threat is now computed from the fight model, not a map). New
  content of these types should follow the data-first tenet (T4) where practical — see
  [`04-game-data-spec.md`](./04-game-data-spec.md) §6.

---

## 6. Definitions of "done" for a feature

A player-facing feature is not done until:

1. It respects every tenet in §2.
2. It works in the **plain-browser** fallback (no SDK) and on the **Jest** surface.
3. Its content (if any) is in JSON per [`04-game-data-spec.md`](./04-game-data-spec.md).
4. Its UI matches [`CLAUDE.md` — UI Implementation Contract](../../CLAUDE.md).
5. It persists correctly through `GameState` (or explicitly documents why it is session-only).
6. It has a reviewed TDD (see [`06-technical-requirements.md`](./06-technical-requirements.md)).
