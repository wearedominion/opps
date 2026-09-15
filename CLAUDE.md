# OPPS — Claude Code Context

## What This Is

> A text-based street empire builder built for the [Jest platform](https://jest.com) — playable instantly via RCS/iMessage, no app store required. The game shares similarities with Mafia Wars. It is designed to be simple, easy to play, yet have rich grapics capabilities. The game is not synchronous multi-player, it is asynchronous. Will have in app monetization, social features.

## Tech Stack & Tech Requirements

- Vanilla JS, HTML5
- Target platforms: iOS and Android
- JEST SDK integration
- The game must run on as wide a variety of devices as possible. 
- The game must be lightweight, no long loading times or massive memory consumption
- Data driven architecture required. This means new content, missions, progression in the game is driven by content
- JSON is the preferred format for all game data, including in game object prototypes, monetization configuration, store packs, etc. Deviation from JSON is highly discouraged, unless feature requirements cannot be satisfied with JSON. In that case, this rule must be enforced, and if there is an exception, it should be called out specifically.
- game data files (i.e. JSON) may be downloaded from client/users on demand. For example, if we, the developer, make changes to a game data object prototype, that data is deployed to the cloud and is consumable by all clients/users
- The game may use a widely supported and compatible 3D rendering system, such as OpenGL, as long as it is widely supported
- The game supports a CI/CD pipeline that allows for incremental new builds of the application as well as the building of new game data (JSON). The pipeline should condition the data/code, run unit tests, regression tests, and if required, e2e tests. Once the build process is complete, game data or new versions of the game can be deployed to a test or production environment. Preferrably use GitHub for the pipeline.

## Project Structure

```
assets/           # in-game assets, UI buttons, screens, menus, models, textures, etc
  images
  portraits

css/              # one stylesheet per area, linked in order from index.html
  00-base.css     #   tokens, reset, app frame — every other file reads these
  10-chrome.css   #   header, scroll body, tabs, cards, buttons, meters
  20-legacy.css   #   v0.1 screens not yet rebuilt; shrinks as each one lands
  30..70-*.css    #   one file per rebuilt screen, in cascade order

data/             # JSON files for game data, can be downloaded remotely as new changes to the game are made


js/               # all game code

server/           # all server code

tests/            # node tests/run.js — one file per area, discovered not listed
  harness.js      #   shared rig: the counter, fixtures, sandbox loaders
  run.js          #   the runner; owns the total and the no-drop guard
  *.test.js       #   one per area — add a file, never append to someone else's
```

### Adding a screen, a stylesheet or a test (DOM-127)

Three files used to have exactly one place where every ticket inserted its
changes, so any two PRs open at once conflicted there whether or not their work
overlapped. Each now has a registration point instead of an append point — keep
it that way:

| Adding | Do this | Never |
| --- | --- | --- |
| tests | add `tests/<area>.test.js`; the runner discovers it | append to another area's file |
| styles | add `css/<nn>-<screen>.css` + one `<link>` in `index.html` | append to `20-legacy.css` |
| a screen renderer | call `registerScreen('<tab>', render<Screen>)` at the foot of that screen's own `js/` file | add a branch to `showTab()` |

`showTab()` dispatches through `SCREEN_RENDERERS` and calls whatever the screen
registered for itself; a tab that is static markup registers nothing. Screen
scripts all load below `js/ui.js` in `index.html`, which is what makes
registration-at-load safe — keep new ones there.

The one remaining shared line is the `<link>` in `index.html`. Stylesheets are
numbered with gaps so two screens in flight pick different slots; there is no way
to drop that line entirely without a build step.

---

# UI Implementation Contract — Chrome Money design system

**This section is the single source of truth for every UI or visual change.** It supersedes and
replaces `OPPS_UI_Agent_Style_Guide.md` (v1.0, amber/highlighter), which has been deleted. Any
value from that guide — `#f5902a` amber, `#e4ef3a` highlighter, Saira Condensed / Oswald /
JetBrains Mono, segmented block meters, ≤8px radii, translucent-white borders — is retired. Do not
reintroduce it, and do not treat older `docs/` references to a "style guide" as authority over
this section.

Where a value is given, use it verbatim. Do not invent new colors, fonts, radii, or shadows.

Visual reference, in the repo: **`docs/design/chrome-money-v0.2/`** — the Chrome Money **v0.2**
design handoff (DOM-107/DOM-109). Read its `INDEX.md` and `README.md` first; the runnable
prototype `OPPS App (standalone).html` is ground truth, and when a doc and the prototype
disagree, the prototype wins. It supersedes the v0.1 handoff (`docs/design-handoff/chrome-money/`,
kept for history) for layout, spacing, structure, states, motion, copy, and palette/type.
Two deliberate exceptions were ruled on DOM-110 (2026-09-14): the **rarity scale** (below) and
the temporary **LEGACY drawer section** (navigation, below). Target: port the stylesheets in `css/` and
the renderers in `js/` to this system **without changing game logic**.

Token naming: `css/00-base.css` defines the **v0.2 canonical token names** from the handoff
README (`--gold`, `--surface-raised`, `--border-strong`, `--text-mid`, `--gold-chrome`, …) plus
legacy v0.1 aliases (`--chrome`, `--control`, `--border-ctrl`, `--muted`, `--chrome-fill`, …)
that older screen rules still read. New code uses canonical names only; each screen rebuild
(DOM-111..119) migrates its rules, and the aliases are deleted with the last one. The `:root`
token table below documents the v0.1 names for those older rules — same hex values throughout.

## Core idea

Cold near-black panels. One warm metal gradient ("chrome") reserved for money and the single
primary action. Heavy condensed display type (Anton) against a quiet grotesque (Space Grotesk).
The orange `#ff3a00` accent is retired; chrome takes over every non-combat accent role.

## Tokens

Replace `:root` in `css/00-base.css` with:

```css
:root {
  /* surfaces */
  --app:        #08080a;   /* outside the app frame */
  --bg:         #0b0b0c;   /* screen surface, carries the weave */
  --well:       #0d0d11;   /* insets: combat log, code, sparkline */
  --panel-top:  #181820;   /* card gradient start */
  --panel:      #111116;   /* card gradient end */
  --control:    #1b1b22;   /* secondary buttons, active tab */
  --track:      #1f1f27;   /* meter tracks */

  /* borders — always 1px */
  --border:      #26262e;  /* cards */
  --border-ctrl: #33333d;  /* controls, portraits */
  --border-gold: #3d3627;  /* chrome-active, overlays */
  --border-red:  #5a2b24;  /* hostile actions */

  /* ink */
  --text:     #f2f0ec;  /* titles, primary values */
  --body:     #d8d6d0;  /* dialogue, running copy */
  --muted:    #8e8e9a;  /* descriptions, inactive tabs */
  --faint:    #7a7a86;  /* meta rows, bar labels */
  --ghost:    #55555f;  /* status strip, captions */
  --disabled: #4f4f59;  /* locked / mastered text */

  /* signal */
  --chrome:     #e8c98a;  /* money, active chip ink source */
  --chrome-ink: #161208;  /* text ON chrome — never white */
  --red:        #e0523f;  /* threat, enemy HP, combat only */
  --green:      #4fd39a;  /* health, income, drop pins */
  --xp:         #6f8cff;  /* XP meter only */

  --chrome-fill:  linear-gradient(135deg,#f3e0b4,#e8c98a 40%,#c9a55c);
  --panel-fill:   linear-gradient(180deg,#181820,#111116);
  --energy-fill:  linear-gradient(90deg,#e8c98a,#a8873f);
  --modal-shadow: 0 30px 80px rgba(0,0,0,.6);

  --r-card: 16px;  --r-panel: 20px;  --r-pill: 999px;
  --pad-screen: 20px;  --gap-list: 9px;  --gap-section: 14px;

  --display: 'Anton', sans-serif;
  --ui:      'Space Grotesk', sans-serif;
}
```

Old → new mapping: `--accent` and `--gold` both become `--chrome`; `--green` `#00e676` → `#4fd39a`;
`--red` `#ff1744` → `#e0523f`; `--text` → `#f2f0ec`; `--muted` `#666` → `#8e8e9a`.
Delete `--hp-color` (use `--green`).

Also delete every v1.0 token still present in `css/00-base.css`: `--amber`, `--amber-deep`,
`--highlighter`, `--lime`, `--olive`, `--red-bright`, `--red-nav`, `--ink-on-accent`, `--seg-empty`,
`--ink`, `--base`, `--surface`, `--raised`, `--screen-bg`, `--header-bg`, `--text-bright`,
`--muted-2`, `--faint-2`, `--disabled-dim`, `--card-bg`, `--card-accent-bg`.

## Type

Load Anton + Space Grotesk (400/500/700). Drop Bebas Neue, Barlow Condensed, Space Mono, Saira
Condensed, Oswald and JetBrains Mono — Space Grotesk at 500 covers the numeric role.

| Role | Spec |
|---|---|
| Wordmark | Anton 27 / +4px, chrome-clipped |
| Hero figure | Anton 36 / +0.5px, chrome-clipped — the HUD clout figure |
| Screen title | Anton 19 / +2px, `--text` |
| Card title | Anton 14–16 / +1px, `--text` |
| Action label | Anton 12–13 / +1px |
| Body | Space Grotesk 15 / line-height 1.5, `--body` |
| Meta | Space Grotesk 11, `--faint` |
| Label | Space Grotesk 10 / +2px, uppercase, `--faint` |

Anton is display only: never body copy, never below 12px, never a full sentence.

Chrome-clipped text:

```css
background: linear-gradient(135deg,#f3e0b4,#e8c98a 45%,#a8873f);
-webkit-background-clip: text; background-clip: text; color: transparent;
```

Only these use it: the OPPS wordmark, the HUD clout figure, crew stat counters, gem pack amounts.

## Geometry

- Radius (v0.2 exact): 999 for ALL buttons, chips, badges, bars, toggles, avatars; 22 centered
  overlay panels; 24 24 0 0 bottom sheets; 16 cards; 14 small tiles, portrait frames, drawer
  items; 12 for 38px icon buttons and 36px map controls. Nothing square, no 2–4px.
- Spacing: 20px side padding in the header, 18px in the scroll body (The Hood excepted: 0);
  9px between list cards (7px dense), 14px between sections. Use `gap`, never per-child margins.
- Borders: 1px everywhere. `--border` cards, `--border-ctrl` controls, `--border-gold` chrome-active,
  `--border-red` hostile.
- Elevation: exactly one shadow, `--modal-shadow`, on modals. Cards lift with `--panel-fill`.
- Texture: `repeating-linear-gradient(45deg, rgba(255,255,255,.012), rgba(255,255,255,.012) 1px,
  transparent 1px, transparent 2px)` on the screen surface only. Replaces the body scanline.

## Components

**Buttons** — all full pills, Anton 12–13 / +1px, 34–38px tall, 44px effective hit target via padding.

| Variant | Style |
|---|---|
| Primary | `--chrome-fill`, color `--chrome-ink` |
| Secondary | `--control`, 1px `--border-ctrl`, color `--text` |
| Hostile | `--control`, 1px `--border-red`, color `--red` — combat entry only |
| Disabled / locked | `#141419`, 1px `#22222a`, color `--disabled` |

One primary per card and per screen region.

**Cards** — `--panel-fill`, 1px `--border`, radius 14–16, padding 11–14. Title Anton, meta 10–11px
`--faint`, action pinned right and vertically centred.

One primary per card **and per screen region**. A grid of peer items — store rows, gem spends,
property rows — is one region, so those actions are all **secondary** (`--control`, 1px
`--border-ctrl`, `--text`). Six chrome pills on one screen is not six primaries, it is none.
Where a card holds several actions of unequal weight, the money action takes the chrome pill and
the rest go secondary — e.g. hood activities: COLLECT primary, REST and LAUNDER secondary.

**Meters** — 7px tall (4px for mastery), radius 999, track `--track`, `width` transition 0.4s.
Fixed fills: XP `--xp`, energy `--energy-fill`, health `--green`, enemy HP `--red`,
mastery `--energy-fill`.

**Threat** — an 8-segment gauge (v0.2, DOM-112; supersedes the v0.1 `█`/`░` block meter).
Eight `flex:1` segments, 7px tall, 3px gaps, pill. Severity encodes by **position**, not just
count: segments 1–2 `--text-mid`, 3–5 `--gold`, 6–8 `--danger`; unfilled `--track`. It is the
only severity signal on an opp card — there is no risk chip. `transition: background .4s` so a
changed rating animates its colour; the gauge itself still never loops or pulses.

**Portraits** — circular, `object-position: top center`. Allies (you): 62px with a 2px chrome
ring. Opps: 58px with a 1px `--border-ctrl` edge. No filters.
**Plugs are the exception** (v0.2, DOM-113): not a circle at all — a 146px full-height rectangular
column filling the left of the card, and a 288px header inside the dialogue popup. Both carry a
bottom scrim (`--portrait-scrim-soft` 30px on the card, `--portrait-scrim` 80px in the popup).

**Chips (Empire sub-nav)** — 10px, padding 7px/9px, radius 999. Active = `--chrome-fill` +
`--chrome-ink`; inactive = 1px `--border` + `--muted`. Five fit a 390pt screen; do not add a sixth.

**Feed** — two lines, no panel or border. Newest at `--muted` with a 4px dot in the outcome colour;
older lines drop to `--ghost`. The dot carries the colour, the text never does.

**Overlays** — backdrop `rgba(6,6,8,.72)` with the screen behind at `blur(3px)` / opacity .3.
Combat centres; the plug dialogue **also centres** (v0.2, DOM-113 — it used to rise from the bottom
edge), max-width 330px, radius `--r-panel`, scaling `0.94 → 1` over .22s like the engage modal.
Border `--border-gold`, `--modal-shadow`.

## Rarity

Six item tiers. Rarity colours the item NAME and a 1px border tint — never a card fill, never a
glow, never chrome-clipped text.

```css
  --rarity-common:    #a6a6b2;  --rarity-common-edge:    #33333d;
  --rarity-uncommon:  #8fbf78;  --rarity-uncommon-edge:  #33412f;
  --rarity-rare:      #56b3c9;  --rarity-rare-edge:      #24404a;
  --rarity-epic:      #a08ae6;  --rarity-epic-edge:      #3a3354;
  --rarity-legendary: #d99a4e;  --rarity-legendary-edge: #4a3823;
  --rarity-mythic:    #cf6f9e;  --rarity-mythic-edge:    #48293a;
```

**Reserved hues stay reserved** (restored 2026-09-14, DOM-101): rarity never uses `--chrome`
(money), `--red` (combat), `--green` (income) or `--xp`. Legendary is a burnt amber deliberately
browner than chrome; Mythic is the only rose in the app. Future tiers must keep clear of all
four reserved hues.

**v0.2 exception (ruled on DOM-110, 2026-09-14):** the v0.2 prototype's 4-tier scale
(COMMON/RARE/ELITE/LEGEND with a gold LEGEND) is **not adopted** — this 6-tier reserved-hue
scale stays. Only the prototype's tier-label *typography* carries over (Space Grotesk 500 10px,
letter-spacing 1.5px — the `.tier-label` utility). On side-by-side pixel checks against the
prototype, tier-label color differences are expected and pass.

Data mapping (DOM-18): catalog `rarity` ids are the colour words — `grey` → COMMON, `green` →
UNCOMMON, `blue` → RARE, `purple` → EPIC, `orange` → LEGENDARY. Mythic is **reserved**: the
tokens ship, but no v1 item and no drop odds carry it. These are the only sanctioned uses of
blue/purple/orange/pink ink outside the XP meter.

## Structural changes to the build

1. **Navigation** (rewritten for v0.2, DOM-110, ratified 2026-09-14 — supersedes the v0.1
   five-bottom-tab decision). A hamburger in the header opens a 262px left **nav drawer**
   (spec: `docs/design/chrome-money-v0.2/OVERLAYS.md`) with exactly eight items, in order:
   THE HOOD · MAKE MOVES · OPPS LIST · PLUGS · CREW · STORE · PROFILE · SETTINGS. There is no
   bottom tab bar and no Empire chip row, and no Inventory item (it is Profile's GEAR tab).
   *Transition only:* a quiet LEGACY drawer section carries ACTIVITIES / SPOTS / STATS until
   DOM-115/DOM-117/DOM-118 absorb those screens; each of those tickets deletes its item, and the
   final drawer is exactly eight.

   A screen is wired up by calling `registerScreen('<tab>', render<Screen>)` at the foot of its
   own file in `js/` — see *Adding a screen* above. Do not add a branch to `showTab()`.
2. **No emoji.** Remove every emoji icon — `.nav-icon`, `.item-icon`, `.prop-icon`, `.fighter-icon`,
   `.enemy-avatar` glyphs, gem spend icons. Meaning comes from colour, type and the real portrait art.
3. **Locked states.** Never dim a card to 40% opacity. Render at full contrast and swap the action for
   a disabled chip naming the gate (`RANK 5`). Applies to `.job-card.locked`, `.enemy-locked`,
   `.gem-spend-locked`.
4. **Money is sacred.** Chrome text is money only. List prices stay `--chrome` at 11–13px.
   **Clout, not money, holds the hero slot** — the HUD clout figure is the one thing rendered at
   display size (Anton 36, chrome-clipped). Bread renders as a panel row in `--chrome` at body
   size. Decided 2026-09-11; supersedes the earlier reading that the bread figure took the hero.
5. **Map palette.** `.map-outer` base `#494741` → `#17171c`; blocks `#0b0b0c`, buildings `#1f1f28`,
   lane markings `#a8873f`, water `#0e2430`, parks `#141a17`. Pins: chrome = your turf,
   `--red` = opps, `--green` = drops. Controls become 36px radius-12 buttons on `rgba(17,17,22,.9)`.

   **Sanctioned 3D variants** (recorded 2026-09-14, DOM-97): `js/map3d.js` uses Lambert materials
   that multiply with the night lighting, so its material hexes sit brighter than the flat 2D
   values on purpose: blocks `0x16161a`, parks `0x1d2419`, water `0x073245`/`0x0e3a50`, lane gold
   `0xd1b55d`. These are the 3D equivalents of the palette above, not drift — do not "fix" them to
   the 2D hexes without re-tuning the lights. The ground is `0x17171c` exactly, matching 2D.

## Selector-level changes

| Selector | Change |
|---|---|
| `.logo` | Anton 27 / +4, chrome-clipped. Drop the glow `text-shadow` and the gold `span`. |
| `.hud-stat` | Replaced by the HUD panel. Rank + gems become header pills; money, rep, XP, energy, health go in the panel. |
| `.card` / `.card-title` | radius 4 → 16, flat → `--panel-fill`. Title loses its bottom rule and accent colour. |
| `.job-card` | **Replaced in v0.2 (DOM-115)** by `.mv-hus`: border `--border`, radius 16, padding 15. Title Anton 15 uppercased, sub naming Moves cost + Clout, a derived status chip (NEW / ACTIVE / DONE / TIMED / LOCKED) and a gold `DO IT` pill. Mastery is the progress row. |
| `.do-job-btn` | Retired with `.job-card`; the hustle CTA is `.mv-go`. |
| `.mv-cta`, `.mv-go` | The only two pills carrying `.sheen` — a single slow highlight every 4.5s. Sheen is money-only: never put it on a secondary or a non-gold control. |
| `.clout-log` | Bottom sheet, max-height 82%, radius `--r-sheet` top only, `--border-gold` with no bottom edge, translateY .26s. Rows come off the **transaction ledger**, not a second store. |
| `.attack-btn` | Solid red → `--control` + `--border-red` + `--red` label. |
| `.enemy-avatar`, `.enemy-portrait` | 48px square → 58px circle, no `saturate(.7)`. |
| `.plug-card` | **Rebuilt again in v0.2 (DOM-113):** horizontal card, 12px column gap, radius 16, 1px `--border-gold` — plugs are the one list gold-bordered at rest. 146px portrait column; 206px-tall info column padded 17/15/13. Name Anton 22, gold moniker, `.plug-line` 13px/1.6 `--text-mid`. LETS GO is a gold pill (11px/22px, no sheen) floated to the bottom by `margin-top:auto`, and is the only click target on the card. |
| `.plug-modal` | Bottom sheet → centered 330px panel. 288px portrait header with the name in a floating pill (Anton 21px, JS-shrunk toward 14px for long names). Body 17/18/18: gold moniker → 84px-min dialogue → footer of `1 / 4` + LATER + a 104px-min CTA. The corner ✕ is retired — LATER and the scrim are the dismiss. |
| `.bar-track`, `.bar-fill` | 6px/radius 2 → 7px/radius 999, track `--track`. |
| `.store-item`, `.prop-card` | Two-column grid, no icon, full-width action pill. |
| `.gem-card` | `#b388ff` retired; amounts render chrome-clipped. Badge overhangs the top edge 9px. |
| `.combat-box` | **Replaced by the engage modal** (v0.2, DOM-112): `.eng-box`, radius 22, 1px `--border-danger`, `--modal-shadow`. Target row + 96px sim window + DIP / HIT 'EM footer. |
| `.combat-log` | Monospace log → the fight trace inside the engage modal's 96px sim window: chrome line = you, `--red` = opp, one point per round (DOM-103, restyled by DOM-112). |
| `.levelup-banner`, `.toast` | Keep geometry; switch to `--panel-fill` + `--border-gold` + chrome text. |
| `::-webkit-scrollbar` | Track `--bg`, thumb `#2a2a34`, width 4px. |

## Rules

Always:
- Chrome for money and the one primary action.
- 999px radius on anything pressable; 44px effective hit target.
- List actions anchored right, vertically centred.
- Locked items state the gate, not the refusal.
- `gap` for sibling spacing.
- 20px side padding on every screen but Map.

Never:
- `#ff3a00` anywhere — fully retired.
- Emoji, including in the feed and toasts.
- Opacity below 1 on content — restyle instead of dimming.
- Anton under 12px, or Anton sentences.
- A second shadow value beyond `--modal-shadow`.
- Red outside combat, threat and enemy HP.
- Square corners or 2–4px radii.
