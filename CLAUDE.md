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

css/              # self explanatory, for css formatting

data/             # JSON files for game data, can be downloaded remotely as new changes to the game are made


js/               # all game code

server/           # all server code
```

---

# UI Implementation Contract — Chrome Money design system

**This section is the single source of truth for every UI or visual change.** It supersedes and
replaces `OPPS_UI_Agent_Style_Guide.md` (v1.0, amber/highlighter), which has been deleted. Any
value from that guide — `#f5902a` amber, `#e4ef3a` highlighter, Saira Condensed / Oswald /
JetBrains Mono, segmented block meters, ≤8px radii, translucent-white borders — is retired. Do not
reintroduce it, and do not treat older `docs/` references to a "style guide" as authority over
this section.

Where a value is given, use it verbatim. Do not invent new colors, fonts, radii, or shadows.

Visual reference, in the repo: **`docs/design-handoff/chrome-money/`** — `style-guide.html`
(self-contained, open it in a browser) and `concept-board.png`. Read that directory's `README.md`
first: it lists the handful of places those artefacts predate the port, where the token table
below wins. Target: port `css/styles.css` and the renderers in `js/` to this system **without
changing game logic**.

## Core idea

Cold near-black panels. One warm metal gradient ("chrome") reserved for money and the single
primary action. Heavy condensed display type (Anton) against a quiet grotesque (Space Grotesk).
The orange `#ff3a00` accent is retired; chrome takes over every non-combat accent role.

## Tokens

Replace `:root` in `css/styles.css` with:

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

Also delete every v1.0 token still present in `css/styles.css`: `--amber`, `--amber-deep`,
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

- Radius: frame 26, HUD/overlays 20–24, cards 14–16, pills and meters 999. Nothing square, no 2–4px.
- Spacing: 20px side padding on every screen except Map; 9px between list cards (7px dense),
  14px between sections. Use `gap`, never per-child margins.
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

**Threat** — block meter out of 8 (`█`/`░`), `--red` on `--ghost`. A rating, never animated.

**Portraits** — circular, `object-position: top center`. Allies (plugs, you): 62px with a 2px chrome
ring. Opps: 58px with a 1px `--border-ctrl` edge. No filters.

**Chips (Empire sub-nav)** — 10px, padding 7px/9px, radius 999. Active = `--chrome-fill` +
`--chrome-ink`; inactive = 1px `--border` + `--muted`. Five fit a 390pt screen; do not add a sixth.

**Feed** — two lines, no panel or border. Newest at `--muted` with a 4px dot in the outcome colour;
older lines drop to `--ghost`. The dot carries the colour, the text never does.

**Overlays** — backdrop `rgba(6,6,8,.72)` with the screen behind at `blur(3px)` / opacity .3.
Combat centres; the plug dialog rises from the bottom edge. Border `--border-gold`, `--modal-shadow`.

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

Data mapping (DOM-18): catalog `rarity` ids are the colour words — `grey` → COMMON, `green` →
UNCOMMON, `blue` → RARE, `purple` → EPIC, `orange` → LEGENDARY. Mythic is **reserved**: the
tokens ship, but no v1 item and no drop odds carry it. These are the only sanctioned uses of
blue/purple/orange/pink ink outside the XP meter.

## Structural changes to the build

1. **Navigation.** Nine sidebar items → five bottom tabs: Hood, Map, Moves, Opps, Empire.
   Plugs / Gear / Spots / Stats / Crew move inside Empire behind the chip row. Remove `nav` drawer,
   `#nav-overlay`, `#nav-toggle` and the `.nav-item` left-border accent.
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

## Selector-level changes

| Selector | Change |
|---|---|
| `.logo` | Anton 27 / +4, chrome-clipped. Drop the glow `text-shadow` and the gold `span`. |
| `.hud-stat` | Replaced by the HUD panel. Rank + gems become header pills; money, rep, XP, energy, health go in the panel. |
| `.card` / `.card-title` | radius 4 → 16, flat → `--panel-fill`. Title loses its bottom rule and accent colour. |
| `.job-card` | Grid → single-column rows, radius 14, padding 11/13. Remove the `::before` stripe. |
| `.do-job-btn` | Full-width orange → right-aligned chrome pill. |
| `.attack-btn` | Solid red → `--control` + `--border-red` + `--red` label. |
| `.enemy-avatar`, `.enemy-portrait` | 48px square → 58px circle, no `saturate(.7)`. |
| `.plug-card` | 110px side image → 62px chrome-ringed circle. `.plug-line` loses its italic. |
| `.bar-track`, `.bar-fill` | 6px/radius 2 → 7px/radius 999, track `--track`. |
| `.store-item`, `.prop-card` | Two-column grid, no icon, full-width action pill. |
| `.gem-card` | `#b388ff` retired; amounts render chrome-clipped. Badge overhangs the top edge 9px. |
| `.combat-box` | radius 24, 1px `--border-gold`, `--modal-shadow`. Title chrome-clipped Anton 22. |
| `.combat-log` | Monospace log → 74px sparkline well on `--well`: chrome line = you, `--red` = opp. |
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
