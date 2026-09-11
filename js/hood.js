// ─────────────────────────────────────────────
//  HOOD ACTIVITIES
// ─────────────────────────────────────────────

function doActivity(type) {
  if (type === 'collect') {
    const income = collectIncome();
    if (income === 0) { toast('You got no spots yet. Buy some!', true); return; }
    credit('cash', income, REASON.SPOT_COLLECT);
    log(`Collected $${income} from your spots`, 'gold');
    toast('+$' + income + ' collected!');
    updateHUD();
  }
  else if (type === 'rest') {
    const restCost = tune('hoodActions.restMovesCost');
    if (G.moves.current < restCost) { toast('Not enough Moves to rest!', true); return; }
    if (G.health.current >= G.health.max) { toast('Already at full health', true); return; }
    debit('moves', restCost, REASON.MOVE_COST, { ref: { action: 'rest' } });
    const heal = credit('health', tune('hoodActions.restHealAmount'), REASON.REST_HEAL);
    log(`Rested up, healed ${heal} HP`, 'win');
    toast('+' + heal + ' HP restored');
    updateHUD();
  }
  else if (type === 'launder') {
    // ECONOMY FLAG: this mints a percentage of the player's own balance for a
    // flat Moves cost — an unbounded, compounding Cash faucet with no drain
    // attached. Slated for redistribution/removal per oppsDefinitions.md ("launder
    // -> TBD"); tunable here in the meantime so it can be zeroed without a release.
    const launderCost = tune('hoodActions.launderMovesCost');
    if (G.moves.current < launderCost) { toast('Need ' + launderCost + ' Moves to launder!', true); return; }
    const bonus = Math.floor(G.cash * tune('hoodActions.launderRate'));
    if (bonus < 1) { toast('Not enough Cash to launder.', true); return; }
    debit('moves', launderCost, REASON.MOVE_COST, { ref: { action: 'launder' } });
    credit('cash', bonus, REASON.LAUNDER_PAYOUT);
    log(`Laundered Cash, gained $${bonus}`, 'win');
    toast('+$' + bonus + ' laundered!');
    updateHUD();
  }
  GameState.save();
  Notify.movesFull(); // no-op if Moves are full or collect was the action
}
