// ─────────────────────────────────────────────
//  MAKE MOVES (S6, DOM-115)
//
//  The PvE loop. Six sections per screens/02-moves.md: the featured main job,
//  side hustles, the daily, turf status, opp sightings, and a log preview.
//
//  SIDE HUSTLES ARE THE REAL JOBS. data/moves.json ships three placeholder
//  hustles from the prototype; data/jobs.json ships the 19 that actually pay.
//  Rendering the placeholders would have stranded doJob() — the only Moves
//  sink outside the Hood, the only caller of Quests.onJob(), one of two
//  rollDrop() sites, and the trigger for the Moves Boost offer. So the section
//  renders JOBS and the placeholder `side` array goes unused. See the PR.
// ─────────────────────────────────────────────

// Section header shared by every section (Anton 15 + rule).
function mvSection(title, extra) {
  return '<div class="mv-sec">' +
    '<h4 class="mv-sec-title">' + title + '</h4>' +
    '<div class="mv-sec-rule"></div>' +
    (extra ? '<span class="mv-sec-count">' + extra + '</span>' : '') +
  '</div>';
}

function mvMoney(n) { return '$' + Number(n || 0).toLocaleString(); }

// ---- 1. Featured main job ----------------------------------------------

function mvFeatured() {
  const f = MOVES && MOVES.featured;
  if (!f) return '';
  const objs = f.objectives || [];
  const at = Math.min(G.moveObjective || 0, objs.length);
  const done = at >= objs.length;
  const pct = objs.length ? Math.round(at / objs.length * 100) : 0;

  const list = objs.map(function (o, i) {
    const state = i < at ? 'done' : i === at ? 'now' : 'next';
    return '<div class="mv-obj ' + state + '">' +
      '<span class="mv-obj-dot"></span>' +
      '<span class="mv-obj-text">' + o.text + '</span>' +
    '</div>';
  }).join('');

  return '<div class="mv-feat">' +
    '<div class="mv-feat-band">' +
      '<span class="mv-feat-tag">' + (f.tag || 'MAIN JOB') + '</span>' +
      '<div class="mv-feat-titles">' +
        '<div class="mv-feat-title">' + f.title + '</div>' +
        '<div class="mv-feat-sub">' + f.sub + '</div>' +
      '</div>' +
    '</div>' +
    '<div class="mv-feat-body">' +
      '<div class="mv-prog-row">' +
        '<span class="mv-label">OBJECTIVES</span>' +
        '<span class="mv-bar"><span class="mv-bar-fill" style="width:' + pct + '%"></span></span>' +
        '<span class="mv-prog-count">' + at + '/' + objs.length + '</span>' +
      '</div>' +
      '<div class="mv-objs">' + list + '</div>' +
      '<div class="mv-feat-foot">' +
        '<div>' +
          '<div class="mv-label">REWARD</div>' +
          '<div class="mv-reward">' + (f.reward && f.reward.label || mvMoney(f.reward && f.reward.cash)) + '</div>' +
        '</div>' +
        (done
          ? '<button class="mv-cta is-done" disabled>COMPLETED</button>'
          : '<button class="mv-cta sheen" onclick="mvCompleteObjective()">COMPLETE OBJECTIVE</button>') +
      '</div>' +
    '</div>' +
  '</div>';
}

// The featured card's objectives are story beats, not a cash faucet: advancing
// one costs nothing and pays nothing until the last, which pays the card's
// reward once. Clearing it twice is not a way to farm.
function mvCompleteObjective() {
  const f = MOVES && MOVES.featured;
  if (!f) return;
  const objs = f.objectives || [];
  const at = G.moveObjective || 0;
  if (at >= objs.length) return;

  G.moveObjective = at + 1;
  const finished = G.moveObjective >= objs.length;

  if (finished && f.reward && f.reward.cash) {
    credit('cash', f.reward.cash, REASON.QUEST_REWARD, { ref: { moveId: f.id } });
    log(f.title + ' — ' + (f.reward.label || mvMoney(f.reward.cash)), 'gold');
    toast('+' + mvMoney(f.reward.cash));
  } else {
    log(f.title + ' — ' + objs[at].text, 'win');
    toast('OBJECTIVE CLEARED');
  }
  // Pays per objective, plus the card's completion bonus on the last one
  // (DOM-124, ruling: "pay per objective and completion bonus at the end").
  // Bounded by the objective count, and G.moveObjective ratchets, so the
  // card cannot be cleared twice. The Clout log attributes each one by
  // moveId. jobs.json rows — the "side hustles" — are paid by doJob()
  // instead of from the spec; see XP_UNPAID in js/xp.js for why.
  addXP(f.kind, { completed: finished, id: f.id, title: f.title });

  updateHUD();
  renderJobs();
  GameState.save();
}

// ---- 2. Side hustles = the real jobs ------------------------------------

// Status chip derived from live job state rather than authored: a job you have
// never run is NEW, one part-way through its mastery meter is ACTIVE, a
// mastered one is DONE. TIMED is supported for a job carrying `expiresAt`;
// no v1 job sets one.
function mvJobStatus(job) {
  if (job.expiresAt) return 'TIMED';
  const prog = G.jobProgress[job.id] || 0;
  if (prog >= job.times) return 'DONE';
  return prog > 0 ? 'ACTIVE' : 'NEW';
}

function mvCountdown(msLeft) {
  const s = Math.max(0, Math.floor(msLeft / 1000));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

function mvHustles() {
  const rows = JOBS.map(function (job) {
    const locked = !isUnlocked(job);
    const prog = G.jobProgress[job.id] || 0;
    const maxed = prog >= job.times;
    const status = locked ? 'LOCKED' : mvJobStatus(job);

    const progRow = (!locked && !maxed && prog > 0)
      ? '<div class="mv-hus-prog">' +
          '<span class="mv-bar sm"><span class="mv-bar-fill" style="width:' + Math.floor(prog / job.times * 100) + '%"></span></span>' +
          '<span class="mv-hus-count">' + prog + '/' + job.times + '</span>' +
        '</div>'
      : '';

    const timed = (!locked && job.expiresAt)
      ? '<div class="mv-hus-timer"><span class="mv-blink"></span>' +
          '<span class="mv-timer-label">TIME LEFT</span>' +
          '<span class="mv-timer-val" data-expires="' + job.expiresAt + '">' + mvCountdown(job.expiresAt - Date.now()) + '</span>' +
        '</div>'
      : '';

    const action = locked
      ? '<span class="mv-locked-note">' + lockLabel(job) + '</span>'
      : maxed
        ? '<span class="mv-done-chip">&#10003; MASTERED</span>'
        : '<button class="mv-go sheen" onclick="doJob(\'' + job.id + '\')">DO IT</button>';

    return '<div class="mv-hus' + (locked ? ' locked' : '') + '">' +
      '<div class="mv-hus-head">' +
        '<div>' +
          '<div class="mv-hus-title">' + job.name + '</div>' +
          '<div class="mv-hus-sub">MOVES ' + job.moves + ' &middot; ' + job.clout + ' CLOUT</div>' +
        '</div>' +
        '<span class="mv-chip ' + status.toLowerCase() + '">' + status + '</span>' +
      '</div>' +
      progRow + timed +
      '<div class="mv-hus-foot">' +
        '<div>' +
          '<div class="mv-label">REWARD</div>' +
          '<div class="mv-hus-reward">' + mvMoney(job.cash[0]) + '&ndash;' + mvMoney(job.cash[1]) + '</div>' +
        '</div>' +
        action +
      '</div>' +
    '</div>';
  }).join('');

  return mvSection('SIDE HUSTLES') + '<div class="mv-hustles">' + rows + '</div>';
}

// ---- 3. Daily -----------------------------------------------------------

function mvTodayKey() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// Cash banked today, reset at the player's local midnight rather than UTC's.
function mvDailyCash() {
  if (G.dailyCashDate !== mvTodayKey()) return 0;
  return G.dailyCash || 0;
}

function mvNoteDailyCash(amount) {
  const key = mvTodayKey();
  if (G.dailyCashDate !== key) { G.dailyCashDate = key; G.dailyCash = 0; }
  G.dailyCash = (G.dailyCash || 0) + Math.max(0, amount);
}

function mvDaily() {
  const d = MOVES && MOVES.daily;
  if (!d) return '';
  const goal = (d.goal && d.goal.amount) || 1000;
  const got = Math.min(mvDailyCash(), goal);
  const pct = Math.round(got / goal * 100);
  return mvSection('DAILY') +
    '<div class="mv-daily">' +
      '<div class="mv-daily-head">' +
        '<div>' +
          '<div class="mv-daily-title">' + d.title + '</div>' +
          '<div class="mv-hus-sub">' + d.sub + '</div>' +
        '</div>' +
        '<div class="mv-daily-amt">' + mvMoney(got) + '<span class="mv-cap"> / ' + mvMoney(goal) + '</span></div>' +
      '</div>' +
      '<span class="mv-bar lg"><span class="mv-bar-fill" style="width:' + pct + '%"></span></span>' +
      '<div class="mv-daily-foot">' +
        '<span class="mv-label">REWARD</span>' +
        '<span class="mv-xp-reward">' + mvDailyRewardLabel() + '</span>' +
      '</div>' +
    '</div>';
}

// DOM-124 settled the two numbers this was caught between: 02-moves.md printed
// XP +20, xp-system.json says dailyGrind 30, and Jake ruled for 30. It also
// settled the unit — there is no XP, so the card advertises the Clout it
// actually pays, scaled to the player's level like every other award.
function mvDailyRewardLabel() {
  const weight = XpAwards.daily();
  if (weight === null) return '';
  return '+' + xpToClout(weight, G.level).toLocaleString() + ' CLOUT';
}

// ---- 4. The Hood --------------------------------------------------------

function mvHood() {
  const t = (MOVES && MOVES.turf) || null;
  const ops = (MOVES && MOVES.hoodOps) || [];
  if (!t) return '';
  const tiles = ops.map(function (o) {
    return '<div class="mv-tile">' +
      '<div class="mv-label">' + o.label + '</div>' +
      '<div class="mv-tile-val' + (o.accent === 'gold' ? ' gold' : '') + '">' + o.value + '</div>' +
      '<div class="mv-tile-sub">' + o.sub + '</div>' +
    '</div>';
  }).join('');

  return mvSection('THE HOOD') +
    '<div class="mv-turf">' +
      '<div>' +
        '<div class="mv-label gold">' + t.label + '</div>' +
        '<div class="mv-turf-name">' + t.name + '</div>' +
        '<div class="mv-hus-sub">' + t.sub + '</div>' +
      '</div>' +
      '<div class="mv-turf-right">' +
        '<div class="mv-label">TERRITORY</div>' +
        '<div class="mv-turf-val">' + t.territory.value + '<span class="mv-turf-unit">' + t.territory.unit + '</span></div>' +
      '</div>' +
    '</div>' +
    '<div class="mv-ops">' + tiles + '</div>';
}

// ---- 5. Opps spotted ----------------------------------------------------

function mvAgo(seconds) {
  if (seconds < 3600) return Math.max(1, Math.round(seconds / 60)) + 'M AGO';
  return Math.round(seconds / 3600) + 'H AGO';
}

function mvSightings() {
  const list = (MOVES && MOVES.sightings) || [];
  if (!list.length) return '';
  const rows = list.map(function (s) {
    return '<div class="mv-spot-row">' +
      '<div>' +
        '<div class="mv-spot-name">' + s.name + '</div>' +
        '<div class="mv-spot-corner">' + s.corner + '</div>' +
      '</div>' +
      '<span class="mv-spot-ago">' + mvAgo(s.agoSeconds) + '</span>' +
    '</div>';
  }).join('');
  return '<div class="mv-spotted">' +
    '<div class="mv-spot-head">' +
      '<span class="mv-blink"></span>' +
      '<span class="mv-spot-title">OPPS SPOTTED</span>' +
      '<span class="mv-spot-chip">' + list.length + ' IN AREA</span>' +
    '</div>' + rows +
  '</div>';
}

// ---- 6. Log -------------------------------------------------------------

// The Clout log reads the transaction ledger rather than a second store: rows
// already carry a timestamp, a signed delta and a REASON code, so there is
// nothing to keep in sync. Session-only, like the ledger itself.
const MV_REASON_LABEL = {
  move_payout: 'Ran a move', fight_reward: 'Won a fight', quest_reward: 'Finished a job',
  recruit_bonus: 'Crew recruited', level_up_grant: 'Levelled up', starting_grant: 'Started out',
  iap_grant: 'Bought a pack', admin_adjust: 'Adjusted',
  objective_cleared: 'Cleared an objective', daily_goal: 'Hit the daily',
  plug_recruit: 'Recruited a plug',
};

function mvCloutRows() {
  if (typeof ledgerRows !== 'function') return [];
  return ledgerRows()
    .filter(function (r) { return r.resource === 'clout' && r.delta > 0; })
    .sort(function (a, b) { return b.id - a.id; });
}

function mvTime(ts) {
  const d = new Date(ts);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

// Ledger rows carry a `ref` naming what moved — the job run, the opp beaten.
// Using it turns five identical "Ran a move" lines into a readable history.
function mvLogLabel(r) {
  const ref = r.ref || {};
  if (ref.jobId && typeof JOBS !== 'undefined') {
    const job = JOBS.find(function (j) { return j.id === ref.jobId; });
    if (job) return job.name;
  }
  if (ref.enemyId && typeof ENEMIES !== 'undefined') {
    const e = ENEMIES.find(function (x) { return x.id === ref.enemyId; });
    if (e) return 'Beat ' + e.name;
  }
  if (ref.questId && typeof QUESTS !== 'undefined') {
    const q = QUESTS.find(function (x) { return x.id === ref.questId; });
    if (q) return q.name;
  }
  if (ref.moveId && typeof MOVES !== 'undefined' && MOVES && MOVES.featured
      && MOVES.featured.id === ref.moveId) {
    return MOVES.featured.title;
  }
  return MV_REASON_LABEL[r.reason] || r.reason;
}

function mvLogRow(r) {
  return '<div class="mv-log-row">' +
    '<span class="mv-log-time">' + mvTime(r.ts) + '</span>' +
    '<span class="mv-log-text">' + mvLogLabel(r) + '</span>' +
    '<span class="mv-log-delta">+' + r.delta.toLocaleString() + '</span>' +
  '</div>';
}

function mvLogPreview() {
  const rows = mvCloutRows().slice(0, 3);
  const body = rows.length
    ? rows.map(mvLogRow).join('')
    : '<div class="mv-log-empty">Nothing banked yet. Make a move.</div>';
  return mvSection('LOG') +
    '<div class="mv-log" onclick="openCloutLog()">' + body +
      '<div class="mv-log-more">VIEW FULL LOG &rsaquo;</div>' +
    '</div>';
}

function openCloutLog() {
  const rows = mvCloutRows();
  $('clout-log-count').textContent = rows.length + (rows.length === 1 ? ' EVENT' : ' EVENTS');
  $('clout-log-body').innerHTML = rows.length
    ? rows.map(mvLogRow).join('')
    : '<div class="mv-log-empty">Nothing banked yet. Make a move.</div>';
  $('clout-log-overlay').classList.add('open');
}

function closeCloutLog() { $('clout-log-overlay').classList.remove('open'); }
function cloutLogScrim(ev) {
  if (ev && ev.target && ev.target.id === 'clout-log-overlay') closeCloutLog();
}

// ---- screen -------------------------------------------------------------

function renderJobs() {
  const root = $('tab-jobs');
  if (!root) return;
  root.innerHTML =
    mvFeatured() +
    mvHustles() +
    mvDaily() +
    mvHood() +
    mvSightings() +
    mvLogPreview();
  mvStartTimers();
}

// One interval for every countdown on screen, started only when there is
// something to count down and cleared the moment there is not.
let _mvTimer = null;
function mvStartTimers() {
  if (_mvTimer) { clearInterval(_mvTimer); _mvTimer = null; }
  if (!document.querySelector('[data-expires]')) return;
  _mvTimer = setInterval(function () {
    const els = document.querySelectorAll('[data-expires]');
    if (!els.length) { clearInterval(_mvTimer); _mvTimer = null; return; }
    els.forEach(function (el) {
      el.textContent = mvCountdown(Number(el.dataset.expires) - Date.now());
    });
  }, 1000);
}

// ---- the job loop itself is untouched (DOM-115 re-skins, it does not
// ---- re-tune): Moves cost, payout, mastery, quests and drops all as before.
function doJob(jobId) {
  const job = JOBS.find(j => j.id === jobId);
  if (!job) return;
  // Pain moment #2 (DOM-76): the refusal is also the Moves Boost offer.
  if (G.moves.current < job.moves) { surfaceOffer('moves', 'Not enough Moves!'); return; }
  if (!isUnlocked(job)) { toast(lockLabel(job), true); return; }
  // Mastery is cosmetic (DOM-71): the meter fills once, the job stays runnable.
  const prog = G.jobProgress[job.id] || 0;

  debit('moves', job.moves, REASON.MOVE_COST, { ref: { jobId: job.id } });
  const earned = rand(job.cash[0], job.cash[1]);
  credit('cash', earned, REASON.MOVE_PAYOUT, { ref: { jobId: job.id } });
  G.jobProgress[job.id] = Math.min(prog + 1, job.times);
  addClout(job.clout, REASON.MOVE_PAYOUT, { jobId: job.id });
  Quests.onJob(job.id);

  log(`${job.name} — earned $${earned} + ${job.clout} Clout`, 'win');
  toast(`+$${earned} | +${job.clout} CLOUT`);

  // Per-job drop tables retired (DOM-18): every completion makes one global
  // rarity roll instead — js/drops.js owns the proc gate and the ladder.
  rollDrop(job.name);
  updateHUD();
  renderJobs();
  GameState.save();
  Notify.movesFull();
}

// This screen claims its tab (DOM-127). Daily tally, mastery and the Clout log are all live on entry.
registerScreen('jobs', renderJobs);
