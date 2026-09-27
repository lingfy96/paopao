import { WEATHER } from './weather.js';

/** Presentation only: never used to rank or filter movies. */
export const SHOWCASE_TIMING = Object.freeze({ prepare: 1600, reveal: 660, switch: 420, pending: 90, ssrLead: 900, reduced: 120 });
const GENRES = {
  '爱情': '#ed778d', '科幻': '#3976e5', '喜剧': '#eec845', '悬疑': '#8255bc',
  '恐怖': '#9f304b', '动画': '#ec903d', '动作': '#de5a3d', '文艺': '#8ca08b',
  '治愈': '#61b7a0', '纪录片': '#397f78', '纪实': '#397f78', '冒险': '#397ccc', '青春': '#54bbc2',
};
const text = (v) => typeof v === 'string' ? v.trim() : '';
const hex = (v) => /^#[\da-f]{6}$/i.test(text(v)) ? v.toLowerCase() : null;
const channels = (color) => [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
export function mixColor(a, b, amount) {
  const left = channels(a), right = channels(b);
  return '#' + left.map((n, i) => Math.round(n * (1 - amount) + right[i] * amount).toString(16).padStart(2, '0')).join('');
}
function luminance(color) {
  return channels(color).map((c) => c / 255).map((c) => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4).reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
}
export function contrastInk(color) {
  const lum = luminance(color);
  const dark = (lum + .05) / (luminance('#101318') + .05);
  const light = 1.05 / (lum + .05);
  if (Math.max(dark, light) < 4.5) return '#000000';
  return dark > light ? '#101318' : '#ffffff';
}
const hash = (value) => Array.from(String(value ?? '')).reduce((n, char) => ((n * 31 + char.charCodeAt(0)) >>> 0), 7);

export function getMovieTheme(movie = {}, mood = '', themeMode = 'dark') {
  movie = movie || {};
  const tags = Array.isArray(movie.tags) ? movie.tags : Array.isArray(movie.genres) ? movie.genres : [];
  const genre = tags.find((tag) => GENRES[tag]);
  const genreColor = GENRES[genre] || '#647fe0';
  const palette = WEATHER[mood];
  const seed = hash(movie.id ?? movie.title);
  const custom = hex(movie.themeColor);
  // Mood stays dominant; a restrained per-film tint prevents consecutive cards in one genre
  // from feeling like the same theme while keeping the genre identity recognizable.
  const moodBase = palette ? mixColor(palette.a, palette.b, (seed % 5) * .13) : null;
  const variedGenre = mixColor(genreColor, seed % 2 ? '#ffffff' : '#101828', .035 + (seed % 9) * .012);
  const base = custom || (moodBase ? mixColor(moodBase, genreColor, .23 + (seed % 3) * .07) : variedGenre);
  const background = mixColor(base, themeMode === 'dark' ? '#171923' : '#ffffff', themeMode === 'dark' ? .12 : .07);
  return {
    background, backgroundAlt: mixColor(base, '#151a27', .36), accent: base,
    card: themeMode === 'dark' ? '#f5f3eb' : '#fffdf6', text: '#202421',
    textOnTheme: contrastInk(background), decorationColors: [mixColor(base, '#ffffff', .65), mixColor(base, '#101828', .48)],
    motif: tags.includes('恐怖') || tags.includes('悬疑') ? 'quiet' : tags.includes('科幻') || tags.includes('动作') ? 'orbit' : 'soft',
    source: custom ? 'movie' : palette ? 'mood' : genre ? 'genre' : 'fallback',
  };
}

export function showcaseVariables(theme) {
  return {
    '--showcase-bg': theme.background, '--showcase-bg-alt': theme.backgroundAlt,
    '--showcase-accent': theme.accent, '--showcase-card': theme.card, '--showcase-text': theme.text,
    '--showcase-on-theme': theme.textOnTheme,
    '--showcase-decoration-1': theme.decorationColors[0], '--showcase-decoration-2': theme.decorationColors[1],
  };
}

export function normalizeMovieCardData(movie = {}, mood = '', assetBase = '/') {
  movie = movie || {};
  const title = text(movie.title) || '未命名影片';
  const genres = (Array.isArray(movie.tags) ? movie.tags : Array.isArray(movie.genres) ? movie.genres : []).filter((v) => text(v));
  const posterCandidate = text(movie.poster) || text(movie.posterUrl);
  const poster = /^(https?:\/\/|\/|\.\/)/i.test(posterCandidate) ? posterCandidate : movie.id === 2 ? `${assetBase}good-will-hunting.jpg` : '';
  return {
    id: movie.id, title, originalTitle: text(movie.originalTitle), genres,
    year: Number.isInteger(movie.year) && movie.year > 1800 ? movie.year : null,
    rating: typeof movie.rating === 'number' && Number.isFinite(movie.rating) && movie.rating > 0 && movie.rating <= 10 ? movie.rating : null,
    duration: Number.isFinite(movie.duration) && movie.duration > 0 ? movie.duration : null,
    platform: text(movie.platform), poster,
    recommendation: [movie.reason, movie.recommendation, movie.why, movie.description, movie.summary, movie.synopsis].map(text).find(Boolean) || '',
    synopsis: text(movie.synopsis), actors: (Array.isArray(movie.actors) ? movie.actors : []).filter((v) => text(v)),
    mood: text(mood), rarity: ['R', 'SR', 'SSR'].includes(movie.rarity) ? movie.rarity : '',
    titleSize: Array.from(title).length <= 4 ? 'short' : Array.from(title).length <= 8 ? 'medium' : 'long',
  };
}
