/**
 * Paopao's face is three independent layers: a long lived base state, a short lived event
 * reaction and sticky modifiers. Reactions carry a priority so a high priority moment (SSR,
 * AI answering) is never queued behind an idle animation, and stale reactions simply expire.
 * No timers live here: the caller sweeps with the current time, which keeps this testable.
 */
export const BASE_STATES = ['idle', 'thinking', 'speaking', 'sleepy', 'chatIdle'];

/** Higher wins. critical 5 > ai 4 > user reaction 3 > page context 2 > idle 1. */
export const EVENTS = {
  excited: { priority: 5, ms: 800 },
  surprised: { priority: 3, ms: 700 },
  happy: { priority: 3, ms: 650 },
  success: { priority: 3, ms: 750 },
  sad: { priority: 3, ms: 1600 },
  lookAtCard: { priority: 2, ms: 2600 },
  peek: { priority: 2, ms: 1500, cooldown: 22000, maxPerSession: 6 },
  yawn: { priority: 1, ms: 1900, cooldown: 150000, maxPerSession: 2 },
};

const BASE_PRIORITY = { thinking: 4, speaking: 4, idle: 1, chatIdle: 1, sleepy: 1 };
export const MOOD_MODIFIER = {
  '想笑一下': 'mood-happy', '甜甜的': 'mood-happy', '超兴奋': 'mood-happy',
  '想被吓到': 'mood-scared', '有点愤怒': 'mood-scared',
  '有点焦虑': 'mood-anxious', '好无聊': 'mood-anxious',
  '独自安静': 'mood-calm', '有点 emo': 'mood-calm', '想哭一场': 'mood-calm',
};

export class PaopaoState {
  constructor(now = 0) {
    this.base = 'idle';
    this.event = null;
    this.modifiers = { mood: '', look: '', size: '' };
    this.history = new Map();
    this.counts = new Map();
    this.version = 0;
    this.createdAt = now;
    this.listeners = new Set();
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  #changed() {
    this.version += 1;
    for (const fn of [...this.listeners]) fn(this.snapshot());
  }

  /** The active reaction's priority, or the base priority when nothing is playing. */
  #activePriority(now) {
    if (this.event && this.event.until > now) return this.event.priority;
    return BASE_PRIORITY[this.base] ?? 1;
  }

  setBase(base, now = 0) {
    if (!BASE_STATES.includes(base) || this.base === base) return false;
    this.base = base;
    // A finished answer must not keep a long reaction on screen, and vice versa.
    if (this.event && BASE_PRIORITY[base] > this.event.priority) this.event = null;
    this.#changed();
    return true;
  }

  /** Returns true when the reaction was accepted. Cooldowns and session caps are enforced here. */
  fire(name, now = 0) {
    const config = EVENTS[name];
    if (!config) return false;
    const last = this.history.get(name);
    if (config.cooldown && last !== undefined && now - last < config.cooldown) return false;
    if (config.maxPerSession && (this.counts.get(name) || 0) >= config.maxPerSession) return false;
    if (config.priority < this.#activePriority(now)) return false;
    this.event = { name, priority: config.priority, until: now + config.ms };
    this.history.set(name, now);
    this.counts.set(name, (this.counts.get(name) || 0) + 1);
    this.#changed();
    return true;
  }

  setModifier(kind, value) {
    if (!(kind in this.modifiers) || this.modifiers[kind] === (value || '')) return false;
    this.modifiers[kind] = value || '';
    this.#changed();
    return true;
  }

  setMood(mood) {
    return this.setModifier('mood', MOOD_MODIFIER[mood] || '');
  }

  /** Drops expired reactions. Call from a timeout or animation callback. */
  sweep(now) {
    if (!this.event || this.event.until > now) return false;
    this.event = null;
    this.#changed();
    return true;
  }

  /** Next moment this state needs attention, or 0 when it is stable. */
  nextDeadline() {
    return this.event ? this.event.until : 0;
  }

  snapshot() {
    return {
      base: this.base,
      event: this.event?.name || '',
      mood: this.modifiers.mood,
      look: this.modifiers.look,
      size: this.modifiers.size,
      className: ['base-' + this.base, this.event ? 'event-' + this.event.name : '',
        this.modifiers.mood, this.modifiers.look, this.modifiers.size].filter(Boolean).join(' '),
    };
  }
}

/** AI request status drives the face through an adapter, never by touching the SVG. */
export function baseForRequest(status) {
  if (status === 'pending') return 'thinking';
  if (status === 'streaming') return 'speaking';
  return 'chatIdle';
}

export default PaopaoState;
