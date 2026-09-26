// Weekly viewing stats derived from check-ins (memories) and box history.

export function weekStart(now = new Date()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const offset = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - offset);
  return d;
}

const inWeek = (value, start) => {
  const t = new Date(value).getTime();
  return Number.isFinite(t) && t >= start.getTime() && t < start.getTime() + 7 * 864e5;
};

export function weeklyStats(memories = [], history = [], movies = [], now = new Date()) {
  const start = weekStart(now);
  const byId = new Map(movies.map((m) => [m.id, m]));
  const watched = memories.filter((m) => inWeek((m.date || '').length === 10 ? m.date + 'T12:00:00' : m.date || m.createdAt, start));
  const genres = {};
  for (const w of watched) {
    const movie = byId.get(w.movieId);
    for (const tag of (movie?.tags || w.tags || []).slice(0, 2)) genres[tag] = (genres[tag] || 0) + 1;
  }
  const distribution = Object.entries(genres)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag, count]) => ({ tag, count }));
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const key = d.toLocaleDateString('en-CA');
    return { key, label: '一二三四五六日'[i], count: watched.filter((w) => (w.date || '').slice(0, 10) === key).length };
  });
  return {
    watched: watched.length,
    opened: history.filter((h) => inWeek(h.date, start)).length,
    minutes: watched.reduce((sum, w) => sum + (byId.get(w.movieId)?.duration || 0), 0),
    distribution,
    days,
  };
}
