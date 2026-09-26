/** The persisted blacklist schema. Invalid/legacy development entries are discarded. */
export function normalizeBlacklist(value) {
  const seen = new Set();
  return (Array.isArray(value) ? value : []).filter((item) => {
    if (!item || typeof item.id !== 'string' || !item.id.trim() || seen.has(item.id) ||
      !['actor', 'genre', 'title'].includes(item.type) || typeof item.name !== 'string' || !item.name.trim()) return false;
    seen.add(item.id);
    return true;
  }).map(({ id, type, name }) => ({ id, type, name: name.trim().slice(0, 100) }));
}

export function blacklistId() {
  try { if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID(); } catch { /* older browsers */ }
  return `bl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${++blacklistId.counter}`;
}
blacklistId.counter = 0;

/** Legacy strings are accepted at the API boundary; typed entries only match their own field. */
export function isBlacklisted(movie, entries) {
  return (Array.isArray(entries) ? entries : []).some((entry) => {
    const legacy = typeof entry === 'string';
    const name = legacy ? entry : entry?.name;
    if (typeof name !== 'string' || !name.trim()) return false;
    const fields = legacy ? [movie.title, ...(movie.actors || []), ...(movie.tags || []), movie.synopsis]
      : entry.type === 'actor' ? movie.actors : entry.type === 'genre' ? movie.tags : entry.type === 'title' ? [movie.title] : [];
    return (fields || []).some((field) => String(field || '').toLocaleLowerCase().includes(name.trim().toLocaleLowerCase()));
  });
}
