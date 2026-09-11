// ─────────────────────────────────────────────
//  PROPERTIES
// ─────────────────────────────────────────────

function renderProps() {
  const container = $('prop-list');
  container.innerHTML = '';
  PROPERTIES.forEach(p => {
    const owned = G.properties[p.id] || 0;
    const canAfford = G.cash >= p.price;
    const div = document.createElement('div');
    div.className = 'prop-card';
    div.innerHTML = `
      <div class="prop-name">${p.name}</div>
      <div class="prop-income">${p.desc}</div>
      <div class="prop-owned">${owned > 0 ? `Owned: ${owned}` : 'Not owned'}</div>
      <button class="prop-btn" onclick="buyProp('${p.id}')" ${!canAfford && owned === 0 ? 'disabled' : ''}>
        ${canAfford ? (owned > 0 ? `BUY MORE ($${p.price.toLocaleString()})` : `BUY ($${p.price.toLocaleString()})`) : `$${p.price.toLocaleString()} needed`}
      </button>
    `;
    container.appendChild(div);
  });
}

function buyProp(propId) {
  const prop = PROPERTIES.find(p => p.id === propId);
  if (!prop) return;
  if (G.cash < prop.price) { toast("Can't afford that spot!", true); return; }
  debit('cash', prop.price, REASON.SPOT_BUY, { ref: { spotId: prop.id } });
  G.properties[propId] = (G.properties[propId] || 0) + 1;
  log(`Bought ${prop.name} — earns $${prop.income} per collect`, 'gold');
  toast(`${prop.name} acquired! +$${prop.income}/collect`);
  updateHUD();
  renderProps();
  GameState.save();
  Notify.incomeReady();
  // Passive income is worth being reminded about — nudge guests to register so
  // they can actually receive that reminder. Throttled + guarded inside Auth.
  if (typeof Auth !== 'undefined') Auth.promptRegister('bought_spot');
}
