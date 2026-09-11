// ─────────────────────────────────────────────
//  PLAYER PROFILE — identity · skills · gear · leaderboard
//  TDD: docs/tdds/2026-09-09-player-profile.md
//  Design: design handoff SCREENS.md §6 · docs/profileScreen.md
// ─────────────────────────────────────────────

// ═════════════════════════════════════════════
//  CONTENT — TEMPORARY HARDCODE
//  !! TENET T4 (JSON-first) EXCEPTION, called out per
//     docs/specs/03-game-architecture.md §6 step 3.
//  These three tables are placeholder content lifted from the design
//  prototype. They are shaped to move verbatim into data/gear.json and
//  data/skills.json once the live design data is authored — at which point
//  they are deleted here, loaded in loadGameData(), and the progress
//  denominator in js/main.js goes / 5 -> / 7.
//  Open decision (handoff gap 2): whether gear lives in its own file or
//  store.json gains slot/tier/pow fields. Unresolved — see the TDD §7.
// ═════════════════════════════════════════════

const GEAR_SLOTS = [
  { id: 'head',  label: 'HEAD',        body: true,  area: '1 / 1' },
  { id: 'handR', label: 'RIGHT HAND',  body: true,  area: '1 / 3' },
  { id: 'torso', label: 'TORSO',       body: true,  area: '2 / 1' },
  { id: 'handL', label: 'LEFT HAND',   body: true,  area: '2 / 3' },
  { id: 'legs',  label: 'LEGS / KICKS',body: true,  area: '3 / 1' },
  { id: 'ride',  label: 'RIDE',        body: false },
  { id: 'stash', label: 'STASH',       body: false },
];

// slot ids and item ids are PERMANENT save keys (they land in G.equipped).
// Lowercase, never reused, never renamed.
const GEAR_ITEMS = {
  head: [
    { id: 'h1', name: 'BLACK DURAG', tier: 'COMMON', pow: 3,  buff: '+3 NERVE', owned: true },
    { id: 'h2', name: 'FITTED CAP',  tier: 'RARE',   pow: 7,  buff: '+7 NERVE', owned: true },
    { id: 'h3', name: 'SKI MASK',    tier: 'ELITE',  pow: 14, buff: '+14 NERVE · LOWERS ID RISK', owned: false, req: 'LV 15' },
  ],
  torso: [
    { id: 'c1', name: 'PLATED ROPE', tier: 'COMMON', pow: 4,  buff: '+4 CLOUT/JOB', owned: true },
    { id: 'c2', name: 'ICED CUBAN',  tier: 'RARE',   pow: 10, buff: '+10 CLOUT/JOB', owned: true },
    { id: 't1', name: 'KEVLAR VEST', tier: 'ELITE',  pow: 16, buff: '+16 DEFENSE · −4 SPEED', owned: true },
    { id: 'c3', name: 'VVS PENDANT', tier: 'LEGEND', pow: 22, buff: '+22 CLOUT/JOB', owned: false, req: 'LV 30' },
  ],
  handR: [
    { id: 'w1', name: 'RUSTY .38',      tier: 'COMMON', pow: 5,  buff: '+5 MUSCLE', owned: true },
    { id: 'w2', name: 'CHROME .45',     tier: 'RARE',   pow: 11, buff: '+11 MUSCLE', owned: true },
    { id: 'w3', name: 'STREET SWEEPER', tier: 'ELITE',  pow: 19, buff: '+19 MUSCLE · −3 NERVE', owned: true },
    { id: 'w4', name: 'GOLD DESERT',    tier: 'LEGEND', pow: 28, buff: '+28 MUSCLE', owned: false, req: 'LV 22' },
  ],
  handL: [
    { id: 'p1', name: 'BURNER FLIP',     tier: 'COMMON', pow: 5,  buff: '+5 INTEL', owned: true },
    { id: 'o1', name: 'BOX CUTTER',      tier: 'RARE',   pow: 8,  buff: '+8 MUSCLE', owned: true },
    { id: 'p2', name: 'ENCRYPTED SLAB',  tier: 'ELITE',  pow: 15, buff: '+15 INTEL · SEE OPP THREAT', owned: true },
  ],
  legs: [
    { id: 'k1', name: 'SCUFFED AF1s',       tier: 'COMMON', pow: 3, buff: '+3 SPEED', owned: true },
    { id: 'k2', name: 'RED BOTTOMS',        tier: 'RARE',   pow: 9, buff: '+9 SPEED · +2 CLOUT/JOB', owned: true },
    { id: 'k3', name: 'CONSTRUCTION TIMBS', tier: 'RARE',   pow: 8, buff: '+8 DEFENSE', owned: false, req: 'LV 12' },
  ],
  ride: [
    { id: 'r1', name: 'BEAT CIVIC',      tier: 'COMMON', pow: 6,  buff: '+6 ESCAPE', owned: true },
    { id: 'r2', name: 'BLACKED CHARGER', tier: 'RARE',   pow: 13, buff: '+13 ESCAPE', owned: true },
    { id: 'r3', name: 'DONK ON 26s',     tier: 'ELITE',  pow: 17, buff: '+17 ESCAPE · +4 CLOUT/JOB', owned: false, req: '$18K' },
  ],
  stash: [
    { id: 's1', name: 'SHOEBOX',          tier: 'COMMON', pow: 4,  buff: 'BAG +$500', owned: true },
    { id: 's2', name: 'FLOOR SAFE',       tier: 'RARE',   pow: 12, buff: 'BAG +$2,000', owned: true },
    { id: 's3', name: 'TRAP HOUSE VAULT', tier: 'ELITE',  pow: 20, buff: 'BAG +$6,000', owned: false, req: 'LV 18' },
  ],
};

// `field` is the G field the skill raises. MAX MOVES raises the EXISTING
// G.maxEnergy — energy IS the Moves pool; the fiction rename happens in the
// render layer only (docs/specs/03-game-architecture.md §3.1).
// `segMax` is a display-only scale for the segmented bar — PLACEHOLDER, needs tuning.
const SKILL_DEFS = [
  { id: 'moves',   label: 'MAX MOVES',   cost: 1, field: 'maxEnergy',  build: 'GRINDER', segMax: 24,
    desc: 'More PvE jobs per session — faster mastery, cash and levels.' },
  { id: 'stamina', label: 'MAX STAMINA', cost: 2, field: 'maxStamina', build: 'FIGHTER', segMax: 24,
    desc: 'Attack other players more often. Costs double on purpose — fighting cadence is a real investment.' },
  { id: 'health',  label: 'MAX HEALTH',  cost: 1, field: 'maxHealth',  build: 'TANK',    segMax: 240,
    desc: 'Survive more rounds in turn-based fights. Resists hospitalization and makes you a poor target to farm.' },
  { id: 'attack',  label: 'ATTACK',      cost: 1, field: 'attack',     build: 'COMBAT',  segMax: 120,
    desc: 'Damage dealt when you engage. Note: equipped gear is expected to dominate this total, so raw points here are a weak sink until tuned.' },
  { id: 'defense', label: 'DEFENSE',     cost: 1, field: 'defense',    build: 'COMBAT',  segMax: 120,
    desc: 'Damage reduced when you are engaged. Note: equipped gear is expected to dominate this total, so raw points here are a weak sink until tuned.' },
];

// ═════════════════════════════════════════════
//  SESSION-ONLY UI STATE — intentionally NOT persisted, so a returning
//  player lands on a clean profile (TDD §6).
// ═════════════════════════════════════════════

let pfTab = 'skills';
let pfPending = {};      // { skillId: ranksStaged }
let pfGearPick = null;   // slotId of the open picker
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

function pfAllItems() {
  const out = [];
  GEAR_SLOTS.forEach(sl => (GEAR_ITEMS[sl.id] || []).forEach(it => out.push({ ...it, slot: sl.id })));
  return out;
}

function pfFindItem(itemId) {
  return pfAllItems().find(i => i.id === itemId) || null;
}

// Placeholder ownership: real data drives this from G.inventory. The hardcoded
// `owned` flag is prototype seed data and goes away with the JSON migration.
function pfOwns(item) {
  if (!item) return false;
  return (G.inventory || []).includes(item.id) || item.owned === true;
}

function pfSlotLabel(slotId) {
  const s = GEAR_SLOTS.find(x => x.id === slotId);
  return s ? s.label : slotId;
}

// Total gear power from the equipped loadout. Derived — never banked into G.
function pfGearPower(equipped) {
  const eq = equipped || {};
  return Object.keys(eq).reduce((sum, slotId) => {
    const it = pfFindItem(eq[slotId]);
    return sum + (it && it.slot === slotId ? (it.pow || 0) : 0);
  }, 0);
}

function pfBodySlotsFilled(equipped) {
  const eq = equipped || {};
  return GEAR_SLOTS.filter(s => s.body && eq[s.id]).length;
}

function pfSkillDef(id) { return SKILL_DEFS.find(s => s.id === id) || null; }

// Points staged across all skills.
function pfPendingCost(pending) {
  return Object.keys(pending || {}).reduce((sum, id) => {
    const def = pfSkillDef(id);
    return sum + (def ? def.cost * (pending[id] || 0) : 0);
  }, 0);
}

function pfPointsLeft() {
  return (G.skillPts || 0) - pfPendingCost(pfPending);
}

function pfCanAfford(skillId) {
  const def = pfSkillDef(skillId);
  return !!def && pfPointsLeft() >= def.cost;
}

// The ONE public projection. docs/profileScreen.md "Self vs Public" and
// TDD §10: raw Attack/Defense/Health, pools, cash, unspent points and
// unequipped inventory must never reach another player. Enforced here,
// never per-render.
function pfPublicProjection(state) {
  const s = state || G;
  const eq = s.equipped || {};
  return {
    handle: s.handle || 'PLAYER',
    level: s.level,
    clout: s.xp,
    rank: (typeof RANK_NAMES !== 'undefined' && RANK_NAMES.length)
      ? RANK_NAMES[Math.min((s.level || 1) - 1, RANK_NAMES.length - 1)] : '',
    gear: GEAR_SLOTS.map(sl => {
      const it = pfFindItem(eq[sl.id]);
      return it && it.slot === sl.id
        ? { slot: sl.id, slotLabel: sl.label, name: it.name, tier: it.tier }
        : null;
    }).filter(Boolean),
    // Deliberately absent: attack, defense, health, maxHealth, energy,
    // stamina, money, gems, skillPts, inventory.
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
  const rank = (typeof RANK_NAMES !== 'undefined' && RANK_NAMES.length)
    ? RANK_NAMES[Math.min(G.level - 1, RANK_NAMES.length - 1)] : '';
  const pct = Math.min((G.xp / G.xpNext) * 100, 100);
  const toNext = Math.max(G.xpNext - G.xp, 0);
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
          <span class="pf-clout">${G.xp.toLocaleString()}</span>
          <span class="pf-clout-tag">CLOUT</span>
        </div>
        <div class="pf-xp-wrap">
          <div class="pf-xp-labels">
            <span class="l">${toNext.toLocaleString()} TO NEXT</span>
            <span class="r">${G.xp.toLocaleString()} / ${G.xpNext.toLocaleString()}</span>
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
    const base = G[def.field] || 0;
    const staged = pfPending[def.id] || 0;
    const shown = base + staged;
    const afford = left >= def.cost;
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
            <div class="pf-skill-cost${afford ? ' afford' : ''}">${def.cost} ${def.cost === 1 ? 'PT' : 'PTS'} PER RANK</div>
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
          <div class="pf-empty-hint">Level up to earn ${SKILL_POINTS_PER_LEVEL} skill points.</div>
        </div>` : ''}
      ${rows}
      <div class="pf-warn">
        <span class="pf-warn-mark">▲</span>
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
function pfSlotBox(slot) {
  const eq = G.equipped || {};
  const it = pfFindItem(eq[slot.id]);
  const filled = !!(it && it.slot === slot.id);
  const area = slot.area ? `style="grid-area:${slot.area}"` : '';
  return `
    <button class="pf-slot${filled ? '' : ' empty'}" ${area} onclick="pfOpenPicker('${slot.id}')">
      <div class="pf-slot-label">${slot.label}</div>
      <div class="pf-slot-name ${filled ? 'tier-' + it.tier : 'is-empty'}">${filled ? pfEsc(it.name) : 'EMPTY'}</div>
      <div class="pf-slot-buff">${filled ? pfEsc(it.buff) : 'Tap to equip'}</div>
    </button>`;
}

function pfRenderGear() {
  const eq = G.equipped || {};
  const body = GEAR_SLOTS.filter(s => s.body);
  const off = GEAR_SLOTS.filter(s => !s.body);
  const owned = pfAllItems().filter(pfOwns);

  const invRows = owned.length ? owned.map(it => {
    const isEq = eq[it.slot] === it.id;
    return `
      <button class="pf-inv-row${isEq ? ' equipped' : ''}" onclick="pfEquip('${it.slot}','${it.id}')">
        <div class="pf-inv-main">
          <div class="pf-inv-name">${pfEsc(it.name)}</div>
          <div class="pf-inv-meta">${pfSlotLabel(it.slot)} · ${pfEsc(it.buff)}</div>
        </div>
        <span class="pf-inv-tier tier-${it.tier}">${it.tier}</span>
        <span class="pf-inv-status${isEq ? ' on' : ''}">${isEq ? 'EQUIPPED' : 'EQUIP'}</span>
      </button>`;
  }).join('') : `
      <div class="pf-empty bare">
        <div class="pf-empty-label">EMPTY</div>
        <div class="pf-empty-hint">No gear yet. Hit the Plug to pick something up.</div>
      </div>`;

  return `
    <div class="pf-gear">
      <div class="pf-doll">
        ${body.map(pfSlotBox).join('')}
        <div class="pf-figure">
          <svg width="84" height="196" viewBox="0 0 90 210" fill="none" role="img" aria-label="Equipment slots on a body outline">
            <circle cx="45" cy="19" r="14" fill="var(--control)" stroke="var(--border-ctrl)"/>
            <rect x="28" y="39" width="34" height="60" rx="7" fill="var(--control)" stroke="var(--border-ctrl)"/>
            <rect x="13" y="43" width="11" height="54" rx="5.5" fill="var(--panel)" stroke="var(--border)"/>
            <rect x="66" y="43" width="11" height="54" rx="5.5" fill="var(--panel)" stroke="var(--border)"/>
            <rect x="30" y="103" width="13" height="72" rx="6" fill="var(--panel)" stroke="var(--border)"/>
            <rect x="47" y="103" width="13" height="72" rx="6" fill="var(--panel)" stroke="var(--border)"/>
            <rect x="27" y="178" width="17" height="9" rx="4.5" fill="var(--control)" stroke="var(--border-ctrl)"/>
            <rect x="46" y="178" width="17" height="9" rx="4.5" fill="var(--control)" stroke="var(--border-ctrl)"/>
          </svg>
        </div>
        <div class="pf-gearpow">
          <div class="pf-slot-label">GEAR POWER</div>
          <div class="pf-gearpow-val">${pfGearPower(eq)}</div>
          <div class="pf-gearpow-sub">${pfBodySlotsFilled(eq)}/5 SLOTS</div>
        </div>
      </div>
      <div class="pf-off">${off.map(pfSlotBox).join('')}</div>
      <div>
        <div class="pf-sec-head">
          <h4>INVENTORY</h4>
          <div class="pf-sec-rule"></div>
          <span class="pf-sec-count">${owned.length} ${owned.length === 1 ? 'ITEM' : 'ITEMS'}</span>
        </div>
        <div class="pf-inv">${invRows}</div>
      </div>
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
  const slot = GEAR_SLOTS.find(s => s.id === pfGearPick);
  if (!slot) return '';
  const eq = G.equipped || {};
  const items = GEAR_ITEMS[slot.id] || [];
  const rows = items.length ? items.map(it => {
    const owns = pfOwns(it);
    const isEq = eq[slot.id] === it.id;
    const state = isEq ? 'EQUIPPED' : owns ? 'EQUIP' : (it.req || 'LOCKED');
    return `
      <button class="pf-pick-row${owns ? '' : ' locked'}"
        ${owns ? `onclick="pfEquip('${slot.id}','${it.id}')"` : 'disabled'}>
        <div class="pf-inv-main">
          <div class="pf-inv-name lg">${pfEsc(it.name)}</div>
          <div class="pf-inv-meta">${pfEsc(it.buff)}</div>
        </div>
        <span class="pf-inv-tier tier-${it.tier}">${it.tier}</span>
        <span class="pf-inv-status${isEq ? ' on' : ''}">${state}</span>
      </button>`;
  }).join('') : `
      <div class="pf-empty">
        <div class="pf-empty-label">EMPTY</div>
        <div class="pf-empty-hint">Nothing fits this slot yet.</div>
      </div>`;

  return `
    <div class="pf-scrim sheet open" onclick="pfClosePicker()">
      <div class="pf-panel sheet" onclick="event.stopPropagation()">
        <div class="pf-panel-head">
          <div class="pf-fill">
            <div class="pf-panel-title">${slot.label}</div>
            <div class="pf-panel-sub">CHOOSE WHAT YOU CARRY</div>
          </div>
          ${eq[slot.id] ? `<button class="pf-unequip" onclick="pfUnequip('${slot.id}')">UNEQUIP</button>` : ''}
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
      <span class="v">${G[d.field] || 0} → ${(G[d.field] || 0) + pfPending[d.id]}</span>
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
            <span class="pf-warn-mark">▲</span>
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
    body = def.desc + ' Costs ' + def.cost + (def.cost === 1 ? ' point' : ' points') + ' per rank.';
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
    G[def.field] = (G[def.field] || 0) + ranks;
    // Raising a max also tops up the matching current pool — you feel it now.
    if (def.field === 'maxEnergy')  G.energy    = Math.min(G.maxEnergy,  (G.energy || 0) + ranks);
    if (def.field === 'maxStamina') G.stamina   = Math.min(G.maxStamina, (G.stamina || 0) + ranks);
    if (def.field === 'maxHealth')  G.health    = Math.min(G.maxHealth,  (G.health || 0) + ranks);
    summary.push(def.label + ' +' + ranks);
  });
  G.skillPts = (G.skillPts || 0) - spent;

  pfPending = {};
  pfConfirmOpen = false;

  log('SKILLS — spent ' + spent + (spent === 1 ? ' point' : ' points') + ' — ' + summary.join(', '), 'gold');
  toast(summary.join(' · '));
  if (typeof Sound !== 'undefined' && Sound.win) Sound.win();
  updateHUD();
  renderProfile();
  GameState.save();
}

function pfOpenPicker(slotId) {
  pfGearPick = slotId;
  if (typeof Sound !== 'undefined' && Sound.click) Sound.click();
  renderProfile();
}

function pfClosePicker() {
  pfGearPick = null;
  renderProfile();
}

function pfEquip(slotId, itemId) {
  const item = pfFindItem(itemId);
  if (!item || item.slot !== slotId) return;
  if (!pfOwns(item)) { toast("You don't own that yet.", true); return; }

  G.equipped = G.equipped || {};
  if (G.equipped[slotId] === itemId) {   // tapping the equipped item unequips it
    delete G.equipped[slotId];
    log('GEAR — took off ' + item.name, 'info');
    toast(item.name + ' unequipped');
  } else {
    G.equipped[slotId] = itemId;
    log('GEAR — equipped ' + item.name + ' — ' + item.buff, 'info');
    toast(item.name + ' equipped');
  }

  pfGearPick = null;
  if (typeof Sound !== 'undefined' && Sound.click) Sound.click();
  updateHUD();
  renderProfile();
  GameState.save();
}

function pfUnequip(slotId) {
  G.equipped = G.equipped || {};
  const item = pfFindItem(G.equipped[slotId]);
  if (!item) { pfGearPick = null; renderProfile(); return; }
  delete G.equipped[slotId];
  pfGearPick = null;
  log('GEAR — took off ' + item.name, 'info');
  toast(item.name + ' unequipped');
  updateHUD();
  renderProfile();
  GameState.save();
}

function pfOpenInfo(key) { pfInfoKey = key; renderProfile(); }
function pfCloseInfo()   { pfInfoKey = null; renderProfile(); }

// The stats overlay is its own system (build order item 4) and replaces
// js/stats.js. Until then the button routes to the existing STATS tab so the
// affordance is never dead.
function pfOpenStats() {
  if (typeof showTab === 'function') showTab('stats');
}
