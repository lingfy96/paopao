// Library filters. They narrow the candidate list *before* the existing engine ranks it,
// and relax silently (lowest priority first) when nothing would be left.

/** @typedef {{ minRating: number, platform: string[], maxDuration: number, genre: string[] }} Filters */

/** `platform` / `genre` are multi-select lists; an empty list means "all". @type {Filters} */
export const defaultFilters = { minRating: 0, platform: [], maxDuration: 0, genre: [] };

export const SCORE_TIERS = [
  { value: 0, label: '随缘' },
  { value: 8, label: '别踩雷' },
  { value: 9, label: '只看神作' },
];
export const RATING_OPTIONS = SCORE_TIERS.map((t) => t.value);

/** The last stop keeps the long-standing default: `0` = no upper bound, shown as "180+". */
export const DURATION_STOPS = [
  { value: 90, label: '90' },
  { value: 120, label: '120' },
  { value: 150, label: '150' },
  { value: 0, label: '180+' },
];
export const DURATION_OPTIONS = DURATION_STOPS.map((s) => s.value);
export const GENRE_OPTIONS = ['全部', '电影', '剧集', '治愈', '喜剧', '悬疑', '科幻', '爱情', '动作', '文艺', '奇幻', '催泪', '纪录片'];
export const PLATFORM_LABEL = { 腾讯: '腾讯视频', 爱奇艺: '爱奇艺', 优酷: '优酷', B站: '哔哩哔哩' };

/** Lowest priority is relaxed first. */
export const RELAX_ORDER = ['platform', 'genre', 'maxDuration', 'minRating'];
export const FILTER_NAMES = { platform: '平台', genre: '类型', maxDuration: '时长', minRating: '评分' };

// Values persisted by the previous chip UI, mapped onto the nearest current stop.
const LEGACY_RATING = { 7: 8 };
const LEGACY_DURATION = { 100: 90, 130: 120, 160: 150 };

const toList = (v) => {
  const list = Array.isArray(v) ? v : typeof v === 'string' ? [v] : [];
  return [...new Set(list.filter((x) => typeof x === 'string' && x && x !== '全部'))];
};

/** @param {any} f @returns {Filters} */
export function normalizeFilters(f) {
  /** @type {Filters} */
  const n = { ...defaultFilters, platform: [], genre: [] };
  if (f && typeof f === 'object') {
    const rating = LEGACY_RATING[f.minRating] ?? f.minRating;
    const duration = LEGACY_DURATION[f.maxDuration] ?? f.maxDuration;
    if (RATING_OPTIONS.includes(rating)) n.minRating = rating;
    if (DURATION_OPTIONS.includes(duration)) n.maxDuration = duration;
    n.platform = toList(f.platform);
    n.genre = toList(f.genre);
  }
  return n;
}

export const platformsOf = (movies) => ['全部', ...new Set(movies.map((m) => m.platform).filter(Boolean))];

export function matches(m, f) {
  const platforms = toList(f.platform);
  const genres = toList(f.genre);
  if (f.minRating && m.rating < f.minRating) return false;
  if (f.maxDuration && m.duration > f.maxDuration) return false;
  if (platforms.length && !platforms.includes(m.platform)) return false;
  if (genres.length && !genres.some((g) => m.type === g || m.tags.includes(g))) return false;
  return true;
}

export const applyFilters = (movies, f) => movies.filter((m) => matches(m, f));

/**
 * Same predicate the library and the draw use, so the sheet's live count can never disagree.
 * @template T @param {T[]} movies @param {any} f @param {(m: T) => boolean} [extra]
 */
export const countFilteredMovies = (movies, f, extra = () => true) =>
  movies.reduce((n, m) => n + (matches(m, f) && extra(m) ? 1 : 0), 0);

const isDefault = (f, key) => (Array.isArray(defaultFilters[key]) ? !toList(f[key]).length : f[key] === defaultFilters[key]);

export const activeCount = (f) => RELAX_ORDER.filter((key) => !isDefault(f, key)).length;

/** "全部平台 · 全部类型" / "腾讯视频 等 2 个 · 悬疑等 3 类"; `short` is for narrow rows. */
export function summarizeFilters(f, { short = false, platformLabel = (p) => PLATFORM_LABEL[p] || p } = {}) {
  const platforms = toList(f.platform);
  const genres = toList(f.genre);
  const p = !platforms.length ? '全部平台'
    : short ? `${platforms.length} 个平台`
    : platforms.length === 1 ? platformLabel(platforms[0]) : `${platformLabel(platforms[0])} 等 ${platforms.length} 个`;
  const g = !genres.length ? '全部类型'
    : short ? `${genres.length} 个类型`
    : genres.length === 1 ? genres[0] : `${genres[0]}等 ${genres.length} 类`;
  return `${p} · ${g}`;
}

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
    if (isDefault(f, key)) continue;
    f = { ...f, [key]: defaultFilters[key] };
    relaxed.push(key);
    pool = applyFilters(movies, f);
  }
  return { pool, filters: f, relaxed };
}
