# Combat System & Economy — High-Level Requirements (v5)

> **Naming & feature definitions** (Cash/Clout/Stamina/Moves/Health, Opps, Plugs, Crew/Lieutenants, Spots, The Hood, Player Profile, Monetization, and the code-migration map) live in [`oppsDefinitions.md`](oppsDefinitions.md). This doc covers the **combat system and economy mechanics**.

## Overview
An asynchronous, Mafia Wars–style combat game. Players scan a map for targets and fight them in **turn-based combat** (rounds of attacks against Health pools), progressing through an interlocking economy of **Cash** (spendable, always at risk), **Clout** (permanent progression), **Stamina** (fight pacing), **Moves** (PvE pacing), and **Health** (combat survivability). Target selection is random within a **win-rate band** — targets the attacker would beat between 35% and 70% of the time — drawn from a hidden **blend of real players and bots**. Early-game matchmaking biases toward easier targets so the game feels good, tapering to genuine PvP difficulty as the player progresses.

---

## Economy

### Cash — the spendable, at-risk currency

> **DECISION 2026-09-11 — combat is settled against snapshots, not live players.** An opponent is a
> record: a blend of generated bots and stored snapshots of real players, indistinguishable in play.
> **Nothing is ever debited from the real player behind a snapshot.** Winning **mints** Cash;
> losing **destroys** a proportion of your own. Fight loot is no longer a transfer between wallets,
> which removes the need for any server-authoritative balance — see
> [`specs/08-economy-schema.md`](specs/08-economy-schema.md) §8. Statements below are corrected to
> match; the superseded wording is noted where it mattered.

- Earned by winning fights: a reward **scaled to the opponent's power**, minted rather than taken.
  *(Superseded: "the winner takes 10% of the loser's Cash on hand".)*
- Lost by losing fights, whether attacking or defending — a proportion of **your own** Cash,
  destroyed rather than paid to anyone.
- **All Cash is at risk at all times.** No bank in v1. The defense against loss is spending it on gear.
- Cash sinks: **gear** (from Plugs), **Spots** (buying/upgrading passive-income properties), **target-search rerolls**, and **healing** out of the hospital. Premium/limited gear is a planned future sink — see Monetization (in the Definitions doc).
- **Passive income exists via Spots** (this reverses the earlier "no passive income" call): Spots generate Cash over time; you must log in to collect, and your **max offline accrual is gated by level/skills**.
- **Fighting has a break-even balance.** An absolute win reward against a proportional loss means
  a fixed reward cannot keep pace with a percentage of a growing wallet: below break-even fighting
  mints Cash, above it fighting destroys Cash, forever and without tuning. This is now the economy's
  main long-run drain and it replaces the planned loot burn entirely.
  *(Superseded: "the 10% cap is self-limiting against farming" — that reasoning depended on the
  loser's pile shrinking, which no longer happens.)*
- **The reward MUST scale with the opponent's power.** A win mints Cash from nothing, so steering
  toward weak opponents is an uncapped faucet, and it costs the target nothing — nothing
  self-limits it. Scaling the reward is what makes band-gaming unprofitable.

### Clout — permanent progression
- The overall progression stat. **Clout only ever goes up.**
- Fed by all systems: winning fights (large gain), losing fights (small consolation gain), completing **Moves**, and recruiting **Crew Lieutenants**.
- Clout thresholds define **player level**, which gates gear tiers, **Moves tiers**, and the **Spots offline-income cap**.
- **120 levels total.** Clout-per-level follows an **exponential curve** (4X-style progression): each level costs meaningfully more than the last, so early levels come fast and late levels are a long grind. Exact base/multiplier TBD.
- **Leveling up fully refills Stamina, Moves, and Health** (a level-up also gets you out of the hospital).

### Stamina, Moves & Health — pacing + combat resources
Values below mirror Mafia Wars' economy (from memory — treat as tunable defaults, verify against archived data if fidelity matters):

| | **Stamina** (fights) | **Moves** (PvE actions) |
|---|---|---|
| Starting pool | 3 | 10 |
| Regen rate | 1 per 3 minutes | 1 per 5 minutes |
| Cost per action | **1 per fight** (not per round) | Varies per Move (1–20+ by tier) |
| Refill on level-up | Full | Full |

**Health — the combat HP pool (Mafia Wars–style).**
- Health is your **hit points in a fight**. Each round both sides deal damage; Health decides how many hits you survive.
- Health **regenerates over time**; a level-up fully refills it.
- Reaching **0 Health = defeated → hospitalized**: you can't fight until healed. Healing happens via time, **Cash**, or premium (see Monetization / hospital, below).
- Health is a **skill-point stat** (see below) — this is what enables the **tank / durability** build.

**Pool growth — skill points (the Mafia Wars model):**
- Each level-up grants **5 skill points** the player allocates freely.
- Costs: **+1 max Moves = 1 point; +1 max Stamina = 2 points** (stamina is deliberately expensive); **+1 max Health = 1 point**; base **Attack / Defense = 1 point each**.
- **Confirmed:** growth is *player-allocated* via skill points (replaces v4's "pools grow automatically with level"). This creates build identity — **fighter vs. grinder vs. tank**. Locked.

### Resource Flow Summary
```
Stamina ──1 per fight──▶ Fight (turn-based rounds vs an Opp)
  Fight ──reduce foe's Health to 0──▶ WIN: + reward scaled to the Opp (minted) + Clout
  Fight ──your Health hits 0────────▶ LOSE: −10% of own Cash (destroyed), small Clout, hospitalized
  Fight ──run away (small fail chance)▶ ends, no Cash won or lost
Health ──0──▶ Hospitalized ──heal (time / Cash / premium)──▶ back in action
Moves ──spent──▶ Moves (PvE) ──▶ Cash + Clout + gear items
Cash ──spent──▶ Gear (from Plugs) ──equipped──▶ Attack / Defense / Health
Cash ──spent──▶ Spots ──generate──▶ Cash over time (offline cap gated by level)
Crew invites ──▶ Lieutenants ──▶ Gear-equip capacity in combat
Clout ──▶ Level-up ──▶ +5 skill points, full Stamina/Moves/Health refill,
                       gear tiers, Moves tiers, Spots offline cap
```

---

## Combat System

### Core Loop
1. Player taps **Search** (in The Hood) — the matchmaker snaps them to a single eligible target in their win-rate band (first search free).
2. The target card shows **win rate** and **amount of gear** only — raw Attack/Defense/Health are hidden. Don't like it? Tap **Search** again to reroll to a new target for a **nominal Cash fee** (no Stamina cost).
3. Player taps **Attack** — spends **1 Stamina to enter the fight** (one charge for the whole battle, not per round) — then fights the target's snapshot turn-based: each round they choose **Attack** or **Run**, and the (simulated) opponent counterattacks. The fight ends when someone's Health hits 0 or the player runs.
4. Results (win/loss, Cash gained/lost, Clout gained, Health left) shown to attacker; defender is notified asynchronously.

### Target Search — scan flow & intel (U1)
- **Clash of Clans–style search.** Tap Search and you're snapped to a single eligible raidable target (win-rate band) — not a browsable list, no active matchmaking queue. (The *feeling* of being good — hitting bots you think are players at a high win rate — is the Clash Royale influence; see the PvE/PvP blend below.)
- **Searching costs no Stamina.** The first search is free; each **reroll costs a nominal Cash fee** (a small Cash sink — amount is data). Stamina is spent only to **enter a fight** (1 per fight).
- **Intel shown on the target card:**
  - **Win rate** — the estimated probability the attacker wins the turn-based fight against this target.
  - **Amount of gear** — how much gear the target is bringing (loadout size), as a rough "how equipped are they" signal.
  - Name + portrait for flavor.
- **Hidden from the player:** raw **Attack / Defense / Health** values. Win rate is the only quantified strength signal — it deliberately abstracts the underlying stats.
- **Reroll behavior:** each reroll issues a fresh matchmaking query and should avoid immediately re-serving the just-declined target so rerolls feel fresh.
- **Target hold:** once shown, the target's snapshot is held for the fight, so it resolves against the stats the player was shown.

### Combat Resolution — turn-based rounds (Mafia Wars–style)
- **Combat plays out in rounds, not a single roll.** Both combatants have **Attack**, **Defense**, and a **Health** pool (base + skill points + gear).
- **Still asynchronous.** The attacker is live and makes a choice each round; the **defender is offline and simulated by the server** from their snapshot (Attack, Defense, Health, loadout). The defender auto-attacks — they never need to be online.
- **Stamina cost:** entering a fight costs **1 Stamina** — a single charge for the whole battle, regardless of how many rounds. Running or being defeated doesn't refund it.
- **Round structure:**
  1. **Start of round — Run option.** The attacker may **run away**. Running **usually succeeds** but has a **small chance to fail**; on failure the round proceeds and the attacker still takes the opponent's hit. A successful run ends the fight with **no loot exchange** (no Cash won or lost).
  2. **Attacker's hit.** If not running, the attacker attacks, dealing damage to the opponent's Health. (No per-round cost — Stamina was spent once on entering.)
  3. **Opponent's counter.** The simulated opponent attacks back, dealing damage to the attacker's Health.
  4. **Next round** — the attacker again chooses **Attack** or **Run**. (Additional moves — items, specials — are a possible later addition; v1 is Attack / Run.)
- **Damage per hit** scales with the attacker's **Attack** mitigated by the opponent's **Defense**, plus a small random spread; Health decides how many hits you can take. See **Combat Math (proposed)** below for the formula.
- **End conditions:** a combatant's Health hits **0** → they are **defeated**. Or the attacker **successfully runs**.
- **Settlement:** the **winner** gains a Cash reward scaled to the opponent plus Clout; the **loser**
  loses **10% of their own Cash** and is **hospitalized**. Only the present player's wallet is
  touched — see the decision note under Economy. Note the attacker can **lose** (their own Health
  hits 0 first) — attacking is genuinely risky, and **Run** is the tool to cut losses mid-fight.
- **The Hospital.** Being defeated sends you to the **Hospital**: your Health is depleted, you **cannot fight**, and you are **shielded from incoming attacks** while hospitalized. That shield doubles as the **offline-farming cap** — a swarm can only beat you down to hospitalized, after which you're protected. You leave by healing: **passive regen over time**, or pay **Cash / premium to heal faster** and get back in the fight (a monetization hook). Exact heal cost/time is tuning.
- **Cash settlement at resolution (S2):** the **losing player's** Cash is debited when the fight
  resolves — 10% of their *current* balance, never pre-reserved. Because only the present player's
  wallet is written, this is a local, single-writer operation: **no atomicity, server authority or
  serialization across concurrent attackers is required.** A player cannot be attacked while
  offline, so there are no concurrent writers to their balance at all.
  *(Superseded: "atomic, server-authoritative, serialized across concurrent attackers" — that was
  required only by the transfer model.)*

### Combat Math (proposed — confirm with eng) *(owner: Jake)*
*Proposed model; the **shapes** are the proposal, the **constants** are tuning data.*

**Per-hit damage** — a ratio/mitigation model (smooth, never zero, so fights always terminate):
```
damage = round( (A² / (A + D)) × rand(1 − s, 1 + s) )      # floored at 1
```
- `A` = attacker Attack, `D` = defender Defense. The counter-attack swaps roles (defender's `A` vs attacker's `D`). `s` = random spread (≈ **0.15**). When `A = D` each hit does `A/2`; as `D → 0`, damage → `A`.

**Win-probability estimate** — closed form, used for **both** the target-card win rate and matchmaking (no simulation needed). Attacker `(Aₐ, Dₐ, Hₐ)` vs defender `(A_d, D_d, H_d)`:
```
DA = Aₐ² / (Aₐ + D_d)           # attacker damage per hit
DD = A_d² / (A_d + Dₐ)           # defender damage per hit
Tₐ = H_d / DA ;  T_d = Hₐ / DD   # hits-to-kill each way
ρ  = T_d / Tₐ                     # kill-time ratio (>1 ⇒ attacker kills faster)
P(win) = σ( β · ln ρ + b )        # σ = logistic; β ≈ 2 (band-width knob); b ≈ +0.1 (first-strike edge)
```
- `ρ` collapses all six inputs into one scalar. Example: `(A100,D50,H200)` vs `(A80,D60,H180)` → `ρ ≈ 1.41` → `P(win) ≈ 69%`.
- The **35–70% band maps to `ρ ∈ [0.73, 1.53]`** at β = 2 — skewed above 1.0, i.e. the intended attacker-favored/feel-good tilt. `β` is the single knob for band width.
- **Tuning data:** `s`, `β`, `b`, and the damage scale — all live in the tuning config.

### Matchmaking — win-rate band
- Matchmaking targets a **35–70% win-rate band**: eligible targets are those the attacker would beat between 35% and 70% of the time (`P(win) ∈ [0.35, 0.70]`).
- **Win probability comes from the closed-form estimator** in Combat Math above (`P(win) = σ(β·ln ρ + b)`) — a function of both parties' Attack/Defense/Health. The **35–70% band = `ρ ∈ [0.73, 1.53]`** at β = 2.
- **Finding the band (proposed): shortlist coarse, then filter exact.** `ρ` isn't separable (the mitigation term couples both players), so there's no single-column range query. Instead:
  1. Precompute a coarse **Combat Power** proxy per player/bot — `CP = A × (H + D)` — stored in the index.
  2. **Shortlist** targets within a generous CP band around the attacker (e.g. ±40%) — a simple indexed range scan.
  3. **Exact-filter** the shortlist with `P(win)`, keeping those in `[0.35, 0.70]`.
  4. **Select** one via the progression-weighting below.
  Matchmaking returns a **single** target, so the shortlist stays small and the exact filter is a few ops per candidate — tractable. `CP` only needs to correlate with strength; the exact `P(win)` does the real gatekeeping, so glass-cannon-vs-tank matchups (same `CP`, different real win rate) resolve correctly at step 3.
- Within the eligible band, selection is **progression-weighted**: early game biases toward the easy (70%) end so wins come readily and the game feels good; the weighting flattens/centers as the player levels up. **The combat model never changes — only the selection weighting does.**
- No heat, no cooldowns, no recency weighting, no revenge mechanics, no new-player shields.

#### PvE/PvP blend — the Clash Royale feel
The **Clash Royale** influence is the *feeling of being good early*: you hit bots you believe are real players, at a high win rate, and it feels great. (The **search/target flow itself** is the **Clash of Clans** model — tap to get matched to a raidable target — see Target Search.) The map is presented as pure PvP, but the target pool is secretly a **mix of real players and bots**, both drawn from the same win-rate band and **indistinguishable** (same intel, rewards, and UI; bots carry real, varied stats — see Data Designs).

> **Bots hold no Cash** (decision 2026-09-11). Every opponent is a snapshot, so nothing is ever
> debited from one — a win **mints** its reward from the opponent's power, and there is no wallet
> on the other side to draw it from. A bot and a real-player snapshot are therefore the *same kind
> of object*: stats, a loadout, a name, and a `CP`. The only difference is where the row came from.
- **Bots are NOT pinned to a fixed win rate.** Forcing every bot to, say, 65% would make PvE targets obvious. Instead, bots carry varied, realistic stats and populate the band like players; each bot's win rate lands wherever its stats sit relative to the attacker's.
- **Early game feels good because matchmaking serves easier targets** — and the easy end of a new player's band is disproportionately bots. As the player levels, both the weighting and the pool composition shift toward harder, increasingly real-PvP fights.
- **Empty-band fallback:** if no eligible real players exist in the band, the scan serves a bot.

### Gear
- Gear items carry **Attack and/or Defense** values (and may carry **Health** — e.g. armor/safe-house-type items).
- Equipped gear is pulled into combat stat totals automatically.
- **Gear brought to combat is capped by Crew size (number of Lieutenants).** More Lieutenants = more gear slots, but the growth is deliberately **slow** to keep recruiting valuable over the long haul.
- **Slot growth:** every **5th Lieutenant** adds **+1 slot of a single gear type**, and the gear type **rotates** as Lieutenants are added (e.g. weapon → armor → vehicle → weapon…). Exact rotation order and long-tail curve TBD.
- Purchased with Cash (from Plugs); higher tiers gated by level.
- *(Crew/Lieutenants, the loadout screen (Player Profile), and Plugs are defined in [`oppsDefinitions.md`](oppsDefinitions.md).)*

---

## Locked Decisions
*Combat & economy decisions live here; **feature & naming decisions** are in [`oppsDefinitions.md`](oppsDefinitions.md).*

1. All Cash at risk — no bank in v1.
2. Pacing/combat resources: **Moves** (PvE, 1/5 min, pool 10), **Stamina** (fights, 1/3 min, pool 3, **1 per fight** — not per round), and **Health** (combat HP pool, regenerates over time).
3. Level-up refills **Stamina, Moves, and Health**, and grants 5 skill points (Moves 1pt, Stamina 2pts, **Health 1pt**, Attack/Defense 1pt each).
4. Loot: winner takes **10% of loser's Cash on hand**; loser loses 10% and is hospitalized.
5. **Combat is turn-based (Mafia Wars–style rounds)** — *not* instant. Both sides have Attack, Defense, and **Health**. Entering a fight costs **1 Stamina** (once per battle, not per round). Each round the attacker chooses **Attack** (deal damage) or **Run** (usually succeeds, small fail chance, ends the fight with no loot); the offline defender is **simulated from their snapshot** and counterattacks. A side is defeated when its **Health hits 0**.
6. **Health is in the game** and is a skill-point stat — enabling the **tank / durability** build (the third axis alongside grinder and fighter).
7. **The Hospital** (confirmed feature): defeat depletes Health and sends you to the Hospital — you **can't fight** and are **shielded from incoming attacks** (this is the offline-farming cap). Heal via passive regen, or pay Cash/premium to speed it up.
8. Matchmaking is a **win-rate band** (35–70%); win probability is the **estimated turn-based outcome** over both parties' Attack/Defense/Health. Selection within the band is **progression-weighted** (easier early).
9. Target pool is a **hidden PvE/PvP blend**. **Search flow = Clash of Clans**; **feel-good early game = Clash Royale**. Bots are **indistinguishable** from real targets — real, varied stats, **NOT pinned to a fixed win rate**. Bots also cover the empty-band fallback. **Bots hold no Cash**: rewards are minted from opponent power, so there is no balance to hold.
10. Bots are a **preloaded list of persistent entities** (stats only) in the same matchmaking pool as players — not instanced per scan. Persistence is for *matchmaking stability*, not for holding a balance: a player who scans twice should meet a consistent world.
11. Loser's Cash is debited **at combat resolution** — 10% of their *current* balance, never pre-reserved.
12. No heat, no revenge mechanics, no new-player shields.
13. Fights do not drop items in v1.
14. Pool growth is **player-allocated skill points** (not automatic).
15. **120 levels**, Clout-per-level on an **exponential curve** — `round(100 · 1.10^L)`, retuned from r ≈ 1.05 on 2026-09-11. Shipped in `data/progression.json`; params in `tuning.progression.cloutToNext`.
16. **Target search:** Search snaps to a **single** eligible target showing **win rate + amount of gear** (raw Attack/Defense/Health hidden). Searching costs **no Stamina**; the first search is free and each **reroll costs a nominal Cash fee**.

## Open Questions
1. Moves structure: tiers, Moves costs, payouts, item drop tables? *(owner: Jake)*
2. **Snapshot capture trigger & staleness rules** — when a defender's snapshot (Attack/Defense/Health/loadout) is written/refreshed and how stale it may get. *(owner: Bill)*
3. **Combat tuning** *(data)*: constants for the proposed combat math (`s` spread ≈0.15, `β` band-width ≈2, `b` first-strike ≈0.1), the damage scale, Health values, **run-away success rate**, and hospital **heal cost / heal time**.
4. **Confirm the combat math + matchmaking approach** (proposed in Combat Math / Matchmaking): validate the ratio damage model and closed-form `P(win)`, and that `CP = A×(H+D)` is a good enough shortlist proxy (+ pick the shortlist width). *(owner: Jake)*
5. Crew/Lieutenant slot rotation order (weapon/armor/vehicle/…), long-tail curve, and hard cap vs. diminishing returns.
6. ~~Clout curve~~ **— curve CLOSED 2026-09-11**: `{"base": 110, "ratio": 1.1}`, all 120 rows shipped in `data/progression.json` (source of truth). Still open: **per-source Clout yields** (win/loss/Move/recruit), which have not been rescaled for the steeper curve — DOM-67.
7. ~~Do bot Cash balances replenish/reset after being farmed down~~ **— CLOSED 2026-09-11 by the
   snapshot model**: bots hold no Cash, so there is nothing to farm down and nothing to replenish.
   Still open: can bots appear as *attackers* (defense-side feed), or defenders only? Note that
   under the snapshot model an incoming attack cannot debit the defender, so a defence-side feed is
   a **notification/narrative** feature rather than an economic one. *(design)*
8. Target-search details: (a) win rate as an exact % or a banded label (EASY/EVEN/RISKY)? (b) reroll fee flat or escalating? (c) also show an estimated Cash reward?
9. Spots: catalog, income rates, upgrade curve, and the level → offline-accrual-cap mapping. *(data + design)*
10. Player Profile public view: which fields are visible to other players (gear/loadout shown, raw Attack/Defense/Health hidden)?

---

## Data Designs Needed
The schemas/models that must be designed to build this system. (Draft list — refine as systems firm up.)

1. **Player / account state** — Cash (authoritative live balance — mutated by others' attacks at resolution), Clout, current level, Stamina (current/max), Moves (current/max), **Health (current/max)**, **hospitalized state + heal-ready timestamp**, base Attack, base Defense, unspent skill points, last-regen timestamps for each pool, Crew size (Lieutenant count). **No hard currency in v1.**
2. **Combat snapshot** — the stored copy of a defender's stats + **chosen loadout** → total **Attack, Defense, and Health** (the defender counterattacks and has an HP pool, so all three are needed — not just Defense). **Separate from the live Cash balance** (Cash is debited against the live balance at resolution). Capture trigger/staleness: owner Bill (see Open Questions).
3. **Gear catalog** — master item definitions: id, gear type (weapon/armor/vehicle/…), Attack / Defense / **Health** values, tier, level gate, Cash cost.
4. **Player gear inventory** — which items a player owns and which are equipped.
5. **Gear-slot capacity + combat loadout** — per-player combat slot limits derived from Crew size / Lieutenant count (rotating-type-per-5-Lieutenants rule), plus the player's **chosen loadout**: one primary item per gear type + the Crew-unlocked secondary slots, and which owned item fills each slot. The loadout is what the snapshot freezes.
6. **Matchmaking index / estimator** — index players + bots by a precomputed **Combat Power** proxy (`CP = A×(H+D)`, stored on snapshot write) for a coarse shortlist, then **exact-filter** by the closed-form `P(win)` (see Combat Math) down to the 35–70% band. Directional (attacker vs defender); `CP` only needs to correlate with strength — the exact filter does the gatekeeping.
7. **Bot roster** — a **preloaded list of persistent bot entities**, each with real stats
   (Attack/Defense/Health), a loadout, a name/portrait and a precomputed `CP`, in the same
   matchmaking pool as players. **No Cash balance** — rewards are minted from opponent power
   (see the PvE/PvP blend note), so a bot row and a real-player snapshot row are the same shape and
   the matchmaking index does not need to know which is which. Stat distribution should mirror the
   real player population so they're indistinguishable in-band. (Not generated per scan.)

   *Consequence worth the ink:* because reward is a function of opponent power alone, a bot needs
   no economy simulation of its own — no income, no spending, no decay. It is a static row.
7a. **Target intel payload** — the client-facing contract returned by a search: win rate (estimated server-side), gear amount (loadout size), name, portrait, and an opaque target/snapshot handle. **Never includes raw Attack/Defense/Health** or the PvE/PvP flag.
8. **Matchmaking selection-weighting config** — the per-level/progression weighting that biases in-band target selection toward the easy (70%) end early and flattens it with level. PvE-vs-PvP share is emergent, not a hard-coded ratio.
9. **Fight log / history** — per-fight record: attacker, opponent (snapshot or bot), outcome
   (win/loss/fled), rounds, **Cash minted on a win / Cash destroyed on a loss** (never "transferred"
   — no Cash moves between wallets), Clout gained, timestamp, PvE/PvP flag (internal only).
10. **Level / Clout curve table** — Clout threshold per level (120, exponential) and what each level unlocks (gear tiers, Moves tiers, Spots offline cap).
11. **Skill-point allocation** — per-player record of allocated points plus the global cost config (Moves 1pt, Stamina 2pt, **Health 1pt**, Attack/Defense 1pt).
12. **Crew / Lieutenants** — invite records and which invitees actually played (Lieutenants), Lieutenant count → gear-equip capacity, and Clout granted per recruit.
13. **Economy / combat tuning config** — centralized tunables: loot rate (10%), regen rates (Stamina 1/3min, Moves 1/5min, **Health regen**), starting pools, **damage formula params**, **run-away success rate**, **heal cost/time**, win-rate band bounds, selection-weighting curve, reroll fee, Spots income/offline-cap curve. Kept as data, not hard-coded.
14. **Async notifications** — records/queue for notifying a defender they were attacked (and beaten) while offline.
15. **Moves data** *(structure TBD)* — Move definitions (tier, Moves cost, Cash/Clout payout, drop tables) and per-player Moves progress/mastery.
16. **Spots data + player ownership** — Spot catalog (cost, income rate, upgrade tiers), which Spots a player owns/operates, per-Spot accrued-but-uncollected Cash, and the level → offline-cap function.
17. **Player Profile (public view)** — the publicly visible projection of a player: equipped loadout/gear to show off, Crew/Lieutenant count, level/Clout — excluding raw Attack/Defense/Health and private balances.

---

## Combat Rework — Code Notes (migration)
Health is **retained** (this reverses the earlier "remove Health" decision) and combat becomes **turn-based**. Good news: the prototype already has `health`/`maxHealth` and an HP-based fight visual, so it's **partially aligned** — the main work is turning the current auto-playing animation into an interactive round loop. Paths relative to repo root.

- **`js/combat.js`** — replace the auto-playing `Sim` (threat-based, canvas animation) with a **round loop**: each round expose **Attack** and **Run** actions; on Attack deduct 1 Stamina, deal damage to the opponent, then apply the simulated opponent's counterattack; deplete both HP pools; end on 0 HP (win/lose) or a successful Run. Win formula becomes per-hit damage (Attack vs Defense + spread), not threat.
- **`js/state.js`** — **keep** `health`/`maxHealth`; add **hospitalized state + heal-ready timestamp**. Add `stamina`/`maxStamina` (fights) alongside the `energy`→`moves` rename.
- **`js/main.js`** — level-up refills Stamina, Moves, **and Health**.
- **`js/hud.js` / `index.html`** — **keep** the Health bar; add a Stamina meter; combat overlay HP bars are now meaningful (they drive the round loop).
- **`data/gear.json` / `js/store.js`** — the Safe House `hpBonus` field is **meaningful again** (gear can grant Health); generalize so gear may carry Attack/Defense/Health.
- **Hospital/heal** — new: a heal action (time-based regen, plus Cash and/or premium speed-up). Likely lives in The Hood or the hospital surface.
