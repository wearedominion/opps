// ─────────────────────────────────────────────
//  HOOD ACTIVITIES
// ─────────────────────────────────────────────

function doActivity(type) {
  if (type === 'collect') {
    if (Object.keys(G.properties).length === 0) { toast('You got no spots yet. Buy some!', true); return; }
    const income = collectSpots();   // one ledger row, anchors reset (DOM-74)
    if (income === 0) { toast('Nothing banked yet — give your spots a minute.', true); return; }
    log(`Collected $${income.toLocaleString()} from your spots`, 'gold');
    toast('+$' + income.toLocaleString() + ' collected!');
    updateHUD();
  }
  else if (type === 'rest') {
    // Rest must not undercut the Hospital: 4 Moves would otherwise be a free
    // instant discharge and the lockout would mean nothing (DOM-72).
    if (isHospitalized()) { toast("You're in the Hospital. Heal up or wait it out.", true); return; }
    const restCost = tune('hoodActions.restMovesCost');
    if (G.moves.current < restCost) { surfaceOffer('moves', 'Not enough Moves to rest!'); return; }
    if (G.health.current >= G.health.max) { toast('Already at full health', true); return; }
    debit('moves', restCost, REASON.MOVE_COST, { ref: { action: 'rest' } });
    const heal = credit('health', tune('hoodActions.restHealAmount'), REASON.REST_HEAL);
    log(`Rested up, healed ${heal} HP`, 'win');
    toast('+' + heal + ' HP restored');
    updateHUD();
  }
  else if (type === 'launder') {
    // Minted a percentage of the player's own balance for a flat Moves cost —
    // an unbounded, compounding Cash faucet. Zeroed via launderRate (DOM-73,
    // 2026-09-11); the action stays wired so a nonzero rate can bring back a
    // redesigned version without a client change.
    if (tune('hoodActions.launderRate') <= 0) { toast('Laundering is shut down. Word is the feds are watching.', true); return; }
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
