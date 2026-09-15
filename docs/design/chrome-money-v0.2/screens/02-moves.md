# 02 · MAKE MOVES

**Nav:** MAKE MOVES · **Purpose:** the PvE loop — main job, side hustles, daily, territory status, sightings, log.
**Repo source:** `js/jobs.js`, `data/jobs.json` → `data/quests.json`.

Column, **18px gaps**. Sections introduced by the shared **section header** (Anton 15px ls 2px + `#1f1f27` rule).

## 1. Featured main job card

Border `#3d3627`, radius 16px, card gradient, `overflow:hidden`.

**Header band** — 118px tall, bg `#0d0d11` + pinstripe texture, bottom border `#26262e`, a `linear-gradient(0deg,#111116,rgba(17,17,22,0.1))` wash:
- Tag chip top-left (13px/15px inset): `MAIN JOB` — gold-chrome bg, ink text, SG 700 10px, pill, `padding:5px 11px`.
- Bottom-left: title `TAKE THE BLOCK` (Anton 30px ls 2px) over sub `Seize control of Downtown` (SG 12px `#8e8e9a`).

**Body** (`padding:16px`):
- Progress row: `OBJECTIVES` label + a `flex:1` **4px** gold-gradient bar + `{n}/{total}` (SG 500 11px `#f2f0ec`).
- Objective checklist (10px gaps): 14px dot (done: gold; current: outlined; future: `#1f1f27`) + text (SG 13px; done `#8e8e9a`, current `#f2f0ec`) + right count.
- Footer over a `#1f1f27` top border: `REWARD` label over `$2,500 + TERRITORY` (Anton 17px `#e8c98a`); right: **COMPLETE OBJECTIVE** primary gold pill (`padding:11px 22px`) **with sheen** → opens the engage modal. Done state: disabled pill recipe.

## 2. Side hustles

Section header `SIDE HUSTLES`. Cards (9px gaps): border `#26262e`, radius 16px, card gradient, `padding:15px`.

- Title (Anton 15px ls 1px) + sub (SG 11px `#7a7a86`) with a **status chip** top-right: SG 700 10px, pill, `padding:5px 10px`, colored text on a 14%-alpha wash of the same hue — `TIMED` `#e0523f` · `NEW` `#4fd39a` · `ACTIVE` `#e8c98a` · `DONE` `#4f4f59`.
- Optional progress row: 4px gold bar + `3/5` (SG 500 11px `#8e8e9a`).
- Timed variant: a 6px blinking red dot + `TIME LEFT 19:48` (SG 500 12px, label red, value `#f2f0ec`).
- Footer: `REWARD` label + amount (Anton 15px `#e8c98a`); right: **COMPLETE** gold pill (`padding:9px 18px`) with sheen, or done state `✓ COMPLETED` — SG 700 10px `#4fd39a`, border `rgba(79,211,154,0.4)`, pill, `padding:6px 12px`.

Placeholder set: QUICK FLIP ($400, TIMED) · CLEAN HOUSE ($650, ACTIVE 3/5) · RUN THE PLUG ($300, NEW).

## 3. Daily

Section header `DAILY`, one standard card: `DAILY GRIND` + `Earn $1,000 today`; right `$720 / $1,000` (Anton 17px gold, the cap half `#4f4f59`); a **7px** gold bar (72%); footer `REWARD XP +20` (Anton 15px in `#6f8cff` — XP rewards are blue, cash is gold).

## 4. The Hood — territory status

Section header `THE HOOD`, then:

- **Turf card** — warm gold card (`linear-gradient(110deg,#1d1b16,#111116)`, border `#3d3627`, radius 16px, `padding:17px`): `YOUR TURF` label in **gold** over `DOWNTOWN` (Anton 30px ls 2px) over sub; right column `TERRITORY` label over `2.4 SQ MI` (Anton 28px + SG 11px unit).
- **Hood ops** — 2×2 grid (9px gap) of stat tiles (border `#26262e`, radius 14px, `padding:15px`): label over Anton 26px value over SG 11px sub. ACTIVE JOBS `3` (value in gold) · HUSTLERS `12` · SAFEHOUSES `2` · DRUG DENS `4`.

## 5. Opps spotted

A card with **danger border `#5a2b24`**, radius 16px. Header row (`padding:14px 15px`, bottom border `#1f1f27`): 7px blinking red dot + `OPPS SPOTTED` (Anton 15px ls 2px) + right chip `3 IN AREA` (SG 700 10px `#e0523f` on `rgba(224,82,63,0.14)`, pill).
Rows (divider `#1d1c22`): name (Anton 14px) over corner (ring glyph + SG 11px `#8e8e9a`) + right `4M AGO` (SG 500 10px ls 1px `#7a7a86`).

## 6. Log preview

Section header `LOG`. One tappable container: bg `#0d0d11`, border `#26262e`, radius 16px, hover border `#3d3627`. Three newest rows (time SG 500 11px `#7a7a86` · text SG 13px `#d8d6d0` · clout delta SG 700 11px `#f2f0ec`), then a centered footer `VIEW FULL LOG ›` (label style in gold, `padding:12px`). Tap anywhere → **log modal** (see OVERLAYS.md).

## State & data

Quests from `data/quests.json` (featured + side + daily). Completing pays cash → `G.money`, XP via `addXP()` (fires the XP toast), appends to the log. Objective progress and `sideDone` persist. Timed hustles tick a real countdown.
