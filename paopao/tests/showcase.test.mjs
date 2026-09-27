import test from 'node:test';
import assert from 'node:assert/strict';
import { getMovieTheme, normalizeMovieCardData, contrastInk } from '../src/lib/showcase.js';
import { WEATHER } from '../src/lib/weather.js';

test('display adapter hides missing/invalid values and never invents platform or rating', () => {
  const data = normalizeMovieCardData({ id: 7, title: '长片名测试', rating: NaN, year: null, duration: Infinity, platform: null, tags: [null, '爱情'] });
  assert.equal(data.rating, null); assert.equal(data.year, null); assert.equal(data.duration, null);
  assert.equal(data.platform, ''); assert.equal(data.poster, ''); assert.equal(data.recommendation, '');
  assert.deepEqual(data.genres, ['爱情']); assert.equal(normalizeMovieCardData(null).title, '未命名影片');
  assert.equal(normalizeMovieCardData({ rating: 0 }).rating, null);
  assert.equal(normalizeMovieCardData({ rating: 8.7 }).rating, 8.7);
});
test('existing artwork, recommendation and title length are preserved', () => {
  assert.equal(normalizeMovieCardData({ id: 2 }, '', '/paopao/').poster, '/paopao/good-will-hunting.jpg');
  assert.equal(normalizeMovieCardData({ title: '无间道' }).titleSize, 'short');
  assert.equal(normalizeMovieCardData({ title: '这个杀手不太冷' }).titleSize, 'medium');
  assert.equal(normalizeMovieCardData({ title: '一个非常长的中文电影名称测试' }).titleSize, 'long');
  assert.equal(normalizeMovieCardData({ reason: '推荐原文', synopsis: '简介' }).recommendation, '推荐原文');
  assert.equal(normalizeMovieCardData({ synopsis: '简介' }).recommendation, '简介');
  assert.equal(normalizeMovieCardData({ poster: 'javascript:alert(1)' }).poster, '');
});
test('theme priority is movie configuration, current mood, genre, fallback', () => {
  assert.equal(getMovieTheme({ themeColor: '#123456', tags: ['爱情'] }, '有点 emo').source, 'movie');
  assert.equal(getMovieTheme({ tags: ['爱情'] }, '有点 emo').source, 'mood');
  assert.equal(getMovieTheme({ tags: ['爱情'] }, '').source, 'genre');
  assert.equal(getMovieTheme({}, '').source, 'fallback');
  assert.equal(getMovieTheme({ themeColor: 'invalid' }, '').source, 'fallback');
  assert.equal(getMovieTheme(null).source, 'fallback');
});
test('same mood gives deterministic film variations; mode and theme changes apply', () => {
  const movie = { id: 2, tags: ['治愈'] };
  assert.deepEqual(getMovieTheme(movie, '有点 emo'), getMovieTheme(movie, '有点 emo'));
  assert.notEqual(getMovieTheme(movie, '有点 emo').background, getMovieTheme({ ...movie, id: 3 }, '有点 emo').background);
  assert.notEqual(getMovieTheme(movie, '').background, getMovieTheme({ ...movie, id: 3 }, '').background);
  assert.notEqual(getMovieTheme(movie, '有点 emo').background, getMovieTheme(movie, '想笑一下').background);
  assert.notEqual(getMovieTheme(movie, '', 'dark').background, getMovieTheme(movie, '', 'light').background);
});
test('theme text meets WCAG normal text contrast across moods and genres', () => {
  const luma = (color) => [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255).map((n) => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4).reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i], 0);
  for (const mood of ['', ...Object.keys(WEATHER)]) for (const genre of ['爱情', '科幻', '恐怖', '喜剧', '治愈']) for (const mode of ['dark', 'light']) {
    const theme = getMovieTheme({ id: 9, tags: [genre] }, mood, mode);
    const [a,b] = [luma(theme.background),luma(theme.textOnTheme)].sort((a,b) => b-a);
    assert.ok((a + .05)/(b + .05) >= 4.5, `${mood} ${genre} ${mode}`);
  }
  assert.equal(contrastInk('#ffffff'), '#101318'); assert.equal(contrastInk('#000000'), '#ffffff');
});
