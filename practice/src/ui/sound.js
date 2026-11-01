// Optional cues, synthesized locally with WebAudio. Muted until the coach turns
// them on; the clock never depends on them.
let ctx = null;
let enabled = false;

export function isSoundOn() {
  return enabled;
}

export function setSound(on) {
  enabled = !!on;
  if (enabled && !ctx) {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (AC) {
      try { ctx = new AC(); } catch { ctx = null; }
    }
  }
  if (enabled && ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  return enabled && !!ctx;
}

export function beep({ times = 1, freq = 880 } = {}) {
  if (!enabled || !ctx) return;
  const t0 = ctx.currentTime;
  for (let i = 0; i < times; i++) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0 + i * 0.3);
    gain.gain.exponentialRampToValueAtTime(0.25, t0 + i * 0.3 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.3 + 0.2);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0 + i * 0.3);
    osc.stop(t0 + i * 0.3 + 0.22);
  }
}
