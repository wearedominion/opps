// ─────────────────────────────────────────────
//  PLAYER PROFILE — identity · skills · gear · leaderboard
//  TDD: docs/tdds/2026-09-09-player-profile.md
//  Design: design handoff SCREENS.md §6 · docs/profileScreen.md
// ─────────────────────────────────────────────

// ═════════════════════════════════════════════
//  GEAR — REAL CATALOG (DOM-75)
//  The prototype's hardcoded GEAR_SLOTS / GEAR_ITEMS body-doll is gone: the
//  loadout runs on data/store.json (weapon / armor / vehicle / utility), one
//  primary slot per type plus Crew-unlocked secondaries, capacity from
//  slotCapacity() (js/state.js). This closed the TDD §7 open decision:
//  gear lives in store.json; there is no separate gear.json.
// ═════════════════════════════════════════════

// A skill raises either a POOL ceiling (`pool` -> G[pool].max, topping up
// G[pool].current to match) or a flat STAT (`stat` -> G[stat]). Exactly one of
// the two per entry — pfSkillTarget() reads the current value for either.
// `segMax` is a display-only scale for the segmented bar — PLACEHOLDER, needs tuning.
// Point COSTS and per-rank GRANTS are not here: they are balance, so they live in
// data/tuning.json (skills.cost / skills.grant) and are read via pfSkillCost/pfSkillGrant.
const SKILL_DEFS = [
  { id: 'moves',   label: 'MAX MOVES',   pool: 'moves',   build: 'GRINDER', segMax: 24,
    desc: 'More PvE jobs per session — faster mastery, cash and levels.' },
  { id: 'stamina', label: 'MAX STAMINA', pool: 'stamina', build: 'FIGHTER', segMax: 24,
    desc: 'Attack other players more often. Costs double on purpose — fighting cadence is a real investment.' },
  { id: 'health',  label: 'MAX HEALTH',  pool: 'health',  build: 'TANK',    segMax: 240,
    desc: 'Survive more rounds in turn-based fights. Resists hospitalization and makes you a poor target to farm.' },
  { id: 'attack',  label: 'ATTACK',      stat: 'attack',  build: 'COMBAT',  segMax: 120,
    desc: 'Damage dealt when you engage. Note: equipped gear is expected to dominate this total, so raw points here are a weak sink until tuned.' },
  { id: 'defense', label: 'DEFENSE',     stat: 'defense', build: 'COMBAT',  segMax: 120,
    desc: 'Damage reduced when you are engaged. Note: equipped gear is expected to dominate this total, so raw points here are a weak sink until tuned.' },
];

// Current value a skill governs: a pool's ceiling, or a flat stat.
function pfSkillTarget(def) {
  return def.pool ? ((G[def.pool] && G[def.pool].max) || 0) : (G[def.stat] || 0);
}

function pfSkillCost(id)  { return tune('skills.cost.' + id); }
function pfSkillGrant(id) { return tune('skills.grant.' + id); }

// ═════════════════════════════════════════════
//  SESSION-ONLY UI STATE — intentionally NOT persisted, so a returning
//  player lands on a clean profile (TDD §6).
// ═════════════════════════════════════════════

let pfTab = 'skills';
let pfPending = {};      // { skillId: ranksStaged }
let pfGearPick = null;   // { type, idx } of the open slot picker
let pfInfoKey = null;    // skillId of the open info popup
let pfConfirmOpen = false;

// ═════════════════════════════════════════════
//  PURE HELPERS (no DOM — unit-testable)
// ═════════════════════════════════════════════

function pfEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// Gear types in display order: the Crew rotation first, then whatever else the
// catalog carries (utility). Data-driven — a new type in store.json just shows up.
function pfGearTypes() {
  const rot = tune('crew.slotRotation').slice();
  for (const i of STORE_ITEMS) if (rot.indexOf(i.type) === -1) rot.push(i.type);
  return rot;
}

function pfFindItem(itemId) {
  return STORE_ITEMS.find(i => i.id === itemId) || null;
}

// Rarity is AUTHORED catalog data since DOM-18 (it was a ladder-position
// quartile before). Labels come from js/drops.js; colours ride tier-* classes.
function pfTierLabel(item) {
  return RARITY_LABELS[item.rarity] || 'COMMON';
}

// Lieutenants required to unlock bonus slot `idx` (1-based secondaries) of a
// type. null = never (past the cap, or the type is outside the rotation).
function pfSlotUnlockAt(type, idx) {
  const rot = tune('crew.slotRotation');
  const i = rot.indexOf(type);
  if (i === -1 || idx > tune('crew.maxBonusSlotsPerType')) return null;
  return ((idx - 1) * rot.length + i + 1) * tune('crew.lieutenantsPerSlot');
}

// Total fielded gear power (ATK + DEF, upgrades included). Derived — never banked.
function pfGearPower() {
  const s = fieldedStats();
  return s.atk + s.def;
}

function pfSkillDef(id) { return SKILL_DEFS.find(s => s.id === id) || null; }

// Points staged across all skills.
function pfPendingCost(pending) {
  return Object.keys(pending || {}).reduce((sum, id) => {
    const def = pfSkillDef(id);
    return sum + (def ? pfSkillCost(def.id) * (pending[id] || 0) : 0);
  }, 0);
}

function pfPointsLeft() {
  return (G.skillPts || 0) - pfPendingCost(pfPending);
}

function pfCanAfford(skillId) {
  const def = pfSkillDef(skillId);
  return !!def && pfPointsLeft() >= pfSkillCost(def.id);
}

// The ONE public projection. docs/profileScreen.md "Self vs Public" and
// TDD §10: raw Attack/Defense/Health, pools, cash, unspent points and
// unequipped inventory must never reach another player. Enforced here,
// never per-render.
function pfPublicProjection(state) {
  const s = state || G;
  const lo = s.loadout || {};
  const gear = [];
  for (const type of Object.keys(lo)) {
    (lo[type] || []).forEach((id, slot) => {
      const it = pfFindItem(id);
      if (!it || it.type !== type) return;
      // Upgrade level is public by design (DOM-88): prestige levels exist to be
      // seen. Raw stats stay private; the name and level carry the flex.
      const inst = (s.inventory || {})[id];
      gear.push({ type: type, slot: slot, name: it.name, tier: pfTierLabel(it),
                  level: inst ? inst.level : 0 });
    });
  }
  return {
    handle: s.handle || 'PLAYER',
    level: s.level,
    clout: s.clout,
    rank: rankForLevel(s.level),
    gear: gear,
    // Deliberately absent: attack, defense (base AND effective), the health /
    // moves / stamina pools, cash, skillPts, slot capacity, the combat
    // snapshot / CP, and unfielded inventory — per the combat-intel rules.
  };
}

// ═════════════════════════════════════════════
//  RENDER
// ═════════════════════════════════════════════

function renderProfile() {
  const root = $('pf-root');
  if (!root) return;
  root.innerHTML =
    pfRenderIdentity() +
    pfRenderTabs() +
    (pfTab === 'skills' ? pfRenderSkills()
      : pfTab === 'gear' ? pfRenderGear()
      : pfRenderBoard());
  pfRenderOverlays();
}

function pfRenderIdentity() {
  const rank = rankForLevel(G.level);
  const cp = cloutProgress(G.clout);
  const pct = cp.pct;
  const toNext = cp.toNext;
  return `
    <div class="pf-id">
      <div class="pf-avatar">
        <div class="pf-avatar-ph" role="img" aria-label="Player portrait placeholder"></div>
        <div class="pf-lv">LV ${G.level}</div>
      </div>
      <div class="pf-id-body">
        <div class="pf-name" title="${pfEsc(G.handle || 'YOU')}">${pfEsc(G.handle || 'YOU')}</div>
        <div class="pf-rank-row">
          <span class="pf-rank">${pfEsc(rank)}</span>
          <button class="pf-i-btn" onclick="pfOpenInfo('rank')" aria-label="About ranks">i</button>
        </div>
        <div class="pf-clout-row">
          <span class="pf-clout">${G.clout.toLocaleString()}</span>
          <span class="pf-clout-tag">CLOUT</span>
        </div>
        <div class="pf-xp-wrap">
          <div class="pf-xp-labels">
            <span class="l">${cp.atCap ? 'MAX LEVEL' : toNext.toLocaleString() + ' TO NEXT'}</span>
            <span class="r">${cp.atCap ? '' : cp.into.toLocaleString() + ' / ' + cp.need.toLocaleString()}</span>
          </div>
          <div class="pf-xp-track"><div class="pf-xp-fill" style="width:${pct}%"></div></div>
        </div>
      </div>
      <button class="pf-stats-btn" onclick="pfOpenStats()">STATS</button>
    </div>`;
}

function pfRenderTabs() {
  const pts = G.skillPts || 0;
  const badge = pts > 0
    ? `<span class="pf-tab-badge">${pts} ${pts === 1 ? 'PT' : 'PTS'}</span>` : '';
  const tabs = [
    { id: 'skills', label: 'SKILLS' },
    { id: 'gear',   label: 'GEAR' },
    { id: 'board',  label: 'LEADERBOARD' },
  ];
  return `<div class="pf-tabs">` + tabs.map(t => `
    <button class="pf-tab${pfTab === t.id ? ' active' : ''}" onclick="pfShowTab('${t.id}')">
      ${t.label}${t.id === 'skills' ? badge : ''}
    </button>`).join('') + `</div>`;
}

// ── SKILLS ──
function pfRenderSkills() {
  const total = G.skillPts || 0;
  const spent = pfPendingCost(pfPending);
  const left = total - spent;

  const rows = SKILL_DEFS.map(def => {
    const base = pfSkillTarget(def);
    const staged = pfPending[def.id] || 0;
    const shown = base + staged;
    const cost = pfSkillCost(def.id);
    const afford = left >= cost;
    const segs = 12;
    const onBase = Math.max(0, Math.min(segs, Math.round((base / def.segMax) * segs)));
    const onStaged = Math.max(0, Math.min(segs - onBase, Math.round((staged / def.segMax) * segs)));
    let segHtml = '';
    for (let i = 0; i < segs; i++) {
      const cls = i < onBase ? 'pf-seg on' : i < onBase + onStaged ? 'pf-seg staged' : 'pf-seg';
      segHtml += `<div class="${cls}"></div>`;
    }
    return `
      <div class="pf-skill${staged ? ' staged' : ''}">
        <div class="pf-skill-top">
          <div class="pf-skill-id">
            <div class="pf-skill-name-row">
              <span class="pf-skill-name">${def.label}</span>
              <button class="pf-i-btn" onclick="pfOpenInfo('${def.id}')" aria-label="About ${def.label}">i</button>
            </div>
            <div class="pf-skill-cost${afford ? ' afford' : ''}">${cost} ${cost === 1 ? 'PT' : 'PTS'} PER RANK</div>
          </div>
          <div class="pf-skill-val-wrap">
            <div class="pf-skill-val${staged ? ' staged' : ''}">${shown}</div>
            <div class="pf-skill-delta">${staged ? '+' + staged + ' STAGED' : 'CURRENT'}</div>
          </div>
          <div class="pf-steps">
            <button class="pf-step" onclick="pfStage('${def.id}',-1)" ${staged ? '' : 'disabled'} aria-label="Remove a staged rank">−</button>
            <button class="pf-step inc" onclick="pfStage('${def.id}',1)" ${afford ? '' : 'disabled'} aria-label="Stage a rank">+</button>
          </div>
        </div>
        <div class="pf-seg-row">${segHtml}</div>
      </div>`;
  }).join('');

  const canCommit = spent > 0;
  return `
    <div class="pf-skills">
      <div class="pf-ledger">
        <div class="pf-ledger-cell">
          <div class="pf-eyebrow">AVAILABLE</div>
          <div class="pf-ledger-val avail">${total}</div>
        </div>
        <div class="pf-ledger-div"></div>
        <div class="pf-ledger-cell">
          <div class="pf-eyebrow">SPENDING</div>
          <div class="pf-ledger-val spending${spent ? ' on' : ''}">${spent}</div>
        </div>
        <div class="pf-ledger-div"></div>
        <div class="pf-ledger-cell">
          <div class="pf-eyebrow">LEFT</div>
          <div class="pf-ledger-val">${left}</div>
        </div>
      </div>
      ${total === 0 && spent === 0 ? `
        <div class="pf-empty">
          <div class="pf-empty-label">NO POINTS</div>
          <div class="pf-empty-hint">Level up to earn ${tune('progression.skillPointsPerLevel')} skill points.</div>
        </div>` : ''}
      ${rows}
      <div class="pf-warn">
        <span class="pf-warn-text">Allocation is permanent — no respec. Spend like you mean it.</span>
      </div>
      <div class="pf-actions">
        <button class="pf-btn-reset" onclick="pfResetPending()" ${canCommit ? '' : 'disabled'}>RESET</button>
        <button class="pf-btn-confirm" onclick="pfOpenConfirm()" ${canCommit ? '' : 'disabled'}>
          ${canCommit ? 'CONFIRM ' + spent + (spent === 1 ? ' PT' : ' PTS') : 'NOTHING STAGED'}
        </button>
      </div>
    </div>`;
}

// ── GEAR ──
// One row of slot chips per gear type: the primary, then Crew-unlocked
// secondaries, then the still-locked slots naming their price in soldiers.
function pfSlotBox(type, idx, capacity) {
  const ids = (G.loadout || {})[type] || [];
  if (idx >= capacity) {
    const need = pfSlotUnlockAt(type, idx);
    return `
      <div class="pf-slot locked">
        <div class="pf-slot-label">+${idx}</div>
        <div class="pf-slot-name is-empty">LOCKED</div>
        <div class="pf-slot-buff">${need} SOLDIERS</div>
      </div>`;
  }
  const it = pfFindItem(ids[idx]);
  const filled = !!(it && it.type === type);
  const inst = filled ? gearInstance(it.id) : null;
  const lv = inst && inst.level > 0 ? ` · LV ${inst.level}` : '';
  return `
    <button class="pf-slot${filled ? ' rar-' + pfTierLabel(it) : ' empty'}${idx === 0 ? ' primary' : ''}" onclick="pfOpenPicker('${type}',${idx})">
      <div class="pf-slot-label">${idx === 0 ? 'PRIMARY' : '+' + idx}</div>
      <div class="pf-slot-name ${filled ? 'tier-' + pfTierLabel(it) : 'is-empty'}">${filled ? pfEsc(it.name) : 'EMPTY'}</div>
      <div class="pf-slot-buff">${filled ? pfEsc(it.desc) + lv : 'Tap to equip'}</div>
    </button>`;
}

function pfRenderGear() {
  const types = pfGearTypes();
  const maxBonus = tune('crew.maxBonusSlotsPerType');
  const rot = tune('crew.slotRotation');
  const fielded = fieldedGear();
  const totalCap = types.reduce((s, t) => s + slotCapacity(t), 0);
  const owned = STORE_ITEMS.filter(i => ownsGear(i.id));

  const typeRows = types.map(type => {
    const cap = slotCapacity(type);
    const shown = rot.indexOf(type) === -1 ? cap : 1 + maxBonus;
    const boxes = [];
    for (let i = 0; i < shown; i++) boxes.push(pfSlotBox(type, i, cap));
    return `
      <div class="pf-typerow">
        <div class="pf-sec-head">
          <h4>${type.toUpperCase()}</h4>
          <div class="pf-sec-rule"></div>
          <span class="pf-sec-count">${Math.min((G.loadout?.[type] || []).length, cap)}/${cap} FIELDED</span>
        </div>
        <div class="pf-slots-row">${boxes.join('')}</div>
      </div>`;
  }).join('');

  const invRows = owned.length ? owned.map(it => {
    const isEq = fielded.some(f => f.item.id === it.id);
    const inst = gearInstance(it.id);
    const lv = inst && inst.level > 0 ? ` · LV ${inst.level}` : '';
    const src = inst && inst.src === 'dropped' ? ' · FOUND'
      : inst && inst.src === 'quest' ? ' · EARNED' : '';
    return `
      <button class="pf-inv-row${isEq ? ' equipped' : ''} rar-${pfTierLabel(it)}" onclick="pfToggleField('${it.id}')">
        <div class="pf-inv-main">
          <div class="pf-inv-name tier-${pfTierLabel(it)}">${pfEsc(it.name)}</div>
          <div class="pf-inv-meta">${it.type.toUpperCase()} · ${pfEsc(it.desc)}${lv}${src}</div>
        </div>
        <span class="pf-inv-tier tier-${pfTierLabel(it)}">${pfTierLabel(it)}</span>
        <span class="pf-inv-status${isEq ? ' on' : ''}">${isEq ? 'FIELDED' : 'FIELD'}</span>
      </button>`;
  }).join('') : `
      <div class="pf-empty bare">
        <div class="pf-empty-label">EMPTY</div>
        <div class="pf-empty-hint">No gear yet. Hit the Plug to pick something up.</div>
      </div>`;

  // The aspirational surface (DOM-18 ratified: drop tiers are "visible in the
  // catalog"): unowned drop-only gear at the player's top two unlocked gates —
  // a teaser, not a spreadsheet. Full contrast per the locked-state rule; the
  // chip names the gate: DROP ONLY (it drops or it doesn't) and VAULTED for
  // oranges, which never circulate in v1 (the DOM-92 shelf).
  const streetPool = STORE_ITEMS.filter(i =>
    i.dropOnly && !ownsGear(i.id) && i.levelReq <= G.level);
  const streetGates = [...new Set(streetPool.map(i => i.levelReq))]
    .sort((a, b) => b - a).slice(0, 2);
  const streetRows = streetPool
    .filter(i => streetGates.indexOf(i.levelReq) !== -1)
    .sort((a, b) => b.levelReq - a.levelReq || a.name.localeCompare(b.name))
    .map(it => `
      <div class="pf-inv-row static rar-${pfTierLabel(it)}">
        <div class="pf-inv-main">
          <div class="pf-inv-name tier-${pfTierLabel(it)}">${pfEsc(it.name)}</div>
          <div class="pf-inv-meta">${it.type.toUpperCase()} · ${pfEsc(it.desc)} · L${it.levelReq}</div>
        </div>
        <span class="pf-inv-tier tier-${pfTierLabel(it)}">${pfTierLabel(it)}</span>
        <span class="pf-inv-status locked">${it.rarity === 'orange' ? 'VAULTED' : 'DROP ONLY'}</span>
      </div>`).join('');
  const streetsSection = streetRows ? `
      <div>
        <div class="pf-sec-head">
          <h4>ON THE STREETS</h4>
          <div class="pf-sec-rule"></div>
          <span class="pf-sec-count">OUT THERE</span>
        </div>
        <div class="pf-inv">${streetRows}</div>
      </div>` : '';

  return `
    <div class="pf-gear">
      <div class="pf-ledger">
        <div class="pf-ledger-cell">
          <div class="pf-eyebrow">GEAR POWER</div>
          <div class="pf-ledger-val avail">${pfGearPower()}</div>
        </div>
        <div class="pf-ledger-div"></div>
        <div class="pf-ledger-cell">
          <div class="pf-eyebrow">FIELDED</div>
          <div class="pf-ledger-val">${fielded.length}/${totalCap}</div>
        </div>
        <div class="pf-ledger-div"></div>
        <div class="pf-ledger-cell">
          <div class="pf-eyebrow">SOLDIERS</div>
          <div class="pf-ledger-val">${G.crewMemberCount || 0}</div>
        </div>
      </div>
      ${typeRows}
      <div>
        <div class="pf-sec-head">
          <h4>STASH</h4>
          <div class="pf-sec-rule"></div>
          <span class="pf-sec-count">${owned.length} ${owned.length === 1 ? 'ITEM' : 'ITEMS'}</span>
        </div>
        <div class="pf-inv">${invRows}</div>
      </div>
      ${streetsSection}
    </div>`;
}

// ── LEADERBOARD ──
// Handoff gap 4 / TDD §9: cross-player data has no source today (saves are
// per-user blobs; server/ is purchase-verification only). Ships inert until
// that dependency is resolved. Must never throw or block the tab.
function pfRenderBoard() {
  return `
    <div>
      <div class="pf-sec-head">
        <h4>LEADERBOARD</h4>
        <div class="pf-sec-rule"></div>
      </div>
      <div class="pf-empty">
        <div class="pf-empty-label">NO DATA</div>
        <div class="pf-empty-hint">The board lights up once the streets start talking. Nothing to rank yet.</div>
      </div>
      <div class="pf-board-hint">TAP A PLAYER TO SEE THEIR PROFILE</div>
    </div>`;
}

// ═════════════════════════════════════════════
//  OVERLAYS — equip picker · confirm allocation · stat info
//  Rendered into one host so index.html stays small.
//  No alert/confirm/prompt anywhere (03 §7).
// ═════════════════════════════════════════════

function pfRenderOverlays() {
  const host = $('pf-overlays');
  if (!host) return;
  host.innerHTML = pfRenderPicker() + pfRenderConfirm() + pfRenderInfo();
}

function pfRenderPicker() {
  if (!pfGearPick) return '';
  const type = pfGearPick.type, idx = pfGearPick.idx;
  const ids = (G.loadout || {})[type] || [];
  const items = STORE_ITEMS.filter(i => i.type === type && ownsGear(i.id));
  const rows = items.length ? items.map(it => {
    const at = ids.indexOf(it.id);
    const isHere = at === idx;
    const inst = gearInstance(it.id);
    const lv = inst && inst.level > 0 ? ` · LV ${inst.level}` : '';
    return `
      <button class="pf-pick-row rar-${pfTierLabel(it)}" onclick="pfEquip('${type}',${idx},'${it.id}')">
        <div class="pf-inv-main">
          <div class="pf-inv-name lg tier-${pfTierLabel(it)}">${pfEsc(it.name)}</div>
          <div class="pf-inv-meta">${pfEsc(it.desc)}${lv}</div>
        </div>
        <span class="pf-inv-tier tier-${pfTierLabel(it)}">${pfTierLabel(it)}</span>
        <span class="pf-inv-status${at !== -1 ? ' on' : ''}">${isHere ? 'EQUIPPED' : at !== -1 ? 'MOVE HERE' : 'EQUIP'}</span>
      </button>`;
  }).join('') : `
      <div class="pf-empty">
        <div class="pf-empty-label">EMPTY</div>
        <div class="pf-empty-hint">You own nothing that fits this slot. Hit the Plug.</div>
      </div>`;

  return `
    <div class="pf-scrim sheet open" onclick="pfClosePicker()">
      <div class="pf-panel sheet" onclick="event.stopPropagation()">
        <div class="pf-panel-head">
          <div class="pf-fill">
            <div class="pf-panel-title">${type.toUpperCase()} ${idx === 0 ? '— PRIMARY' : '— SLOT +' + idx}</div>
            <div class="pf-panel-sub">CHOOSE WHAT YOU CARRY</div>
          </div>
          ${ids[idx] ? `<button class="pf-unequip" onclick="pfUnequip('${type}',${idx})">UNEQUIP</button>` : ''}
          <button class="pf-x" onclick="pfClosePicker()" aria-label="Close">✕</button>
        </div>
        <div class="pf-panel-body flush">
          <div class="pf-pick-list">${rows}</div>
        </div>
      </div>
    </div>`;
}

function pfRenderConfirm() {
  if (!pfConfirmOpen) return '';
  const spent = pfPendingCost(pfPending);
  const lines = SKILL_DEFS.filter(d => pfPending[d.id]).map(d => `
    <div class="pf-conf-line">
      <span class="k">${d.label}</span>
      <span class="v">${pfSkillTarget(d)} → ${pfSkillTarget(d) + pfPending[d.id] * pfSkillGrant(d.id)}</span>
    </div>`).join('');
  return `
    <div class="pf-scrim confirm open" onclick="pfCloseConfirm()">
      <div class="pf-panel lime" onclick="event.stopPropagation()">
        <div class="pf-panel-head">
          <div class="pf-fill">
            <div class="pf-panel-title">LOCK IT IN</div>
            <div class="pf-panel-sub">SPENDING ${spent} ${spent === 1 ? 'POINT' : 'POINTS'}</div>
          </div>
          <button class="pf-x" onclick="pfCloseConfirm()" aria-label="Close">✕</button>
        </div>
        <div class="pf-panel-body">
          ${lines}
          <div class="pf-warn spaced">
            <span class="pf-warn-text">This is permanent. There is no respec — you cannot take these points back.</span>
          </div>
        </div>
        <div class="pf-panel-foot">
          <button class="pf-btn-reset" onclick="pfCloseConfirm()">BACK</button>
          <button class="pf-btn-confirm" onclick="pfCommitSkills()">SPEND IT</button>
        </div>
      </div>
    </div>`;
}

function pfRenderInfo() {
  if (!pfInfoKey) return '';
  let title, tag, body;
  if (pfInfoKey === 'rank') {
    title = 'RANK';
    tag = 'PROGRESSION';
    body = 'Your rank is the title the streets give you as your Clout climbs. It is flavor on top of your level — the level is what actually gates content.';
  } else {
    const def = pfSkillDef(pfInfoKey);
    if (!def) return '';
    title = def.label;
    tag = def.build;
    const c = pfSkillCost(def.id);
    body = def.desc + ' Costs ' + c + (c === 1 ? ' point' : ' points') + ' per rank.';
  }
  return `
    <div class="pf-scrim info open" onclick="pfCloseInfo()">
      <div class="pf-panel" onclick="event.stopPropagation()">
        <div class="pf-panel-head">
          <div class="pf-fill"><div class="pf-panel-title">${title}</div></div>
          <button class="pf-x" onclick="pfCloseInfo()" aria-label="Close">✕</button>
        </div>
        <div class="pf-panel-body">
          <span class="pf-build-tag">${tag}</span>
          <div class="pf-body-copy">${pfEsc(body)}</div>
        </div>
      </div>
    </div>`;
}

// ═════════════════════════════════════════════
//  ACTIONS — validate → mutate G → feedback → render → save (03 §5.2)
// ═════════════════════════════════════════════

function pfShowTab(tab) {
  pfTab = tab;
  if (typeof Sound !== 'undefined' && Sound.click) Sound.click();
  renderProfile();
}

function pfStage(skillId, delta) {
  const def = pfSkillDef(skillId);
  if (!def) return;
  const cur = pfPending[skillId] || 0;
  if (delta > 0) {
    if (!pfCanAfford(skillId)) { toast('Not enough skill points!', true); return; }
    pfPending[skillId] = cur + 1;
  } else {
    if (cur <= 0) return;
    if (cur === 1) delete pfPending[skillId]; else pfPending[skillId] = cur - 1;
  }
  if (typeof Sound !== 'undefined' && Sound.click) Sound.click();
  renderProfile();   // staged only — nothing persisted until commit
}

function pfResetPending() {
  pfPending = {};
  renderProfile();
}

function pfOpenConfirm() {
  if (pfPendingCost(pfPending) <= 0) return;
  pfConfirmOpen = true;
  renderProfile();
}

function pfCloseConfirm() {
  pfConfirmOpen = false;
  renderProfile();
}

function pfCommitSkills() {
  const spent = pfPendingCost(pfPending);
  if (spent <= 0) { pfConfirmOpen = false; renderProfile(); return; }
  if (spent > (G.skillPts || 0)) { toast('Not enough skill points!', true); return; }

  const summary = [];
  SKILL_DEFS.forEach(def => {
    const ranks = pfPending[def.id] || 0;
    if (!ranks) return;
    const gained = ranks * pfSkillGrant(def.id);
    if (def.pool) {
      // Raising a ceiling also tops up the pool itself — you feel it now.
      G[def.pool].max += gained;
      credit(def.pool, gained, REASON.SKILL_ALLOC, { ref: { skill: def.id, ranks: ranks } });
    } else {
      G[def.stat] = (G[def.stat] || 0) + gained;   // a stat, not a balance
    }
    summary.push(def.label + ' +' + gained);
  });
  debit('skillPts', spent, REASON.SKILL_ALLOC, { ref: { skills: Object.keys(pfPending) } });

  pfPending = {};
  pfConfirmOpen = false;

  log('SKILLS — spent ' + spent + (spent === 1 ? ' point' : ' points') + ' — ' + summary.join(', '), 'gold');
  toast(summary.join(' · '));
  if (typeof Sound !== 'undefined' && Sound.win) Sound.win();
  updateHUD();
  renderProfile();
  GameState.save();
}

function pfOpenPicker(type, idx) {
  pfGearPick = { type: type, idx: idx };
  if (typeof Sound !== 'undefined' && Sound.click) Sound.click();
  renderProfile();
}

function pfClosePicker() {
  pfGearPick = null;
  renderProfile();
}

// Put an owned item in a specific slot. An item already fielded elsewhere in
// the type SWAPS with the occupant (one instance is one instance, and the
// occupant is never silently destroyed); equipping from the stash over a
// filled slot benches the occupant. Slot arrays stay dense.
function pfEquip(type, idx, itemId) {
  const item = pfFindItem(itemId);
  if (!item || item.type !== type) return;
  if (!ownsGear(itemId)) { toast("You don't own that yet.", true); return; }
  if (idx >= slotCapacity(type)) { toast('That slot needs more soldiers.', true); return; }

  G.loadout = G.loadout || {};
  const ids = G.loadout[type] = G.loadout[type] || [];
  const at = ids.indexOf(itemId);
  if (at === idx) { pfGearPick = null; renderProfile(); return; } // already here
  if (at !== -1) {
    if (idx < ids.length) { ids[at] = ids[idx]; ids[idx] = itemId; } // swap slots
    else { ids.splice(at, 1); ids.push(itemId); }                   // move to the open slot
  } else {
    if (idx < ids.length) ids[idx] = itemId;                        // occupant benched
    else ids.push(itemId);
  }

  pfGearPick = null;
  log('GEAR — fielded ' + item.name + ' — ' + item.desc, 'info');
  toast(item.name + ' fielded');
  if (typeof Sound !== 'undefined' && Sound.click) Sound.click();
  updateHUD();
  renderProfile();
  GameState.save();
}

function pfUnequip(type, idx) {
  const ids = (G.loadout || {})[type] || [];
  const item = pfFindItem(ids[idx]);
  if (!item) { pfGearPick = null; renderProfile(); return; }
  ids.splice(idx, 1);   // dense: secondaries shift up behind the gap
  pfGearPick = null;
  log('GEAR — benched ' + item.name, 'info');
  toast(item.name + ' benched');
  updateHUD();
  renderProfile();
  GameState.save();
}

// Stash-row tap: field into the first open slot of its type, or bench it if
// it is already fielded.
function pfToggleField(itemId) {
  const item = pfFindItem(itemId);
  if (!item || !ownsGear(itemId)) return;
  const ids = (G.loadout || {})[item.type] || [];
  const at = ids.indexOf(itemId);
  if (at !== -1 && at < slotCapacity(item.type)) { pfUnequip(item.type, at); return; }
  if (autoFieldGear(itemId)) {
    log('GEAR — fielded ' + item.name + ' — ' + item.desc, 'info');
    toast(item.name + ' fielded');
    updateHUD();
    renderProfile();
    GameState.save();
  } else {
    toast('No open ' + item.type + ' slot. Recruit soldiers or swap.', true);
  }
}

function pfOpenInfo(key) { pfInfoKey = key; renderProfile(); }
function pfCloseInfo()   { pfInfoKey = null; renderProfile(); }

// The stats overlay is its own system (build order item 4) and replaces
// js/stats.js. Until then the button routes to the existing STATS tab so the
// affordance is never dead.
function pfOpenStats() {
  if (typeof showTab === 'function') showTab('stats');
}
