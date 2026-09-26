// Haptics + synthesized sound (Web Audio, no audio files). Every call is best-effort and silent on failure.
import storage from './storage.js';

export const reducedMotion = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

/** @param {number | number[]} [pattern] */
export function haptic(pattern = 12) {
  try {
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}

let muted = storage.get('muted', false);
let ctx = null;
const listeners = new Set();

export const isMuted = () => muted;
export function setMuted(value) {
  muted = !!value;
  storage.set('muted', muted);
  if (muted && ctx) ctx.suspend?.().catch(() => {});
  listeners.forEach((fn) => fn(muted));
}
export const onMuteChange = (fn) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

function audio() {
  if (muted) return null;
  try {
    if (!ctx) {
      // Creating a context before any gesture only produces browser warnings; wait for activation.
      if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return null;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

/** Call from the first pointerdown so iOS unlocks audio inside a gesture. */
export function unlockAudio() {
  audio();
}

function tone(ac, { type = 'sine', from, to, start = 0, dur = 0.2, gain = 0.15, attack = 0.01 }) {
  const t = ac.currentTime + start;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
  return osc;
}

function noise(ac, { start = 0, dur = 0.08, freq = 1800, q = 1.2, gain = 0.35 }) {
  const t = ac.currentTime + start;
  const len = Math.max(1, Math.floor(ac.sampleRate * dur));
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = q;
  const g = ac.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(ac.destination);
  src.start(t);
}

function safe(fn) {
  return (...args) => {
    try {
      const ac = audio();
      if (ac) return fn(ac, ...args);
    } catch {
      /* ignore */
    }
    return undefined;
  };
}

export const sfx = {
  /** Rising "blowing" tone while the bubble is held. Returns a stop() function. */
  inflate: (maxMs = 1400) => {
    try {
      const ac = audio();
      if (!ac) return () => {};
      const t = ac.currentTime;
      const osc = ac.createOscillator();
      const lfo = ac.createOscillator();
      const lfoGain = ac.createGain();
      const g = ac.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(170, t);
      osc.frequency.exponentialRampToValueAtTime(560, t + maxMs / 1000);
      lfo.frequency.value = 9;
      lfoGain.gain.value = 14;
      lfo.connect(lfoGain).connect(osc.frequency);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.06, t + 0.08);
      osc.connect(g).connect(ac.destination);
      osc.start(t);
      lfo.start(t);
      let stopped = false;
      return () => {
        if (stopped) return;
        stopped = true;
        try {
          const now = ac.currentTime;
          g.gain.cancelScheduledValues(now);
          g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), now);
          g.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
          osc.stop(now + 0.08);
          lfo.stop(now + 0.08);
        } catch {
          /* ignore */
        }
      };
    } catch {
      return () => {};
    }
  },
  pop: safe((ac) => {
    noise(ac, { dur: 0.07, freq: 2200, gain: 0.5 });
    tone(ac, { type: 'sine', from: 950, to: 140, dur: 0.12, gain: 0.25, attack: 0.003 });
  }),
  flip: safe((ac) => {
    noise(ac, { dur: 0.12, freq: 3200, q: 0.7, gain: 0.12 });
  }),
  ssr: safe((ac) => {
    [1046.5, 1318.5, 1568, 2093].forEach((f, i) =>
      tone(ac, { type: 'sine', from: f, dur: 0.9, start: i * 0.09, gain: 0.12, attack: 0.005 }),
    );
    tone(ac, { type: 'triangle', from: 523.25, dur: 1.4, start: 0, gain: 0.08, attack: 0.02 });
    noise(ac, { dur: 0.5, freq: 6000, q: 0.4, gain: 0.05, start: 0.1 });
  }),
  hatch: safe((ac) => {
    [784, 988, 1175].forEach((f, i) => tone(ac, { from: f, dur: 0.35, start: i * 0.08, gain: 0.1 }));
  }),
  tap: safe((ac) => {
    tone(ac, { type: 'sine', from: 660, to: 520, dur: 0.05, gain: 0.04, attack: 0.002 });
  }),
  intro: safe((ac) => {
    [261.6, 329.6, 392, 523.3].forEach((f, i) =>
      tone(ac, { type: 'sine', from: f, dur: 1.8, start: i * 0.12, gain: 0.05, attack: 0.25 }),
    );
    [1568, 2093].forEach((f, i) => tone(ac, { from: f, dur: 0.6, start: 1.1 + i * 0.1, gain: 0.04 }));
  }),
};
