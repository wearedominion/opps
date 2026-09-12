// ─────────────────────────────────────────────
//  HOSPITAL (DOM-72)
//
//  The recovery surface a defeated player lands in. hospitalizedUntil is the
//  whole state: epoch ms while hospitalized, null otherwise (08 §3 — one
//  field, never a flag plus a timestamp that can disagree).
//
//  Ratified 2026-09-12 (Jake): the Hospital runs its OWN timer
//  (hospital.fullHealSeconds); normal health regen is paused while it runs
//  (see js/regen.js); when it completes, health is restored to full and the
//  state clears. The Cash early-out is priced at ~1 hour of best-job income
//  at the player's level (hospital.healCost, geometric ×1.1 tracking the
//  income curve), prorated by the time remaining.
// ─────────────────────────────────────────────

function isHospitalized(now) {
  const t = now || Date.now();
  return G.hospitalizedUntil !== null && G.hospitalizedUntil > t;
}

// Reaching 0 Health sets the state in the same transaction that resolves the
// fight — combat.js calls this inside the defeat/double-KO branch, before the
// save that commits the fight.
function hospitalize(now) {
  const t = now || Date.now();
  G.hospitalizedUntil = t + tune('hospital.fullHealSeconds') * 1000;
}

// Lazy release, same pattern as the regen engine: any interested surface
// calls this with "now"; if the timer has run out, the discharge happens
// here — full heal, state cleared — whoever asks first.
function syncHospital(now) {
  const t = now || Date.now();
  if (G.hospitalizedUntil === null || G.hospitalizedUntil > t) return false;
  G.hospitalizedUntil = null;
  credit('health', G.health.max, REASON.HOSPITAL_HEAL);
  GameState.save();
  return true;
}

function hospitalSecondsLeft(now) {
  const t = now || Date.now();
  return isHospitalized(t) ? Math.ceil((G.hospitalizedUntil - t) / 1000) : 0;
}

// Cash early-out: the full-timer price scaled by the share of the timer left,
// so healing at the door costs the full hour of income and healing with a
// minute left costs pocket change. Floor of $1 keeps the row honest.
function hospitalHealCost(now) {
  const left = hospitalSecondsLeft(now);
  if (!left) return 0;
  const full = tuneCurve('hospital.healCost', G.level);
  return Math.max(1, Math.round(full * left / tune('hospital.fullHealSeconds')));
}

function hospitalHealNow() {
  const now = Date.now();
  if (!isHospitalized(now)) return;
  const cost = hospitalHealCost(now);
  if (G.cash < cost) { toast("You're broke for that!", true); return; }
  debit('cash', cost, REASON.HEAL_COST, { ref: { secondsLeft: hospitalSecondsLeft(now) } });
  G.hospitalizedUntil = null;
  credit('health', G.health.max, REASON.HOSPITAL_HEAL);
  log(`Paid $${cost.toLocaleString()} to walk out of the Hospital`, 'info');
  toast('Back on the block!');
  updateHUD();
  renderHospital();
  GameState.save();
}

// The Hood-tab card. Hidden entirely while healthy; while hospitalized it is
// the surface the defeat flow lands on.
function renderHospital() {
  const el = $('hospital-card');
  if (!el) return;
  const now = Date.now();
  syncHospital(now);
  if (!isHospitalized(now)) { el.hidden = true; return; }
  const left = hospitalSecondsLeft(now);
  const mm = Math.floor(left / 60), ss = left % 60;
  el.hidden = false;
  $('hospital-timer').textContent = mm + ':' + String(ss).padStart(2, '0');
  const btn = $('hospital-heal-btn');
  const cost = hospitalHealCost(now);
  btn.textContent = 'HEAL NOW $' + cost.toLocaleString();
  btn.disabled = G.cash < cost;
}
