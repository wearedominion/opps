# 06 · STORE

**Nav:** STORE · **Purpose:** spend Bread on gear/supplies, buy Gold with real money.
**Repo source:** `js/store.js`, `js/payments.js` (`GOLD_PACKS`), `data/store.json`, → `data/gear.json`.
**⚠ Blocked on conflict 1 (README):** purchase must become "own it" only; equipping is Profile's job.

Column, **14px gaps**.

## 1. Wallet row

Two `flex:1` tiles (9px gap), radius 14px, card gradient, `padding:12px 14px`:
- **BREAD** — border `#3d3627` (gold-tinted), value `$1,840` in Anton 24px **gold**.
- **GOLD** — border `#26262e`, value in Anton 24px `#f2f0ec`.

## 2. Featured offer (real-money kit)

Full-width, `aspect-ratio:3/2`, border `#3d3627`, radius 16px, `overflow:hidden`, bg `#0d0d11`. Product art (`assets/mp9-kit.png`) covers it; a top+bottom scrim: `linear-gradient(180deg,rgba(8,8,10,0.62),transparent 34%,transparent 46%,rgba(8,8,10,0.78))`.

- Top row (13px/15px inset): `MP9 FULL KIT` (Anton 26px ls 2px) + right chip `OFFER` (gold-chrome bg, ink, SG 700 9px, pill).
- Bottom row: left column — buff line `+32 MUSCLE · +6 SPEED` (SG 700 10px **`#4fd39a`**) over a 2-column grid (5×14px gaps) of includes (`Optic · Grip · Suppressor · Extended Mag · Stock`, SG 500 11px `#d8d6d0`); right — **$9.99** price CTA: primary gold pill, Anton **22px**, `padding:11px 24px`, **with sheen** → opens the purchase confirm (sku `kit_mp9_full`). Owned state: `OWNED` — Anton 14px `#4fd39a`, border `rgba(79,211,154,0.45)`, pill.

## 3. Category filter

Three `flex:1` pill tabs (7px gap): **GEAR · SUPPLIES · GOLD**. Active: gold-chrome bg, ink, Anton 13px. Inactive: bg `#1b1b22`, border `#33333d`, `#8e8e9a`; hover text `#f2f0ec` + border `#3d3627`. `padding:10px 0`.

## 4. GEAR / SUPPLIES list

Rows (9px gaps): border `#26262e`, radius 16px, card gradient, `padding:14px`.

- Left: name (Anton 15px, ellipsis) + tier label (tier color, SG 500 10px ls 1.5px) on one baseline; meta line `{SLOT} · {buff}` (SG 11px — **`#4fd39a`** when buyable, `#8e8e9a` when level-locked); if locked, a gate chip `UNLOCKS AT LV {n}` (bordered `#26262e` pill, SG 500 10px `#8e8e9a`, 7px above-gap).
- Right column: price (Anton 16px, gold; `#8e8e9a` when locked) over the CTA:
  - **BUY** — gold pill, Anton 12px, `padding:14px 16px`, **with sheen**. Deducts Bread, marks owned.
  - `OWNED` — text `#4fd39a`, border `rgba(79,211,154,0.45)`, bg `#141419`.
  - `LV {n}` (level-locked) or `BROKE` (can't afford) — disabled recipe (`#4f4f59` on `#141419`, border `#22222a`).

**GEAR** lists only unowned, non-offer items across all seven slots (owned gear lives in Profile). Prices follow the repo's $150–$6,500 curve (see `design_reference` data). Empty state when everything's owned: dashed `#33333d` border, radius 16px, centered `SHELVES CLEARED` (Anton 16px `#8e8e9a`) + sub (SG 11px `#7a7a86`).

**SUPPLIES** (consumables, same row layout; meta shows `HELD {qty}` when owned): MEDKIT $250 COMMON `Restore 40 HEALTH instantly` · LEAN CUP $600 RARE `Refill your MOVES pool` · BURNER SIM $850 RARE `Wipe your heat · dodge one revenge hit` · SNITCH TIP $1,900 ELITE `Reveal one opp's exact THREAT`. Buying increments quantity.

## 5. GOLD tab — currency packs

Rows (11px gaps): **warm gold card** (`linear-gradient(110deg,#1d1b16,#111116)`, border `#3d3627`, radius 16px, `padding:16px 15px`):
- Left: `{n} GOLD` (Anton 22px **gold**) over the SKU label (label style) + optional tag chip (`POPULAR`, `BEST VALUE` — gold text, border `#3d3627`, pill, SG 700 9px).
- Right: price CTA (gold pill, Anton 13px, `padding:12px 20px`, **with sheen**) → purchase confirm.

**SKUs mirror `GOLD_PACKS` in `js/payments.js` — keep in lockstep with `server/index.js` and the console:**
`gold_100` 100/$0.99 · `gold_500` 550/$3.99 POPULAR · `gold_1200` 1,400/$7.99 · `gold_2500` 3,000/$14.99 BEST VALUE.

## Gold purchase confirm (overlay, z 71)

Scrim `rgba(0,0,0,0.84)`; centered panel (radius 22px, border `#3d3627`, overlay gradient, `padding:20px 18px 18px`, scale .2s):
`CONFIRM PURCHASE` label → `{label}` (Anton 30px gold) → a SKU/price row between 1px `#1f1f27` rules (sku label style; price Anton 18px) → note (SG 11px lh 1.6 `#8e8e9a`): *"Billed through your app store. Gold is granted once the purchase is verified — this can take a moment."* → **CANCEL** (secondary, flex 1) + **BUY {price}** (gold, flex 1.3, **with sheen**).

Real flow: hand off to `js/payments.js` purchase → server verification → grant. The confirm is UI only; never grant client-side in production.

## State

`G.money` (Bread), `G.gold`, owned gear ids, `G.supplies` quantities. Wallet BAG cap is raised by the equipped STASH (see Profile) — the metrics panel shows `$X / $cap`.
