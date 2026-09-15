# Assets

Inventory and provenance for everything under `assets/`. Written for DOM-125
(FW6), which was the first ticket to ask "does every portrait key actually
resolve to a file?" — the answer was no, and the gaps are recorded below.

`tests/core.test.js` enforces the two rules that can rot silently:

- every portrait key in `data/portraits.json` resolves to a file on disk;
- every plug and enemy id either has a portrait entry or is on the known-gap
  list here, so a new roster entry can't quietly ship faceless.

## Portraits — `assets/portraits/`

Keyed by entity id in `data/portraits.json`. Plugs and crew share faces: the
crew roster reuses the `plug-*` keys, so there is no separate `crew-*` set.

| set | keys | file | size | status |
|---|---|---|---|---|
| Plugs | `plug-tommy` | `plug-tommy.webp` | 480×389 | ✓ |
| Plugs | `plug-theresa`, `plug-kylie`, `plug-marco`, `plug-dex` | `plug-*.webp` | 290×235 | ✓ |
| Enemies | `snitch`, `stick`, `jackers`, `oppcrew`, `fed`, `rival` | `enemy-*.png` | 64×64 | ✓ |
| Enemies | 11 more, listed below | — | — | **missing** |

### Known gap: 11 of 17 enemies have no portrait

`corner`, `trapboss`, `cartel`, `detective`, `syndicate`, `kingpin`, `fixer`,
`gunchief`, `enforcer`, `shadowboss`, `thedon`.

These render the renderer's own placeholder (a `--surface` fill behind the
scrim), which is why nothing looks broken today. The Opps List (DOM-112) shows
all 17, so two thirds of that screen is faceless. Art is uncommissioned.

### Resolution notes

- Enemy portraits are **64×64**. They are drawn at 58px in the Opps List and
  54px in the engage modal, so they are adequate there and would go soft
  anywhere larger.
- Plug portraits are 290×235 but the dialogue popup's header is 288px tall on
  a ~328px-wide panel, so `object-fit:cover` **upscales them about 23%**. They
  hold up at phone density; worth re-exporting larger if the popup ever grows.

## Not in the handoff

Two assets DOM-125 expected to extract are **not present in the prototype**,
as either files or data URIs:

| asset | expected by | what the prototype actually has |
|---|---|---|
| `el-caldero-overview.jpg` (1200×2150) | S9 · The Hood overview mode | `<img>` pointing at opaque resource id `c80b3bdb-1e5d-4398-bfbb-6c0c8cf3994a` — binary not exported |
| `mp9-kit.png` (3:2) | S7 · Store featured offer | `<img>` in the `aspect-ratio:3/2` card pointing at `014b0eba-df01-4a7f-b893-70cfd556706e` — binary not exported |

`OPPS App (standalone).html` bundles exactly 11 images as data URIs — the 5
plug portraits and the 6 enemy portraits — and every one is **byte-identical**
to the file already in `assets/portraits/`. There was nothing to extract. Both
rasters above need re-exporting from the design tool before S7 and S9 can
consume them.

## Paper-doll figure

**Not shipped yet.** `screens/07-profile.md` §Paper doll specifies an 84×196
inline-SVG placeholder (head circle r14; torso 34×60 rx12 in `--track` on
`--border-strong`; arms 11×54, legs 13×72, feet 17×9 in `#181820` on
`--border`). DOM-117 (S8 Profile) ships that placeholder. **Real art is
uncommissioned** — see `docs/specs/05-asset-spec.md`.

The 7 paper-doll slot keys are permanent save keys: `head, torso, handR,
handL, legs, ride, stash` (ratified DOM-121).

## Icons

Inline stroked SVG only — stroke 2, round caps, 13–18px; the map pin is the one
filled gold glyph. **No icon fonts, no emoji, no data-URI art**, all three
verified by audit on 2026-09-15 and clean.

The only non-alphabetic characters used as UI glyphs are typographic, not
emoji: `✕` (close), `✓` (done), `▾` (caret), `›` (chevron). Note `✕` is spelled
both `&#10005;` and `&#x2715;` in `index.html` — same character, harmless,
worth normalising next time that file is open.
