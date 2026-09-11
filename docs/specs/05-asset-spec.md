# 05 — Asset Spec

**Status:** v1.0 · Authoritative
**Read before:** adding any art — buttons, screens, menus, portraits, icons, textures, models.

This document governs **visual assets**: formats, sizes, naming, placement, and optimization.
It works alongside — and never overrides — [`claude.md` — UI Implementation Contract](../../claude.md),
which is authoritative for **how things look** (color, type, components). This doc is about the
**files**.

---

## 1. Principles

- **Lightweight first (tenet T2).** Assets are the biggest threat to load time and memory. Every
  asset must be optimized and correctly sized for its display resolution. Ship the smallest file
  that looks right on the widest range of devices.
- **Lazy by default.** Off-screen imagery uses `loading="lazy"` (portraits already do). Nothing
  optional blocks first play.
- **Graceful fallback (tenet T5).** Art is an enhancement. Where a portrait/icon may be missing,
  code falls back to an emoji or placeholder — preserve that. A missing asset must never break a
  screen.
- **Emoji are legitimate placeholder art.** OPPS ships emoji as icons throughout (nav, jobs, HUD,
  enemy/item/property icons). Replacing them with bespoke art is a roadmap item, not a
  requirement for new content.
- **Consistent, decodable naming.** Filenames encode meaning and, for UI exports, pixel size.

---

## 2. Where assets live

```
assets/
├── images/
│   ├── .gitkeep
│   └── Opps UI Exports/     # exported UI chrome (buttons, bars, sidebar states)
└── portraits/              # character art (enemies, plugs)
```

- `assets/images/` — UI chrome and screens (buttons, header bars, backgrounds, menus). The current
  export set lives in `assets/images/Opps UI Exports/`.
- `assets/portraits/` — character portraits (enemies `enemy-*`, plugs `plug-*`).
- **New categories** (e.g. `assets/textures/`, `assets/models/` for 3D) go under `assets/` in a
  clearly named subfolder. Document the new folder in this spec (PR that adds it amends this doc).

> Housekeeping: `.DS_Store` files are noise — do not commit them. Add a `.gitignore` rule if they
> recur.

---

## 3. Formats

| Asset type | Format | Rationale |
|---|---|---|
| **Character portraits** | `.webp` preferred (plugs already use it); `.png` acceptable when transparency/tooling requires | `.webp` is far smaller at equal quality and widely supported. Enemy portraits are currently `.png` — new ones SHOULD be `.webp`. |
| **UI chrome** (buttons, bars, sidebar states) | `.png` (lossless, crisp edges, transparency) | UI exports need pixel-crisp edges and alpha. |
| **Photographic / rich backgrounds** | `.webp` | Best size/quality for complex imagery. |
| **Simple icons / line art** | Inline `.svg` or emoji | Scales without files; SVG can be inlined (see the map). Prefer emoji/CSS/SVG over raster for simple marks. |
| **3D textures** (if/when added) | `.webp` or compressed texture formats, power-of-two dimensions | Memory budget; document in the 3D TDD. |
| **3D models** (if/when added) | `.glb` (glTF binary) | Compact, standard, Three.js-native. Lazy-load with the 3D view only. |

**Rules:**
- **No uncompressed or oversized source art** in the shipped `assets/` tree. Export at display
  resolution, optimized.
- **No new font files** — fonts come from Google Fonts per the UI Implementation Contract (tenet T7).
- **Prefer vector/emoji/CSS** for anything that doesn't need raster detail.

---

## 4. Sizing & resolution

Size assets to their **actual on-screen dimensions**, accounting for high-DPI (≈2× is a sensible
ceiling for mobile — the 3D canvas already clamps `devicePixelRatio` to 2).

Observed component sizes (from the current export set and code) — match the intended slot:

| Asset | Displayed at | Export guidance |
|---|---|---|
| Enemy portrait (list) | ~64–66 px thumbnail | `64×64` (as `OppEnemyPic_00X_64x64.png`), or 2× for crispness. Combat overlay shows 56×56. |
| Plug portrait | Card thumb + modal (larger) | Provide enough resolution for the modal; `.webp`, optimized. |
| Standard button | 186×58 (`StandardButton_186x58.png`) | Export at the named size; 2× acceptable if optimized. |
| Location button | 16×16 (`LocationButton_16x16.png`) | Tiny — keep bytes minimal. |
| Sidebar selected option | 324×64 (`SideBar_SelectedOption_324x64.png`) | Match slot. |
| Full header bar | 1536×100 (`FullHeaderBar_1536x100.png`) | Wide chrome — ensure it scales/crops responsibly; prefer CSS gradients where the UI Implementation Contract provides them. |

**Rules:**
- **Don't ship art larger than it displays.** Downscaling in the browser wastes bytes and memory.
- **Respect the layout.** Portraits render as circles (62 px allies with a chrome ring, 58 px opps) per the
  UI Implementation Contract; export with that crop/aspect in mind.
- Prefer the UI Implementation Contract's **CSS backgrounds, gradients, and placeholder textures** over raster
  images for panels, scrims, and fills — they cost zero bytes and are theme-consistent.

---

## 5. Naming conventions

Two conventions are in use; follow the matching one.

### 5.1 Content-linked assets (portraits) — REQUIRED pattern
Named by **category + content `id`**, lowercase, hyphenated, so code can resolve them by `id`:

```
enemy-<id>.<ext>     e.g. enemy-snitch.png,  enemy-rival.png
plug-<id>.<ext>      e.g. plug-tommy.webp,   plug-dex.webp
```

- The `<id>` **MUST** match the content object's `id` in the relevant `data/*.json`
  (see [`04-game-data-spec.md`](./04-game-data-spec.md)). This is how a portrait is linked to a
  character. Mismatched names silently fall back to emoji.
- When you add an enemy/plug, add its portrait with the exact `id`-based name.

### 5.2 UI export assets — descriptive + size pattern
Exported chrome is named **PascalCase/descriptive + `_WxH`**:

```
StandardButton_186x58.png
SideBar_SelectedOption_324x64.png
FullHeaderBar_1536x100.png
OppEnemyPic_001_64x64.png
LocationButton_16x16.png
```

- Include the **pixel dimensions** (`_WxH`) so the intended slot is unambiguous.
- Keep numbering zero-padded (`001`, `002`) for sets.

### 5.3 General rules
- Lowercase for content-linked assets; keep the established casing within the `Opps UI Exports`
  set for consistency.
- **No spaces in new filenames.** (`Opps UI Exports/` folder has a space historically; do not add
  spaces to new files — prefer hyphens/underscores.)
- Names are stable references — **renaming an asset can orphan a code/data reference.** Treat asset
  names like `id`s.

---

## 6. Referencing assets in code & data

- **Path style:** relative from the app root, e.g. `assets/portraits/enemy-snitch.png` (matches
  `ENEMY_PORTRAITS` and `PLUGS_DATA`).
- **Emoji icons** for jobs/items/spots/enemies live in the JSON `icon` field
  ([`04-game-data-spec.md`](./04-game-data-spec.md)) — that's data, not an asset file.
- **Portraits** are currently mapped in code (`ENEMY_PORTRAITS` in `js/combat.js`) or inline in
  `PLUGS_DATA` (`js/plugs.js`). Per the data-first direction, portrait paths SHOULD migrate into
  the content JSON over time (see [`04-game-data-spec.md`](./04-game-data-spec.md) §6). Until then,
  update the code map when adding a portrait.
- **Always** provide the fallback path (emoji/placeholder) so a missing file degrades gracefully,
  and add `loading="lazy"` to off-screen `<img>` tags.
- **Always** include meaningful `alt` text on `<img>` (accessibility floor in the UI Implementation Contract).

---

## 7. Optimization checklist (run before committing art)

- [ ] Exported at display resolution (≤ 2× DPI); not oversized.
- [ ] Compressed: `.webp` for photographic/portrait art; `.png` crushed for UI chrome.
- [ ] File size is reasonable for a messaging-surface game (portraits ideally a few KB–tens of KB,
      not hundreds).
- [ ] Correct format for the job (§3); no new font files.
- [ ] Named per §5 (content `id` match for portraits; `_WxH` for UI exports).
- [ ] Placed in the correct `assets/` subfolder.
- [ ] Referenced with a relative path; has an emoji/placeholder fallback and `alt` text; lazy where
      off-screen.
- [ ] No `.DS_Store` or editor cruft committed.
- [ ] Matches [`claude.md` — UI Implementation Contract](../../claude.md) (framing, radii,
      scrims, placeholder textures).

---

## 8. 3D / rich-graphics assets (forward-looking)

The 3D map (`js/map3d.js`) currently renders a procedural city — **no external model/texture
assets**. If you introduce 3D assets:

- Keep them **off the critical path** and **lazy-loaded with the 3D view only** (the pattern
  already used for Three.js).
- Budget aggressively for memory and download; provide a **2D fallback** and honor tenet T2 (wide
  device reach). WebGL may be unavailable — the game must not require it.
- Use `.glb` models and compressed, power-of-two textures; document every added asset and its
  budget in the feature's TDD.
