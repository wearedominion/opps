// ─────────────────────────────────────────────
//  JOBS
// ─────────────────────────────────────────────

function renderJobs() {
  const container = $('job-list');
  container.innerHTML = '';
  JOBS.forEach(job => {
    const prog = G.jobProgress[job.id] || 0;
    const locked = G.level < job.levelReq;
    const maxed = prog >= job.times;
    const div = document.createElement('div');
    div.className = 'job-card' + (locked ? ' locked' : '');
    div.innerHTML = `
      <div class="job-name">${job.name}</div>
      <div class="job-meta">
        <span>TAKE <span class="val">$${job.money[0]}-$${job.money[1]}</span></span>
        <span>MOVES <span class="val">${job.energy}</span></span>
        <span>XP <span class="val">${job.xp}</span></span>
      </div>
      ${locked ? `<div class="job-locked-note">REQUIRES RANK ${job.levelReq}</div>` : `
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
  if (G.energy < job.energy) { toast('Not enough energy!', true); return; }
  if (G.level < job.levelReq) { toast('You need a higher rank!', true); return; }
  const prog = G.jobProgress[job.id] || 0;
  if (prog >= job.times) { toast('Job mastered already!', true); return; }

  G.energy -= job.energy;
  const earned = rand(job.money[0], job.money[1]);
  G.money += earned;
  G.rep += job.rep;
  G.jobProgress[job.id] = prog + 1;
  addXP(job.xp);

  log(`${job.name} — earned $${earned} + ${job.xp} XP`, 'win');
  toast(`+$${earned} | +${job.xp} XP`);
  updateHUD();
  renderJobs();
  GameState.save();
  Notify.energyFull();
}
