// ─────────────────────────────────────────────
//  SOUND — Web Audio click / feedback tones
//  No library deps; degrades silently if API unavailable
// ─────────────────────────────────────────────

const Sound = (() => {
  let _ctx = null;
  let _on = true;

  function _getCtx() {
    if (_ctx) return _ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    _ctx = new AC();
    return _ctx;
  }

  function _resume() {
    if (_ctx && _ctx.state === 'suspended') _ctx.resume();
  }

  function click() {
    if (!_on) return;
    try {
      const ctx = _getCtx();
      if (!ctx) return;
      _resume();
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(2000, t);
      osc.frequency.exponentialRampToValueAtTime(900, t + 0.025);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.05, t + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.05);
    } catch (_) {}
  }

  function win() {
    if (!_on) return;
    try {
      const ctx = _getCtx();
      if (!ctx) return;
      _resume();
      const t = ctx.currentTime;
      [0, 0.1, 0.2].forEach((delay, i) => {
        const freq = [440, 550, 660][i];
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t + delay);
        gain.gain.setValueAtTime(0.0001, t + delay);
        gain.gain.exponentialRampToValueAtTime(0.07, t + delay + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.12);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t + delay);
        osc.stop(t + delay + 0.15);
      });
    } catch (_) {}
  }

  function loss() {
    if (!_on) return;
    try {
      const ctx = _getCtx();
      if (!ctx) return;
      _resume();
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(300, t);
      osc.frequency.exponentialRampToValueAtTime(80, t + 0.3);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.06, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.4);
    } catch (_) {}
  }

  function setEnabled(v) { _on = !!v; }
  function isEnabled() { return _on; }

  // Wire click sound to all buttons globally
  document.addEventListener('pointerdown', (e) => {
    if (e.target && e.target.closest && e.target.closest('button, .attack-btn, .do-job-btn')) {
      click();
    }
  });

  return { click, win, loss, setEnabled, isEnabled };
})();
