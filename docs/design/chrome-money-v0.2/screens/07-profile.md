# 07 · PLAYER PROFILE

**Nav:** PROFILE · **Purpose:** identity, progression, loadout, leaderboard.
**Repo source:** `docs/profileScreen.md`; gear → `data/gear.json`; skills → `data/skills.json`.
The largest feature. Column, **14px gaps**. ⚠ Conflicts 1–3 in README all land here.

## 1. Identity header (unboxed — no border, no panel; floats on the base layer)

Flex row, gap 12px, `position:relative`:

- **Portrait** — 80×92, radius 14px, border `#33333d`, bg `#111116`; bottom strip `LV {n}` (label style in **gold**, centered, `padding:4px 0`, bg `rgba(8,8,10,0.86)`).
- **Column** (`flex:1`, gap 7px):
  - Handle `LIL WASH` — Anton **26px** ls 1px, ellipsis, `padding-right:84px` to clear the STATS button.
  - Rank row: rank title (Anton 13px ls 1.5px) + **(i) button** — 20px circle, bg `#1b1b22`, border `#33333d`, gold `i` SG 700 10px → ranks popup.
  - Clout: value (Anton 24px) + `CLOUT` label on one baseline.
  - Bottom (margin-top auto): `XP TO {NEXT RANK}` label vs `{into}/{span}` (SG 11px `#7a7a86`), then a **7px bar, fill `#6f8cff`** (XP is always blue).
- **STATS button** — absolute `top:-1px; right:0`, Anton 13px pill `padding:7px 15px`. Closed: dark secondary (text `#f2f0ec`). While the stats overlay is open: **solid gold-chrome + ink**.

## 2. Tab bar

Three `flex:1` pill tabs (7px gap), Anton 13px, `padding:10px 0`: **SKILLS · GEAR · LEADERBOARD**. Active: gold-chrome + ink. Inactive: `#1b1b22` / border `#33333d` / `#8e8e9a`, hover brightens.
**Skill-points badge** on SKILLS when unspent points exist: absolute `top:-6px; left:-3px`, **bg `#6f8cff`**, 1px `#0b0b0c` ring, pill, `padding:2px 7px`, SG 700 9px ink, copy `{n} PTS` (`1 PT` singular).

## 3. SKILLS tab (column, 11px gaps)

**Spend ledger** — one bordered row (border `#26262e`, radius 16px, card gradient), three equal cells split by 1px `#1f1f27` dividers, `padding:11px 14px 12px`: label over Anton 22px value — **AVAILABLE** (in `#6f8cff`) · **SPENDING** (`#7a7a86`, turns `#6f8cff` when >0) · **LEFT** (`#f2f0ec`).

**Five skill cards** (border `#26262e` → **`#6f8cff` when staged**, radius 14px, `padding:14px`):
- Left: label (Anton 15px) + (i) button (20px circle as above) → stat info popup; below, cost line (SG 11px): `1 POINT PER RANK` in `#7a7a86`, `2 POINTS PER RANK` in **gold** (stamina costs double).
- Right numbers (min-width 54px, right-aligned): value Anton 24px — plain `{total}` in `#f2f0ec`, staged `{base} → {total}` in `#6f8cff`; under it `CURRENT` or `+{n} · {cost} PT` (SG 10px ls 1px `#7a7a86`).
- **Stepper**: two 34px circles. `−`: enabled border `#33333d`/text `#f2f0ec`, else `#22222a`/`#4f4f59`. `+`: enabled bg `rgba(111,140,255,0.18)`, border+text `#6f8cff`; disabled recipe otherwise. Staging is blue; **gold never marks spending**.
- Bottom: **4px** gold bar, width = total/12.

Skills: MAX MOVES (1pt, GRINDER) · MAX STAMINA (**2pt**, FIGHTER) · MAX HEALTH (1pt, TANK) · ATTACK (1pt, COMBAT) · DEFENSE (1pt, COMBAT). Copy per skill in `design_reference` (`skillDefs`, `statNotes`, `buildMeanings`).

**Warning line**: gold `▲` + *"Allocation is permanent — no respec. Spend like you mean it."* (SG 11px `#8e8e9a`).
**Action row**: **RESET** (secondary, flex 1) + **LOCK IN {n} PTS** (gold, flex 1.5, `padding:13px`, **with sheen**) → confirm allocation overlay. Zero staged: disabled `NOTHING TO LOCK`.

## 4. GEAR tab (column, 14px gaps)

**Paper doll** — grid `1fr 84px 1fr`, 3 auto rows, 9px gap, `align-items:center`. Center column spans all rows: an **84×196 inline-SVG figure** (head circle r14, torso 34×60 rx12 in `#1f1f27`/stroke `#33333d`; arms 11×54, legs 13×72, feet 17×9 in `#181820`/stroke `#26262e`) — placeholder, replace with real art.

Slot cells — HEAD (1/1), RIGHT HAND (1/3), TORSO (2/1), LEFT HAND (2/3), LEGS / KICKS (3/1); cell 3/3 is the **GEAR POWER tile**.
**Slot box:** radius 14px, card gradient, `padding:10px 11px`; label (label style) → item name (Anton 13px, **colored by tier**) → buff (SG 10px `#8e8e9a`). Empty: **dashed** `#33333d` border, name `EMPTY` in `#8e8e9a`, buff `Tap to equip`. Hover border `#3d3627`. Tap → **equip slot picker** (bottom sheet, OVERLAYS.md).
**GEAR POWER tile:** border `#3d3627`, `GEAR POWER` label → summed power (Anton 22px) → `{n}/5 SLOTS` (SG 10px `#8e8e9a`).

**Off-body slots** — RIDE and STASH in a 2-up row below, identical slot-box treatment. (STASH raises the BAG cap: base $2,500 + the stash buff.)

**Inventory** — section header (`INVENTORY` + rule + `{n} ITEMS`), then one container (border `#26262e`, radius 16px, `overflow:hidden`) of rows (divider `#1d1c22`, `padding:11px 13px`): name (Anton 14px) over `{SLOT} · {buff}` (SG 11px `#7a7a86`) → tier label (tier color) → status chip: **EQUIPPED** (gold-chrome bg, ink, pill; row bg `rgba(232,201,138,0.05)`) or **EQUIP** (`#8e8e9a` on `#1b1b22`, border `#33333d`). Tapping an EQUIP row equips instantly — no modal. Equipped items **stay in the list** (comparison is the point).

## 5. LEADERBOARD tab

Header row: `LEADERBOARD` section header + three mini pill filters right (e.g. CLOUT/WEEK/CREW; active gold, inactive transparent + border `#26262e`).
Table container (border `#26262e`, radius 16px): a header row (`#` · `PLAYER` · `CLOUT` labels), then rows (divider `#1d1c22`, `padding:12px 14px`): rank (SG 500 12px, gold for top ranks) · tag (Anton 15px) · **YOU chip** on your row (gold-chrome, ink, SG 700 9px pill) · right clout (SG 500 13px) + `›`. Row tap → **public profile** overlay.
Footer: `TAP A PLAYER TO SEE THEIR PROFILE` (label style, centered).
⚠ No data source yet (conflict 3) — ship stubbed.

## Interactions & state

- `pfTab` session; skills commit only through the confirm overlay (permanent, no respec); staged `pend` is session-only, RESET zeroes it.
- Equipping writes `G.equipped[slot]=itemId`; UNEQUIP (in picker) writes null. Attack/Defense derive from equipped gear (conflict 1).
- Gear power = sum of equipped `pow`. Set bonus copy at 6/6 filled: `ALL SLOTS FILLED · +5% clout on every job`; 5+ non-common: `FULL DRIP · +12% clout on every job`.
- Related overlays (OVERLAYS.md): stats overlay, ranks popup, stat info, confirm allocation, equip picker, public profile.
