# Game Data

Every tunable in the game lives in this directory as JSON. These files are the
source of truth for game balance — edit them (or have Claude edit them) and
ship; no code changes required. Keep entries one-per-line so diffs stay readable.

## progression.json

Player leveling table, levels 1–120.

```json
{ "level": 5, "cloutToNext": 128 }
```

- `level` — the player's current level. Entries must be contiguous from 1 to 120.
- `cloutToNext` — clout required to advance from this level to the next.
  `null` on level 120 only (level cap).

Loaded into the `PROGRESSION` global. **Level is derived from cumulative Clout against this
table** — it is never stored as the source of truth, so retuning the table reprices every level
for every player on their next load with no migration (and can move a level *down*). The
derivation lives in `js/progression.js`; see `docs/specs/08-economy-schema.md` §3.

The table is generated from the curve `cloutToNext(L) = round(100 · 1.10^L)`
(steep geometric, ~76,600× growth from L1 to L119, ~92.7M lifetime clout total).
Retuned from `1.05` to `1.10` on 2026-09-11 — the 1.05 curve was judged too flat.
Individual levels can be hand-tuned after generation — the formula is a
starting point, not a constraint. If you regenerate the whole table, note the
new curve parameters here. **This table is the single authority for the level curve** —
the generating formula is documentation, and it deliberately does NOT also live in
`tuning.json`: nothing reads a curve object there, so a copy would only drift from
the table the code actually uses.

**The curve is settled, not open.** This file is the source of truth for it;
any doc that still describes an XP curve as undecided, or as `×1.6` per level, is stale — fix it
rather than reopening the question. What is *not* settled is whether the Clout **grants** in
`jobs.json` / `enemies.json` (10–220 per action) are scaled for this curve: at 1.10 the last level
alone costs 8.4M clout, which is ~47,000 best-paying actions. The grant side is the economy
simulator's job (DOM-67).

## unlocks.json

Level gates that belong to no single content row — today just the Spots offline-accrual cap.

```json
{ "version": 1,
  "capabilities": { "spotOfflineCapSeconds": { "type": "linear", "base": 3600, "step": 600 } } }
```

Each capability is a curve object, evaluated at the player's level by `capabilityAt(name)` in
`js/unlocks.js`. Gear and Moves tiers land here when those systems exist — don't stub them.

**Per-content gates stay on the content row** (`levelReq` on a job, enemy or item). Read those with
`isUnlocked(entity)` / `lockLabel(entity)`, never by comparing `G.level` yourself — that is how the
lock copy drifted into three different wordings. Note `enemies.json` used `lvlReq` until
2026-09-11; it is `levelReq` everywhere now.

## tuning.json

Every economy constant in the game — loot and burn rates, pool sizes and regen, skill-point
costs, combat parameters, matchmaking band, fees, Spot and gear curves.

```json
{ "version": 2,
  "start": { "cash": 500, "moves": 10, "stamina": 3, "health": 100 },
  "loot": { "defeatLossRate": 0.10, "defeatLossCap": null },
  "gear": { "upgradeCost": { "type": "geometric", "base": 1.0, "ratio": 1.6,
                             "scaleBy": "itemPrice" } } }
```

**This is the one file here that is a keyed object rather than an array.** It is config, not a
content catalog — logic reads `TUNING.loot.defeatLossRate` by path. The exception is called out in
`docs/specs/04-game-data-spec.md` §2 and §3.7.

Anything that scales with level or tier is a **curve object**: `{"type": "constant"|"linear"|
"geometric"|"table", ...}`, evaluated at a 1-indexed integer. Tune by editing the curve; never by
adding a multiplier in code.

Read it with **`tune('some.path')`** from `js/tuning.js` — never off the `TUNING` global directly.
There is no fallback argument on purpose: a fallback becomes the balance the first time a path is
renamed. `tune()` throws, and a missing or incomplete file **aborts boot** with the missing paths
listed on screen. This is the only data file whose absence is fatal; the rest degrade to an empty
list. Add any newly-read path to `TUNING_REQUIRED` in `js/tuning.js`.

No balance number lives in game code any more. If you find one, it is a bug — move it here.

Many values are structurally correct but numerically unowned — the economy simulator sets them.
`docs/specs/08-economy-schema.md` §2 lists exactly which, and `loot.defeatLossRate` is flagged
there as the single most load-bearing number in the economy — with an absolute win reward against
a proportional loss, it sets the balance at which fighting stops paying.

## portraits.json

Portrait art keyed by entity id, in two groups: `enemies` and `plugs`.

```json
{ "version": 1,
  "enemies": { "snitch": "assets/portraits/enemy-snitch.png" },
  "plugs":   { "plug-tommy": "assets/portraits/plug-tommy.webp" } }
```

Every id in `enemies.json` must have an entry under `enemies`. A missing entry
degrades to a styled placeholder circle — never a broken image.

This file exists so art is data, not code. Portrait paths were previously
hardcoded in `js/combat.js` and `js/plugs.js`, which meant adding an enemy
required redeploying JavaScript instead of shipping JSON. The renderers are
being migrated to read from here.

## No emoji in game data

**Do not add an `icon` field, or any other emoji, to these files.** It was
removed from `enemies.json`, `store.json` and `properties.json` on 2026-09-11.

The UI Implementation Contract in `CLAUDE.md` bans emoji outright — meaning
comes from colour, type and real portrait art. Specifically:

- **Enemies** get art via `portraits.json`. The old `icon` was only ever a
  fallback for enemies with no portrait, and every enemy has one, so it never
  rendered.
- **Store items and properties** have no art and are not getting any. The
  contract specifies `.store-item` and `.prop-card` as *"two-column grid, no
  icon, full-width action pill"* — these rows are typographic by design.

If an entity needs visual identity, add real art and reference it from
`portraits.json`. Do not reach for a glyph.

## Other files

`ranks.json` is an ordered list of **band** names, not one name per level: each covers
`tuning.progression.levelsPerRank` levels (currently 10), resolved by `rankForLevel()` in
`js/progression.js`. Ten names at 10 levels each reach level 90, and the last name absorbs
everything to the level-120 cap — so the top rank spans 30 levels. Add two names to the **end** for
uniform bands; never reorder, it retitles existing players.

`jobs.json`, `enemies.json`, `store.json`, `properties.json`, `ranks.json` —
loaded by the client at boot (see `js/main.js`). Schemas to be documented here
as they're formalized.

`store.json` items carry **`upgradeable`** (bool, required), which gates the unbounded gear
upgrade track — Cash-priced levels with small hard-capped stat gains, prestige beyond the cap.
The cost curve is global in `tuning.json`, scaled by the item's own `price`; the per-item flag
only exists so limited/premium gear can opt out without a code change. Upgrade *level* is
per-instance save state and is not built yet (`G.inventory` is still a flat array of ids) — see
`docs/specs/08-economy-schema.md` §5.

`jobs.json` and `enemies.json` use the canonical names: a Move costs **`moves`** and pays **`cash`**
and **`clout`**. The 2026-09-11 terminology migration merged `xp` + `rep` into `clout`
(`SCHEMA_VERSION` 1 -> 2), then renamed `money` -> `cash` and `energy` -> `moves` (2 -> 3).

`monetization.json` is the purchasable-SKU catalogue. v1 has no hard currency — it sells
Stamina/Moves refreshes and heals directly, so each entry carries an `effect` the client applies
after the server verifies the receipt. `sku` must match the Jest Developer Console exactly. The
**server does not yet own the SKU -> grant mapping**, which it must; see
`docs/specs/04-game-data-spec.md` §6.

**Not loaded:** `portraits.json` is in this directory but is not in `loadGameData()` and is read by
nothing — renderers still use `ENEMY_PORTRAITS` in `js/combat.js`. Tracked on DOM-60.
