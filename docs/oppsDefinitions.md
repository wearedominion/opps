# OPPS — Naming & Feature Definitions

High-level source of truth for **what things are called** and **what each feature is** across the game. Detailed combat and economy mechanics live in [`combat-system-requirements-v5.md`](combat-system-requirements-v5.md); this doc owns terminology and feature definitions.

---

## Canonical Naming (source of truth)
These terms are locked. Legacy prototype/code terms in the right column must be migrated — see **Terminology & Naming — Code Migration** at the end.

**Currencies & core resources**

| Concept | Canonical name | Notes | Legacy code term |
|---|---|---|---|
| Spendable money | **Cash** | always at risk | `money` / "BREAD" |
| Progression stat | **Clout** | single stat; **defines level** | `xp` **+** `rep` (merge both) |
| Fight pacing | **Stamina** | 1 per fight | *(new — not in code yet)* |
| PvE pacing | **Moves** | paces non-combat actions | `energy` |
| Combat HP | **Health** | turn-based fights deplete it; 0 Health → hospitalized. Skill-point stat (enables the tank build). | `health` / `maxHealth` |
| Hard currency | **none in v1** | add later — see Monetization | `gems` (remove for now) |

**Features & screens**

| Concept | Canonical name | Notes | Legacy code term |
|---|---|---|---|
| Combat targets (PvP + PvE) | **Opps** | unchanged | `enemies` / "OPPS LIST" |
| PvE economy actions | **Moves** | non-combat gameplay | `jobs` / "MOVES" |
| Gear dealers + quest givers | **Plugs** | NPC *people*: buy gear from them **and** get quests. The "shop" and the "contacts" are the same feature. | `store` **+** `plugs.js` (merge) / "THE PLUG" + "PLUGS" |
| Invited-friends system | **Crew** | invites raise your gear-equip capacity | `crew` / "CREW" |
| Invited real players who played | **Lieutenants** | the actual Crew members | "SOLDIERS" |
| Passive-income properties | **Spots** | own/operate → Cash; collect on login; **offline cap gated by level** | `properties` / "SPOTS" |
| 3D world map + fight entry | **The Hood** | look around; holds the **Search** button | `map.js`/`map3d.js` (today "THE HOOD" tab = status hub) |
| Inventory / equip screen (public) | **Player Profile** | equip your loadout; **viewable by other players** to show off gear | `stats.js` / "STATS" |
| Recovery after defeat | **The Hospital** | where you land when beaten: can't fight + shielded from attacks; heal by time or paid speed-up | *(new; partial: `hood.js` rest action)* |

**Naming flags to confirm:**
- **Moves** names both the pacing *resource* and the PvE *feature* ("spend Moves to make a Move"). Fine if intentional; flag if the individual actions should use a different unit label.
- **The Hood** currently labels the status/activities hub in code, but now means the 3D map; the old hub's actions (collect → Spots, rest/heal → the Hospital, launder → TBD) must be redistributed.
- **Progression labeling (code issue — partly resolved).** Rank titles are now **bands** of 10 levels (`tuning.progression.levelsPerRank`), layered on the Clout-driven level, so a title lasts. Ten names reach level 90 and the top rank runs to the 120 cap. Still open: whether Rank titles stay as flavour at all, and surfacing Clout itself (the HUD now shows it as the hero figure). The prototype surfaces progression as a **Rank title** (`data/ranks.json`: Shorty → Untouchable) under the HUD label "RANK", plus a numeric level — while **Clout** (our canonical progression stat) isn't shown anywhere. Canonical naming defines **Clout → level** and never mentions Rank. Decide: keep Rank titles as flavor layered on the Clout-driven level (and surface Clout somewhere), or drop them. Touches `hud.js` / `stats.js` / `ui.js` / `index.html` ("RANK") and `data/ranks.json`.

---

## Features & Screens

### Opps — combat targets
- **Opps** are the targets you fight, covering both real players (PvP) and bots (PvE) — indistinguishable to the player. Reached via the **Search** button in The Hood.
- **You always fight a snapshot, never a live player** (decision 2026-09-11). An Opp is a record: a generated bot, or a stored snapshot of a real player's public loadout. Winning **mints** Cash; losing **destroys** a proportion of your own. **Nothing is ever taken from the real player behind a snapshot** — they are not notified, not debited, and cannot lose while offline. This is what removes the need for a server-authoritative Cash balance; see `specs/08-economy-schema.md` §8.

### Moves — PvE economy actions
- **Moves** are the non-combat gameplay: Moves-gated PvE actions and a steady source of Cash, Clout, and gear items.
- The safe progression path that complements risky fighting.
- ("Moves" is both the pacing resource and this activity — see Canonical Naming.)
- Structure TBD (Moves tiers unlocked by level, mastery bonuses, etc.). *(owner: Jake)*

### Plugs — dealers & quest givers
- **Plugs are NPC people.** From a Plug you can **buy gear** (they *are* the gear shop) **and pick up quests**. The "shop" and the "contacts" are the same feature — every Plug is both a vendor and a potential quest giver.
- Consolidates the prototype's separate "THE PLUG" store and "PLUGS" contacts screens into one.
- Gear is bought with Cash; quest structure/rewards TBD (ties into Moves + drop tables).

### Crew & Lieutenants
- **Crew** is your invited-friends system. **Lieutenants** are the real people you invited who actually installed and played — only they count.
- Your Lieutenant count drives a **per-player stat: gear-equip capacity in combat** (and grants Clout on each successful recruit).
- **Every 5 Lieutenants = +1 gear slot of a rotating type.** Growth is intentionally slow so recruiting stays rewarding indefinitely. (Slot mechanics detailed in the Combat doc's Gear section.)
- TBD: exact rotation order, long-tail curve, and whether there's a hard cap vs. diminishing returns.

### Spots — passive income
- **Spots** are places in the world you can **own and operate** to generate **Cash** over time.
- Income is **not fully idle** — you must **log in to collect**. Cash accrues while offline only up to a cap.
- **Max offline accrual is gated by skills → level:** higher level raises how much Cash a Spot can bank before you have to collect. This is the pacing lever that keeps players logging in.
- Spots are bought/upgraded with Cash (a Cash sink) and pay Cash on collect (a Cash source).
- ⚠️ **Reverses the earlier "no passive income in v1" decision** — Spots are now an intended v1 system.
- Structure TBD: Spot catalog, income rates, upgrade curve, and the exact level → offline-cap mapping *(data)*.

### The Hood — the world map
- **The Hood** is the 3D map of the world. Players enter it to look around and explore.
- The **Search** button (target matchmaking for fights) lives here — the Hood is the entry point to combat.
- Migration note: in the current prototype "THE HOOD" is a separate status/activities hub and the map is its own tab. On migration these merge — the **map becomes the Hood**, and the old hub's actions move to their real homes (collect → Spots; rest → removed with Health; launder → TBD).

### Player Profile — inventory & equip (public)
- The **Player Profile** is where you view your inventory and **equip your gear loadout** (the primary + Crew-unlocked secondary slots).
- The Profile is **viewable by other players** — it's how you show off your gear. Design a public-facing view (what others see vs. self); raw Attack/Defense stay hidden per the combat-intel rules.
- Replaces the prototype's read-only "STATS" tab, adding equip functionality and public visibility.

### The Hospital — recovery after defeat
- When you're **defeated in a fight**, you're sent to the **Hospital**: your Health is depleted, you **can't fight**, and you're **shielded from incoming attacks** while there (this shield is the offline-farming cap).
- You recover by **healing**: passive regen over time, or pay **Cash / premium to heal faster** and get back in the fight.
- Full mechanics live in the Combat doc (Combat Resolution).

---

## Monetization
- **v1 model — sell refreshes & heals.** Players pay to refill their **Stamina** (fights) and **Moves** (PvE) pools, and to **heal out of the Hospital** faster, instead of waiting for regen. This is the primary launch monetization — deliberately **not** a 4X-style build-timer model.
- **Premium gear:** a secondary path — powerful gear that is **resource-constrained or limited-supply** (time-limited drops, capped quantities). May include pay-to-win / limited-time elements. Design TBD.
- **Hard currency:** none in v1 — refreshes and gear are purchased directly. We should still add a hard currency later; keep the `GameState`/payments seam intact so it can be re-added cleanly.

---

## Locked Decisions — Features & Naming
*Feature & naming decisions live here; **combat & economy decisions** are in [`combat-system-requirements-v5.md`](combat-system-requirements-v5.md).*

1. **Naming is canonical** per the Canonical Naming section above: Cash, Clout, Stamina, Moves, Opps, Plugs, Crew/Lieutenants, Spots, The Hood, Player Profile. **Plugs are people who both sell gear and give quests** — the shop and contacts are one feature.
2. **Passive income via Spots is in v1** (reverses the earlier no-passive-income call): Spots generate Cash over time, collected on login, with **max offline accrual gated by level**.
3. **Crew** size (number of **Lieutenants** — invited players who actually played) unlocks combat gear slots: **+1 slot per 5 Lieutenants, gear type rotating**; growth kept deliberately slow.
4. **Gear loadout is player-chosen**, configured on the **Player Profile**: one primary item per type shown prominently, Crew-unlocked secondary slots stacked behind it (+1/+2/+3), tap to configure.
5. **The Hood** is the 3D world map and holds the Search button; **Player Profile** is the public, equip-enabled inventory screen.
6. **Monetization sells Stamina/Moves refreshes and Hospital heals** in v1 (plus premium/limited-supply gear); **no hard currency in v1** (purchases are direct), added later.
7. **Health is back and The Hospital is a v1 feature/screen** — combat is turn-based, so defeat → hospitalized → heal (time or paid) to return. (Combat mechanics live in the Combat doc.)

---

## Terminology & Naming — Code Migration
Where each canonical term lands in the current prototype. Paths relative to repo root. (Health is **retained** — see the "Combat Rework" notes in the Combat doc.)

**Cash** (from `money` / "BREAD") — **DONE 2026-09-11** (save `SCHEMA_VERSION` 2 → 3)
- `js/state.js` `money: 500`; `js/hud.js` `h-money`; `index.html` HUD label **"BREAD"** (`h-money`); referenced in `combat.js`, `jobs.js`, `hood.js`, `store.js`, `properties.js`. Decide: keep flavor label "BREAD" or standardize UI to "CASH" (canonical term is Cash). Internal var `money` may stay or rename to `cash`.

**Clout** (merge `xp` + `rep`) — **DONE 2026-09-11** (save `SCHEMA_VERSION` 1 → 2)
- `js/state.js` `xp`, `xpNext`, `rep`; `js/main.js` `addXP()`/level logic; `js/hud.js` `h-rep`, `xp-bar`, `xp-label`; `index.html` "REP" stat + XP bar; `combat.js`/`jobs.js` `G.rep +=` and `addXP()`; `stats.js` 'REP'. **Consolidate XP and REP into a single Clout stat that drives leveling.**
  **Done:** `G.clout` is a lifetime cumulative total; `addXP()` is now `addClout()`; level is derived from `data/progression.json` via `js/progression.js` rather than stored; `xp`/`xpNext`/`rep` are gone from state, from `jobs.json`/`enemies.json` and from the HUD. See `specs/08-economy-schema.md` §3.

**Stamina** (new — fights) — **DONE 2026-09-11** (state + regen; entering a fight still does not debit it)
- Add `stamina`/`maxStamina` to `state.js`; entering a fight costs **1 Stamina** (gate on Stamina ≥ 1); add a Stamina meter to `hud.js`/`index.html`; add Stamina regen in `main.js`.

**Moves** (from `energy`) — **DONE 2026-09-11** (save `SCHEMA_VERSION` 2 → 3)
- `js/state.js` `energy`/`maxEnergy` → `moves`/`maxMoves`; `js/main.js` `ENERGY_REGEN_SECONDS`, `applyOfflineEnergyRegen`, `tickEnergyRegen`, `lastEnergyTick`; `js/hud.js` `h-energy`/`energy-bar`/`energy-label`; `index.html` "ENERGY" labels; `js/jobs.js` `G.energy`, `job.energy`; `data/jobs.json` `"energy"` field; `js/hood.js` launder energy cost.

**Opps** — no rename. (`enemies` / "OPPS LIST" stay; the static list → Search flow is a separate systems change.)

**Moves feature** (`jobs`) — nav is already "MOVES". Internal `jobs.js`/`jobs.json`/`JOBS`/`renderJobs`/`doJob` may rename to `moves` for consistency (optional).

**Plugs** (unified NPC dealers + quest givers — the gear shop and the "contacts" are the same feature)
- Merge the two prototype surfaces into **one Plugs system**: the store (`js/store.js` / `data/store.json` / `STORE_ITEMS`, nav "THE PLUG" `nav-store`/`tab-store`) and the contacts (`js/plugs.js` / `PLUGS_DATA`, nav "PLUGS" `nav-plugs`/`tab-plugs`). Each Plug is a person who sells gear from the catalog **and** offers quests. Collapse the two nav entries into one. Quest-giving is **new systems work**.

**Crew / Lieutenants** (doc's "Gang"; code is already "Crew")
- `js/crew.js` uses "Crew" ✓ but labels members **"SOLDIERS"** → rename to **"LIEUTENANTS"**; update invite copy in `Crew.invite()`. (Crew → gear-capacity, vs. the current flat ATK/DEF bonus, is a systems change tracked in the Combat doc.)

**Spots** (`properties`) — UI already "SPOTS"; internal `properties.js`/`properties.json`/`PROPERTIES`/`G.properties`/`collectIncome`. **NEW:** time-based offline accrual with a level-gated cap (today it's instant collect, no accrual/cap).

**The Hood** (the 3D map) — today `map.js`/`map3d.js` render the map under the **MAP** tab, while the **THE HOOD** tab (`nav-hood`/`tab-hood`/`hood.js`) is a status/activities hub. Migration: make the **map** the Hood and host the **Search** button there; redistribute the old hub actions (collect → Spots, rest → removed, launder → TBD).

**Player Profile** (from "STATS") — `js/stats.js`/`tab-stats` becomes the Player Profile: add equip/loadout UI and a public, other-player-viewable projection.

**Payments** — remove the `gems`/hard-currency IAP: `js/payments.js` (GEM_PACKS/GEM_SPENDS/Payments), `state.js` `gems`, `hud.js` `h-gems`, `index.html` GEMS stat + `gem-section`, `store.js` `renderGemSection()`. **Keep the `GameState`/payments seam** — v1 monetization sells **Stamina/Moves refreshes** through it (plus premium gear).
