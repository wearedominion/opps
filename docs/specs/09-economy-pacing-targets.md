# 09 — Economy Pacing Targets & Simulator Findings

**Status:** v1.3 · **Targets ratified 2026-09-11 (Jake)**, with one amendment: level 120 in
one year of committed play · Simulator delivered (DOM-67) · **Faucet catalogs solved against
the targets (DOM-71/DOM-81, §6)** · **Gear catalog priced against the faucets (DOM-73, §7)**
**Read before:** setting any number in `data/tuning.json`, `data/jobs.json`,
`data/enemies.json`, `data/store.json`, `data/properties.json` or `data/progression.json`.
**Tracks:** DOM-67 (this doc + `tools/econ-sim/`) · feeds DOM-79, DOM-71, DOM-81, DOM-73, DOM-74.

The simulator is `tools/econ-sim/sim.js` — run `node tools/econ-sim/sim.js` from the repo
root. It reads every game constant from `data/*.json` through the game's own `js/tuning.js`
(no drifting copy), reads the targets from `tools/econ-sim/targets.json`, and writes
`tools/econ-sim/out/results.json` + `time-to-level.csv`. Change a number in tuning, re-run,
and every table in this doc can be regenerated.

---

## 1. Pacing targets

Written down **before** tuning toward them, per the DOM-67 brief. Proposed by the simulator
work on 2026-09-11 and **ratified the same day by Jake**, who amended one: level 120 lands in
one year of committed play, not merely "reachable". These are now the spec — a tuning change
that misses them needs a reason.

| Target | Value | Why |
|---|---|---|
| Session length | ~8 min | Long enough to spend a session's pool regen, short for RCS/iMessage context |
| Sessions per day | 3 | Matches the Spots collect-on-login loop and pool sizes |
| Level at day 1 / 7 / 30 | **8 / 20 / 40** | Front-load early ranks, keep 41–120 as the long game |
| Days to level 120 (committed) | **365** | The cap is a one-year chase, not a decade — ratified amendment 2026-09-11 |
| Faucet share of Cash income | Moves 45% · Fights 30% · Spots 25% | Moves stay the backbone; fighting is meaningful but optional; Spots reward ownership without going idle-game |
| Players hospitalized at any moment | ≤ 8% | Hospital is a beat, not a wall |
| New-player offline accrual cap | ~1 h | The login-forcing lever; grows with level per `data/unlocks.json` |

**What the one-year cap implies (simulator, 2026-09-11):** 92.7M lifetime Clout in 365 days is
an average of **~254,000 Clout/day**; the current catalogs produce **~18,800 Clout/day**
committed — a **×13.5 gap**, concentrated in the late game because Clout/day is flat from L7.
That gap is the sizing brief for DOM-71 (Moves ladder) and DOM-81 (per-source Clout yields):
late-game content must scale Clout income roughly with the ×1.1/level curve so the year is
spent climbing, not stalled. Reconcile with the day-30 target: L40 costs only ~44k cumulative
Clout, so the scaling belongs almost entirely to levels 40–120.

## 2. Where the live data lands against those targets

> **Superseded 2026-09-11 by the DOM-71/DOM-81 catalog pass (§6)** — kept as the before-state
> record. The catalogs below no longer exist in this form; rerun the sim for current numbers.

Simulator output, 2026-09-11, `tuning.json` v2 (values, not judgements — rerun to refresh):

- **Early game is ~40% too fast, late game is unreachable.** A casual player hits **L11 on
  day 1** (target 8) and **L56 by day 30** (target 40); then progress collapses — committed
  play reaches L100 in ~733 days and **level 120 in >10 years** (grinding nonstop: ~9.4 years).
  The curve is not the problem; the catalogs are (§4 F4): jobs stop growing at `levelReq 7`
  and enemies at 5, so Clout/day is **flat from L7 to L120** while `cloutToNext` grows
  ×1.1/level. Against the ratified 365-day cap target that is a **×13.5 Clout/day shortfall**.
  **DOM-71 (Moves ladder) and DOM-81 (Clout yields) must extend earning with level**, not
  retune the curve.
- **Faucet shares are wildly off target.** As built, exploit ceilings dominate (launder,
  Spots tap-farming, §4 F1–F2). Even exploits aside, fights at an empty wallet out-earn top
  jobs ($1.8k/h vs $1.6k/h at p=0.5) and Spots pay ~$6.4k/day intended vs jobs ~$34.6k/day
  committed — Moves ≈ 82%, Spots ≈ 15%, fights swing negative with wealth.

## 3. The four questions, answered numerically

**Q1 — Can paid Stamina out-earn its price? YES, and it scales with the pool.**
At the matchmaking band ceiling (p = 0.70) vs the best-paying enemy, fight EV at an empty
wallet is ~$455. A $0.99 Stamina refresh grants max-pool fights: **$1,365 with the base pool
of 3 — $27,300 with a skill-built pool of 60** (≈17 hours of top-job income per refresh).
Caveats that soften but don't fix it: defeats interrupt the burst (health floor blocks
fighting under 20 HP), and the EV shrinks as the wallet grows. Mitigations, in order of
force: win reward must scale with opponent power (already a MUST in `08` §4.2), and the
refresh grant or stamina `maxCap` (60) needs a look in DOM-69/DOM-76.

**Q2 — How fast does Cash inflate with no recurring sink?**
A maxed committed player earns **~$286k/week** (jobs ~$34.6k/day + Spots ~$6.4k/day at 3
collects) with nothing left to buy: the entire one-time sink catalog — all six gear items
plus one of each Spot — totals **$28,100 and is outgrown in under a day** of committed play.
This is the argument for DOM-79's recurring sinks (break-even fighting + the unbounded gear
upgrade track).

**Q3 — Do bots mint more than players destroy? YES, below the break-even balance.**
Every fight is vs a snapshot: a win mints from nothing, a loss destroys 10% of the player's
own wallet. Vs the best enemy (mean reward $650): break-even sits at **$3,500 (p=0.35) /
$6,500 (p=0.5) / $15,167 (p=0.7)**. A player holding $1k nets +$162 to +$425 per fight
depending on band position; at $50k every band is deeply Cash-negative (−$1,045 to −$3,022).
Population net therefore depends entirely on the wealth distribution — early/mid wallets all
mint, and nothing self-limits it because the snapshot loses nothing. The reward-scales-with-
opponent rule is the mitigation; the break-even level itself is DOM-79's number to set.

**Q4 — Does a wiped new player recover? YES, within one session.**
Worst realistic run: lose all 3 starting fights → $500 → $365 (−$135, proportional loss can
never reach $0). The 10 starting Moves alone earn back ~$350 on the best L1 job; the defeat
health lockout is ~3 minutes of regen. There is no wipe state and no need for a new-player
shield **at current numbers** — recheck if `defeatLossRate` or starting balances move.

## 4. Findings beyond the brief

| # | Finding | Owner |
|---|---|---|
| F1 | **Launder compounds ×2.3·10⁵ per day** (+10% of balance per 2 Moves, ~130/day committed). Every other number is noise until `hoodActions.launderRate` is zeroed. **RESOLVED 2026-09-11** — rate zeroed in the DOM-73 pass (§7); the action stays wired for a redesigned, bounded version. | ~~tuning, one field~~ closed |
| F2 | **Spots as built are a $127k/h tap-farm** (full income per tap, 60s min). No accrual rate exists in tuning — the intended collect-on-login model cannot be tuned until DOM-74 defines one. | DOM-74 |
| F3 | **Health, not Stamina, paces fighting**: at p=0.5 health regen sustains ~5.6 fights/h vs stamina's 20/h. The Hospital/heal loop is the real combat governor — price heals accordingly. | DOM-72 |
| F4 | **The catalogs starve the curve** (see §2). Flat Clout/day from L7 meets ×1.1/level costs — the late game is a wall, not a slope. **RESOLVED 2026-09-11** — the DOM-71/DOM-81 catalog pass (§6) extends both catalogs to L110 and lands the cap at exactly 365 committed days. | ~~DOM-71, DOM-81~~ closed |
| F5 | **Gear is trivially affordable** — the priciest item costs ~2.2h of jobs at L7, and there are no level gates on `store.json` to pace it. **RESOLVED 2026-09-11** — the DOM-73 pass (§7) gates every item and prices by rule at the gate (8h/8h/12h/4h by type). | ~~DOM-73~~ closed |

## 5. DOM-79 decision record — ratified 2026-09-11 (Jake)

The four decisions the ticket demanded, recorded:

| # | Decision | Outcome |
|---|---|---|
| 1 | Break-even as the primary endgame sink | **Confirmed**, anchored at **8 hours of best-job income** at the player's level (nominal p = 0.5). Anchor in `tools/econ-sim/targets.json` → `breakEven`; mechanism in `08` §4.2. |
| 2 | `loot.defeatLossCap` | **Uncapped (`null`) for v1.** A flat cap erodes the sink exactly where wallets grow. Revisit with DOM-78 telemetry if big single losses correlate with churn. |
| 3 | Hard stat cap on gear upgrades | **Confirmed at `gear.statCapLevel` = 10.** Past it, upgrades are pure prestige — non-negotiable, or layer 2 becomes a matchmaking hazard. |
| 4 | Sequence layers 2 and 3 | **Layer 2 (gear upgrades) first** — no art dependency, and it is the recurring sink the economy needs now. Layer 3 (tiered profile cosmetics) follows when art exists. Both spun out as sub-tasks under DOM-64. |

**What the anchor implies today** (simulator §BE, tuning v2): `loot.defeatLossRate` stays
0.10 and win rewards rescale by roughly ×1.6–×2.9 per band (L1: $115 → $336 · L3: $275 → $720
· L5: $650 → $1,056 · L7: $650 → $1,280). Execution of the rescale rides with the
DOM-71/DOM-81 catalog pass; for real-player snapshots the reward is priced from the opponent's
band by the same formula, `R = BE·(1−p)·L/p`, when matchmaking lands. Reroll fee and Hospital
heal are already level-indexed curves in tuning (`matchmaking.rerollFee`,
`hospital.healCost`); nothing reads them yet because neither feature is built — the wiring
lands with matchmaking and DOM-72.

## 6. DOM-71 / DOM-81 decision record — ratified 2026-09-11 (Jake)

The Moves ladder and the per-source Clout yields were decided together and solved as one system
by `tools/econ-sim/gen-catalog.js` (the sim is the oracle; the catalogs are its output). Schema
and contracts: `08-economy-schema.md` §9.

| # | Decision | Outcome |
|---|---|---|
| 1 | Ladder shape | **Static tiers.** 19 jobs / 16 tiers, gates at 1–7 (legacy) then every 10 levels to L110. Payouts fixed per entry, geometric in the gate level — a new tier is a content beat. |
| 2 | Clout income mix | **60 : 35 : 5 moves : fights : recruiting, grind-led** — held at every checkpoint (realized 63/37 at L10/L50/L100, recruiting's 5 is headroom). Late game reachable without fighting, just slower. |
| 3 | Mastery (`times`) | **Cosmetic in v1.** Meter fills once, job stays runnable, completion pays nothing. Real mastery bonuses wait for telemetry. |
| 4 | Recruiting | **Flavour, not income.** `crew.cloutPerRecruit` stays a flat 250 — an unbounded faucet on an unbuilt social loop is risk with no data. Revisit when invites exist. |

**How the solve works.** Three knobs against the ratified targets: early gates (1–7) hit casual
L8 at day 1; mid gates (10–30) hit casual L40 at day 30; late gates (40–110) hit committed L120
at day 365. The early clout shape is deliberately near-flat (~7–11 Clout/Move from L1 to L50):
early levels are fast because the *cost* curve is low, not because income ramps — the legacy ×3
income ramp to L7 is what made day 30 overshoot. The hockey stick starts at L60.

**Time-to-level, committed (simulator, post-solve):** L10 day 1 · L20 day 2 · L30 day 5 ·
L40 day 12 · L50 day 29 · L60 day 72 · L80 day 169 · L100 day 267 · **L120 day 365** — the late
game is a straight ~5 days/level climb. Casual lands L8 / L26 / L41 at days 1 / 7 / 30 against
targets 8 / 20 / 40: **day 7 runs ~6 levels hot** and is pinned between the day-1 and day-30
solutions — accepted, front-loading was the point.

**Fight rewards** are priced per band from the DOM-79 anchor (`R = BE·(1−p)·L/p` at 8h of the
band's job income) — the ×1.6–2.9 rescale recorded in §5 is delivered, and break-even placement
now scores ×1.0 on every banded level. Win Clout is ~3.0× the band's job Clout/Move, which is
what holds the 63/37 mix.

**Consequences priced in, owners elsewhere:**

- Cash income now scales ×1.1/level to L110 while every one-time price is static — the gear and
  Spot catalogs (DOM-73, DOM-74) and the upgrade track (DOM-88) must gain level-scaled pricing,
  and the launder rate (F1) compounds proportionally bigger balances: zero it first.
  *(Delivered for gear + launder by the DOM-73 pass, §7 — Spots and upgrades still open.)*
- The $0.99 Stamina-refresh mint (Q1) grows with the reward rescale (~34h of top-job income at a
  60-stamina pool) — the refresh grant/cap decision (DOM-69/DOM-76) is now more urgent, not less.
- Enemy `hp/atk/def` above L5 are trend extrapolations; matchmaking (DOM-72) owns real stats.
- Server-side payout and drop rolls (DOM-71 execution requirement) remain open — the prototype
  resolves everything client-side; drops ride in `doJob()` until resolution moves as a whole.

## 7. DOM-73 decision record — ratified 2026-09-11 (Jake)

| # | Decision | Ratified |
|---|---|---|
| 1 | Ticket scope | **Economy core only this pass.** The merged Plug/store surface moves to the Chrome Money UI epic (its spec keeps Plugs and Gear as separate Empire chips — merging is a UI-epic decision); Plug quests spin out as their own sub-task. |
| 2 | Vendor model | **Per-Plug inventory.** Every item carries a `plug` id; vendor discovery becomes content. The grouping ships as data now and the UI reads it when the surface merges. |
| 3 | Ownership | **Own-once additive** (matches the live client and the sim). Loadout/capacity is DOM-75. |
| 4 | Content naming | Names live in `GEAR_CONTENT` (identity layer) fully separated from derived numbers — the planned real-gun naming pass is a rename-in-place; ids are the stable keys. |

**Price rule.** `price = hours × best-job $/h at the gating level` (committed rate): weapon/armor
8h, vehicle 12h, utility 4h; the three sub-L5 starters keep authored onboarding prices. A gate's
full kit ≈ 1.3 committed days (~3 casual) of income — a standing save-up target beside the 8h
break-even sink at every band. Because prices are derived from the job catalog, re-solving the
faucets re-prices the sink automatically.

**Resolved findings.** F1 (launder): `hoodActions.launderRate` zeroed — the action stays wired so
a redesigned, bounded version is a tuning change. F5 (gear trivially affordable / ungated):
every item is level-gated and priced by rule; §2's "no gates" reading is historical.

**Still open, owners elsewhere:** one-time Spot prices (DOM-74) and the upgrade track pricing
(DOM-88, now against a real catalog); server-side purchase/drop validation (gameplay server);
enemy and gear stats above L5 are trend extrapolations until DOM-72 does matchmaking.
