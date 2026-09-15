# 08 · SETTINGS

**Nav:** SETTINGS · **Purpose:** preferences + account. Smallest screen — a good first build.
**Repo source:** new (`soundOn` → `G`).

Column, **22px gaps**. Groups introduced by a label-style heading (`PREFERENCES`, `ACCOUNT`), 11px below-gap.

## PREFERENCES → Sound effects

One card (border `#26262e`, radius 16px, card gradient, `padding:16px`), row gap 14px:
- **Icon well** — 38×38, radius 12px, bg `#1b1b22`, border `#33333d`, 18px **gold** speaker SVG (stroke 2, round caps).
- Title `SOUND EFFECTS` (Anton 15px ls 1px) over sub `UI clicks & in-game cues · ON` (SG 11px `#8e8e9a`; the live state word SG 700 **gold**).
- **Toggle** — 48×26 pill track, border `#33333d`, `padding:2px`; 20px knob. ON: track gold-chrome, knob `#161208`, `translateX(22px)`. OFF: track `#1f1f27`, knob `#8e8e9a`, x 0. Both `background`/`transform` transition `.2s`. Gates the WebAudio click.

## ACCOUNT → two expanding cards (11px gap)

Same card recipe. **Header row** (`padding:16px`, hover bg `rgba(255,255,255,0.02)`): icon well (person / envelope SVG, stroke `#d8d6d0`) + title (Anton 15px) + right `›` chevron (15px `#7a7a86`) that rotates 90° `.2s` when open. Opening one closes the other.

**ACCOUNT INFO** expanded (`padding:4px 16px 16px` under a 1px `#1f1f27` rule) — label/value rows (`padding:11px 0`, divider `#1d1c22`; label SG 12px `#8e8e9a`, right-aligned value):
- Handle → `LIL WASH` (Anton 14px)
- Player ID → `OPP-4471-9X` (SG 500 12px `#d8d6d0`)
- Member since → `MAR 2025` (SG 500 12px)
- Crew → `EASTSIDE KINGS` (Anton 14px)

Values in Anton for identity, Space Grotesk for IDs/dates.

**CONTACT DEVELOPER** expanded — prose line *"Found a bug or got an idea for the streets? Hit the team direct."* (SG 12px lh 1.6 `#8e8e9a`), then Email `dev@oppsgame.io` and Discord `discord.gg/opps` rows (same recipe), then a full-width **REPORT A BUG** primary gold pill (`padding:13px`, no sheen — it grants nothing).

## State

`soundOn` persists on `G`. `acctOpen`/`contactOpen` are session-only, mutually exclusive.
