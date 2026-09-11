// ─────────────────────────────────────────────
//  NOTIFICATIONS
// ─────────────────────────────────────────────

const Notify = {
  // Called after any Moves-spending action.
  // Schedules an exact-time alert for when Moves will be full.
  async movesFull() {
    if (typeof JestSDK === 'undefined' || G.moves.current >= G.moves.max) return;
    const secondsUntilFull = secondsToFull('moves');
    const scheduledAt = new Date(Date.now() + secondsUntilFull * 1000).toISOString();
    try {
      await JestSDK.notifications.unscheduleNotification({ identifier: 'moves_full' });
      await JestSDK.notifications.scheduleNotification({
        identifier: 'moves_full',
        title: "You're ready to move",
        body: 'Your Moves are full. Get back out there.',
        ctaText: 'Play Now',
        scheduledAt,
        priority: 'medium',
      });
    } catch (e) {
      console.warn('Notify.movesFull failed:', e);
    }
  },

  // Called after buying a property or on boot (if player has spots).
  // Reminds player to collect income after 24 hours.
  async incomeReady() {
    if (typeof JestSDK === 'undefined') return;
    const income = collectIncome();
    if (income === 0) return;
    try {
      await JestSDK.notifications.unscheduleNotification({ identifier: 'income_ready' });
      await JestSDK.notifications.scheduleNotification({
        identifier: 'income_ready',
        title: 'Your spots are producing',
        body: `$${income.toLocaleString()} sitting in your spots. Don't leave it on the table.`,
        ctaText: 'Collect Now',
        scheduledInDays: 1,
        priority: 'low',
      });
    } catch (e) {
      console.warn('Notify.incomeReady failed:', e);
    }
  },

  // Called on every boot. Schedules a 2-day re-engagement nudge,
  // cancelling the previous session's so the timer resets each visit.
  async reEngage() {
    if (typeof JestSDK === 'undefined') return;
    const rank = rankForLevel(G.level) || 'Soldier';
    try {
      await JestSDK.notifications.unscheduleNotification({ identifier: 're_engage' });
      await JestSDK.notifications.scheduleNotification({
        identifier: 're_engage',
        title: 'Your empire needs you',
        body: `${rank}, the streets don't run themselves. Get back in it.`,
        ctaText: 'Play Now',
        scheduledInDays: 2,
        priority: 'low',
      });
    } catch (e) {
      console.warn('Notify.reEngage failed:', e);
    }
  },
};
