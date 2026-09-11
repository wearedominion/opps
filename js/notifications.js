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
      this.incomeReady();
      this.energyFull();
    } else if (typeof Auth !== 'undefined' && Auth.canPrompt()) {
      this._clearStale();
    }
  },

  // Unscheduling an absent identifier is a no-op, so this is safe every boot.
  async _clearStale() {
    for (const identifier of ['energy_full', 'income_ready', 're_engage']) {
      try {
        await JestSDK.notifications.unscheduleNotification({ identifier });
      } catch (e) {
        console.warn('Notify._clearStale failed:', e);
      }
    }
  },

  // Called after any energy-spending action.
  // Schedules an exact-time alert for when energy will be full.
  async energyFull() {
    if (!this._canNotify() || G.energy >= G.maxEnergy) return;
    const secondsUntilFull = (G.maxEnergy - G.energy) * ENERGY_REGEN_SECONDS;
    const scheduledAt = new Date(Date.now() + secondsUntilFull * 1000).toISOString();
    try {
      await JestSDK.notifications.unscheduleNotification({ identifier: 'energy_full' });
      await JestSDK.notifications.scheduleNotification({
        identifier: 'energy_full',
        title: "You're ready to move",
        body: 'Your energy is full. Get back out there.',
        ctaText: 'Play Now',
        scheduledAt,
        priority: 'medium',
      });
    } catch (e) {
      console.warn('Notify.energyFull failed:', e);
    }
  },

  // Called after buying a property or on boot (if player has spots).
  // Reminds player to collect income after 24 hours.
  async incomeReady() {
    if (!this._canNotify()) return;
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
    if (!this._canNotify()) return;
    const rank = RANK_NAMES[Math.min(G.level - 1, RANK_NAMES.length - 1)] || 'Soldier';
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
