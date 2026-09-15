# 04 · PLUGS

**Nav:** PLUGS · **Purpose:** NPC connects — quest-giver / shop surface.
**Repo source:** `js/plugs.js` (`PLUGS_DATA`) → migrate to `data/plugs.json`.

A **12px-gap column** of horizontal cards. Card: **border `#3d3627`** (plugs are the gold-bordered surface), radius 16px, card gradient, `overflow:hidden`.

## Card anatomy

- **Left:** 146px-wide full-height portrait (`object-fit:cover`), bg `#111116`, right border `#26262e`, a 30px bottom scrim (`rgba(8,8,10,0.7) → transparent`).
- **Right:** `flex:1; padding:17px 15px 13px; min-height:206px`, column:
  - Name — Anton **22px** ls 1px, lh 1.05 (TOMMY, THERESA, KYLIE, BIG HOMIE MARCO, DEX).
  - Moniker — label style in **gold** (`THE FENCE`, `THE CONNECT`, `THE LOOKOUT`, `THE MECHANIC`, `THE TWEAKER`), 7px above-gap.
  - Hook line — SG 13px, lh 1.6, `#8e8e9a`, `text-wrap:pretty`, 11px gap.
  - **LETS GO** — primary gold pill (`padding:11px 22px`, no sheen), pinned bottom-right via `margin-top:auto` + 13px top padding.

## Plug dialogue popup (opens on LETS GO)

See OVERLAYS.md for geometry. Summary: centered panel max-width 330px, radius 22px, border `#3d3627`, with a **288px portrait header** — the plug's image with an 80px bottom scrim and the name floating bottom-left in a pill (`bg rgba(8,8,10,0.86); border #3d3627; padding 9px 16px`, Anton ~20px, size shrinks for long names).

Body (`padding:17px 18px 18px`): moniker label (gold) → dialogue text (SG 15px lh 1.6 `#d8d6d0`, `min-height:84px`) → footer: step counter label (`1 / 4`) + spacer + **LATER** (secondary dark pill) + advance CTA (min-width 104px; intermediate steps secondary style, final step gold `RUN IT` / recruit action).

Advancing steps through the plug's 4-line dialogue; the last line commits (recruit/accept) and closes.

## Data & state

Per plug: `slotId` (portrait key), `name`, `moniker`, `line` (hook), `dialog[4]`. Portraits shared with the Crew screen roster. Session state: `plugOpen`, `plugIdx`, `plugLine`; recruits persist (`plugsRecruited`).
