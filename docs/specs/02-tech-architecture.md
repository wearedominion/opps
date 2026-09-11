# 02 — Tech Architecture

**Status:** v1.0 · Authoritative
**Read before:** adding any library, framework, build tool, or dependency.

This document defines the **allowed technology stack** and, critically, what is **valid to add**
and what is **prohibited**. The goal is a game that stays tiny, loads instantly on a messaging
surface, and has no hidden build/runtime dependencies.

---

## 1. The current stack (authoritative)

| Layer | Technology | Notes |
|---|---|---|
| **Language** | Vanilla JavaScript (ES2017+) | No transpiler, no TypeScript in the shipped game. |
| **Markup** | Single `index.html` | All tabs/screens are sections toggled by `showTab()`. |
| **Styling** | CSS3, one file: `css/styles.css` | Custom properties (design tokens). No preprocessor. |
| **Data** | Static JSON in `data/`, fetched at boot | See [`04-game-data-spec.md`](./04-game-data-spec.md). |
| **Persistence** | `localStorage` (dev) / Jest SDK data store (prod) | Behind the `GameState` seam. |
| **Fonts** | Google Fonts (`<link>`) | Loaded in `index.html`. |
| **3D (optional)** | Three.js r160, lazy-loaded from CDN | 3D map only; never on the critical path. |
| **Audio** | Web Audio API (synthesized), no files | `js/sound.js`. |
| **Platform SDK** | Jest SDK ([docs](https://docs.jest.com/sdk)), loaded from `https://cdn.jest.com/sdk/latest/jestsdk.js` | Feature-detected everywhere. Full integration contract in [`07-external-systems.md`](./07-external-systems.md). |
| **Backend** | Node.js + Express (`server/`) | **Only** for purchase verification (JWT). Not a game server. |
| **Hosting** | Static hosting / CDN (GitHub Pages) | Game is 100% static assets. |
| **Version control** | Git / GitHub, feature-branch + PR workflow | See [`../../README.md`](../../README.md). |

### 1.1 Non-negotiable properties

- **The game runs from source in the browser.** `index.html` + `js/*.js` + `css/styles.css`
  execute exactly as authored — **no framework runtime, no module bundler, and no
  transpile/compile step is required to run the game.** (`server/` has its own `npm` deps; that is
  separate.)
- **A CI/CD pipeline MAY condition and deploy those source files** — validating JSON, running
  tests, and optionally minifying — but it **MUST NOT** introduce a framework runtime or make a
  bundler *required* to run the source during development. Conditioning is a deployment
  optimization, not an architecture change. See §9 and
  [`06-technical-requirements.md`](./06-technical-requirements.md).
- **Wide device reach + tight memory budget.** Code targets the broadest set of iOS/Android
  devices possible and avoids heavy memory use (tenet T2). Prefer simple, well-supported Web
  APIs over cutting-edge ones without fallbacks.
- **Everything on the critical path is either first-party or already-guaranteed by Jest.**

---

## 2. Adding to the stack — the decision rule

Before adding **any** dependency, library, tool, or external call, answer these in your TDD
([`TDD-TEMPLATE.md`](./TDD-TEMPLATE.md)):

1. **Can it be done with vanilla JS / CSS / Web APIs already available?** If yes, do that. The
   default answer to "should we add a dependency?" is **no**.
2. **Is it on the critical boot path?** If yes, the bar is extremely high — it must be tiny,
   first-party or CDN-pinned, and cannot block first play. Prefer **not** adding it.
3. **Does it degrade gracefully if it fails to load?** If a failure to load breaks the core game,
   it violates tenet T5 and is **prohibited** on the critical path.
4. **Does it require a build step, transpile, or bundler?** If yes, it is **prohibited** for the
   game (allowed only inside `server/`).
5. **Does it pull in a large tree of transitive deps?** If yes, reconsider.

If you cannot answer all five in favor of adding it, don't.

---

## 3. What is VALID to add

### 3.1 Game code (client)
- ✅ **New vanilla-JS system files** in `js/`, following the module pattern and load-order rules
  in [`03-game-architecture.md`](./03-game-architecture.md).
- ✅ **New JSON data files** in `data/` per [`04-game-data-spec.md`](./04-game-data-spec.md).
- ✅ **New CSS** appended to `css/styles.css` using the design tokens in
  [`CLAUDE.md` — UI Implementation Contract](../../CLAUDE.md).
- ✅ **Standard Web Platform APIs** (Canvas, Web Audio, `fetch`, `localStorage`,
  `IntersectionObserver`, `requestAnimationFrame`, Pointer Events, etc.) — provided they are
  feature-detected and degrade gracefully.
- ✅ **Additional Google Fonts weights** *already permitted by the UI Implementation Contract* (do not add new
  font families).

### 3.2 Third-party libraries (client) — narrow and conditional
A third-party client library MAY be added **only if all** of these hold:

- It is **lazy-loaded off the critical path** (like Three.js in `js/map3d.js`), OR it is
  demonstrably tiny (< ~15 KB gzipped) and essential.
- **For 3D / rich graphics specifically:** use a **widely supported, broadly compatible**
  renderer (WebGL / OpenGL-class, e.g. Three.js). Anything that narrows device reach (WebGPU-only,
  experimental extensions) is **not** acceptable on its own — it MUST fall back to a supported
  path or to the 2D view. Rich graphics never override tenet T2 (wide device reach, low memory).
- It is loaded from a **pinned, versioned CDN URL** (never `latest` for anything except the Jest
  SDK, which Jest controls) — e.g. `three@0.160.0`, not `three`.
- Its failure to load **cannot break the core game** — the feature that uses it must catch load
  errors and show a graceful fallback (see `Map3D._showErr` for the pattern).
- It is a **single self-contained file** (UMD/global build), not an npm module tree requiring a
  bundler.
- It is justified in a reviewed TDD.

> **CDN pinning note:** the existing 3D map loads Three from `unpkg.com`. When adding or
> revisiting CDN dependencies, prefer a stable, pinned URL and record the exact version. If
> supply-chain robustness becomes a requirement, vendoring the file into the repo is an
> acceptable alternative — decide this in the TDD.

### 3.3 Server code
- ✅ New endpoints in `server/` that support platform contracts (e.g. purchase verification,
  future server-authoritative checks). `server/` MAY use ordinary npm dependencies (Express,
  jsonwebtoken, etc.) because it is a normal Node service, not shipped to the client.
- The server **MUST remain stateless and minimal** unless a TDD justifies otherwise. It is not a
  general game backend today (see [`07-external-systems.md`](./07-external-systems.md)).

---

## 4. What is PROHIBITED (without a maintainer-approved TDD amending this doc)

- ❌ **Front-end frameworks in production** — React, Vue, Svelte, Angular, etc. *(Note: some code
  in `js/map.js` / `js/map3d.js` was **ported from** React into vanilla JS. The React origin is
  historical; there is no React runtime in the game and none may be added.)*
- ❌ **A *required* bundler / framework build to run the game** — Webpack, Vite, Rollup, esbuild,
  Parcel, Babel, or a TypeScript compile step that the game *cannot run without*. The game must
  execute from source. (A CI/CD step that optionally **minifies** the already-working source for
  deployment is allowed — see §9 — but development and debugging never depend on it.)
- ❌ **A package.json / node_modules at the repo root for the game.** (The only `package.json`
  lives in `server/`.)
- ❌ **CSS frameworks / preprocessors** — Tailwind, Bootstrap, Sass/LESS. All styling is
  hand-authored CSS using the design tokens.
- ❌ **jQuery or DOM abstraction libraries.** Use the tiny `$` helper (`document.getElementById`)
  in `js/ui.js` and standard DOM APIs.
- ❌ **Native wrappers** — Cordova, Capacitor, React Native, Electron. OPPS is a web game on Jest;
  app-store packaging is explicitly out of scope (see [`01-game-overview.md`](./01-game-overview.md) §3).
- ❌ **Analytics/ads/tracking SDKs** on the client without an approved TDD and a privacy review.
  The Jest platform governs identity and telemetry; do not add third-party trackers.
- ❌ **Blocking third-party scripts on the critical boot path.**
- ❌ **Client-side secrets.** No API keys, shared secrets, or private tokens in `js/` or the repo.
  Secrets live in the server's `.env` (git-ignored). See §6.
- ❌ **`localStorage` / `JestSDK.data` calls outside `js/state.js`.** Persistence goes through
  `GameState` (tenet T6).

---

## 5. Environments & runtime detection

The game runs in two environments and **must behave correctly in both**:

| Environment | Detected by | Behavior |
|---|---|---|
| **Jest (production)** | `typeof JestSDK !== 'undefined'` | Uses SDK for save, identity, payments, referrals, notifications, loading progress. |
| **Plain browser (dev/fallback)** | SDK undefined | Uses `localStorage`; SDK-gated features are inert (toast "requires the Jest platform" where user-initiated). Core game fully playable. |

**Rule:** any code touching the SDK **MUST** be guarded with `typeof JestSDK !== 'undefined'` and
**MUST** provide a fallback path. Never assume the SDK exists. See
[`07-external-systems.md`](./07-external-systems.md) for the full SDK contract.

---

## 6. Configuration & secrets

- **Client:** no secrets, ever. Any value the client needs is either public or provided at
  runtime by the Jest SDK (player id, entry payload, product catalog).
- **Server:** configuration via environment variables loaded from `server/.env` (git-ignored;
  see `.gitignore` and `server/.env.example`). Required vars today: `JEST_SHARED_SECRET`
  (base64), `JEST_GAME_ID`, `PORT`.
- **The client's `VERIFY_URL`** in `js/payments.js` points at the deployed server. It is **not**
  a secret, but it **MUST** be updated from `http://localhost:3000/...` to the production URL
  before shipping payments. Track this in the release checklist.

---

## 7. Local development

The game fetches JSON, so it needs an HTTP server (opening `index.html` via `file://` breaks
`fetch`). Any static server works:

```bash
npx serve .
# or
python3 -m http.server 8080
```

The verification server (only needed to test the payments path) runs separately:

```bash
cd server
cp .env.example .env   # fill in Jest Developer Console values
npm install
npm run dev            # node --watch index.js
```

---

## 8. Performance budget (targets, enforce in review)

These are working targets to protect tenets T1/T2. Justify any regression in your TDD.

- **Critical JS (all `js/*.js` except `map3d.js`)**: keep lean; no heavy libs. `map3d.js` + Three
  are the only large payloads and are **lazy-loaded on demand only**.
- **First interaction**: the game should reach a playable state without waiting on the 3D map,
  sound, or any optional CDN library.
- **Data files**: small JSON (current files are < 2 KB each). Keep content files modest; split if
  they grow large (see [`04-game-data-spec.md`](./04-game-data-spec.md)).
- **Images**: optimized and correctly sized per [`05-asset-spec.md`](./05-asset-spec.md); prefer
  `.webp`; always `loading="lazy"` for off-screen art.

---

## 9. CI/CD pipeline (required)

OPPS ships through a **CI/CD pipeline**, preferably built on **GitHub (Actions)**. Two artifacts
flow through it — the **game build** (static site) and **game data** (JSON) — and they can be
deployed independently (data can ship without a code release; see tenet T4 and
[`04-game-data-spec.md`](./04-game-data-spec.md) §5).

**Pipeline stages (minimum):**

1. **Condition** — validate and normalize inputs: lint JS, validate every `data/*.json` against
   its schema ([`04-game-data-spec.md`](./04-game-data-spec.md)), verify assets meet
   [`05-asset-spec.md`](./05-asset-spec.md), optionally minify for production.
2. **Test** — run **unit tests**, **regression tests**, and, where the change warrants it,
   **e2e tests**. A red pipeline blocks the deploy. See
   [`06-technical-requirements.md`](./06-technical-requirements.md) §4.
3. **Deploy → test** — publish to a **test/staging** environment for verification.
4. **Deploy → production** — promote to production (static hosting / CDN, e.g. GitHub Pages) on
   approval.

**Rules:**

- Merges to `main` **SHOULD** be gated on a green pipeline.
- Production deploys **SHOULD** go through the pipeline, not by hand.
- Data-only changes go through the **condition + test (validation)** stages before promotion, so a
  malformed JSON file can never reach clients.
- Keep the pipeline lightweight and fast; it must not become a heavy build system that violates
  the "runs from source" principle (§1.1). Its job is validation, testing, and deployment — not
  transforming the architecture.
- The pipeline **SHOULD stamp asset versions for cache-busting** on deploy (see §10).

---

## 10. Release propagation & cache-busting (required)

Getting new code and data onto every player's device reliably is a first-class concern (it is the
deployment-side twin of save migration in
[`04-game-data-spec.md`](./04-game-data-spec.md) §7). The failure mode: a returning player runs
**stale cached JS/CSS/JSON** and silently diverges from everyone else.

### 10.1 How caching actually works (the model to design against)
There are **two independent cache layers**: the **CDN edge** (updated when you deploy) and the
**user's browser cache** (updated only when *its* copy is considered stale). A browser does **not**
learn a new file exists just because the CDN has one — it serves its local copy, without even
contacting the CDN, until the copy's cache lifetime (from the `Cache-Control`/`Expires`/heuristic
rules it saw at download time) expires. So "new files automatically replace old ones" is **not**
reliable and MUST NOT be assumed.

### 10.2 The rule: content-addressed URLs + always-revalidated HTML
- **A URL's content must never change; when content changes, the URL changes.** Bust caches with
  **fingerprinted filenames** (`main.<hash>.js`) or **query-string versions**
  (`js/main.js?v=<build>`). Query-string versioning is preferred here because it fits the
  "runs from source" rule (§1.1) with no filename churn.
- **Version-stamped assets MAY be cached immutably** (`Cache-Control: public, max-age=31536000,
  immutable`) since a change produces a new URL.
- **The HTML entry point (`index.html`) MUST NOT be long-cached.** Serve it with `no-cache` /
  must-revalidate so the browser always re-checks it and receives the current asset URLs. If the
  HTML is stale, nothing else matters — the browser never sees the new asset URLs.
- **The CI pipeline stamps the version** (git SHA / build number) into the asset URLs at deploy
  time (§9). This is a conditioning step, not a bundler.

### 10.3 Game data (JSON) freshness
Data deploys independently of code (tenet T4), so it needs its **own** busting: fetch `data/*.json`
with a version/cache-bust parameter or from versioned paths, so a content update actually reaches
clients instead of sitting behind a stale cache. Define the exact mechanism in the deployment TDD;
see [`04-game-data-spec.md`](./04-game-data-spec.md) §5.

### 10.4 Environment gotchas (know these)
- **GitHub Pages does not allow custom cache headers** (it serves a fixed short cache and ignores
  header config). On Pages, **query-string/fingerprint busting is the only reliable lever** — you
  cannot fix propagation with headers. If precise cache control becomes necessary, move to a CDN
  that allows header configuration (decide in a TDD).
- **The Jest webview may cache the app shell itself.** How the platform propagates an updated game
  to an already-open webview is a **Jest-platform** question — confirm against the Jest docs
  (<https://docs.jest.com/sdk>) whether there is a platform version/refresh mechanism, since it
  sits above your own busting.
- **Stale clients always exist for some window** (offline users, webview caches, multi-device).
  Cache-busting shrinks that window but never closes it — which is exactly why the save policy
  keeps the **"save from the future" guard** ([`04-game-data-spec.md`](./04-game-data-spec.md)
  §7.3). Ship code that understands new data **before** the data that needs it.
