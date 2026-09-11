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
      GameState.save();
    } catch (e) {
      console.warn('Crew.refresh failed:', e);
      this._memberCount = G.crewMemberCount || 0;
    }
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

  getBonus() {
    return {
      attack: this._memberCount * 2,
      defense: this._memberCount * 1,
    };
  },

  getCount() {
    return this._memberCount;
  },
};

function renderCrew() {
  const count = Crew.getCount();
  const bonus = Crew.getBonus();
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
          <div class="crew-stat-val">+${bonus.attack}</div>
          <div class="crew-stat-label">CREW ATK</div>
        </div>
        <div class="crew-stat">
          <div class="crew-stat-val">+${bonus.defense}</div>
          <div class="crew-stat-label">CREW DEF</div>
        </div>
      </div>
      ${count === 0
        ? `<p class="crew-empty">No soldiers yet. Send the link, build the team.</p>`
        : `<p class="crew-active">Your ${count} soldier${count > 1 ? 's' : ''} boost your stats in every fight.</p>`
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
        <div>+2 ATK per crew member</div>
        <div>+1 DEF per crew member</div>
        <div>Bonuses apply to every fight</div>
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
