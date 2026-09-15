// ─────────────────────────────────────────────
//  CREW
// ─────────────────────────────────────────────

const Crew = {
  _memberCount: 0,

  async init() {
    if (typeof JestSDK !== 'undefined') {
      // If opened via a crew invite link, record the recruiter
      const payload = JestSDK.getEntryPayload();
      if (payload.invitedBy && !G.recruitedBy) {
        G.recruitedBy = payload.invitedBy;
        GameState.save();
      }
      await this.refresh();
    } else {
      // Local dev: restore cached count from saved state
      this._memberCount = G.crewMemberCount || 0;
    }
  },

  async refresh() {
    if (typeof JestSDK === 'undefined') return;
    try {
      const result = await JestSDK.referrals.listReferrals({ reference: 'crew_invite_v1' });
      this._memberCount = result.referrals?.length ?? 0;
      G.crewMemberCount = this._memberCount;
      this._awardNewLieutenants();
      GameState.save();
    } catch (e) {
      console.warn('Crew.refresh failed:', e);
      this._memberCount = G.crewMemberCount || 0;
    }
  },

  // Clout for Lieutenants recruited since the last award. `lieutenantsRewarded`
  // is a high-water mark, not a count: the referral list is re-read on every boot,
  // so without it a player would be paid again for the same crew every session.
  // It never decreases, so a Lieutenant who leaves does not claw back their Clout.
  _awardNewLieutenants() {
    const rewarded = G.lieutenantsRewarded || 0;
    const fresh = this._memberCount - rewarded;
    if (fresh <= 0) return;
    G.lieutenantsRewarded = this._memberCount;
    const clout = fresh * tune('crew.cloutPerRecruit');
    addClout(clout, REASON.RECRUIT_BONUS, { lieutenants: fresh });
    log('+' + clout + ' Clout - ' + fresh + ' new Lieutenant' + (fresh > 1 ? 's' : ''), 'gold');
  },

  async invite() {
    if (typeof JestSDK === 'undefined') {
      toast('Crew invites require the Jest platform.', true);
      return;
    }
    await JestSDK.referrals.shareReferralLink({
      reference: 'crew_invite_v1',
      entryPayload: { invitedBy: G.playerId },
      shareTitle: 'Join my crew in OPPS',
      shareText: 'My crew needs soldiers. Stack bread, slide on opps. You in?',
    });
  },

  // Crew's power is gear slots (DOM-75): the flat per-Lieutenant ATK/DEF bonus
  // is retired (ratified 2026-09-13) — an unbounded stat faucet double-dipped
  // on the capacity reward and broke the power ceiling.
  //
  // Progress toward the next slot grant. Returns null once every rotation type
  // sits at the bonus cap — recruiting past the ceiling still pays Clout.
  nextSlot() {
    const per = tune('crew.lieutenantsPerSlot');
    const rot = tune('crew.slotRotation');
    const grants = Math.floor(this._memberCount / per);
    if (grants >= rot.length * tune('crew.maxBonusSlotsPerType')) return null;
    return { type: rot[grants % rot.length], need: (grants + 1) * per - this._memberCount };
  },

  getCount() {
    return this._memberCount;
  },
};


// ─────────────────────────────────────────────
//  S5 CREW SCREEN (DOM-114)
//
//  Three sections, per screens/05-crew.md: HITTERS · DEALERS · MY ROSTER.
//
//  The first two are NPC placeholders and live in data/crew.json. The third is
//  NOT — Jake ruled on 2026-09-15 that MY ROSTER is the player's real
//  Lieutenants from the referral feed, with the invite CTA as its empty state.
//  That ruling exists because this screen is the ONLY entry point to
//  Crew.invite() in the app: rendering the prototype's three NPC "roster"
//  characters over it would have made a 250-Clout faucet and the whole
//  bonus-gear-slot ladder unreachable.
//
//  What the referral feed actually gives us is a count — no names, no
//  locations, no dialogue. So a Lieutenant card keeps the card geometry and
//  drops every affordance that would be fiction: no portrait, no map pin, no
//  dialogue popup, no "working" dot. Inventing `Servin' · 5th & Lenox` for a
//  real person is the one thing this screen must not do.
// ─────────────────────────────────────────────

// Other screens interpolate their JSON raw, because it is repo-authored. This
// one is different on purpose: MY ROSTER already renders live referral data,
// and the NPC sections are specified to become an SDK feed too ("live
// status/portraits arrive with the Jest SDK"). A screen pointed at a remote
// feed should not be the one that learns escaping later.
const crewEsc = v => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function _crewSections() {
  return (CREW_DATA && CREW_DATA.sections) || [];
}

const CREW_PIN_PATH = 'M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z';
const crewPin = px =>
  '<svg width="' + px + '" height="' + px + '" viewBox="0 0 24 24" aria-hidden="true"><path d="' + CREW_PIN_PATH + '"></path></svg>';

// Two digits, as the prototype prints them: 01, 02 … and only widening past 99.
const crewCount = n => (n < 10 ? '0' : '') + n;

function _crewSectionHead(title, count) {
  return '<div class="crew-sec-head">' +
      '<h4 class="crew-sec-title">' + crewEsc(title) + '</h4>' +
      '<div class="crew-sec-rule"></div>' +
      '<span class="crew-sec-count">' + crewCount(count) + '</span>' +
    '</div>';
}

function _crewNpcCard(m) {
  const art = (typeof PORTRAITS !== 'undefined' && PORTRAITS.plugs && PORTRAITS.plugs[m.slot]) || null;
  return '<button type="button" class="crew-card is-npc" onclick="openCrewMember(\'' + crewEsc(m.id) + '\')">' +
      '<span class="crew-card-main">' +
        '<span class="crew-name">' + crewEsc(m.name) + '</span>' +
        '<span class="crew-status">' +
          '<span class="crew-dot' + (m.working ? ' is-working' : '') + '"></span>' +
          '<span class="crew-doing">' + crewEsc(m.doing) + '</span>' +
        '</span>' +
      '</span>' +
      '<span class="crew-portrait">' +
        (art ? '<img src="' + crewEsc(art) + '" alt="">' : '') +
        // stopPropagation, or the pin opens the dialogue it sits on top of
        '<span class="crew-pin" role="button" tabindex="0" title="Show on map" aria-label="Show ' + crewEsc(m.name) + ' on the map"' +
          ' onclick="event.stopPropagation(); crewGoToMap(\'' + crewEsc(m.id) + '\')">' + crewPin(15) + '</span>' +
      '</span>' +
    '</button>';
}

// A Lieutenant is a real player. Everything on this card is either true or absent.
function _crewLieutenantCard(n) {
  return '<div class="crew-card is-lieutenant">' +
      '<div class="crew-card-main">' +
        '<div class="crew-name">LIEUTENANT ' + crewCount(n) + '</div>' +
        '<div class="crew-status">' +
          '<span class="crew-dot"></span>' +
          '<span class="crew-doing">Rode in on your link</span>' +
        '</div>' +
      '</div>' +
      '<div class="crew-lt-badge">' + crewCount(n) + '</div>' +
    '</div>';
}

// The invite row. Present whether or not the roster has members — as the empty
// state when it is empty, as the trailing row when it is not — because it is
// the only way to reach Crew.invite(). It also carries the gear-slot progress
// and, for a guest, the register prompt: all three belong to the roster, and a
// separate card for each is exactly what the prototype does not have.
//
// The guest case is not decoration. 07-external-systems.md lists crew.js as a
// registration-prompt surface, and the v0.1 screen's CLAIM YOUR ACCOUNT card
// was the whole of it — a guest's referrals have no account to hang off, so
// claiming comes before inviting.
function _crewInviteRow(count) {
  if (typeof Auth !== 'undefined' && Auth.canPrompt()) {
    const pc = Auth.copy();
    return '<div class="crew-invite">' +
        '<div class="crew-invite-copy">' +
          '<div class="crew-invite-title">' + crewEsc(pc.crewTitle) + '</div>' +
          '<div class="crew-invite-note">' + crewEsc(pc.crewBody) + '</div>' +
        '</div>' +
        '<button class="crew-invite-btn" onclick="Auth.promptRegister(\'crew\', { force: true })">' +
          crewEsc(pc.crewCta) + '</button>' +
      '</div>';
  }
  const next = Crew.nextSlot();
  const per = tune('crew.lieutenantsPerSlot');
  const note = count === 0
    ? 'Every ' + per + ' soldiers is +1 gear slot — ' + tune('crew.slotRotation').join(', then ') +
      '. Plus ' + tune('crew.cloutPerRecruit') + ' Clout each, no cap.'
    : next
      ? next.need + ' more for a +1 ' + next.type + ' slot.'
      : 'Every bonus slot earned. Recruits still pay ' + tune('crew.cloutPerRecruit') + ' Clout.';
  return '<div class="crew-invite">' +
      '<div class="crew-invite-copy">' +
        '<div class="crew-invite-title">' + (count === 0 ? 'NO ROSTER YET' : 'GROW THE ROSTER') + '</div>' +
        '<div class="crew-invite-note">' + crewEsc(note) + '</div>' +
      '</div>' +
      '<button class="crew-invite-btn" onclick="Crew.invite()">SEND THE LINK</button>' +
    '</div>';
}

function renderCrew() {
  const count = Crew.getCount();
  const npc = _crewSections().map(sec =>
    '<div>' + _crewSectionHead(sec.title, (sec.members || []).length) +
      '<div class="crew-list">' + (sec.members || []).map(_crewNpcCard).join('') + '</div>' +
    '</div>').join('');

  const lieutenants = [];
  for (let i = 1; i <= count; i++) lieutenants.push(_crewLieutenantCard(i));

  $('tab-crew').innerHTML =
    '<div class="crew-sections">' + npc +
      '<div>' + _crewSectionHead('MY ROSTER', count) +
        '<div class="crew-list">' + lieutenants.join('') + _crewInviteRow(count) + '</div>' +
      '</div>' +
    '</div>';
}

// ── crew dialogue popup ──────────────────────

function crewMember(id) {
  for (const sec of _crewSections()) {
    for (const m of sec.members || []) if (m.id === id) return m;
  }
  return null;
}

function openCrewMember(id) {
  const m = crewMember(id);
  if (!m) return;
  const overlay = $('crew-overlay');
  overlay.dataset.id = id;

  const art = (typeof PORTRAITS !== 'undefined' && PORTRAITS.plugs && PORTRAITS.plugs[m.slot]) || null;
  const img = $('crew-modal-portrait');
  img.hidden = !art;
  if (art) { img.src = art; img.alt = m.name; }
  else { img.removeAttribute('src'); img.alt = ''; }

  const nameEl = $('crew-modal-name');
  nameEl.textContent = m.name;
  // Same pill, same font, same available width as the plug popup — so the same
  // measurement. MALIK 'TRIGGA' is the name that needs it.
  nameEl.style.fontSize = plugNameSize(m.name) + 'px';

  $('crew-modal-dot').classList.toggle('is-working', !!m.working);
  $('crew-modal-doing').textContent = m.doing;
  $('crew-modal-line').textContent = m.line;
  overlay.classList.add('open');
}

function closeCrewMember() { $('crew-overlay').classList.remove('open'); }

function crewScrim(ev) {
  if (ev && ev.target && ev.target.id === 'crew-overlay') closeCrewMember();
}

// Jump to the map and centre on the member. The pin and SEE ON MAP share this.
// 05-crew.md says "The Hood" — that screen is DOM-118; until it lands, the map
// tab IS the hood view, so this points there and DOM-118 re-points it if the
// tab name changes.
function crewGoToMap(id) {
  const m = crewMember(id);
  if (!m || !m.loc) return;
  closeCrewMember();
  showTab('map');
  // Synchronous, deliberately. showTab() has already run GameMap.init(), which
  // captures the container and queues its default fit on the next frame — but
  // that fit only recomputes the view when none is set, so setting ours now
  // wins and its frame re-applies the same numbers. Doing this in a
  // requestAnimationFrame instead would race that queued fit, and would not run
  // at all while the page is hidden.
  GameMap.centerOn(m.loc.x, m.loc.y);
}

function crewSeeOnMap() {
  const overlay = $('crew-overlay');
  if (overlay && overlay.dataset.id) crewGoToMap(overlay.dataset.id);
}

async function crewRefresh() {
  await Crew.refresh();
  renderCrew();
}

// This screen claims its tab (DOM-127). The roster is live data, so entering
// re-reads it: that is what retired the old manual REFRESH CREW button.
registerScreen('crew', () => {
  renderCrew();
  if (typeof JestSDK !== 'undefined') crewRefresh();
});
