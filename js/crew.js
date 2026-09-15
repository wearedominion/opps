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

function renderCrew() {
  const count = Crew.getCount();
  const rot = tune('crew.slotRotation');
  const slots = rot.reduce((s, t) => s + slotCapacity(t) - 1, 0); // Crew-earned only
  const next = Crew.nextSlot();
  const pc = (typeof Auth !== 'undefined') ? Auth.copy() : {};
  const isGuest = typeof Auth !== 'undefined' && Auth.canPrompt();

  $('tab-crew').innerHTML = `
    ${isGuest ? `
    <div class="card">
      <div class="card-title">${pc.crewTitle}</div>
      <p class="card-note">${pc.crewBody}</p>
      <button class="crew-claim-btn" onclick="Auth.promptRegister('crew', { force: true })">${pc.crewCta}</button>
    </div>
    ` : ''}

    <div class="card">
      <div class="card-title">YOUR CREW</div>
      <div class="crew-stats">
        <div class="crew-stat">
          <div class="crew-stat-val">${count}</div>
          <div class="crew-stat-label">SOLDIERS</div>
        </div>
        <div class="crew-stat">
          <div class="crew-stat-val">+${slots}</div>
          <div class="crew-stat-label">GEAR SLOTS</div>
        </div>
        <div class="crew-stat">
          <div class="crew-stat-val">${next ? next.need : 'MAX'}</div>
          <div class="crew-stat-label">${next ? 'TO NEXT ' + next.type.toUpperCase() + ' SLOT' : 'SLOTS EARNED'}</div>
        </div>
      </div>
      ${count === 0
        ? `<p class="crew-empty">No soldiers yet. Send the link, build the team.</p>`
        : `<p class="crew-active">Your ${count} soldier${count > 1 ? 's' : ''} let you field more gear in every fight.</p>`
      }
      <button class="crew-invite-btn" onclick="Crew.invite()">SEND THE LINK</button>
      <button class="crew-refresh-btn" onclick="crewRefresh()">REFRESH CREW</button>
    </div>

    ${G.recruitedBy ? `
    <div class="card">
      <div class="card-title">RECRUITED</div>
      <p class="card-note">A soldier put you on. Ride for the crew.</p>
    </div>
    ` : ''}

    <div class="card">
      <div class="card-title">HOW IT WORKS</div>
      <div class="crew-rules">
        <div>Cash buys gear. Crew earns the right to carry it.</div>
        <div>Every ${tune('crew.lieutenantsPerSlot')} soldiers: +1 gear slot — ${rot.join(', then ')}</div>
        <div>Up to +${tune('crew.maxBonusSlotsPerType')} extra slots per type</div>
        <div>+${tune('crew.cloutPerRecruit')} Clout per recruit, no limit</div>
      </div>
    </div>
  `;
}

async function crewRefresh() {
  toast('Checking crew...');
  await Crew.refresh();
  renderCrew();
  const count = Crew.getCount();
  toast(count > 0 ? `Crew: ${count} soldier${count > 1 ? 's' : ''}` : 'No crew members yet.');
}

// This screen claims its tab (DOM-127). Crew size changes from recruiting, so the roster is rebuilt on entry.
registerScreen('crew', renderCrew);
