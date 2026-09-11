# Technical Design Document — Platform Login (Guest Mode + Register Prompting)

> Requirement reference: [`../specs/06-technical-requirements.md`](../specs/06-technical-requirements.md).

| | |
|---|---|
| **Author** | Sumit Sheth (@sumit) |
| **Date** | 2026-09-11 |
| **Status** | In Review |
| **Reviewers** | <maintainer(s)> |
| **Related PRs** | <link once opened> |
| **Type** | New system · External contract |

---

## 1. Summary

Jest lets players start as **guests** and register later. This adds a small `Auth` module that
detects guest-vs-registered state and prompts guests to register / sign in at appropriate moments
via Jest's built-in login popup (`JestSDK.login()`). It also closes a compliance gap: notifications
must never be scheduled for guests. Guest progress already transfers on registration because the
platform keeps a stable `playerId` and we persist through `JestSDK.data` — so there is no data
migration to build.

## 2. Problem & goals

- **Problem:** The game boots every player as an implicit guest but never reads `registered`, never
  invites them to claim an account, and — critically — schedules notifications for guests, which the
  Jest platform disallows.
- **Goals:**
  - Detect guest vs registered (`JestSDK.getPlayer().registered`).
  - Never schedule notifications for guests; resume them the moment a guest registers.
  - Prompt guests to register/sign in at natural, non-nagging moments.
  - Keep prompt thresholds/copy data-driven (JSON).
- **Non-goals:**
  - Subscriptions (not yet built; Jest auto-prompts guests to register before a recurring
    subscription, so no guard is needed here — revisit when the subscriptions surface lands).
  - Branded/custom registration UI (`showRegistrationOverlay`) — deferred; built-in popup first.
  - Social profile/avatar display (separate, still-future surface in §2.2a).

## 3. Player experience

A guest plays with zero friction (unchanged). At a rank milestone (default **Rank 3**), after
buying an income **spot**, and via a persistent **"Claim your account"** card on the Crew screen,
they see Jest's native register/sign-in popup. Prompts are throttled (default **24h** between
automatic ones; the explicit Crew button bypasses the throttle). On success they get a short
in-feed confirmation, and re-engagement/income notifications begin. Declining changes nothing —
the game stays fully playable. This fits the Mafia-Wars-style, asynchronous, short-session loop:
prompts ride existing beats (rank-up, buying a spot) rather than interrupting play.

## 4. Tenet compliance

| Tenet | How this design complies |
|---|---|
| T1 Zero friction | Guests keep playing instantly; registration is always optional and prompts are throttled. |
| T2 Instant/tiny/wide-device/low-memory | One small module + one tiny JSON file; no new dependency; nothing on a render hot path. |
| T3 SDK feature-detected + fallback | Every `JestSDK` access in `auth.js`/`notifications.js` is `typeof`-guarded and try/caught; plain browser = guest, prompts are no-ops. |
| T4 JSON-first, data-driven, remotely deployable | Thresholds + copy live in `data/platform.json`, served/deployable like other game data. |
| T5 Graceful degradation | Missing/broken `platform.json` falls back to `AUTH_DEFAULTS`; a failed fetch can't block core data or the loader. |
| T6 Single persistence seam (GameState) | Only new persisted field is `lastRegisterPromptAt`, saved via `GameState`. `Auth` never touches `JestSDK.data.*`. |
| T7 Style guide | Crew card + banner reuse existing `.card`/`.attack-btn` classes and CSS vars; no new visual system. |
| T8 Fiction stays fiction | Copy is in-world flavor; no real-person/entity claims. |
| T9 Ships through the CI/CD pipeline | Pure static JS + JSON + docs; validated and deployed by the existing pipeline. |

## 5. Architecture & implementation

- **New files:** `js/auth.js`, `data/platform.json`, this TDD.
- **Changed files:** `js/notifications.js`, `js/main.js`, `js/state.js`, `js/properties.js`,
  `js/crew.js`, `index.html`, `docs/specs/07-external-systems.md`.
- **Module shape:** `Auth` — a namespaced object matching `Crew`/`Notify`/`Payments`. Public:
  `init()`, `isGuest()`, `isRegistered()`, `canPrompt()`, `refresh()`, `promptRegister(reason, opts)`,
  `rankThreshold()`. Internal: `_onRegistered()`, cooldown/config helpers.
- **Load-order placement:** `<script src="js/auth.js">` immediately after `js/ui.js` (needs `G`,
  `GameState`, `log`, `toast`) and before `notifications.js`/`main.js`. All cross-module references
  (`Notify`, `updateHUD`, `PLATFORM`) are runtime-only, so load order among them is not fatal.
- **Boot wiring:** `main.js` `init()` calls `await Auth.init()` right after `JestSDK.init()` and
  before any notification scheduling; guarded and non-fatal.
- **Shared helpers reused:** `$`, `log`, `toast`, `updateHUD`, `collectIncome`, `GameState`,
  `RANK_NAMES`.

## 6. State & persistence

- **New `G` fields:** `lastRegisterPromptAt: 0` — read defensively (`G.lastRegisterPromptAt || 0`);
  old saves without it default to `0`. Additive only.
- **Save/load impact:** Additive; no migration.
- **Session-only state (not persisted):** `Auth._registered` / `Auth._known` — registration status
  is authoritative from the platform and is re-read every boot (`Auth.init`), so persisting it could
  go stale across the guest→registered transition.

## 7. Data & content

- **New data file:** `data/platform.json` — `{ rankThreshold:int, cooldownHours:int, copy:{…} }`.
  All fields optional; `Auth` merges over `AUTH_DEFAULTS`.
- **`loadGameData()` changes:** progress denominator `5 → 6`; adds a 6th `Promise.all` entry that
  fetches `platform.json` with a `.catch(() => ({}))` so a miss degrades to defaults without failing
  core loads; assigns global `PLATFORM`.
- **JSON-first exceptions:** none.
- **Deployment:** ships and can be hot-updated like other `data/*.json` (tenet T4).

## 8. Assets

None. Reuses existing components and the rank-up banner.

## 9. External systems

- **Jest SDK surfaces used:** `getPlayer().registered` (identity), `login({ entryPayload })`
  (platform login), plus the existing notifications surface (now gated).
- **Feature-detection + fallback:** `auth.js` guards/try-catches every SDK call; plain browser is a
  first-class guest path with no-op prompts. `notifications.js` schedules only when the SDK is
  present **and** `Auth.isRegistered()`.
- **Server / verification changes:** none. (`getPlayerSigned()` / server identity verification is
  out of scope; note it for any future server-trusted feature.)
- **New external dependency:** none.

## 10. Security & privacy

- **Trust boundary:** unchanged. Registration status is a client-side UX gate only; nothing grants
  entitlements from it. Any future server-trusted identity must use `getPlayerSigned()` and verify
  the JWS server-side (as payments do).
- **Secrets:** none added.
- **Privacy:** identity handled entirely by Jest; no third-party trackers; `entryPayload` carries
  only a coarse `source` tag for funnel insight.

## 11. Compatibility & migration

- **Old saves:** load unchanged; missing `lastRegisterPromptAt` defaults to `0`.
- **Old cached data / clients:** old clients simply won't fetch `platform.json`; new client tolerates
  its absence. No coordinated rollout needed.
- **Rollback:** revert the code/spec; `data/platform.json` can be removed safely (defaults take over).

## 12. Performance

- **Boot impact:** one extra tiny JSON fetch (parallel, non-blocking) and one `getPlayer()` read.
- **Memory:** negligible (a few flags + a small config object).
- **Payload:** ~1 small JS file + a sub-1 KB JSON file.

## 13. Testing plan

- **Unit:** `Auth.isGuest/isRegistered` from a mocked `getPlayer`; cooldown math
  (`_cooldownElapsed`); `Notify._canNotify()` false for guest / true for registered.
- **Regression:** save-compat (old save loads; new field defaults); `platform.json` missing →
  defaults; loader still reaches 100%.
- **E2E (critical flow):** guest boot → no notifications scheduled → register via popup →
  notifications scheduled and progress intact.
- **Manual:** plain-browser boot (no SDK) plays with no prompts; simulated guest sees prompts at
  Rank 3 / after buying a spot / on the Crew card; simulated registered player sees none and gets
  notifications.

## 14. Rollout

- **Flags/gating:** thresholds/copy tunable via `platform.json` without a code deploy.
- **Pipeline stages:** condition → test → deploy(test) → deploy(prod).
- **Success metrics:** guest→registered conversion by `entryPayload.source`; zero notifications
  scheduled for guests.

## 15. Alternatives considered

- **Branded overlay (`showRegistrationOverlay`)** — richer, but more UI and the `{{registrationCode}}`
  flow to get right; deferred to a follow-up once the built-in popup path is proven.
- **Persisting registration status in `G`** — rejected; it can go stale and duplicates the platform's
  own source of truth.
- **Prompting on every notification-worthy action** — rejected as naggy; we ride a few milestones and
  throttle.

## 16. Open questions

- Final rank threshold and cooldown (defaults 3 / 24h) — confirm with design/analytics.
- Do we also want an explicit "Sign in" affordance in the header, or is the Crew card enough for v1?
- When subscriptions land, confirm Jest's auto-register behavior end-to-end and document it here.
