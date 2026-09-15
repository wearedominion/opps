# OPPS — Shared Overlays (14)

All render **inside the app frame**, never as browser dialogs. Scrim tap closes; the panel `stopPropagation()`s. Hidden overlays stay mounted with `opacity:0; pointer-events:none` so open/close always animates.

**Shared panel recipe:** border 1px `#3d3627`, bg `linear-gradient(180deg,#181820,#0d0d11)`, `box-shadow:0 30px 80px rgba(0,0,0,0.6)`. Centered panels radius **22px** + `transform: scale(0.94–0.95 → 1)`; bottom sheets radius **24px 24px 0 0** + `translateY(100% → 0)`. Panel headers: title (Anton 19–21px ls 2px) over an eyebrow label, bottom border `#1f1f27`, circular ✕.

| Overlay | z | Placement | Scrim | Border | Motion |
|---|---|---|---|---|---|
| Nav drawer | 50/51 | left, 262px | 0.6 | right `#26262e` | translateX(-112%) .28s cubic-bezier(.4,0,.2,1) |
| Metrics panel | 55 | top-anchored, inset 12px, top 76px | 0.55 | `#3d3627` | none (instant) |
| Messages | 55 | full-screen | — | — | opacity + translateY .22s |
| Ranks popup | 58 | centered, max-height 100% | 0.78 | `#3d3627` | scale .22s |
| Engage modal | 60 | centered | 0.78 | **`#5a2b24`** | scale .22s |
| Log modal | 60 | bottom sheet, max-h 82% | 0.78 | `#3d3627`, no bottom | translateY .26s |
| Public profile | 64 | centered | 0.82 | `#3d3627` you / `#5a2b24` other | scale .22s |
| Confirm allocation | 66 | centered | **0.84** | `#3d3627` | scale .2s |
| Stat info popup | 67 | centered | 0.8 | `#3d3627` | scale .18s |
| Equip slot picker | 68 | bottom sheet, max-h 76% | 0.78 | top `#3d3627` | translateY .24s |
| Stats overlay | 69 | centered, max-h 82% | 0.8 | `#3d3627` | scale .22s |
| Plug / crew dialogue | 70 | centered, max-w 330px | 0.8 | `#3d3627` | scale .22s |
| Gold purchase confirm | 71 | centered | 0.84 | `#3d3627` | scale .2s |
| XP toast | 90 | top pill, top 64px | — | `#3d3627` | opacity + Y(-8px→0) .28s |

## Nav drawer (z 50 scrim / 51 panel)

262px, full-height left panel (overlay gradient, `padding:30px 0 20px`). Header (`padding:0 20px 18px`, bottom border `#1f1f27`): `OPPS` wordmark (Anton 24px ls 4px, gold-gradient text) + circular ✕.
Items (`margin:0 12px; padding:14px 16px; radius:14px`): 7px dot + label (Anton 15px ls 1.5px). Active: bg `#1b1b22`, border `#3d3627`, text `#f2f0ec`, dot gold-gradient. Inactive: dot `#33333d`, text `#8e8e9a`, hover bg `rgba(255,255,255,0.02)`. Locked items (none currently): text `#4f4f59` + `SOON` chip (SG 700 9px `#4f4f59`, border `#22222a`, pill).
Order: THE HOOD · MAKE MOVES · OPPS LIST · PLUGS · CREW · STORE · PROFILE · SETTINGS.

## Metrics / currencies panel (header clout-cluster tap)

Top-anchored card (`top:76px; left/right:12px`, radius 22px, `overflow:hidden`, `padding:17px 18px 20px`):
- Header: `POWER & CURRENCIES` label + ✕.
- **Clout hero** (bottom border `#1f1f27`): `TOTAL CLOUT` label → the number (Anton **42px**, lh 0.92) → sub `Your total power on the streets` (SG 11px `#8e8e9a`); right column `LEVEL {n}` label over rank title (Anton 19px ls 2px).
- **Metric rows** (15px gaps): label + right value over a **7px** bar —
  `XP TO {NEXT}` `{into}/{span}` fill `#6f8cff` · `BAG · RAISED BY STASH` `$1,840 / $4,500` (Anton 14px gold, cap `#4f4f59`) gold-gradient fill · `STAMINA` `73 / 100` gold-gradient fill.

## Messages (header bubble button)

Full-screen, app bg + pinstripe. Header `padding:50px 18px 14px`, bg `#0d0d11`, bottom border `#1f1f27`.
- **List state:** title `MESSAGES` (Anton 19px ls 2px) + ✕. Rows (divider `#1d1c22`, `padding:14px 18px`): 42px circular initial-avatar (gold initials Anton 15px on `#1b1b22`, border `#33333d`) + name (Anton 14px) over snippet (SG 12px `#8e8e9a`, ellipsis) + right stack: time (SG 500 10px `#7a7a86`) and a red unread badge (min-width 16px, `#e0523f`, ink SG 700 9px).
- **Thread state:** `‹` back button (32px, radius 12px) + contact name over role. Bubbles (11px gaps, max-width 80%): **incoming** bg `#1b1b22`, border `#33333d`, text `#d8d6d0`, radius `16px 16px 16px 4px`, left; **outgoing** bg `rgba(232,201,138,0.1)`, border `#3d3627`, text `#f2f0ec`, radius `16px 16px 4px 16px`, right. `padding:11px 14px`, SG 13px lh 1.55; timestamp SG 500 10px `#7a7a86` under each. Composer (top border `#1f1f27`, bg `#0d0d11`): pill input (bg `#1b1b22`, border `#33333d`, focus border `#3d3627`, `padding:11px 16px`) + **SEND** gold pill. Enter sends.

## Ranks popup (profile (i) button)

Centered, full-width, scrolling list of all rank tiers. Header: `RANKS` / `LEVELS 01–100` + ✕. Rows (`padding:11px 18px`, divider `#1d1c22`): level number (SG 500 12px, 30px col) · rank name (Anton 14px) · **YOU chip** on the current tier (gold-chrome/ink) with a subtle row highlight · right `{req} XP` (SG 500 10px). Below-current tiers dimmed.

## Engage modal (ENGAGE / COMPLETE OBJECTIVE)

Centered, **danger border `#5a2b24`**, `padding:16px`.
- Target row: 54×54 portrait (radius 12px, border `#5a2b24`) + name (Anton 21px ls 2px **`#e0523f`**) over role (label style, uppercase).
- **Sim window** — 96px, radius 14px, bg `#0d0d11`, border `#26262e`, vertical scanline texture (`repeating-linear-gradient(90deg,rgba(255,255,255,0.02) 0 2px,transparent 2px 5px)`). Idle: `WIN PROBABILITY` label over the odds range (Anton 34px; `#4fd39a` ≥60, `#e8c98a` ≥45, else `#e0523f`). Running: a canvas fight-trace animates in (opacity swap .4s). Done: a giant **W** or **L** (Anton 56px, gold/red with matching 26px glow) over a `rgba(10,9,8,0.55)` wash.
- Footer: **DIP** (secondary, flex 1, text `#f2f0ec`) + **HIT EM** (danger recipe, flex 1.4).

## Log modal (log preview tap)

Bottom sheet, max-height 82%. Header: `CLOUT LOG` + `{n} EVENTS` label + ✕. Scrolling rows (divider `#1d1c22`, `padding:14px 18px`): time (SG 500 11px `#7a7a86`) · event text (SG 13px `#d8d6d0`) · `+{n}` (SG 700 11px `#f2f0ec`). Newest first.

## Stats overlay (Profile STATS button)

Centered, max-height 82%. Header: `STATS` / `YOUR RECORD ON THE BLOCK` + ✕. Scrolling body (`padding:14px`):
- 2-up grid of stat tiles (border `#26262e`, radius 14px, `padding:15px`): label → value (Anton 26px) → sub (SG 11px `#8e8e9a`). CLOUT · BAG SIZE · **DEAD OPPS in `#e0523f`** · ROBBERIES · CAR THEFTS · HOES.
- **BADGES** section header + `{got}/{total}` count; 2-up grid of badge cards: 30px glyph circle (earned: ring `#3d3627`, fill `rgba(232,201,138,0.12)`, gold glyph; locked: ring `#22222a`, transparent, `#7a7a86`) + name (Anton 13px; locked `#8e8e9a`) over sub (locked prefixed `LOCKED · `). Set: FIRST BLOOD ★ · TURF HOLDER ◆ · RAINMAKER ⬤ · UNTOUCHED ▲ · KINGPIN ✦ · CITY WIDE ✕.

## Equip slot picker (slot box tap)

Bottom sheet, max-height 76%, **top border only** `#3d3627`. Header: `{SLOT} SLOT` / `PICK WHAT RIDES WITH YOU` + **UNEQUIP** (small pill, SG 700 10px `#8e8e9a`, only when the slot is filled) + ✕.
Body (`padding:12px 14px 20px`, 9px gaps): rows for **items valid for this slot only** (radius 14px): name (Anton 15px; unowned `#8e8e9a`) over buff (SG 11px `#8e8e9a`) · tier label · state label (SG 700 10px): `EQUIPPED` gold (row border `#3d3627`, bg `rgba(232,201,138,0.08)`) / `EQUIP` `#f2f0ec` / locked shows the requirement (`LV 15`, `$4,200`) in `#8e8e9a`, `cursor:not-allowed`. Picking equips and closes.

## Stat info popup ((i) on a skill)

Centered. Header: skill name (Anton 21px) / cost line label + ✕. Body (13px gaps): a **build tag row** (border `#3d3627`, bg `rgba(232,201,138,0.06)`, radius 14px): chip `GRINDER/FIGHTER/TANK/COMBAT` (gold-chrome/ink, SG 700 10px) + build meaning (SG 11px `#d8d6d0`); the effect line (SG 15px lh 1.6 `#d8d6d0`); a 2-up `CURRENT` / `COST PER RANK` tile pair (Anton 22px); a footnote (SG 11px `#8e8e9a`).

## Confirm allocation (LOCK IN)

Centered, darkest scrim (0.84). Header: `LOCK IN YOUR BUILD` + cost eyebrow in **gold** `{n} POINTS · {left} LEFT AFTER`. Rows per staged skill: label (Anton 14px) · `{from}` → `{to}` (**to in `#6f8cff`**, Anton 16px) · `{n} PT`. Warning strip (border `#3d3627`, bg `rgba(232,201,138,0.06)`): gold `▲` + *"This can't be undone. There is no respec in this season."* Footer: **GO BACK** (secondary) + **CONFIRM** (gold, flex 1.3, **with sheen**).

## Public profile (leaderboard row tap)

Centered; **border encodes relationship**: `#3d3627` viewing yourself, `#5a2b24` viewing another player. Header: `PUBLIC PROFILE` label + `BOARD {rank}` (gold label) + ✕.
Body: 78×98 portrait with `LV {n}` strip + tag (Anton 24px), rank title + faction chip (bordered pill), clout, then `POWER {n}` / `W/L {w–l}` inline stats. `CREW ON DECK` section: **equipped gear in a 2-up grid** (slot label + tier, name in `#f2f0ec`, buff) + badge pills below.
**Must NOT show:** raw Attack/Defense/Health, current pools, cash, unspent points, unequipped inventory. Enforce via one projection function.
Footer: yourself → `◆ THIS IS WHAT THE STREETS SEE` (gold label strip); other → **MESSAGE** (secondary, flex 1) + **MARK AS OPP** (danger, flex 1.2 — the size difference is deliberate).

## XP toast (any XP gain)

Top pill (`top:64px`, centered, z 90, pointer-events none): amount `+{n} XP` (Anton 17px) + label (SG 700 10px ls 1.5px), `padding:10px 18px`, border `#3d3627`, heavy shadow. Normal: card-gradient bg, **gold text**. Level-up: **gold-chrome bg, ink text**. Animates opacity + translateY(-8px→0) `.28s`; auto-dismisses.
