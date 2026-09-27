// Real Vite dev server + a streaming mock of the chat proxy, so streaming, actions, background
// completion and error handling are exercised end to end without a live API key.
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import http from 'node:http';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const out = path.resolve(root, '../qa-artifacts/paopao');
fs.mkdirSync(out, { recursive: true });
const movies = JSON.parse(fs.readFileSync(path.join(root, 'src/movies.json'), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- mock proxy ----------
const mock = { mode: 'ok', requests: [], text: '给你挑了《心灵捕手》，安静的夜晚很配。', action: null, firstDelay: 40, gap: 30 };
const upstream = http.createServer(async (req, res) => {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  mock.requests.push({ url: req.url, body: JSON.parse(raw || '{}') });
  if (mock.mode === 'rate') return void res.writeHead(429, { 'Content-Type': 'application/json' }).end('{"error":"too many"}');
  if (mock.mode === 'auth') return void res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    .end('data: {"type":"error","kind":"auth","message":"AI 密钥无效"}\n\n');
  if (mock.mode === 'missing') return void res.writeHead(404).end('{}');
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' });
  await sleep(mock.firstDelay);
  const pieces = mock.text.match(/.{1,6}/gs) || [];
  for (const piece of pieces) {
    if (res.writableEnded) return;
    res.write(`data: ${JSON.stringify({ type: 'delta', text: piece })}\n\n`);
    await sleep(mock.gap);
  }
  if (mock.mode === 'cut') return void res.destroy();
  if (mock.action) res.write(`data: ${JSON.stringify({ type: 'action', ...mock.action })}\n\n`);
  res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
  res.end();
});
await new Promise((r) => upstream.listen(5185, '127.0.0.1', r));

const server = await createServer({
  root,
  server: {
    host: '127.0.0.1', port: 5183, strictPort: true,
    proxy: { '/paopao/api': { target: 'http://127.0.0.1:5185', rewrite: (p) => p.replace(/^\/paopao/, '') } },
  },
});
await server.listen();

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'zh-CN' });
await ctx.addInitScript(() => {
  localStorage.setItem('onboard', 'true');
  localStorage.setItem('introSeen', '1');
});
const page = await ctx.newPage();
const errors = [];
const results = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const check = (name, value) => {
  assert.ok(value, name);
  results.push(name);
  console.log('PASS', name);
};

const BASE = 'http://127.0.0.1:5183/paopao/';
const ball = () => page.locator('.paopao-ball');
const layer = () => page.locator('.paopao-layer');
const sheet = () => page.locator('.paopao-sheet');
const stored = (key) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), key);

async function seed(values = {}, route = '/') {
  await page.evaluate((v) => {
    for (const [key, value] of Object.entries({
      round: [], selected: 0, locked: false, quota: null, mode: 'mood', mood: '有点 emo', theme: 'dark',
      profile: { tags: [], actors: [], blacklist: [] }, partner: { tags: [], actors: [], blacklist: [] },
      watchlist: [], memories: [], filters: {}, history: [], favorites: [], paopaoChat: [], ...v,
    })) localStorage.setItem(key, JSON.stringify(value));
  }, values);
  await page.goto(BASE + '#' + route);
  await page.reload();
  await page.locator('.film-intro').waitFor({ state: 'detached' });
  await layer().waitFor();
}
/** The ball animates between positions, so wait for its box to stop moving before asserting. */
async function boxOf(locator) {
  let previous = null;
  for (let i = 0; i < 40; i++) {
    const box = await locator.boundingBox();
    if (previous && box && Math.abs(box.x - previous.x) < 0.5 && Math.abs(box.y - previous.y) < 0.5) return box;
    previous = box;
    await sleep(60);
  }
  return previous;
}
const overlaps = (a, b) => !!a && !!b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
async function openChat() {
  await ball().click();
  await sheet().waitFor();
}
async function askAndSettle(text) {
  await page.locator('#paopao-input').fill(text);
  await page.locator('.paopao-send').click();
  await page.locator('.paopao-msg-thinking').waitFor({ state: 'detached', timeout: 15000 });
  await page.waitForFunction(() => !document.querySelector('.paopao-chat-title small')?.textContent?.includes('正在'));
}

try {
  await page.goto(BASE);
  await page.locator('.film-intro').waitFor({ state: 'detached' });
  await seed();

  // ---------- character placement ----------
  const logoBox = await boxOf(page.locator('.topbar .logo'));
  const dockBox = await boxOf(ball());
  check('assistant is docked beside the app title without covering it', await layer().evaluate((e) => e.classList.contains('is-docked'))
    && dockBox.y < logoBox.y + logoBox.height + 20 && !overlaps(dockBox, logoBox));
  check('touch target stays at least 44px', dockBox.width >= 44 && dockBox.height >= 44);
  check('mood selection reaches the face as a modifier', await page.locator('.paopao-face').evaluate((e) => e.getAttribute('class').includes('mood-calm')));
  await page.screenshot({ path: path.join(out, 'docked-390.png') });

  // The library is the tallest route, so it is where scroll driven morphing is observable.
  await page.goto(BASE + '#/library');
  await page.evaluate(() => window.scrollTo(0, 600));
  await page.waitForFunction(() => (window.scrollY || 0) > 96);
  await page.waitForFunction(() => document.querySelector('.paopao-layer')?.classList.contains('is-floating'));
  const floatBox = await boxOf(ball());
  check('scrolling morphs the docked character into an edge ball', floatBox.x + floatBox.width >= 390 - 20 && floatBox.width >= 50);
  check('floating ball clears the bottom tab bar', floatBox.y + floatBox.height < 844 - 90);
  await page.screenshot({ path: path.join(out, 'floating-390.png') });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForFunction(() => document.querySelector('.paopao-layer')?.classList.contains('is-docked'));
  check('returning to the top docks it again', true);
  await page.goto(BASE + '#/');

  // ---------- morph into the chat sheet ----------
  await openChat();
  await page.waitForFunction(() => {
    const slot = document.querySelector('[data-paopao-morph="target"]')?.getBoundingClientRect();
    const ballRect = document.querySelector('.paopao-ball')?.getBoundingClientRect();
    return slot && ballRect && Math.abs(slot.left - ballRect.left) < 6 && Math.abs(slot.top - ballRect.top) < 6;
  }, null, { timeout: 4000 });
  check('the same ball element lands in the chat header (no duplicate avatar)', await page.locator('.paopao-face').count() === 1);
  check('chat sheet is a dialog with an accessible name', await sheet().getAttribute('aria-label') === '泡泡 AI 助手'
    && await sheet().getAttribute('role') === 'dialog');
  const sheetBox = await boxOf(sheet());
  check('sheet takes about two thirds of the screen, not all of it', sheetBox.height > 844 * 0.6 && sheetBox.height < 844 * 0.9);
  check('home quick prompts are offered', await page.getByRole('group', { name: '快捷提问' }).getByRole('button', { name: '今晚看什么？' }).count() === 1);
  await page.screenshot({ path: path.join(out, 'chat-empty.png') });

  // ---------- real streaming ----------
  mock.firstDelay = 700;
  mock.gap = 90;
  mock.text = '今晚可以看《海街日记》，它温柔又不费力。慢慢看，不用赶。';
  await page.locator('#paopao-input').fill('推荐一部轻松的');
  await page.locator('.paopao-send').click();
  await page.locator('.paopao-msg-thinking').waitFor();
  check('thinking state shows before the first token', (await page.locator('.paopao-chat-title small').innerText()).includes('正在想')
    && await page.locator('.paopao-face').evaluate((e) => e.getAttribute('class').includes('base-thinking')));
  await page.locator('.paopao-msg-ai').waitFor();
  const partial = await page.locator('.paopao-msg-ai').innerText();
  check('first token switches the face to speaking and hides thinking', partial.length < mock.text.length
    && await page.locator('.paopao-msg-thinking').count() === 0
    && await page.locator('.paopao-face').evaluate((e) => e.getAttribute('class').includes('base-speaking')));
  check('send button becomes a stop button while generating', await page.locator('.paopao-send.is-stop').count() === 1);
  await page.screenshot({ path: path.join(out, 'chat-streaming.png') });
  await page.waitForFunction((full) => document.querySelector('.paopao-msg-ai')?.innerText.includes(full.slice(-6)), mock.text, { timeout: 15000 });
  const grew = await page.locator('.paopao-msg-ai').innerText();
  check('text really streams in rather than appearing at once', grew.length > partial.length);
  const calm = await page.waitForFunction(() => document.querySelector('.paopao-face')?.getAttribute('class').includes('base-chatIdle')
    && document.querySelector('.paopao-chat-title small')?.textContent === '在线', null, { timeout: 3000 }).then(() => true, () => false);
  check('finished answer returns the face to a calm chat state', calm);
  check('a recommendation renders catalogue movie cards', await page.locator('.paopao-movie').count() >= 1
    && (await page.locator('.paopao-movie-text b').first().innerText()) === '海街日记');

  // ---------- privacy of the payload ----------
  const sent = mock.requests.at(-1).body;
  const payload = JSON.stringify(sent);
  check('request carries only the current question context', !!sent.context.candidates && !payload.includes('ZHIPU')
    && !payload.includes('favorites') && !payload.includes('memories') && !payload.includes('quota') && !payload.includes('addedAt'));
  check('candidates come from the app catalogue', sent.context.candidates.every((m) => movies.some((real) => real.id === m.id)));
  check('client never sends a system role', sent.messages.every((m) => ['user', 'assistant'].includes(m.role)));

  // ---------- movie card actions reuse existing business logic ----------
  await page.locator('.paopao-movie-save').first().click();
  check('watchlist button inside chat reflects state immediately', await page.locator('.paopao-movie-save.on').count() === 1);
  check('watchlist write goes through the existing storage layer', (await stored('watchlist')).some((w) => w.id === 76));

  // ---------- stop generation ----------
  mock.firstDelay = 60;
  mock.gap = 400;
  mock.text = '这一段会被你打断，因为它写得很慢很慢很慢。';
  await page.locator('#paopao-input').fill('慢慢讲');
  await page.locator('.paopao-send').click();
  await page.locator('.paopao-msg-ai').nth(1).waitFor();
  await page.locator('.paopao-send.is-stop').click();
  check('stop halts the stream immediately and keeps the partial answer', await page.locator('.paopao-send.is-stop').count() === 0
    && (await page.locator('.paopao-chat-title small').innerText()) === '已停下'
    && (await page.locator('.paopao-msg-ai').nth(1).innerText()).length < mock.text.length);
  check('interrupted answer is marked, not deleted', await page.locator('.paopao-msg-note').count() === 1);

  // ---------- background completion ----------
  mock.firstDelay = 60;
  mock.gap = 120;
  mock.text = '这条回答会在你关掉面板之后继续写完，回来就能看到。';
  await page.locator('.toast').waitFor({ state: 'detached' });
  await page.locator('#paopao-input').fill('后台继续');
  await page.locator('.paopao-send').click();
  await page.locator('.paopao-msg-ai').nth(2).waitFor();
  await page.getByRole('button', { name: '关闭泡泡助手' }).click();
  await sheet().waitFor({ state: 'detached' });
  check('closing the sheet keeps the request alive and shows a quiet working state', await page.locator('.paopao-ball.is-busy').count() === 1
    && await page.locator('.toast').count() === 0);
  await page.locator('.paopao-ball.has-news').waitFor({ timeout: 15000 });
  check('completion is announced with a small dot instead of a toast', await page.locator('.paopao-dot').count() === 1
    && await page.locator('.toast').count() === 0);
  const requestsBefore = mock.requests.length;
  await openChat();
  check('reopening restores the finished answer without asking again', mock.requests.length === requestsBefore
    && (await page.locator('.paopao-msg-ai').nth(2).innerText()).includes('回来就能看到'));
  check('history survives a reload through the existing storage helper', (await stored('paopaoChat')).length >= 4);

  // ---------- errors ----------
  mock.mode = 'rate';
  await askAndSettle('限流一下');
  check('rate limiting shows a friendly retry, never an auto retry loop', (await page.locator('.paopao-msg-error').innerText()).includes('几秒后')
    && await page.locator('.paopao-msg-error button').count() === 1);
  const beforeRetry = mock.requests.length;
  mock.mode = 'ok';
  mock.text = '好啦，我回来了。';
  await page.locator('.paopao-msg-error button').click();
  await page.locator('.paopao-msg-thinking').waitFor({ state: 'detached', timeout: 15000 });
  check('retry resends the same question without duplicating it', mock.requests.length === beforeRetry + 1
    && await page.getByText('限流一下', { exact: true }).count() === 1);
  mock.mode = 'auth';
  await askAndSettle('密钥坏了');
  const authText = await page.locator('.paopao-msg-error').innerText();
  check('auth failure is friendly, hides internals and offers no retry', authText.includes('服务端未配置')
    && !authText.toLowerCase().includes('key') && await page.locator('.paopao-msg-error button').count() === 0);
  mock.mode = 'cut';
  mock.text = '这段话会在中途断掉。';
  await askAndSettle('断流');
  check('a broken stream keeps what already arrived', (await page.locator('.paopao-msg-ai').last().innerText()).length > 0);
  mock.mode = 'ok';

  // ---------- actions ----------
  mock.action = { name: 'setMood', params: { mood: '想笑一下' } };
  mock.text = '那就换成轻松的心情。';
  await askAndSettle('我想笑一下');
  check('setMood action drives the real app state', await stored('mood') === '想笑一下');
  check('the face follows the new mood', await page.locator('.paopao-face').evaluate((e) => e.getAttribute('class').includes('mood-happy')));

  mock.action = { name: 'addWatchlist', params: { movieId: 3 } };
  mock.text = '帮你存下《星际穿越》。';
  await askAndSettle('把星际穿越加入想看');
  check('addWatchlist action reuses the existing watchlist action', (await stored('watchlist')).some((w) => w.id === 3));

  mock.action = { name: 'clearHistory', params: { all: true } };
  mock.text = '这个我不能做。';
  await askAndSettle('清空我的全部记录');
  check('an action outside the whitelist is ignored and never executed', (await stored('history')).length === (await stored('history')).length
    && await page.locator('.paopao-msg-ai').last().innerText() !== '');
  mock.action = { name: 'addWatchlist', params: { movieId: 999999 } };
  mock.text = '这个 id 不存在。';
  const watchBefore = (await stored('watchlist')).length;
  await askAndSettle('加一个不存在的片');
  check('an invalid parameter is refused by the client gate too', (await stored('watchlist')).length === watchBefore);

  mock.action = { name: 'openBlacklistAdd', params: { type: 'actor', name: '某位演员' } };
  mock.text = '要把这位演员加进黑名单吗？';
  await askAndSettle('以后不想看到某位演员');
  check('a blacklist write waits for explicit confirmation', await page.locator('.paopao-confirm').count() === 1
    && (await stored('profile')).blacklist.length === 0);
  await page.screenshot({ path: path.join(out, 'chat-confirm.png') });
  await page.locator('.paopao-confirm-yes').click();
  await page.waitForFunction(() => location.hash === '#/profile');
  check('confirming routes to the existing blacklist screen and stores a typed entry',
    (await stored('profile')).blacklist.every((e) => e.type === 'actor' && e.name === '某位演员' && typeof e.id === 'string'));
  check('blacklist page offers its own quick prompts', await ball().click().then(async () => {
    const prompts = await page.locator('.paopao-prompts button').allInnerTexts();
    await page.getByRole('button', { name: '关闭泡泡助手' }).click();
    await sheet().waitFor({ state: 'detached' });
    return prompts.some((p) => p.includes('偏好')) && !prompts.includes('今晚看什么？');
  }));
  mock.action = null;

  // ---------- result page behaviour ----------
  await seed({ round: [movies[1]], selected: 0, watchlist: [] }, '/result');
  await page.waitForFunction(() => !!document.querySelector('.paopao-layer'));
  const cta = await boxOf(page.locator('.showcase-next'));
  const resultBall = await boxOf(ball());
  check('on the result page the ball never covers the primary CTA', !overlaps(resultBall, cta));
  await page.screenshot({ path: path.join(out, 'result-page.png') });
  await openChat();
  const resultPrompts = await page.locator('.paopao-prompts button').allInnerTexts();
  check('result page quick prompts are about the current film', resultPrompts.includes('为什么推荐它？') && resultPrompts.includes('帮我加入想看'));
  mock.text = '因为《心灵捕手》和你此刻的心情很合。';
  await page.getByRole('group', { name: '快捷提问' }).getByRole('button', { name: '为什么推荐它？' }).click();
  await page.locator('.paopao-msg-thinking').waitFor({ state: 'detached', timeout: 15000 });
  const askedContext = mock.requests.at(-1).body.context;
  check('the assistant already knows which film is on screen', askedContext.currentMovie?.title === '心灵捕手'
    && askedContext.currentMovie.inWatchlist === undefined);
  mock.action = { name: 'rerollMovie', params: {} };
  mock.text = '好，换一张更轻的。';
  await askAndSettle('换个更轻松的');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('round') || '[]').length === 2, null, { timeout: 15000 });
  check('reroll goes through the existing draw logic and respects the round limit', (await stored('round')).length === 2);
  mock.action = null;

  // ---------- blacklist filtering is still enforced upstream of the assistant ----------
  await seed({
    profile: { tags: ['恐怖'], actors: ['马特·达蒙'], blacklist: [
      { id: 'b1', type: 'actor', name: '马特·达蒙' }, { id: 'b2', type: 'genre', name: '恐怖' }, { id: 'b3', type: 'title', name: '星际穿越' }] },
  }, '/');
  await openChat();
  mock.text = '好的。';
  await askAndSettle('推荐一部电影');
  const offered = mock.requests.at(-1).body.context.candidates;
  check('blacklisted films never even reach the AI context', offered.length > 0 && offered.every((m) => {
    const real = movies.find((x) => x.id === m.id);
    return !real.actors.includes('马特·达蒙') && !real.tags.includes('恐怖') && real.title !== '星际穿越';
  }));
  await page.getByRole('button', { name: '关闭泡泡助手' }).click();
  await sheet().waitFor({ state: 'detached' });

  // ---------- avoidance ----------
  await page.getByRole('button', { name: '想更懂我？' }).click().catch(() => page.getByRole('button', { name: /调整我的口味|想更懂我/ }).click());
  await page.getByRole('dialog').waitFor();
  check('the ball steps aside while another sheet is open', await layer().evaluate((e) => e.classList.contains('is-hidden'))
    && await layer().evaluate((e) => getComputedStyle(e).pointerEvents === 'none'));
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  await page.waitForFunction(() => !document.querySelector('.paopao-layer')?.classList.contains('is-hidden'));
  check('it comes back after the sheet closes', true);

  // ---------- keyboard, focus and accessibility ----------
  await openChat();
  check('the ball is removed from the tab order while the dialog owns focus', await ball().getAttribute('tabindex') === '-1'
    && await ball().getAttribute('aria-expanded') === 'true');
  await page.keyboard.press('Escape');
  await sheet().waitFor({ state: 'detached' });
  check('closing returns focus to the assistant button', await page.evaluate(() => document.activeElement?.classList.contains('paopao-ball')));
  check('the live region does not read every token', await page.locator('.paopao-sr[aria-live]').count() === 0);

  // ---------- responsive ----------
  for (const width of [320, 360, 375, 390, 414, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await seed({}, '/');
    await openChat();
    await page.locator('#paopao-input').fill('测试一句比较长的问题，看看输入框和快捷问题会不会把布局撑坏。');
    check(`${width}px chat has no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth
      && document.querySelector('.paopao-sheet').scrollWidth <= document.querySelector('.paopao-sheet').clientWidth));
    const send = await boxOf(page.locator('.paopao-send'));
    check(`${width}px send button is fully reachable`, send.x >= 0 && send.x + send.width <= width && send.height >= 44);
    if (width === 320) await page.screenshot({ path: path.join(out, 'chat-320.png') });
    await page.keyboard.press('Escape');
    await sheet().waitFor({ state: 'detached' });
  }
  await page.setViewportSize({ width: 390, height: 844 });

  // ---------- long titles inside chat cards ----------
  await seed({ round: [{ ...movies[1], title: '一个非常非常长的中文电影名称用来测试卡片布局' }], selected: 0 }, '/result');
  await openChat();
  mock.text = '《一个非常非常长的中文电影名称用来测试卡片布局》很适合今晚。';
  await askAndSettle('介绍一下这部');
  check('a long title wraps inside the movie card instead of breaking the layout',
    await page.locator('.paopao-movie').count() === 1 && await page.evaluate(() => {
      const card = document.querySelector('.paopao-movie');
      return card.scrollWidth <= card.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth;
    }));
  await page.keyboard.press('Escape');
  await sheet().waitFor({ state: 'detached' });

  // ---------- desktop: a real fine-pointer context, where Enter sends ----------
  {
    const dctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'zh-CN' });
    await dctx.addInitScript(() => { localStorage.setItem('onboard', 'true'); localStorage.setItem('introSeen', '1'); });
    const dp = await dctx.newPage();
    dp.on('pageerror', (e) => errors.push(e.message));
    await dp.goto(BASE + '#/');
    await dp.locator('.film-intro').waitFor({ state: 'detached' });
    await dp.locator('.paopao-ball').click();
    const dsheet = dp.locator('.paopao-sheet');
    await dsheet.waitFor();
    await dp.waitForTimeout(500);
    const panel = await dsheet.boundingBox();
    check('desktop shows a side panel instead of a stretched bottom sheet', panel.width <= 460 && panel.x > 640);
    await dp.screenshot({ path: path.join(out, 'desktop.png') });
    await dp.locator('#paopao-input').fill('桌面回车发送');
    await dp.keyboard.press('Enter');
    await dp.locator('.paopao-msg-user').last().waitFor();
    check('Enter sends on desktop', (await dp.locator('.paopao-msg-user').last().innerText()) === '桌面回车发送');
    await dp.locator('.paopao-msg-thinking').waitFor({ state: 'detached', timeout: 15000 });
    await dp.waitForFunction(() => !document.querySelector('.paopao-chat-title small')?.textContent?.includes('正在'));
    await dp.locator('#paopao-input').fill('第一行');
    await dp.keyboard.down('Shift');
    await dp.keyboard.press('Enter');
    await dp.keyboard.up('Shift');
    check('Shift+Enter adds a newline instead of sending', (await dp.locator('#paopao-input').inputValue()).includes('\n'));
    await dp.locator('.paopao-chat-new').click();
    check('new conversation clears the transcript', await dp.locator('.paopao-msg-ai').count() === 0
      && await dp.locator('.paopao-chat-empty').count() === 1);
    await dctx.close();
  }

  // ---------- reduced motion ----------
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seed({}, '/');
  check('reduced motion keeps the character visible and static', await ball().isVisible()
    && await page.locator('.paopao-ball').evaluate((e) => getComputedStyle(e).animationName === 'none'));
  await openChat();
  mock.text = '减少动效时我也能正常回答。';
  await askAndSettle('还能用吗');
  check('reduced motion still streams a usable answer', (await page.locator('.paopao-msg-ai').last().innerText()).includes('正常回答'));
  await page.keyboard.press('Escape');
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  // ---------- proxy unreachable (static hosting) ----------
  mock.mode = 'missing';
  await seed({}, '/');
  await openChat();
  await askAndSettle('没有服务端时呢');
  check('without a backend the assistant degrades to a friendly message',
    (await page.locator('.paopao-msg-error').innerText()).includes('服务端'));
  mock.mode = 'ok';
  await page.keyboard.press('Escape');

  // ---------- timers and DOM stability ----------
  await seed({}, '/');
  const before = await page.evaluate(() => document.querySelectorAll('*').length);
  for (let i = 0; i < 6; i++) {
    await openChat();
    await page.keyboard.press('Escape');
    await sheet().waitFor({ state: 'detached' });
  }
  await page.evaluate(() => window.scrollTo(0, 500));
  await page.evaluate(() => window.scrollTo(0, 0));
  const after = await page.evaluate(() => document.querySelectorAll('*').length);
  check('repeated open/close does not leak DOM nodes', after - before < 40 && await page.locator('.paopao-layer').count() === 1);
  // The rate-limit and missing-backend steps deliberately answer 429 / 404; Chrome logs those itself.
  const unexpected = errors.filter((e) => !/^Failed to load resource: .*status of (429|404)\b/.test(e));
  check('no browser runtime errors', unexpected.length === 0);
  console.log(JSON.stringify({ passed: results.length, errors, screenshots: out }, null, 2));
} finally {
  await browser.close();
  await server.close();
  upstream.close();
}
