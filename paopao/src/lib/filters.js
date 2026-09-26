// Library filters. They narrow the candidate list *before* the existing engine ranks it,
// and relax silently (lowest priority first) when nothing would be left.

export const defaultFilters = { minRating: 0, platform: '全部', maxDuration: 0, genre: '全部' };

export const RATING_OPTIONS = [0, 7, 8, 9];
export const DURATION_OPTIONS = [0, 100, 130, 160];
export const GENRE_OPTIONS = ['全部', '电影', '剧集', '治愈', '喜剧', '悬疑', '科幻', '爱情', '动作', '文艺', '奇幻', '催泪', '纪录片'];
export const PLATFORM_LABEL = { 腾讯: '腾讯视频', 爱奇艺: '爱奇艺', 优酷: '优酷', B站: '哔哩哔哩' };

/** Lowest priority is relaxed first. */
export const RELAX_ORDER = ['platform', 'genre', 'maxDuration', 'minRating'];
export const FILTER_NAMES = { platform: '平台', genre: '类型', maxDuration: '时长', minRating: '评分' };

export function normalizeFilters(f) {
  const n = { ...defaultFilters };
  if (f && typeof f === 'object') {
    if (RATING_OPTIONS.includes(f.minRating)) n.minRating = f.minRating;
    if (DURATION_OPTIONS.includes(f.maxDuration)) n.maxDuration = f.maxDuration;
    if (typeof f.platform === 'string') n.platform = f.platform;
    if (typeof f.genre === 'string') n.genre = f.genre;
  }
  return n;
}

export const platformsOf = (movies) => ['全部', ...new Set(movies.map((m) => m.platform).filter(Boolean))];

export function matches(m, f) {
  if (f.minRating && m.rating < f.minRating) return false;
  if (f.maxDuration && m.duration > f.maxDuration) return false;
  if (f.platform && f.platform !== '全部' && m.platform !== f.platform) return false;
  if (f.genre && f.genre !== '全部' && m.type !== f.genre && !m.tags.includes(f.genre)) return false;
  return true;
}

export const applyFilters = (movies, f) => movies.filter((m) => matches(m, f));

export const activeCount = (f) =>
  (f.minRating ? 1 : 0) + (f.maxDuration ? 1 : 0) + (f.platform !== '全部' ? 1 : 0) + (f.genre !== '全部' ? 1 : 0);

/**
 * Returns the filtered pool, relaxing the lowest-priority active filters until `ok(pool)` holds.
 * `relaxed` lists the filter keys that were dropped (empty when the user's filters fit).
 */
export function relaxFilters(movies, filters, ok = (pool) => pool.length > 0) {
  let f = normalizeFilters(filters);
  const relaxed = [];
  let pool = applyFilters(movies, f);
  for (const key of RELAX_ORDER) {
    if (ok(pool)) break;
    if (f[key] === defaultFilters[key]) continue;
    f = { ...f, [key]: defaultFilters[key] };
    relaxed.push(key);
    pool = applyFilters(movies, f);
  }
  return { pool, filters: f, relaxed };
}
