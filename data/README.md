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

`jobs.json`, `enemies.json`, `store.json`, `properties.json`, `ranks.json` —
loaded by the client at boot (see `js/main.js`). Schemas to be documented here
as they're formalized.
