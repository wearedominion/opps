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
    loginFailed: "Couldn't open sign-in. Try again in a minute.",
    crewTitle: 'PLAYING AS A GUEST',
    crewBody: "Claim your account to lock in your crew and progress — and get pinged when your spots pay out and your Moves are back.",
    crewCta: 'CLAIM YOUR ACCOUNT',
  },
};

const Auth = {
  _registered: false,    // is the current player a registered (non-guest) account?
  _known: false,         // did we positively read platform state this session?
  _loginInFlight: false, // a login popup is open — don't stack a second one

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

  isRegistered() {
    if (!this._known) this._retryRead();
    return this._registered;
  },
  isGuest()      { return !this._registered; },

  // True only when we can actually do something about a guest (on-platform,
  // state read, still a guest). Gates every prompt + the Crew "claim" card so
  // plain-browser dev never shows a prompt that can't work.
  canPrompt() {
    if (!this._known) this._retryRead();
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
        toast(this.copy().needPlatform, true);
      }
      return;
    }
    // canPrompt() only proves the SDK object exists — the login surface still
    // needs its own feature check (golden rule; a host build may not ship it).
    if (typeof JestSDK.login !== 'function') {
      if (opts.force) toast(this.copy().needPlatform, true);
      return;
    }
    if (!opts.force && !this._cooldownElapsed()) return;
    if (this._loginInFlight) return;

    this._loginInFlight = true;
    try {
      await JestSDK.login({ entryPayload: { source: reason || 'gameplay' } });
    } catch (e) {
      console.warn('Auth.promptRegister failed:', e);
      // An explicit tap must never fail silently; automatic nudges stay quiet.
      if (opts.force) toast(this.copy().loginFailed, true);
      return;
    } finally {
      this._loginInFlight = false;
    }
    // Popup shown and dismissed — start the cooldown, then see if they registered.
    this._markPrompted();
    await this.refresh();
  },

  // ── internals ────────────────────────────────

  // Fired once, the moment a guest becomes registered this session.
  _onRegistered() {
    const copy = this.copy();
    log(copy.welcome, 'gold');
    toast(copy.toastRegistered);
    // They can receive notifications now — (re)schedule everything we skipped
    // while they were a guest.
    if (typeof Notify !== 'undefined') Notify.scheduleAll();
    if (typeof updateHUD === 'function') updateHUD();
    // The Crew tab's guest card is stale the moment this fires.
    if (typeof renderCrew === 'function') renderCrew();
  },

  _cfg() {
    // PLATFORM is populated by loadGameData(); fall back to defaults.
    return (typeof PLATFORM !== 'undefined' && PLATFORM) ? PLATFORM : {};
  },
  // Public: platform.json copy merged over the defaults — the one place
  // guest-facing strings resolve (crew.js renders the guest card from it).
  copy() {
    return Object.assign({}, AUTH_DEFAULTS.copy, this._cfg().copy || {});
  },
  rankThreshold() {
    return this._cfg().rankThreshold ?? AUTH_DEFAULTS.rankThreshold;
  },

  // If the boot read failed, try again on the next status check so one
  // transient getPlayer() failure doesn't kill notifications and prompts for
  // the whole session. Never fires the registered transition — a successful
  // read here is the FIRST known state, not a guest→registered change.
  _retryRead() {
    if (typeof JestSDK === 'undefined') return;
    try {
      this._registered = !!JestSDK.getPlayer().registered;
      this._known = true;
    } catch (e) {
      // Still unknown — stay fail-closed (no schedules, no prompts) and let
      // the next check retry.
    }
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
