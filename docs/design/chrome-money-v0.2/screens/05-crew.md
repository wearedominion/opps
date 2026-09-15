# 05 · CREW

**Nav:** CREW · **Purpose:** your people and what they're doing.
**Repo source:** `js/crew.js` (stub — build against static data, gate live parts on the SDK).

Column, **22px section gaps**. Sections: `HITTERS` · `DEALERS` · `MY ROSTER`, each a **section header** (Anton 15px ls 2px + `#1f1f27` rule + zero-padded count `01`, label style), then member cards (**9px gaps**, 13px below header).

## Member card

92px tall, border `#26262e`, radius 16px, card gradient, `overflow:hidden`, horizontal; whole card tappable (hover border `#3d3627`) → **crew dialogue popup**.

- **Left** (`flex:1`, centered column, gap 8px, `padding:0 16px`):
  - Name — Anton **21px** ls 1px, lh 1, ellipsis (`MALIK 'TRIGGA'`, `JUNIOR`, `DESHAWN`, `QUAN`, `DIAMOND`, `PRECIOUS`).
  - Status line — 7px dot (**working `#4fd39a`**, idle `#7a7a86`) + activity text (SG 11px `#8e8e9a`, ellipsis): `Posted up · 7th & Lenox`, `Servin' · 5th & Lenox`, `At home`, `Out shopping`…
- **Right:** 33%-width portrait panel (`object-fit:cover`), bg `#111116`, 1px left border `#26262e`.
- **Map pin button** straddling the portrait's left edge (`top:31px; left:-15px`): 30px circle, bg `#1b1b22`, border `#3d3627`, 15px gold pin SVG; hover border `#e8c98a`; `stopPropagation` so it doesn't open the dialogue. → jump to the member on The Hood.

## Crew dialogue popup (card tap)

Same geometry as the plug popup (OVERLAYS.md) with a **268px** portrait header. Body: status row (7px dot + activity, label style) → the member's line (SG 15px lh 1.6 `#d8d6d0`, `min-height:30px`) → footer: spacer + **LATER** (secondary) + **SEE ON MAP** (primary gold with an inline 14px ink pin SVG, gap 7px).

## Data & state

Per member: `id`, `name`, `doing`, `working` (dot color), `line` (dialogue), `loc` `{x,y}` (map coords), `slot` (portrait key — **shared with the plugs portrait set**). Session: `crewOpen`, `crewNpc`. Live status/portraits arrive with the Jest SDK; until then this is static data with the same shape.
