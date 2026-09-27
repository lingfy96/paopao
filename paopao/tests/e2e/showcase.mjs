// Uses a real Vite dev server. All visual evidence is ignored by Git before generation.
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const out = path.resolve(root, '../qa-artifacts/showcase');
fs.mkdirSync(out, { recursive: true });
const movies = JSON.parse(fs.readFileSync(path.join(root, 'src/movies.json'), 'utf8'));
const server = await createServer({ root, server: { host: '127.0.0.1', port: 5179, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'zh-CN' });
await ctx.addInitScript(() => { localStorage.setItem('onboard', 'true'); localStorage.setItem('introSeen', '1'); });
const page = await ctx.newPage();
const errors = [];
const results = [];
page.on('pageerror', (e) => errors.push(e.message));
const check = (name, value) => { assert.ok(value, name); results.push(name); console.log('PASS', name); };
const BASE = 'http://127.0.0.1:5179/paopao/';
const card = () => page.locator('.showcase-current .showcase-card');
const settle = async () => {
  await page.waitForFunction(() => document.querySelector('.showcase-result')?.getAttribute('aria-busy') === 'false' && document.querySelector('.showcase-stage')?.classList.contains('is-rest'));
};
const stored = (key) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);
async function seed(round, values = {}, route = '/result') {
  await page.evaluate(({ round, values }) => {
    for (const [key, value] of Object.entries({ round, selected: 0, locked: false, quota: null, profile: { tags: [], actors: [], blacklist: [] }, partner: { tags: [], actors: [], blacklist: [] }, mode: 'random', theme: 'dark', watchlist: [], memories: [], filters: {}, ...values })) localStorage.setItem(key, JSON.stringify(value));
  }, { round, values });
  await page.goto(BASE + '#' + route); await page.reload();
  await page.locator('.film-intro').waitFor({ state: 'detached' });
}
async function tapNext() { await page.locator('.showcase-next').click(); await settle(); }
try {
  await page.goto(BASE); await page.locator('.film-intro').waitFor({ state: 'detached' });
  await seed([movies[1]]);
  await page.screenshot({ path: path.join(out, 'initial-dark-390.png'), fullPage: true });
  if (process.argv.includes('--visual')) { console.log(out); process.exitCode = 0; }
  else {
    check('existing result route renders one primary card', await card().count() === 1 && await page.getByRole('heading', { name: '心灵捕手', exact: true }).count() === 1);
    check('original available poster is retained', await card().locator('img').evaluate((e) => e.complete && e.naturalWidth > 0));
    await page.getByRole('button', { name: '想看', exact: true }).click();
    check('watchlist button immediately reflects state', await page.getByRole('button', { name: '取消想看', exact: true }).getAttribute('aria-pressed') === 'true');
    await page.reload(); await page.locator('.film-intro').waitFor({ state: 'detached' });
    check('watchlist state survives reload', await page.getByRole('button', { name: '取消想看', exact: true }).count() === 1);
    await page.getByRole('button', { name: '看完打卡', exact: true }).click();
    check('existing checkin sheet receives selected movie', await page.getByRole('dialog').innerText().then((text) => text.includes('心灵捕手')));
    await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'detached' }); await page.waitForTimeout(150);
    const first = await card().getAttribute('data-movie-id');
    const oldBG = await page.locator('.showcase-background').evaluate((e) => getComputedStyle(e).backgroundColor);
    await page.locator('.showcase-next').evaluate((e) => { e.click(); e.click(); e.click(); });
    check('rapid next clicks lock the request', await page.locator('.showcase-next').isDisabled());
    await settle();
    check('rapid clicks add exactly one result', (await stored('round')).length === 2);
    check('next card is a different movie', await card().getAttribute('data-movie-id') !== first);
    check('outgoing card nodes are removed', await page.locator('.showcase-outgoing').count() === 0);
    await page.waitForTimeout(450);
    check('background follows the next film', oldBG !== await page.locator('.showcase-background').evaluate((e) => getComputedStyle(e).backgroundColor));
    await tapNext();
    check('existing three-card limit is respected', (await stored('round')).length === 3 && await page.locator('.showcase-next').isDisabled());
    const quotaBefore = await stored('quota');
    await page.getByRole('button', { name: '查看 心灵捕手', exact: true }).click(); await settle();
    check('browsing a previous card keeps movie and watch state aligned', await card().getAttribute('data-movie-id') === '2' && await page.getByRole('button', { name: '取消想看', exact: true }).count() === 1);
    check('browsing does not consume quota', JSON.stringify(await stored('quota')) === JSON.stringify(quotaBefore));
    await page.getByRole('button', { name: '就看这部', exact: true }).click();
    check('lock enables a new box', !await page.locator('.showcase-next').isDisabled());
    await tapNext();
    check('new box resets round and consumes one box', (await stored('round')).length === 1 && (await stored('quota')).used === quotaBefore.used + 1);
    for (let i = 0; i < 7; i++) { if (await page.locator('.showcase-next').isDisabled()) await page.getByRole('button', { name: '就看这部', exact: true }).click(); await tapNext(); }
    check('ten consecutive next actions do not accumulate cards or get stuck', await card().count() === 1 && await page.locator('.showcase-outgoing').count() === 0);
    // First reveal through the original home bubble (ordinary and SSR).
    await seed([], {}, '/');
    await page.locator('.bubble').click();
    await page.locator('.showcase-mystery').waitFor();
    check('home bubble leads into the existing result route', page.url().endsWith('#/result'));
    await settle();
    check('ordinary first reveal completes', await card().count() === 1 && (await stored('quota')).used === 1);
    await seed([], { mode: 'mood', mood: '有点 emo', profile: { tags: ['治愈', '剧情', '爱情'], actors: ['马特·达蒙'], blacklist: [] } }, '/');
    await page.locator('.bubble').scrollIntoViewIfNeeded();
    const bubbleBox = await page.locator('.bubble').boundingBox();
    await page.mouse.move(bubbleBox.x + bubbleBox.width / 2, bubbleBox.y + bubbleBox.height / 2); await page.mouse.down(); await page.waitForTimeout(1650); await page.mouse.up();
    await page.locator('.ssr-overlay').waitFor({ state: 'visible' });
    check('long press still charges and triggers original SSR gold', await page.locator('.ssr-word').innerText() === 'SSR');
    await settle(); check('SSR resolves into showcase card', await card().getAttribute('data-rarity') === 'SSR');
    await page.locator('.ssr-overlay').waitFor({ state: 'detached' });
    await tapNext(); check('subsequent cards do not replay long SSR overlay', await page.locator('.ssr-overlay').count() === 0);
    // Blacklist remains enforced by the original ranking layer.
    const blacklist = [{ id: 'bl-actor', type: 'actor', name: '马特·达蒙' }, { id: 'bl-title', type: 'title', name: '星际穿越' }, { id: 'bl-genre', type: 'genre', name: '恐怖' }];
    await seed([movies[5]], { profile: { tags: ['恐怖', '科幻'], actors: ['马特·达蒙'], blacklist } });
    for (let i = 0; i < 2; i++) await tapNext();
    check('blacklisted actor, title and genre cannot enter new cards', (await stored('round')).slice(1).every((m) => !m.actors.includes('马特·达蒙') && m.title !== '星际穿越' && !m.tags.includes('恐怖')));
    // Empty pool keeps the visible card and unlocks retry.
    await seed([movies[1]], { profile: { tags: [], actors: [], blacklist: movies.map((m) => ({ id: `block-${m.id}`, type: 'title', name: m.title })) } });
    await page.locator('.showcase-next').click();
    check('empty pool keeps current card and presents a recoverable error', await card().getAttribute('data-movie-id') === '2' && await page.locator('.showcase-error').isVisible() && !await page.locator('.showcase-next').isDisabled());
    // Slow/unavailable API retains the old card and falls back to the safe local pool.
    await seed([movies[1]]); await page.evaluate(() => window.__PAOPAO_API__ = 1);
    await page.route('**/api/recommend', async (route) => { await new Promise((r) => setTimeout(r, 700)); await route.fulfill({ status: 503, body: '{}' }); });
    await page.locator('.showcase-next').click(); await page.waitForTimeout(330);
    check('slow API keeps current card and shows loading feedback', await card().getAttribute('data-movie-id') === '2' && (await page.locator('.showcase-next').innerText()).includes('正在抽下一张'));
    await settle(); check('API failure uses original local fallback', (await stored('round')).length === 2);
    await page.unroute('**/api/recommend');
    // Snapshots animate in one direction while live data stays on the correct card.
    await seed([movies[1]]);
    await page.locator('.showcase-next').click(); await page.locator('.showcase-outgoing').waitFor({ state: 'attached' });
    check('old and new cards have independent content during transition', await page.locator('.showcase-outgoing .showcase-card').getAttribute('data-movie-id') === '2' && await card().getAttribute('data-movie-id') !== '2');
    await page.screenshot({ path: path.join(out, 'switch-midpoint.png') });
    await settle();
    for (const [genre, id] of [['爱情', 6], ['科幻', 3], ['恐怖', 21], ['喜剧', 13]]) {
      await seed([{ ...movies[id - 1], tags: [genre], title: genre === '爱情' ? '爱' : genre === '科幻' ? '一个穿越时间与宇宙的漫长故事' : movies[id - 1].title }]);
      await page.screenshot({ path: path.join(out, `genre-${id}.png`), fullPage: true });
      check(`${genre} card keeps full title without overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.querySelector('.showcase-title').scrollWidth <= document.querySelector('.showcase-title').clientWidth));
    }
    await seed([{ id: 1, title: '没有额外资料的电影', rating: null, year: null, tags: [], actors: [] }]);
    check('missing metadata/poster/reason degrade without junk labels', !(await card().innerText()).match(/undefined|null|NaN|0\.0/) && await page.locator('.showcase-meta').count() === 0 && await page.locator('.showcase-poster-art').count() === 1);
    for (const theme of ['dark', 'light']) for (const width of [320, 375, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await seed([{ ...movies[1], title: '一个穿越时间与宇宙的漫长故事' }], { theme });
      check(`${theme} ${width}px no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.locator('.showcase-next').scrollIntoViewIfNeeded();
      check(`${theme} ${width}px primary action reachable`, await page.locator('.showcase-next').isVisible());
      await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: path.join(out, `${theme}-${width}.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 1280, height: 900 }); await seed([movies[1]]);
    check('desktop card remains constrained and centered', (await card().boundingBox()).width <= 560);
    await page.screenshot({ path: path.join(out, 'desktop.png') });
    await page.setViewportSize({ width: 844, height: 390 });
    check('landscape uses one responsive result, no duplicate cinema overlay', await page.locator('.cinema').count() === 0 && await card().count() === 1);
    await page.getByRole('button', { name: '看完打卡', exact: true }).scrollIntoViewIfNeeded();
    check('landscape actions remain scrollable', await page.getByRole('button', { name: '看完打卡', exact: true }).isVisible());
    await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ reducedMotion: 'reduce' }); await seed([movies[1]]);
    await tapNext(); check('reduced motion settles with visible card and usable actions', await card().isVisible() && !await page.getByRole('button', { name: '想看', exact: true }).isDisabled());
    await page.emulateMedia({ reducedMotion: 'no-preference' }); await seed([movies[1]]);
    await page.addStyleTag({ content: '.showcase-result * { animation: none !important; transition: none !important; }' });
    await tapNext();
    check('disabled CSS animations never leave hidden cards or locks', await card().evaluate((e) => getComputedStyle(e).opacity === '1') && await page.locator('.showcase-outgoing').count() === 0);
    await seed([movies[1]]);
    const swipeBox = await card().boundingBox();
    await page.mouse.move(swipeBox.x + swipeBox.width * .8, swipeBox.y + swipeBox.height * .5);
    await page.mouse.down();
    await page.mouse.move(swipeBox.x + swipeBox.width * .25, swipeBox.y + swipeBox.height * .5, { steps: 5 });
    await page.mouse.up();
    await settle();
    check('left swipe triggers one guarded next-card action', (await stored('round')).length === 2 && await card().getAttribute('data-movie-id') !== '2');
    await page.getByRole('button', { name: '收藏电影', exact: true }).focus(); await page.keyboard.press('Enter');
    check('keyboard activation retains favorite action', await page.getByRole('button', { name: '取消收藏', exact: true }).getAttribute('aria-pressed') === 'true');
    check('no browser runtime errors', errors.length === 0);
    console.log(JSON.stringify({ passed: results.length, errors, screenshots: out }, null, 2));
  }
} finally { await browser.close(); await server.close(); }
