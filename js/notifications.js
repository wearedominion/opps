// ─────────────────────────────────────────────
//  NOTIFICATIONS
//
//  Guests cannot receive notifications, so we MUST NOT schedule any for them
//  (Jest platform rule). Every scheduler is gated on _canNotify(): the SDK is
//  present AND the player is a registered (non-guest) account. When a guest
//  later registers, Auth._onRegistered() calls back in to (re)schedule.
// ─────────────────────────────────────────────

const Notify = {
  // SDK present AND player is registered. Guests + plain-browser → false.
  _canNotify() {
    return typeof JestSDK !== 'undefined'
      && typeof Auth !== 'undefined'
      && Auth.isRegistered();
  },

  // Everything that currently applies, in one place — called on boot and again
  // by Auth when a guest registers, so the two sites can't drift. Each
  // scheduler self-guards, so calling all of them is always safe. For a known
  // guest, instead cancel anything an older build (which scheduled for every
  // SDK-present player) may have left pending for them.
  scheduleAll() {
    if (this._canNotify()) {
      this.reEngage();
      this.movesFull();
    } else if (typeof Auth !== 'undefined' && Auth.canPrompt()) {
      this._clearStale();
    }
  },

  // Unscheduling an absent identifier is a no-op, so this is safe every boot.
  // 'energy_full' is the pre-Moves-rename identifier — clear it too.
  async _clearStale() {
    for (const identifier of ['moves_full', 'energy_full', 'income_ready', 're_engage']) {
      try {
        await JestSDK.notifications.unscheduleNotification({ identifier });
      } catch (e) {
        console.warn('Notify._clearStale failed:', e);
      }
    }
  },

  // Called after any Moves-spending action.
  // Schedules an exact-time alert for when Moves will be full.
  async movesFull() {
    if (!this._canNotify() || G.moves.current >= G.moves.max) return;
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

  // Called on every boot. Schedules a 2-day re-engagement nudge,
  // cancelling the previous session's so the timer resets each visit.
  async reEngage() {
    if (!this._canNotify()) return;
    // Fallback for a boot where ranks.json missed: the list's own first title
    // would be a lie about the player's level, and a hardcoded name goes stale
    // the way 'Soldier' did when DOM-124 replaced the band names wholesale.
    const rank = rankForLevel(G.level) || 'Boss';
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
