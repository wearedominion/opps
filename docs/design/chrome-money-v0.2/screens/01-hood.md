# 01 · THE HOOD (city map)

**Nav:** THE HOOD · **Purpose:** see the city, claim turf, locate crew and opps.
**Repo source:** `js/map.js`, `js/map3d.js`, city data → `data/city.json` (prototype: `city-data.js`).

The only screen with **no section title and no body padding** — it fills the scroll body: `position:relative; overflow:hidden; height:100%; background:#595c63`.

Three mutually exclusive modes: **2D** (default), **3D**, **Overview**. A radial vignette sits over all modes (`radial-gradient(130% 100% at 50% 42%, transparent 55%, rgba(0,0,0,0.5) 100%)`, pointer-events none).

## 2D view

A pannable/zoomable **1100×1980** SVG city on an absolutely positioned layer with `transform-origin:0 0`. Pointer drag to pan, scroll/pinch to zoom, double-tap zoom step. `touch-action:none; cursor:grab; user-select:none`.

- City generated from tiered blocks: buildings are rounded rects (`rx:1.5`) filled by tier color, parks `rx:6`. Faction-owned buildings get a 2.2px stroke in the faction color (neutral: 1px tier edge).
- **Selection highlight:** an SVG overlay draws two rects around the picked building — outer `stroke:#e8c98a` 1.6px at 55% opacity with `blink 1.4s` animation (inset −6px), inner `stroke:#f3e0b4` 2.6px (inset −2.5px).
- **Map pings** use `mappulse`.

## 3D view

Same city in WebGL. **Lazy-loaded, pinned, 2D fallback** — `js/map3d.js` already does this; keep that discipline. Orbit drag, right-drag/two-finger pan, scroll zoom, double-tap reset.

## Overview mode

Full-screen illustrated raster: `assets/el-caldero-overview.jpg` (1200×2150), `object-fit:cover`, `transform-origin:center`, on `background:#0b0b0c`.

- **Drag to pan, pinch to zoom** via pointer events (track a pointer map; 2+ pointers = pinch by distance ratio).
- Zoom clamps: **min 1, max 1.8** (raster goes soft beyond 1.8×).
- Pan clamps so the image never shows its edge: max offset = (rendered size − viewport)/2 per axis, recomputed against the cover-fit size on every apply.
- Transform applied directly to the `<img>` (`translate(x,y) scale(s)`), `will-change:transform`, `draggable=false`, `pointer-events:none` on the img (handlers on the wrapper).

## Controls

**Upper-left stack** (gap 6px):
- **OVERVIEW toggle** — pill button, Anton 12px ls 1px, `padding:8px 14px`. Off: bg `rgba(13,13,17,0.9)`, border `#33333d`, text `#f2f0ec`. On: gold-chrome gradient, ink text, borderless.
- When Overview is on: a vertical stack of three **36×36** buttons (radius 12px, bg `rgba(13,13,17,0.9)`, border `#33333d`, glyphs `+ − ⛶` in `#f2f0ec` 19px/13px; hover border `#3d3627` + glyph `#e8c98a`). `+`/`−` step zoom ×1.3; `⛶` resets pan+zoom.

**Upper-right stack** (gap 6px, right-aligned):
- **2D / 3D segmented pill** — one bordered group (`border:1px #33333d; border-radius:999px; overflow:hidden; background:rgba(13,13,17,0.9)`); each segment Anton 12px ls 1px `padding:8px 14px`; active segment gold-chrome bg + ink text, inactive transparent + `#8e8e9a`. Selecting either exits Overview.
- **2D only:** four 36×36 buttons `+ − ⌖ ⛶` (zoom in ×1.5, out, center on base, full city) + a **zoom chip**: Space Grotesk 500 10px `#8e8e9a`, bg `rgba(13,13,17,0.9)`, border `#26262e`, pill, `padding:4px 9px`, e.g. `1.0×` (updated directly, not via re-render).

## Selection card (bottom-anchored)

Appears when a parcel is tapped in 2D (hidden in Overview). `left/right:12px; bottom:14px`, border `#3d3627`, radius **20px**, bg overlay-panel gradient, `box-shadow:0 30px 80px rgba(0,0,0,0.6)`.

Row (`padding:15px`, gap 12px):
- **36×36 tier swatch**, radius 12px, bg = faction color (neutral `#5b6571`), border `rgba(255,255,255,0.18)`.
- `PARCEL {ID · TURF}` label (label style) over the tier name (Anton 20px ls 2px; objective sites read "Objective Site") over an owner line: 7px dot in faction color + Space Grotesk 700 11px owner name in the faction color (`UNCLAIMED` in `#8e8e9a`).
- Circular ✕ (shared recipe) → deselect.

Footer, one of:
- **CLAIM TURF** — full-width primary gold pill (`padding:13px`) **with sheen** (it grants XP by building tier; objective buildings grant more).
- Owned by you: a strip over a 1px `#1f1f27` top border — `◆ CONTROLLED BY YOUR CREW`, label style in `#4fd39a`, centered, `padding:12px 15px`.

## Hint line

Bottom-fixed, centered, pointer-events none, over a bottom-up gradient (`rgba(8,8,10,0.7) → transparent`, padding `30px 16px 12px`). Space Grotesk 500 10px ls 1px `#8e8e9a`. Copy per mode:
- 2D: `DRAG TO PAN · SCROLL / PINCH TO ZOOM · ⌖ BASE · ⛶ FULL CITY`
- 3D: `DRAG TO ORBIT · RIGHT-DRAG / TWO-FINGER TO PAN · SCROLL TO ZOOM · DOUBLE-TAP TO RESET`
- Overview: `DRAG TO PAN · PINCH TO ZOOM`

## Interactions & state

- `mapMode: '2d' | '3d' | 'overview'` (session), pan/zoom per mode (session), `selId` (session), claims → `G.turf` (persistent).
- Claim flow: validate (not already yours) → set owner → XP toast (`+n XP` by tier) → save. Crew/opp "show on map" buttons from other screens navigate here and center the pin.
- All pointer handlers must use pointer capture and tolerate the frame being CSS-scaled (divide deltas by the current scale).
