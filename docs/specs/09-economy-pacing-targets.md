# 09 — Economy Pacing Targets & Simulator Findings

**Status:** v1.11 · **Targets ratified 2026-09-11 (Jake)**, with one amendment: level 120 in
one year of committed play · Simulator delivered (DOM-67) · **Faucet catalogs solved against
the targets (DOM-71/DOM-81, §6)** · **Gear catalog priced against the faucets (DOM-73, §7)** ·
**Upgrade sink live, ratio confirmed (DOM-88, §8)** · **Spots accrual live, tap-farm closed
(DOM-74, §9)** · **Cash circuit closed out (DOM-68, §10)** · **Stamina mint bounded, SKUs
fixed-point (DOM-69/76, §12)** · **EV — USD conversion layer (DOM-94, §13)**
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

**Q1 — Can paid Stamina out-earn its price? BOUNDED BY DESIGN as of DOM-69/76 (§12).**
The exposure was real: at the band ceiling (p = 0.70, empty wallet) fight EV vs the best
enemy is large, and a refill-to-max scales with the pool — a skill-built 60 pool made one
$0.99 refresh worth ≈33.6 hours of top-job income, and the shrinking-pile rule does NOT cap
it (enemies pay fixed catalog rewards; nothing shrinks). Resolution: the SKU is a **fixed
+3 grant** (the starting pool), so the mint per purchase is pinned at ≈1.7 hours of top-job
income at the very top band and pool investment no longer multiplies it. The sim reads the
grant live from `data/monetization.json` and throws if the SKU regresses to a refill.
Remaining softeners unchanged: defeats hospitalize mid-burst, and EV decays to 0 at the
break-even wallet. Numbers regenerate with every sim run.

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
| F2 | **Spots as built are a $127k/h tap-farm** (full income per tap, 60s min). No accrual rate exists in tuning — the intended collect-on-login model cannot be tuned until DOM-74 defines one. **RESOLVED 2026-09-11** — the DOM-74 pass (§9) replaces per-tap income with cap-clamped accrual; the tap-farm is structurally gone. | ~~DOM-74~~ closed |
| F3 | **Health, not Stamina, paces fighting**: at p=0.5 health regen sustains ~5.6 fights/h vs stamina's 20/h. The Hospital/heal loop is the real combat governor — price heals accordingly. **RESOLVED 2026-09-12** — the DOM-72 pass (§11) makes this the design: the Hospital timer gates free fighting at ~4/h and the priced early-out is the recurring combat drain. | ~~DOM-72~~ closed |
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
  *(Delivered by DOM-72, §11 — ATK/DEF are solved to the p0 matchup; HP stays the display trend.)*
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

## 8. DOM-88 decision record — 2026-09-11

The gear upgrade track (DOM-79 layer 2) shipped against the DOM-73 catalog. Everything except the
cost ratio was already ratified (DOM-79: `statCapLevel` 10 hard, layer 2 before layer 3;
`duplicatesRequired` false until drops feed duplicates). What DOM-88 settled:

- **Cost ratio 1.6 confirmed by the simulator** (§C2 of the report): because DOM-73 prices items
  as hours-of-income at their gate, upgrade costs are band-invariant in player-time — first
  levels on a kit ≈ 28h, kit to LV 5 ≈ 20 committed days, kit to the stat cap ≈ 235 days, each
  prestige level beyond ≈ months of maxed income. 1.4 lets the cap arrive in ~90 days and cheapens
  prestige; 1.8 turns LV 5 into a 29-day mid-game wall.
- **Q2 (inflation, "nothing left to buy") is resolved**: past the one-time catalog the geometric
  prestige ladder always offers a next level. The one-time-sink "outgrown in 2.1 days" reading in
  §3 is now historical.
- **Save schema v4**: inventory is a per-instance map (`{id: {level, duplicates}}`), migrated from
  the v3 array with golden-file tests. Stats bank incrementally on upgrade, capped at LV 10;
  prestige levels are display-only and public on the Profile projection.

Still open, owners elsewhere: duplicates as an upgrade input (needs drop-fed duplicates — drops
currently skip owned items per 08 §9.3); server-side upgrade validation (gameplay server);
matchmaking consuming the inflated stats (DOM-72).

## 9. DOM-74 decision record — ratified 2026-09-11 (Jake)

| # | Decision | Ratified |
|---|---|---|
| 1 | Lootability | **Uncollected Spot cash is NOT lootable in v1.** It sits outside the wallet until collected; the combat loot base reads `G.cash` only. The level-gated cap bounds the shelter to a fraction of one break-even wallet, and a full bank earns nothing, so never-collecting self-defeats. Revisit with server-owned settlement. |
| 2 | Ownership | **Own-once ladder to L110.** Flat-price BUY MORE stacking is gone (income linear in spend at constant payback = unbounded faucet). Legacy multi-copy saves keep counts honored. |
| 3 | Income size | **Supplement: ~10% of the gate's best-job $/h per spot, ~7-day payback** at once-daily full-bank collects at the gate. Payback lands at exactly 7.0d at all 16 gates. |
| 4 | Offline cap | **Keep the shipped curve**: `spotOfflineCapSeconds` linear, 1h at L1 + 10min/level (≈2.5h L10, ≈9h L50, ≈19h L110). The cap is the leash; the rate only prices a session. |

**F2 (the $127k/h tap-farm) is resolved**: per-tap income is replaced by per-spot accrual
(`rate × min(elapsed, cap)`), the client shows a FULL bank earning nothing, and collect is one
`spot_collect` ledger row. `spots.collectMinimumSeconds` is deleted from tuning — accrual is the
pacing, not a tap cooldown.

**Accepted hump:** the summed ladder rate peaks at ~33% of job rate around L10–L20 and settles to
~16% from L50; per-spot share is 10% at the gate as ratified. Jobs stay the primary faucet at
every level. Committed daily spot income at cap ≈ $115M/day vs $635M/day from jobs.

Still open, owners elsewhere: spot upgrade tiers (`spots.upgradeEnabled` stays false — a future
ticket if wanted), server-side accrual timestamps (client clock is trust-bounded by the cap, same
argument as the regen engine), notification timing tied to time-to-cap (nice-to-have).

## 10. DOM-68 close-out — 2026-09-11

The Cash hub ticket, closed as a reconciliation pass (its faucet/sink scope shipped via DOM-79,
DOM-71/81, DOM-73, DOM-88 and DOM-74). Settled here:

| # | Decision | Outcome |
|---|---|---|
| 4 | Reroll fee | **Escalating, first free** (ratified) — the authored `loot.rerollFee` curve (base $50, ×1.05) stands as data; wiring lands with DOM-72's matchmaking. |
| 5 | New-player floor | **No mechanism** (ratified) — a full starting losing streak costs ~$326, recovered in minutes of L1 job income; matchmaking's easy-end bias is the safety net. Revisit on DOM-78 churn telemetry only. |
| 6 | `defeatLossCap` | Stays **null** (DOM-79) but is now **wired** in `combat.js` — capping is a tuning change, not a release. |

**Circuit balance (the ticket's core question): YES.** Sim §C3 shows committed inflow vs band
sinks converging to ~8.4 days-to-clear at every gate from L10 (L1 trivial by design), the
break-even wallet scaling with the band, and the money supply reconciling as Σ credits − Σ debits
with no transfer rows. Found and fixed in the audit: defeat losses displayed as "Lost $-N"
(`debit()` returns the negative applied delta).

Every settlement rule audited against the code: loss = rate × current balance at resolution ✓,
single writer ✓, ledger row per movement ✓, attacker loses on the same rules ✓ (there is only one
fight path), rewards scale with opponent band ✓ (DOM-71/81 pricing).

## 11. DOM-72 (+ DOM-82) decision record — ratified 2026-09-12 (Jake)

Turn-based combat and the Hospital, with the catalogs re-solved against the new pacing. Full
mechanics record: 08 §9.8. The pacing-relevant facts:

- **Fight cadence is Hospital-gated now**: a defeat hospitalizes (30-min timer, regen paused), so
  free fighting runs at `1/(1−p0)` fights per lockout ≈ **4/h** (was 5.6/h health-regen-gated).
  Stamina caps the paid path at 20/h; the Cash early-out (~1h of best-job income, prorated) is
  the recurring combat drain F3 predicted — F3 resolved as designed.
- **The re-solve reproduced E/M/K exactly** (0.6847 / 0.0010 / 0.0803): casual 8/26/41 at days
  1/7/30, committed L120 = 365 days, mix 63/37 at every checkpoint. The win-clout ratio moved
  3.01 → 4.20 — rarer fights pay more Clout each, same mix.
- **Enemy stats are real now**: solved (×~1.14 of the band loadout) so band matchups sit at
  p0 = 0.5 (46–53% verified at L10/50/110; L1 ~97% deliberate onboarding softness). The
  "extrapolations, DOM-72 owns them" caveat is closed.
- **Q1 note**: with stamina now the paid-path limiter, the $0.99 refresh question (DOM-69/76)
  gets *more* urgent — a 60-stamina refresh is ~33.6h of top-job income in fight EV at the cap.
- DOM-82 rides along: level-up clears the Hospital in the refill transaction (option 1 — banking
  a level as an escape hatch is accepted play; ceiling is one level's worth).

Still open, owners elsewhere: the matchmaking SEARCH surface (served shortlist + reroll wiring —
`matchmaking.*` tuning exists, nothing reads it; needs its own ticket), premium heal SKU
(DOM-69/76), server-side fight resolution (gameplay server).

## 12. DOM-69 / DOM-76 decision record — ratified 2026-09-12 (Jake)

Stamina audit + monetization v1. Mechanics record: 08 §9.9. The pacing-relevant facts:

- **Q1 closed — the stamina mint is bounded by SKU shape, not by pool caps.** All three
  refresh SKUs are direct purchases (no hard currency); the two pool SKUs are **fixed-point
  grants sized to the starting pools** (`boost_stamina` +3, `boost_moves` +10, both $0.99
  mock). The rejected refill-to-max scaled to ≈33.6h of top-job income per purchase on a
  skill-built 60 pool (moves cap 200 scales the same way). A fixed +3 boost ≈ 1.7h of
  top-job income at the very top band — bounded, visible in the ledger (`iap_grant`), and
  repeat purchases stay linear rather than pool-multiplied.
- **The heal SKU stays a refill** ($1.99 mock): its value is the wait it skips, and it must
  undercut the perceived cost of the Cash early-out (~1h of income, prorated) or it won't
  sell. A paid heal while hospitalized discharges the Hospital in the same effect.
- **Hospital regen**: stamina and moves keep regenerating during a stay; only health pauses.
  The lockout is the punishment — a discharged player re-engages immediately. Pinned by test.
- **DOM-69 was an audit**: every locked rule was already live (pool 3, 180s/1 regen via the
  shared engine, 1 debit at fight entry from DOM-72, no refunds, level-up refill, 2 skill
  points per +1 — the deliberately expensive stat). Now pinned as data-contract tests,
  including the code-shape pin that the single stamina debit sits before the round loop.
- **Offer surfacing is the product**: refusal gates raise the offer sheet (per-pool cooldown
  `monetization.offerCooldownSeconds` = 300s), the Hospital card carries SKIP THE WAIT for
  the whole stay. Searching costs no Stamina — trivially true today (the search surface is
  the open matchmaking ticket) and recorded so the ticket's rule survives that build.
- **Still open**: server-side SKU → grant mirror + receipt flow hardening (DOM-80), premium /
  limited-supply gear (split to its own ticket: supply model, power ceiling, art), purchase
  frequency caps if live telemetry ever argues for them.

## 13. EV — equivalent value in current-day USD (DOM-94, ratified 2026-09-12, Jake)

One conversion that expresses any Cash amount in USD, bolted onto the simulator (§E in
`sim.js`, tables at the bottom of the dashboard). Three ratified constructions:

- **Anchor = the cheapest SKU path to Cash**: the EV rate at level L is the most Cash one real
  dollar buys — today the stamina boost (+3 fights × empty-wallet fight EV per $0.99); the
  moves boost is the second anchor and the rate picks whichever yields more. The rate is read
  live from `data/monetization.json`, so re-pricing a SKU re-prices EV.
- **"Current day" = a function of level**: fight EV and job payouts scale with the band, so
  $1 buys ~500 Cash at L1 and ~$35.6M at L110. The table shows L1/10/50/110 rows.
- **Free earn rate = the committed zero-spend profile** — the same movesUse/staminaUse shares,
  spot collects/day and Hospital cadence as the pacing targets, with fight income at the
  empty-wallet bound the rest of the report uses.

Headline results at ship (regenerate with the sim — never quote these against newer data):

- **A committed free day is worth ≈ $37–40 of EV at every band** — level-invariant by
  construction, because the SKU anchor and the earn rates scale with the same fight/job EVs.
  This is the free-vs-paid exchange rate: a dollar spent buys about 36 minutes of committed
  play's output (`$0.99 ≈ 1.7h` of the fight faucet alone).
- **Total cost of game** (one-time completionist sinks, priced at the cap band): gear catalog
  ≈ $37.60 EV (0.9 free days), the Spots ladder ≈ $17 EV (0.4 days), and the gear upgrade
  track to the LV-10 stat cap dominates at ≈ **$6,828 EV ≈ 170 free days** — the upgrade sink
  is 99% of the game's total EV, which is exactly its DOM-88 job (the endgame drain).
- Recurring drains (Hospital heals, reroll fees, defeat losses) are deliberately excluded from
  "total cost of game": it measures what a completionist banks, not what churn eats.

---

## 14. DOM-75 decision record — Crew, capacity & loadout (ratified 2026-09-13, Jake)

**The second power economy is live: Cash buys items, only Crew buys the right to field them.**
Four ratified decisions (full record: 08 §9.10): combat stats **derive from the fielded
loadout** (nothing banks; v4→v5 migration un-banked every save); slot growth is **+1 per 5
Lieutenants, round-robin weapon → armor → vehicle, hard cap +3 per type** (max 4 fielded per
type at 45 Lieutenants — the game's power ceiling, deliberately bounded); the **flat
per-Lieutenant ATK/DEF bonus is retired**; the Profile gear tab runs on the real catalog.

Pacing consequences, from the re-solve:

- **The expected loadout is now the best item per type at the band** (zero-crew baseline, one
  slot per type), not "everything owned". Enemy ATK/DEF re-solved **per enemy** against real
  HP so the band matchup sits at the pricing nominal p0 at every gate — the previous single
  multiplier only held because the generator's stat curve was broken (`STAT_RATIO_PER_10`
  lacked `atk`/`def`, shipping a zero-stat gear ladder above L7; fixed at ×1.40 per 10 levels,
  matching its own comment).
- **Nothing else moved**: E/M/K knobs re-solved to identical values (0.6847 / 0.0010 / 0.0803),
  jobs, spot rates and all prices byte-identical, and the §13 EV table is unchanged ($1 = 511
  Cash at L1; committed free day ≈ $37–40 at every band) — rewards and prices never read enemy
  stats.
- **Crew is now real, bounded power**: a full 45-Lieutenant crew fields 4 weapons / 4 armor /
  4 vehicles against a solve that assumes 1 of each — roughly a fourfold gear-stat advantage at
  band, earned only by recruiting. This is the one axis a spending player cannot shortcut, by
  design. Premium gear (DOM-92) must respect the same slot capacity.
- **Buying every item is now collection + prestige, not stacking power** — the DOM-88 upgrade
  sink keeps its EV-dominant role (upgrades still price per item; only fielded items' upgrades
  carry combat weight). If upgrade-sink appetite drops because benched items no longer add
  power, that shows up in DOM-78 telemetry as slower late-game drain — flag for retune then,
  not now.
- The Lieutenant qualification test ("installed and played", self-invite-farm resistance) stays
  open with DOM-77/DOM-80 — the client counts JestSDK referrals and can do no better alone.

---

## 15. DOM-90 decision record — Plug quests (ratified 2026-09-14, Jake)

**Quests are flavour-led direction, not a faucet.** Full record: 08 §9.11. The pacing-relevant
construction: quest steps route through the normal job/fight faucets (grinding a quest IS
playing the ladder, so the 60:35 mix holds by construction), and the one-shot completion bonus
is priced at `hours` of best-job income at the quest's gate — the five-quest v1 catalog tops
out at 3h (vs the 8h break-even anchor) and adds **$10,155 Cash + 932 Clout lifetime
(0.001% of the Clout curve)**. EV of the whole catalog ≈ $8 — quests point the player at
content; they cannot shortcut it. The simulator re-derives every bonus from the rule and
throws on drift, so a hand-edited quests.json cannot silently out-pay a band.
