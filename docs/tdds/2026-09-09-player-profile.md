# Technical Design Document — Player Profile (Skills · Gear · Leaderboard)

> Copied from `docs/specs/TDD-TEMPLATE.md`.
> **Status: implemented as a v1 slice, pending review.** This document has been updated to
> describe **what was actually built**, per `06-technical-requirements.md` §1.3 ("If the design
> changed during implementation, update the TDD in the same PR — design and code never drift").
> Sections marked **△ CHANGED FROM DRAFT** differ from the original design-handoff draft; each
> says why.
> Full visual detail lives in [`../design-handoff/README.md`](../design-handoff/README.md) and
> [`../design-handoff/SCREENS.md`](../design-handoff/SCREENS.md) §6. Read that directory's
> provenance note first — it corrects the handoff's claim about colour tokens.
> **This is one of ~12 systems in the full-game handoff — use it as the model for the others.**

| | |
|---|---|
| **Author** | Design handoff (Omelette), adopted and implemented by Claude Code |
| **Date** | 2026-09-09 (drafted) · 2026-09-09 (updated post-implementation) · 2026-09-11 (re-issued against Chrome Money) |
| **Status** | Implemented (v1 slice) — **needs review and sign-off** |
| **Reviewers** | Bobby Babcock (spec owner) + maintainer |
| **Related PRs** | wearedominion/opps#2 (merged 2026-09-11, screen shipped dark) |
| **Type** | New system · New content type · State/economy |

---

> **Visual re-issue, 2026-09-11 (DOM-49).** This TDD was written against
> `OPPS_UI_Agent_Style_Guide.md`, which was deleted on 2026-09-10. Every visual claim below has
> been re-stated against the Chrome Money contract in `CLAUDE.md`. Two things are worth knowing
> before reading further:
>
> 1. **Most of the port had already happened.** The DOM-36 rewrite of `css/styles.css` collapsed
>    the profile's parallel `--pf-*` token set into the global `:root` and carried the `pf-`
>    classes over with it. The ticket for this re-issue assumed the CSS still had to be ported;
>    it did not. What remained was in `js/profile.js`, not the stylesheet.
> 2. **The screen ships dark.** It is on `main` but unreachable — the header entry point in
>    `index.html` is commented out — until this TDD and DOM-40 are signed off.

## 1. Summary

Implements the Player Profile screen specified in `docs/profileScreen.md`: a single hub for
player identity, skill-point allocation, gear equipping, a leaderboard with public profile views,
and a stats readout.

**△ CHANGED FROM DRAFT — scope of the v1 slice.** Three items in the original draft were
deliberately deferred and are **not** in this build:

| Deferred | Why | Where it goes |
|---|---|---|
| The `buyItem()` refactor + save migration | Gear ships as placeholder content using `pow`/`buff`/`tier`, not `atk`/`def`. Equipping never touches `G.attack`/`G.defense`, so there is nothing to double-count and no migration to write. Becomes live when real gear data lands. | Its own PR, once §7's source-of-truth question is answered |
| Retiring `js/stats.js` / the STATS tab | The stats overlay is a separate system (build-order item 4). | Stats-overlay PR |
| A working LEADERBOARD | §9's data-source dependency is unresolved. Ships inert. | Once §9 is resolved |

The STATS tab therefore still exists, and the profile's STATS button routes to it so the
affordance is never dead.

## 2. Problem & goals

- **Problem:** the prototype has no skill allocation, no equip/unequip, and no public profile.
  Gear bonuses are applied irreversibly at purchase, so there is no loadout decision to make.
- **Goals:** deliver build identity (Grinder / Fighter / Tank), a reversible loadout, and a
  public show-off surface.
- **Non-goals:** respec (v1 is permanent); secondary crew-granted gear slots (see §16 Q6);
  real gear economy numbers (placeholder data ships behind the schema).

## 3. Player experience

Profile hub with three tabs — SKILLS · GEAR · LEADERBOARD — under an unboxed identity header
carrying a contextual STATS button. Gear is a paper-doll with five body slots plus RIDE and
STASH, backed by a full inventory list. Skill allocation is staged and confirmed, with a
no-respec warning. Fits the short-session async loop: level up, spend, re-equip, leave.
See [`../design-handoff/SCREENS.md`](../design-handoff/SCREENS.md) §6 for full visual detail.

**△ CHANGED FROM DRAFT — staging controls.** The draft described a single `+` button in the
retired lime accent. The implementation follows the newer `.dc.html` prototype: each skill row
has a **`−` and a `+`**, so a staged rank can be taken back before commit, plus a **RESET**
button beside CONFIRM.

**△ RE-SPECIFIED FOR CHROME MONEY (2026-09-11).** Staged state is now carried by three tokens,
not one accent colour: the row border goes `--border-gold`, the staged value goes `--green`, and
a staged rank pip fills `--chrome-fill`. Committed values render in `--text`. Lime is retired and
must not reappear.

## 4. Tenet compliance

| Tenet | How this build complies |
|---|---|
| T1 Zero friction | No new boot cost; profile renders on demand via `showTab()`. |
| T2 Instant/tiny/wide-device | One JS file + appended CSS. No new library, no bundler. Body figure is inline SVG. |
| T3 SDK feature-detected | No SDK dependency in skills or gear. Leaderboard is inert (see §9). `Sound.*` calls are guarded with `typeof`. |
| T4 JSON-first | **⚠️ EXCEPTION — see §7.** Content is temporarily hardcoded in `js/profile.js` at the maintainer's direction. This is a called-out, time-boxed deviation, not a precedent. |
| T5 Graceful degradation | Verified: every tab renders against emptied content arrays and an empty `RANK_NAMES` without throwing. The `showTab()` hook is `typeof`-guarded so the game works if `profile.js` fails to load. |
| T6 Single persistence seam | New fields on `G`; all writes via `GameState.save()`. No new storage key. No `localStorage`/`JestSDK.data` outside `js/state.js`. |
| T7 Visual system | **Re-issued against Chrome Money 2026-09-11 (DOM-49).** The screen consumes the global token set declared in the single `:root` of `css/styles.css` — it declares no tokens of its own. Authority is the UI Implementation Contract in `CLAUDE.md`; the former `OPPS_UI_Agent_Style_Guide.md` was deleted 2026-09-10 and is not a live reference. Verified in-browser across all three tabs: no retired colour, no 2–4px radius, no opacity dimming, no shadow other than `--modal-shadow`. |
| T8 Fiction stays fiction | Copy is in-fiction; no real-world claims. |
| T9 CI/CD | **⚠️ NOT MET — see §13.** No automated tests were written; test infrastructure does not exist in the repo and standing it up was explicitly deferred by the maintainer. |

## 5. Architecture & implementation

**△ CHANGED FROM DRAFT — actual files touched.** The draft anticipated changes to `js/store.js`
and `js/stats.js`; neither was touched, per §1.

| File | Change |
|---|---|
| `js/profile.js` | **New.** The whole system — content tables, pure helpers, renderers, actions, overlays. |
| `js/state.js` | `SCHEMA_VERSION` + `MIGRATIONS` + `migrate()` + `saveDurable()`; four additive `G` fields. |
| `js/main.js` | `SKILL_POINTS_PER_LEVEL`; level-up grants points and refills pools; re-renders profile. |
| `js/ui.js` | One `typeof`-guarded line in `showTab()`. |
| `index.html` | Style-guide font link, nav item, tab container, overlay host, script registration. |
| `css/styles.css` | Originally 411 appended lines carrying a parallel `--pf-*` token set. **Absorbed by the DOM-36 rewrite (2026-09-10):** the parallel tokens are gone and the `pf-` classes now consume the global set. Profile-specific layout modifiers (`.pf-fill`, `.pf-empty.bare`, …) were added 2026-09-11 to retire static inline styles from `js/profile.js`. |

- **Module shape:** render + action functions (§5.2) — a tab-driven content system, as drafted.
  Pure math (`pfGearPower`, `pfPendingCost`, `pfPublicProjection`, `pfOwns`) is separated from
  DOM writes so it is testable without a browser when tests arrive.
- **Load-order placement:** after `js/stats.js`, before `js/main.js`. Confirmed in `index.html`.
- **Boot wiring:** none. `showTab('profile')` calls `renderProfile()` lazily, as drafted.
- **Shared helpers reused:** `$`, `showTab`, `log`, `toast`, `updateHUD`, `GameState.save`,
  `Sound.click`/`Sound.win`. Nothing reinvented.
- **Overlays** render into one host (`#pf-overlays`) rather than three separate containers in
  `index.html` — same fixed-element-ID contract, less markup. No `alert`/`confirm`/`prompt`.

## 6. State & persistence

**△ CHANGED FROM DRAFT — `maxMoves` was not added.**
The draft proposed `maxMoves: 10`. `G.maxEnergy` **already is** the Moves pool — the fiction maps
energy → Moves in the render layer only (`03-game-architecture.md` §3.1). Adding `maxMoves`
would have created two fields for one concept and split the energy-regen logic. **The MAX MOVES
skill raises `G.maxEnergy`.**

- **New `G` fields (all additive, safe defaults, read defensively):**

  ```js
  skillPts: 0,        // unspent skill points, +5 per level
  stamina: 10,        // Fighter pool — current
  maxStamina: 10,     // Fighter pool — max
  equipped: {},       // { slotId: itemId } — permanent save keys
  ```

  Reuses existing `attack`, `defense`, `health`, `maxHealth`, `maxEnergy`, `inventory`, `level`, `xp`.

- **△ NEW — save versioning was established.** `js/state.js` had **no** `schemaVersion` at all.
  The mechanism from `03-game-architecture.md` §3.4 is now implemented at **`SCHEMA_VERSION = 1`**
  (baseline) with an empty `MIGRATIONS` chain: pure in-memory migration, write-once after upgrade,
  `flush()` paired via `saveDurable()`, and the save-from-the-future guard (`_fromFuture` blocks
  all writes so a stale client cannot clobber a newer save). Adding the profile fields is
  **additive and did not bump the version**, exactly as the draft anticipated.

- **Session-only state** (module-level in `profile.js`, intentionally not persisted):
  `pfTab`, `pfPending`, `pfGearPick`, `pfInfoKey`, `pfConfirmOpen`.

- **Commit semantics:** staging mutates nothing. `pfCommitSkills()` validates, mutates `G`,
  tops up the matching current pool when a max rises, logs, toasts, `updateHUD()`, re-renders,
  then `GameState.save()` — the §5.2 sequence.

## 7. Data & content

**△ CHANGED FROM DRAFT — no JSON files were created. This is a tenet T4 exception.**

The draft specified `data/gear.json` and `data/skills.json` wired into `loadGameData()` with the
progress denominator moving `/ 5 → / 7`. **None of that happened.** At the maintainer's direction,
content ships **hardcoded in `js/profile.js`** because the live design data is still being
authored and will be added to the repo separately.

- **What is hardcoded:** `GEAR_SLOTS` (7 slots), `GEAR_ITEMS` (23 placeholder items across those
  slots), `SKILL_DEFS` (5 skills). All three are lifted verbatim from the design prototype and are
  **shaped to move into JSON unchanged**.
- **`loadGameData()` is untouched.** Denominator remains `/ 5`.
- **Exit criteria for the exception:** when the live data lands, delete the three tables from
  `js/profile.js`, add the two `fetch`es to the `Promise.all`, assign to `GEAR`/`SKILLS`, and
  update the denominator to `/ 7`. The rendering code reads through helper functions
  (`pfAllItems`, `pfFindItem`, `pfSkillDef`) precisely so this swap touches nothing else.
- **✅ RESOLVED 2026-09-14 (DOM-123) — `gear.json` vs `store.json`.** `store.json` was renamed to
  `data/gear.json` and owns every item definition; there is no second file. Items gained a `slot`
  field carrying the seven permanent paper-doll keys (DOM-121). See `data/README.md` §gear.json.
  **Duplicating item definitions across two files is not acceptable.** Deferring the JSON work
  deferred this decision too — it must be answered before the data migration, and it is coupled to
  the `buyItem()` refactor in §11.
- **Placeholder tuning values:** `segMax` per skill (the segmented-bar display scale) and the
  `owned` flags on gear items are prototype seed values, flagged in code, and need real numbers.

## 8. Assets

Player portrait is a CSS placeholder — a `repeating-linear-gradient` in `#1f1f28`/`#17171c`,
the same cold near-black pair the runtime map uses for building masses — with an `aria-label`;
real art still owed per `05-asset-spec.md`. Once `data/portraits.json` is wired (DOM-60) the
player portrait should resolve through it rather than through CSS.
The body figure is inline SVG with `role="img"` and a label — no external asset.
Gear rows do **not** surface the emoji `icon` field; the prototype avoids emoji.

## 9. External systems

- **Jest SDK surfaces:** none required for skills or gear — confirmed working against the SDK mock
  and equally functional without it.
- **△ The leaderboard ships inert.** Cross-player data still has no home (`GameState` is a
  per-user blob; `server/` is purchase-verification only). `pfRenderBoard()` renders a styled
  empty state and cannot throw. **This remains the largest unresolved dependency.** Options
  unchanged: a Jest platform surface if one exists, a `server/` extension, or static data.
- **The public projection is built but currently unused.** `pfPublicProjection(state)` exists and
  is verified (§13) so that when a data source lands, the hidden-field rule is already enforced in
  one place rather than being retrofitted per-render.
- **Server changes:** none.
- **New external dependency:** none.

## 10. Security & privacy

- **Trust boundary:** skill points and equipment are client-authoritative, consistent with the rest
  of the game. If the leaderboard becomes server-backed, submitted stats are client-reported and
  **must not** be trusted for anything of value.
- **Public projection — implemented and verified.** `pfPublicProjection()` returns **only**
  `handle`, `level`, `clout`, `rank`, `gear[]` (slot, slotLabel, name, tier). Verified absent:
  `attack`, `defense`, `health`, `maxHealth`, `energy`, `stamina`, `money`, `gems`, `skillPts`,
  `inventory`. It is the single enforcement point required by `docs/profileScreen.md`.
- **Output escaping:** all interpolated names/labels pass through `pfEsc()`, which matters because
  `G.handle` may eventually come from the SDK rather than from our own content.
- **Secrets:** none client-side.

## 11. Compatibility & migration

- **Old saves:** load unchanged; new fields take defaults via `Object.assign`. Verified with a
  pre-versioning fixture (no `schemaVersion`) — migrates with no loss.
- **△ The `buyItem()` refactor is deferred, so no migration ships.** The draft called it breaking
  and required a `SCHEMA_VERSION` bump plus a golden-file test. Because gear is placeholder content
  keyed on `pow` rather than `atk`/`def`, **equipping does not touch `G.attack`/`G.defense`**, so
  no bonus is double-counted today. When real gear data makes equipping affect combat stats, that
  PR carries: the refactor, a migration subtracting previously-granted bonuses for every item in
  `G.inventory`, `SCHEMA_VERSION` → 2, and the golden-file test. The mechanism is now in place to
  receive it.
- **Rollback:** revert code together; there is no data to revert. The from-future guard is
  implemented and must stay intact.

## 12. Performance

- **Boot impact:** none. No new fetches; profile renders on demand.
- **Memory:** no retained buffers; overlays are plain DOM, rebuilt per render.
- **Payload:** one JS file (~666 lines) + 411 lines of CSS. No library.
- **Render cost:** `renderProfile()` rebuilds the tab's innerHTML. Acceptable at this scale
  (≤ 23 inventory rows); revisit if inventory grows large.

## 13. Testing plan

**△ CHANGED FROM DRAFT — ⚠️ no automated tests were written. This does not meet
`06-technical-requirements.md` §4 or the Definition of Done item 6.**

The repo has no test runner, no `package.json` outside `server/`, and no CI workflow. Standing
that up was explicitly deferred by the maintainer for this pass. `02-tech-architecture.md` §4 also
prohibits a root `package.json`, so the infrastructure question needs an answer (a `tests/`
directory with its own `package.json`, mirroring the `server/` precedent, is the suggested
resolution) before this gate can be met.

**Owed before merge:**
- **Unit:** gear-power derivation from `G.equipped`; skill cost math incl. the 2-point Stamina
  case; staged-vs-committed allocation; level-up grant; `pfPublicProjection` omitting hidden fields.
- **Regression:** save-compat; golden-file test when the `buyItem` migration lands.
- **E2E:** level up → allocate → confirm → persist; equip → reload → still equipped.

**Manual verification completed** (plain browser at 375×812 with the Jest SDK mock active):

| Area | Result |
|---|---|
| Staging math, incl. 2-point Stamina | ✅ 1 + 2 = 3 spent, 4 left |
| Ledger AVAILABLE / SPENDING / LEFT | ✅ tracks staging live |
| Overspend guard | ✅ blocked; both `+` disable at 0 left |
| Confirm modal + no-respec warning | ✅ before→after lines correct |
| Commit | ✅ `skillPts` 7→4, `maxEnergy` 10→11, `maxStamina` 10→11, pools topped up |
| Level-up grant | ✅ +5 points, Stamina/Moves/Health fully refilled |
| Gear power derivation | ✅ 7+19+9 = 35; 3/5 slots |
| Wrong-slot equip | ✅ rejected |
| Unowned equip | ✅ rejected |
| Unequip (button + tap-equipped) | ✅ |
| Persistence across reload | ✅ `equipped`, `skillPts`, `maxEnergy`, `maxStamina`, `schemaVersion: 1` |
| Pre-versioning save migration | ✅ no loss |
| Save-from-the-future guard | ✅ flagged read-only |
| Empty content arrays + empty `RANK_NAMES` | ✅ all three tabs render, no throw |
| Public projection leak check | ✅ zero hidden fields present |
| Console errors | ✅ none |

**Not yet verified:** the real Jest surface (mock only), and pointer/touch interaction — the
verification above drove the same handler functions the buttons call, because the test browser
could not deliver synthetic clicks.

## 14. Rollout

- **Flags/gating:** SKILLS + GEAR ship functional; LEADERBOARD ships inert by construction rather
  than behind a flag.
- **Pipeline:** unchanged — no data ships with this code.
- **Success metrics:** % of players who spend points within a session of levelling; equip changes
  per session.

## 15. Alternatives considered

*(unchanged from draft)*

- **Inventory as a 4th tab** — rejected; four tabs crowd the row at mobile width and inventory is
  gear's detail, not a peer destination.
- **Inventory inside STATS** — rejected; stats are consequences, gear is a cause.
- **Inventory as a 5th bottom-nav item** — rejected; identity and loadout belong together.
- **Modal-per-slot only (no inventory list)** — rejected; the player's real question is "is this
  better than what I'm wearing," which needs both visible at once.
- **Keeping STATS as a tab** — rejected in favour of the modal, to free a tab slot for GEAR.
  *(Note: STATS remains a tab today because the overlay is a later system — see §1.)*

**△ Added during implementation:**
- **A separate `maxMoves` field** — rejected; `maxEnergy` already is that pool (§6).
- **Three overlay containers in `index.html`** — rejected in favour of one host div; identical
  contract, less markup to keep in sync.

## 16. Open questions

Carried from the draft, with current status:

1. Rank title **and** Clout are both shown — confirm that's wanted. **Built as both.**
2. Respec: permanent in v1. **Built as permanent, with the warning on the row and in the confirm.**
3. Public gear visibility leaks inferable Attack/Defense. Accept, or show gear without stats?
   **Currently the projection includes item name + tier but not numbers — closer to "cosmetic".**
4. Health granted per skill point — prototype assumes +1. **Built as +1. Needs a real number**
   (`docs/profileScreen.md` notes Health pools run larger, so likely more).
5. Crew/Lieutenant count on the public view. **Not included.**
6. **Secondary gear slots.** `docs/profileScreen.md` §5 requires secondary slots with +1/+2/+3
   badges, capacity from Crew size. **This build has single slots only — the spec and the build
   still conflict. Unresolved.**
7. ~~**`gear.json` vs `store.json`** — one source of truth for items (§7).~~ **RESOLVED
   2026-09-14 (DOM-123): `gear.json` owns item definitions; `store.json` is gone.** Originally:
   deferred along with the JSON migration.
8. **Leaderboard data source** (§9) — **still the blocking dependency.**

**△ New questions raised by the implementation:**

9. **⚠️ Level-up auto-grants compete with the skill sinks.** `addXP()` still grants **+3 attack,
   +2 defense, +15 maxHealth** per level automatically, while the ATTACK / DEFENSE / MAX HEALTH
   skills grant **+1 for 1 point**. That makes those three point sinks close to worthless — the
   "skill points into Attack are a trap" dynamic the profile spec warns about, but worse, because
   it is free. **Left unchanged deliberately: this is an economy decision, not an implementation
   one.** Flagged in `js/main.js`. **Needs Bobby.**
10. **Level curve — RESOLVED 2026-09-11.** `data/progression.json` is now the source of truth and
    is wired up: level is derived from cumulative Clout via `js/progression.js`, and `addXP()`/
    `xpNext * 1.6` are gone. The table was retuned from `round(100 · 1.05^L)` to
    `round(100 · 1.10^L)` — the 1.05 curve was too flat — so lifetime clout to the level-120 cap
    is ~92.7M rather than ~696k. The profile's Clout bar and "TO NEXT" label read this table.
    `ranks.json` was also fixed: rank names are now **bands** of `tuning.progression.levelsPerRank`
    (10) levels via `rankForLevel()`, so level 11 is "Soldier", not "Untouchable".
    **No open question here.** The open item is grant-side scaling, tracked on DOM-67.
11. **Skill segment scale.** `segMax` per skill is a display-only placeholder (24/24/240/120/120)
    and needs tuning against real caps.
