> **Provenance note (added when this was copied into the repo, 2026-09-09).**
> This directory is a **verbatim copy** of the design-handoff bundle's written specs, brought in
> so that references from `docs/tdds/` resolve. Two things to know:
>
> 1. **Only `README.md` and `SCREENS.md` were copied.** The three prototype files listed in the
>    table below — `OPPS App.dc.html`, `MakeMoves.dc.html`, `OPPS App (standalone).html` — were
>    **not** brought in. They total ~2.2 MB, they are reference-only, and this document itself
>    says they must never be ported. They live in the `design_handoff_opps_game` bundle.
> 2. **This is a design document, not a spec.** Where it disagrees with `docs/specs/` or
>    the UI Implementation Contract in `claude.md`, those win. See the correction immediately below.
>
> **The tokens section of this document is dead — do not use it.** It describes the amber /
> highlighter system (`#f5902a` / `#e23b2e` / `#bfce1c`, Saira Condensed / Oswald / JetBrains
> Mono) from `OPPS_UI_Agent_Style_Guide.md`, which was **deleted on 2026-09-10** and replaced by
> the **Chrome Money** system in the UI Implementation Contract in `claude.md`. Chrome, Anton and
> Space Grotesk override every colour, font and radius named below. The shipped `index.html` and
> `css/styles.css` match neither system yet — the port runs code → `claude.md`. Treat this
> document as **layout and screen-inventory reference only**.
>
> Related: the build order below calls the app shell "mostly exists, align to the design." It is a
> **replacement**, not an alignment, and it is the critical path for every other screen.

---

# Handoff: OPPS — Full Game UI

**Target repo:** `wearedominion/opps` (branch `main`)
**Design source:** `OPPS App.dc.html` + `MakeMoves.dc.html` (Omelette project "Opps v3")
**Scope:** every screen and overlay in the prototype — the whole game, not one feature.

| File | What it is |
|---|---|
| `README.md` | This file — how to use the bundle, the shell, tokens, state, data, build order, and the gap analysis against the repo. |
| `SCREENS.md` | Screen-by-screen and overlay-by-overlay specification. The bulk of the detail. |
| `TDD-player-profile.md` | A worked Technical Design Document for the largest feature, filled against the repo's own template. Use it as the model for the others. |
| `OPPS App.dc.html` | The prototype. Reference only. |
| `MakeMoves.dc.html` | The Make Moves screen, a child component of the above. Reference only. |
| `OPPS App (standalone).html` | Self-contained build — open in a browser to *see* the design. ⚠️ Predates the newest profile changes. |

---

## About the design files

These are **design references authored in HTML** — prototypes of intended look and behavior,
**not production code**. They use a component format that does not exist in OPPS and **must not be
introduced to it**: the repo prohibits frameworks, bundlers, and build steps
(`docs/specs/02-tech-architecture.md` §4). Do not port the `.dc.html` files. Do not add React.

**The task is to recreate these designs in OPPS's existing vanilla-JS environment**, governed by:

| Authority | Governs |
|---|---|
| `claude.md` (UI Implementation Contract) | **All UI.** Highest authority for visuals. |
| `docs/specs/03-game-architecture.md` | Module pattern, action sequence, load order, state model |
| `docs/specs/04-game-data-spec.md` | JSON-first content, schemas, save migration |
| `docs/specs/02-tech-architecture.md` | What may and may not be added to the stack |
| `docs/specs/06-technical-requirements.md` | TDD gates, testing, PR checklist |

> ⚠️ **The prototype's colors are not the repo's tokens.** It was designed before the style guide
> was consulted. Where a prototype hex has a token equivalent, **use the token** — the style guide
> wins (tenet T7: no new colors, fonts, or radii). The hex table below is recorded so you can read
> *intent* (accent vs. muted vs. positive vs. danger), not to be pasted into CSS.

## Fidelity

**High-fidelity** for layout, hierarchy, spacing, component structure, states, motion, and copy.
**Not authoritative** for palette and type — reconcile those against the style guide.

---

## What's in the prototype

**Seven screens** (one at a time in the scroll body):

| Screen | Nav label | Status in repo today |
|---|---|---|
| The Hood (city map, 2D/3D) | THE HOOD | `js/map.js`, `js/map3d.js` exist |
| Make Moves | MAKE MOVES | partially — `js/jobs.js` |
| Opps List | OPPS LIST | partially — `js/combat.js` |
| Plugs | PLUGS | `js/plugs.js` exists |
| Crew | CREW | `js/crew.js` is a stub |
| Player Profile | PROFILE | **not built** — the largest new feature |
| Settings | SETTINGS | **not built** |

Nav also lists **INVENTORY** as a disabled item — it was folded into the Profile's GEAR tab.
Remove it or leave it disabled; do not build a separate inventory screen.

**Fourteen overlays**, all rendered inside the phone frame, never as browser dialogs:
metrics/currencies panel · nav drawer · ranks popup · messages (list + thread) · plug dialogue ·
crew dialogue · engage modal · log modal · stats overlay · equip slot picker · stat info popup ·
confirm allocation · public profile · XP toast.

---

## The app shell

Everything below the device bezel. Build this once; every screen renders inside it.

**Root:** 402×872 logical px (iPhone-class). Background `#100f0d` with a 3px dot-grid
(`radial-gradient(rgba(255,255,255,0.014) 1px, transparent 1px)`). Column flex.
**The bezel is a prototype presentation device only — do not build it.**

### Header (fixed, `padding: 52px 18px 0`, background `#0b0a09`)

Left → right:
1. **Wordmark** `OPPS` — Saira Condensed italic 800, 30px, amber, `letter-spacing: -0.5px`.
2. **Clout + level cluster** (tappable → metrics panel, hover `opacity: .82`):
   - `CLOUT` label (JetBrains Mono 8px, tracking 2px, muted) over the value (JetBrains Mono 13px,
     amber, `letter-spacing: -1px`).
   - Rank title over a **3px** clout progress bar, min-width 58px, amber gradient.
   - A `▾` affordance.
3. **Messages button** — 38×38, 5px radius, speech-bubble SVG. Red unread badge at `top:-5px;
   right:-5px`, min-width 16px, 8px radius.
4. **Hamburger** — 38×38, three 18×2px bars.

Below: a 2px full-bleed amber gradient rule, then a 20px downward shadow scrim.

### Scroll body

`flex: 1`, `padding: 16px 18px 28px`, scrollbars hidden. **The map screen is the exception** —
it sets `padding: 0` and `overflow: hidden` and fills the body.

**Section label:** every screen except the map shows a screen label at the top —
JetBrains Mono 500, **9px**, tracking 2px, `#7a7368`, followed by a hairline rule, 16px below.
*(Deliberately small and quiet — it is a caption, not a title. Do not enlarge it.)*

### Nav drawer

262px wide, slides from the left over a `rgba(0,0,0,0.6)` scrim.
`transform .28s cubic-bezier(.4,0,.2,1)`. Header repeats the wordmark + a circular ✕.
Items are 14px 20px rows with a 3px left border that turns amber when active; disabled items are
dimmed and show a `LOCKED`-style chip.

---

## Design tokens (prototype values — reconcile against the style guide)

| Role | Hex |
|---|---|
| Amber accent (primary) | `#f5902a` |
| Amber hover / bright | `#ffa23f`, `#ff9e36`, `#ffae4d` |
| Amber deep (gradient start) | `#c2410c` |
| Gold (plugs) | `#d8a23a` |
| Lime (positive, spendable, owned) | `#bfce1c` → `#eef64a` |
| Yellow (value tag) | `#e4ef3a` |
| Red (danger, opps, unread) | `#e23b2e` |
| Blue (stamina) | `#3a86b8` → `#5bbfe8` |
| Ink (on-accent text) | `#15120e` |
| Surface base | `#100f0d` · header `#0b0a09` · raised `#15130f`, `#1c1a17` |
| Panel gradient | `#1a1815 → #141210` |
| Panel gradient (accent) | `#211b14 → #0e0d0b` · warm `#23190f` |
| Text | `#f5e9d6` → `#e9e4db` → `#cfc9bf` → `#a39c91` → `#8c867b` → `#7a7368` → `#615c54` |
| Hairline | `rgba(255,255,255,0.05 – 0.16)` |

**Radii:** 2–3px (chips, buttons, inputs) · 4–6px (cards, tiles, icon wells) · 8px (list
containers, member cards) · 10–12px (overlay panels) · 999px / 50% (pills, avatars, ✕ buttons).

**Type:**

| Family | Weights | Used for |
|---|---|---|
| **Saira Condensed** | 700, 800, italic 800 | Names, headings, display numbers. Italic 800 is the "identity" voice (player names, plug names, crew members, wordmark). |
| **Oswald** | 300, 600, 700 | Buttons, tabs, nav, body copy (300 for prose). |
| **JetBrains Mono** | 400, 500, 700 | Every label, count, stat value, timestamp, ID. Labels are 8–9px with 1.5–2px tracking. |

**Motion:** `.16s` hover/state · `.2s–.24s` overlay opacity and transform · `.28s` drawer and XP
toast. Scale-in overlays go `scale(0.94) → scale(1)`. Sheets translate on Y. Nothing else animates.
Keyframes in use: `mappulse` (map ping), `blink` (live indicator), `mxdrop` (dropdown entry).

**Spacing:** 8px-ish grid — 7 · 8 · 9 · 11 · 12 · 13 · 14 · 16 · 22px gaps in use.

---

## Recurring patterns (build these once)

1. **Card** — `border: 1px solid rgba(255,255,255,0.07)`, 6px radius,
   `linear-gradient(180deg,#1a1815,#141210)`, 14px padding. The default container everywhere.
2. **Section header** — red `›` + Saira Condensed 700 17px title + hairline rule + a mono count on
   the right. Used on Crew, Make Moves, Inventory.
3. **Stat tile** — mono 8–9px label over a large mono value (17–26px) over an optional muted
   sub-line. Arranged in 2-up grids.
4. **Segmented bar** — a row of `flex: 1` segments, 8px tall, 1px radius, 3px gap, filled/unfilled.
   Used for HP, threat, and level progress. *(Not a continuous bar — segments are the house style.)*
5. **Continuous bar** — 3px (header) or 6px (panels), rounded, dark track, gradient fill.
6. **Primary action button** — Oswald 600, 13px, tracking 2px, 3px radius, `padding: 9px 22px`,
   dark gradient with a colored border that shifts amber on hover. Solid-amber-with-ink-text is the
   emphasis variant.
7. **Circular ✕** — 26–32px, transparent, 1px hairline border, hover turns amber.
8. **Overlay** — full-bleed scrim (`rgba(0,0,0,0.55–0.84)`) + a panel. Three placements:
   **centered** (modals), **bottom sheet** (pickers, log), **full-screen** (messages).
   Scrim tap closes; the panel stops propagation.
9. **Empty state** — dashed border, muted `EMPTY` label, an instruction line.

---

## State management

### Session-only UI state (never persisted)

`screen`, `drawer`, `modal`, `metricsOpen`, `msgOpen`/`msgThread`, `logOpen`, `ranksOpen`,
`plugModal`, `crewModal`, `pfTab`, `statsOpen`, `gearPick`, `pendingSkills`, `infoKey`,
`pubView`, `selBldg`, `mapMode` (2d/3d), map pan/zoom, `acctOpen`/`contactOpen`.

In the repo this is DOM/CSS class state driven by `showTab()` and `.active`/`.open` classes —
**not** a state object. Follow the existing pattern; don't introduce a store.

### Persistent state — fields on `G` (`js/state.js`)

`G` already has: `level`, `xp`, `xpNext`, `money`, `rep`, `energy`, `maxEnergy`, `health`,
`maxHealth`, `attack`, `defense`, `inventory`, `properties`, `jobProgress`, `playerId`,
`lastSeen`, `lastEnergyTick`, `crewMemberCount`, `recruitedBy`, `gems`.

**New fields this design needs** — all additive with defaults, read defensively
(`G.equipped || {}`). Additive means **no migration and no `SCHEMA_VERSION` bump**
(`04-game-data-spec.md` §7.2):

```js
skillPts: 0,        // unspent skill points, +5 per level
maxMoves: 10,       // Grinder pool
maxStamina: 10,     // Fighter pool
equipped: {},       // { slotId: itemId }
turf: {},           // { parcelId: ownerId } — map claims
soundOn: true,      // settings toggle
handle: null,       // display name
```

**Naming note:** the prototype's fiction calls XP **"Clout"**, energy **"Moves"**, and money
**"Bread"/"Bag"**. The code says `xp`, `energy`, `money`. **Keep the code names** — renaming `G`
fields breaks saves (`03-game-architecture.md` §3.1). Map fiction → field in the render layer only.

---

## Data (JSON-first — required, tenet T4)

Existing: `jobs.json`, `enemies.json`, `store.json`, `properties.json`, `ranks.json`.

**New files this design implies.** Each needs a global, a `Promise.all` entry in
`loadGameData()`, and the **progress denominator updated** (currently `/ 5`):

| File | Feeds | Notes |
|---|---|---|
| `data/gear.json` | Profile GEAR tab | id, name, slot, tier, pow, buff, atk, def, levelReq, price |
| `data/skills.json` | Profile SKILLS tab | id, name, cost, field, build, desc — so costs tune without code |
| `data/plugs.json` | Plugs screen | currently hardcoded as `PLUGS_DATA` in `js/plugs.js` — the data spec already flags this for migration |
| `data/quests.json` | Make Moves | side hustles + main job objectives + daily |
| `data/city.json` | The Hood | parcels/tiers — the prototype uses a local `city-data.js` |
| `data/monetization.json` | Currencies | already flagged in `04-game-data-spec.md` §6 |

**Slot ids and item ids are save keys** (`G.equipped`) — permanent, lowercase, never reused.

---

## Cross-cutting rules to honor

- **Every action follows the §5.2 sequence:** validate → mutate `G` → `toast`/`log` →
  `updateHUD()` → re-render the tab → `GameState.save()`.
- **No `alert`/`confirm`/`prompt`** — the design's confirm steps are overlays.
- **No `localStorage` or `JestSDK.data` outside `js/state.js`.**
- **Leveling lives in `addXP()`** — don't fork it. Level-up grants 5 skill points and refills
  Stamina, Moves, and Health.
- **Everything SDK-touching is feature-detected with a working fallback.**
- **Every screen must render sanely against an empty data array.**

---

## Gap analysis — where this design and the repo disagree

Resolve these **before** building. Each is a real conflict, not a detail.

### 1. `buyItem()` makes equipping impossible *(blocking, needs a migration)*
`js/store.js` adds `item.atk`/`item.def` **permanently into `G`** at purchase and labels owned
items `✓ EQUIPPED`. This design makes equipping a **separate, reversible act**. Purchase must
become "own it" only, with Attack/Defense **derived from `G.equipped`**. Existing saves have
bonuses already banked → double-counting → **requires a migration, a `SCHEMA_VERSION` bump, and a
golden-file test**.

### 2. `gear.json` vs `store.json` — two sources of truth for items
Either store items gain a `slot` field and `gear.json` is dropped, or `gear.json` supersedes
`store.json` for equippables. **Duplicating item definitions is not acceptable.** Decide first.

### 3. Secondary gear slots — spec and design conflict
`docs/profileScreen.md` §5 requires secondary slots behind each primary with **+1/+2/+3 badges**,
capacity earned from Crew size (+1 per 5 Lieutenants). This design has **five single body slots
plus RIDE and STASH**. One of the two must give.

### 4. The leaderboard has no data source
Saves are per-user blobs; `server/` is purchase-verification only and required to stay minimal.
Cross-player data has no home. Options: a Jest platform surface if one exists, a server extension,
or ship v1 with the leaderboard stubbed against static data. **Ship SKILLS + GEAR first.**

### 5. Crew is a stub pending the Jest SDK
The design shows a populated crew roster with live status and portraits. `js/crew.js` is
referral-stubbed. Build the UI against static data and gate the live parts.

### 6. Public profile leaks hidden combat stats
The public view shows equipped gear with tier and buff text, from which a viewer can tally the
Attack/Defense that combat intel deliberately hides (`docs/profileScreen.md` Q3). Either accept
the leak or show gear cosmetically. **Enforce the hidden-field list in one projection function**,
not per-render.

### 7. Fiction vs. field names
See "Naming note" above. Do not rename `G` fields to match the fiction.

### 8. The 3D map's cost
The prototype has a 2D/3D toggle. Three.js is permitted only **lazy-loaded, pinned, off the
critical path, with a 2D fallback** (`02-tech-architecture.md` §3.2) — which `js/map3d.js`
already does. Preserve that discipline; don't let the toggle load Three eagerly.

### 9. Placeholder content throughout
Item names, plug dialogue, crew members, stat values, and economy numbers are **placeholders**.
Real names and tuned numbers are still owed by the design side. Ship the schema; fill the data.

---

## Suggested build order

Each numbered item is one system file, one TDD, one PR.

1. **Shell** — header, drawer, section label, toast/log helpers. Mostly exists; align to the design.
2. **Metrics panel + ranks popup** — small, self-contained, exercises the overlay pattern.
3. **Player Profile: SKILLS + GEAR** — the biggest feature. TDD included in this bundle.
   Carries the `buyItem()` refactor (gap 1) and the two new data files.
4. **Stats overlay** — replaces the current `stats` tab and `js/stats.js`.
5. **Make Moves** — quests/objectives; extends `js/jobs.js`.
6. **Opps List + engage modal** — extends `js/combat.js`.
7. **Plugs** — move `PLUGS_DATA` to `data/plugs.json` in the same pass.
8. **Messages** — new system; check whether Jest owns messaging before building a local one.
9. **The Hood map polish** — selection card, claim flow, controls.
10. **Crew** — UI now, live data when the SDK lands.
11. **Settings** — smallest; do it whenever.
12. **Leaderboard + public profile** — last, once gap 4 is resolved.

**Per PR:** a reviewed TDD (`06-technical-requirements.md` §1.1), the PR checklist from §6, unit
tests on logic, regression tests on data, e2e on critical flows, and verification in both a plain
browser and Jest.

---

## Assets

- **Portraits** — plug and crew portraits exist in the repo at `assets/portraits/` (`.webp`,
  `.png`). Enemy portraits are keyed in `js/combat.js` (`ENEMY_PORTRAITS`), a data-in-code
  divergence the data spec already flags.
- **Player portrait** — drop-in placeholder in the prototype; needs real art.
- **Body silhouette** (profile paper doll) — inline SVG placeholder, no external asset.
- **Icons** — inline stroked SVG (`stroke-width: 2`, round caps/joins), 15–18px. No icon font.
- **Emoji** — the prototype avoids emoji; existing `store.json`/`enemies.json` content uses it as
  an icon fallback. Decide per-screen whether to surface the `icon` field.
- All new art per `docs/specs/05-asset-spec.md`: `.webp`, sized, lazy off-screen, alt text.

---

Screen-by-screen detail continues in **`SCREENS.md`**.
