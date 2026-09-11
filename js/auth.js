// ─────────────────────────────────────────────
//  AUTH / PLATFORM LOGIN
//  Guest mode + register/sign-in prompting.
//
//  Jest lets players start as guests and register later. Guest limits:
//   • Guests cannot receive notifications (do not schedule for them).
//   • Guests cannot start recurring subscriptions (Jest prompts register).
//  Player id is stable across the guest→registered transition, so saved
//  progress (JestSDK.data / GameState) transfers automatically — nothing
//  to migrate here.
//
//  Docs: https://docs.jest.com/sdk/platform-login , /sdk/player
//  Golden rule (07-external-systems.md §2.1): every SDK access is
//  feature-detected, try/caught, and has a working fallback.
// ─────────────────────────────────────────────

// Config defaults — used if data/platform.json is missing/unreadable (T5).
const AUTH_DEFAULTS = {
  rankThreshold: 3,      // first rank at which we nudge a guest to register
  cooldownHours: 24,     // min hours between automatic (non-forced) prompts
  copy: {
    welcome: 'Account claimed. Your empire is locked in — and the streets can reach you now.',
    toastRegistered: "You're in. Progress saved to your account.",
    needPlatform: 'Signing in needs the Jest platform.',
  },
};

const Auth = {
  _registered: false, // is the current player a registered (non-guest) account?
  _known: false,      // did we positively read platform state this session?

  // Read registration status from the platform. Guest === !registered.
  // Called once at boot, right after JestSDK.init().
  async init() {
    if (typeof JestSDK === 'undefined') {
      // Plain-browser path: there is no platform account — treat as guest,
      // but _known stays false so we never surface a dead "sign in" prompt.
      this._registered = false;
      this._known = false;
      return;
    }
    try {
      const player = JestSDK.getPlayer();
      this._registered = !!player.registered;
      this._known = true;
    } catch (e) {
      console.warn('Auth.init: getPlayer failed:', e);
      this._registered = false;
      this._known = false;
    }
  },

  isRegistered() { return this._registered; },
  isGuest()      { return !this._registered; },

  // True only when we can actually do something about a guest (on-platform,
  // state read, still a guest). Gates every prompt + the Crew "claim" card so
  // plain-browser dev never shows a prompt that can't work.
  canPrompt() {
    return typeof JestSDK !== 'undefined' && this._known && !this._registered;
  },

  // Re-read platform state (e.g. after a login popup closes) and, if the
  // player just became registered, run the one-time transition.
  async refresh() {
    if (typeof JestSDK === 'undefined') return;
    try {
      const wasGuest = !this._registered;
      const player = JestSDK.getPlayer();
      this._registered = !!player.registered;
      this._known = true;
      if (wasGuest && this._registered) this._onRegistered();
    } catch (e) {
      console.warn('Auth.refresh failed:', e);
    }
  },

  // Prompt a guest to register / sign in via Jest's built-in popup.
  //  reason      — short tag recorded in entryPayload for funnel analysis.
  //  opts.force  — bypass the cooldown (use for explicit user taps, e.g. the
  //                Crew "claim account" button). Automatic nudges omit it.
  async promptRegister(reason, opts = {}) {
    if (!this.canPrompt()) {
      // Only tell the user when they explicitly asked and can't be served.
      if (opts.force && typeof JestSDK === 'undefined') {
        toast(this._copy().needPlatform, true);
      }
      return;
    }
    if (!opts.force && !this._cooldownElapsed()) return;

    this._markPrompted();
    try {
      await JestSDK.login({ entryPayload: { source: reason || 'gameplay' } });
    } catch (e) {
      console.warn('Auth.promptRegister failed:', e);
      return;
    }
    // Popup dismissed — they may have registered.
    await this.refresh();
  },

  // ── internals ────────────────────────────────

  // Fired once, the moment a guest becomes registered this session.
  _onRegistered() {
    const copy = this._copy();
    log(copy.welcome, 'gold');
    toast(copy.toastRegistered);
    // They can receive notifications now — (re)schedule the ones we skipped
    // while they were a guest.
    if (typeof Notify !== 'undefined') {
      Notify.reEngage();
      Notify.incomeReady();
    }
    if (typeof updateHUD === 'function') updateHUD();
  },

  _cfg() {
    // PLATFORM is populated by loadGameData(); fall back to defaults.
    return (typeof PLATFORM !== 'undefined' && PLATFORM) ? PLATFORM : {};
  },
  _copy() {
    return Object.assign({}, AUTH_DEFAULTS.copy, this._cfg().copy || {});
  },
  rankThreshold() {
    return this._cfg().rankThreshold ?? AUTH_DEFAULTS.rankThreshold;
  },

  _cooldownElapsed() {
    const hrs = this._cfg().cooldownHours ?? AUTH_DEFAULTS.cooldownHours;
    const last = G.lastRegisterPromptAt || 0;
    return (Date.now() - last) >= hrs * 3600 * 1000;
  },
  _markPrompted() {
    G.lastRegisterPromptAt = Date.now();
    GameState.save();
  },
};
