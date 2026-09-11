# Technical Design Document — <Feature / System Name>

> Copy this file to `docs/tdds/YYYY-MM-DD-<slug>.md`, fill it in, and get it reviewed **before
> implementation**. Keep it proportional to the change: a small system needs a short TDD; a
> payments or state change needs a thorough one. Delete guidance blockquotes as you go.
>
> Requirement reference: [`06-technical-requirements.md`](./06-technical-requirements.md).

| | |
|---|---|
| **Author** | <name / handle> |
| **Date** | YYYY-MM-DD |
| **Status** | Draft · In Review · Approved · Implemented |
| **Reviewers** | <maintainer(s)> |
| **Related PRs** | <links> |
| **Type** | New system · New content type · State/economy · Dependency · CI/CD · External contract · Monetization/security · 3D · Other |

---

## 1. Summary
> One paragraph: what is this and why are we building it?

## 2. Problem & goals
- **Problem:** <what player or engineering need does this address?>
- **Goals:** <bullet the concrete outcomes>
- **Non-goals:** <explicitly out of scope>

## 3. Player experience
> What does the player see and do? Which tab/overlay? How does it fit the Mafia-Wars-style,
> asynchronous, short-session loop? Reference the UI Implementation Contract in `claude.md` for the visual treatment.

## 4. Tenet compliance
> State how the design honors each relevant tenet. Call out any tension and how it's resolved.

| Tenet | How this design complies |
|---|---|
| T1 Zero friction | |
| T2 Instant/tiny/wide-device/low-memory | |
| T3 SDK feature-detected + fallback | |
| T4 JSON-first, data-driven, remotely deployable | |
| T5 Graceful degradation | |
| T6 Single persistence seam (GameState) | |
| T7 Style guide | |
| T8 Fiction stays fiction | |
| T9 Ships through the CI/CD pipeline | |

## 5. Architecture & implementation
> See [`03-game-architecture.md`](./03-game-architecture.md).
- **New/changed files:** `js/…`, `data/…`, `css/…`, `index.html`, `server/…`
- **Module shape:** namespaced IIFE · render+action functions (which and why)
- **Load-order placement:** <where the `<script>` goes and its dependencies>
- **Boot wiring:** <any `init()` step; keep it guarded and non-fatal>
- **Shared helpers reused:** `$`, `log`, `toast`, `rand`, `addXP`, `updateHUD`, `collectIncome`, …

## 6. State & persistence
> See [`03-game-architecture.md`](./03-game-architecture.md) §3.
- **New `G` fields:** `<name>: <default>` — how read defensively; backward-compat for old saves
- **Save/load impact:** <anything beyond additive? migration needed? (if yes → §11)>
- **Session-only state (if any) and why it isn't persisted:**

## 7. Data & content
> See [`04-game-data-spec.md`](./04-game-data-spec.md).
- **New/changed data files + schema:** <fields, types, ids>
- **`loadGameData()` changes:** <global, Promise.all entry, progress denominator>
- **JSON-first exceptions (if any):** <justify explicitly — required by the spec>
- **Deployment:** <how it ships via the pipeline; cache/freshness handling>

## 8. Assets
> See [`05-asset-spec.md`](./05-asset-spec.md).
- **New assets, formats, sizes, names, fallbacks:**

## 9. External systems
> See [`07-external-systems.md`](./07-external-systems.md).
- **Jest SDK surfaces used:** <data / payments / referrals / notifications / identity / progress>
- **Feature-detection + fallback for each:**
- **Server / verification changes:** <endpoints, secrets, trust boundary>
- **New external dependency (lib/CDN):** <name, version, size, load strategy, failure handling>

## 10. Security & privacy
- **Trust boundary:** <what must be server-verified; never trust the client for entitlements>
- **Secrets:** <server-side only; env vars>
- **Privacy:** <no third-party trackers; identity via Jest>

## 11. Compatibility & migration
- **Old saves:** <how they load safely>
- **Old cached data / old clients vs new data:** <coordinated rollout plan if schema changes>
- **Rollback plan:** <how to revert data and/or code safely>

## 12. Performance
- **Boot impact:** <does anything hit the critical path? budget?>
- **Memory:** <retained buffers? teardown on hide?>
- **Payload:** <added bytes; lazy-loading strategy>

## 13. Testing plan
> See [`06-technical-requirements.md`](./06-technical-requirements.md) §4.
- **Unit:** <logic to cover>
- **Regression:** <data validation, balance/curve, save-compat>
- **E2E (if critical flow):** <flow to automate>
- **Manual:** <plain browser + Jest checks; feature-disabled boot check>

## 14. Rollout
- **Flags/gating:** <if any>
- **Pipeline stages:** condition → test → deploy(test) → deploy(prod)
- **Monitoring / success metrics:**

## 15. Alternatives considered
> What else was considered and why it was rejected. Keeps future readers from re-litigating.

## 16. Open questions
> Anything unresolved that reviewers should weigh in on.
