// ─────────────────────────────────────────────
//  PROPERTIES — Spots (DOM-74)
//
//  Cash accrues per owned Spot from elapsed time (same lazy-timestamp idea as
//  the regen engine), clamped by the level-gated offline cap from
//  data/unlocks.json. A full bank earns nothing — the cap is the leash, the
//  rate only prices a session. Uncollected accrual is NOT lootable in v1
//  (ratified 2026-09-11): it lives outside the wallet until collectSpots()
//  moves it through the ledger, and the loot base in combat reads G.cash only.
//  The cap bounds that shelter to a few hours of spot income by design.
// ─────────────────────────────────────────────

function spotCapSeconds() {
  return capabilityAt('spotOfflineCapSeconds', G.level);
}

// Anchor for an owned spot. A spot with no anchor yet (fresh purchase, or a
// save predating accrual) anchors at `now` — deliberately no retro-accrual:
// a legacy save must not mint a full bank the moment this feature ships.
function spotAnchor(id, now) {
  if (!G.spots[id]) G.spots[id] = { lastCollect: now };
  return G.spots[id];
}

// Accrued-but-uncollected Cash for one spot, cap-clamped. Legacy multi-copy
// saves keep their counts honored (rate × count); new purchases are own-once.
function spotAccrued(id, now) {
  const count = G.properties[id] || 0;
  if (!count) return 0;
  const p = PROPERTIES.find(x => x.id === id);
  if (!p) return 0;
  const elapsedSec = Math.max(0, (now - spotAnchor(id, now).lastCollect) / 1000);
  return p.ratePerHour * count * Math.min(elapsedSec, spotCapSeconds()) / 3600;
}

function spotsAccruedTotal(now) {
  const t = now || Date.now();
  return Object.keys(G.properties).reduce((sum, id) => sum + spotAccrued(id, t), 0);
}

// One transaction: every bank into the wallet, one ledger row, anchors reset.
function collectSpots() {
  const now = Date.now();
  const total = Math.floor(spotsAccruedTotal(now));
  if (total < 1) return 0;
  credit('cash', total, REASON.SPOT_COLLECT);
  Object.keys(G.properties).forEach(id => { spotAnchor(id, now).lastCollect = now; });
  return total;
}

function renderProps() {
  const container = $('prop-list');
  container.innerHTML = '';
  const now = Date.now();
  const capSec = spotCapSeconds();
  PROPERTIES.forEach(p => {
    const owned = (G.properties[p.id] || 0) > 0;
    const locked = G.level < (p.levelReq || 1);
    const canAfford = G.cash >= p.price;
    const div = document.createElement('div');
    div.className = 'prop-card';
    let status, action;
    if (owned) {
      const elapsedSec = Math.max(0, (now - spotAnchor(p.id, now).lastCollect) / 1000);
      const banked = Math.floor(spotAccrued(p.id, now));
      // A spot at its cap visibly earns nothing further (DOM-74 acceptance).
      status = elapsedSec >= capSec
        ? `$${banked.toLocaleString()} banked — FULL, earning nothing`
        : `$${banked.toLocaleString()} banked`;
      action = '<div class="prop-owned">OWNED</div>';
    } else {
      status = locked ? 'Locked' : 'Not owned';
      action = `<button class="prop-btn" onclick="buyProp('${p.id}')" ${locked || !canAfford ? 'disabled' : ''}>
        ${locked ? 'LEVEL ' + p.levelReq : canAfford ? `BUY ($${p.price.toLocaleString()})` : `$${p.price.toLocaleString()} needed`}
      </button>`;
    }
    div.innerHTML = `
      <div class="prop-name">${p.name}</div>
      <div class="prop-income">${p.desc}</div>
      <div class="prop-owned">${status}</div>
      ${action}
    `;
    container.appendChild(div);
  });
}

function buyProp(propId) {
  const prop = PROPERTIES.find(p => p.id === propId);
  if (!prop) return;
  if (G.level < (prop.levelReq || 1)) { toast('Locked until level ' + prop.levelReq + '!', true); return; }
  if ((G.properties[propId] || 0) > 0) { toast('You already run that spot!', true); return; }
  if (G.cash < prop.price) { toast("Can't afford that spot!", true); return; }
  debit('cash', prop.price, REASON.SPOT_BUY, { ref: { spotId: prop.id } });
  G.properties[propId] = 1;
  G.spots[propId] = { lastCollect: Date.now() };   // the bank starts empty
  log(`Bought ${prop.name} — banks $${prop.ratePerHour.toLocaleString()}/hr`, 'gold');
  toast(`${prop.name} acquired! $${prop.ratePerHour.toLocaleString()}/hr`);
  updateHUD();
  renderProps();
  GameState.save();
  Notify.incomeReady();
  // Passive income is worth being reminded about — nudge guests to register so
  // they can actually receive that reminder. Throttled + guarded inside Auth.
  if (typeof Auth !== 'undefined') Auth.promptRegister('bought_spot');
}
