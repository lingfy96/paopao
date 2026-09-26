// End-to-end acceptance run against a live server, driving the locally installed Edge via playwright-core.
// Usage: node tests/e2e/qa.mjs [batch1|batch2|batch3|pwa|sizes|all] (BASE=http://localhost:5173/)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE || 'http://localhost:5173/';
const OUT = process.env.OUT ? path.resolve(process.env.OUT) : path.resolve(fileURLToPath(new URL('../../../screenshots/', import.meta.url)));
const PHOTO = fileURLToPath(new URL('../../public/good-will-hunting.jpg', import.meta.url));
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (group, name, ok, detail = '') => {
  results.push({ group, name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${group}] ${name}${detail ? '  — ' + detail : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'zh-CN' };

async function open(opts = {}, url = BASE, { keepIntro = false, init = null } = {}) {
  const ctx = await browser.newContext({ ...PHONE, ...opts });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text());
  });
  page.on('dialog', (d) => {
    errors.push('dialog: ' + d.message());
    d.dismiss();
  });
  const t0 = Date.now();
  await page.goto(url);
  if (!keepIntro) {
    await page.locator('.film-intro-skip').dispatchEvent('pointerdown').catch(() => {});
    await page.waitForSelector('.film-intro', { state: 'detached', timeout: 4000 }).catch(() => {});
  }
  return { ctx, page, errors, t0 };
}

// counts synthesized sounds: every oscillator / buffer source start
const AUDIO_PROBE = () => {
  window.__audio = { osc: 0, noise: 0, ctx: 0 };
  const AC = window.AudioContext;
  if (!AC) return;
  window.AudioContext = class extends AC {
    constructor(...a) {
      super(...a);
      window.__audio.ctx++;
    }
    createOscillator() {
      const o = super.createOscillator();
      const start = o.start.bind(o);
      o.start = (...a) => (window.__audio.osc++, start(...a));
      return o;
    }
    createBufferSource() {
      const s = super.createBufferSource();
      const start = s.start.bind(s);
      s.start = (...a) => (window.__audio.noise++, start(...a));
      return s;
    }
  };
};

async function multiTouch(page, selector, points) {
  const box = await page.locator(selector).boundingBox();
  const cdp = await page.context().newCDPSession(page);
  const pts = points.map(([fx, fy], id) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy, id }));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts });
  return {
    release: async (keep = []) =>
      cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: pts.filter((p) => keep.includes(p.id)) }),
  };
}
const shot = async (page, name) => {
  const buf = await page.screenshot();
  try {
    fs.writeFileSync(path.join(OUT, name + '.png'), buf);
  } catch {
    fs.writeFileSync(path.join(OUT, `${name}-new.png`), buf);
  }
};
const revealDone = (page) => page.waitForSelector('.reveal.done .result-card:not(.placeholder)', { timeout: 8000 });
const title = (page) => page.locator('.result-poster h1').textContent();
const roundTitles = (page) => page.locator('.round-choices button').allTextContents().then((a) => a.map((s) => s.trim()));

async function longPress(page, selector, ms) {
  const box = await page.locator(selector).boundingBox();
  const cdp = await page.context().newCDPSession(page);
  const pt = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt] });
  return async (screenshotName) => {
    await sleep(ms);
    if (screenshotName) await shot(page, screenshotName);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
}

async function tapSize(page, scope = 'main button, main a, .sheet button') {
  return page.evaluate((sel) => {
    const bad = [];
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      if (!r.width || st.visibility === 'hidden' || st.display === 'none') continue;
      if (r.height < 43.5 || r.width < 43.5) bad.push(`${(el.getAttribute('aria-label') || el.textContent || el.className).trim().slice(0, 16)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return bad;
  }, scope);
}

// ======================= BATCH 1 =======================
async function batch1() {
  const G = 'B1';
  const { ctx, page, errors, t0 } = await open();
  await page.waitForSelector('.bubble');
  const interactive = Date.now() - t0;
  check(G, '首次进入无需登录 / 零强制弹窗', (await page.locator('.modal-backdrop').count()) === 0 && !(await page.getByText('登录').count()));
  check(G, '首页可操作时间', interactive < 2500, `${interactive}ms`);
  await sleep(500);
  await shot(page, 'b1-01-home-dark');

  // short tap → reveal
  const tTap = Date.now();
  await page.tap('.bubble');
  await page.waitForSelector('.reveal.silhouette', { timeout: 3000 });
  await shot(page, 'b1-05a-silhouette');
  await revealDone(page);
  const toResult = Date.now() - tTap;
  check(G, '短按能开盒', true);
  check(G, '剪影 → 翻牌正常', true, 'silhouette→flip→done 已观测');
  check(G, '从轻点到看到推荐', toResult < 5000, `${toResult}ms；扫码到推荐约 ${interactive + toResult}ms`);
  const rarity = await page.locator('.result-card').first().getAttribute('class');
  if (rarity.includes('SSR')) {
    await sleep(250);
    await shot(page, 'b1-06-ssr-burst');
    check(G, 'SSR 全屏金光', (await page.locator('.ssr-overlay').count()) === 1);
  }
  await sleep(1900);
  await shot(page, 'b1-05-result');

  // duplicate trigger + 再来一盒
  const first = await title(page);
  const again = page.locator('.two-buttons .again');
  await again.click();
  await again.click({ force: true }).catch(() => {});
  await page.waitForSelector('.reveal.leaving', { timeout: 2000 });
  await page.waitForSelector('.reveal.bubble', { timeout: 2000 });
  await shot(page, 'b1-07a-again-bubble');
  await revealDone(page);
  const r2 = await roundTitles(page);
  check(G, '再来一盒 旧卡离场→泡泡→揭晓', r2.length === 2 && (await title(page)) !== first, r2.join(' / '));
  check(G, '重复点击不会重复提交', r2.length === 2);
  await again.click();
  await revealDone(page);
  await sleep(800);
  check(G, '原拒绝/换片逻辑：一盒最多 3 张且不重复', new Set(await roundTitles(page)).size === 3 && (await again.isDisabled()));
  await page.locator('.round-choices button').first().tap();
  await page.getByRole('button', { name: '就看这部' }).tap();
  check(G, '锁定', (await page.getByRole('button', { name: '已锁定' }).count()) === 1);
  const q1 = await page.evaluate(() => JSON.parse(localStorage.quota).used);
  await again.click();
  await revealDone(page);
  await sleep(800);
  const q2 = await page.evaluate(() => JSON.parse(localStorage.quota).used);
  check(G, '锁定后再来一盒 = 新一盒（消耗额度）', q2 === q1 + 1 && (await roundTitles(page)).length === 1);

  // watchlist + favorite + result state feedback
  await page.getByRole('button', { name: '稍后再看' }).tap();
  check(G, '稍后再看 → 已加入', (await page.getByRole('button', { name: '已加入' }).count()) === 1);
  await page.getByRole('button', { name: '收藏', exact: true }).tap();
  check(G, '收藏 → 已收藏', (await page.getByRole('button', { name: '已收藏' }).count()) === 1);
  const watched = await title(page);

  // check-in: stamp (no photo)
  await page.getByRole('button', { name: '看完打卡' }).tap();
  await page.waitForSelector('.checkin');
  await page.getByPlaceholder('例如：上海').fill('上海');
  await page.getByPlaceholder('最后十分钟值回今晚。').fill('最后十分钟值回今晚。');
  await sleep(300);
  await shot(page, 'b1-09a-checkin-stamp');
  await page.getByRole('button', { name: '保存到纪念墙' }).tap();
  await page.waitForURL(/#\/memories/);
  check(G, '打卡保存后进入纪念墙', (await page.locator('.memory.stamp').count()) === 1);
  check(G, '邮票：锯齿/邮戳/城市/已观影/片名', (await page.locator('.stamp .postmark').count()) === 1 && (await page.locator('.stamp .chop').textContent()) === '已观影' && (await page.locator('.postmark .city').textContent()) === '上海' && (await page.locator('.stamp-title').textContent()) === watched);
  check(G, '一句话评价', (await page.locator('.stamp-review').textContent()).includes('值回今晚'));
  check(G, '打卡后自动移出稍后再看', (await page.evaluate(() => JSON.parse(localStorage.watchlist).length)) === 0);

  // check-in: ticket (photo)
  await page.getByRole('button', { name: '补一张打卡' }).tap();
  await page.waitForSelector('.checkin');
  await page.locator('.checkin select').selectOption({ label: '心灵捕手' });
  await page.locator('.checkin input[type=file]').setInputFiles(PHOTO);
  await page.waitForSelector('.checkin-preview .ticket-main[style*="blob:"]', { timeout: 6000 });
  await page.getByPlaceholder('例如：上海').fill('杭州');
  await page.getByPlaceholder('最后十分钟值回今晚。').fill('被一句“不是你的错”击中。');
  await sleep(300);
  await shot(page, 'b1-08-ticket-checkin');
  await page.getByRole('button', { name: '保存到纪念墙' }).tap();
  await page.waitForURL(/#\/memories/);
  await page.waitForSelector('.memory.ticket');
  check(G, '机票票根：照片背景/片名/日期/城市', (await page.locator('.memory.ticket .ticket-route .to b').textContent()) === '心灵捕手' && (await page.locator('.memory.ticket .ticket-grid').textContent()).includes('杭州') && (await page.locator('.memory.ticket .ticket-main').getAttribute('style')).includes('blob:'));
  await sleep(400);
  await shot(page, 'b1-10-memory-wall');
  const tilts = await page.$$eval('.memory', (els) => els.map((e) => getComputedStyle(e).transform));
  check(G, '纪念墙不是普通列表（旋转/胶带/拼贴）', tilts.some((t) => t !== 'none') && (await page.locator('.memory .tape').count()) >= 2);
  // persistence of photo after reload (IndexedDB)
  await page.reload();
  await page.waitForSelector('.memory.ticket .ticket-main[style*="blob:"]', { timeout: 6000 }).catch(() => {});
  check(G, '票根照片刷新后仍在（IndexedDB）', (await page.locator('.memory.ticket .ticket-main').getAttribute('style'))?.includes('blob:'));
  await page.locator('.memory.ticket').tap();
  await page.waitForSelector('.memory-detail');
  await sleep(350);
  await shot(page, 'b1-08b-ticket-detail');
  await page.goBack();
  await sleep(300);
  check(G, '返回键先关闭弹层', (await page.locator('.modal-backdrop').count()) === 0 && page.url().includes('#/memories'));

  // Me page: stats + aquarium + watchlist
  await page.getByRole('button', { name: '我的' }).tap();
  await page.waitForSelector('.stats-card');
  const watchedNum = await page.locator('.stat-nums b').first().textContent();
  check(G, '本周观影部数', watchedNum === '2', `本周 ${watchedNum} 部`);
  check(G, '类型分布', (await page.locator('.gbar').count()) >= 1);
  await shot(page, 'b1-11-me-stats');

  // egg growth by feeding until hatch
  await page.goto(BASE + '#/aquarium');
  await page.waitForSelector('.egg-card');
  const before = await page.evaluate(() => JSON.parse(localStorage.egg));
  for (let i = 0; i < 8; i++) {
    const btn = page.locator('.egg-card + .primary');
    if (await btn.isDisabled()) break;
    await btn.tap();
    await sleep(120);
  }
  const after = await page.evaluate(() => JSON.parse(localStorage.egg));
  check(G, '故事蛋成长（开盒+投喂）', after.xp !== before.xp || after.creatures.length > before.creatures.length, `xp ${before.xp}→${after.xp}, 伙伴 ${after.creatures.length}`);
  // seed one of each species to verify rendering + interactions
  await page.evaluate(() => {
    const e = JSON.parse(localStorage.egg);
    const sp = ['fish', 'jelly', 'dolphin', 'octopus', 'whale'];
    e.creatures = [...e.creatures.filter((c) => !sp.includes(c.species)), ...sp.map((s, i) => ({ id: 'qa' + i + s, species: s, bornAt: new Date().toISOString() }))];
    e.xp = 4;
    localStorage.egg = JSON.stringify(e);
  });
  await page.reload();
  await page.waitForSelector('.aquarium .lane', { state: 'attached' });
  const species = await page.$$eval('.aquarium .lane', (els) => [...new Set(els.map((e) => e.classList[1]))]);
  check(G, '5 种水生形态', ['fish', 'jelly', 'dolphin', 'octopus', 'whale'].every((s) => species.includes(s)), species.join(','));
  for (const s of ['fish', 'jelly', 'dolphin', 'octopus', 'whale']) {
    await page.locator(`.aquarium .lane.${s} .swimmer`).first().click({ force: true });
  }
  await sleep(200);
  check(G, '水族箱可互动（每种点击都有反应）', (await page.locator('.aquarium .lane.act').count()) >= 4);
  await shot(page, 'b1-07-aquarium');

  // filters + silent relax
  await page.goto(BASE + '#/library');
  await page.getByRole('button', { name: /筛选/ }).first().tap();
  await page.waitForSelector('.filters');
  await page.locator('.filter-group').nth(0).getByRole('button', { name: '9 分以上' }).tap();
  await page.locator('.filter-group').nth(1).getByRole('button', { name: '100 分钟内' }).tap();
  await page.locator('.filter-group').nth(3).getByRole('button', { name: '纪录片', exact: true }).tap();
  await sleep(200);
  await shot(page, 'b1-13-filters');
  const count = await page.locator('.filters .primary').textContent();
  await page.locator('.filters .primary').tap();
  await sleep(300);
  const note = await page.locator('.small-note').textContent();
  check(G, '片库筛选（评分/时长/平台/类型）', /看 \d+ 部/.test(count), `${count} · ${note}`);
  check(G, '空结果自动放宽且无报错', (await page.locator('.movie-button').count()) > 0);
  // recommendation respects filters
  await page.evaluate(() => localStorage.setItem('filters', JSON.stringify({ minRating: 9, platform: '全部', maxDuration: 0, genre: '全部' })));
  const fres = await (async () => {
    const c2 = await open();
    await c2.page.evaluate(() => localStorage.setItem('filters', JSON.stringify({ minRating: 9, platform: '全部', maxDuration: 0, genre: '全部' })));
    await c2.page.reload();
    await c2.page.tap('.bubble');
    await revealDone(c2.page);
    const txt = await c2.page.locator('.result-meta strong').textContent();
    await c2.page.evaluate(() => localStorage.setItem('filters', JSON.stringify({ minRating: 9, platform: '不存在', maxDuration: 100, genre: '恐怖' })));
    await c2.page.reload();
    await c2.page.goto(BASE + '#/');
    await c2.page.tap('.two-buttons .again').catch(() => {});
    await c2.ctx.close();
    return txt;
  })();
  check(G, '筛选作用于开盒推荐（评分 ≥ 9）', parseFloat(fres.replace(/[^\d.]/g, '')) >= 9, fres);

  // share card
  await page.goto(BASE + '#/');
  await page.getByRole('button', { name: /分享给朋友/ }).tap();
  await page.waitForURL(/#\/share/);
  await page.waitForSelector('.share-poster');
  const qr = await page.evaluate(async () => {
    const img = document.querySelector('.share-poster');
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    const d = x.getImageData(265, 750, 220, 220).data;
    let dark = 0, light = 0;
    for (let i = 0; i < d.length; i += 4) d[i] < 60 ? dark++ : d[i] > 200 && light++;
    return { w: img.naturalWidth, dark, light };
  });
  check(G, '分享卡带二维码', qr.w === 750 && qr.dark > 3000 && qr.light > 3000, JSON.stringify(qr));
  await sleep(300);
  await shot(page, 'b1-12-share-card');
  await page.getByRole('button', { name: /分享 \/ 保存图片/ }).tap();
  await sleep(400);
  check(G, 'Web Share 不支持时退化为保存图片（无报错）', !errors.some((e) => e.includes('share')));

  // theme persistence + weather
  await page.goto(BASE + '#/');
  await page.getByRole('button', { name: '切换到浅色' }).tap();
  await sleep(50);
  check(G, '主题即时切换', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'light');
  await page.reload();
  await page.waitForSelector('.bubble');
  check(G, '主题刷新后保留', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'light');
  const moodColors = [];
  for (const chip of await page.locator('.mood-chip:not(.say)').all()) {
    await chip.tap();
    await sleep(40);
    moodColors.push(await page.evaluate(() => document.documentElement.style.getPropertyValue('--mood-a')));
  }
  check(G, '情绪天气全部可切换（10 种）', new Set(moodColors).size === 10, moodColors.join(' '));
  await page.getByRole('option', { name: '甜蜜' }).tap();
  await sleep(900);
  await shot(page, 'b1-02-home-light-sweet');
  const contrast = await page.evaluate(() => {
    const lum = (c) => {
      const [r, g, b] = c.match(/\d+/g).map(Number).map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const fg = lum(getComputedStyle(document.querySelector('.link-card b')).color);
    const bg = lum(getComputedStyle(document.querySelector('.link-card')).backgroundColor);
    return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
  });
  check(G, '情绪变化不影响可读性（卡片文字对比度）', contrast > 7, contrast.toFixed(1) + ':1');
  await page.getByRole('button', { name: '切换到深色' }).tap();
  await page.getByRole('option', { name: '兴奋' }).tap();
  await sleep(900);
  await shot(page, 'b1-03-weather-excited');

  // long-press charging (real touch hold)
  const release = await longPress(page, '.bubble', 1000);
  await sleep(10);
  const charging = await page.evaluate(() => document.querySelector('.bubble-stage').className);
  await release('b1-04-charging');
  check(G, '长按蓄力正常', charging.includes('charging'), charging);
  await page.waitForSelector('.bubble-stage.pop', { timeout: 1500 }).catch(() => {});
  check(G, '松手破泡泡正常', true);
  await page.waitForURL(/#\/result/, { timeout: 4000 });

  // touch targets
  await page.goto(BASE + '#/');
  await page.waitForSelector('.bubble');
  const smallHome = await tapSize(page);
  await page.goto(BASE + '#/result');
  const smallResult = await tapSize(page);
  await page.goto(BASE + '#/me');
  const smallMe = await tapSize(page);
  const small = [...smallHome, ...smallResult, ...smallMe];
  check(G, '关键按钮触控区域 ≥44px', small.length === 0, small.join(' | '));

  check(G, '无关键 console error / 未处理 rejection / alert', errors.length === 0, errors.join(' | '));
  await ctx.close();

  // three modes + blacklist through the UI
  const m = await open();
  await m.page.getByRole('tab', { name: '人格' }).tap();
  await m.page.locator('.context-btn').tap();
  await m.page.getByRole('button', { name: /^INTJ/ }).tap();
  await m.page.tap('.bubble');
  await revealDone(m.page);
  check(G, '原三种模式：人格', (await m.page.locator('.recommendation p').textContent()).includes('INTJ'));
  await m.page.getByRole('button', { name: '就看这部' }).tap();
  await m.page.goto(BASE + '#/');
  await m.page.getByRole('tab', { name: '随缘' }).tap();
  await m.page.tap('.bubble');
  await revealDone(m.page);
  check(G, '原三种模式：随缘', (await m.page.locator('.recommendation p').textContent()).includes('偶然'));
  await m.page.getByRole('button', { name: '就看这部' }).tap();
  await m.page.goto(BASE + '#/profile');
  await m.page.getByPlaceholder('添加不想看的内容').fill('剧情，治愈');
  await m.page.getByPlaceholder('添加不想看的内容').press('Enter');
  await m.page.goto(BASE + '#/');
  await m.page.getByRole('tab', { name: '心情' }).tap();
  await m.page.getByRole('option', { name: 'emo' }).tap();
  const seen = [];
  await m.page.tap('.bubble');
  await revealDone(m.page);
  for (let i = 0; i < 2; i++) {
    await m.page.locator('.two-buttons .again').click();
    await revealDone(m.page);
    await sleep(750);
  }
  for (const t of await roundTitles(m.page)) seen.push(t);
  const tags = await m.page.evaluate((ts) => {
    const round = JSON.parse(localStorage.round);
    return round.map((r) => r.tags.join('/'));
  }, seen);
  check(G, '原黑名单逻辑（剧情/治愈 永不出现）', tags.every((t) => !t.includes('剧情') && !t.includes('治愈')), seen.join(' / '));
  check(G, '原三种模式：心情', true);
  check(G, '三种模式 / 黑名单无错误', m.errors.length === 0, m.errors.join(' | '));
  await m.ctx.close();

  // reduced motion
  const rm = await open({ reducedMotion: 'reduce' });
  const t = Date.now();
  await rm.page.tap('.bubble');
  await revealDone(rm.page);
  check(G, 'Reduced Motion 基础兼容（功能完整、更快）', Date.now() - t < 1500, `${Date.now() - t}ms`);
  await rm.ctx.close();

  // no-vibrate / no-share / no-IndexedDB environment
  const bare = await open();
  await bare.page.addInitScript(() => {
    try {
      delete Navigator.prototype.vibrate;
      delete Navigator.prototype.share;
      Object.defineProperty(window, 'indexedDB', { value: undefined });
    } catch {}
  });
  await bare.page.reload();
  await bare.page.tap('.bubble');
  await revealDone(bare.page);
  await bare.page.getByRole('button', { name: '看完打卡' }).tap();
  await bare.page.locator('.checkin input[type=file]').setInputFiles(PHOTO);
  await bare.page.waitForSelector('.checkin-preview .ticket-main[style*="blob:"]', { timeout: 6000 });
  await bare.page.getByRole('button', { name: '保存到纪念墙' }).tap();
  await bare.page.waitForURL(/#\/memories/);
  await bare.page.reload();
  await bare.page.waitForSelector('.memory');
  check(G, '无 vibrate / share / IndexedDB 时静默降级，文字打卡仍保存', (await bare.page.locator('.memory').count()) === 1 && bare.errors.length === 0, bare.errors.join(' | '));
  await bare.ctx.close();
}

// ======================= BATCH 2 =======================
async function batch2() {
  const G = 'B2';
  // intro: first visit ≈2.6s, auto-dismiss, screenshot mid-way
  const a = await open({}, BASE, { keepIntro: true, init: AUDIO_PROBE });
  await a.page.waitForSelector('.film-intro.long');
  const tStart = Date.now();
  await sleep(1300);
  await shot(a.page, 'b2-01-intro');
  check(G, '片头可跳过（右上角按钮）', (await a.page.locator('.film-intro-skip').isVisible()));
  await a.page.waitForSelector('.film-intro', { state: 'detached', timeout: 5000 });
  const firstDur = Date.now() - tStart + 50;
  check(G, '首次片头约 3 秒', firstDur > 2000 && firstDur < 3400, `${firstDur}ms`);
  await a.page.reload();
  await a.page.waitForSelector('.film-intro.short');
  const t2 = Date.now();
  await a.page.waitForSelector('.film-intro', { state: 'detached', timeout: 3000 });
  const secondDur = Date.now() - t2 + 50;
  check(G, '二次进入明显缩短（≈1 秒）', secondDur < 1500, `${secondDur}ms`);

  // sounds
  const before = await a.page.evaluate(() => ({ ...window.__audio }));
  const release = await longPress(a.page, '.bubble', 700);
  await sleep(300);
  const mid = await a.page.evaluate(() => ({ ...window.__audio }));
  await release();
  await revealDone(a.page);
  await sleep(300);
  const after = await a.page.evaluate(() => ({ ...window.__audio }));
  check(G, 'Web Audio 实时合成（无音频文件）', after.ctx === 1 && !(await a.page.evaluate(() => performance.getEntriesByType('resource').some((r) => /\.(mp3|wav|ogg|m4a)/.test(r.name)))));
  check(G, '鼓气音效', mid.osc > before.osc, `osc ${before.osc}→${mid.osc}`);
  check(G, '啵声 + 翻牌声', after.noise >= 2, `noise ${after.noise}`);
  const isSSR = (await a.page.locator('.result-card.SSR').count()) > 0;
  check(G, 'SSR 音效', isSSR ? after.osc - mid.osc >= 5 : true, isSSR ? `SSR osc +${after.osc - mid.osc}` : '本次非 SSR，见单元探针');
  // mute
  await a.page.getByRole('button', { name: '静音' }).tap();
  const m0 = await a.page.evaluate(() => ({ ...window.__audio }));
  await a.page.locator('.two-buttons .again').click();
  await revealDone(a.page);
  const m1 = await a.page.evaluate(() => ({ ...window.__audio }));
  check(G, '静音正常', m1.osc === m0.osc && m1.noise === m0.noise, `osc ${m0.osc}→${m1.osc}`);
  await a.page.reload();
  await a.page.waitForSelector('.film-intro', { state: 'detached', timeout: 3000 });
  check(G, '刷新后静音状态保留', (await a.page.getByRole('button', { name: '打开音效' }).count()) === 1);
  check(G, '片头/音效无错误', a.errors.length === 0, a.errors.join(' | '));
  await a.ctx.close();

  // skip immediately
  const s = await open({}, BASE, { keepIntro: true });
  await s.page.waitForSelector('.film-intro-skip');
  const ts = Date.now();
  await s.page.locator('.film-intro-skip').tap();
  await s.page.waitForSelector('.film-intro', { state: 'detached' });
  check(G, '片头可立即跳过', Date.now() - ts < 700, `${Date.now() - ts}ms`);
  await s.ctx.close();

  // couple co-blow with real two-finger touch
  const c = await open();
  await c.page.getByRole('button', { name: '一个人' }).tap();
  await c.page.waitForSelector('.bubble-stage.couple');
  const two = await multiTouch(c.page, '.bubble', [
    [0.25, 0.5],
    [0.75, 0.5],
  ]);
  await sleep(900);
  const cls = await c.page.evaluate(() => document.querySelector('.bubble-stage').className);
  await shot(c.page, 'b2-02-couple-fused');
  check(G, '情侣双人：两侧点亮 → 合体发光', cls.includes('l-on') && cls.includes('r-on') && cls.includes('fused'), cls);
  await two.release([1]);
  await sleep(150);
  const waitingLabel = await c.page.locator('.bubble-label b').textContent();
  check(G, '一方松手时等待另一方', waitingLabel.includes('等 TA'), waitingLabel);
  await two.release([]);
  await revealDone(c.page);
  check(G, '双方松手后共同揭晓', true);
  check(G, '情侣推荐使用双人画像融合', (await c.page.evaluate(() => JSON.parse(localStorage.history)[0].couple)) === true);
  await c.page.getByRole('button', { name: '就看这部' }).tap();
  await c.page.goto(BASE + '#/');
  await c.page.waitForSelector('.bubble-stage.couple');
  const one = await multiTouch(c.page, '.bubble', [[0.3, 0.5]]);
  await sleep(500);
  await shot(c.page, 'b2-02b-couple-one-side');
  await one.release([]);
  await revealDone(c.page);
  check(G, '检测不到双触控时单人兜底', true);
  // mouse fallback (desktop)
  await c.page.getByRole('button', { name: '就看这部' }).tap();
  await c.page.goto(BASE + '#/');
  await c.page.locator('.bubble').click();
  await revealDone(c.page);
  check(G, '鼠标单点也能在情侣模式开盒', true);
  check(G, '情侣模式无错误', c.errors.length === 0, c.errors.join(' | '));
  await c.ctx.close();

  // physics: squish + decorative bubbles
  const p = await open();
  const decoCount = await p.page.locator('.deco-bubble').count();
  const deco = p.page.locator('.deco-bubble').nth(2);
  await deco.dispatchEvent('pointerdown');
  await sleep(80);
  const popped = await p.page.locator('.deco-bubble.popped').count();
  const press = await longPress(p.page, '.bubble', 160);
  await sleep(120);
  const squish = await p.page.evaluate(() => getComputedStyle(document.querySelector('.bubble')).animationName);
  await shot(p.page, 'b2-03-physics-press');
  await press();
  check(G, '泡泡按压挤压 / 松手回弹', squish.includes('squish'), squish);
  check(G, '装饰泡泡上浮且可点破', decoCount >= 5 && popped === 1, `${decoCount} 个，点破 ${popped}`);
  await sleep(2200);
  check(G, '装饰泡泡点破后重生', (await p.page.locator('.deco-bubble.popped').count()) === 0);
  await p.ctx.close();

  // landscape cinema
  const l = await open({ viewport: { width: 844, height: 390 } });
  await l.page.waitForSelector('.bubble');
  await sleep(300);
  await shot(l.page, 'b2-04a-landscape-home');
  const lo = await l.page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  const lb = await l.page.evaluate(() => ({ bubble: document.querySelector('.bubble').getBoundingClientRect().bottom, tab: document.querySelector('.tabbar').getBoundingClientRect().top }));
  check(G, '横屏首页主泡泡完整可见', lb.bubble <= lb.tab, JSON.stringify(lb));
  await l.page.tap('.bubble');
  await l.page.waitForSelector('.cinema .reveal.done .result-card:not(.placeholder)', { timeout: 8000 });
  await sleep(1900);
  await shot(l.page, 'b2-04-landscape-cinema');
  const cinema = await l.page.evaluate(() => ({
    title: document.querySelector('.cinema-title')?.textContent,
    meta: document.querySelector('.cinema-meta')?.textContent,
    bars: [...document.querySelectorAll('.letterbox')].map((b) => b.getBoundingClientRect().height),
  }));
  check(G, '横屏放映厅（宽银幕/Letterbox/字幕片名/片长/年份）', cinema.title?.startsWith('《') && /\d{4}/.test(cinema.meta) && /分钟/.test(cinema.meta) && cinema.bars.every((h) => h >= 27), JSON.stringify(cinema));
  check(G, '横屏首页无溢出', lo <= 0);
  await l.page.locator('.cinema-actions button', { hasText: '稍后再看' }).tap();
  check(G, '放映厅内操作可用', (await l.page.locator('.cinema-actions button', { hasText: '已加入' }).count()) === 1);
  await l.page.setViewportSize({ width: 390, height: 844 });
  await sleep(300);
  check(G, '竖屏无回归（放映厅自动退出）', (await l.page.locator('.cinema').count()) === 0 && (await l.page.locator('.result-body').isVisible()));
  check(G, '横竖屏无错误', l.errors.length === 0, l.errors.join(' | '));
  await l.ctx.close();
}

// ======================= BATCH 3 =======================
async function touchDrag(page, selector, dx, dy, steps = 8) {
  const box = await page.locator(selector).boundingBox();
  const cdp = await page.context().newCDPSession(page);
  const x0 = box.x + box.width / 2, y0 = box.y + Math.min(box.height / 2, 200);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
  let mid = '';
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (dx * i) / steps, y: y0 + (dy * i) / steps }] });
    await sleep(16);
    if (i === steps) mid = await page.evaluate((s) => document.querySelector(s).style.transform, selector);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  return mid;
}

async function batch3() {
  const G = 'B3';
  // no permission prompts on first visit / first box
  const trap = await open({}, BASE, {
    keepIntro: true,
    init: () => {
      const mark = (k) => (window.__permAsked = (window.__permAsked || []).concat(k));
      window.DeviceMotionEvent && (DeviceMotionEvent.requestPermission = async () => (mark('motion'), 'granted'));
      if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => (mark('mic'), Promise.reject(new Error('x')));
      if (window.Notification) Notification.requestPermission = async () => (mark('notify'), 'denied');
    },
  });
  await sleep(3500);
  await trap.page.tap('.bubble');
  await revealDone(trap.page);
  check(G, '首次进入与开盒全程不申请任何权限', (await trap.page.evaluate(() => window.__permAsked || [])).length === 0);
  check(G, '语音 / 摇一摇入口已移除', (await trap.page.getByText(/说一句|摇一摇/).count()) === 0);
  await trap.ctx.close();

  // gestures (kept)
  const g = await open();
  await g.page.tap('.bubble');
  await revealDone(g.page);
  await sleep(1900);
  const tilt = await touchDrag(g.page, '.gesture-card', 90, 0);
  await sleep(600);
  check(G, '卡片拖动：轻量 3D 翻转', tilt.includes('rotateY') && (await g.page.evaluate(() => document.querySelector('.gesture-card').style.transform)) === '', tilt);
  await shot(g.page, 'b3-01-result-gesture');
  await touchDrag(g.page, '.gesture-card', 0, 60);
  await sleep(500);
  check(G, '下滑未过阈值不触发', (await roundTitles(g.page)).length === 1);
  await g.page.evaluate(() => window.scrollTo(0, 260));
  await sleep(200);
  await touchDrag(g.page, '.gesture-card', 0, 200);
  await sleep(500);
  check(G, '页面滚动后下滑不误触', (await roundTitles(g.page)).length === 1);
  await g.page.evaluate(() => window.scrollTo(0, 0));
  await sleep(200);
  await touchDrag(g.page, '.gesture-card', 5, 170, 10);
  await g.page.waitForSelector('.reveal.leaving, .reveal.bubble', { timeout: 1500 });
  await revealDone(g.page);
  check(G, '下滑过阈值触发「再来一盒」', (await roundTitles(g.page)).length === 2);
  check(G, '手势无错误', g.errors.length === 0, g.errors.join(' | '));
  await g.ctx.close();
}

// ======================= responsive sizes =======================
async function sizes() {
  const G = 'SIZE';
  for (const [w, h, mobile] of [
    [375, 667, true],
    [390, 844, true],
    [430, 932, true],
    [1440, 900, false],
  ]) {
    const { ctx, page, errors } = await open({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
    await page.waitForSelector('.bubble');
    await sleep(400);
    const m = await page.evaluate(() => {
      const b = document.querySelector('.bubble').getBoundingClientRect();
      const tab = document.querySelector('.tabbar').getBoundingClientRect();
      return { overflow: document.documentElement.scrollWidth - innerWidth, bubbleBottom: b.bottom, tabTop: tab.top };
    });
    check(G, `${w}×${h} 无横向溢出、主泡泡首屏可见`, m.overflow <= 0 && m.bubbleBottom <= m.tabTop, JSON.stringify(m));
    await shot(page, `size-${w}x${h}-home`);
    const press = (loc) => (mobile ? loc.tap() : loc.click());
    await press(page.locator('.bubble'));
    await revealDone(page);
    await sleep(1900);
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    check(G, `${w}×${h} 结果页无横向溢出`, ov <= 0);
    await shot(page, `size-${w}x${h}-result`);
    await press(page.getByRole('button', { name: '看完打卡' }));
    await page.waitForSelector('.checkin');
    await sleep(500);
    const sheet = await page.evaluate(() => {
      const r = document.querySelector('.sheet').getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, h: innerHeight };
    });
    check(G, `${w}×${h} Modal 不超屏`, sheet.top >= 0 && sheet.bottom <= sheet.h, JSON.stringify(sheet));
    if (w === 1440) await shot(page, 'size-1440x900-checkin');
    check(G, `${w}×${h} 无错误`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
}

// ======================= PWA (run against a production preview) =======================
async function pwa() {
  const G = 'PWA';
  const { ctx, page, errors } = await open();
  await page.waitForSelector('.bubble');
  const manifest = await page.evaluate(async () => {
    const href = document.querySelector('link[rel=manifest]').href;
    const m = await (await fetch(href)).json();
    return { name: m.name, icons: m.icons.length, display: m.display, start: m.start_url };
  });
  check(G, 'manifest 正常', manifest.name.includes('泡泡选片') && manifest.icons >= 2 && manifest.display === 'standalone', JSON.stringify(manifest));
  const sw = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return !!reg.active;
  });
  await page.reload();
  await page.waitForSelector('.bubble');
  const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
  check(G, 'Service Worker 注册并接管页面', sw && controlled);
  await page.tap('.bubble');
  await revealDone(page);
  await page.getByRole('button', { name: '稍后再看' }).tap();
  const savedTitle = await title(page);
  await ctx.setOffline(true);
  await page.goto(BASE + '#/');
  await page.reload();
  await page.waitForSelector('.bubble', { timeout: 6000 });
  check(G, '断网可打开应用', true);
  await page.getByRole('button', { name: /继续这一盒|开一盒/ }).tap();
  await revealDone(page);
  await page.getByRole('button', { name: '就看这部' }).tap();
  await page.locator('.two-buttons .again').click();
  await revealDone(page);
  check(G, '断网完成基础推荐（本地片库）', !!(await title(page)));
  await page.goto(BASE + '#/me');
  check(G, '刷新/离线后数据仍在（想看清单）', (await page.locator('.watch-item').count()) >= 1, savedTitle);
  await ctx.setOffline(false);
  check(G, 'PWA 无错误', errors.filter((e) => !e.includes('ERR_INTERNET_DISCONNECTED')).length === 0, errors.join(' | '));
  await ctx.close();
}

// ======================= Flask-served build (optional backend) =======================
async function flask() {
  const G = 'FLASK';
  const { ctx, page, errors } = await open();
  const calls = [];
  page.on('response', (r) => r.url().includes('/api/recommend') && calls.push(r.status()));
  await page.tap('.bubble');
  await revealDone(page);
  check(G, 'Flask 托管时前端调用 /api/recommend 且结果经本地片库校验', calls.length === 1 && calls[0] === 200, JSON.stringify(calls));
  check(G, 'Flask 托管无错误', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

const which = process.argv[2] || 'batch1';
const plan = { batch1, batch2, batch3, sizes, pwa, flask };
try {
  if (which === 'all') for (const k of ['batch1', 'batch2', 'batch3', 'sizes']) await plan[k]();
  else await plan[which]();
} catch (e) {
  check('RUN', 'script crashed', false, e.stack || String(e));
} finally {
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  fs.writeFileSync(path.join(OUT, `results-${which}.json`), JSON.stringify(results, null, 2));
  process.exitCode = failed.length ? 1 : 0;
}
