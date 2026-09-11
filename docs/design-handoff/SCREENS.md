# OPPS — Screen Specifications

Companion to `README.md` (shell, tokens, patterns, state, gap analysis). Read that first.
Every measurement here is from the prototype. **Colors are intent, not tokens, and the prototype's
palette is retired** — reconcile against the UI Implementation Contract in `claude.md` (Chrome Money).

---

# SCREENS

## 1. The Hood (map)

**Nav:** THE HOOD · **Purpose:** see the city, claim turf, find crew and opps.
**The only screen with no section label and no body padding** — it fills the scroll body
(`overflow: hidden`, background `#595c63`).

**2D view.** A pannable/zoomable 1100×1980 SVG city on a `transform-origin: 0 0` layer.
Pointer drag to pan, double-tap to zoom, `touch-action: none`, `cursor: grab`.
A radial vignette sits over it (`transparent 55% → rgba(0,0,0,0.5)`), pointer-events none.

**3D view.** Same city in WebGL. **Lazy-loaded, pinned, with a 2D fallback** — see gap 8.

**Controls** — top-right stack, 6px gaps:
- **2D / 3D segmented toggle** — one bordered group, 4px radius, `rgba(16,15,13,0.88)`;
  active segment is filled, divider is a 1px left border on the second button.
- **Zoom in / out / center / reset** — four 34×34 buttons, 4px radius, glyphs `+ − ⌖ ⛶`,
  hover turns border and glyph amber. *(2D only.)*
- **Zoom chip** — mono 9px, e.g. `1.0×`.

**Selection card** — appears bottom-anchored (`left/right: 12px; bottom: 14px`) when a parcel is
tapped. 10px radius, amber-tinted border, heavy shadow.
Row: a 36×36 tier swatch with a matching glow (`box-shadow: 0 0 14px <swatch>55`), then
`PARCEL {id}` (mono 9px, tracking 2px) over the tier name (Saira Condensed 700 20px) over an
owner line (7px dot + Oswald 600 12px in the owner's color), then a circular ✕.
Footer is **one of**: a full-width solid-amber `CLAIM TURF` button (13px padding, ink text), or a
lime `◆ CONTROLLED BY YOUR CREW` strip.

**Hint line** — bottom-centered mono 9px over a bottom-up dark gradient, pointer-events none.

**Map pings** use the `mappulse` keyframe (`scale(0.5) opacity .8 → scale(2.6) opacity 0`).

---

## 2. Make Moves

**Nav:** MAKE MOVES · **Purpose:** the PvE loop — jobs, objectives, daily, territory, log.
Lives in `MakeMoves.dc.html`; rendered with props from the parent.

Sections top → bottom, each introduced by the **section header** pattern (red `›` + title + rule):

1. **Main job card** — the featured objective. Tag chip (`MAIN JOB`), title (Saira Condensed
   800), subtitle, an objective checklist with progress, and a primary action. Opens the
   **engage modal**.
2. **Side hustles** — a column of cards (11px gap). Each: name, reward, cost, a status chip, and
   an action. Status chips: `TIMED` red · `NEW` lime · `ACTIVE` amber · `DONE` grey — each as
   colored text on a 14%-alpha wash of the same hue, which is the house chip recipe.
3. **Daily** — one card with a claim state and a progress bar (`dailyPct`).
4. **The Hood — territory status** — a warm accent card (`linear-gradient(110deg,#23190f,#141210)`,
   amber-tinted border, 8px radius, 16px padding). Left: hood ops stat tiles
   (ACTIVE JOBS / HUSTLERS / SAFEHOUSES / DRUG DENS). Right: `TERRITORY` label over a large mono
   percentage (26px, amber).
5. **Sightings** — recent opp/crew sightings, each a compact row.
6. **Log** — a tappable preview of the last few events (`#15130f`, 6px radius, hover border
   ambers) that opens the **log modal**.

---

## 3. Opps List

**Nav:** OPPS LIST · **Purpose:** pick a target and fight.
A 12px-gap column of enemy cards. Each card is the standard card (6px radius, 14px padding) with:

- **Value tag** *(conditional)* — top-right corner, notched (`border-radius: 0 6px 0 6px`),
  `#e4ef3a` on ink, `★ {value}`, 9px 700.
- **Portrait** — 66×66, 4px radius, inset shadow, a bottom gradient scrim, and a **code label**
  (mono 9px, tracking 1px, text-shadow) over the scrim.
- **Identity** — name (Saira Condensed 700 19px), then a wrapping row: role (Oswald 300 12px muted)
  + a **risk chip** (2px radius, 1px border in the risk color, same color text, 9px 600).
- **Distance** — a 7px ring glyph + mono 10px muted.
- **Two segmented bars** — `HP` and `THREAT`, each a 44px mono-ish label + `flex: 1` segments
  (8px tall, 1px radius, 3px gap).
- **Footer** — `REWARD` label + amber mono 15px value on the left; **ENGAGE** button on the right
  (red border and text, dark gradient, hover → amber).

---

## 4. Plugs

**Nav:** PLUGS · **Purpose:** NPC connects — the shop/quest-giver surface.
A 12px-gap column of **horizontal** cards, 6px radius, **gold border** (`#d8a23a` — plugs are the
only gold-bordered surface).

- **Left:** a 146px-wide full-height portrait with a bottom gradient scrim.
- **Right:** `padding: 16px 14px 12px`, `min-height: 206px`, column flex.
  Name (Saira Condensed italic 800 23px) → moniker (mono 10px, tracking 2px, amber) → hook line
  (Oswald 300 13px, `line-height: 1.5`, `text-wrap: pretty`) → **LETS GO** button pinned to the
  bottom-right via `margin-top: auto`.

Opens the **plug dialogue popup**.

---

## 5. Crew

**Nav:** CREW · **Purpose:** your people and what they're doing.
Sections (22px gaps), each a **section header** with a count, then member cards (11px gaps).

**Member card** — 92px tall, 8px radius, horizontal, hover border ambers:
- **Left:** name (Saira Condensed italic 800 23px, ellipsis) over a status line — a 7px status dot
  in a state color + mono 11px activity text.
- **Right:** a 33%-width portrait panel with a 1px left divider.
- **Map pin button** — 30px circle straddling the portrait's left edge (`top:-1px; left:-15px`),
  ink fill, amber border, amber pin SVG. Hover adds an amber glow. Jumps to that member on the map.

Card taps open the **crew dialogue popup**.

---

## 6. Player Profile

**Nav:** PROFILE · **Purpose:** identity, progression, loadout, and the public show-off view.
Implements `docs/profileScreen.md`. Column, 14px gaps.

### 6.1 Identity header (unboxed)

**No border, no panel background** — deliberate: identity floats on the base layer so the
interactive tiers below read as separate. Flex row, 12px gap, `position: relative`.

- **Portrait** — 80×92, 6px radius, 1px amber-tinted border. Bottom strip: `LV {n}`, mono 9px,
  tracking 2px, amber, on `rgba(10,9,8,0.82)`, centered, 4px padding.
- **Name** — Saira Condensed italic 800 **24px**, `#f5e9d6`, single line with ellipsis,
  **`padding-right: 82px`** to clear the STATS button.
- **Rank row** — rank title + an inline info (i) button.
- **Clout bar** — 6px tall, 3px radius, dark track, amber gradient fill.
- **STATS button** — absolute `top:-1px; right:0`. Oswald 600 10px, tracking 1.5px, 3px radius,
  `padding: 6px 10px`. Amber-outlined when closed; **solid amber with ink text while the stats
  overlay is open.**

### 6.2 Tab bar

Three `flex: 1` buttons — **SKILLS · GEAR · LEADERBOARD**. 3px radius, 9px vertical padding,
Oswald 600 11px, tracking 1.5px.
Active = solid amber on ink text. Inactive = dark gradient, hairline border, muted text; hover
brightens text and ambers the border.

**Skill-points badge** — when unspent points exist, a pill on the **top-left corner of the SKILLS
tab** (`top:-6px; left:-5px`): lime fill, 1px ink ring, 20px radius, `padding: 1px 5px`,
mono 700 8px, copy `{n} PTS` (`1 PT` singular). Hidden at zero.

### 6.3 SKILLS tab

**Spend ledger** — one bordered row, three equal columns: **AVAILABLE · SPENDING · LEFT**.
Labels mono 8px tracking 1.5px muted; values mono **17px**, `line-height: 1.15`,
`padding: 7px 13px 8px`. AVAILABLE lime, LEFT near-white, SPENDING turns lime when non-zero.
*(Deliberately tightened from 20px/11px — do not re-inflate.)*

**Five skill rows** — name + inline (i), current value, an amber progress bar, and a **lime +**
button (disabled when unaffordable).

| Skill | Cost | Effect | Build |
|---|---|---|---|
| MAX MOVES | 1 | More PvE jobs per session — faster mastery, cash, levels | GRINDER |
| MAX STAMINA | **2** | Attack other players more often — cadence is an investment | FIGHTER |
| MAX HEALTH | 1 | Survive more rounds; resist hospitalization; poor to farm | TANK |
| ATTACK | 1 | Damage dealt. **Equipped gear dominates this total** | COMBAT |
| DEFENSE | 1 | Damage reduced. **Equipped gear dominates this total** | COMBAT |

Allocation is **staged**, then committed through the **confirm modal**, which carries the
**no-respec warning**. Permanent in v1.

**All skill UI is amber. Only the + button is lime** — lime means "you have something to spend."

> **Carried forward, not built:** ATTACK/DEFENSE should show `base + gear = total`, so the player
> sees why raw points feel weak. Today that tension is only in a popup.

### 6.4 GEAR tab

**Paper doll** — grid `1fr 84px 1fr` × 3 rows, 8px gap, items centered.
Centre column spans all three rows: an **84×196 inline-SVG human figure** — head circle, torso
rounded rect, two arms, two legs, two feet, in muted greys with faint amber strokes. A placeholder;
replace with real art per the asset spec.

| Cell | Content |
|---|---|
| row 1 left / right | HEAD / RIGHT HAND |
| row 2 left / right | TORSO / LEFT HAND |
| row 3 left / right | LEGS / KICKS · **GEAR POWER tile** |

**Slot box** — 6px radius, dark gradient, 1px border, `padding: 7px 9px`. Slot label (mono 7.5px,
tracking 1.5px, muted) → item name (Saira Condensed 700 12px, **colored by tier**) → buff line
(mono 7.5px). **Empty slots use a dashed border**, read `EMPTY` in grey, and say `Tap to equip`.
Hover ambers the border.

**GEAR POWER tile** — amber-bordered, `GEAR POWER` label over the summed power (mono 17px amber)
over `{n}/5 SLOTS`.

**Off-body slots** — RIDE and STASH are not worn, so they sit in a 2-up row below the figure using
the identical slot-box treatment.

**Inventory list** — section header (`INVENTORY` + rule + `{n} ITEMS`), then one bordered
container (8px radius) of hairline-divided rows.
Row: item name (Saira Condensed 700 14px) over `{SLOT} · {buff}` (mono 8px) → tier label in the
tier color → a status chip: `EQUIPPED` (lime text, lime border, lime-tinted row background) or
`EQUIP` (muted). Tapping a row equips it into its slot — no modal.

**Equipped items stay in the list**, deliberately: the player's real question is always "is this
better than what I'm wearing," which needs both visible at once.

**Tier colors:** COMMON / RARE / ELITE / LEGEND — an ascending four-step scale.

### 6.5 LEADERBOARD tab

Ranked player rows; tapping one opens the **public profile** overlay.
Footer hint: `TAP A PLAYER TO SEE THEIR PROFILE` (mono 9px, tracking 1.5px, centered, muted).

---

## 7. Settings

**Nav:** SETTINGS · Column, 22px gaps. Groups are introduced by a mono 9px tracking-2px label.

**PREFERENCES → Sound effects.** A card row: a 38×38 icon well (6px radius, `#1c1a17`, amber
speaker SVG) + title (Saira Condensed 700 16px) over a sub-line that ends in the live state in
amber mono + a **toggle switch**: 48×26 track, 13px radius, 20px knob, `transform` and
`background` both `.2s`.

**ACCOUNT → two expanding rows** (`ACCOUNT INFO`, `CONTACT DEVELOPER`). Header row: icon well +
title + a `›` chevron that rotates `.2s` when open. Expanded body sits under a hairline and holds
label/value rows (Oswald 300 12px muted label, right-aligned value; values are mono for IDs and
Saira Condensed for names). Contact adds a prose line and a full-width solid-amber
`REPORT A BUG` button.

---

# OVERLAYS

All render inside the app frame. Scrim tap closes; the panel stops propagation.
**Never use `alert`/`confirm`/`prompt`.**

| Overlay | z | Placement | Scrim | Motion |
|---|---|---|---|---|
| Nav drawer | 50/51 | left, 262px | .6 | `translateX` .28s cubic-bezier(.4,0,.2,1) |
| Metrics panel | 55 | top-anchored, inset 12px | .55 | — |
| Messages | 55 | full-screen | — | opacity + `translateY` .22s |
| Ranks popup | 58 | centered | .78 | scale .2s |
| Engage modal | 60 | centered | .78 | scale .22s |
| Log modal | 60 | bottom sheet | .78 | `translateY` |
| Public profile | 64 | centered | .82 | scale |
| Confirm allocation | 66 | centered | .84 | scale .2s |
| Stat info popup | 67 | centered | .8 | scale |
| Equip slot picker | 68 | bottom sheet, max-h 76% | .78 | `translateY` .24s |
| Stats overlay | 69 | centered, max-h 82% | .8 | scale(.94→1) .22s |
| Plug / crew dialogue | 70 | centered, max-w 330px | .8 | scale |
| XP toast | 90 | top pill | — | opacity + Y .28s |

### Metrics / currencies panel
Top-anchored (`top: 76px; left/right: 12px`), 10px radius, amber-tinted border, heavy shadow.
Header: red `›` + `POWER & CURRENCIES` (mono 9px tracking 2px) + circular ✕.
**Clout hero:** `TOTAL CLOUT` label over a **42px Saira Condensed italic 800 amber** number
(`line-height: .9`) over a muted descriptor; right side shows `LEVEL {n}` over the rank title.
Then a hairline, then **metric rows** (15px gaps): each is a label + right-aligned value over a
6px bar — XP to next (amber), BAG (lime, with a `· CAP AT LV 7` qualifier in dim text and a
`$898 / $2,500` split value), STAMINA (blue).

### Messages
Full-screen, same dot-grid background as the app. Header `padding: 50px 16px 13px` on `#15130f`.
**Two states:**
- **List** — title `MESSAGES`; rows of 42px circular initial-avatars (amber initials on `#23201c`)
  + name over a snippet (ellipsis) + a right stack of mono 9px time and a red unread badge.
- **Thread** — a `‹` back button, the contact name over their role. Bubbles: **incoming**
  `#1d1a17`, hairline border, `border-radius: 8px 8px 8px 2px`, left-aligned, max-width 80%;
  **outgoing** amber wash (`rgba(245,144,42,0.16)`), amber border, `8px 8px 2px 8px`, right.
  Timestamps mono 9px below each. Composer: a dark input (3px radius, focus ambers the border) +
  a solid-amber `SEND` button. Enter sends.

### Plug dialogue popup
Centered, max-width 330px, 8px radius, **lime border** (`#bfce1c`), `#16140f → #0c0b09`.
Advancing dialogue with choice buttons.

### Crew dialogue popup
Identical geometry, **amber border** — the border color is what distinguishes the two.

### Engage modal
Centered, 8px radius, **red-tinted border** (`rgba(226,59,46,0.55)`). Confirms a fight: target
summary, stakes, and a red primary action.

### Log modal
Bottom sheet, `max-height: 82%`, `border-radius: 10px 10px 0 0`, amber-tinted border, no bottom
border. A scrolling event feed, newest first.

### Stats overlay
Centered, `max-height: 82%`, 12px radius, 1px amber border, `box-shadow: 0 18px 50px rgba(0,0,0,.7)`,
18px scrim padding. Header: `STATS` (Saira Condensed 700 17px) over
`YOUR RECORD ON THE BLOCK` (mono 8px tracking 1.5px) + circular ✕. Body scrolls (14px padding):
a 2-up grid of stat tiles — CLOUT (amber), BAG SIZE, DEAD OPPS (red), ROBBERIES, CAR THEFTS, HOES —
each a label over a value over a muted sub-line.

**This replaces the STATS tab and `js/stats.js`.**

### Equip slot picker
Bottom sheet, `max-height: 76%`, `border-radius: 12px 12px 0 0`, amber top border.
Header: slot name over a subtitle, an `UNEQUIP` action (red text, red-tinted border, **only when
something is equipped**), and a circular ✕.
Body scrolls (`padding: 12px 14px 20px`, 9px gaps): rows of **items valid for that slot only** —
name (Saira Condensed 700 15px) over the buff (mono 8px), tier label, and a state label.
**Locked items are dimmed**, `cursor: default`, and show their requirement (`LV 15`, `$18K`).
Dismiss: scrim, ✕, or picking.

### Stat info popup
Centered, 10px radius, amber-tinted border, `padding: 24px 18px` scrim.
Carries the contextual explanation: build-type tag (GRINDER / FIGHTER / TANK / COMBAT), what the
stat does, cost per rank, and — for ATTACK/DEFENSE — the caveat that gear dominates the total.

### Confirm allocation
Centered, 10px radius, **lime border**, `#1c1d14 → #0e0d0b`, scrim .84 (the darkest — this is the
most consequential confirm in the game). Summarizes the staged allocation and carries the
**permanent / no-respec warning**.

### Public profile
Centered, 10px radius, **accent border that varies by relationship** (`pubAccent` — self vs. other).
Shows name, avatar, level, clout, and **equipped gear in a 2-up grid**.
**Must not show** raw Attack/Defense/Health, current pools, cash, unspent points, or unequipped
inventory (`docs/profileScreen.md`, Self vs Public).
Footer: viewing **yourself** → a lime `◆ THIS IS WHAT THE STREETS SEE` strip; viewing **another
player** → a `MESSAGE` button (`flex: 1`, neutral) and a red `OPP` button (`flex: 1.2`, solid,
ink text) — the size difference is intentional emphasis.

### Ranks popup
Centered, 8px radius, amber-tinted border, scrolling list of all rank tiers with the current one
marked.

### XP toast
Top pill (`top: 64px`, centered), 999px radius, amber-tinted border, heavy shadow,
pointer-events none. Mono amount + Oswald label. Animates opacity and Y over `.28s`.
On level-up the background and text colors invert to ink-on-lime.
