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
required redeploying JavaScript instead of shipping JSON. Both renderers now
read from here via the `PORTRAITS` global (DOM-60).

## No emoji in game data

**Do not add an `icon` field, or any other emoji, to these files.** It was
removed from `enemies.json`, `gear.json` and `properties.json` on 2026-09-11.

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

## gear.json — the item catalog (single source of truth)

**Decided 2026-09-14 (DOM-123), closing the `gear.json` vs `gear.json` question the Chrome
Money handoff carried as unresolved: `data/gear.json` owns every item definition in the game.**

There is no separate store SKU file. `data/gear.json` was this same 87-row catalog under a
narrower name — it already held drop-only items that never appear in any store — so it was
renamed rather than split. One item id, one row, one definition:

- **The storefront** is the rows where `dropOnly` is not set (currently 38 of 87). Those carry a
  `plug` naming the vendor. Drop-only rows carry no vendor and are never rendered in a store.
- **Real-money packs are a different thing** and stay in `monetization.json`. Gold SKUs are not
  items.

Splitting definitions across two files was the alternative, and it was rejected: a store row
referencing a gear id is a join that drifts the moment one side is edited alone, and both files
would have needed the same generator anyway.

Generated by `tools/econ-sim/gen-catalog.js`; hand edits to this file are overwritten on the next
regeneration, so change the generator, not the output.

### Slots — save keys

Every row carries a **`slot`**, one of the seven permanent paper-doll keys ratified on DOM-121:

```
head · torso · handR · handL · legs · ride · stash
```

**Slot ids and item ids are save keys — permanent, lowercase, never reused.** Renaming one
would silently unequip every player who had it filled.

The catalog was authored against the older four-`type` model, so slots are derived from it:
vehicles take `ride`, utilities `stash`, body armour `torso`, long guns `handR`, and sidearms,
melee and the one shield take `handL`. The rule lives in `gen-catalog.js` (`SLOT_BY_TYPE` +
`GEAR_OFFHAND`) and a unit test asserts the checked-in file still matches it.

**`type` is transitional — but nothing has moved off it yet.** Corrected on DOM-121
(2026-09-15): an earlier draft of this section said `G.equipped` is keyed by slot id and that
DOM-120 introduced it. Neither is true. **`G.equipped` does not exist** — the v4→v5 migration
deletes it as a prototype placeholder. The live field is **`G.loadout`, keyed by `type`**
(`weapon`/`armor`/`vehicle`/`utility`) holding **arrays** of item ids, with `[0]` the primary
and `slotCapacity()` deciding how many count.

So the catalog carries the v0.2 seven-slot model while the runtime still carries the superseded
multi-slot one, and **nothing reads `slot` yet**. Reconciling them is a real migration — it
changes `G.loadout`'s shape (SCHEMA_VERSION bump), makes `slotCapacity()` dead, and retires the
Crew gear-slot reward with it. That work belongs to **DOM-117** (Profile GEAR); see the DOM-121
comment thread for the consequences. While both models exist a test keeps `slot` and `type`
consistent.

> **Known content gap:** `head` and `legs` have **no v1 items** — the catalog has no hats, masks
> or kicks. The two slots ship real and render empty. Filling them is content work (the DOM-18
> catalog pass is the natural home); the alternative is collapsing to five body slots, which
> would burn two permanent save keys. Flagged on DOM-123 for Jake.

## skills.json

The five skills the Profile SKILLS tab renders: identity, build tag, and the copy the stat-info
overlay shows. **No numbers.** Point costs and per-point grants stay in `tuning.json`
(`skills.cost` / `skills.grant`) — a row names its tuning key in `tuning` and a test asserts the
two files agree on the skill set. Duplicating the cost here is exactly the drift `tune()` exists
to prevent.

## plugs.json

The plug roster and their dialogue, migrated out of the `PLUGS_DATA` literal in `js/plugs.js`
(DOM-123) so plug content ships without a code change. Ids are referenced by `quests.json`
(`plug`) and `portraits.json` (`plugs`) — a test checks every quest names a plug that exists.

## moves.json

MAKE MOVES content (DOM-115): the featured main job and its objectives, side hustles, the daily,
turf status, hood-ops tiles and sightings.

**All of it is design placeholder copy** carried over from the Chrome Money v0.2 prototype — it
does not mirror repo economy data and is not tuned. Cash rewards await the economy simulator
(DOM-67).

It carries **no XP numbers**: each entry has a `kind` (`mainStory` / `timed` / `multiTarget` /
`standard` / `daily`) and XP resolves from `xp-system.json` by kind (DOM-124). A test asserts no
XP value is duplicated here.

> Naming note: the handoff's file table called this `quests.json`, but that name was already
> taken by the Plug quests (DOM-90) whose ids are save keys in `G.quests`. Repurposing it would
> have broken saves, so the Make Moves content landed as `moves.json`.

## city.json

Configuration for THE HOOD (DOM-118), extracted from the prototype's `design_reference/city-data.js`.

**The city is generated, not stored.** This file holds the seed (`20260611`) and the parameters —
bounds, the five size tiers, the gold objective building, factions, territory anchors, camera,
the hand-placed parks, avenues, river, bridges, pins and district labels. The generator
reproduces the same ~736 buildings every time, so the 2D and 3D views read identical building
objects without either one storing them. Do not check generated buildings in.

Pins carry a **`kind`** (`player` / `rival` / `drop`), not a colour: the renderer resolves chrome,
`--red` and `--green` from the Chrome Money tokens (CLAUDE.md §Map palette). The prototype's
faction hexes included the retired `#f5902a` amber and `#bfce1c` highlighter; those were mapped
to the current tokens on extraction and a test asserts neither survives.

> **Open for DOM-118:** the five `tiers[].fill2d` / `edge2d` values are the prototype's
> pre-Chrome-Money blue-greys (`#1f2229`…`#4c5666`), carried over verbatim because DOM-123's
> acceptance criteria ask for the prototype's tier values. They sit lighter and bluer than the
> contract's map palette (buildings `#1f1f28`). The Hood must reconcile the two — five distinct
> greys are needed, and the contract gives one.

## Other files

`ranks.json` is an ordered list of **band** names, not one name per level: each covers
`tuning.progression.levelsPerRank` levels (currently 10), resolved by `rankForLevel()` in
`js/progression.js`. Ten names at 10 levels each reach level 90, and the last name absorbs
everything to the level-120 cap — so the top rank spans 30 levels. Add two names to the **end** for
uniform bands; never reorder, it retitles existing players.

`jobs.json`, `enemies.json`, `gear.json`, `properties.json`, `ranks.json` —
loaded by the client at boot (see `js/main.js`). Schemas to be documented here
as they're formalized.

`gear.json` items carry **`upgradeable`** (bool, required), which gates the unbounded gear
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

`portraits.json` is loaded in `loadGameData()` alongside the rest and read by `js/combat.js` and
`js/plugs.js` (DOM-60). A fetch miss degrades to placeholder circles, not a dead app.

### moves.json — what DOM-115 actually rendered

The screen shipped in DOM-115 uses `featured`, `daily`, `turf`, `hoodOps` and
`sightings` from this file. **`side` is deliberately unused.**

Those three placeholder hustles (QUICK FLIP / CLEAN HOUSE / RUN THE PLUG) are
prototype copy. The SIDE HUSTLES section renders `data/jobs.json` instead — the
19 jobs that actually pay. Rendering the placeholders would have stranded
`doJob()`, and with it the only Moves sink outside the Hood, the only caller of
`Quests.onJob()` (4 of the 9 plug-quest steps are `job` steps), one of the two
`rollDrop()` sites, and the Moves Boost offer trigger.

`side` is kept rather than deleted because it is the design's statement of what
a hustle card can show — the TIMED countdown state in particular has no v1 job
behind it. A job gains that state by carrying an `expiresAt`; none do yet.
