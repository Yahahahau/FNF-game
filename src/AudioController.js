// Arrow press SFX, fully synthesised with the Web Audio API (original sound, no samples,
// nothing to license). A short mechanical "tick + thock": a bright filtered noise transient
// on top of a quick pitch-dropping body, ~70 ms long. Each lane has its own pitch.
const LS_ENABLED = 'fnf-arrow-playground:sfx';
const LS_VOLUME = 'fnf-arrow-playground:sfx-volume';

const LANE_PITCH = { left: 190, down: 160, up: 230, right: 205 };

function readStore(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch {
    return fallback;
  }
}
function writeStore(key, value) {
  try { localStorage.setItem(key, String(value)); } catch { /* private mode etc. */ }
}

export class AudioController {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noise = null;
    this.enabled = readStore(LS_ENABLED, '1') !== '0'; // ON by default
    const v = parseFloat(readStore(LS_VOLUME, '0.8'));
    this.volume = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.8;
  }

  /** Must be called from a user gesture (pointerdown / keydown) to satisfy autoplay policies. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC({ latencyHint: 'interactive' });

      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -10;
      comp.ratio.value = 6;
      comp.attack.value = 0.001;
      comp.release.value = 0.08;
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(comp).connect(this.ctx.destination);

      // 50 ms of white noise, reused for every click.
      const len = Math.floor(this.ctx.sampleRate * 0.05);
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
  }

  setEnabled(on) {
    this.enabled = !!on;
    writeStore(LS_ENABLED, this.enabled ? '1' : '0');
  }

  setVolume(v) {
    this.volume = Math.min(1, Math.max(0, v));
    writeStore(LS_VOLUME, this.volume);
    if (this.master) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.01);
  }

  /** One short click for a lane. Called once per press (never on key repeat). */
  play(dir) {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running' || this.volume <= 0) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const detune = 1 + (Math.random() - 0.5) * 0.06; // tiny variation so repeats are not fatiguing
    const f0 = (LANE_PITCH[dir] ?? 190) * detune;

    // 1) crisp transient
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1800;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 4200;
    bp.Q.value = 0.9;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(1.0, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    src.connect(hp).connect(bp).connect(ng).connect(this.master);
    src.start(t);
    src.stop(t + 0.05);

    // 2) body "thock": triangle with a fast downward pitch sweep
    const body = ctx.createOscillator();
    body.type = 'triangle';
    body.frequency.setValueAtTime(f0 * 2.2, t);
    body.frequency.exponentialRampToValueAtTime(f0 * 0.7, t + 0.05);
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0.0001, t);
    bg.gain.exponentialRampToValueAtTime(0.9, t + 0.002);
    bg.gain.exponentialRampToValueAtTime(0.001, t + 0.075);
    body.connect(bg).connect(this.master);
    body.start(t);
    body.stop(t + 0.09);

    // 3) tiny square "tick" on the attack for the mechanical edge
    const tick = ctx.createOscillator();
    tick.type = 'square';
    tick.frequency.value = 2400 * detune;
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0.35, t);
    tg.gain.exponentialRampToValueAtTime(0.001, t + 0.012);
    tick.connect(tg).connect(this.master);
    tick.start(t);
    tick.stop(t + 0.02);
  }
}
