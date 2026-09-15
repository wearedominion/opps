# Chrome Money v0.2 — design handoff (authoritative)

Imported byte-identical from the Claude Design handoff package (`design_handoff_opps_chrome_money`)
under **DOM-109**. This is the design source for the **Chrome Money v0.2 UX rebuild**
(Jira DOM-107, found work DOM-108).

**Ground truth:** [`OPPS App (standalone).html`](<OPPS App (standalone).html>) — the runnable
prototype. **When any doc in this folder and the prototype disagree, the prototype wins.**

| File | What it is |
|---|---|
| [`README.md`](README.md) | Shell, design tokens, shared component recipes, state, conflicts, build order. **Read first.** |
| [`screens/01-hood.md`](screens/01-hood.md) … [`08-settings.md`](screens/08-settings.md) | One implementation work order per screen (Jira DOM-110…118). |
| [`OVERLAYS.md`](OVERLAYS.md) | The 14 shared overlays. |
| `design_reference/*.dc.html` | Prototype source — grep for exact style strings. **Reference only; never port** (the repo prohibits frameworks/build steps). |
| [`design_reference/city-data.js`](design_reference/city-data.js) | Procedural city data (→ `data/city.json`, DOM-123). |
| [`design_reference/xp-system.json`](design_reference/xp-system.json) | XP & leveling spec, single source of truth (DOM-124). `xp-system.js` is generated from it — do not hand-edit. |

## Supersedence

This package is **authoritative for Chrome Money v0.2** — layout, spacing, structure, states,
motion, copy, **and palette/type**. It supersedes:

- `OPPS_UI_Agent_Style_Guide.md` (already deleted 2026-09-10) and any stale references to it;
- the amber-era handoff `design_handoff_opps_game/`;
- `docs/design-handoff/chrome-money/` — the **v0.1 reskin** handoff (concept board + style
  guide), kept for history.

Structural tenets from the old guide still hold: no new radii sprawl, JSON-first data,
no `alert`/`confirm`/`prompt`.

The `# UI Implementation Contract` in the repo root `CLAUDE.md` remains the standing
implementation contract; reconciling it with this package's tokens is part of S1 (DOM-110) —
where they conflict, raise it on the ticket rather than silently picking one.
