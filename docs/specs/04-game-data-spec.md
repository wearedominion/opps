# 04 — Game Data Spec

**Status:** v1.0 · Authoritative
**Read before:** adding or changing any content (jobs, enemies, items, spots, ranks,
monetization) or the way data is loaded/deployed.

OPPS is **data-driven** (tenet T4). Content and tunables live in **JSON**, are loaded at boot,
and can be **deployed on demand** to all clients without a game code release. This document is the
contract for that data: formats, schemas, loading, validation, versioning, and deployment.

---

## 1. Principles

- **JSON is the required format for all game data** — content definitions, object prototypes,
  balance tunables, monetization config, and store packs. Deviating from JSON is **highly
  discouraged**; any exception **MUST** be explicitly called out and justified in a TDD.
- **Content, not code.** Adding or tuning content **MUST NOT** require JavaScript changes. If it
  does, the system is under-parameterized — fix the system, then add the content.
- **Additive & backward-compatible.** Live players have saves and cached data. Adding content is
  safe; changing schemas is not (see §7).
- **Small & fast.** Data files stay small and load quickly (tenet T2). Split large content sets
  rather than shipping one huge file.
- **Validated before it ships.** Every data change passes schema validation in CI before it can
  reach a client (tenet T9, §5).

---

## 2. Where data lives & how it loads

- **Location:** `data/*.json`, one file per content domain.
- **Loading:** `loadGameData()` in `js/main.js` `fetch`es all data files in parallel
  (`Promise.all`) at boot and assigns them to the module-level arrays in `js/main.js`:

| File | Loaded into (global) | Consumed by |
|---|---|---|
| `data/jobs.json` | `JOBS` | `js/jobs.js` |
| `data/enemies.json` | `ENEMIES` | `js/combat.js` |
| `data/store.json` | `STORE_ITEMS` | `js/store.js` |
| `data/properties.json` | `PROPERTIES` | `js/properties.js` |
| `data/ranks.json` | `RANK_NAMES` | `hud.js`, `ui.js`, `stats.js` |
| `data/tuning.json` | `TUNING` | economy systems (see [`08-economy-schema.md`](./08-economy-schema.md)) |
| `data/progression.json` | `PROGRESSION` | `js/progression.js`, `js/main.js` |
| `data/monetization.json` | `IAP_PRODUCTS` | `js/payments.js` |
| `data/unlocks.json` | `UNLOCKS` | `js/unlocks.js` |

**Rules:**
- Data files are **arrays of objects**, with three exceptions: `ranks.json` (an array of
  strings), `tuning.json` (a keyed config object — §3.8), `progression.json` (an object
  wrapping a `levels` array — §3.7), and `unlocks.json` (a keyed capability object — §3.6). Keep that shape.
- Every content object has a **stable, unique, lowercase `id`** (except ranks). `id` is a
  **permanent key**: it appears in save data (`G.inventory`, `G.properties`, `G.jobProgress`).
  **Never reuse or repurpose an `id`.** Renaming an `id` orphans existing saves.
- A new data file MUST be added to the `Promise.all` in `loadGameData()` and assigned to a global,
  and the loading-progress denominator updated (currently `/ 9`).
- Loading is resilient: a fetch failure is caught and logged. Systems must render sanely against an
  empty array. Don't assume data loaded successfully.

> **Known gap:** `portraits.json` is in `data/` but is **not** in `loadGameData()` and is read by
> nothing — renderers still use `ENEMY_PORTRAITS` in `js/combat.js`. Tracked on DOM-60.
> (`progression.json` had the same problem and is now wired up.)

---

## 3. Current schemas (authoritative)

Field types below are derived from the shipping data files. **Match them exactly** when adding
entries. All money ranges are `[min, max]` integer tuples.

### 3.1 `jobs.json` — Moves
```jsonc
{
  "id": "lookout",        // string, unique, permanent
  "name": "Be a Lookout", // string, display name
  "moves": 1,             // int > 0, Moves cost per attempt
  "cash": [20, 40],       // [int,int] payout range, min ≤ max
  "clout": 10,            // int ≥ 0, Clout per attempt
  "levelReq": 1,          // int ≥ 1, level required to unlock
  "times": 10             // int > 0, mastery cap (attempts to master)
}
```

### 3.2 `enemies.json` — Opps
```jsonc
{
  "id": "snitch",             // string, unique, permanent
  "name": "Local Snitch",     // string
  "role": "Informant",        // string, flavor subtitle
  "hp": 40,                   // int > 0
  "atk": 6,                   // int ≥ 0
  "def": 3,                   // int ≥ 0
  "levelReq": 1,              // int ≥ 1, level required to fight
  "reward": {                 // object
    "cash": [30, 60],         // [int,int]
    "clout": 25               // int ≥ 0
  }
}
```
> **Terminology migration, 2026-09-11.** `xp` + `rep` → `clout` (save `SCHEMA_VERSION` 1 → 2), then
> `money` → `cash` and `energy` → `moves` (2 → 3). Canonical names per
> [`../oppsDefinitions.md`](../oppsDefinitions.md); the old fields are gone from `jobs.json` and
> `enemies.json`. See [`08-economy-schema.md`](./08-economy-schema.md) §3.
>
> **No `icon` field.** It was removed on 2026-09-11 — the UI Implementation Contract in
> `CLAUDE.md` bans emoji, and it was only ever a fallback for enemies with no portrait. Every
> enemy has one, so it never rendered. See `data/README.md`.
>
> **Note (known divergence, partly resolved):** each enemy also has a **portrait** and a
> **threat rating** that live in `js/combat.js` (`ENEMY_PORTRAITS`, `ENEMY_THREAT`) keyed by
> `id`, not in the JSON. Portraits now have a home in **`portraits.json`**; wiring the renderer
> to read from it is tracked as DOM-60. `ENEMY_THREAT` is still data-in-code and unaddressed.
> If you add an enemy today you must still extend `ENEMY_THREAT` in `combat.js`.

### 3.3 `store.json` — Gear (The Plug)
```jsonc
{
  "id": "knife",             // string, unique, permanent
  "name": "Switchblade",     // string
  "desc": "+5 ATK",          // string, short description
  "price": 200,              // int > 0, cost in bread ($)
  "atk": 5,                  // int ≥ 0, attack bonus on purchase
  "def": 0,                  // int ≥ 0, defense bonus on purchase
  "hpBonus": 10,             // int ≥ 0, OPTIONAL: max-HP bonus (see "bando")
  "upgradeable": true        // bool, required: may this item enter the upgrade track?
}
```
Gear is a **one-time permanent purchase** (owned via `G.inventory`). `hpBonus` is optional; omit
when zero (matches current data).

`upgradeable` gates the unbounded gear upgrade track (DOM-79 layer 2): an upgradeable item can be
levelled with Cash indefinitely, with small hard-capped stat gains and prestige beyond the cap.
It is per-item so limited/premium gear can opt out without a code change; the **cost curve is
global** (`tuning.gear.upgradeCost`, scaled by the item's `price`). Upgrade *level* is
per-instance save state and is **not built yet** — `G.inventory` is still a flat array of ids.
See [`08-economy-schema.md`](./08-economy-schema.md) §5.

### 3.4 `properties.json` — Spots
```jsonc
{
  "id": "corner",            // string, unique, permanent
  "name": "Corner Store",    // string
  "price": 800,              // int > 0, cost in bread ($)
  "income": 50,              // int > 0, income per collect (per unit owned)
  "desc": "$50 per collect"  // string — SHOULD match income; keep in sync
}
```
Spots are **stackable** (`G.properties[id]` is a count). `collectIncome()` sums `income × count`.

### 3.5 `ranks.json` — Rank names
```jsonc
["Shorty", "Soldier", "Block Boy", "OG", "Set Leader",
 "Don", "Boss", "Kingpin", "Legend", "Untouchable"]
```
An **ordered array of strings**. Ranks are **bands**: each name covers
`tuning.progression.levelsPerRank` levels (currently 10), so index `0` is levels 1–10, index `1` is
11–20, and so on. Resolve with `rankForLevel()` in `js/progression.js` — never index the array
directly. Add ranks at the **end** to extend progression; do not reorder (it retitles existing
players).

> **Ten names at 10 levels each cover levels 1–90, and the cap is 120.** The last name absorbs
> everything above its band, so "Untouchable" currently spans levels 91–120 — a 30-level plateau
> rather than 10. That is a reasonable shape for a top rank, but if you want uniform bands, add
> **two** names to the end of the list. Nothing in code needs to change: band width is
> `tuning.progression.levelsPerRank` and the list length does the rest.

### 3.6 `unlocks.json` — Level gates

Two kinds of gate, deliberately kept apart:

**Content gates** live on the content row itself — `levelReq` on a job, an enemy, an item. They
stay there: one number next to the thing it gates is the right place for it. Read them through
`isUnlocked(entity)` / `lockLabel(entity)` in `js/unlocks.js`, **never by comparing `G.level`
directly**. Five call sites used to each write their own comparison with their own copy
("REQUIRES RANK 3", "RANK 3", "You need a higher rank!"), which is how a gate drifts out of step
with the rule it enforces.

> `enemies.json` used `lvlReq` while `jobs.json` used `levelReq` — one concept, two names. Both are
> `levelReq` as of 2026-09-11.

**Capability gates** are level → value mappings belonging to no single row. Those live here:

```jsonc
{ "version": 1,
  "capabilities": {
    "spotOfflineCapSeconds": { "type": "linear", "base": 3600, "step": 600 }
  } }
```

Each capability is a **curve object** evaluated at the player's level via `capabilityAt(name)`.
Gear tiers and Moves tiers join this file when those systems exist; they are not stubbed in
advance. The Spots offline-accrual cap moved here out of `tuning.json`, because a level → value
mapping is exactly what this file is for.

### 3.7 `progression.json` — Clout → level table

```jsonc
{ "levels": [ { "level": 5, "cloutToNext": 128 } ] }   // 120 contiguous rows
```

An **object wrapping a `levels` array** (the §2 exception), 120 contiguous rows.
`cloutToNext` is the Clout needed to advance from that level to the next, and is `null` on level
120 only. Generated from `tuning.progression.cloutToNext`
(`{"type": "geometric", "base": 110, "ratio": 1.1}`), then hand-tunable row by row.

**Level is derived from cumulative Clout against this table** (`js/progression.js`), never stored
as the source of truth. Retuning the table reprices every level for every player on their next
load with no migration — and can move a player's level *down*. See
[`08-economy-schema.md`](./08-economy-schema.md) §3.

### 3.8 `tuning.json` — Economy tunables

Every economy constant in the game, in one keyed object. **Not an array** — the justified
exception noted in §2: this is config, not a content catalog, and keying it by path is what
lets logic read `TUNING.loot.defeatLossRate` directly.

```jsonc
{
  "version": 2,                  // int, bump on any breaking restructure
  "loot": {
    "defeatLossRate": 0.10,      // float 0–1, share of YOUR Cash destroyed when you lose
    "defeatLossCap": null        // int or null — absolute ceiling on that loss
  },
  "gear": {
    "upgradeCost": { "type": "geometric", "base": 1.0, "ratio": 1.6, "scaleBy": "itemPrice" }
  }
}
```

Sections: `start` · `progression` · `pools` · `skills` · `combat` · `matchmaking` · `loot` ·
`hospital` · `spots` · `gear` · `crew` · `hoodActions` · `monetization`.

`start` holds a new player's opening balances (Cash, Attack, Defense, and each pool). The defaults
in the `G` literal in `js/state.js` exist only so the object is well-formed before data loads —
`applyStartingState()` overwrites them from here for every new player.

Anything scaling with level or tier is a **curve object** —
`{"type": "constant"|"linear"|"geometric"|"table", …}` — so tuning never needs a code change.
Full field list, curve semantics and which values are real decisions vs. simulator-owned
placeholders: [`08-economy-schema.md`](./08-economy-schema.md) §1–2.

**Read it through `tune()` in `js/tuning.js`, never off `TUNING` directly.**

```js
const rate = tune('loot.defeatLossRate');    // throws if absent
```

**There is deliberately no fallback argument.** A fallback becomes the balance the first time a
fetch fails or a path is renamed, and nobody finds out until the numbers are wrong in production.
So `tune()` throws, and `assertTuningReady()` — called from `init()` before anything reads a
balance — **aborts boot** with a visible list of the missing paths rather than starting the game on
whatever the code happens to hold. This is the one data file whose absence is fatal; every other
file degrades to an empty list.

When game logic starts reading a new path, add it to `TUNING_REQUIRED` in `js/tuning.js` so a
missing value fails at boot instead of surfacing later as `NaN` in a meter.

---

## 4. Adding & tuning content

### 4.1 To add content (no code change)
Append a new object to the relevant `data/*.json` with a fresh unique `id` and all required
fields. That's it — the render functions pick it up at boot. This is the **happy path** and
should cover most content work.

### 4.2 To tune balance (no code change)
Edit the numeric fields. Respect the progression curves: costs, `levelReq`/`lvlReq`, rewards, and
mastery caps should scale sensibly with existing entries. Keep `desc` strings in sync with the
numbers they describe.

### 4.3 To add a new content *type* (code change + TDD)
A genuinely new kind of content (e.g. "heists") means: a new `data/<type>.json`, a new global +
`loadGameData()` entry, and a consuming system per
[`03-game-architecture.md`](./03-game-architecture.md) §6. Write a TDD.

### 4.4 Validation rules (enforced in CI)
- Every object has a **unique** `id` within its file.
- All **required fields present** with the correct types (§3).
- Money tuples are `[min, max]` with `min ≤ max`, integers.
- `levelReq` / `lvlReq` ≥ 1; costs and rewards ≥ 0; energy costs > 0.
- Referenced assets (portraits/icons) exist per [`05-asset-spec.md`](./05-asset-spec.md).
- Files are **valid JSON** (no comments, no trailing commas — the `jsonc` blocks above are
  documentation only).
- `store.json`: every item has a boolean `upgradeable`.
- `jobs.json` / `enemies.json`: `clout` and `cash` present and ≥ 0; no `xp`, `rep`, `money` or
  `energy` field remains.
- `monetization.json`: unique `sku`s; every `effect.type` is one `js/payments.js` implements.
- `unlocks.json`: every capability is a valid curve object.
- No content file uses `lvlReq`; the field is `levelReq` everywhere.
- `progression.json`: 120 contiguous `level`s from 1; `cloutToNext` > 0 on every row except the
  last, which is `null`.
- `ranks.json`: non-empty array of non-empty strings.
- `tuning.json`: every pool has both `regenSeconds` > 0 and `regenAmount` > 0; parses as an object
  with an integer `version`; every rate field is a float in
  `[0, 1]`; every curve object has a known `type` and the fields that `type` requires; every
  path in `TUNING_REQUIRED` (`js/tuning.js`) resolves.

---

## 5. Deployment & on-demand data delivery

Game data is **deployed independently of the game build** and consumed by clients on demand
(tenet T4). A developer edits JSON → it is conditioned and validated in CI → deployed to the
cloud/CDN → all clients fetch the new data on their next load.

**Pipeline for data (see [`02-tech-architecture.md`](./02-tech-architecture.md) §9):**

1. **Condition & validate** — JSON parse + schema validation (§4.4); fail the build on any error
   so malformed data can never reach a client.
2. **Test** — regression checks (e.g. no orphaned `id`s, curves within expected bounds).
3. **Deploy → test** — publish to the staging CDN path; verify in the test environment.
4. **Deploy → production** — promote to the production CDN path.

**Rules:**
- **Never hand-edit production data outside the pipeline.** A bad file breaks every client.
- **Cache-busting / freshness:** ensure updated data is actually fetched by clients (versioned
  paths or appropriate cache headers on the CDN). Decide and document the mechanism in the
  deployment TDD; don't rely on unbounded browser caching that pins players to stale content.
- **Compatibility first:** a data change must be safe for **already-installed** game code. If new
  data needs new code to be understood, ship the code first (or gate the data behind a version the
  old client ignores). See §7.
- **Local dev** fetches from the local static server (`data/…`); production fetches from the
  deployed CDN. Keep the fetch paths configurable/consistent so the same code works in both.

---

## 6. Monetization & other config data (JSON-first)

Per the JSON-first rule, **monetization configuration and store packs are game data** and belong
in JSON.

**Partly resolved, 2026-09-11.** The hard currency was removed (no gems in v1 — v1 sells
Stamina/Moves refreshes and heals directly), and the catalogue moved out of `js/payments.js` into
**`data/monetization.json`**, loaded into `IAP_PRODUCTS` like any other data file.

```jsonc
{
  "id": "refill_moves",   // string, unique, permanent
  "sku": "refill_moves",  // platform SKU — must match the Jest Developer Console
  "name": "Refill Moves", // string, display
  "desc": "…",            // string
  "mockPrice": "$0.99",   // string, shown only when the platform price is unavailable
  "badge": "POPULAR",     // string, OPTIONAL
  "effect": { "type": "refillPool", "pool": "moves" }
}
```

`effect.type` must be one `js/payments.js` implements — today only `refillPool`.

**Still outstanding:**
- The **server must own SKU → grant** as the authoritative source and must never trust the client.
  `server/index.js` verifies the receipt signature and nothing more, so the grant is currently a
  client-side decision. Same gap as [`08-economy-schema.md`](./08-economy-schema.md) §8; close them
  together.
- That change needs a **TDD**.
- SKUs must stay in lockstep with the Jest Developer Console product catalog. Call it out in the PR.

Similarly, **NPC/plug content** currently lives in `js/plugs.js` (`PLUGS_DATA`). New narrative
content of this kind SHOULD move to `data/plugs.json` following the same pattern.

---

## 7. Save compatibility, versioning & migrations

This is the **canonical policy** for keeping every player's save working across releases. The
code pattern that implements it lives in
[`03-game-architecture.md`](./03-game-architecture.md) §3.4 (inside `GameState`). Read both.

### 7.1 The model: lazy, versioned, client-side migration
OPPS has **no authoritative game server that owns saves** — each save is a single per-user blob in
the Jest Player store, read and written by the client. Therefore migrations run **on the client, at
load**, not as a bulk/back-office job.

- **Every save carries an integer `schemaVersion`.** A save without one is treated as version 1
  (the pre-versioning baseline).
- **On load, migrate sequentially in memory** from the stored version up to the current
  `SCHEMA_VERSION` (`v1→v2→v3`), then write the upgraded save **once** and `flush()` it.
- Each player migrates **their own** save the next time they open the game. This is naturally
  sharded — **no batch migration, no file contention, no big-bang risk event** — and the cost is
  spread across returning players.

> This is the deliberate choice **over** a one-shot mass migration of all saves. A bulk migration
> would require out-of-band access to every user's Player data (which OPPS has no mechanism for)
> and concentrates risk and contention into a single event. Lazy client migration avoids all of
> that.

### 7.2 Additive vs. breaking (keep migrations rare)
- **Additive changes need NO migration.** Because `GameState.apply()` does `Object.assign(G,
  saved)`, a new field takes its default from the `G` literal for any old save that lacks it.
  Adding a stat, flag, or counter is free — just give it a default and read it defensively
  (`G.gems ?? 0`).
- **Only breaking changes get a migration + a version bump:** renaming a field, changing its shape
  or units, removing/re-keying, or splitting/merging fields. Bump `SCHEMA_VERSION` by exactly 1 and
  add one migration function per bump.

### 7.3 Rules that make it robust
- **Migrate fully in memory, write once.** Never persist intermediate versions between steps.
  Interrupted mid-migration → nothing written → next launch re-runs cleanly from the original
  version. (Single-key save = atomic write.)
- **Migrations are pure & deterministic** — no time, RNG, or dependence on loaded content — so they
  are unit-testable and re-runnable.
- **Guard the "save from the future."** Jest syncs saves across devices and stale clients linger
  behind caches (see §5 and [`02-tech-architecture.md`](./02-tech-architecture.md) §10). So an
  **older** client can encounter a **newer** save. If `schemaVersion > SCHEMA_VERSION`, do **not**
  migrate down or destructively overwrite — load defensively (unknown fields are harmless) and
  avoid writing the store from the stale client. This single guard prevents the most common
  save-corruption bug.
- **Corrupt/unparseable save:** fall back to a fresh state (current behavior), but **preserve the
  unparseable blob for support** rather than silently wiping, where the 1 MB budget allows.
- **Optional hardening for risky migrations:** during the launch window of a high-risk migration,
  stash the pre-migration blob under a second key (`g_bak`) so a bad migration is recoverable.
  Cost: it roughly doubles the save footprint against the **1 MB per-app** Player-store cap
  ([`07-external-systems.md`](./07-external-systems.md) §2.2), so keep `G` lean and remove the
  backup once the migration has proven safe. *(Default: baseline policy — versioned migration +
  from-future guard + golden tests — is required; the temporary one-slot backup is recommended
  only for migrations flagged high-risk in their TDD.)*

### 7.4 Testing & rollout (gates)
- **Every migration ships with a golden-file test:** a fixture save at version N run through the
  chain asserts the exact version-CURRENT result; old-save fixtures load without loss. This is a
  **CI regression gate** ([`06-technical-requirements.md`](./06-technical-requirements.md) §4).
- **A save-format change requires a TDD** ([`06-technical-requirements.md`](./06-technical-requirements.md) §1.1).
- **Content `id`s are the join** between JSON and saves (`G.inventory`, `G.properties`,
  `G.jobProgress`). Retiring/renaming a content `id` is effectively a save concern: either keep the
  old `id`, map it in a migration, or rely on the code's existing missing-lookup guards to drop it
  gracefully. Never silently reuse an `id`.
- **Coordinate code + data rollout:** code that understands a new shape ships **before** data that
  depends on it, so a stale client never chokes on data it can't read (see §5).

---

## 8. Quick checklist for a data PR

- [ ] Valid JSON; correct array-of-objects shape.
- [ ] Unique, permanent, lowercase `id`s; nothing reused.
- [ ] All required fields present with correct types (§3).
- [ ] Balance fits existing curves; `desc` matches the numbers.
- [ ] Referenced assets exist and meet [`05-asset-spec.md`](./05-asset-spec.md).
- [ ] Any new file wired into `loadGameData()` + a global + progress denominator.
- [ ] Any data-in-code counterparts (enemy portraits/threat, monetization) updated in lockstep.
- [ ] Passes CI validation; deployed via the pipeline, not by hand.
