// Self-contained browser acceptance: npm run test:blacklist (Chromium must be installed).
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const out = process.env.OUT || path.join(os.tmpdir(), 'paopao-blacklist-qa');
fs.mkdirSync(out, { recursive: true });
const server = await createServer({ root, server: { host: '127.0.0.1', port: 5178, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const errors = [];
const checks = [];
const check = (name, condition) => { assert.ok(condition, name); checks.push(name); console.log('PASS', name); };
const entry = (id, type, name) => ({ id, type, name });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'zh-CN' });
await ctx.addInitScript(() => {
  localStorage.setItem('onboard', 'true'); localStorage.setItem('introSeen', '1');
  window.__audioStarts = 0;
  const AC = window.AudioContext;
  if (AC) window.AudioContext = class extends AC {
    createBufferSource() { const source = super.createBufferSource(); const start = source.start.bind(source); source.start = (...args) => { window.__audioStarts++; return start(...args); }; return source; }
  };
});
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const base = 'http://127.0.0.1:5178/paopao/#/profile';
const waitIntro = () => page.locator('.film-intro').waitFor({ state: 'detached' });
const rows = () => page.locator('.paper-row-face');
const data = () => page.evaluate(() => JSON.parse(localStorage.getItem('profile')).blacklist);
async function reload() { await page.reload(); await waitIntro(); }
async function seed(items, overrides = {}) {
  await page.evaluate(({ items, overrides }) => localStorage.setItem('profile', JSON.stringify({ tags: ['悬疑'], actors: ['梁朝伟'], blacklist: items, ...overrides })), { items, overrides });
  await reload();
}
async function closeWait() { await page.locator('[role=dialog]').waitFor({ state: 'detached' }); await page.waitForTimeout(160); }
async function add(type, name) {
  await page.locator('.paper-add').click();
  await page.getByRole('radio', { name: type, exact: true }).check();
  await page.getByLabel('名称', { exact: true }).fill(name);
  await page.getByRole('dialog').getByRole('button', { name: '添加', exact: true }).click();
  await closeWait();
}
async function touch(selector, moves = [], hold = 0) {
  const row = typeof selector === 'string' ? page.locator(selector).first() : selector;
  await row.scrollIntoViewIfNeeded(); await page.waitForTimeout(200);
  const b = await row.boundingBox(); const x = b.x + b.width * .7, y = b.y + b.height / 2;
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  for (const [dx, dy] of moves) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx, y: y + dy, id: 1 }] }); await page.waitForTimeout(40); }
  if (hold) await page.waitForTimeout(hold);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}
try {
  await page.goto(base); await waitIntro();
  check('empty state and original profile controls render', await page.getByText('没有不喜欢的，今天心情不错').isVisible() && await page.getByText('喜欢的演员', { exact: true }).isVisible());
  check('no audio starts on page load', await page.evaluate(() => window.__audioStarts === 0));
  await page.locator('.paper-header').click();
  check('collapse aria state', await page.locator('.paper-header').getAttribute('aria-expanded') === 'false');
  await page.waitForTimeout(550);
  check('collapsed paper is not focusable', await page.locator('.paper-reveal').evaluate((e) => e.inert && e.getBoundingClientRect().height < 1));
  await page.locator('.paper-header').click();
  await page.locator('.paper-add').click();
  check('empty add is disabled', await page.getByRole('dialog').getByRole('button', { name: '添加', exact: true }).isDisabled());
  await page.getByRole('radio', { name: '片名', exact: true }).check();
  check('type changes placeholder', await page.getByPlaceholder('输入片名').isVisible());
  await page.getByLabel('名称', { exact: true }).fill('   ');
  check('whitespace add is disabled', await page.getByRole('dialog').getByRole('button', { name: '添加', exact: true }).isDisabled());
  await page.keyboard.press('Escape'); await closeWait();
  await add('演员', '周杰伦'); await add('类型', '恐怖'); await add('片名', '小时代');
  check('three typed entries added', (await data()).map((x) => x.type).join(',') === 'actor,genre,title');
  await reload(); check('add survives reload', await rows().count() === 3);
  await rows().first().click(); await page.getByRole('button', { name: '编辑 周杰伦', exact: true }).click();
  await page.getByRole('radio', { name: '片名', exact: true }).check(); await page.getByLabel('名称', { exact: true }).fill('大鱼');
  await page.getByRole('button', { name: '保存', exact: true }).click(); await closeWait(); await reload();
  check('edited type and name persist', (await data())[0].name === '大鱼' && (await data())[0].type === 'title');
  await rows().first().click(); await page.getByRole('button', { name: '删除 大鱼', exact: true }).click();
  check('delete keeps data during animation and locks controls', (await data()).length === 3 && await page.locator('.paper-header').isDisabled());
  check('tear runs the crumple sequence, not a plain fade', await page.locator('.paper-scrap').evaluate((e) => getComputedStyle(e).animationName === 'paper-scrap-tear'));
  await page.waitForTimeout(180); await page.screenshot({ path: path.join(out, 'tear-1.png') });
  await page.waitForTimeout(160); await page.screenshot({ path: path.join(out, 'tear-2.png') });
  await page.locator('.paper-tear-layer').waitFor({ state: 'detached' }); await page.waitForTimeout(100);
  check('menu delete commits after animation', (await data()).length === 2);
  check('tear uses synthesized audio', await page.evaluate(() => window.__audioStarts > 0));
  await touch(rows().first(), [], 650);
  await page.locator('.paper-tear-layer').waitFor({ state: 'detached' });
  check('real touch long press deletes once without opening menu', (await data()).length === 1 && await page.getByRole('dialog').count() === 0);
  await touch(rows().first(), [[-18, 0], [-45, 0], [-85, 0]]);
  check('left swipe only reveals deletion', (await data()).length === 1 && await page.locator('.paper-swiped').count() === 1);
  await page.getByRole('button', { name: '删除 小时代', exact: true }).click();
  await page.locator('.paper-tear-layer').waitFor({ state: 'detached' });
  await page.waitForTimeout(750);
  check('last deletion returns clean empty tongue', (await data()).length === 0 && await page.getByRole('button', { name: '＋ 添加第一条', exact: true }).isVisible());
  await reload(); check('deletion survives reload', (await data()).length === 0);
  const many = Array.from({ length: 12 }, (_, i) => entry(`item-${i}`, ['actor', 'genre', 'title'][i % 3], ['周杰伦', '恐怖', '小时代'][i % 3] + i));
  await seed(many);
  check('12 entries default to first four', await rows().count() === 4 && await page.getByText('继续拉纸 · 还有 8 条').isVisible());
  await page.locator('.paper-more').click(); check('more releases four', await rows().count() === 8);
  await page.locator('.paper-more').click(); check('more reaches all entries', await rows().count() === 12 && await page.locator('.paper-more').count() === 0);
  await touch(rows().nth(2), [[0, -12], [0, -45], [0, -110]], 700);
  check('vertical touch scroll cancels long press', (await data()).length === 12 && await page.locator('.paper-tear-layer').count() === 0);
  check('page scrolls natively', await page.evaluate(() => window.scrollY > 0 && !document.querySelector('.paper-web').style.overflowY));
  // Cancellation and interruption are separate from successful long presses.
  await rows().first().scrollIntoViewIfNeeded();
  await rows().first().dispatchEvent('pointerdown', { isPrimary: true, button: 0, pointerId: 21, clientX: 100, clientY: 200 });
  await rows().first().dispatchEvent('pointercancel', { pointerId: 21 }); await page.waitForTimeout(700);
  check('pointercancel does not delete', (await data()).length === 12);
  await page.locator('.paper-add').click(); await page.goBack(); await closeWait();
  check('browser back closes sheet, retains profile route', page.url().endsWith('#/profile'));
  await seed([entry('long', 'title', '这是一个用于检查换行且不会横向溢出的非常长的电影名称'.repeat(3)), entry('actor', 'actor', '周杰伦'), entry('genre', 'genre', '恐怖')]);
  for (const theme of ['dark', 'light']) {
    await page.evaluate((theme) => localStorage.setItem('theme', JSON.stringify(theme)), theme); await reload();
    for (const width of [320, 375, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await page.locator('.tear-sheet').scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
      check(`${theme} ${width}px: no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      check(`${theme} ${width}px: add button is accessible`, await page.locator('.paper-add').isVisible());
      await page.screenshot({ path: path.join(out, `${theme}-${width}.png`) });
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  check('desktop sheet width is constrained', (await page.locator('.tear-sheet').boundingBox()).width <= 460);
  await page.screenshot({ path: path.join(out, 'desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => { window.__tearAnim = null; new MutationObserver((_, o) => {
    const scrap = document.querySelector('.paper-scrap');
    if (scrap) { window.__tearAnim = [getComputedStyle(scrap).animationName, getComputedStyle(scrap.parentElement).animationName]; o.disconnect(); }
  }).observe(document.body, { childList: true }); });
  await touch(rows().first(), [], 650); await page.waitForTimeout(350);
  check('reduced motion replaces crumple with a short fade', JSON.stringify(await page.evaluate(() => window.__tearAnim)) === '["none","paper-short-fade"]');
  check('reduced motion still deletes', (await data()).length === 2 && await page.locator('.paper-tear-layer').count() === 0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await rows().first().click(); await page.getByRole('button', { name: '删除 周杰伦', exact: true }).click();
  // Cancel CSS animations: timeout must still commit and unlock.
  await page.locator('.paper-torn-piece').evaluate((e) => e.style.animation = 'none');
  await page.waitForTimeout(1500);
  check('animation failure timeout completes deletion', (await data()).length === 1 && !await page.locator('.paper-header').isDisabled());
  await page.locator('.paper-add').click();
  await page.getByRole('button', { name: '关闭', exact: true }).focus(); await page.keyboard.press('Shift+Tab');
  check('sheet traps keyboard focus', await page.getByRole('dialog').evaluate((e) => e.contains(document.activeElement)));
  await page.keyboard.press('Escape'); await closeWait();
  await seed([null, 'old', { id: 'bad', type: 'bad', name: 'bad' }, entry('valid', 'genre', '恐怖')]);
  check('invalid persisted entries are filtered', (await data()).length === 1);
  check('other preferences survive blacklist normalization', await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('profile')); return p.tags[0] === '悬疑' && p.actors[0] === '梁朝伟'; }));
  await page.evaluate(() => localStorage.setItem('profile', '{broken')); await reload();
  check('corrupt JSON recovers to usable empty profile', await page.locator('.paper-empty-message').isVisible());
  // Denied audio and missing UUID: interaction must still complete.
  await page.addInitScript(() => { window.AudioContext = class { constructor() { throw new Error('audio blocked'); } }; Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true }); });
  await reload(); await add('类型', '恐怖');
  check('UUID fallback adds an item', (await data())[0].id.startsWith('bl-'));
  await touch(rows().first(), [], 650); await page.waitForTimeout(1000);
  check('audio rejection never blocks deletion', (await data()).length === 0);
  check('no browser runtime errors', errors.length === 0);
  console.log(JSON.stringify({ passed: checks.length, errors, screenshots: out }, null, 2));
} finally { await browser.close(); await server.close(); }
