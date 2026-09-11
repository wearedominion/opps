# 08 — Economy Schema

**Status:** v1.0 · Authoritative for shapes · Implementation pending
**Read before:** writing any code that reads or mutates Cash, Clout, Stamina, Moves, Health or
skill points, or that adds an economy tunable.
**Tracks:** DOM-65 (substrate), DOM-79 (endgame Cash sink), DOM-73 (gear & Plugs).

This document fixes the **data contracts** for the OPPS economy: the tuning config, the player
wallet, the transaction ledger, and gear upgrade state. It deliberately stops short of the
server endpoints and the terminology code migration, which are the rest of DOM-65.

Terminology is canonical per [`../oppsDefinitions.md`](../oppsDefinitions.md): **Cash, Clout,
Stamina, Moves, Health**. The names below are the target. The prototype still uses `money`,
`xp`, `rep`, `energy`, `gems` — see §6.

---

## 1. The curve primitive

Five different systems scale a number by an integer input (player level, upgrade level). They all
use **one shape** so tuning never requires a code change (tenet T4).

```jsonc
{ "type": "constant",  "value": 5 }
{ "type": "linear",    "base": 3600, "step": 600 }
{ "type": "geometric", "base": 100,  "ratio": 1.05 }
{ "type": "table",     "values": [100, 110, 125] }
```

Evaluated at a **1-indexed** integer `n`:

| type | value at `n` |
|---|---|
| `constant` | `value` |
| `linear` | `base + step × (n − 1)` |
| `geometric` | `round(base × ratio^(n − 1))` |
| `table` | `values[n − 1]`, clamped to the last entry |

A curve may carry `"scaleBy": "itemPrice"` — the result is multiplied by the referenced field on
the entity the curve is applied to. Currently used only by `gear.upgradeCost`.

**Rule:** anything that scales with level or tier is a curve object in `tuning.json`. Do not add
a bare number and a multiplier in code.

Implemented as `evalCurve(curve, n, scale)` / `tuneCurve(path, n, scale)` in `js/tuning.js`.
**Rounding happens once, at the end, and only for `geometric`** — the one shape that is inherently
fractional. Rounding before applying `scaleBy` was a real defect: the gear upgrade curve has
`base: 1.0`, so early levels rounded to 1 and then multiplied, quantising every upgrade price to a
whole multiple of the item's cost (200, 400, 600 …) instead of the intended 200, 320, 512. The
other shapes are returned as authored, because some of them are rates that rounding would destroy.

> **The `n − 1` matters.** `data/README.md` documents the Clout curve as `round(100 · 1.10^L)`,
> which is the same series one step along — it yields 110 at level 1, not 100. Expressed in this
> primitive the curve is `{"base": 110, "ratio": 1.1}`, and that reproduces all 120 shipped rows
> of `progression.json` exactly (verified). Writing `base: 100` would have shifted every level by
> one step. Check a new curve against real data before trusting it.
>
> **Retuned 2026-09-11** from `{"base": 105, "ratio": 1.05}` — the 1.05 curve was too flat.
> Lifetime clout to the level-120 cap went from ~696k to ~92.7M.

---

## 2. `data/tuning.json`

Every economy constant in the game. **Single object, not an array** — an explicit, justified
exception to the array-of-objects rule in [`04-game-data-spec.md`](./04-game-data-spec.md) §2:
this file is a keyed config, not a content catalog, and keying it by path is what lets game logic
read `TUNING.loot.defeatLossRate` instead of scanning a list.

Loaded into the `TUNING` global by `loadGameData()`. **`TUNING` is `null` until boot completes and
stays `null` if the fetch fails** — economy callers must guard. Unlike a content array, an absent
tuning file is not a degrade-and-continue case: fail the action loudly rather than falling back to
a hard-coded default, or the defaults silently become the balance.

Sections: `progression` · `pools` · `skills` · `combat` · `matchmaking` · `loot` · `hospital` ·
`spots` · `gear` · `crew` · `monetization`.

### Values that are placeholders, not decisions

These are structurally correct and numerically unowned. The economy simulator (DOM-67) sets them;
do not treat the current values as balance.

| Path | Note |
|---|---|
| `combat.winProbability.beta` / `.bias` | `P(win) = σ(β·ln ρ + bias)`. Shape is locked, values are not. |
| `combat.damageScale`, `combat.maxRounds` | Placeholder until the combat sim runs. |
| `loot.defeatLossRate` | With an absolute win reward against a proportional loss, this sets the **break-even balance** — where the Cash supply settles (§4.2). The single most load-bearing number in the economy, and simulator-owned (DOM-67). |
| `loot.defeatLossCap` | `null` = uncapped. An uncapped proportion is correct economically but reads as punishing; a cap is the usual mitigation. Unowned. |
| `matchmaking.rerollFee`, `hospital.healCost` | Indexed to level so they keep biting; the index ratio matches the Clout curve so the fee tracks wealth. Base values unowned. |
| `gear.upgradeCost`, `gear.statCapLevel` | Cost must rise geometrically while wallets rise arithmetically. `ratio` is the property that matters; `1.6` is a guess. |
| `skills.grant.health` | `1` matches the code and [`../profileScreen.md`](../profileScreen.md) §4, which itself flags the per-point value as an open data decision — Health pools run larger than Stamina/Moves, so it is probably more than +1. |
| `progression.autoStatGainPerLevel` | Set to the **current shipped behaviour** (+3 ATK / +2 DEF / +15 HP / +2 Moves), so wiring it up changed nothing. See §6.2 — zeroing it is the recommendation, and now a one-line edit. |
| `hoodActions.launderRate` | **An unbounded, compounding Cash faucet**: 10% of the player's own balance for a flat Moves cost, with no drain attached. Tunable to zero without a release. `oppsDefinitions.md` has launder as "TBD" on migration; it should not survive in this form. |
| `combat.winHealthLoss`, `combat.defeatHealthRemaining` | Prototype-combat values, lifted verbatim from the code. The turn-based rework replaces them. |
| `spots.offlineAccrualCapSeconds` | The level → offline-cap mapping is still TBD in `oppsDefinitions.md`. |
| `progression.autoStatGainPerLevel` | Deliberately **all zeroes**. See §6.2. |

---

## 3. Player wallet — economy state

The authoritative shape of a player's economy state. Cash is a live balance **other players
mutate** (fight loot), so it cannot live only on the client — the client copy is a cache of the
server's number, not the source of truth.

**Implemented (save `SCHEMA_VERSION` 3):** `clout`, `level`, `levelGranted`, `cash`, and all three
pools in the `{current, max, lastTick}` shape below. `gems` is gone — no hard currency in v1.

Still divergent from the target: `skillPts` (target name `skillPoints`), and `hospitalizedUntil`
does not exist because the Hospital does not exist (DOM-72). Cash is still client-authoritative —
see §8.

```jsonc
{
  "playerId": "…",              // string, permanent
  "cash": 500,                  // int ≥ 0 — always at risk, no bank
  "clout": 0,                   // int ≥ 0 — monotonic, never spent, defines level
  "level": 1,                   // int 1–120, derived from clout via progression.json
  "levelGranted": 1,            // int ≥ 1 — highest level whose rewards were paid out
  "skillPoints": 0,             // int ≥ 0 — unspent

  "stamina":  { "current": 3,  "max": 3,  "lastTick": 0 },   // fights
  "moves":    { "current": 10, "max": 10, "lastTick": 0 },   // PvE
  "health":   { "current": 100,"max": 100,"lastTick": 0 },   // combat HP

  "attack": 10,                 // int ≥ 0 — base, before gear
  "defense": 5,                 // int ≥ 0 — base, before gear

  "hospitalizedUntil": null,    // epoch ms or null — shielded while non-null and in the future
  "lieutenantCount": 0,         // int ≥ 0 — drives gear-slot capacity
  "schemaVersion": 2
}
```

**Shape notes**

- **Pools are uniform `{current, max, lastTick}` objects.** One shape, one regen implementation
  for all three (`js/regen.js`). `lastTick` is epoch ms of the last regen **credit**, not of the
  last read — see §3.1.
- **`level` is derived, not authoritative.** It is a cached lookup of `clout` against
  `progression.json`, recomputed on every load by `syncLevel()`. On any disagreement, `clout` wins.
  This is what makes the curve **retunable without a migration** — change the table and every
  player is repriced on their next load. The v1 design decremented a remainder (`G.xp -= G.xpNext`),
  which froze each player at whatever level the curve gave them the day they earned it.
  **Deliberate consequence:** retuning the table upward can move a player's level *down*.
- **Regen is lazy.** Nothing accumulates in the background; a pool is worth whatever its
  `lastTick` and the clock say when you ask. §3.1.
- **`levelGranted` is a ratchet.** Per-level rewards (skill points, stat bumps, pool refills) are
  paid once per level ever reached. Without it, a derived level that moves down and back up would
  pay twice; with it, a downward retune costs a player their level display but never their points.
- **`hospitalizedUntil` is one field, not a flag plus a timestamp.** A boolean that can disagree
  with its timestamp is a bug waiting to happen.
- **No `gems`.** No hard currency in v1. The payments seam stays (`js/payments.js`) so one can be
  added without reopening this schema.
- **Gear stats are not stored here.** Attack/Defense above are base values; effective stats are
  computed from base + equipped loadout + upgrade levels at read time. Storing a total means
  every gear change has to remember to recompute it.

### 3.1 Regen

`js/regen.js`. One implementation, three pools, rates from
`tuning.pools.<pool>.regenSeconds` / `.regenAmount`.

```js
regenAll();                  // advance every pool to now; returns total credited
regenPool('stamina', now);   // one pool
secondsToFull('moves');      // for notification scheduling
```

**Offline catch-up and online ticking are the same code path.** That is the DOM-65 acceptance
criterion and it falls out of being lazy rather than being implemented twice: regen is computed
from `lastTick` on read, so the 10-second interval in `init()` exists only to move the meters on
screen. Deleting it would cost correctness nothing. The previous design kept two clocks — `lastSeen`
for offline and `lastEnergyTick` for online — which could disagree.

Three rules the implementation exists to enforce:

- **Credit every elapsed tick, and advance by whole ticks.** The old online path granted at most
  one Move per check no matter how long had passed — which is the only reason a separate offline
  path existed. It also set `lastTick = now` on each grant, discarding however far past the
  boundary the check landed, so grants drifted progressively later. `lastTick += ticks × interval`
  credits the full backlog and keeps the phase.
- **A full pool keeps its tick current.** Otherwise time banks while a player idles at max and pays
  out the instant they spend — the offline-farming hole.
- **A backwards clock re-anchors.** Leaving `lastTick` in the future stalls regen until real time
  catches up; re-anchoring costs the player nothing they had earned.

**Forward clock changes cannot be defended here.** A player who advances their device clock gets
free regen. It is bounded — a pool never exceeds `max`, so the most a jump buys is one full refill,
exactly what waiting buys — but closing it properly needs the server to own the timestamps (§8).

Stamina and Health now regenerate, which they did not before: Stamina 1 per 180s, Health 5 per 60s.
Those rates were already in `tuning.json`; nothing was reading them.

---

## 4. Transaction ledger

**Implemented** in `js/ledger.js`. Every balance change goes through one funnel:

```js
credit('cash', 500, REASON.STARTING_GRANT);
debit('moves', job.moves, REASON.MOVE_COST, { ref: { jobId: job.id } });
```

Nothing writes `G.cash`, `G.clout`, `G.skillPts` or a pool's `current` directly any more. That
single funnel is what makes support, refunds and faucet/drain dashboards possible later rather
than impossible, and it is the only way to know whether the economy actually balances — in a
session that started fresh, `ledgerSummary()` net equals the wallet for all six resources.

**Three properties worth knowing:**

- **Session-only.** Rows live in memory in a 500-row ring buffer and are gone on reload. The Player
  store is capped at 1 MB for the whole save and a ledger grows without bound, so persisting it
  needs a trim policy nobody has designed. Telemetry (DOM-78) is where rows should go to survive.
  **Consequence:** for a returning player the ledger reconciles against *movement this session*,
  not against the absolute balance — there are no `starting_grant` rows because
  `applyStartingState()` did not run.
- **Clout cannot be debited.** It is progression, not a currency; `applyDelta` throws rather than
  quietly rewriting a player's level.
- **No row for a no-op.** A fully clamped change and a genuine zero both return 0 and record
  nothing. "Refill a pool that is already full" fires on every level-up and would otherwise write a
  zero-delta row per topped-up pool.

**It is not an anti-cheat mechanism.** Combat settles against snapshots, so there is no server
adjudicating anything — a client-side ledger records what this client did, which is useful and is
not the same as proof.

```jsonc
{
  "id": "…",                    // string, unique — server-assigned
  "playerId": "…",              // string
  "ts": 1757600000000,          // int, epoch ms, server clock — never the device clock
  "resource": "cash",           // enum: cash | clout | stamina | moves | health | skillPoints
  "delta": -30,                 // int, signed, non-zero
  "balanceAfter": 470,          // int ≥ 0 — the balance once this row was applied
  "reason": "fight_defeat_loss", // enum, §4.1
  "idempotencyKey": "…",        // string, unique per logical operation
  "ref": { "fightId": "…" }     // object, free-form context — ids only, never balances
}
```

### 4.1 Reason codes

Locked enum. Adding a code is additive and safe; **renaming one invalidates every dashboard built
on it**, so treat these as permanent keys in the same way as content `id`s.

| Code | Direction | Kind |
|---|---|---|
| `starting_grant` | credit | faucet |
| `move_payout` | credit | faucet |
| `spot_collect` | credit | faucet |
| `fight_reward` | credit | faucet |
| `clout_gain` | credit | faucet |
| `regen` | credit | faucet |
| `level_up_grant` | credit | faucet |
| `recruit_bonus` | credit | faucet |
| `iap_grant` | credit | faucet |
| `fight_defeat_loss` | debit | **drain** |
| `gear_buy` | debit | drain |
| `gear_upgrade` | debit | drain |
| `spot_buy` | debit | drain |
| `reroll_fee` | debit | drain |
| `heal_cost` | debit | drain |
| `respec_cost` | debit | drain |
| `skill_alloc` | debit | drain (skillPoints) |
| `move_cost` | debit | drain (moves) |
| `fight_cost` | debit | drain (stamina) |
| `combat_damage` | debit | drain (health) |
| `admin_adjust` | either | correction |

**There are no transfer rows.** Fights are settled against a *snapshot*, never against a live
player (§4.2), so no Cash ever moves between two wallets. Every row in this table is a faucet or a
drain, which makes the money supply exactly `Σ credits − Σ debits` with no netting.

An earlier revision specified three transfer rows for a fight (`fight_loot_gain` / `_loss` /
`_burn`). They were removed with the move to snapshot combat and **must not be reintroduced under
those names** — a dashboard built on them would double-count.

### 4.2 A settled fight writes ONE Cash row

Combat is **asymmetric by construction**, and that asymmetry is the economy's main long-run drain:

| Outcome | reason | delta | shape |
|---|---|---|---|
| win | `fight_reward` | + a roll scaled to the opponent | **faucet, absolute** |
| loss | `fight_defeat_loss` | − `loot.defeatLossRate` × your current Cash | **drain, proportional** |

Only the present player's wallet is touched. The opponent — bot or real-player snapshot — is a
record, and nothing is debited from the real player behind it.

**The absolute faucet and proportional drain give fighting a break-even balance**, above which it
destroys Cash automatically and forever. That is the property [`../oppsDefinitions.md`] and DOM-79
were reaching for with a burn on a transfer, and it comes free here: a fixed reward cannot keep
pace with a percentage of a growing wallet. At a win probability `p`, reward `R` and loss rate `L`,
a player's Cash is stationary at

```
break-even balance = p·R / ((1 − p)·L)
```

**This is now the single most important number in the economy** — it is where the Cash supply
settles, and it is what DOM-67 has to find.

> **Reward MUST scale with the opponent's power.** A win mints Cash from nothing, so any ability
> to steer toward weak opponents is an uncapped faucet — and unlike real PvP, farming a weak target
> costs that target nothing, so nothing self-limits it. Under-reporting your own power to get an
> easier band has no downside for the player who does it. Scaling the reward to the opponent is what
> makes band-gaming unprofitable; Stamina is a weak second limiter (1 per fight at 180s is ~480
> fights/day).

### 4.3 Idempotency

`idem` is unique per **logical operation** and scoped to the session. A repeat with a seen key
returns 0 and writes no row.

**Deliberately narrow.** The original criterion — "replaying the same request twice changes
balances once" — was written for a server model, where it deduplicates network retries. There is
no network and no server, so what remains is guarding a double-tap or a double render from applying
the same action twice. That is real, but it is a UI concern rather than a distributed-systems one,
and it should not be described as the latter.

---

## 5. Gear upgrades

The unbounded Cash sink from DOM-79 layer 2. **Any owned item can be upgraded with no ceiling on
the level**; stat gains are small and hard-capped, and levels past the cap are pure prestige shown
on the item and on the public Player Profile.

Safe here specifically because matchmaking uses a win-rate band — a player who buys Attack is
served stronger targets and returns to the same band, so power inflation self-neutralises.

### 5.1 Catalog field — `store.json`

```jsonc
{ "upgradeable": true }   // bool, required
```

Added to all six items. Per-item so limited/premium gear can opt out later without a code change.
The cost curve is **global** (`tuning.gear.upgradeCost`, scaled by the item's own `price`) — an
item's upgrade cost is a property of the system, not of the item.

### 5.2 Owned-instance shape — **not yet built**

`G.inventory` is today an **array of item ids**. Upgrade levels need per-instance state:

```jsonc
"inventory": { "knife": { "level": 3, "duplicates": 1 } }
```

Array → object is a **breaking save change**: `SCHEMA_VERSION` 1 → 2, one migration
(`["knife","vest"]` → `{"knife":{"level":0,"duplicates":0}, …}`), and a golden-file test, per
[`04-game-data-spec.md`](./04-game-data-spec.md) §7. Not done here — it lands with the gear system
(DOM-73), not with the schema.

### 5.3 Effective stats

```
effective(stat) = base + Σ over equipped items of (item[stat] + gain[stat] × min(level, statCapLevel))
```

with `gain` = `tuning.gear.statGainPerLevel` and `statCapLevel` = `tuning.gear.statCapLevel`.
Levels beyond `statCapLevel` cost Cash and grant nothing but display.

### 5.4 Duplicates

Upgrades consume duplicate copies alongside Cash (`tuning.gear.duplicatesRequired`), giving the
redundant drops from Moves tables a use. Requires drop tables, which do not exist yet — until they
do, set `duplicatesRequired: false` rather than blocking upgrades on an unreachable input.

---

## 6. What this schema is not, yet

### 6.1 Wired — with two balance changes

Game logic no longer holds any balance number; everything reads `tune()`. What moved:
`SKILL_POINTS_PER_LEVEL`, `ENERGY_REGEN_SECONDS`, the per-level stat grants, new-player starting
balances, the fight-defeat Cash loss and health floor, the Hood rest/launder values, the Crew
per-Lieutenant bonus, and the skill point costs and per-rank grants.

**Two values changed behaviour**, because the data and the code disagreed and the data is the
source of truth:

| | was (code) | now (data) |
|---|---|---|
| Moves regen | 60s | **300s** — 1 per 5 min, per the design docs |
| Starting Stamina | 10 | **3** — the designed pool size |

Both are a single number in `tuning.json` if either turns out to be wrong. Everything else was
wired at its existing value, so the refactor was otherwise behaviour-preserving — deliberately,
so that a balance change and a plumbing change never land in the same commit.

Item prices, job payouts and enemy rewards were already data, but remain unvalidated against any
curve (DOM-67).

### 6.2 Two live divergences this schema exposes

**The progression curve was implemented twice, differently — now fixed.** `data/progression.json`
(120 rows, `cloutToNext` `null` at the cap, 92.7M lifetime Clout) was not loaded by
`loadGameData()` at all, while `addXP()` levelled players on `xpNext × 1.6` — a curve that walls
out around level 15 and needs ~10^25 Clout by level 120. The table is now loaded and level is
derived from it (§3); `xp` + `rep` merged into `clout` under `SCHEMA_VERSION` 2.

**The table's calibration is still unowned — and the 2026-09-11 retune to r = 1.10 moved the
problem, it did not solve it.** The 1.05 curve gave away level 50 in ~2.5 days of Moves regen and
cleared every content gate (`levelReq` tops out at 7) inside the first hour, because job payouts
grow 10 → 30 Clout/Move by level 8 while the curve grew at only 1.05. At 1.10 the early game is
close to unchanged (level 10 costs 1,752 Clout vs 1,322 before) but the late game inverts: level
119 → 120 alone costs 8.4M Clout, ~47,000 actions at the best-paying job. **The curve is decided;
the grant side is not.** Clout yields have to be rescaled against this curve in one pass — DOM-67.
`portraits.json` is still unloaded (DOM-60).

**Automatic per-level stat gains compete with the skill-point sinks.** `addXP()` grants +3 ATK /
+2 DEF / +15 HP per level automatically, while spending a skill point grants +1. The automatic
grant is ~20× the paid one, which makes the entire skill system cosmetic. `js/main.js` already
flags this in a comment as an economy decision. `tuning.progression.autoStatGainPerLevel` is set
to **all zeroes** — recording the intended answer (all stat growth is player-allocated) as a
tunable rather than leaving it as an argument in a comment. Flipping the code to read it is a
balance change and belongs to DOM-66, not here.

**Rank was one name per level — now a band.** `RANK_NAMES[Math.min(level - 1, 9)]` meant everyone
from level 10 up was "Untouchable". Ranks are now bands of `tuning.progression.levelsPerRank`
levels (10), resolved by `rankForLevel()`. With ten names that covers levels 1–90 and the top rank
runs 91–120; two more names would make every band uniform. See
[`04-game-data-spec.md`](./04-game-data-spec.md) §3.5.

### 6.3 Still open in DOM-65

The ledger, idempotency, and server-authoritative writes. The last is blocked on an architecture
decision, not on work — see §8.

The terminology migration is **done** (`SCHEMA_VERSION` 3): `money` → `cash`, `energy`/`maxEnergy`/
`lastEnergyTick` → `moves {current, max, lastTick}`, `stamina` and `health` to the same shape, and
`gems` removed along with the gem-pack catalogue (replaced by `data/monetization.json`, which sells
refreshes and heals directly).

The regen engine is **done** — see §3.1.

### 6.4 Not built

Server-authoritative endpoints · the regen engine · skill-point allocation service · the
remaining terminology migration (`money` → Cash, `energy` → Moves, drop `gems`) · the inventory
save migration in §5.2. All DOM-65 or later.

---

## 7. Tests

`node tests/migration.test.js` — golden-file test for the v1 → v2 save migration and the
Clout → level derivation, required by [`04-game-data-spec.md`](./04-game-data-spec.md) §7.4.
24 assertions: the exact migrated save, deterministic re-runs, the from-future guard, every one of
the 120 level boundaries, cap behaviour, the missing-table case, and every rank-band boundary.

There is no test runner in the repo yet, so it is a plain Node script that exits non-zero on
failure. Move it into a runner when one is adopted; do not let a migration ship without its
golden test in the meantime.

---

## 8. Who owns a balance — resolved 2026-09-11

**Decision: combat is settled against snapshots. There is no server-authoritative balance, and
no cross-player write.**

An opponent is a **record**, never a live player — a blend of generated bots and stored snapshots
of real players, indistinguishable in play. Winning mints Cash; losing destroys a proportion of
your own. Nothing is ever debited from the real player behind a snapshot (§4.2).

### 8.1 What this closes

The blocking contradiction is gone. DOM-65's *"the client cannot mutate a balance without a server
round trip"* was driven entirely by fight loot needing to debit a player who is not running a
client. Nothing in the game does that any more, so the three Authoritative statements stand
unamended:

- [`02-tech-architecture.md`](./02-tech-architecture.md) §1 — the backend is not a game server.
- [`02-tech-architecture.md`](./02-tech-architecture.md) §3.3 — the server stays stateless and minimal.
- [`03-game-architecture.md`](./03-game-architecture.md) §3.4 — no authoritative server owns saves,
  which keeps the lazy client-side migration model in
  [`04-game-data-spec.md`](./04-game-data-spec.md) §7 intact.

The ledger (§4) is still worth building — support, refunds, and faucet/drain dashboards all need
it — but as a **client-side record**, not an authority. Idempotency keys stay useful for replay
within a session; they are no longer the anti-cheat story.

### 8.2 What is still open, and it is much smaller

**a) Snapshot distribution.** Fighting stored snapshots of real players needs cross-player data,
which the Jest Player store does not provide (it is per-player, `data.set`/`getAll` with no player
parameter). This is **read-only and stale-tolerant** — no transactions, no consistency, no
idempotency — so it is one table and two endpoints: publish my own public snapshot, fetch a
shortlist in my win-rate band.

**Check [`07-external-systems.md`](./07-external-systems.md) §2.2a first.** Jest's Social module
(profiles, avatars, bot) is listed as available-but-not-integrated. If it exposes cross-player
profile reads, no custom service is needed at all. Confirm against the Jest docs before designing
one.

Note the degradation is graceful: if the snapshot pool is empty or unreachable, the opponent list
falls back to bots and the game is unaffected. That is also how the game bootstraps before it has
players.

**b) Monetization grants are still client-side.** `js/payments.js` verifies the receipt server-side
and then **the client decides what to grant**. [`07-external-systems.md`](./07-external-systems.md)
§3 requires the SKU → grant mapping to be server-authoritative. This is unaffected by the combat
decision and is a genuine exploit. It is a map on the server that already exists, not a new service.

Both still want a TDD, but a narrow one each.

### 8.3 The exploit the new model introduces

Under real PvP, farming a weak target was self-limiting — they only had so much Cash. Under
snapshot combat a win **mints** Cash, so any ability to steer toward weak opponents is an uncapped
faucet, and it costs the target nothing, so nothing self-limits it. Under-reporting your own power
to land in an easier band has no downside for the player doing it.

The mitigation is the reward curve, not infrastructure: **scale the win reward to the opponent's
power** so weak opponents pay proportionally less and band-gaming stops paying. Stamina is a weak
second limiter — 1 per fight at 180s regen is roughly 480 fights a day. See the note in §4.2.
