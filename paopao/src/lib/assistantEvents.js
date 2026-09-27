// Minimal event bus so business code can notify the assistant without importing it.
const listeners = new Map();

export function emit(name, detail) {
  const set = listeners.get(name);
  if (!set) return;
  for (const fn of [...set]) {
    try {
      fn(detail);
    } catch {
      /* one broken listener must not stop the others */
    }
  }
}

export function on(name, fn) {
  if (!listeners.has(name)) listeners.set(name, new Set());
  listeners.get(name).add(fn);
  return () => {
    listeners.get(name)?.delete(fn);
  };
}

/** Subscribe to several events with one teardown. */
export function onMany(map) {
  const offs = Object.entries(map).map(([name, fn]) => on(name, fn));
  return () => offs.forEach((off) => off());
}

export default { emit, on, onMany };
