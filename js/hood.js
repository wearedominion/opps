// ─────────────────────────────────────────────
//  HOOD ACTIVITIES
// ─────────────────────────────────────────────

function doActivity(type) {
  if (type === 'collect') {
    const income = collectIncome();
    if (income === 0) { toast('You got no spots yet. Buy some!', true); return; }
    G.money += income;
    log(`Collected $${income} from your spots`, 'gold');
    toast('+$' + income + ' collected!');
    updateHUD();
  }
  else if (type === 'rest') {
    if (G.energy < 1) { toast('No energy to rest!', true); return; }
    if (G.health >= G.maxHealth) { toast('Already at full health', true); return; }
    G.energy--;
    const heal = Math.min(25, G.maxHealth - G.health);
    G.health += heal;
    log(`Rested up, healed ${heal} HP`, 'win');
    toast('+' + heal + ' HP restored');
    updateHUD();
  }
  else if (type === 'launder') {
    if (G.energy < 2) { toast('Need 2 energy to launder!', true); return; }
    const bonus = Math.floor(G.money * 0.1);
    if (bonus < 1) { toast('Not enough money to launder.', true); return; }
    G.energy -= 2;
    G.money += bonus;
    log(`Laundered money, gained $${bonus}`, 'win');
    toast('+$' + bonus + ' laundered!');
    updateHUD();
  }
  GameState.save();
  Notify.energyFull(); // no-op if energy is full or collect was the action
}
