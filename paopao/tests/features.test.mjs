import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { rank, choose } from '../src/engine.js';
import { relaxFilters, applyFilters, normalizeFilters, activeCount, defaultFilters, countFilteredMovies, summarizeFilters } from '../src/lib/filters.js';
import { normalizeEgg, onOpen, feed, pickSpecies, HATCH_XP, SPECIES, defaultEgg } from '../src/lib/egg.js';
import { weeklyStats, weekStart } from '../src/lib/stats.js';

const movies = JSON.parse(fs.readFileSync(new URL('../src/movies.json', import.meta.url)));
const base = { mode: 'mood', mood: '有点 emo', profile: { tags: [], actors: [], blacklist: [] }, partner: { tags: [], actors: [], blacklist: [] }, exclude: [] };

test('every movie now carries a plausible year without losing fields', () => {
  assert.equal(movies.length, 100);
  movies.forEach((m) => {
    assert.ok(m.year >= 1950 && m.year <= 2025, m.title);
    assert.ok(m.title && m.tags.length && m.synopsis && m.platform);
  });
});

test('filters narrow the pool and count active dimensions', () => {
  const f = normalizeFilters({ minRating: 9, genre: '剧情' });
  assert.equal(activeCount(f), 2);
  assert.ok(applyFilters(movies, f).every((m) => m.rating >= 9 && (m.tags.includes('剧情') || m.type === '剧情')));
  assert.deepEqual(normalizeFilters({ minRating: 'x', maxDuration: 999 }), defaultFilters);
});

test('empty filter result relaxes lowest priority first, never touching blacklist', () => {
  const f = { minRating: 9, platform: '不存在的平台', maxDuration: 100, genre: '恐怖' };
  const { pool, relaxed } = relaxFilters(movies, f);
  assert.ok(pool.length > 0);
  assert.equal(relaxed[0], 'platform');
  const p = { ...base, profile: { ...base.profile, blacklist: ['治愈'] } };
  const r = relaxFilters(movies, { ...defaultFilters, genre: '治愈' }, (pl) => rank(pl, p).length > 0);
  assert.ok(r.relaxed.includes('genre'));
  assert.ok(rank(r.pool, p).every((m) => !m.tags.includes('治愈')));
});

test('legacy single-select storage migrates onto the tiered, multi-select model', () => {
  assert.deepEqual(normalizeFilters({ minRating: 7, platform: '腾讯', maxDuration: 130, genre: '全部' }), { minRating: 8, platform: ['腾讯'], maxDuration: 120, genre: [] });
  assert.deepEqual(normalizeFilters({ minRating: 9, platform: ['腾讯', '腾讯', 3], maxDuration: 0, genre: ['悬疑', '全部'] }), { minRating: 9, platform: ['腾讯'], maxDuration: 0, genre: ['悬疑'] });
  assert.equal(normalizeFilters({ maxDuration: 100 }).maxDuration, 90);
});

test('genres combine with OR, and the live count is the library predicate', () => {
  const f = normalizeFilters({ genre: ['悬疑', '治愈'] });
  const pool = applyFilters(movies, f);
  assert.ok(pool.length > 0 && pool.every((m) => m.tags.includes('悬疑') || m.tags.includes('治愈')));
  assert.equal(countFilteredMovies(movies, f), pool.length);
  assert.equal(countFilteredMovies(movies, { ...defaultFilters, maxDuration: 120 }), movies.filter((m) => m.duration <= 120).length);
  assert.equal(countFilteredMovies(movies, f, (m) => m.rating >= 9), pool.filter((m) => m.rating >= 9).length);
  assert.equal(countFilteredMovies(movies, { ...defaultFilters, platform: ['不存在的平台'] }), 0);
});

test('relaxing multi-select filters resets them to "all"', () => {
  const r = relaxFilters(movies, { ...defaultFilters, platform: ['不存在的平台'] });
  assert.deepEqual(r.relaxed, ['platform']);
  assert.deepEqual(r.filters.platform, []);
  assert.equal(activeCount(normalizeFilters({ platform: ['腾讯'], genre: ['悬疑', '科幻'] })), 2);
});

test('summary reads naturally and has a compact form', () => {
  assert.equal(summarizeFilters(defaultFilters), '全部平台 · 全部类型');
  assert.equal(summarizeFilters({ ...defaultFilters, platform: ['腾讯'], genre: ['悬疑'] }), '腾讯视频 · 悬疑');
  assert.equal(summarizeFilters({ ...defaultFilters, platform: ['腾讯', 'B站'], genre: ['悬疑', '科幻', '治愈'] }), '腾讯视频 等 2 个 · 悬疑等 3 类');
  assert.equal(summarizeFilters({ ...defaultFilters, platform: ['腾讯', 'B站'], genre: ['悬疑', '科幻', '治愈'] }, { short: true }), '2 个平台 · 3 个类型');
});

test('filters do not change engine ordering inside the pool', () => {
  const pool = applyFilters(movies, { ...defaultFilters, minRating: 8 });
  const full = rank(movies, base).filter((m) => m.rating >= 8).map((m) => m.id);
  assert.deepEqual(rank(pool, base).map((m) => m.id), full);
  assert.equal(choose(pool, base).id, full[0]);
});

test('story egg migrates legacy pet data and survives corrupt input', () => {
  assert.equal(normalizeEgg(null, { food: 3, xp: 2 }).food, 3);
  assert.deepEqual(normalizeEgg('garbage'), defaultEgg());
  assert.equal(normalizeEgg({ xp: -5, creatures: [{ species: 'dragon' }] }).creatures.length, 0);
});

test('opening, streaks and feeding grow the egg until it hatches', () => {
  let e = defaultEgg();
  ({ egg: e } = onOpen(e, { today: '2026-09-24' }));
  assert.equal(e.xp, 1);
  assert.equal(e.food, 1);
  ({ egg: e } = onOpen(e, { today: '2026-09-25', couple: true }));
  assert.equal(e.streak, 2);
  assert.equal(e.xp, 3); // +1 open +1 streak bonus
  assert.equal(e.food, 3);
  let born = [];
  while (!born.length) ({ egg: e, born } = feed(e, () => 0));
  assert.equal(born[0].species, 'fish');
  assert.equal(e.creatures.length, 1);
  assert.ok(e.xp < HATCH_XP);
  assert.equal(feed({ ...e, food: 0 }).egg.food, 0);
});

test('all five aquatic species are reachable and whale is the rarest', () => {
  const seen = new Set();
  for (let i = 0; i < 100; i++) seen.add(pickSpecies(0, () => i / 100));
  assert.deepEqual([...seen].sort(), SPECIES.map((s) => s.id).sort());
  assert.ok(SPECIES.at(-1).id === 'whale' && SPECIES.every((s) => s.weight >= SPECIES.at(-1).weight));
  assert.equal(pickSpecies(3, () => 0.999), 'whale');
});

test('weekly stats count this week only and build a genre distribution', () => {
  const now = new Date('2026-09-26T20:00:00');
  const monday = weekStart(now).toLocaleDateString('en-CA');
  assert.equal(monday, '2026-09-21');
  const memories = [
    { id: 'a', movieId: 1, date: '2026-09-22' },
    { id: 'b', movieId: 2, date: '2026-09-26' },
    { id: 'c', movieId: 3, date: '2026-09-10' },
  ];
  const s = weeklyStats(memories, [{ id: 1, date: now.toISOString() }], movies, now);
  assert.equal(s.watched, 2);
  assert.equal(s.opened, 1);
  assert.equal(s.distribution[0].tag, '剧情');
  assert.equal(s.days.find((d) => d.key === '2026-09-26').count, 1);
});
