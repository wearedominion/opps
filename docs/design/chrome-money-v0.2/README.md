# Handoff: OPPS — Chrome Money UI (full client port)

**Target repo:** `wearedominion/opps` (branch `main`)
**Design source:** `OPPS App.dc.html` + `MakeMoves.dc.html` (Omelette project "Opps v3")
**Scope:** all eight screens + fourteen overlays. Each screen is documented as its own project in `screens/` — treat each file as an independent work order.

| File | What it is |
|---|---|
| `README.md` | This file — shell, design tokens, shared component recipes, state, conflicts, build order. **Read first; every screen doc assumes it.** |
| `screens/01-hood.md` … `screens/08-settings.md` | One implementation guide per screen, in suggested build order. |
| `OVERLAYS.md` | The 14 shared overlays (drawer, modals, sheets, toasts). |
| `OPPS App (standalone).html` | **The overall prototype.** Self-contained, opens in any browser. This is ground truth — when a doc and the prototype disagree, the prototype wins. |
| `design_reference/OPPS App.dc.html`, `design_reference/MakeMoves.dc.html` | Prototype source. Reference only — grep it for exact style strings. |

---

## About the design files

These are **design references authored in HTML** — prototypes of intended look and behavior, **not production code**. They use a component runtime that does not exist in OPPS and must not be introduced: the repo prohibits frameworks, bundlers, and build steps (`docs/specs/02-tech-architecture.md` §4). Do not port the `.dc.html` files. Do not add React.

**Recreate these designs in OPPS's existing vanilla-JS environment** (`index.html`, `js/*.js`, `css/styles.css`), following the repo's module pattern, action sequence, and load order (`docs/specs/03-game-architecture.md`).

## Fidelity

**High-fidelity, and now authoritative for everything** — layout, spacing, structure, states, motion, copy, **and palette/type**. This design is the **Chrome Money** system (Anton + Space Grotesk, cold panels, gold-and-chrome accents). It **supersedes** `OPPS_UI_Agent_Style_Guide.md` and the earlier amber-era handoff (`design_handoff_opps_game/`): the hex values and fonts below ARE the new tokens. Where that old guide's tenets are structural (no new radii sprawl, JSON-first data, no alert/confirm), they still hold; where it names amber/Saira/Oswald/JetBrains values, it is obsolete.

Placeholder caveat: item names, dialogue, crew members, stat values, and economy numbers are design placeholders unless they mirror repo data (gold SKUs do). Ship the schema; tune the data.

---

## Design tokens — Chrome Money

Define these once in `css/styles.css` as CSS custom properties and use them everywhere.

### Color

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0b0b0c` | App background. Always with the pinstripe texture (below). |
| `--surface-deep` | `#0d0d11` | Header wells, image backdrops, log container |
| `--surface` | `#111116` | Card gradient end, portrait backdrops |
| `--surface-raised` | `#1b1b22` | Buttons, icon wells, inputs, avatars |
| `--track` | `#1f1f27` | Meter tracks, hairline section rules, inner dividers |
| `--row-divider` | `#1d1c22` | Hairline between list rows |
| `--border` | `#26262e` | Default card border, full-bleed header rule |
| `--border-strong` | `#33333d` | Control borders (buttons, inputs, portrait frames) |
| `--border-gold` | `#3d3627` | Gold-tinted border: accent cards, hover state, overlay panels |
| `--border-danger` | `#5a2b24` | Engage/opp borders |
| `--border-disabled` | `#22222a` + bg `#141419` | Disabled buttons/chips |
| `--gold` | `#e8c98a` | Flat gold: values, icons, active labels |
| `--gold-deep` | `#a8873f` | End of gold bar-fill gradient |
| `--ink` | `#161208` | Text on gold |
| `--text` | `#f2f0ec` | Primary text |
| `--text-bright` | `#d8d6d0` | Body copy, message bubbles, icons |
| `--text-mid` | `#8e8e9a` | Secondary text, inactive labels |
| `--text-label` | `#7a7a86` | Eyebrow labels, timestamps |
| `--text-disabled` | `#4f4f59` | Disabled labels, "/ cap" halves |
| `--xp` | `#6f8cff` | XP/level bars, skill-point badge, staged skill values |
| `--danger` | `#e0523f` | Opps, HP bars, unread badges, timers |
| `--success` | `#4fd39a` | Owned/completed/positive, working status dots |

**Gradients (exact strings):**
- Gold chrome (primary CTAs, active tabs/segments, wordmark text-fill, EQUIPPED chip, YOU chip): `linear-gradient(135deg,#f3e0b4,#e8c98a 40%,#c9a55c)`
- Card: `linear-gradient(180deg,#181820,#111116)`
- Overlay panel / drawer / selection card: `linear-gradient(180deg,#181820,#0d0d11)`
- Warm gold card (turf status, gold packs): `linear-gradient(110deg,#1d1b16,#111116)`
- Gold bar fill: `linear-gradient(90deg,#e8c98a,#a8873f)`
- Background texture (on `--bg`, also on Messages screen): `repeating-linear-gradient(45deg,rgba(255,255,255,0.012),rgba(255,255,255,0.012) 1px,transparent 1px,transparent 7px)`
- Portrait bottom scrim: `linear-gradient(0deg,rgba(8,8,10,0.9),transparent)` (height 22–80px by context)

**Tier scale:** COMMON `#7a7a86` · RARE `#d8d6d0` · ELITE `#f2f0ec` · LEGEND `#e8c98a`. Tier labels: Space Grotesk 500 10px, letter-spacing 1.5px.

### Type

Google Fonts: `Anton` and `Space+Grotesk:wght@400;500;700`.

| Style | Spec | Use |
|---|---|---|
| Display XL | Anton 42px, ls 1px, lh 0.92 | Clout hero number |
| Display L | Anton 26–30px, ls 1–2px, lh 1 | Screen heroes, player name, featured job title |
| Title | Anton 19–24px, ls 1–2px | Overlay titles, card names, plug names |
| Card title | Anton 14–15px, ls 1–2px | Card/item names, section headers, nav items |
| Button | Anton 12–13px, ls 1px | All buttons |
| Number | Anton 22–28px, ls 0.5px | Stat tile values, wallet, prices |
| Label | Space Grotesk 500 10px, ls 2px, `--text-label` | Every eyebrow/label — the single most-repeated style |
| Body | Space Grotesk 400 11–13px, lh 1.5–1.6 | Prose, sub-lines, `text-wrap: pretty` |
| Chip | Space Grotesk 700 9–10px, ls 0.5px | Badges, status chips |

Anton is display-only and 400-weight-only. No italics anywhere. All-caps for anything set in Anton.

### Shape — everything is a pill or a soft card

| Radius | Use |
|---|---|
| `999px` | ALL buttons, chips, badges, bars, toggle, avatars, zoom chip, engage capsule |
| `22px` | Centered overlay panels |
| `24px 24px 0 0` | Bottom sheets |
| `16px` | Cards, list containers |
| `14px` | Small tiles (stat tiles, slot boxes, skill cards), portrait frames, drawer items |
| `12px` | 38px icon buttons/wells, 36px map controls, message back button |

### Motion

- Hover/state: `transition: all .16s` (or `border-color .16s` / `background .16s` on rows).
- Hover on gold CTAs: `filter: brightness(1.08)`. Hover on dark buttons: border → `#3d3627`, muted text → `#f2f0ec`, ✕/± glyphs → `#e8c98a`. Danger hover: `background: rgba(224,82,63,0.12)`.
- Overlays: opacity `.2–.22s` + `transform: scale(0.94→1)` (or 0.95). Bottom sheets: `translateY(100%→0)` `.24–.26s`. Drawer: `translateX(-112%→0)` `.28s cubic-bezier(.4,0,.2,1)`, scrim `rgba(0,0,0,0.6)` fades `.25s`.
- **All meters are 7px tall**, track `--track`, pill, fill `transition: width .4s`. Mini-bars (header XP, skill rows, objective progress) are 4px.
- **Sheen** — reward-granting gold CTAs only (COMPLETE, BUY, LOCK IN/CONFIRM, CLAIM TURF): a `::after` stripe, `width:34%`, `background:linear-gradient(90deg,transparent,rgba(255,255,255,0.5),transparent)`, `animation: sheen 4.2s linear infinite`, `pointer-events:none`, parent `overflow:hidden`.
  `@keyframes sheen { 0% { transform:translateX(-150%) skewX(-18deg); } 55%,100% { transform:translateX(320%) skewX(-18deg); } }`
  Honor `@media (prefers-reduced-motion: reduce) { button::after { animation:none !important; } }`.
- `@keyframes blink { 0%,100%{opacity:1} 50%{opacity:.25} }` — 1.4s, live dots/timers/selection ring.
- `@keyframes mappulse { 0%{transform:scale(0.5);opacity:.8} 100%{transform:scale(2.6);opacity:0} }` — map pings.
- Sound: a short synthesized WebAudio click on every `button` pointerdown, gated by the sound setting.

### Shared button recipes

1. **Primary (gold):** Anton 13px ls 1px, `--ink` text, gold-chrome gradient bg, no border, pill, padding ~11–13px vertical or `11px 22px`. Hover `brightness(1.08)`. Add sheen only when it grants a reward.
2. **Secondary (dark):** bg `#1b1b22`, border 1px `#33333d`, text `#8e8e9a` (or `#f2f0ec` when it's a co-primary like DIP), hover border `#3d3627` + text `#f2f0ec`.
3. **Danger:** bg `#1b1b22`, border `#5a2b24`, text `#e0523f`, hover bg `rgba(224,82,63,0.12)`. (ENGAGE, HIT EM, MARK AS OPP.)
4. **Disabled:** bg `#141419`, border `#22222a`, text `#4f4f59`, `cursor: default`.
5. **Circular ✕:** 28px, recipe 2 with 13px glyph; hover glyph `#e8c98a`; invisible `::after` with `inset:-8px` extends the hit target.
6. **Icon button:** 38×38, radius 12px, recipe 2, 18px stroked SVG (`stroke:#d8d6d0`, width 2, round caps).

---

## The app shell

Logical viewport **402×872** (iPhone-class). The prototype's bezel, notch, and scale-to-fit logic are presentation only — **do not build them**.

Root: column flex, bg `--bg` + pinstripe texture, `font-family:'Space Grotesk',sans-serif`, `color:#f2f0ec`. `::selection { background:#e8c98a; color:#161208 }`. Scrollbars hidden everywhere.

### Header (fixed, `padding: 52px 20px 0`, bg `#0b0b0c`)

Row, gap 14px:
1. **Wordmark** `OPPS` — Anton 27px, ls 4px, gold-chrome gradient text fill (`background-clip:text`).
2. **Clout cluster** (margin-left auto; tap → metrics panel; hover opacity .82): `CLOUT` label over the value (Anton 15px `#f2f0ec`); rank title label over a **4px** XP bar (min-width 58px, fill `#6f8cff`); a 9px `▾`.
3. **Messages button** — icon button recipe, speech-bubble SVG; unread badge `top/right:-5px`, min-width 16px, bg `#e0523f`, 1px `#0b0b0c` ring, Space Grotesk 700 9px `#161208`.
4. **Hamburger** — icon button, three 18×2px pills `#d8d6d0`, 4px gaps.

Below: full-bleed 1px rule `#26262e`, 15px under the row.

### Scroll body

`flex:1; overflow-y:auto; padding:16px 18px 28px`. **The Hood is the exception:** `padding:0; overflow:hidden`.

**Section title** (every screen except The Hood): the screen name — Space Grotesk 500 **10px**, ls 2px, `#7a7a86` — plus a `flex:1` 1px rule `rgba(255,255,255,0.07)`, 16px margin below. A quiet caption; do not enlarge.

**Section header** (within screens): Anton 15px ls 2px `#f2f0ec` title + `flex:1` 1px rule `#1f1f27` + right-aligned label-style count.

### Nav drawer → see OVERLAYS.md

Eight items, this order: THE HOOD · MAKE MOVES · OPPS LIST · PLUGS · CREW · STORE · PROFILE · SETTINGS. There is **no Inventory screen** — it is Profile's GEAR tab.

---

## State & data

Session UI state (never persisted): `screen`, `drawer`, `metricsOpen`, `msgOpen/msgThread`, `logOpen`, `ranksOpen`, engage `modal`, `plugModal`, `crewModal`, `pfTab`, `statsOpen`, `gearPick`, `pend` (staged skills), `infoStat`, `confOpen`, `pubTag`, `storeCat`, `goldBuy`, `selId`, `mapMode` (2d/3d/overview), map pan/zoom, `acctOpen/contactOpen`. In the repo this is DOM/class state via `showTab()` — follow that pattern; no store.

Persistent additions to `G` (`js/state.js`) — all additive, read defensively, no schema bump needed: `skillPts:0`, `maxMoves:10`, `maxStamina:10`, `equipped:{}`, `turf:{}`, `soundOn:true`, `handle:null`, `gold:0`, `supplies:{}`.

Fiction → field mapping stays in the render layer only: Clout=`xp`, Moves=`energy`, Bread/Bag=`money`. **Never rename `G` fields** — it breaks saves.

Data files (JSON-first, tenet T4): `data/gear.json` (new), `data/skills.json` (new), `data/plugs.json` (migrate from `PLUGS_DATA`), `data/quests.json` (new), `data/city.json` (from prototype `city-data.js`), plus existing `store.json`, `enemies.json`, `ranks.json`. Slot ids (`head, torso, handR, handL, legs, ride, stash`) and item ids are save keys — permanent, lowercase, never reused.

Every action follows the §5.2 sequence: validate → mutate `G` → toast/log → `updateHUD()` → re-render tab → `GameState.save()`. No `alert/confirm/prompt` — all confirms are overlays. Level-up grants 5 skill points via `addXP()` only.

---

## Outstanding conflicts — resolve BEFORE shipping the affected screen

Carried over from the previous handoff review; still undecided:

1. **`buyItem()` makes equipping impossible** *(blocks Store + Profile GEAR)*. `js/store.js` banks `item.atk/def` permanently into `G` at purchase. This design makes equipping a separate, reversible act with Attack/Defense **derived from `G.equipped`**. Existing saves have bonuses banked → requires a migration, `SCHEMA_VERSION` bump, and a golden-file test.
2. **Secondary gear slots.** `docs/profileScreen.md` §5 requires secondary slots (+1/+2/+3 badges, capacity from Crew size). This design has five body slots + RIDE + STASH, single-depth. One must give.
3. **Leaderboard has no data source.** Saves are per-user blobs; `server/` is purchase-verification only. Options: a platform surface, a server extension, or ship v1 stubbed against static data. Ship SKILLS + GEAR first.

Also unchanged: `gear.json` vs `store.json` single source of truth; crew is SDK-stubbed (build UI against static data); public profile must not leak Attack/Defense/Health/cash/pools (project through one function); 3D map stays lazy-loaded with a 2D fallback; no emoji as icons.

---

## Suggested build order

1. **Shell + drawer + tokens** (this file) — everything else renders inside it.
2. **Settings** (`08`) — smallest; exercises cards, toggle, expanders.
3. **Opps List** (`03`) + engage modal.
4. **Plugs** (`04`) + plug dialogue.
5. **Crew** (`05`) + crew dialogue.
6. **Make Moves** (`02`) + log modal + metrics panel.
7. **Store** (`06`) + gold purchase confirm — carries conflict 1.
8. **Profile** (`07`) — largest: 3 tabs + stats overlay + equip picker + skill confirm + public profile + ranks popup.
9. **The Hood** (`01`) — map modes, selection card, claim flow.
10. Messages + XP toast whenever convenient (they're shell-level).

Per PR: TDD per `06-technical-requirements.md` §1.1, unit tests on logic, verification in a plain browser and in Jest.

---

## Assets

- **Portraits** — repo `assets/portraits/` (`.webp/.png`). The prototype embeds them as data URIs; plugs and crew share faces. Enemy portraits keyed in `js/combat.js`.
- **Overview map** — `assets/el-caldero-overview.jpg`, 1200×2150 illustrated city (bundled in the standalone). Zoom cap 1.8× — it goes soft beyond that.
- **MP9 offer art** — `assets/mp9-kit.png`, 3:2.
- **Icons** — inline stroked SVG, `stroke-width:2`, round caps/joins, 13–18px. Map pin is a filled gold SVG. No icon fonts, no emoji.
- **Paper-doll figure** — inline SVG placeholder (spec in `screens/07-profile.md`); replace with real art per `docs/specs/05-asset-spec.md`.
