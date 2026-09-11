# 07 — External Systems

**Status:** v1.0 · Authoritative
**Read before:** touching the Jest SDK, payments, notifications, crew, hosting, the verification
server, or any third-party dependency.

OPPS depends on a small set of **external systems**. This document defines each one, its
**integration contract**, and the rules for using it. The unifying principle: OPPS is enhanced by
these systems but — for everything except hosting — **must remain playable when they're absent**
(tenets T3/T5).

---

## 1. The external systems at a glance

| System | Role | Required in prod? | Core game works without it? |
|---|---|---|---|
| **Jest Platform SDK** | Runtime: identity, save sync, payments, referrals, notifications, loading | Yes (it's the platform) | Yes — dev/fallback uses localStorage; SDK features go inert |
| **Purchase-verification server** (`server/`) | Server-side validation of IAP receipts | Yes (for payments) | Yes — payments simply unavailable without it |
| **Static hosting / CDN** (GitHub Pages) | Serves the static game + JSON data | Yes | N/A — it *is* the delivery |
| **CI/CD pipeline** (GitHub Actions) | Condition, test, deploy code & data | Yes (process) | N/A — build/deploy infra |
| **Three.js** (pinned CDN) | Optional WebGL 3D map | No | Yes — 2D map is the fallback |
| **Google Fonts** | Typography | No (has fallbacks) | Yes — system fallback fonts |

---

## 2. Jest Platform SDK

Loaded in `index.html` from `https://cdn.jest.com/sdk/latest/jestsdk.js` and exposed as the global
`JestSDK`. It is the runtime OPPS ships on.

> **Official docs:** <https://docs.jest.com/sdk> (overview) — every subsystem below links to its
> specific page. When adding or changing any Jest integration, read the relevant doc page first;
> it is the source of truth for method names, arguments, and platform behavior. The tables here
> record how OPPS uses each surface, not a replacement for the docs.

### 2.1 The golden rule
**Every SDK access MUST be feature-detected and have a fallback:**

```js
if (typeof JestSDK !== 'undefined') {
  // platform path
} else {
  // fallback path — game still works
}
```

Never assume `JestSDK` exists. The plain-browser path is a first-class supported environment
(tenets T3/T5, [`02-tech-architecture.md`](./02-tech-architecture.md) §5). Wrap SDK calls in
try/catch — a platform hiccup must not crash the game.

### 2.2 SDK surfaces currently used (the contract)

Each surface links to its Jest doc page. **The game MUST integrate cleanly with each Jest module
it uses** — feature-detected, guarded, and matching the documented API.

| Surface | Jest docs | Call(s) | Used in | Purpose |
|---|---|---|---|---|
| **Player: identity** | [/sdk/player](https://docs.jest.com/sdk/player) | `JestSDK.getPlayer().playerId`, `JestSDK.getEntryPayload()` | `main.js`, `crew.js` | Stable player id; read invite payload on entry. |
| **Player: data / save** | [/sdk/player](https://docs.jest.com/sdk/player) | `JestSDK.data.set('g', G)`, `JestSDK.data.getAll()` (also available: `.get(key)`, `.delete(key)`, `.flush()`) | `state.js` **only** | **Returning-player state** behind `GameState` (tenet T6). 1 MB/app cap; JSON-serializable; snapshot reads. |
| **Entry payload** | [/sdk/entry-payload](https://docs.jest.com/sdk) | `JestSDK.getEntryPayload()` | `crew.js` | Read incoming data on entry (e.g. `invitedBy` for crew). |
| **Referrals / crew** | [/sdk/referrals](https://docs.jest.com/sdk) | `JestSDK.referrals.shareReferralLink({...})`, `JestSDK.referrals.listReferrals({ reference })` | `crew.js` | Invite links + crew (referral) counts. |
| **Notifications** | [/sdk/notifications](https://docs.jest.com/sdk) | `JestSDK.notifications.scheduleNotification({...})`, `unscheduleNotification({ identifier })` | `notifications.js` | Scheduled re-engagement / energy / income pushes. |
| **Payments** | [/sdk/payments](https://docs.jest.com/sdk) | `JestSDK.payments.getProducts()`, `beginPurchase({ productSku })`, `getIncompletePurchases()`, `completePurchase({ purchaseToken })` | `payments.js` | IAP for Gems, incl. recovery + completion. |
| **Loading screen** | [/sdk/loading-screen](https://docs.jest.com/sdk) | `JestSDK.setLoadingProgress(0..100)` | `main.js` | Drive/dismiss the platform loading overlay (100 dismisses). |
| **Init / lifecycle** | [/sdk](https://docs.jest.com/sdk) | `JestSDK.init()` | `main.js` | Boot handshake. |

**Rules:**
- **`JestSDK.data.*` is confined to `state.js`.** All other code persists via `GameState`.
- Keep each subsystem's SDK usage inside its module (`Crew`, `Notify`, `Payments`) with a clean
  no-op fallback, exactly as they do today.
- The SDK URL uses `latest` because **Jest** controls that surface; do not pin it yourself, and do
  not add other `latest` CDN dependencies (see [`02-tech-architecture.md`](./02-tech-architecture.md) §3.2).
- Adding a **new SDK surface** requires a TDD documenting the fallback behavior.

### 2.2a Jest modules available but not yet integrated

The SDK (<https://docs.jest.com/sdk>) offers more than OPPS uses today. These are **approved
directions** — integrate them via a TDD when the feature calls for it, always feature-detected
with a fallback:

| Module | Jest docs | Opportunity for OPPS |
|---|---|---|
| **App lifecycle** (visibility/exit) | [/sdk](https://docs.jest.com/sdk) | Save `G` on background/exit so returning-player state is never lost (see [`03-game-architecture.md`](./03-game-architecture.md) §3.2). Higher-fidelity `lastSeen` for offline energy regen. |
| **Player data `flush()`** | [/sdk/player](https://docs.jest.com/sdk/player) | Await platform acknowledgment after critical saves (purchases, checkpoints). |
| **Platform login** (guest register/customize) | [/sdk](https://docs.jest.com/sdk) | Let players claim/customize an identity for social features. |
| **Social** (profiles, avatars, bot) | [/sdk](https://docs.jest.com/sdk) | Richer crew/social layer — avatars on the crew screen, profile display. |
| **Subscriptions** (recurring, trials, offers) | [/sdk](https://docs.jest.com/sdk) | A recurring monetization option alongside one-off Gem packs. Server-verify like payments (§3). |
| **App redirects** (multi-app navigation) | [/sdk](https://docs.jest.com/sdk) | Cross-promotion / multi-app flows if Dominion ships more Jest titles. |

> Some deep-link doc paths above resolve through the SDK index (<https://docs.jest.com/sdk>);
> follow the module name from there to its page. Confirm the exact URL when you write the TDD.

### 2.3 Loading progress contract
Boot reports progress `0→80%` across data loads, `90%` after subsystem init, `100%` after initial
render (which dismisses the overlay). Keep progress **monotonic** and **always reach 100**, even on
error paths, so players never get stuck on the loader.

---

## 3. Payments & the verification server

Monetization is **Gems** (hard currency) bought through Jest IAP, then verified **server-side**
before granting. This is a **security boundary** — treat it as one.

### 3.1 The flow (do not shortcut it)
1. Client `Payments.buy(sku)` → `JestSDK.payments.beginPurchase({ productSku })`.
2. On success, client gets `purchaseToken` + `purchaseSigned` (a signed JWT).
3. Client POSTs `purchaseSigned` to the verification server (`VERIFY_URL`).
4. **Server** verifies the JWT signature with the Jest shared secret, checks audience
   (`JEST_GAME_ID`), rejects tokens older than 5 minutes, and maps `productSku → gems`.
5. Only on a valid response does the client grant Gems and call
   `JestSDK.payments.completePurchase({ purchaseToken })`.
6. On boot, `Payments._recoverIncomplete()` re-grants/completes any interrupted purchases.

### 3.2 Server contract (`server/index.js`)
- **Stack:** Node + Express + `jsonwebtoken` + `cors` + `dotenv`. Endpoint: `POST
  /api/verify-purchase` (+ `GET /health`).
- **Config (env / `server/.env`, git-ignored):** `JEST_SHARED_SECRET` (base64), `JEST_GAME_ID`,
  `PORT`. Never commit these; `server/.env.example` documents them.
- **Response:** `{ valid, sku, playerId, gemAmount }` or `{ valid:false, error }`.
- **SKU→gems map** (`SKU_GEMS`) is the **authoritative grant source** and MUST stay in sync with
  the client's `GEM_PACKS` (`js/payments.js`) and the Jest Developer Console product catalog.

### 3.3 Security rules (MUST)
- **Never trust the client** for entitlements. The server's verification is the source of truth;
  the client only reflects what the server validated.
- **The shared secret lives only on the server.** No secret in `js/` or the repo (tenet:
  [`02-tech-architecture.md`](./02-tech-architecture.md) §4/§6).
- **Verify signature, audience, and freshness** on every receipt (as the current server does).
- **`VERIFY_URL`** in `js/payments.js` MUST be updated from `http://localhost:3000/...` to the
  deployed HTTPS server URL before shipping payments (release-checklist item). Production traffic
  MUST be HTTPS.
- Keep the SKU→gems mapping **server-authoritative**; the client price/label is display-only
  (official price comes from `getProducts()` when available, else the mock `mockPrice`).

### 3.4 JSON-first note
Gem packs/spends are currently hardcoded in `js/payments.js` and mirrored in the server. Per
[`04-game-data-spec.md`](./04-game-data-spec.md) §6 this monetization config SHOULD migrate to
JSON, with the **server remaining the authoritative grant source** driven from the same shared
config. Until then, changes update client + server + Jest console **in lockstep**.

### 3.5 Deployment
The verification server is a separate deployable (not part of the static site). It MUST be
deployed (HTTPS, env configured) and reachable at `VERIFY_URL` for payments to work. Document its
hosting in the payments TDD. Keep it **stateless and minimal** unless a TDD justifies more.

---

## 4. Hosting, CDN & data delivery

- **Game delivery:** the game is 100% static (`index.html`, `js/`, `css/`, `assets/`) served from
  static hosting / CDN (GitHub Pages today).
- **Data delivery:** `data/*.json` is served from the CDN and fetched by clients at boot; it can be
  **deployed independently** of the game build (tenet T4, [`04-game-data-spec.md`](./04-game-data-spec.md) §5).
- **Freshness:** ensure updated data actually reaches clients (versioned paths and/or correct cache
  headers). Don't let aggressive caching pin players to stale content; define the mechanism in the
  deployment TDD.
- **HTTPS everywhere** — the game, the data CDN, and the verification server.

---

## 5. CI/CD pipeline (GitHub)

The pipeline is itself an external system (build/deploy infra). Full definition:
[`02-tech-architecture.md`](./02-tech-architecture.md) §9 and
[`06-technical-requirements.md`](./06-technical-requirements.md) §5. In short: **condition →
test (unit/regression/e2e) → deploy(test) → deploy(prod)**, preferably GitHub Actions, gating
merges to `main`, and validating data so malformed JSON can never reach a client.

---

## 6. Third-party client libraries

### 6.1 Three.js (3D map)
- **Loaded:** lazily in `js/map3d.js` from a pinned CDN URL (`three@0.160.0`), only when the
  player opens the 3D view.
- **Failure handling:** `Map3D` shows a graceful in-panel error and the game continues; the 2D map
  (`js/map.js`) is the always-available fallback. WebGL may be unavailable — never require it.
- **Rule:** keep it off the critical path; keep the version pinned. Revisit CDN robustness
  (vendoring vs CDN) in a TDD if 3D becomes core.

### 6.2 Google Fonts
- **Loaded:** via `<link>` in `index.html` (families fixed by the UI Implementation Contract in `CLAUDE.md`, tenet T7).
- **Failure handling:** always specify real fallback stacks so text renders if fonts fail. Do not
  add new font *families*.

### 6.3 Adding any new third-party client dependency
Governed by [`02-tech-architecture.md`](./02-tech-architecture.md) §2–§4: default is **no**; if
added it must be tiny/essential or lazy-off-critical-path, pinned, self-contained, gracefully
degrading, and justified in a TDD. No trackers/ads/analytics on the client.

---

## 7. Integration checklist (for any external-systems change)

- [ ] Every SDK/API call is `typeof JestSDK !== 'undefined'`-guarded and try/caught, with a working
      fallback; core game still boots without it.
- [ ] `JestSDK.data.*` used only in `state.js`; everything else via `GameState`.
- [ ] Loading progress stays monotonic and reaches 100 on all paths.
- [ ] Purchases verified server-side; entitlements never trusted from the client; secrets stay on
      the server; production is HTTPS.
- [ ] `VERIFY_URL` points at the deployed server (not localhost) before shipping payments.
- [ ] SKU→gems mapping in sync across client, server, and Jest console (until migrated to shared
      JSON).
- [ ] New third-party lib is pinned, lazy/off-critical-path, self-contained, and degrades
      gracefully.
- [ ] Data/freshness/caching behavior defined; deploys via the pipeline.
- [ ] Change captured in a reviewed TDD.
