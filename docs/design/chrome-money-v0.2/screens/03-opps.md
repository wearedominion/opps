# 03 · OPPS LIST

**Nav:** OPPS LIST · **Purpose:** pick a target and fight.
**Repo source:** `js/combat.js`, `data/enemies.json`.

A **12px-gap column** of enemy cards. Card: border `#26262e`, radius 16px, card gradient, `padding:14px`. Card height lands ≈144px — the layout below is what keeps it that tight; don't add rows.

## Card anatomy

**Top row** (flex, gap 12px, `align-items:stretch`):

1. **Portrait** — 68×68, radius 14px, border `#33333d`, bg `#111116`, `overflow:hidden`; a 22px bottom scrim (`linear-gradient(0deg,rgba(8,8,10,0.9),transparent)`) with the **code label** over it (`S-01`, `B-01`… SG 700 10px ls 1px `#f2f0ec`, bottom 4px / left 5px).
   **Location pin button** straddling the portrait's top-left corner (`top/left:-7px`): 26px circle, bg `#1b1b22`, border `#3d3627`, 13px gold filled pin SVG; hover border `#e8c98a`; `::after inset:-9px` hit target. Tap → jump to this opp on The Hood.
2. **Identity column** (`flex:1; min-width:0`): name (Anton 15px ls 1px, ellipsis) → role (SG 11px `#7a7a86`, ellipsis) → `margin-top:auto` distance (`Downtown · 0.3mi`, SG 500 11px `#7a7a86`). **No risk chip** — severity reads off the threat gauge colors.
3. **Right capsule column** (flex-none, centered, gap 10px):
   - **ENGAGE** — height 29px pill, Anton 12px ls 1px, **danger recipe** (text `#e0523f`, border `#5a2b24`, bg `#1b1b22`, hover `rgba(224,82,63,0.12)`), `padding:0 15px`, `::after inset:-8px`. → engage modal.
   - **Reward capsule** — one pill (`border:1px #3d3627; border-radius:999px; overflow:hidden`) of up to two segments: optional bonus-drop segment `★ PISTOL` (bg `#1b1b22`, gold text, SG 700 8px, `padding:4px 8px`) butted against the cash segment `$110–150` (gold-chrome bg, ink, Anton 13px, `padding:4px 10px`).

**Gauges** (below, `margin-top:12px`, 8px gaps). Both labels: 48px-wide label style.
- **HP** — one continuous 7px bar, fill `#e0523f`, width = hp/8.
- **THREAT** — **8 segments**, `flex:1` each, 7px tall, 3px gaps, pill. Filled color encodes severity by position: segments 1–2 `#8e8e9a` (grey), 3–5 `#e8c98a` (chrome), 6–8 `#e0523f` (red). Unfilled `#1f1f27`. `transition: background .4s`.

## Placeholder roster

LOCAL SNITCH (Informant, S-01, hp2 t2, $80–100) · STREET ENFORCER (E-04, hp4 t4, $90–120) · RIVAL CREW (C-07, hp5 t3, $110–150, ★PISTOL) · AUTO THEFT RING (A-02, hp4 t6, $140–200) · RIVAL BOSS (B-01, hp5 t6, $175–250, ★PRODUCT) · UNDERCOVER AGENT (F-09, hp5 t8, $200–300).

## Interactions

- ENGAGE → engage modal (OVERLAYS.md): win probability derived from threat (`lo = clamp(90 − threat×7.5)` rounded to 5s, range lo–lo+25; color green ≥60, gold ≥45, else red), HIT EM runs the fight, W/L result, payouts via the §5.2 sequence.
- Pin → The Hood centered on the opp.
- Enemies from `data/enemies.json`; portraits via `ENEMY_PORTRAITS` (migrate keys into data per the data spec).
