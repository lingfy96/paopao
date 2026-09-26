import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBlacklist, blacklistId, isBlacklisted } from '../src/lib/blacklist.js';
import { rank } from '../src/engine.js';
import storage from '../src/lib/storage.js';
const movie = { id: 1, title: '恐怖片名', actors: ['张三'], tags: ['喜剧'], synopsis: '演员李四的故事', rating: 8, duration: 90, brain: 1 };
const entry = (type, name, id = 'one') => ({ id, type, name });
test('malformed storage, legacy strings and duplicate IDs are filtered without touching preferences', () => {
  const good = entry('genre', ' 喜剧 ');
  for (const value of [null, 'broken', {}, 42]) assert.deepEqual(normalizeBlacklist(value), []);
  storage.set('profile', { tags: ['悬疑'], actors: ['张三'], blacklist: [null, 'old', {}, { ...good, name: 4 }, good, good] });
  assert.deepEqual(storage.getProfile(), { tags: ['悬疑'], actors: ['张三'], blacklist: [entry('genre', '喜剧')] });
  storage.saveProfile({ tags: ['悬疑'], actors: ['张三'], blacklist: [entry('actor', '李四')] });
  assert.deepEqual(storage.getProfile().blacklist, [entry('actor', '李四')]);
});
test('typed blacklist matches only the selected field; unknown data is ignored', () => {
  assert.equal(isBlacklisted(movie, [entry('genre', '恐怖')]), false);
  assert.equal(isBlacklisted(movie, [entry('title', '恐怖')]), true);
  assert.equal(isBlacklisted(movie, [entry('actor', '张三')]), true);
  assert.equal(isBlacklisted(movie, [entry('actor', '李四')]), false);
  assert.equal(isBlacklisted(movie, [null, {}, 7, entry('invalid', '喜剧')]), false);
});
test('typed blacklist overrides likes, including partner entries', () => {
  const profile = { tags: ['喜剧'], actors: ['张三'], blacklist: [] };
  assert.equal(rank([movie], { mode: 'random', profile, partner: { blacklist: [entry('actor', '张三')] }, couple: true }).length, 0);
  assert.equal(rank([movie], { mode: 'random', profile: { ...profile, blacklist: [entry('genre', '喜剧')] } }).length, 0);
});
test('ID fallback works without crypto.randomUUID', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });
  try { const ids = Array.from({ length: 100 }, blacklistId); assert.equal(new Set(ids).size, 100); }
  finally { if (original) Object.defineProperty(globalThis, 'crypto', original); else delete globalThis.crypto; }
});
