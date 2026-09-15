// S7 Store — wallet, featured offer, GEAR/SUPPLIES, purchase confirm (DOM-116).
// Part of the suite; run it all with `node tests/run.js`.

const {
  fs, path, vm, assert, ROOT, readAllCss, STORE_DATA, test,
} = require('./harness');

const SLOTS_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/slots.json'), 'utf8'));
const FRONT = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/storefront.json'), 'utf8'));
const IAP = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/monetization.json'), 'utf8'));

function renderStoreWith(over) {
  const o = over || {};
  let html = '';
  const bought = [];
  const ctx = {
    console, JSON, Object, Math, Array, String, Number,
    SLOTS: 'slots' in o ? o.slots : SLOTS_JSON,
    STOREFRONT: 'front' in o ? o.front : FRONT,
    STORE_ITEMS: o.items || STORE_DATA,
    IAP_PRODUCTS: 'iap' in o ? o.iap : IAP,
    RARITY_LABELS: { grey: 'COMMON', green: 'UNCOMMON', blue: 'RARE', purple: 'EPIC', orange: 'LEGENDARY', mythic: 'MYTHIC' },
    G: { cash: o.cash === undefined ? 1000000 : o.cash, level: o.level || 99,
         inventory: o.inventory || {}, supplies: o.supplies || {}, offers: o.offers || {} },
    ownsGear: id => !!(o.inventory && o.inventory[id]),
    Payments: { getPrice: sku => (o.prices && o.prices[sku]) || '$1.99', buy: sku => bought.push(sku) },
    $: id => (id === 'tab-store' ? { set innerHTML(v) { html = v; } } : { textContent: '', classList: { add() {}, remove() {} } }),
    registerScreen: () => {}, toast: () => {}, log: () => {}, updateHUD: () => {},
    renderStats: () => {}, GameState: { save: () => {} }, debit: () => {},
    REASON: { GEAR_BUY: 'gear_buy' }, grantGear: () => {}, autoFieldGear: () => false,
    tune: () => 0, tuneCurve: () => 0, gearInstance: () => null,
  };
  const src = fs.readFileSync(path.join(ROOT, 'js/store.js'), 'utf8')
    + '\n;globalThis.__t = { renderStore, storeSetCat, storeGear, storeSlotLabel, buySupply, offerOwned, confirmOffer, G };';
  vm.runInNewContext(src, ctx);
  if (o.cat) ctx.__t.storeSetCat(o.cat); else ctx.__t.renderStore();
  return Object.assign({}, ctx.__t, { html, bought });
}

console.log('\nS7 Store — DOM-116');

// ─────────────────────────────────────────────
//  The ruling: no hard currency in v1
// ─────────────────────────────────────────────

test('there is no GOLD anywhere on this screen', () => {
  // docs/oppsDefinitions.md says "none in v1" three times and js/payments.js
  // removed the pack catalogue with the `gems` balance. Jake ruled 2026-09-15
  // that the GOLD tab is OMITTED, not stubbed — a stub is how a ratified
  // product decision quietly comes back.
  const r = renderStoreWith({});
  assert.ok(!/>GOLD</.test(r.html), 'a GOLD tab or wallet tile is back');
  const js = fs.readFileSync(path.join(ROOT, 'js/store.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/GOLD_PACKS|goldPacks/.test(js), 'a gold pack catalogue is back in the store');
  assert.ok(!/gold/i.test(JSON.stringify(FRONT.supplies)), 'a supply is priced in gold');
  // the wallet is BREAD alone
  assert.strictEqual((r.html.match(/st-wallet-tile/g) || []).length, 1);
  assert.ok(/BREAD/.test(r.html));
  // and the confirm does not promise Gold either. 06-store.md gives that note
  // verbatim, but it was written for the gold packs: with those omitted the
  // only thing this confirm buys is the kit, so the verbatim copy would
  // promise a currency the game does not have.
  const note = /<p class="st-confirm-note">([^<]*)</.exec(
    fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'))[1];
  assert.ok(!/gold/i.test(note), 'the purchase confirm promises Gold: ' + note);
  assert.ok(/granted once the purchase is verified/.test(note), 'the doc\'s meaning is gone');
});

// ─────────────────────────────────────────────
//  The shelves
// ─────────────────────────────────────────────

test('a drop tier is never on a shelf, whatever the catalogue says', () => {
  // The behavioural half of tests/drops.test.js's code-shape check. Rarity is
  // the thing Cash cannot buy (DOM-18); a drop-only row reaching the store
  // would sell it.
  const items = [
    { id: 'a', name: 'BUYABLE', slot: 'handL', desc: '+5 ATK', price: 100, rarity: 'grey', levelReq: 1 },
    { id: 'b', name: 'DROPONLY', slot: 'handL', desc: '+9 ATK', price: 900, rarity: 'purple', levelReq: 1, dropOnly: true },
  ];
  const r = renderStoreWith({ items });
  assert.ok(/BUYABLE/.test(r.html));
  assert.ok(!/DROPONLY/.test(r.html), 'a drop-only item is on sale');
  assert.deepStrictEqual(r.storeGear().map(i => i.id), ['a']);
});

test('owned gear leaves the shelves — it lives on Profile', () => {
  const items = [
    { id: 'a', name: 'KEPT', slot: 'handL', desc: '+5 ATK', price: 100, rarity: 'grey', levelReq: 1 },
    { id: 'b', name: 'SOLD', slot: 'handL', desc: '+9 ATK', price: 900, rarity: 'grey', levelReq: 1 },
  ];
  assert.ok(/SOLD/.test(renderStoreWith({ items }).html));
  assert.ok(!/SOLD/.test(renderStoreWith({ items, inventory: { b: { level: 0 } } }).html));
});

test('the shelves say so when they are bare', () => {
  const r = renderStoreWith({ items: [] });
  assert.ok(/SHELVES CLEARED/.test(r.html));
  assert.ok(/You own everything the store carries/.test(r.html));
});

test('the four CTA states are driven by level and wallet, not by hope', () => {
  const item = { id: 'x', name: 'THING', slot: 'handL', desc: '+5 ATK', price: 500, rarity: 'grey', levelReq: 7 };
  const at = (cash, level, inventory) => renderStoreWith({ items: [item], cash, level, inventory }).html;

  const locked = at(10000, 3);
  assert.ok(/>LV 7</.test(locked) && /UNLOCKS AT LV 7/.test(locked), 'level gate');
  assert.ok(/is-locked/.test(locked), 'a locked row dims its meta and price');

  assert.ok(/>BROKE</.test(at(100, 99)), 'cannot afford');
  assert.ok(/>BUY</.test(at(10000, 99)), 'can buy');
  // level gate wins over affordability: being rich does not unlock
  assert.ok(/>LV 7</.test(at(1000000, 3)));
  // and an owned item is simply not listed, so OWNED never appears for gear
  assert.strictEqual(at(10000, 99, { x: { level: 0 } }).indexOf('THING'), -1);
});

test('only a buyable row is a button — the rest cannot be clicked', () => {
  const item = { id: 'x', name: 'THING', slot: 'handL', desc: '+5 ATK', price: 500, rarity: 'grey', levelReq: 7 };
  assert.ok(!/<button[^>]*buyItem/.test(renderStoreWith({ items: [item], cash: 10000, level: 3 }).html),
    'a level-locked row is still clickable');
  assert.ok(!/<button[^>]*buyItem/.test(renderStoreWith({ items: [item], cash: 10, level: 99 }).html),
    'a row you cannot afford is still clickable');
  assert.ok(/<button[^>]*buyItem\('x'\)/.test(renderStoreWith({ items: [item], cash: 10000, level: 99 }).html));
});

test('the meta line names the slot in words, from data', () => {
  const r = renderStoreWith({ items: [{ id: 'x', name: 'T', slot: 'handL', desc: '+5 ATK', price: 1, rarity: 'grey', levelReq: 1 }] });
  assert.ok(/LEFT HAND · \+5 ATK/.test(r.html));
  assert.strictEqual(r.storeSlotLabel('stash'), 'STASH');
  // a slot with no label degrades to the raw key rather than blank
  assert.strictEqual(r.storeSlotLabel('nope'), 'NOPE');
  // every slot a gear row can carry has a label
  const slotIds = new Set(SLOTS_JSON.slots.map(s => s.id));
  for (const item of STORE_DATA) assert.ok(slotIds.has(item.slot), item.id + ' has slot ' + item.slot);
});

// ─────────────────────────────────────────────
//  Supplies, and the real money mixed in with them
// ─────────────────────────────────────────────

test('supplies count up rather than being owned once', () => {
  const r = renderStoreWith({ cat: 'supplies', supplies: { medkit: 3 } });
  assert.ok(/HELD 3 · Restore 40 HEALTH instantly/.test(r.html), 'quantity is not shown');
  assert.ok(/SUPPLY · Refill your MOVES pool/.test(r.html), 'an unheld supply still reads as one');
  // and a held supply is still buyable — it is stock, not a collection
  assert.ok(/<button[^>]*buySupply\('medkit'\)/.test(r.html));
});

test('buying a supply increments the quantity and charges Bread', () => {
  const r = renderStoreWith({ cat: 'supplies', supplies: { medkit: 1 } });
  r.buySupply('medkit');
  assert.strictEqual(r.G.supplies.medkit, 2);
  r.buySupply('medkit');
  assert.strictEqual(r.G.supplies.medkit, 3);
});

test('a broke player cannot buy a supply, by markup and by function', () => {
  const r = renderStoreWith({ cat: 'supplies', cash: 10 });
  assert.ok(/>BROKE</.test(r.html));
  assert.ok(!/<button[^>]*buySupply/.test(r.html));
  r.buySupply('medkit');
  assert.deepStrictEqual(r.G.supplies, {}, 'a direct call still refused');
});

test('the real-money refreshes are in SUPPLIES, and say which wallet they spend', () => {
  // They were a separate SKIP THE WAIT card, which the v0.2 design has no slot
  // for. Dropping them would have deleted v1's only monetization; putting them
  // in the list unmarked would let a $250 Bread price and a $1.99 platform
  // price look identical.
  const r = renderStoreWith({ cat: 'supplies' });
  for (const p of IAP) {
    assert.ok(r.html.indexOf(p.name) !== -1, p.sku + ' is missing from the store');
    assert.ok(r.html.indexOf("Payments.buy('" + p.sku + "')") !== -1, p.sku + ' cannot be bought');
  }
  assert.strictEqual((r.html.match(/REAL MONEY/g) || []).length, IAP.length,
    'every real-money row is marked, and only those');
  // they do not leak into the GEAR tab
  assert.ok(!/REAL MONEY/.test(renderStoreWith({ cat: 'gear' }).html));
});

test('the retired SKIP THE WAIT card and the v0.1 shelves left nothing behind', () => {
  // 20-legacy.css is "v0.1 screens not yet rebuilt; shrinks as each one lands"
  // (CLAUDE.md). DOM-114 learned why that matters: a leftover single-class
  // rule reaches straight into the rebuilt screen and the later file only
  // wins for the properties it names.
  const legacy = fs.readFileSync(path.join(ROOT, 'css/20-legacy.css'), 'utf8');
  for (const dead of ['.store-grid', '.store-item', '.item-price', '.buy-btn', '.iap-grid',
                      '.iap-card', '.iap-badge', '.iap-spend-grid']) {
    assert.ok(!legacy.includes(dead), '20-legacy.css still owns ' + dead);
  }
  const payments = fs.readFileSync(path.join(ROOT, 'js/payments.js'), 'utf8');
  const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(!/function renderIapSection/.test(payments), 'the old renderer is still there');
  assert.ok(!/renderIapSection\(\)/.test(fs.readFileSync(path.join(ROOT, 'js/main.js'), 'utf8')),
    'boot still calls the retired renderer');
  assert.ok(!/id="iap-section"/.test(index), 'the dead mount point is still in the markup');
});

// ─────────────────────────────────────────────
//  The featured offer
// ─────────────────────────────────────────────

test('the offer is real money and never grants client-side', () => {
  const r = renderStoreWith({});
  assert.ok(/MP9 FULL KIT/.test(r.html) && /OFFER/.test(r.html));
  assert.ok(/assets\/mp9-kit\.png/.test(r.html), 'the art is not wired');
  for (const inc of FRONT.offer.includes) assert.ok(r.html.indexOf(inc) !== -1, 'missing include ' + inc);
  // confirming hands off to the payments seam, and nothing else happens
  r.confirmOffer();
  assert.deepStrictEqual(r.bought, [FRONT.offer.sku]);
  const js = fs.readFileSync(path.join(ROOT, 'js/store.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/G\.offers\[[^\]]*\]\s*=/.test(js), 'the store grants the offer itself');
});

test('an owned offer shows OWNED instead of a price', () => {
  const owned = renderStoreWith({ offers: { kit_mp9_full: true } });
  assert.ok(/st-offer-owned/.test(owned.html) && />OWNED</.test(owned.html));
  assert.ok(!/st-offer-buy/.test(owned.html), 'an owned kit can be bought again');
  assert.strictEqual(renderStoreWith({}).offerOwned('kit_mp9_full'), false);
});

test('the art is committed, at the aspect the card renders', () => {
  const art = path.join(ROOT, FRONT.offer.art);
  assert.ok(fs.existsSync(art), FRONT.offer.art + ' is missing');
  assert.ok(fs.statSync(art).size > 10000, 'the art is a placeholder');
  assert.ok(/\.st-offer\s*\{[^}]*aspect-ratio:\s*3 \/ 2/.test(readAllCss()));
});

// ─────────────────────────────────────────────
//  Degradation and geometry
// ─────────────────────────────────────────────

test('a missing storefront.json leaves the gear shelves standing', () => {
  const r = renderStoreWith({ front: null });
  assert.ok(!/MP9 FULL KIT/.test(r.html), 'the offer renders without data');
  assert.ok(/st-cats/.test(r.html) && /BREAD/.test(r.html));
  assert.ok(/st-row/.test(r.html), 'the gear list went down with the offer');
  // and the supplies tab degrades to the real-money rows rather than breaking
  assert.ok(/REAL MONEY/.test(renderStoreWith({ front: null, cat: 'supplies' }).html));
});

test('the screen carries the doc geometry', () => {
  const css = readAllCss();
  assert.ok(/\.store\s*\{[^}]*gap:\s*14px/.test(css), '14px column gaps');
  assert.ok(/\.st-wallet\s*\{[^}]*gap:\s*9px/.test(css));
  assert.ok(/\.st-offer\s*\{[^}]*aspect-ratio:\s*3 \/ 2/.test(css));
  assert.ok(/\.st-cats\s*\{[^}]*gap:\s*7px/.test(css), '7px between filter pills');
  assert.ok(/\.st-list\s*\{[^}]*gap:\s*9px/.test(css), '9px between rows');
  assert.ok(/\.st-row\s*\{[^}]*padding:\s*14px/.test(css));
  assert.ok(/\.st-empty\s*\{[^}]*border:\s*1px dashed/.test(css));
  assert.ok(/\.st-confirm-buy\s*\{[^}]*flex:\s*1\.3/.test(css), 'BUY is the wider half');
});
