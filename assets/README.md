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

## Extracted from the prototype

`OPPS App (standalone).html` uses **two** embedding schemes, and this matters
because searching for only the first one misses half the art:

1. inline `data:image/…;base64` URIs — the 11 portraits;
2. a **JSON resource map** keyed by the opaque ids that `<img src>` attributes
   point at — `{"<uuid>":{"mime":…,"compressed":…,"data":"<base64>"}}`. 18
   entries: 6 woff2 fonts, 9 scripts/HTML, and **3 images**.

The second scheme is where the two headline assets live. An earlier pass of this
audit grepped only for `data:image/` and concluded they were missing; that was
wrong, and the reviewer of DOM-125 caught it.

| file | source id | dimensions | bytes |
|---|---|---|---|
| `el-caldero-overview.jpg` | `c80b3bdb-1e5d-4398-bfbb-6c0c8cf3994a` | 1200×2150 | 457,244 |
| `mp9-kit.png` | `014b0eba-df01-4a7f-b893-70cfd556706e` | 1536×1024 (3:2) | 1,771,847 |

Both are the real thing, opened and checked: the JPEG is the full illustrated
El Caldero city map with districts labelled (Westshore, Colinas Hills, Corona
Heights, Downtown, East Caldero, Vale Verde, Salton Corridor, Dunbar Flats,
Holloway Park, San Marcos, Harborside), the Serrano Mountains, the river, a
compass rose, scale bar and title cartouche. The PNG is the MP9 render carrying
exactly the five attachments the Store's includes list names — optic, grip,
suppressor, extended mag, stock.

To re-extract, or to pull anything else out of that map:

```python
import re, base64
s = open("docs/design/chrome-money-v0.2/OPPS App (standalone).html",
         encoding="utf-8", errors="replace").read()
m = re.search('"' + uid + r'":\{"mime":"[^"]+","compressed":(?:true|false),"data":"([A-Za-z0-9+/=]+)"', s)
open(name, "wb").write(base64.b64decode(m.group(1)))
```

Note `compressed` is `true` for the scripts (deflate) and `false` for every
image and font, so the images decode straight from base64.

### The third image is deliberately NOT in the repo

The resource map holds one more image — `628457ae-2fce-4760-bc22-98217fcdb538`,
a 124×156 webp — sitting in the prototype's `profile-avatar` slot
(`placeholder="Player portrait"`).

It is **not game art.** It is a personal photograph of a child, evidently
whatever image happened to be loaded into the designer's image slot when the
prototype was exported. It is not committed here and must not ship. The Profile
identity header needs a real portrait asset commissioned per
`docs/specs/05-asset-spec.md`; until then it renders the same `--surface`
placeholder every other missing portrait uses.

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
