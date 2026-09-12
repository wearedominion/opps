# Technical Design Document — Server-Authoritative Purchase Grants (DOM-80)

| | |
|---|---|
| **Author** | Claude Code (session for jake@wearedominion.com) |
| **Date** | 2026-09-12 |
| **Status** | In Review |
| **Reviewers** | Jake |
| **Related PRs** | (implementation PR to follow approval) |
| **Type** | Monetization/security |

---

## 1. Summary

Move the SKU → grant decision from the client to the verification server. Today
`server/index.js` verifies the receipt signature and the **client** looks up what the purchase
grants in its own copy of `data/monetization.json` — so a client that edits that file in flight,
or skips the verify call, decides its own entitlements. After this change the verify endpoint
returns the grant, the client applies exactly what it is told, and the client catalogue is
display copy only. This is the last open item split out of DOM-65.

## 2. Problem & goals

- **Problem:** `07-external-systems.md` §3.3 requires "never trust the client for entitlements",
  but `Payments._grantAndComplete` applies `IAP_PRODUCTS.find(...).effect` — a client-side
  lookup. The server's only contribution is `{valid: true}`. Worse, the server's grant map
  (`SKU_GEMS`) still lists the four retired `gems_*` SKUs, so it rejects every **live** SKU
  (`boost_moves`, `boost_stamina`, `full_heal`) as `unknown sku` — found during DOM-93.
- **Goals:**
  1. The server decides what every SKU grants; the verify response carries the grant.
  2. Client and server read the **same** `data/monetization.json`, so they cannot drift.
  3. The client catalogue becomes display-only (name, desc, price, badge).
  4. The stale `gems_*` map is gone; live SKUs verify.
  5. `VERIFY_URL` stops being a hardcoded localhost literal.
- **Non-goals:**
  - Server-owned saves or server-side balance state. OPPS deliberately has no authoritative
    game server for saves (`07` §5); the grant is still *applied* to the client-held save.
  - Premium/limited-supply gear SKUs (DOM-92) — but the grant schema must not preclude them.
  - Server hosting/deployment itself (tracked as a release-checklist item + open question).

**Honest trust boundary** (so nobody over-reads "server-authoritative"): with a client-held
save, a memory-editing client can always credit itself directly — that is the standing limit of
the no-save-server architecture, unchanged by this TDD. What this change guarantees is narrower
and still worth having: **the purchase pipeline cannot be repurposed** — editing the client
catalogue, replaying, forging, or re-targeting a receipt produces either a refusal or exactly
the grant the server's catalogue says, never a client-chosen grant.

## 3. Player experience

No visible change. Purchases behave exactly as shipped in DOM-76/DOM-93: same offer sheet, same
store cards, same Hospital button, same toasts. The only observable differences are negative
paths: a SKU the server does not recognize now refuses cleanly ("Purchase verification failed")
instead of being granted client-side.

## 4. Tenet compliance

| Tenet | How this design complies |
|---|---|
| T1 Zero friction | No new UI, no new steps in the buy flow. |
| T2 Instant/tiny/wide-device | One JSON field added to a fetch that already happens; no payload growth on boot. |
| T3 SDK feature-detected + fallback | Unchanged: `typeof JestSDK` guards stay; no-SDK browsers refuse purchases as today. |
| T4 JSON-first, data-driven | Grant truth stays in `data/monetization.json`; server reads the same file. `verifyUrl` moves into `data/platform.json`. |
| T5 Graceful degradation | Missing/failed verify → clean refusal, no grant, purchase not completed (platform will re-deliver via `_recoverIncomplete`). Missing `verifyUrl` config → localhost default. |
| T6 Single persistence seam | Grants still land through `credit()` → ledger → `GameState.save()`. |
| T7 Style guide | No UI change. |
| T8 Fiction stays fiction | N/A. |
| T9 Ships through CI/CD | Tests extend `tests/migration.test.js`; server logic gets its own node test. |

## 5. Architecture & implementation

**Changed files:** `server/index.js`, `js/payments.js`, `data/platform.json`,
`tests/migration.test.js` (+ new `tests/verify-server.test.js`), `docs/specs/07-external-systems.md`
(§3 refresh: gems → current SKUs, response shape).

### Server (`server/index.js`)

- Boot: load `../data/monetization.json` (same repo checkout the static site deploys from).
  Build `SKU_GRANTS[sku] = effect` from each product's `effect` field. Fail fast at boot if the
  file is missing or malformed — a verify server with no catalogue is worse than none.
- `POST /api/verify-purchase` keeps the existing checks verbatim (HS256 signature via
  `JEST_SHARED_SECRET`, audience via `JEST_GAME_ID`, 5-minute freshness) and replaces the
  `SKU_GEMS` lookup with `SKU_GRANTS`:
  - unknown SKU → `400 {valid: false, error: 'unknown sku'}` (same as today, but now only for
    SKUs genuinely absent from the catalogue);
  - known SKU → `200 {valid: true, sku, playerId, grant: {type, pool, amount?}}` — `grant` is
    the product's `effect` object passed through untouched.
- `GET /health` unchanged.

### Client (`js/payments.js`)

- `_grantAndComplete` applies **`data.grant`** from the verify response. The local catalogue
  entry is used only for display strings (name for the log/toast). The existing checks stay:
  `data.valid`, `data.sku === sku`, and now `data.grant` must be a well-formed effect (type it
  recognizes + pool that exists) — anything else is a refusal, not a fallback to local data.
- `_applyEffect(product)` becomes `_applyGrant(grant, sku)`: same body — hospital discharge on
  `pool === 'health'` while hospitalized (DOM-93 semantics preserved verbatim), then
  `credit(pool, amount|max-current, REASON.IAP_GRANT, {ref: {sku}})`.
- The pre-charge "already full" guard in `buy()` (DOM-93) stays as-is: it reads the local
  catalogue, which is fine — it is a UX courtesy, not an entitlement decision; the grant that
  lands still comes from the server.
- `VERIFY_URL` constant → `Payments._verifyUrl()`, read from `data/platform.json`
  (`payments.verifyUrl`), defaulting to the current localhost value when absent (T5). Flipping
  production to the deployed HTTPS server becomes a data deploy, not a client build.

### Load order / boot

No changes — `payments.js` position and `Payments.init()` are untouched.

## 6. State & persistence

- **New `G` fields:** none.
- **Save/load impact:** none. Grants land as ledger credits exactly as today.

## 7. Data & content

- `data/monetization.json`: **unchanged schema**; it simply gains a second reader (the server).
  This forecloses drift by construction — there is no second copy to update.
- `data/platform.json`: new optional block `"payments": {"verifyUrl": "https://…"}`. Defaults
  in code keep old cached copies working (additive, T5).
- **Deployment coupling:** the server must be redeployed when `monetization.json` changes SKUs
  or effects. Called out in §14; acceptable because SKU changes already require a Jest Developer
  Console change in lockstep (`04` §6), so they are never a hot data-only tweak.

## 8. Assets

None.

## 9. External systems

- **Jest SDK surfaces:** `payments.beginPurchase / completePurchase / getIncompletePurchases`
  (unchanged). Receipt (`purchaseSigned`) remains the only thing sent to the server.
- **Player identity (the ticket's prerequisite):** answered YES with two independent supports:
  1. The platform contract (`07` §3.2) and the existing server both attest the receipt JWT
     carries the player id in `sub` — the current code already returns `playerId: payload.sub`.
  2. Should a real receipt ever lack `sub`, the SDK exposes `getPlayerSigned()` — a separately
     signed player-identity token verifiable with the same shared secret. Not needed now
     (nothing server-side is keyed per player while saves are client-held), so we do not add it
     to the request; recorded here so the next server feature knows the channel exists.
  The `playerId` in the response is kept for client-side audit context and future server-side
  idempotency, not used for granting (there is no server-side account state to grant into).
- **Sandbox limitation (found in DOM-93/DOM-80 verification):** the CDN SDK in a plain browser
  returns placeholder tokens (`purchaseSigned: "JWS"`), which can never pass real verification.
  Local dev therefore exercises the endpoint with **test-minted JWTs** (see §13); browser
  smoke-tests stub `fetch` to the verify URL, as DOM-93 did.

## 10. Security & privacy

- **Trust boundary:** the server decides grant contents from its own catalogue read; the client
  never sends an effect, only a SKU-bearing receipt. Signature/audience/freshness checks are
  unchanged. See §2 for the honest statement of what this does and does not defend.
- **Secrets:** `JEST_SHARED_SECRET`/`JEST_GAME_ID` stay server-side env; no change.
- **Privacy:** no new data collected; `playerId` already flowed through the response.

## 11. Compatibility & migration

- **Old saves:** unaffected.
- **Old clients vs new server:** an old client ignores the extra `grant` field and keeps
  applying its local effect — no breakage during rollout, closed as old clients age out.
  (Old clients were *already* client-granting; the window does not get worse.)
- **New client vs old server:** new client refuses to grant without `data.grant` — so the
  server deploys **first**. One-way ordering, called out in §14.
- **Rollback:** revert the client PR; the server's extra response field is harmless to the old
  client. Server rollback alone would break new clients (no `grant`) — roll back both or
  client-first.

## 12. Performance

Nothing on the boot path changes. The verify round-trip gains ~60 bytes.

## 13. Testing plan

- **Server unit (`tests/verify-server.test.js`, plain node script like the existing suite):**
  extract the endpoint handler (export it or run the module with a stubbed express) and drive it
  with JWTs minted via `server/node_modules/jsonwebtoken` and a test secret:
  - each SKU in `data/monetization.json` verifies and returns its exact `effect` as `grant`;
  - unknown SKU / bad signature / wrong audience / stale `iat` → `valid: false`, no grant;
  - catalogue file missing at boot → process refuses to start.
- **Client (`tests/migration.test.js`, extending the DOM-93 `buy()` harness):**
  - the client applies **the server's grant**, not the local effect: stub verify to return a
    grant that deliberately disagrees with the local catalogue → the server's version lands;
  - missing/malformed `grant` in a `valid: true` response → refusal, nothing credited,
    purchase still completed? **No** — completion only after a grant lands (see open Q2);
  - DOM-93 pins re-run unchanged (hospitalized full heal, full-pool refusals).
- **Manual:** browser pass with stubbed fetch (DOM-93 recipe) confirming the three SKUs still
  buy correctly end-to-end; `node server/index.js` + `curl` happy-path against a locally minted
  token with a dev secret.

## 14. Rollout

1. Land code (server + client + data) in one PR — the repo deploys as a unit today.
2. When the server is actually deployed (open Q1): deploy server → set
   `payments.verifyUrl` in `data/platform.json` → release checklist confirms HTTPS.
3. Keep SKUs in lockstep with the Jest Developer Console (unchanged process, `04` §6).

## 15. Alternatives considered

- **Server reads its own private SKU map** (status quo shape, updated values): rejected — two
  copies drift, which is exactly how the map fossilized on `gems_*`.
- **Client sends the effect it expects, server validates it:** rejected — the client still
  authors the grant; validation-of-client-authored entitlements is the anti-pattern `07` §3.3
  names.
- **Add `getPlayerSigned()` to the verify request now:** rejected as speculative — no
  server-side per-player state exists to protect; the receipt's `sub` already identifies the
  buyer for audit. Recorded in §9 for when a server-owned save arrives.
- **Hard currency reintroduction via this change:** out of scope; the grant schema (`effect`
  objects) already covers it if it returns.

## 16. Open questions

1. **Hosting:** deliberately deferred (Jake, 2026-09-12). Where the verify server deploys is
   decided later; until then `verifyUrl` stays unset in `platform.json`, dev defaults to
   localhost, and payments cannot ship to production — the release checklist already carries
   the VERIFY_URL item (07 §3.5's "document hosting here" is satisfied by this deferral note
   plus a follow-up edit when the host is chosen).
2. **Completion on refused grant — RESOLVED (Jake, 2026-09-12): leave incomplete.** If
   verification succeeds but the response carries no usable grant (server/client version skew),
   the client does NOT `completePurchase`; `_recoverIncomplete` retries on a later boot, so the
   grant eventually lands after an update and a payment is never eaten. Matches the existing
   interrupted-purchase path.
