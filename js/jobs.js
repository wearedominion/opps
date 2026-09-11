// ─────────────────────────────────────────────
//  JOBS
// ─────────────────────────────────────────────

function renderJobs() {
  const container = $('job-list');
  container.innerHTML = '';
  JOBS.forEach(job => {
    const prog = G.jobProgress[job.id] || 0;
    const locked = !isUnlocked(job);
    const maxed = prog >= job.times;
    const div = document.createElement('div');
    div.className = 'job-card' + (locked ? ' locked' : '');
    div.innerHTML = `
      <div class="job-name">${job.name}</div>
      <div class="job-meta">
        <span>TAKE <span class="val">$${job.cash[0]}-$${job.cash[1]}</span></span>
        <span>MOVES <span class="val">${job.moves}</span></span>
        <span>CLOUT <span class="val">${job.clout}</span></span>
      </div>
      ${locked ? `<div class="job-locked-note">${lockLabel(job)}</div>` : `
      <div class="job-progress-wrap">
        <div class="job-progress-label"><span>Progress</span><span>${prog}/${job.times}</span></div>
        <div class="job-bar"><div class="job-bar-fill" style="width:${maxed ? 100 : Math.floor(prog / job.times * 100)}%"></div></div>
      </div>
      <button class="do-job-btn secondary" onclick="doJob('${job.id}')" ${maxed ? 'disabled' : ''}>
        ${maxed ? 'MASTERED ✓' : 'DO IT'}
      </button>`}
    `;
    container.appendChild(div);
  });
}

function doJob(jobId) {
  const job = JOBS.find(j => j.id === jobId);
  if (!job) return;
  if (G.moves.current < job.moves) { toast('Not enough Moves!', true); return; }
  if (!isUnlocked(job)) { toast(lockLabel(job), true); return; }
  const prog = G.jobProgress[job.id] || 0;
  if (prog >= job.times) { toast('Job mastered already!', true); return; }

  debit('moves', job.moves, REASON.MOVE_COST, { ref: { jobId: job.id } });
  const earned = rand(job.cash[0], job.cash[1]);
  credit('cash', earned, REASON.MOVE_PAYOUT, { ref: { jobId: job.id } });
  G.jobProgress[job.id] = prog + 1;
  addClout(job.clout, REASON.MOVE_PAYOUT, { jobId: job.id });

  log(`${job.name} — earned $${earned} + ${job.clout} Clout`, 'win');
  toast(`+$${earned} | +${job.clout} CLOUT`);
  updateHUD();
  renderJobs();
  GameState.save();
  Notify.movesFull();
}
