// ─────────────────────────────────────────────
//  DROPS (DOM-18 — the rarity loot roll)
// ─────────────────────────────────────────────
// Every job completion and fight win makes ONE roll: a proc gate
// (tuning drops.procChance), then the rarity ladder checked RAREST-FIRST at
// the ratified per-event odds (tuning drops.rarityChance) — each tier an
// order of magnitude apart: purple 0.099% → blue 0.99% → green 9.9% →
// grey 99%. Orange is authored at 0 in v1: the DOM-92 premium/event shelf.
//
// Own-once: a roll only ever grants an item the player doesn't hold, from
// the highest gate unlocked at their level; a tier with nothing left to give
// fizzles silently — no toast spam once a band is farmed out. Rolled
// client-side only because ALL resolution is client-side in the prototype;
// this moves server-side with the rest of it (integrity: DOM-77).

// Rarest first. Mythic is plumbed but RESERVED: no v1 item carries it and its
// odds are authored 0 — support stays warm for a future tier above orange.
const RARITY_ORDER = ['mythic', 'orange', 'purple', 'blue', 'green', 'grey'];

// Display vocabulary for the authored tiers; the tier-*/rar-* CSS classes
// carry the colour. Rarity ids in data stay the ratified colour words.
const RARITY_LABELS = {
  grey: 'COMMON', green: 'UNCOMMON', blue: 'RARE', purple: 'EPIC',
  orange: 'LEGENDARY', mythic: 'MYTHIC',
};

function rollDropRarity() {
  const odds = tune('drops.rarityChance');
  for (const r of RARITY_ORDER) {
    if (Math.random() < (odds[r] || 0)) return r;
  }
  return null;
}

// Returns the granted catalog item, or null when the roll missed or the tier
// had nothing left to give.
function rollDrop(sourceLabel) {
  if (Math.random() >= tune('drops.procChance')) return null;
  const rarity = rollDropRarity();
  if (!rarity) return null;
  let pool = STORE_ITEMS.filter(i =>
    i.rarity === rarity && (i.levelReq || 1) <= G.level && !ownsGear(i.id));
  if (!pool.length) return null;
  const top = Math.max(...pool.map(i => i.levelReq || 1));
  pool = pool.filter(i => (i.levelReq || 1) === top);
  const item = pool[Math.floor(Math.random() * pool.length)];
  grantGear(item.id, 'dropped');
  autoFieldGear(item.id);
  log(`${sourceLabel} — found ${item.name}`, 'win');
  toast(`FOUND: ${item.name} — ${RARITY_LABELS[rarity]}`);
  return item;
}
