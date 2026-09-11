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

The table is generated from the curve `cloutToNext(L) = round(100 · 1.05^L)`
(gentle geometric, ~350× growth from L1 to L119, ~696k lifetime clout total).
Individual levels can be hand-tuned after generation — the formula is a
starting point, not a constraint. If you regenerate the whole table, note the
new curve parameters here.

## Other files

`jobs.json`, `enemies.json`, `store.json`, `properties.json`, `ranks.json` —
loaded by the client at boot (see `js/main.js`). Schemas to be documented here
as they're formalized.
