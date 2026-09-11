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

**Rules:**
- Data files are **arrays of objects** (except `ranks.json`, an array of strings). Keep that shape.
- Every content object has a **stable, unique, lowercase `id`** (except ranks). `id` is a
  **permanent key**: it appears in save data (`G.inventory`, `G.properties`, `G.jobProgress`).
  **Never reuse or repurpose an `id`.** Renaming an `id` orphans existing saves.
- A new data file MUST be added to the `Promise.all` in `loadGameData()` and assigned to a global,
  and the loading-progress denominator updated (currently `/ 5`).
- Loading is resilient: a fetch failure is caught and logged. Systems must render sanely against an
  empty array. Don't assume data loaded successfully.

---

## 3. Current schemas (authoritative)

Field types below are derived from the shipping data files. **Match them exactly** when adding
entries. All money ranges are `[min, max]` integer tuples.

### 3.1 `jobs.json` — Moves
```jsonc
{
  "id": "lookout",        // string, unique, permanent
  "name": "Be a Lookout", // string, display name
  "energy": 1,            // int > 0, energy cost per attempt
  "money": [20, 40],      // [int,int] payout range, min ≤ max
  "xp": 8,                // int ≥ 0, XP per attempt
  "rep": 2,               // int ≥ 0, rep per attempt
  "levelReq": 1,          // int ≥ 1, rank required to unlock
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
  "lvlReq": 1,                // int ≥ 1, rank required to fight
  "reward": {                 // object
    "money": [30, 60],        // [int,int]
    "rep": 10,                // int ≥ 0
    "xp": 15                  // int ≥ 0
  }
}
```
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
  "hpBonus": 10              // int ≥ 0, OPTIONAL: max-HP bonus (see "bando")
}
```
Gear is a **one-time permanent purchase** (owned via `G.inventory`). `hpBonus` is optional; omit
when zero (matches current data).

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
An **ordered array of strings**, indexed by `level - 1` (clamped to the last entry). Add ranks at
the **end** to extend progression; do not reorder (it renames existing players' ranks).

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

**Known divergence to resolve:** today the gem catalog and spend options are **hardcoded in
`js/payments.js`** (`GEM_PACKS`, `GEM_SPENDS`), and the server mirrors SKU→gem amounts in
`server/index.js` (`SKU_GEMS`). This predates the JSON-first mandate.

**Direction (do this when touching monetization, via TDD):**
- Move gem-pack and spend definitions into `data/monetization.json` (or `data/store_packs.json`),
  loaded like other data.
- Keep the **server's** SKU→gems map as the **authoritative grant source** (it must never trust
  the client), but drive it from the same shared JSON so client and server can't drift. See
  [`07-external-systems.md`](./07-external-systems.md).
- Until migrated, **any change to gem packs MUST update all three places in lockstep**:
  `js/payments.js`, `server/index.js`, and the Jest Developer Console product catalog. Call this
  out in the PR.

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
