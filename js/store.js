// ─────────────────────────────────────────────
//  STORE (S7 — DOM-116)
//
//  Bread buys gear and supplies. Real money buys the featured kit, and nothing
//  else: Jake ruled on 2026-09-15 that v1 ships no hard currency, so the GOLD
//  tab, the GOLD wallet tile and the gold-pack confirm are OMITTED rather than
//  stubbed. docs/oppsDefinitions.md says "none in v1" in three places and
//  js/payments.js removed the pack catalogue with the `gems` balance — a GOLD
//  tab here would reverse that, and would sell a currency with nothing to spend
//  it on. If it comes back it is its own ticket, with a sink.
//
//  Buying gear marks it OWNED and deducts Bread. It never banks stats (DOM-75 /
//  FW1) — combat reads the loadout, and equipping is Profile's job.
//
//  Names here are `store*`, not `st*`: js/settings.js already owns `stEsc`, and
//  in a page of plain scripts a second declaration is a SyntaxError that stops
//  the other file loading. tests/structure.test.js guards that now.
// ─────────────────────────────────────────────

const STORE_CATS = [{ id: 'gear', label: 'GEAR' }, { id: 'supplies', label: 'SUPPLIES' }];

// Which tab is showing is a session thing, like the plug dialogue position —
// reopening the Store lands on GEAR rather than wherever you left it.
let _storeCat = 'gear';
function storeSetCat(cat) { _storeCat = cat; renderStore(); }

const storeEsc = v => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// For a double-quoted attribute that holds a JS call. Deliberately NOT storeEsc:
// that escapes the apostrophes the call is made of, which a browser decodes back
// but which makes the markup unreadable and the handler untestable.
const storeAttr = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/"/g, '&quot;');

const storeMoney = n => '$' + Number(n || 0).toLocaleString();

// ── data helpers ─────────────────────────────

function storeSlotLabel(slot) {
  const list = (typeof SLOTS !== 'undefined' && SLOTS && SLOTS.slots) || [];
  for (const s of list) if (s.id === slot) return s.label;
  return String(slot || '').toUpperCase();
}

function storeSupplies() {
  return (typeof STOREFRONT !== 'undefined' && STOREFRONT && STOREFRONT.supplies) || [];
}
function storeOffer() {
  return (typeof STOREFRONT !== 'undefined' && STOREFRONT && STOREFRONT.offer) || null;
}
function supplyHeld(id) { return (G.supplies && G.supplies[id]) || 0; }

// The offer is a real-money SKU granted server-side after verification. Nothing
// sets this yet: `kit_mp9_full` is not registered in the Jest console and
// Payments._applyEffect has no branch for it, both of which are Jake's to do.
// The read side ships so the OWNED state is real the day the grant lands.
function offerOwned(sku) { return !!(G.offers && G.offers[sku]); }

// ── the shelves ──────────────────────────────

// Only unowned, non-drop items. Owned gear lives on Profile, and drop-only
// rarities are the thing Cash cannot buy (DOM-18).
function storeGear() {
  return (STORE_ITEMS || []).filter(i => !i.dropOnly && !ownsGear(i.id));
}

function _stRow(o) {
  const cta = o.owned ? 'OWNED' : o.locked ? 'LV ' + o.levelReq : o.afford ? 'BUY' : 'BROKE';
  const can = !o.owned && !o.locked && o.afford;
  const cls = o.owned ? 'st-cta is-owned' : can ? 'st-cta sheen' : 'st-cta is-blocked';
  return '<div class="st-row' + (o.locked ? ' is-locked' : '') + '">' +
      '<div class="st-row-main">' +
        '<div class="st-row-head">' +
          '<span class="st-row-name">' + storeEsc(o.name) + '</span>' +
          '<span class="st-row-tier tier-' + storeEsc(o.tier) + '">' + storeEsc(o.tier) + '</span>' +
        '</div>' +
        '<div class="st-row-meta">' + storeEsc(o.meta) + '</div>' +
        (o.locked ? '<div class="st-gate">UNLOCKS AT LV ' + o.levelReq + '</div>'
                  : o.chip ? '<div class="st-gate">' + storeEsc(o.chip) + '</div>' : '') +
      '</div>' +
      '<div class="st-row-right">' +
        '<div class="st-price">' + (typeof o.price === 'string' ? storeEsc(o.price) : storeMoney(o.price)) + '</div>' +
        (can
          ? '<button class="' + cls + '" onclick="' + storeAttr(o.onBuy) + '">' + cta + '</button>'
          : '<span class="' + cls + '">' + cta + '</span>') +
      '</div>' +
    '</div>';
}

function _stGearRows() {
  const items = storeGear();
  if (!items.length) {
    return '<div class="st-empty">' +
        '<div class="st-empty-title">SHELVES CLEARED</div>' +
        '<div class="st-empty-sub">You own everything the store carries</div>' +
      '</div>';
  }
  return '<div class="st-list">' + items.map(item => _stRow({
    name: item.name,
    tier: RARITY_LABELS[item.rarity] || 'COMMON',
    meta: storeSlotLabel(item.slot) + ' · ' + item.desc,
    price: item.price,
    levelReq: item.levelReq || 1,
    owned: false,                       // storeGear() already dropped owned items
    locked: G.level < (item.levelReq || 1),
    afford: G.cash >= item.price,
    onBuy: "buyItem('" + item.id + "')",
  })).join('') + '</div>';
}

// v1's actual monetization: Moves/Stamina refreshes and heals, sold directly
// (docs/oppsDefinitions.md — "purchases are direct"). These used to be a
// separate SKIP THE WAIT card below the shelves, which the v0.2 design has no
// slot for. They are consumables and this tab is SUPPLIES, so they belong in
// the same list rather than on a card the side-by-side check would reject.
//
// The REAL MONEY chip is what keeps that honest: a $250 Bread price and a $1.99
// platform price render identically otherwise, and a player must never be
// unsure which wallet a row is about to touch.
function _stIapRows() {
  const products = (typeof IAP_PRODUCTS !== 'undefined' && IAP_PRODUCTS) || [];
  return products.map(p => _stRow({
    name: p.name,
    tier: 'REFRESH',
    meta: p.desc,
    price: (typeof Payments !== 'undefined' ? Payments.getPrice(p.sku) : ''),
    chip: 'REAL MONEY',
    levelReq: 1,
    owned: false, locked: false, afford: true,
    onBuy: "Payments.buy('" + p.sku + "')",
  })).join('');
}

function _stSupplyRows() {
  const rows = storeSupplies();
  const iap = _stIapRows();
  if (!rows.length && !iap) {
    return '<div class="st-empty">' +
        '<div class="st-empty-title">NOTHING IN STOCK</div>' +
        '<div class="st-empty-sub">The supply run is late</div>' +
      '</div>';
  }
  return '<div class="st-list">' + rows.map(sup => {
    const held = supplyHeld(sup.id);
    return _stRow({
      name: sup.name,
      tier: RARITY_LABELS[sup.rarity] || 'COMMON',
      // A consumable has no slot, so the slot half of the meta line carries the
      // quantity instead — the prototype's own treatment.
      meta: (held > 0 ? 'HELD ' + held : 'SUPPLY') + ' · ' + sup.buff,
      price: sup.price,
      levelReq: 1,
      owned: false,                     // consumables restock; owning one is not owning them
      locked: false,
      afford: G.cash >= sup.price,
      onBuy: "buySupply('" + sup.id + "')",
    });
  }).join('') + iap + '</div>';
}

function _stOffer() {
  const o = storeOffer();
  if (!o) return '';
  const owned = offerOwned(o.sku);
  return '<div class="st-offer">' +
      '<img src="' + storeEsc(o.art) + '" alt="' + storeEsc(o.alt || o.name) + '">' +
      '<div class="st-offer-scrim"></div>' +
      '<div class="st-offer-top">' +
        '<div class="st-offer-name">' + storeEsc(o.name) + '</div>' +
        '<span class="st-offer-chip">OFFER</span>' +
      '</div>' +
      '<div class="st-offer-bottom">' +
        '<div class="st-offer-copy">' +
          '<div class="st-offer-buff">' + storeEsc(o.buff) + '</div>' +
          '<div class="st-offer-includes">' +
            (o.includes || []).map(i => '<span>' + storeEsc(i) + '</span>').join('') +
          '</div>' +
        '</div>' +
        (owned
          ? '<span class="st-offer-owned">OWNED</span>'
          : '<button class="st-offer-buy sheen" onclick="openOfferConfirm()">' + storeEsc(o.price) + '</button>') +
      '</div>' +
    '</div>';
}

function renderStore() {
  const cats = STORE_CATS.map(c =>
    '<button class="st-cat' + (_storeCat === c.id ? ' is-active' : '') + '"' +
      ' onclick="storeSetCat(\'' + c.id + '\')">' + c.label + '</button>').join('');

  $('tab-store').innerHTML =
    '<div class="store">' +
      '<div class="st-wallet">' +
        '<div class="st-wallet-tile">' +
          '<div class="st-wallet-k">BREAD</div>' +
          // Plain $X: the BAG cap that would make this "$X / $cap" is DOM-132,
          // a new mechanic that needs a DOM-67 sim check before it exists.
          '<div class="st-wallet-v">' + storeMoney(G.cash) + '</div>' +
        '</div>' +
      '</div>' +
      _stOffer() +
      '<div class="st-cats">' + cats + '</div>' +
      (_storeCat === 'supplies' ? _stSupplyRows() : _stGearRows()) +
    '</div>';
}

// ── buying ───────────────────────────────────

function buySupply(id) {
  const sup = storeSupplies().find(s => s.id === id);
  if (!sup) return;
  if (G.cash < sup.price) { toast("You're broke for that!", true); return; }
  debit('cash', sup.price, REASON.SUPPLY_BUY, { ref: { supplyId: sup.id } });
  if (!G.supplies) G.supplies = {};
  G.supplies[id] = supplyHeld(id) + 1;
  log('Bought ' + sup.name + ' — ' + sup.buff, 'info');
  toast(sup.name + ' — HELD ' + G.supplies[id]);
  updateHUD();
  renderStore();
  GameState.save();
}

// ── the real-money offer ─────────────────────
//
// The confirm is UI only. It hands off to Payments.buy(), which begins the
// platform purchase and grants only after the server verifies the receipt —
// nothing here may grant, in production or anywhere else.

function openOfferConfirm() {
  const o = storeOffer();
  if (!o || offerOwned(o.sku)) return;
  $('st-confirm-name').textContent = o.name;
  $('st-confirm-sku').textContent = o.sku;
  $('st-confirm-price').textContent = o.price;
  $('st-confirm-buy').textContent = 'BUY ' + o.price;
  $('store-confirm').classList.add('open');
}

function closeOfferConfirm() { $('store-confirm').classList.remove('open'); }

function storeConfirmScrim(ev) {
  if (ev && ev.target && ev.target.id === 'store-confirm') closeOfferConfirm();
}

function confirmOffer() {
  const o = storeOffer();
  closeOfferConfirm();
  if (!o) return;
  if (typeof Payments === 'undefined') return;
  Payments.buy(o.sku);
}

function buyItem(itemId) {
  const item = STORE_ITEMS.find(i => i.id === itemId);
  if (!item) return;
  if (item.dropOnly) { toast('Not for sale. It drops or it doesn\'t.', true); return; }
  if (G.level < (item.levelReq || 1)) { toast('Locked until level ' + item.levelReq + '!', true); return; }
  if (G.cash < item.price) { toast("You're broke for that!", true); return; }
  if (ownsGear(itemId)) { toast('Already owned!', true); return; }
  debit('cash', item.price, REASON.GEAR_BUY, { ref: { itemId: item.id } });
  grantGear(itemId, 'bought');
  // Owning is not fielding (DOM-75): stats are never banked here — they derive
  // from the loadout. Fielding on purchase is a convenience when a slot is open.
  const fielded = autoFieldGear(itemId);
  log(`Bought ${item.name} — ${item.desc}`, 'info');
  toast(fielded ? `${item.name} — fielded!` : `${item.name} — in the stash. Slots full.`);
  updateHUD();
  renderStore();
  renderStats();
  GameState.save();
}

// ─────────────────────────────────────────────
//  GEAR UPGRADES (DOM-88 — the recurring Cash sink, DOM-79 layer 2)
// ─────────────────────────────────────────────

// Cost to take an owned item from its current level to the next. The curve is
// global and scales by the item's own price (tuning.gear.upgradeCost); curves
// are 1-indexed, so the first upgrade (level 0 -> 1) evaluates at n = 1.
function gearUpgradeCost(item) {
  const inst = gearInstance(item.id);
  const level = inst ? inst.level : 0;
  return tuneCurve('gear.upgradeCost', level + 1, item.price);
}

function upgradeGear(itemId) {
  if (!tune('gear.upgradeEnabled')) { toast('Upgrades are shut down.', true); return; }
  const item = STORE_ITEMS.find(i => i.id === itemId);
  const inst = gearInstance(itemId);
  if (!item || !inst) return;
  if (!item.upgradeable) { toast("Can't upgrade that.", true); return; }
  const maxLevel = tune('gear.maxUpgradeLevel');
  if (maxLevel !== null && inst.level >= maxLevel) { toast('Fully upgraded!', true); return; }
  const cost = gearUpgradeCost(item);
  if (G.cash < cost) { toast("You're broke for that!", true); return; }

  debit('cash', cost, REASON.GEAR_UPGRADE, { ref: { itemId: itemId, level: inst.level + 1 } });
  inst.level += 1;

  // Nothing is banked (DOM-75): levels up to the stat cap raise the item's
  // DERIVED contribution while it is fielded (gearItemStats); levels past the
  // cap cost Cash and grant nothing but display — the prestige track.
  const cap = tune('gear.statCapLevel');
  log(`Upgraded ${item.name} to LV ${inst.level}` + (inst.level <= cap ? '' : ' — prestige'), 'win');
  toast(`${item.name} LV ${inst.level}!`);
  updateHUD();
  renderStats();
  GameState.save();
}

// This screen claims its tab (DOM-127). Prices, affordability and what is
// already owned all move while you are away, so the shelves rebuild on entry.
registerScreen('store', renderStore);
