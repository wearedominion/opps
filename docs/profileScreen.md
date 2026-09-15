# OPPS — Player Profile Screen Requirements

> Companion to [`oppsDefinitions.md`](oppsDefinitions.md) (naming & features) and [`combat-system-requirements-v5.md`](combat-system-requirements-v5.md) (combat & economy mechanics). This doc specifies the **Player Profile** screen. *Owner: Bobby Babcock.*

## Purpose
The Player Profile is the player's **identity + progression + loadout** screen. It:
- shows the player's **level and progression** (Clout),
- hosts **skill-point allocation** on level-up,
- is where the player **equips their gear loadout** (their Crew),
- is **publicly viewable by other players** — the place you show off your gear.

It replaces the prototype's read-only "STATS" tab, adding skill-point allocation, gear equipping, and a public view.

---

## Two views — Self vs Public
The Profile renders differently depending on who's looking. **Consistency rule:** the public view must not leak what combat deliberately hides — raw Attack/Defense/Health are never shown to other players (see [combat target intel](combat-system-requirements-v5.md)).

| Element | Self (owner) | Public (others) |
|---|---|---|
| Name / avatar | ✅ | ✅ |
| Level | ✅ | ✅ |
| Clout / progress to next level | ✅ | ✅ *(see Rank-vs-Clout open Q)* |
| Equipped gear loadout (the show-off) | ✅ | ✅ |
| Crew size (Lieutenant count) | ✅ | ➖ *(optional — open Q)* |
| **Raw Attack / Defense / Health totals** | ✅ | ❌ hidden (combat hides these) |
| Current Stamina / Moves / Health pools | ✅ | ❌ |
| Cash balance | ✅ | ❌ |
| Unspent skill points + allocation UI | ✅ | ❌ |
| Gear inventory (unequipped) | ✅ | ❌ |

---

## Screen sections

### 1. Identity header
Avatar/portrait, name, level, and progression label (Rank title vs raw Clout is an open question — see below).

### 2. Progression
Clout total with a progress bar to the next level (120-level exponential curve). Shows current level. Whether we surface a **Rank title** (Shorty → Untouchable) as flavor on top of the Clout-driven level is an open question carried from the Definitions doc.

### 3. Stat block (self view)
Attack and Defense (base + equipped-gear totals), Stamina (current/max), Moves (current/max), **Health (current/max)**, Cash, and Crew/Lieutenant count. On the **public** view, raw Attack/Defense/Health are omitted.

### 4. Skill-point allocation UI
Shown when the player has **unspent skill points** (5 granted per level-up; level-up also fully refills Stamina, Moves, and Health). Self view only.

**Allocatable stats and costs:**

| Stat | Cost per +1 | Effect |
|---|---|---|
| **Max Moves** | 1 point | +1 to your Moves pool (PvE pacing) |
| **Max Stamina** | 2 points | +1 to your Stamina pool (fight pacing) — deliberately the expensive one |
| **Max Health** | 1 point | +1 to your Health pool (combat survivability) — the tank stat |
| **Attack** | 1 point | +1 base Attack |
| **Defense** | 1 point | +1 base Defense |

- **Health is a build stat** — combat is turn-based, so a bigger Health pool lets you survive more rounds (the tank build). See the build-type note below.
- The UI must show: points available, cost per stat, the resulting new value, and a **confirm/commit** step.
- Allocation is **permanent in v1** (no respec). A paid respec is a possible future item — see Open Questions.

### 5. Gear loadout / equip

> **⚠️ SUPERSEDED — 2026-09-14 (DOM-121).** The secondary-slot model below is
> **dropped for v0.2**. Jake ratified the Chrome Money prototype's model
> instead: **7 permanent slots, single-depth, one item per slot** —
> `head, torso, handR, handL, legs, ride, stash`. These ids are **save keys**:
> permanent, lowercase, never reused. `data/gear.json` already carries a `slot`
> field on every item (DOM-123).
>
> Kept rather than deleted because secondary slots can be re-added additively
> later without breaking the 7 keys. **Do not build from this section.**
>
> **Note for whoever picks up DOM-117:** the code has not moved yet. The live
> field is `G.loadout`, keyed by *type* (`weapon`/`armor`/`vehicle`/`utility`)
> holding *arrays* — i.e. it still implements the superseded model below, via
> `slotCapacity()`. Going single-depth is a real migration, not a rename, and
> it retires the Crew gear-slot reward. See the DOM-121 comment thread.

Where the player builds the loadout they bring to combat (their **Crew**).
- **Primary gear** per type is shown prominently — the show-off pieces.
- **Secondary slots** sit stacked behind the primary with a **+1 / +2 / +3** badge; tap to expand and configure which owned item fills each slot.
- Secondary-slot capacity comes from **Crew size** — inviting friends grants **+1 slot per 5 Lieutenants**, rotating gear type (see the combat doc's Gear section).
- The equipped loadout is what the combat **snapshot** freezes, and what the **public** view shows off.

---

## NOTE — build-type intent
The skill-point stats exist to create **build identity**, borrowed from Mafia Wars:

- **Grinder (Moves):** invests in Moves to run more PvE actions per session — faster mastery, cash, and leveling. The safe economic path.
- **Fighter (Stamina):** invests in Stamina to attack more often — the PvP-aggression path. Stamina costs **2 points** on purpose, to make fighting cadence a real investment.
- **Tank (Health):** invests in Health to survive more rounds in the turn-based fight — harder to defeat, resists hospitalization, and a poor target to farm (a defender identity). This is the **third axis**, enabled by combat being turn-based with Health pools.
- **Attack / Defense:** base combat stats — but note that **equipped gear (capped by Crew size) is expected to dominate** Attack/Defense totals, so raw points here may be a **weak sink** unless tuned. (This is the same "skill points into Attack are a trap" dynamic Mafia Wars had — gear + crew did the heavy lifting.)

**All three build axes (grind / fight / tank) are live** now that combat is turn-based and Health is a skill-point stat. The Attack/Defense caveat above still applies — those remain the weak sinks vs. gear unless tuned.

---

## Open Questions
1. **Rank vs Clout display** — show a Rank title (Shorty → Untouchable) as flavor over the Clout-driven level, or show Clout directly? *(Mirrors the flag in the Definitions doc.)*
2. **Respec** — can players reallocate skill points? If so, is it a paid (premium / Plug) action? Mafia Wars sold respecs.
3. **Public gear visibility vs stat-hiding** — the public profile shows off equipped gear, but a viewer could tally known gear values to infer the Attack/Defense that combat intel hides. Accept the mild leak (for the show-off fantasy), or display gear cosmetically without exact item stats?
4. **Health per-point value** *(data)* — how much Health each skill point grants (Health pools run larger than Stamina/Moves, so likely more than +1 per point).
5. **Crew count on public view** — show Lieutenant count publicly (flex / social proof), or keep it private?

---

## Cross-references
- Naming & features: [`oppsDefinitions.md`](oppsDefinitions.md) — Player Profile, Crew/Lieutenants, Clout.
- Skill points, gear/loadout, combat-intel hiding: [`combat-system-requirements-v5.md`](combat-system-requirements-v5.md).
- Data: Player Profile public-view projection (combat doc, Data Designs #17).
