# Chrome Money — visual reference

The two files here are the visual reference cited by the **UI Implementation Contract** in
`CLAUDE.md`. They were copied in on 2026-09-11 (DOM-38) because the contract pointed at paths
that did not exist in the repo, leaving anyone following it with nothing to check work against.

| File | What it is |
|---|---|
| `style-guide.html` | The Chrome Money style guide. Self-contained — no network, no build step. Open it in a browser. |
| `concept-board.png` | The original concept board: palette, type specimen, buttons, panel treatment, and one rendered Hood screen. |

Both are **byte-identical copies** of the originals, not re-exports:

* `style-guide.html` ← `Opps - Chrome Money Style Guide (standalone).html` (md5 `c55d6be2…`).
  Two copies of this sat in `~/Downloads`; they are the same file, so there is no "which
  variant" question.
* `concept-board.png` ← `Style Options/1d Chrome Money.png` (md5 `879d925f…`), a sibling
  directory of the repo, not inside it.

Not copied: `Style Options/1d Chrome Money Implementation Guide (for Humans0).pdf` — 883 KB,
written for people rather than agents, and its content is covered by `style-guide.html`.

## Authority

**Where these disagree with the token table in `CLAUDE.md`, the contract wins.** These are
design artefacts that predate the port; the contract is what shipped. Use them for *intent* —
weight, spacing, where chrome is allowed to land — and read exact values out of the contract.

Known divergences, so nobody "fixes" the CSS to match the picture:

* The board labels the panel `#14141A`, a flat fill. Panels ship as a gradient,
  `--panel-top #181820` → `--panel #111116`.
* The board's panel note reads `RADIUS 18`. The shipped radii are `--r-card 16px` and
  `--r-panel 20px`.
* The board's HUD and the style guide both say **ENERGY**. That meter is called **MOVES**
  in the app (DOM-50). The token is still `--energy-fill`.
* `style-guide.html` mentions the retired orange `#ff3a00` twice — both times in its
  migration table and its don't-list, telling you the orange is gone. It is not an
  endorsement, and nothing in the repo should carry that value.

Everything else on the board matches: `OBSIDIAN #0B0B0C` is `--bg`, `CHAMPAGNE #E8C98A` is
`--chrome`, `PEARL #F2F0EC` is `--text`, and the INCOME / XP / BEEF / MUTED swatches are
`--green` / `--xp` / `--red` / `--muted`.
