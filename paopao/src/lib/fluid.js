import { reducedMotion } from './fx.js';

export const EDGE = 22;
export const SLOP = 10;
export const PAGE_DISTANCE = 0.28;
export const PAGE_FLICK = 720;
export const CARD_DISTANCE = 0.22;
export const CARD_FLICK = 680;

const owners = new Map();

export function claimGesture(pointerId, id) {
  const current = owners.get(pointerId);
  if (current && current !== id) return false;
  owners.set(pointerId, id);
  return true;
}
export function ownsGesture(pointerId, id) { return owners.get(pointerId) === id; }
export function releaseGesture(pointerId, id) {
  if (owners.get(pointerId) === id) owners.delete(pointerId);
}
export function gestureOwner(pointerId) { return owners.get(pointerId) || ''; }

export function axisOf(dx, dy, slop = SLOP) {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (Math.max(ax, ay) < slop) return '';
  return ax > ay * 1.2 ? 'x' : ay > ax * 1.2 ? 'y' : '';
}

export function rubberBand(offset, dimension, constant = 0.55) {
  if (!dimension) return 0;
  const x = Math.abs(offset);
  return Math.sign(offset || 1) * (1 - 1 / (x * constant / dimension + 1)) * dimension;
}

export function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

export function lerp(a, b, t) { return a + (b - a) * t; }

export function createVelocity() {
  const samples = [];
  return {
    add(x, y, t = performance.now()) {
      samples.push({ x, y, t });
      while (samples.length > 6 || (samples.length && t - samples[0].t > 90)) samples.shift();
    },
    read() {
      if (samples.length < 2) return { vx: 0, vy: 0 };
      const a = samples[0], b = samples[samples.length - 1];
      const dt = Math.max(8, b.t - a.t) / 1000;
      return { vx: (b.x - a.x) / dt, vy: (b.y - a.y) / dt };
    },
    reset() { samples.length = 0; },
  };
}

export function shouldCommit(delta, velocity, size, distance = PAGE_DISTANCE, flick = PAGE_FLICK) {
  const dir = Math.sign(delta || velocity);
  if (!dir) return 0;
  if (Math.abs(delta) > size * distance) return dir;
  if (Math.sign(velocity) === dir && Math.abs(velocity) > flick) return dir;
  return 0;
}

/**
 * Interruptible critically-damped-ish spring. stop() returns the live {x,v}
 * so a new pointer can take over from the real visual position.
 */
/** @param {{ from: number, to: number, velocity?: number, tension?: number, friction?: number, rest?: number, restV?: number, onUpdate?: (x: number, v: number) => void, onComplete?: (x: number) => void }} opts */
export function animateSpring({ from, to, velocity = 0, tension = 280, friction = 28, rest = 0.5, restV = 12, onUpdate, onComplete }) {
  let x = from, v = velocity, raf = 0, last = 0, alive = true;
  if (reducedMotion()) {
    const start = performance.now(), dur = 140;
    const tick = (now) => {
      if (!alive) return;
      const t = Math.min(1, (now - start) / dur);
      x = lerp(from, to, t);
      v = 0;
      onUpdate?.(x, v);
      if (t < 1) raf = requestAnimationFrame(tick);
      else onComplete?.(to);
    };
    raf = requestAnimationFrame(tick);
    return {
      stop() { alive = false; cancelAnimationFrame(raf); return { x, v }; },
      current: () => ({ x, v }),
    };
  }
  const step = (now) => {
    if (!alive) return;
    const dt = last ? Math.min(0.032, (now - last) / 1000) : 0.016;
    last = now;
    v += (-tension * (x - to) - friction * v) * dt;
    x += v * dt;
    onUpdate?.(x, v);
    if (Math.abs(x - to) < rest && Math.abs(v) < restV) {
      x = to; v = 0;
      onUpdate?.(x, v);
      onComplete?.(to);
      return;
    }
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return {
    stop() { alive = false; cancelAnimationFrame(raf); return { x, v }; },
    current: () => ({ x, v }),
  };
}

export function nearestEdge(x, width, size, margin = 12) {
  const left = margin;
  const right = width - size - margin;
  return Math.abs(x - left) <= Math.abs(x - right) ? left : right;
}

export function gestureKind(target) {
  return target?.closest?.('[data-gesture]')?.getAttribute('data-gesture') || '';
}

export function isEdgeX(clientX, width = typeof window === 'undefined' ? 0 : window.innerWidth) {
  return clientX <= EDGE || clientX >= width - EDGE;
}
