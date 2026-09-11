# OPPS — Engineering Specifications

**Project:** OPPS — Street Empire
**Owner:** Dominion Games
**Platform:** [Jest](https://jest.com) (RCS / iMessage messaging games)
**Status:** Living documents — v1.0

---

## Purpose

This folder is the **source of truth** for how OPPS is built. It exists so that any team
member — human or AI agent — can add features to the game **without breaking the core tenets,
architecture, or platform contracts** that keep OPPS shippable on Jest.

If a change conflicts with anything in these documents, the change is wrong **or** the
document must be formally updated first (see the amendment rule below). Do not silently
diverge.

> These specs are **enforceable contracts**, not suggestions. A pull request that violates a
> `MUST` rule should not be merged. See [`06-technical-requirements.md`](./06-technical-requirements.md)
> for the gate.

---

## The documents

| # | Document | Read this before you… |
|---|---|---|
| 00 | [Game Overview](./01-game-overview.md) | …pitch or scope any feature. Defines platforms, features, and the pillars every change must respect. |
| 01 | [Tech Architecture](./02-tech-architecture.md) | …add a library, framework, build step, or dependency. Defines the allowed stack and what is prohibited. |
| 02 | [Game Architecture](./03-game-architecture.md) | …write or modify any game system (`js/*.js`). Defines the module pattern, state model, and load order. |
| 03 | [Game Data Spec](./04-game-data-spec.md) | …add or change content (jobs, enemies, items, spots, ranks). Defines JSON schemas, loading, deployment. |
| 04 | [Asset Spec](./05-asset-spec.md) | …add art (buttons, screens, portraits, icons). Defines formats, sizes, naming, and optimization rules. |
| 05 | [Technical Requirements](./06-technical-requirements.md) | …start any non-trivial feature. Defines the mandatory Technical Design Document (TDD) process and PR gates. |
| 06 | [External Systems](./07-external-systems.md) | …touch Jest SDK, payments, notifications, crew, hosting, or the server. Defines every external dependency contract. |
| — | [TDD Template](./TDD-TEMPLATE.md) | …every new feature/system. Copy this to author your Technical Design Document. |

Related existing docs:

- [`../../CLAUDE.md`](../../CLAUDE.md) — the context file for AI coding agents, and the home of the **UI Implementation Contract** (Chrome Money design system). **Authoritative for all UI.** These specs never override it. It replaced the deleted `OPPS_UI_Agent_Style_Guide.md` on 2026-09-10. Its visual reference lives in [`../design-handoff/chrome-money/`](../design-handoff/chrome-money/).
- [`../../README.md`](../../README.md) — quick-start, contribution workflow, roadmap.

---

## The Prime Directive

OPPS is a **zero-friction messaging game**. A player taps a link in RCS/iMessage and is
playing in seconds — no install, no store, no account creation. **Every decision in these
specs exists to protect that experience.** When in doubt, optimize for: instant load, tiny
footprint, graceful degradation, and no hard dependency on anything that isn't already
guaranteed by the Jest runtime.

---

## How to use these specs

1. **Before you code:** read the relevant document(s) above. For anything non-trivial, write a
   TDD ([`TDD-TEMPLATE.md`](./TDD-TEMPLATE.md)) and get it reviewed **first**.
2. **While you code:** follow the `MUST` / `MUST NOT` / `SHOULD` rules verbatim. Match existing
   patterns.
3. **Before you open a PR:** run the checklist in [`06-technical-requirements.md`](./06-technical-requirements.md).

### Keyword conventions

These documents use [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119)-style keywords:

- **MUST / MUST NOT** — a hard rule. Violating it breaks the game, the platform contract, or a
  core tenet. PRs that violate a MUST are rejected.
- **SHOULD / SHOULD NOT** — a strong default. Deviating requires a written justification in the
  TDD or PR description.
- **MAY** — genuinely optional.

---

## Amending these specs

The architecture will evolve. When it needs to:

1. Open a PR that changes the relevant spec **in the same PR** (or a preceding one) as the code
   that motivates the change.
2. Call out the amendment explicitly in the PR description.
3. Get sign-off from a project maintainer.

Never let code and spec drift apart. A spec that lies is worse than no spec.
