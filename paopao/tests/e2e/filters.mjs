// Library filter sheet on a real Vite dev server: touch + mouse drags, path-following, scroll
// conflicts, draft/applied, empty results, responsive layout, themes, reduced motion and sound.
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { countFilteredMovies, normalizeFilters } from '../../src/lib/filters.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const out = path.resolve(root, '../qa-artifacts/filters');
fs.mkdirSync(out, { recursive: true });
const movies = JSON.parse(fs.readFileSync(path.join(root, 'src/movies.json'), 'utf8'));
const byId = new Map(movies.map((m) => [m.id, m]));
const expected = (f) => countFilteredMovies(movies, normalizeFilters(f));
const server = await createServer({ root, logLevel: 'error', server: { host: '127.0.0.1', port: 5181, strictPort: true } });
await server.listen();
const BASE = 'http://127.0.0.1:5181/paopao/';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const results = [];
const failures = [];
const check = (name, ok, detail = '') => {
  (ok ? results : failures).push(name);
  console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : detail);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function makePage({ width = 390, height = 844, reducedMotion = 'no-preference' } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, locale: 'zh-CN', reducedMotion });
  await ctx.addInitScript(() => {
    localStorage.setItem('onboard', 'true');
    localStorage.setItem('introSeen', '1');
    window.__osc = 0;
    window.__vib = [];
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      const create = AC.prototype.createOscillator;
      AC.prototype.createOscillator = function (...a) { window.__osc++; return create.apply(this, a); };
    }
    navigator.vibrate = (p) => { window.__vib.push(p); return true; };
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const cdp = await ctx.newCDPSession(page);
  return { ctx, page, cdp, errors };
}

async function seed(page, values = {}, route = '/library') {
  await page.goto(BASE);
  await page.evaluate((values) => {
    const base = { round: [], selected: 0, locked: false, quota: null, profile: { tags: [], actors: [], blacklist: [] }, partner: { tags: [], actors: [], blacklist: [] }, mode: 'random', theme: 'dark', filters: {}, muted: false };
    for (const [k, v] of Object.entries({ ...base, ...values })) localStorage.setItem(k, JSON.stringify(v));
  }, values);
  await page.goto(BASE + '#' + route);
  await page.reload();
  await page.locator('.film-intro').waitFor({ state: 'detached' });
}

const sheet = (page) => page.locator('.sheet.filter-sheet');
async function openSheet(page) {
  await page.locator('.section-heading .pill').click();
  await sheet(page).waitFor();
  await page.waitForTimeout(450);
}
async function closeByX(page) {
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await sheet(page).waitFor({ state: 'detached' });
}
const cta = (page) => page.locator('.fs-cta');
const checkedScore = (page) => page.locator('.fs-score [role="radio"][aria-checked="true"] .fs-score-name').innerText();
const sliderText = (page) => page.locator('.fs-arc[role="slider"]').getAttribute('aria-valuetext');
const center = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

async function touchDrag(cdp, points, { delay = 16, onStep } = {}) {
  const tp = (p) => [{ x: p.x, y: p.y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(points[0]) });
  for (let i = 1; i < points.length; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(points[i]) });
    await sleep(delay);
    if (onStep) await onStep(i, points[i]);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
const line = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }));

const scoreDots = (page) => page.locator('.fs-score-node .fs-dot').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }));
const scoreBubble = async (page) => center(await page.locator('.fs-drag-bubble').boundingBox());
/** Dense client-space samples of the real SVG path. */
const arcPath = (page, n = 240) => page.evaluate((n) => {
  const p = document.querySelector('.fs-arc-base');
  const m = p.ownerSVGElement.getScreenCTM();
  const L = p.getTotalLength();
  return Array.from({ length: n + 1 }, (_, i) => { const q = p.getPointAtLength((L * i) / n); const r = new DOMPoint(q.x, q.y).matrixTransform(m); return { x: r.x, y: r.y }; });
}, n);
const arcBubble = async (page) => center(await page.locator('.fs-arc-orb').boundingBox());
const distToPath = (pt, pts) => Math.min(...pts.map((q) => Math.hypot(q.x - pt.x, q.y - pt.y)));

try {
  // ======================================================== main flow (390 × 844, touch)
  {
    const { ctx, page, cdp, errors } = await makePage();
    await seed(page);
    await openSheet(page);
    await page.screenshot({ path: path.join(out, 'open-dark-390.png') });
    check('opens as the upgraded sheet with defaults', await checkedScore(page) === '随缘' && await sliderText(page) === '不限时长' && (await cta(page).innerText()).includes(`查看 ${movies.length} 部结果`));
    check('summary uses natural copy, never ALL · ALL', (await page.locator('.fs-facet-sum .is-full').innerText()) === '全部平台 · 全部类型' && !(await sheet(page).innerText()).includes('ALL'));

    // ---------- SCORE: touch drag 01 → 02 → 03, bubble follows the finger
    let dots = await scoreDots(page);
    let maxLag = 0;
    let midChecked = '';
    await touchDrag(cdp, line(dots[0], dots[1], 14), {
      onStep: async (i, p) => {
        if (i < 3) return;
        const b = await scoreBubble(page);
        maxLag = Math.max(maxLag, Math.abs(b.x - p.x));
        if (i === 14) midChecked = await checkedScore(page);
      },
    });
    check('SCORE bubble tracks the finger while dragging', maxLag < 3, `lag ${maxLag.toFixed(1)}px`);
    check('SCORE previews the nearest tier during the drag', midChecked === '别踩雷', midChecked);
    await page.waitForTimeout(450);
    let b = await scoreBubble(page);
    check('SCORE snaps to 02 and bubble rests on the node', await checkedScore(page) === '别踩雷' && Math.abs(b.x - dots[1].x) < 1.5);
    check('SCORE result count follows 02', (await cta(page).innerText()).includes(`查看 ${expected({ minRating: 8 })} 部结果`));
    const vibBefore = await page.evaluate(() => window.__vib.length);
    await page.waitForTimeout(700);
    await touchDrag(cdp, line(dots[1], dots[2], 14), { onStep: async (i) => { if (i === 9) await page.screenshot({ path: path.join(out, 'score-mid-drag.png'), clip: { x: 0, y: 0, width: 390, height: 300 } }); } });
    await page.waitForTimeout(330);
    await page.screenshot({ path: path.join(out, 'score-pop.png'), clip: { x: 0, y: 0, width: 390, height: 300 } });
    await page.waitForTimeout(120);
    check('SCORE drags on to 03', await checkedScore(page) === '只看神作' && (await cta(page).innerText()).includes(`查看 ${expected({ minRating: 9 })} 部结果`));
    check('SCORE drag snap fires a short haptic', (await page.evaluate(() => window.__vib)).slice(vibBefore).some((p) => p >= 10 && p <= 20));
    check('SCORE drag snap plays the pop with at most 3 particles', (await page.locator('.fs-sparks i').count()) <= 3);

    // Inertia never jumps more than one node from where the finger lets go.
    await page.locator('.fs-score [role="radio"]').nth(0).click();
    await page.waitForTimeout(400);
    await touchDrag(cdp, line(dots[0], { x: dots[0].x + 30, y: dots[0].y }, 3), { delay: 4 });
    await page.waitForTimeout(450);
    check('SCORE fling from 01 lands at most on 02', ['随缘', '别踩雷'].includes(await checkedScore(page)), await checkedScore(page));

    // Taps and rapid changes
    await page.locator('.fs-score [role="radio"]').nth(0).click();
    check('SCORE tap selects directly', await checkedScore(page) === '随缘' && (await cta(page).innerText()).includes(`查看 ${movies.length} 部结果`));
    for (const i of [2, 0, 1, 2, 1]) await page.locator('.fs-score [role="radio"]').nth(i).click();
    await page.waitForTimeout(450);
    b = await scoreBubble(page);
    dots = await scoreDots(page);
    check('rapid SCORE taps settle on the last choice without drift', await checkedScore(page) === '别踩雷' && Math.abs(b.x - dots[1].x) < 1.5);
    check('taps never burst the bubble', await page.locator('.is-popping, .fs-sparks').count() === 0);

    // Mouse drag
    await page.mouse.move(dots[1].x, dots[1].y);
    await page.mouse.down();
    await page.mouse.move(dots[2].x, dots[2].y, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(450);
    check('SCORE mouse drag works', await checkedScore(page) === '只看神作');
    await page.locator('.fs-score [role="radio"]').nth(0).click();

    // ---------- DURATION: drag along the real SVG path 180+ → 90, then 90 → 120 → 150 → 180
    let arc = await arcPath(page);
    const along = (from, to) => { const a = Math.round(from * 240); const z = Math.round(to * 240); const s = a < z ? 1 : -1; const pts = []; for (let i = a; s > 0 ? i <= z : i >= z; i += s * 4) pts.push(arc[i]); return pts; };
    let off = 0;
    await touchDrag(cdp, along(1, 0), { delay: 12, onStep: async (i, p) => { if (i > 2) off = Math.max(off, Math.hypot((await arcBubble(page)).x - p.x, (await arcBubble(page)).y - p.y)); } });
    check('DURATION bubble follows the finger along the arc', off < 3, `max ${off.toFixed(2)}px`);
    await page.waitForTimeout(500);
    check('DURATION snaps to 90', await sliderText(page) === '90 分钟以内' && (await page.locator('.fs-num-box .fs-num').last().innerText()) === '90');
    check('DURATION count follows 90', (await cta(page).innerText()).includes(`查看 ${expected({ maxDuration: 90 })} 部结果`));
    const unitAt90 = (await page.locator('.fs-num-unit').boundingBox()).x;

    // Finger 26px above the curve: bubble must stay on the path, not follow raw Y.
    const lifted = along(0, 1 / 3).map((p) => ({ x: p.x, y: p.y - 26 }));
    let offPath = 0;
    await touchDrag(cdp, lifted, { delay: 12, onStep: async (i) => { if (i > 1) offPath = Math.max(offPath, distToPath(await arcBubble(page), arc)); } });
    check('DURATION bubble stays on the path when the finger drifts off it', offPath < 1.5, `max ${offPath.toFixed(2)}px`);
    await page.waitForTimeout(500);
    check('DURATION snaps to 120', await sliderText(page) === '120 分钟以内');
    const unitAt120 = (await page.locator('.fs-num-unit').boundingBox()).x;
    check('big number keeps a stable width (unit does not move 90 ↔ 120)', Math.abs(unitAt90 - unitAt120) < 0.5, `${unitAt90} vs ${unitAt120}`);
    await touchDrag(cdp, along(1 / 3, 2 / 3), { delay: 12 });
    await page.waitForTimeout(500);
    check('DURATION snaps to 150', await sliderText(page) === '150 分钟以内' && (await cta(page).innerText()).includes(`查看 ${expected({ maxDuration: 150 })} 部结果`));
    await touchDrag(cdp, along(2 / 3, 1), { delay: 12, onStep: async (i) => { if (i === 10) await page.screenshot({ path: path.join(out, 'arc-mid-drag.png') }); } });
    await page.waitForTimeout(500);
    check('DURATION snaps to 180+', await sliderText(page) === '不限时长');
    await page.screenshot({ path: path.join(out, 'duration-dark-390.png') });

    // Tap a node: the bubble glides there along the path (sampled every frame).
    arc = await arcPath(page);
    await page.evaluate(() => {
      window.__trail = [];
      const t0 = performance.now();
      const tick = () => { const r = document.querySelector('.fs-arc-orb').getBoundingClientRect(); window.__trail.push({ x: r.x + r.width / 2, y: r.y + r.height / 2 }); if (performance.now() - t0 < 600) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
    await page.touchscreen.tap(arc[80].x, arc[80].y);
    await page.waitForTimeout(700);
    const trail = await page.evaluate(() => window.__trail);
    const trailOff = Math.max(...trail.map((p) => distToPath(p, arc)));
    check('tapping 120 selects it', await sliderText(page) === '120 分钟以内');
    check('tap glide moves along the path, not a straight line', trailOff < 1.5 && trail.length > 8, `max ${trailOff.toFixed(2)}px over ${trail.length} frames`);

    // Mouse drag on the arc
    await page.mouse.move(arc[80].x, arc[80].y);
    await page.mouse.down();
    for (const p of along(1 / 3, 2 / 3)) await page.mouse.move(p.x, p.y);
    await page.mouse.up();
    await page.waitForTimeout(500);
    check('DURATION mouse drag works', await sliderText(page) === '150 分钟以内');

    // Keyboard
    await page.locator('.fs-arc[role="slider"]').focus();
    await page.keyboard.press('ArrowLeft');
    check('slider ArrowLeft steps one stop', await sliderText(page) === '120 分钟以内');
    await page.locator('.fs-score [role="radio"][aria-checked="true"]').focus();
    await page.keyboard.press('ArrowRight');
    check('radiogroup ArrowRight moves selection and focus', await checkedScore(page) === '别踩雷' && await page.evaluate(() => document.activeElement?.getAttribute('aria-checked') === 'true'));

    // ---------- facets
    await page.locator('.fs-facet-toggle').click();
    await page.waitForTimeout(420);
    check('platform · genre expands in place', await page.locator('.fs-facet-toggle').getAttribute('aria-expanded') === 'true' && await page.locator('.sheet').count() === 1 && await sheet(page).getByRole('button', { name: '悬疑', exact: true }).isVisible());
    await sheet(page).getByRole('button', { name: '悬疑', exact: true }).click();
    await sheet(page).getByRole('button', { name: '科幻', exact: true }).click();
    await sheet(page).getByRole('button', { name: '腾讯视频', exact: true }).click();
    const draftNow = { minRating: 8, maxDuration: 120, platform: ['腾讯'], genre: ['悬疑', '科幻'] };
    check('chip multi-select updates the summary', (await page.locator('.fs-facet-sum .is-full').innerText()) === '腾讯视频 · 悬疑等 2 类');
    check('count matches the shared filter predicate', (await cta(page).innerText()).includes(`查看 ${expected(draftNow)} 部结果`), await cta(page).innerText());
    await page.screenshot({ path: path.join(out, 'facets-dark-390.png') });

    // ---------- zero results
    await sheet(page).getByRole('button', { name: '动作', exact: true }).click();
    await sheet(page).getByRole('button', { name: '悬疑', exact: true }).click();
    await sheet(page).getByRole('button', { name: '科幻', exact: true }).click();
    await page.locator('.fs-arc[role="slider"]').focus();
    await page.keyboard.press('Home');
    await page.locator('.fs-score [role="radio"]').nth(0).click();
    check('0 results disables submit with guidance', await cta(page).isDisabled() && (await cta(page).innerText()) === '没有匹配影片' && await page.getByText('条件有点严格，放宽一点试试。').isVisible(), `${expected({ maxDuration: 90, genre: ['动作'], platform: ['腾讯'] })}`);
    await page.screenshot({ path: path.join(out, 'zero-dark-390.png') });
    await cta(page).click({ force: true });
    check('disabled CTA cannot submit an empty result', await sheet(page).count() === 1);
    await page.locator('.fs-empty button').click();
    await page.waitForTimeout(500);
    check('reset restores the true defaults', await checkedScore(page) === '随缘' && await sliderText(page) === '不限时长' && (await page.locator('.fs-facet-sum .is-full').innerText()) === '全部平台 · 全部类型' && !await cta(page).isDisabled());
    check('reset does not burst several bubbles', await page.locator('.is-popping').count() === 0);

    // ---------- draft vs applied
    await page.locator('.fs-score [role="radio"]').nth(2).click();
    await closeByX(page);
    check('closing does not write the draft', JSON.stringify(await page.evaluate(() => JSON.parse(localStorage.getItem('filters')))) === JSON.stringify(normalizeFilters({})));
    await openSheet(page);
    check('reopening discards the unsubmitted change', await checkedScore(page) === '随缘');
    await page.locator('.fs-score [role="radio"]').nth(1).click();
    await page.keyboard.press('Escape');
    await sheet(page).waitFor({ state: 'detached' });
    await openSheet(page);
    check('Escape also discards', await checkedScore(page) === '随缘');
    await page.locator('.fs-score [role="radio"]').nth(2).click();
    await page.locator('.fs-arc[role="slider"]').focus();
    await page.keyboard.press('ArrowLeft');
    const want = expected({ minRating: 9, maxDuration: 150 });
    const label = await cta(page).innerText();
    await cta(page).click();
    await sheet(page).waitFor({ state: 'detached' });
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('filters')));
    check('查看结果 commits and persists', JSON.stringify(saved) === JSON.stringify({ minRating: 9, platform: [], maxDuration: 150, genre: [] }), JSON.stringify(saved));
    const rows = await page.locator('.movie-button').count();
    check('library shows exactly the promised number', label.includes(`查看 ${want} 部结果`) && rows === want, `${label} / ${rows}`);
    check('library rows respect the hard filters', (await page.locator('.movie-button h3').allInnerTexts()).every((t) => { const m = movies.find((x) => x.title === t); return m && m.rating >= 9 && m.duration <= 150; }));
    await page.reload();
    await page.locator('.film-intro').waitFor({ state: 'detached' });
    await openSheet(page);
    check('applied filters survive reload', await checkedScore(page) === '只看神作' && await sliderText(page) === '150 分钟以内');
    await closeByX(page);

    // ---------- scroll conflict (short viewport so the sheet scrolls)
    await page.setViewportSize({ width: 390, height: 600 });
    await openSheet(page);
    const sc = sheet(page);
    await sc.evaluate((e) => { e.scrollTop = 0; });
    const arcBox = await page.locator('.fs-arc').boundingBox();
    const start = { x: arcBox.x + arcBox.width * 0.5, y: arcBox.y + arcBox.height * 0.55 };
    await touchDrag(cdp, line(start, { x: start.x + 6, y: start.y - 220 }, 16), { delay: 16 });
    await page.waitForTimeout(400);
    const scrolled = await sc.evaluate((e) => e.scrollTop);
    check('vertical swipe on the arc scrolls the sheet', scrolled > 40, `scrollTop ${scrolled}`);
    check('vertical swipe does not change the duration', await sliderText(page) === '150 分钟以内');
    await sc.evaluate((e) => { e.scrollTop = 0; });
    const dotsNow = await scoreDots(page);
    const top0 = await sc.evaluate((e) => e.scrollTop);
    await touchDrag(cdp, line(dotsNow[2], { x: dotsNow[1].x, y: dotsNow[1].y + 10 }, 12));
    await page.waitForTimeout(450);
    check('horizontal SCORE drag does not scroll the sheet', Math.abs((await sc.evaluate((e) => e.scrollTop)) - top0) < 2 && await checkedScore(page) === '别踩雷');
    const scoreBox = await page.locator('.fs-score').boundingBox();
    const s2 = { x: scoreBox.x + scoreBox.width / 2, y: scoreBox.y + 40 };
    await touchDrag(cdp, line(s2, { x: s2.x, y: s2.y - 200 }, 16));
    await page.waitForTimeout(400);
    check('vertical swipe on SCORE scrolls too', (await sc.evaluate((e) => e.scrollTop)) > 40 && await checkedScore(page) === '别踩雷');
    await closeByX(page);
    await page.setViewportSize({ width: 390, height: 844 });

    // ---------- existing recommendation logic under the applied filters
    const top9 = movies.filter((m) => m.rating >= 9 && m.duration <= 150);
    for (const mode of ['mood', 'mbti', 'random']) {
      const banned = top9[0];
      await seed(page, { mode, mood: '有点 emo', mbti: 'INTJ', filters: { minRating: 9, maxDuration: 150, platform: [], genre: [] }, profile: { tags: [], actors: [], blacklist: [{ id: 'bl', type: 'title', name: banned.title }] } }, '/');
      await page.locator('.bubble').click();
      await page.locator('.showcase-current .showcase-card').waitFor();
      await page.waitForFunction(() => document.querySelector('.showcase-result')?.getAttribute('aria-busy') === 'false');
      const got = byId.get(Number(await page.locator('.showcase-current .showcase-card').getAttribute('data-movie-id')));
      check(`${mode} draw obeys filters and blacklist`, got && got.rating >= 9 && got.duration <= 150 && got.title !== banned.title, got?.title);
    }
    check('no runtime errors (main flow)', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ======================================================== sound off / on
  for (const muted of [true, false]) {
    const { ctx, page, cdp } = await makePage();
    await seed(page, { muted });
    await openSheet(page);
    await page.locator('.fs-score [role="radio"]').nth(2).click();
    await page.locator('.fs-score [role="radio"]').nth(0).click();
    await page.waitForTimeout(1000);
    const osc0 = await page.evaluate(() => window.__osc);
    const d = await scoreDots(page);
    await touchDrag(cdp, line(d[0], d[1], 14));
    await page.waitForTimeout(600);
    const osc = (await page.evaluate(() => window.__osc)) - osc0;
    check(muted ? 'sound off: snap makes no sound' : 'sound on: drag snap plays the soft pop', muted ? osc === 0 : osc > 0, `oscillators ${osc}`);
    await ctx.close();
  }

  // ======================================================== reduced motion
  {
    const { ctx, page, cdp, errors } = await makePage({ reducedMotion: 'reduce' });
    await seed(page);
    await openSheet(page);
    const d = await scoreDots(page);
    await touchDrag(cdp, line(d[0], d[2], 16));
    await page.waitForTimeout(500);
    check('reduced motion: SCORE drag still works', await checkedScore(page) === '只看神作');
    check('reduced motion: no burst or particles', await page.locator('.fs-sparks, .fs-arc-sparks, .is-popping').count() === 0);
    const arc = await arcPath(page);
    await touchDrag(cdp, Array.from({ length: 21 }, (_, i) => arc[240 - i * 4]), { delay: 12 });
    await page.waitForTimeout(400);
    check('reduced motion: DURATION drag still works', await sliderText(page) === '150 分钟以内');
    await page.touchscreen.tap(arc[0].x, arc[0].y);
    await page.waitForTimeout(300);
    check('reduced motion: tap selection works', await sliderText(page) === '90 分钟以内');
    await page.screenshot({ path: path.join(out, 'reduced-motion-390.png') });
    check('no runtime errors (reduced motion)', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ======================================================== responsive × theme
  for (const theme of ['dark', 'light']) {
    for (const width of [320, 360, 375, 390, 414, 430]) {
      const { ctx, page } = await makePage({ width, height: 760 });
      await seed(page, { theme, filters: { minRating: 8, maxDuration: 120, platform: ['腾讯'], genre: ['悬疑', '科幻', '治愈'] } });
      await openSheet(page);
      await page.locator('.fs-facet-toggle').click();
      await page.waitForTimeout(420);
      const layout = await page.evaluate(() => {
        const q = (s) => document.querySelector(s).getBoundingClientRect();
        const sh = document.querySelector('.sheet.filter-sheet');
        const s = sh.getBoundingClientRect();
        const inside = (r) => r.left >= s.left - 0.5 && r.right <= s.right + 0.5;
        const labels = [...document.querySelectorAll('.fs-arc-label')].map((e) => e.getBoundingClientRect());
        const ctaR = q('.fs-cta');
        const hit = document.elementFromPoint(ctaR.left + ctaR.width / 2, ctaR.top + ctaR.height / 2);
        return {
          pageOverflow: document.documentElement.scrollWidth > innerWidth,
          sheetOverflow: sh.scrollWidth > sh.clientWidth,
          titleClash: q('.fs-head h2').right > q('.fs-head-actions').left,
          arcInside: inside(q('.fs-arc svg')) && labels.every(inside),
          labelsClash: labels.some((a, i) => labels.some((b, j) => i < j && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom)),
          numberClash: q('.fs-num-box').right > q('.fs-num-unit').left,
          scoreClip: [...document.querySelectorAll('.fs-score-name')].some((e) => e.scrollWidth > e.clientWidth + 1),
          ctaVisible: ctaR.bottom <= innerHeight && !!hit?.closest('.fs-cta'),
          summary: document.querySelector('.fs-facet-sum .is-full').offsetParent ? document.querySelector('.fs-facet-sum .is-full').textContent : document.querySelector('.fs-facet-sum .is-short').textContent,
          panel: getComputedStyle(sh).backgroundImage,
        };
      });
      const bad = Object.entries(layout).filter(([k, v]) => v === true && k !== 'ctaVisible' && k !== 'arcInside').map(([k]) => k);
      if (!layout.ctaVisible) bad.push('ctaHidden');
      if (!layout.arcInside) bad.push('arcClipped');
      check(`${theme} ${width}px layout (${layout.summary})`, bad.length === 0, bad.join(','));
      if (theme === 'light' && width === 390) check('light panel uses #F5F1E8', layout.panel.includes('245, 241, 232'), layout.panel);
      await sheet(page).evaluate((e) => { e.scrollTop = 0; });
      await page.screenshot({ path: path.join(out, `${theme}-${width}.png`) });
      await ctx.close();
    }
  }
} finally {
  console.log(JSON.stringify({ passed: results.length, failed: failures, screenshots: out }, null, 2));
  await browser.close();
  await server.close();
  if (failures.length) process.exitCode = 1;
}
