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
| `loot.defeatLossRate` | **Decided (DOM-79, 2026-09-11): stays 0.10.** With an absolute win reward against a proportional loss, this sets the **break-even balance** (§4.2), now anchored at **8 hours of best-job income** at the player's level (`tools/econ-sim/targets.json` → `breakEven`). Win rewards are the knob that moves to hit the anchor (DOM-71/DOM-81), not this rate. |
| `loot.defeatLossCap` | **Decided (DOM-79, 2026-09-11): `null` (uncapped) for v1.** An uncapped proportion is economically correct; the Hospital shield and the banded win rate are the harshness mitigations. Revisit with DOM-78 telemetry if large single losses correlate with churn. **Wired (DOM-68):** `combat.js` clamps the loss when the value is non-null, so capping is a tuning change, not a release. |
| `matchmaking.rerollFee`, `hospital.healCost` | Indexed to level so they keep biting; the index ratio matches the Clout curve so the fee tracks wealth. **Reroll ratified (DOM-68, 2026-09-11): escalating, first free** — the authored `loot.rerollFee` curve (base 50, ×1.05) stands; wiring lands with DOM-72's matchmaking, since a static target list has nothing to reroll. Heal base values still unowned (DOM-72). |
| `gear.upgradeCost`, `gear.statCapLevel` | `statCapLevel` is **decided (DOM-79, 2026-09-11): 10, confirmed hard** — upgrades past it are pure prestige, which is what keeps the unbounded track a sink rather than a matchmaking hazard. `upgradeCost.ratio` (1.6) is still a guess; it lands with the layer-2 sub-task. |
| `skills.grant.health` | `1` matches the code and [`../profileScreen.md`](../profileScreen.md) §4, which itself flags the per-point value as an open data decision — Health pools run larger than Stamina/Moves, so it is probably more than +1. |
| `progression.autoStatGainPerLevel` | Set to the **current shipped behaviour** (+3 ATK / +2 DEF / +15 HP / +2 Moves), so wiring it up changed nothing. See §6.2 — zeroing it is the recommendation, and now a one-line edit. |
| `hoodActions.launderRate` | **An unbounded, compounding Cash faucet**: 10% of the player's own balance for a flat Moves cost, with no drain attached. Tunable to zero without a release. `oppsDefinitions.md` has launder as "TBD" on migration; it should not survive in this form. |
| `combat.winHealthLoss`, `combat.defeatHealthRemaining` | Prototype-combat values, lifted verbatim from the code. The turn-based rework replaces them. |
| `spots.offlineAccrualCapSeconds` | **Decided (DOM-74, 2026-09-11):** the mapping lives in `data/unlocks.json` as the `spotOfflineCapSeconds` capability — linear, 1h at L1 + 10min/level (≈19h at L110). Kept as a capability rather than tuning so one gate system owns all level-scaled values. |
| `progression.autoStatGainPerLevel` | Deliberately **all zeroes**. See §6.2. |

---

## 3. Player wallet — economy state

The authoritative shape of a player's economy state. Cash is a live balance **other players
mutate** (fight loot), so it cannot live only on the client — the client copy is a cache of the
server's number, not the source of truth.

**Implemented (save `SCHEMA_VERSION` 3):** `clout`, `level`, `levelGranted`, `cash`, and all three
pools in the `{current, max, lastTick}` shape below. `gems` is gone — no hard currency in v1.

Still divergent from the target: `skillPts` (target name `skillPoints`). `hospitalizedUntil`
**exists as specified since DOM-72 (2026-09-12)** — one nullable timestamp on `G`, additive, no
schema bump. Cash is still client-authoritative — see §8.

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
| `hospital_heal` | credit (health) | pool restore — the Hospital discharge, timer or paid (DOM-72) |
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
settles.

> **Decided (DOM-79, 2026-09-11): the break-even balance is the primary endgame sink**, and it
> is anchored at **8 hours of best-job income at the player's level**, evaluated at the nominal
> win probability (0.5). The anchor lives in `tools/econ-sim/targets.json` (`breakEven`); the
> live inputs are `loot.defeatLossRate` (fixed at 0.10) and the win rewards, which must be
> sized per level band as `R = BE·(1−p)·L/p`. For authored enemies that is `enemies.json`
> rewards — **rescaled 2026-09-11 by the DOM-71/DOM-81 catalog pass** (`gen-catalog.js` prices
> every band, §9.2); for real-player snapshots, the same formula prices the reward from the
> opponent's band when matchmaking lands. The simulator's "break-even placement" section scores
> the live data against the anchor.

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

Added to all 38 items (the DOM-73 catalog generates it). Per-item so limited/premium gear can opt
out later without a code change. The cost curve is **global** (`tuning.gear.upgradeCost`, scaled
by the item's own `price`) — an item's upgrade cost is a property of the system, not of the item.

### 5.2 Owned-instance shape — **built (DOM-88, 2026-09-11)**

`G.inventory` is a per-instance map:

```jsonc
"inventory": { "knife": { "level": 3, "duplicates": 1 } }
```

The array → object migration shipped as `SCHEMA_VERSION` 3 → 4 with golden-file tests
(`tests/fixtures/save-v3.json`), per [`04-game-data-spec.md`](./04-game-data-spec.md) §7. Every
pre-v4 item lands at `{level: 0, duplicates: 0}` — the state a fresh purchase creates. The shape
is only touched through the `state.js` helpers (`ownsGear` / `gearInstance` / `grantGear`);
nothing else may assume it.

### 5.3 Effective stats

```
effective(stat) = base + Σ over equipped items of (item[stat] + gain[stat] × min(level, statCapLevel))
```

with `gain` = `tuning.gear.statGainPerLevel` and `statCapLevel` = `tuning.gear.statCapLevel`
(**10, hard** — DOM-79 decision 3). Levels beyond `statCapLevel` cost Cash and grant nothing but
display — the prestige track, shown on the item and in the public Profile projection (the level is
deliberately public; raw stats stay private).

**Implementation note:** the client banks stats incrementally (`G.attack += gain` on each level up
to the cap), the same way purchases apply item stats — the formula above is the invariant the
increments maintain, not a recomputation that runs anywhere. `upgradeGear()` in `js/store.js`
writes the `gear_upgrade` ledger row; the upgrade cost of level *n* is
`tuneCurve('gear.upgradeCost', n, item.price)` (curves are 1-indexed).

**The cost ratio is owned by the simulator** (`sim.js` §C2, DOM-88): because item prices are
hours-of-income at their gate (DOM-73), the upgrade sink costs the same in player-time at every
band — first levels on a full kit ≈ 28h of jobs, kit to LV 5 ≈ 20 committed days, kit to the stat
cap ≈ 235 days, and each prestige level beyond absorbs months of maxed income. Ratio 1.6
confirmed against 1.4 (caps out in ~90 days, prestige cheapens) and 1.8 (LV 5 becomes a 29-day
wall): LV 5 stays an in-band goal, the cap a season-long one, and the sink never runs out — which
resolves Q2's "nothing left to buy".

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

---

## 9. Faucet catalogs — `jobs.json` and `enemies.json` (DOM-71 / DOM-81, 2026-09-11)

Both catalogs are **generated, not hand-tuned**: `tools/econ-sim/gen-catalog.js` solves them
against the ratified pacing targets (`tools/econ-sim/targets.json`) using the simulator as the
oracle, and writes them as plain data the game reads unchanged. Hand-editing a payout invalidates
the solve — change the targets or the generator and rerun, then validate with
`node tools/econ-sim/sim.js`.

### 9.1 `jobs.json` — the Moves ladder

19 jobs across 16 tiers; static tier gates at levels 1, 2, 3, 5, 7, then every 10 levels from
L10 to L110 (ratified: static catalog, not level-scaled payouts — a new tier is a content beat).

| Field | Meaning |
|---|---|
| `tier` | 1-based index of the job's level gate, in gate order. |
| `moves` | Pool cost per run. |
| `cash` | `[min, max]` roll per run. Geometric in the gate level at the progression curve's own ratio, anchored to the legacy L7 rate — the cash economy has no seam at the old catalog boundary. |
| `clout` | Flat payout per run. Near-flat ~7–11 per Move from L1 to L50 (early levels are fast because the **cost** curve is low, not because income ramps), then geometric from L60 so the ratified 365-day cap holds. |
| `levelReq` | The tier gate. |
| `times` | **Mastery is cosmetic (DOM-71 decision):** the meter fills once at `times` runs and the job stays runnable forever. `jobProgress` caps at `times`; completion pays nothing in v1. |
| `drops` | `[{ item, rate }]` — see 9.3. |

### 9.2 `enemies.json` — fight rewards

17 enemies; bands at levels 1–5 (legacy ids kept) then every 10 levels from L10 to L110.

- `reward.cash` is `[0.8·R, 1.2·R]` where **R = BE·(1−p)·L/p** at the band's best-job income —
  the DOM-79 anchor (§4.2), priced by the generator. A break-even placement scale off ×1 in the
  sim is band granularity (e.g. L7 fights the L5 band until L10 opens), not drift.
- `reward.clout` is ~3.0× the band's best job clout-per-Move — the ratio that realizes the
  ratified Clout mix (9.4) for the committed reference player.
- `hp`/`atk`/`def` continue the legacy power trend and are **matchmaking inputs, not economy
  data** — DOM-72 owns them.

### 9.3 Drop tables

`drops` on a job is the only non-purchase route to gear in v1. Contract: one roll per entry per
run, **server-side** with the rest of move resolution; an item the player already owns never
drops (inventory is one-of-each). Tables sit on tier-top jobs and now run the full ladder
(DOM-73): each gate's job drops that gate's **weapon** at 2.5% (plus the two legacy flavour
entries at gates 10/20). Drop EV ≈ 0.2h of income per run against a ~0.6h Moves cost — a real
bonus that self-limits because owning the item ends the stream; the purchase path stays primary.

> The prototype rolls drops in `js/jobs.js` `doJob()` because *all* resolution is client-side
> pre-server; the roll moves server-side wholesale with the rest of it (DOM-71 execution
> requirement, still open). Drops are not ledger rows — inventory is not a ledger resource.

### 9.4 Clout income mix — DOM-81 decision record (ratified 2026-09-11, Jake)

Target share of a committed player's earned Clout, held at every checkpoint level (grind-led —
the late game is reachable without fighting, just slower):

| Source | Share | Realized (L10 / L50 / L100) |
|---|---|---|
| Moves (`jobs.json` `clout`) | 0.60 | 63% at every checkpoint (60:35 normalized) |
| Fight win + loss (`reward.clout`, `combat.defeatCloutShare` = 0.25 unchanged) | 0.35 | 37% at every checkpoint |
| Recruiting (`crew.cloutPerRecruit`) | 0.05 headroom | **Flavour, not income** — stays a flat 250. An unbounded faucet on an unbuilt social loop is risk with no data; revisit when invites exist. |

### 9.5 `store.json` — the gear catalog (DOM-73, ratified 2026-09-11)

38 items on the same 16 gates as the jobs ladder; generated by `gen-catalog.js`. Ratified:
**per-Plug inventory** (each item carries a `plug` — vendor grouping is content, ready for the
merged Plug surface), **own-once additive** stats in v1 (loadout/capacity is DOM-75), gear is
permanent (the recurring cost is the DOM-88 upgrade track, per DOM-79).

| Field | Meaning |
|---|---|
| `type` | `weapon` / `armor` / `vehicle` / `utility` — drives generated stats and the price multiplier. |
| `tier`, `levelReq` | Same gate scheme as jobs; purchases are gated (`LEVEL N` in the client until then). |
| `plug` | Vendor id from `js/plugs.js`: weapons → Tommy the Fence, armor → Theresa the Connect, vehicles → Marco the Mechanic, utility → Kylie the Lookout; the L110 kit is Dex's. |
| `price` | **Hours of best-job income at the gate** (committed rate): weapon/armor 8h, vehicle 12h, utility 4h. Sub-L5 starters keep authored onboarding prices. A gate's full kit ≈ 1.3 committed days. |
| `atk`/`def`/`hp` | Uniform on every item (the `hpBonus` special case is gone). Generated stats ride the enemy ×1.40-per-10-levels trend anchored to the legacy items — **matchmaking inputs; DOM-72 owns the combat math.** |
| `upgradeable` | All true — the DOM-88 hook. |

**Names are content, not economy.** Identity (id, name, type, vendor) lives in `GEAR_CONTENT`
at the top of the generator; every number is derived. The planned real-gun naming pass is a
rename-in-place there — ids are the stable keys (saves and drop tables reference them), so keep
ids and swap names.

Purchases debit `cash` with `REASON.GEAR_BUY` and the level gate + balance checks run in
`buyItem()` — client-side pre-server like everything else; server-side validation lands with the
gameplay server (§9.3 note). `hoodActions.launderRate` was zeroed in the same pass (the F1
exploit); the action stays wired for a redesigned, bounded version.

### 9.6 `properties.json` — the Spots catalog (DOM-74, ratified 2026-09-11)

16 spots on the same 16 gates, generated by `gen-catalog.js` (`SPOT_CONTENT` is the identity
layer, same contract as gear: rename freely, ids are the stable keys). Ratified: **own-once
ladder** (the flat-price BUY MORE stacking is gone — it made income linear in spend at constant
payback; legacy multi-copy saves keep their counts honored, rate × count), **not lootable in v1**,
income **~10% of the gate's best-job $/h per spot**, **~7-day payback** at once-daily full-bank
collects at the gate, cap curve kept at 1h + 10min/level.

| Field | Meaning |
|---|---|
| `ratePerHour` | Cash banked per hour while away — replaces the per-tap `income` field entirely. |
| `price` | `7 days × ratePerHour × capHours(gate)` — the payback period is the designed number and lands at exactly 7.0d at every gate. |
| `tier`, `levelReq` | Same gate scheme as jobs/gear; purchases are level-gated and own-once. |

**Accrual contract:** per-spot `{lastCollect}` anchors in `G.spots` (additive save field, no
schema bump; a save without an anchor anchors at first read — deliberately no retro-accrual).
Accrued = `rate × min(elapsed, capabilityAt('spotOfflineCapSeconds', level))`. A full bank earns
nothing — the cap is the leash; the client renders the FULL state explicitly. `collectSpots()`
moves every bank into the wallet as **one** `spot_collect` ledger row and resets the anchors.

**Lootability (the ticket's open decision 1): NOT lootable in v1.** Uncollected accrual lives
outside `G.cash`, and the combat loot base reads `G.cash` only. The shelter this creates is
bounded by design: the cap holds at most ~10–33% of one hour-equivalent of job income per cap
window, a fraction of one break-even wallet — and a full bank earning nothing makes never-collect
self-defeating. Revisit when the server owns fight settlement.

**Known hump, accepted:** the *summed* ladder rate peaks at ~33% of the job rate around L10–L20
(early spots stay relevant while job income is still flat) and settles to ~16% from L50 on;
per-spot it is 10% at the gate as ratified. Jobs remain the primary faucet at every level.

### 9.7 The Cash circuit — DOM-68 close-out (2026-09-11)

The hub ticket's scope landed piecemeal (endgame sink DOM-79, faucet scaling DOM-71/81, gear
sink DOM-73, recurring sink DOM-88, spots + lootability DOM-74); this pass closed what remained:

- **Circuit balance is now a simulator section** (`sim.js` §C3): per band, committed inflow per
  day against what the band sells. It converges to **~8.4 days of income to clear a band's
  sinks** at every gate from L10 up (gear kit + spot + kit-to-LV5), with L1 deliberately trivial
  for onboarding — a consequence of everything being priced in hours-at-gate. The fight share of
  inflow shown there is the empty-wallet bound; it decays to zero at the break-even wallet.
- **`loot.defeatLossCap` is wired** in `combat.js` (ratified null stays — capping is now a tuning
  change). The defeat branch also had a display bug — `debit()` returns the negative applied
  delta, so losses printed as "Lost $-N" — fixed.
- **Reroll fee ratified: escalating, first free** (open decision 4). The authored curve stands as
  data; DOM-72 wires it with matchmaking.
- **No new-player floor mechanism** (open decision 5, ratified): a fresh player losing every
  starting fight ends around $174 of $500, recovered in minutes of L1 job income; losses only
  compound through the player's own defeats. Matchmaking's easy-end bias (DOM-72) is the safety
  net; revisit only if DOM-78 telemetry shows early-loss churn.
- **Money supply reconciles by construction**: Σ credits − Σ debits = wallet movement, no netting,
  no transfer rows — asserted by the ledger tests and a full-circuit harness that drives buy /
  upgrade / collect / win / loss through the real ledger in one scripted session.

### 9.8 Combat & the Hospital — DOM-72 (+ DOM-82) decision record (2026-09-12)

Turn-based rounds replace the one-roll spark. The model lives in **`js/fightmath.js`**, one pure
implementation shared verbatim by the client, the simulator and the generator.

| # | Decision | Ratified |
|---|---|---|
| 1 | Hospital timer | **Own timer** (`hospital.fullHealSeconds`, 30 min): 0 HP sets `hospitalizedUntil` in the fight's resolving transaction; health regen pauses; timer completion (or the paid early-out) restores full health and clears the state. Rest is blocked while hospitalized — 4 Moves must not undercut the lockout. |
| 2 | Heal pricing | **~1h of best-job income at level** (`hospital.healCost` geometric base 420 ×1.1, tracking the income curve), prorated by time remaining. Rational below break-even (a full pool's fight EV ≈ 1.8h of income) and the recurring combat drain F3 predicted. Premium speed-up stays behind DOM-69/76. |
| 3 | Run-away | **60% escape** (`combat.runAwayChance`); a failed run eats the counterattack and the fight continues; a successful run costs only the stamina staked at fight start. |
| 4 | DOM-82 free release | **Option 1, accepted**: level-up clears `hospitalizedUntil` in the same transaction as the pool refill. Banking a nearly-complete level as an escape hatch rewards planning; the ceiling is one level's worth. |

**The round model** (`combat.roundDamageShare` 0.25, `damageSpread` 0.15, `firstStrikeEdge` 0.1):
sequential per round — the player's hit lands first and a killed enemy never counterattacks.
Damage to the enemy is a share of the *enemy's* pool (HP displays scale freely per band); damage
to the player is referenced to BASE health (`start.health`), so skill-built max Health buys real
extra rounds — the tank build works and is test-pinned. Fights debit `stamina` at start
(`fight_cost` — previously declared and never used).

**Enemy ATK/DEF are solved, not extrapolated**: the generator calibrates one multiplier (×~1.14 of
the band's expected loadout) so the band matchup sits at the pricing nominal p0 = 0.5 — verified
at L10/50/110 (46–53%). L1 runs ~97% by construction (attacker strikes first and early loadouts
are lopsided) — deliberate onboarding softness, priced in pennies. Enemy HP keeps the legacy
display trend.

**Fight pacing changed and the catalogs were re-solved**: a defeat now hospitalizes, so the free
cadence is a cycle of `1/(1−p0)` fights per 30-min lockout ≈ **4 fights/h** (stamina caps the
paid path at 20/h). The knob solve reproduces E/M/K exactly; the win-clout ratio moved 3.01 →
4.20 (rarer fights pay more Clout each) and the 63/37 mix and 365-day cap hold by construction.
F3 is resolved as designed: the Hospital loop paces combat and its early-out is the recurring
combat drain.
