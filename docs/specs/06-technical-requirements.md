# 06 — Technical Requirements

**Status:** v1.0 · Authoritative
**Read before:** starting any non-trivial feature or system.

This document defines the **process gates** every change passes through: when a **Technical Design
Document (TDD)** is required, what testing is expected, and the **pull-request checklist** that
enforces the rest of these specs. This is the document that makes the others *enforceable*.

---

## 1. The core rule: every new feature/system needs a TDD

**Every new feature or system MUST have a reviewed Technical Design Document before
implementation.** Use [`TDD-TEMPLATE.md`](./TDD-TEMPLATE.md).

The TDD exists to catch tenet violations, architecture drift, and platform-contract problems
**before** code is written — when they're cheap to fix.

### 1.1 When a TDD is REQUIRED
- Any **new system file** in `js/` (a new tab, mechanic, or cross-cutting subsystem).
- Any **new content type** or new `data/*.json` file.
- Any change to **state/persistence** (`G` shape, `GameState`), **progression math**, or the
  **economy** (money/rep/gems balance model).
- Any **new dependency** (client library, CDN asset) or change to the **build/CI/CD pipeline**.
- Any change to an **external-system contract**: Jest SDK usage, payments/verification, crew,
  notifications, hosting/deployment (see [`07-external-systems.md`](./07-external-systems.md)).
- Anything touching **monetization** or **security** (purchase verification, secrets).
- Any **schema-breaking** data change or save migration.
- Adding **3D / rich-graphics** capability or assets.

### 1.2 When a TDD is NOT required (lightweight path)
- **Adding content within an existing type** (a new job/enemy/item/spot/rank) that only edits
  `data/*.json` and follows [`04-game-data-spec.md`](./04-game-data-spec.md). (Still passes CI
  validation + the data checklist.)
- **Copy, tuning, and balance tweaks** that don't change schemas or curves materially.
- **Bug fixes** that don't alter architecture, state shape, or a contract.
- **Style/CSS fixes** that stay within [`CLAUDE.md` — UI Implementation Contract](../../CLAUDE.md).

If you're unsure whether your change needs a TDD, it needs a TDD (or at least a maintainer's
one-line sign-off that it doesn't).

### 1.3 TDD workflow
1. Copy [`TDD-TEMPLATE.md`](./TDD-TEMPLATE.md) to `docs/tdds/YYYY-MM-DD-<slug>.md` on your feature
   branch.
2. Fill it in. Keep it proportional — a small system needs a short TDD; a payments change needs a
   thorough one.
3. Open it for review (PR or the team's review channel). **Get sign-off before building.**
4. Link the TDD in the implementation PR. If the design changed during implementation, update the
   TDD in the same PR — design and code never drift (mirrors the spec-amendment rule).

---

## 2. Definition of Done

A change is done only when **all** hold (see also [`01-game-overview.md`](./01-game-overview.md) §6):

1. Respects every **core tenet** (T1–T9).
2. Follows the relevant spec(s): architecture, data, assets, external systems, style guide.
3. Works in **both environments** — plain browser (SDK fallback) and Jest.
4. **Core game still boots** if the new code/asset/library fails to load (graceful degradation).
5. Content is in **JSON**; persistent state is on **`G`** with safe defaults.
6. **Tests** written and green (see §4); CI pipeline green (see §5).
7. TDD reviewed and linked (where required).
8. PR checklist (§6) complete.

---

## 3. Non-functional requirements (apply to every change)

| Requirement | Standard |
|---|---|
| **Load time** | No regression to first-playable. Nothing optional blocks boot. |
| **Memory** | No heavy retained buffers; clean up (the 3D view already tears down its renderer/RAF/observers on hide — match that discipline). |
| **Device reach** | Works across the broadest iOS/Android set; feature-detect modern APIs with fallbacks (tenet T2). |
| **Resilience** | Every SDK/CDN/Web-API touchpoint is guarded and non-fatal on failure (tenet T5). |
| **Offline / flaky network** | Boot and core loops tolerate failed fetches; timestamp-based time survives backgrounding. |
| **Security** | No client secrets; purchases verified server-side; never trust client-reported entitlements (see [`07-external-systems.md`](./07-external-systems.md)). |
| **Accessibility** | `alt` text on images, adequate contrast, and the style guide's state/accessibility floor. |
| **Privacy** | No third-party trackers; identity/telemetry go through Jest. |

---

## 4. Testing requirements

OPPS uses a CI/CD pipeline that runs **unit, regression, and (where required) e2e tests**
(tenet T9). Match your test effort to risk.

### 4.1 Unit tests — REQUIRED for non-trivial logic
- Cover pure/gameplay logic: reward math, XP/leveling (`addXP` curve), Moves regen (including
  offline accrual), combat odds derivation, income calculation, purchase-grant logic, data
  validators.
- Write logic to be **testable** — keep pure calculations separable from DOM writes where
  practical, so they can be exercised without a browser.

### 4.2 Regression tests — REQUIRED for data & balance
- Data validation (schemas, unique `id`s, no orphaned references) runs on every data change
  (see [`04-game-data-spec.md`](./04-game-data-spec.md) §4.4) so malformed content can't ship.
- Guard against balance/curve regressions where feasible (e.g. costs monotonic, rewards within
  bounds).
- Guard save-compatibility: a save from the previous version must load without loss.
- **Save migrations require golden-file tests** (a fixture save at version N runs through the
  migration chain and asserts the exact version-CURRENT result; old-save fixtures load without
  loss). This is a **required CI gate** for any save-format change — see
  [`04-game-data-spec.md`](./04-game-data-spec.md) §7 and
  [`03-game-architecture.md`](./03-game-architecture.md) §3.4.

### 4.3 E2E tests — REQUIRED for critical flows
- Critical player flows: boot → play a move → gain XP → level up; buy gear/spot; run a combat;
  and especially the **purchase flow** (begin → verify → grant → complete, including the
  incomplete-purchase recovery path).
- E2E runs in a headless browser in CI for flows the TDD marks critical.

### 4.4 Manual verification (always)
Even with automated tests, before requesting review verify by hand in **both** a plain browser and
(where possible) the Jest surface, and confirm the game still works with your feature disabled or
failing to load.

---

## 5. CI/CD gate

Per [`02-tech-architecture.md`](./02-tech-architecture.md) §9, the pipeline **conditions → tests →
deploys (test → prod)**. Practical gates:

- **Lint** JS; **validate** every `data/*.json` against its schema; **check** assets against
  [`05-asset-spec.md`](./05-asset-spec.md).
- **Run** unit + regression tests on every PR; **run** e2e for changes that warrant it.
- **Block merge to `main`** on a red pipeline.
- **Deploy** through the pipeline to test, then production — **not by hand** (data included).
- Keep it fast and lightweight; it validates and ships source, it does not become a build system
  that violates "runs from source."

---

## 6. Pull-request checklist (paste into the PR)

```md
### OPPS PR Checklist

**Design**
- [ ] TDD written & reviewed (link: ____) — or explicitly N/A (content/bugfix/style)
- [ ] No core tenet (T1–T9) violated

**Architecture** (03-game-architecture.md)
- [ ] New logic is a focused new js/<system>.js (not sprawled across files)
- [ ] Follows the module pattern + action sequence (validate→mutate→feedback→render→save)
- [ ] Persistent state is on G with safe defaults; read defensively
- [ ] No localStorage / JestSDK.data outside state.js
- [ ] Script registered in correct load order; heavy libs lazy-loaded
- [ ] Reuses shared helpers ($, log, toast, rand, addXP, updateHUD, collectIncome)

**Tech** (02-tech-architecture.md)
- [ ] No prohibited dependency/framework/bundler; no client secrets
- [ ] Any new client lib is tiny/lazy/pinned and fails gracefully
- [ ] Wide device reach; modern APIs feature-detected with fallback

**Data** (04-game-data-spec.md)
- [ ] Content in JSON; unique permanent ids; correct schema/types
- [ ] New data file wired into loadGameData() + global + progress denominator
- [ ] Data-in-code counterparts (enemy portrait/threat, monetization) updated in lockstep
- [ ] Deploys via pipeline, not by hand

**Assets** (05-asset-spec.md)
- [ ] Optimized, correctly sized, correct format; named per convention
- [ ] Lazy off-screen; emoji/placeholder fallback; alt text; no .DS_Store

**UI** (`CLAUDE.md` — UI Implementation Contract)
- [ ] Uses design tokens/components only; no new colors/fonts/radii

**External systems** (07-external-systems.md)
- [ ] Every SDK call feature-detected + fallback; core game works without SDK
- [ ] Purchases verified server-side; entitlements never trusted from client

**Quality**
- [ ] Unit/regression tests added & green; e2e for critical flows
- [ ] Verified in plain browser AND (where possible) Jest
- [ ] Core game still boots if this feature fails to load
```

---

## 7. Severity of violations

- **MUST violation** → PR is **not mergeable** until fixed (or the spec is formally amended in the
  same PR with maintainer sign-off).
- **SHOULD violation** → requires written justification in the TDD/PR; a reviewer may still block.
- **MAY** → author's discretion.

The specs are contracts. Keeping them true is part of every engineer's job on OPPS.
