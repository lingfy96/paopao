import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, useLocation, useNavigate } from 'react-router-dom';
import {
  Sparkles, Clapperboard, User, Heart, ChevronRight, ArrowLeft, Settings, Mic, Search, Bookmark, Share2, X, Check,
  Film, Sun, Moon, Volume2, VolumeX, Clock, Ticket, SlidersHorizontal, Trash2, Waves, Shuffle, Download, History,
} from 'lucide-react';
import movies from './movies.json';
import { mbtis, moods, allTags, choose, rank, quota } from './engine.js';
import storage from './lib/storage.js';
import { haptic, isMuted, onMuteChange, reducedMotion, setMuted, sfx, unlockAudio } from './lib/fx.js';
import { WEATHER, applyTheme, applyWeather, weatherFor } from './lib/weather.js';
import {
  FILTER_NAMES, GENRE_OPTIONS, PLATFORM_LABEL, activeCount, countFilteredMovies, normalizeFilters, platformsOf, relaxFilters,
} from './lib/filters.js';
import { HATCH_XP, SPECIES, feed as eggFeed, normalizeEgg, onOpen as eggOnOpen, speciesById } from './lib/egg.js';
import { weeklyStats } from './lib/stats.js';
import { dataUrlToFile, drawMoviePoster, drawShareCard, shareUrl } from './lib/canvas.js';
import Bubble from './components/Bubble';
import { RevealPhase, SsrOverlay } from './components/Reveal';
import Aquarium, { CreatureSvg, EggSvg } from './components/Aquarium';
import { CheckinForm, Memory, MemoryCard, Wall } from './components/Memories';
import Intro from './components/Intro';
import { useLandscape } from './components/Cinema';
import MovieShowcaseResult from './components/MovieShowcaseResult';
import { getMovieTheme, showcaseVariables, SHOWCASE_TIMING } from './lib/showcase.js';
import BlacklistTearSheet from './components/BlacklistTearSheet';
import BottomSheet from './components/BottomSheet';
import LibraryFilterSheet from './components/LibraryFilterSheet';
import { blacklistId } from './lib/blacklist.js';
import PaopaoAssistant from './components/PaopaoAssistant';
import { emit as assistantEmit } from './lib/assistantEvents.js';
import './style.css';

type Movie = (typeof movies)[number] & { reason?: string; rarity?: string; score?: number; hits?: number };

const DAILY = 5;
const ROUND_MAX = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const byId = new Map(movies.map((m) => [m.id, m]));
const PARENT: Record<string, string> = {
  '/mbti': '/', '/mood': '/', '/result': '/', '/share': '/', '/profile': '/me', '/couple': '/me', '/aquarium': '/me',
  '/memories': '/me', '/history': '/me',
};
const apiEnabled = () => (window as any).__PAOPAO_API__ === 1 || import.meta.env.VITE_USE_API === '1';
const validRound = (list: any[]) => list.filter((m) => m && typeof m.id === 'number' && byId.has(m.id) && m.title);

function App() {
  const nav = useNavigate();
  const loc = useLocation();
  const page = loc.pathname;

  // ---------- persisted state (all through storage.js) ----------
  const [profile, setProfile] = useState(() => storage.getProfile('profile'));
  const [partner, setPartner] = useState(() => storage.getProfile('partner'));
  const [mode, setMode] = useState<string>(() => {
    const m = storage.get('mode', 'mood');
    return ['mood', 'mbti', 'random'].includes(m) ? m : 'mood';
  });
  const [mood, setMood] = useState<string>(() => {
    const m = storage.get('mood', '有点 emo');
    return moods[m] ? m : '有点 emo';
  });
  const [mbti, setMbti] = useState<string>(() => {
    const m = storage.get('mbti', 'INFP');
    return mbtis[m] ? m : 'INFP';
  });
  const [text, setText] = useState('');
  const [couple, setCouple] = useState<boolean>(() => storage.get('couple', false));
  const [q, setQ] = useState(() => quota(storage.get('quota', null)));
  const [round, setRound] = useState<Movie[]>(() => validRound(storage.get('round', [])));
  const [selected, setSelected] = useState(() => Math.max(0, validRound(storage.get('round', [])).length - 1));
  const [locked, setLocked] = useState<boolean>(() => storage.get('locked', false));
  const [history, setHistory] = useState<any[]>(() => storage.get('history', []).filter((h) => h && typeof h.id === 'number'));
  const [favorites, setFavorites] = useState<number[]>(() => storage.get('favorites', []).filter((n) => typeof n === 'number'));
  const [egg, setEgg] = useState(() => normalizeEgg(storage.get('egg', null), storage.get('pet', null)));
  const [watchlist, setWatchlist] = useState<{ id: number; addedAt: string }[]>(() => storage.getWatchlist());
  const [memories, setMemories] = useState<Memory[]>(() => storage.getMemories());
  const [filters, setFilters] = useState(() => normalizeFilters(storage.get('filters', null)));
  const [theme, setTheme] = useState<'dark' | 'light'>(() => (storage.get('theme', 'dark') === 'light' ? 'light' : 'dark'));
  const [muted, setMutedState] = useState(isMuted());

  // ---------- session state ----------
  const [sheet, setSheet] = useState('');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState<{ phase: RevealPhase }>({ phase: 'done' });
  const [ssr, setSsr] = useState(0);
  const [query, setQuery] = useState('');
  const [onlyFav, setOnlyFav] = useState(false);
  const [editing, setEditing] = useState('profile');
  const [draft, setDraft] = useState('');
  const [onboard, setOnboard] = useState(1);
  const [poster, setPoster] = useState<{ url: string; title: string } | null>(null);
  const [posterBusy, setPosterBusy] = useState(false);
  const [source, setSource] = useState('本地灵感匹配');
  const [resultError, setResultError] = useState('');
  const [checkinFor, setCheckinFor] = useState<number | undefined>();
  const [newborn, setNewborn] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState('');
  const [intro, setIntro] = useState(true);
  const landscape = useLandscape();
  const guard = useRef(false);
  const toastTimer = useRef(0);
  const sheetPushed = useRef(false);
  const afterClose = useRef<string | null>(null);
  const navRef = useRef(nav);
  navRef.current = nav;

  const current: Movie | undefined = round[selected] || round[0];
  const active = editing === 'partner' ? partner : profile;
  const left = Math.max(0, DAILY + q.bonus - q.used);
  const weather = weatherFor(mode, mood);
  const inWatch = (id: number) => watchlist.some((w) => w.id === id);
  const isFav = (id: number) => favorites.includes(id);

  // ---------- persistence ----------
  useEffect(() => void storage.saveProfile(profile, 'profile'), [profile]);
  useEffect(() => void storage.saveProfile(partner, 'partner'), [partner]);
  useEffect(() => void storage.set('quota', q), [q]);
  useEffect(() => void storage.set('round', round), [round]);
  useEffect(() => void storage.set('locked', locked), [locked]);
  useEffect(() => void storage.set('history', history), [history]);
  useEffect(() => void storage.set('favorites', favorites), [favorites]);
  useEffect(() => void storage.set('egg', egg), [egg]);
  useEffect(() => void storage.saveWatchlist(watchlist), [watchlist]);
  useEffect(() => void storage.saveMemories(memories), [memories]);
  useEffect(() => void storage.set('filters', filters), [filters]);
  useEffect(() => void storage.set('mode', mode), [mode]);
  useEffect(() => void storage.set('mood', mood), [mood]);
  useEffect(() => void storage.set('mbti', mbti), [mbti]);
  useEffect(() => void storage.set('couple', couple), [couple]);
  useEffect(() => {
    storage.set('theme', theme);
    applyTheme(theme);
  }, [theme]);
  useEffect(() => applyWeather(weather), [weather]);
  useEffect(() => onMuteChange(setMutedState), []);

  useEffect(() => {
    const timer = setInterval(() => setQ((x) => quota(x)), 10000);
    if (import.meta.env.PROD && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
    const onDown = (e: PointerEvent) => {
      unlockAudio();
      const t = e.target as HTMLElement;
      if (t?.closest?.('button:not(.bubble):not(:disabled),a,label.photo-pick')) haptic(8);
    };
    document.addEventListener('pointerdown', onDown, { passive: true });
    return () => {
      clearInterval(timer);
      document.removeEventListener('pointerdown', onDown);
    };
  }, []);

  // ---------- sheets + back behaviour: back closes the sheet first ----------
  function openSheet(name: string) {
    setSheet(name);
    setConfirmDelete('');
    if (!sheetPushed.current) {
      try {
        window.history.pushState({ ...(window.history.state || {}), ppSheet: 1 }, '');
        sheetPushed.current = true;
      } catch {
        /* ignore */
      }
    }
  }
  function closeSheet(then?: string) {
    setSheet('');
    if (sheetPushed.current) {
      sheetPushed.current = false;
      afterClose.current = then || null;
      try {
        window.history.back();
      } catch {
        if (then) nav(then);
      }
    } else if (then) nav(then);
  }
  useEffect(() => {
    const onPop = () => {
      if (sheetPushed.current) {
        sheetPushed.current = false;
        setSheet('');
        return;
      }
      const target = afterClose.current;
      afterClose.current = null;
      if (target) setTimeout(() => navRef.current(target), 0);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && sheetPushed.current) closeSheet();
    };
    window.addEventListener('popstate', onPop);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  useEffect(() => {
    if (page === '/pet') nav('/aquarium', { replace: true });
  }, [page]);

  function notify(s: string) {
    clearTimeout(toastTimer.current);
    setToast(s);
    toastTimer.current = window.setTimeout(() => setToast(''), 2600);
  }

  function back() {
    if (page === '/profile' && editing === 'partner') return nav('/couple');
    nav(PARENT[page] || '/');
  }

  function chooseMood(next: string) {
    setMood(next);
    setMode('mood');
    assistantEmit('mood:selected', next);
  }

  // ---------- recommendation: mode → profile/mood → filters → blacklist/exclude → engine ----------
  function pick(p: any, newRound: boolean) {
    const attempts = [p];
    if (newRound && p.exclude.length) attempts.push({ ...p, exclude: [] });
    if (p.text) attempts.push({ ...p, text: '' }, { ...p, text: '', exclude: newRound ? [] : p.exclude });
    for (const a of attempts) {
      const { pool, relaxed } = relaxFilters(movies, filters, (pl: any[]) => rank(pl, a).length > 0);
      if (!rank(pool, a).length) continue;
      return { result: choose(pool, a) as Movie, pool, p: a, loosened: relaxed.length > 0 || a.text !== p.text };
    }
    return null;
  }

  async function tryApi(p: any, pool: any[]) {
    if (!apiEnabled()) return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1500);
    try {
      const response = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p),
        signal: ctrl.signal,
      });
      if (!response.ok) return null;
      const data = await response.json();
      const safe = rank(pool, p).find((x: any) => x.id === data.movie?.id);
      return safe ? { result: { ...safe, reason: data.reason || safe.reason }, source: data.source === 'ai' ? 'AI 为你推荐' : '本地灵感匹配' } : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  function celebrate(born: any[]) {
    if (!born.length) return;
    setNewborn(born.map((b) => b.id));
    const names = born.map((b) => speciesById[b.species]?.name).join('、');
    setTimeout(() => {
      sfx.hatch();
      haptic([20, 30, 20]);
      notify(`故事蛋孵化啦！${names} 游进了水族箱`);
    }, 900);
  }

  async function open(retry = false) {
    if (guard.current) return;
    if (retry && !locked && round.length >= ROUND_MAX) return notify('这一盒的 3 张卡都翻开了，选一部锁定吧');
    const newRound = !retry || locked;
    if (!retry && round.length && !locked) {
      nav('/result');
      return notify('先在这一盒里选定一部，再开下一盒');
    }
    const fresh = quota(q);
    setQ(fresh);
    if (newRound && fresh.used >= DAILY + fresh.bonus) return notify('今天的 5 盒都开完啦，明天再来');
    const base = { mode, mood, mbti, text, profile, partner, couple, exclude: round.map((x) => x.id) };
    setResultError('');
    const picked = pick(base, newRound);
    if (!picked) {
      const message = '暂时没有符合条件的新电影，试试调整心情或画像。';
      setResultError(message);
      return notify(message);
    }

    guard.current = true;
    setBusy(true);
    const fast = reducedMotion();
    const previous = current;
    try {
      setReveal({ phase: retry ? 'leaving' : 'silhouette' });
      if (!retry) nav('/result');
      const started = Date.now();
      const api = await tryApi(picked.p, picked.pool);
      const result: Movie = api ? (api.result as Movie) : picked.result;
      setSource(api ? api.source : '本地灵感匹配');
      const preparation = fast ? SHOWCASE_TIMING.reduced : retry ? SHOWCASE_TIMING.pending : SHOWCASE_TIMING.prepare;
      await sleep(Math.max(0, preparation - (Date.now() - started)));
      // The original SSR effect hands off to the theme/card; subsequent cards stay quick.
      if (!retry && result.rarity === 'SSR') {
        setSsr(Date.now());
        sfx.ssr();
        haptic([30, 40, 30, 40, 90]);
        await sleep(fast ? 0 : SHOWCASE_TIMING.ssrLead);
      }

      const next = newRound ? [result] : [...round, result];
      setRound(next);
      setSelected(next.length - 1);
      setLocked(false);
      setHistory((h) => [{ ...result, date: new Date().toISOString(), couple }, ...h].slice(0, 100));
      if (!newRound && previous) storage.set('rejected', [previous.id, ...storage.get('rejected', [])].slice(0, 50));
      if (newRound) {
        setQ({ ...fresh, used: fresh.used + 1 });
        const { egg: grown, born } = eggOnOpen(egg, { couple, rarity: result.rarity });
        setEgg(grown);
        celebrate(born);
      }
      setReveal({ phase: 'flip' });
      sfx.flip();
      await sleep(fast ? SHOWCASE_TIMING.reduced : retry ? SHOWCASE_TIMING.switch : SHOWCASE_TIMING.reveal);
      setReveal({ phase: 'done' });
      assistantEmit('movie:revealed', { id: result.id, title: result.title, rarity: result.rarity });
      if (result.rarity === 'SR') haptic(24);
      if (picked.loosened) notify('没有完全符合的，已为你悄悄放宽一点条件');
    } catch {
      setResultError('这次没能抽出新电影，请再试一次。');
      notify('这次没能抽出新电影，请再试一次');
    } finally {
      setReveal((r) => (r.phase === 'done' ? r : { phase: 'done' }));
      setBusy(false);
      guard.current = false;
    }
  }

  async function selectResult(index: number) {
    if (guard.current || locked || index === selected || !round[index]) return;
    guard.current = true;
    setBusy(true);
    setResultError('');
    try {
      setSelected(index);
      setReveal({ phase: 'flip' });
      await sleep(reducedMotion() ? SHOWCASE_TIMING.reduced : SHOWCASE_TIMING.switch);
    } finally {
      setReveal({ phase: 'done' });
      setBusy(false);
      guard.current = false;
    }
  }

  // ---------- list actions ----------
  function toggleWatch(m: { id: number }) {
    if (inWatch(m.id)) {
      setWatchlist((w) => w.filter((x) => x.id !== m.id));
      notify('已移出稍后再看');
    } else {
      setWatchlist((w) => [{ id: m.id, addedAt: new Date().toISOString() }, ...w.filter((x) => x.id !== m.id)]);
      notify('已加入稍后再看');
      assistantEmit('watchlist:added', { id: m.id });
    }
  }
  function toggleFav(m: { id: number }) {
    const had = isFav(m.id);
    setFavorites((f) => (had ? f.filter((id) => id !== m.id) : [...f, m.id]));
    notify(had ? '已取消收藏' : '已收藏这个故事');
  }
  function openCheckin(id?: number) {
    setCheckinFor(id);
    openSheet('checkin');
  }
  function saveMemory(m: Memory) {
    setMemories((list) => [m, ...list.filter((x) => x.id !== m.id)]);
    setWatchlist((w) => w.filter((x) => x.id !== m.movieId));
    sfx.hatch();
    haptic([15, 30, 15]);
    notify(m.kind === 'ticket' ? '机票票根已贴上纪念墙' : '观影邮票已贴上纪念墙');
    assistantEmit('checkin:success', { movieId: m.movieId });
    closeSheet('/memories');
  }
  function deleteMemory(m: Memory) {
    if (confirmDelete !== m.id) return setConfirmDelete(m.id);
    setMemories((list) => list.filter((x) => x.id !== m.id));
    if (m.imageKey) storage.removeImage(m.imageKey);
    closeSheet();
    notify('已从纪念墙取下');
  }
  function feedEgg() {
    if (!egg.food) return notify('开一盒就能获得新的故事食物');
    const { egg: grown, born } = eggFeed(egg);
    setEgg(grown);
    sfx.tap();
    if (born.length) celebrate(born);
    else notify('嗷呜！故事蛋又长大了一点');
  }

  // ---------- share ----------
  async function makePoster(kind: 'app' | 'movie') {
    if (posterBusy) return;
    if (kind === 'movie' && !current) return;
    setPosterBusy(true);
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 16)));
    const url = kind === 'app' ? drawShareCard({ a: weather.a, b: weather.b }) : drawMoviePoster(current, { a: weather.a, b: weather.b });
    setPosterBusy(false);
    if (!url) return notify('分享卡没画好，直接把链接发给朋友吧');
    setPoster({ url, title: kind === 'app' ? '分享给朋友' : '今晚的电影卡' });
    nav('/share');
  }
  async function doShare() {
    if (!poster) return;
    const file = await dataUrlToFile(poster.url, '泡泡选片.png');
    try {
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: '泡泡选片 PAOPAO SELECT' });
        return;
      }
      if (navigator.share) {
        await navigator.share({ title: '泡泡选片 PAOPAO SELECT', text: '今晚的好故事，藏在下一张卡里', url: shareUrl() });
        return;
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
    }
    try {
      const a = document.createElement('a');
      a.href = poster.url;
      a.download = '泡泡选片.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      notify('图片已保存，也可以长按图片发给朋友');
    } catch {
      notify('长按图片即可保存或发送给朋友');
    }
  }

  // ---------- profile editing (kept from original) ----------
  function update(v: any) {
    editing === 'partner' ? setPartner(v) : setProfile(v);
  }
  function toggleTag(t: string) {
    update({ ...active, tags: active.tags.includes(t) ? active.tags.filter((x) => x !== t) : [...active.tags, t] });
  }
  function finishOnboard() {
    storage.set('onboard', true);
    setDraft('');
    closeSheet();
  }

  const stats = useMemo(() => weeklyStats(memories, history, movies), [memories, history]);
  const candidates = useMemo(() => {
    const seen = new Set<number>();
    const out: Movie[] = [];
    const add = (m?: any) => {
      const full = m && byId.get(m.id);
      if (full && !seen.has(full.id)) {
        seen.add(full.id);
        out.push(full);
      }
    };
    round.forEach(add);
    watchlist.forEach(add);
    history.forEach(add);
    favorites.forEach((id) => add({ id }));
    movies.forEach(add);
    return out;
  }, [round, watchlist, history, favorites]);

  const matchQuery = (m: Movie) => (!onlyFav || isFav(m.id)) && [m.title, ...m.actors, ...m.tags].join().includes(query.trim());
  const library = useMemo(() => {
    const { pool, relaxed } = relaxFilters(movies, filters, (pl: Movie[]) => pl.some(matchQuery));
    return { list: pool.filter(matchQuery), relaxed };
  }, [filters, query, onlyFav, favorites]);
  const filterCount = activeCount(filters);

  // ---------- small render helpers ----------
  const backHeader = (title: string, right?: React.ReactNode) => (
    <div className="subheader">
      <button className="icon-btn" aria-label="返回" onClick={back}>
        <ArrowLeft size={21} />
      </button>
      <h2>{title}</h2>
      {right || <span className="spacer" />}
    </div>
  );
  const chips = (items: string[], chosen: string[], fn: (t: string) => void, label?: (t: string) => React.ReactNode) => (
    <div className="chips">
      {items.map((t) => (
        <button key={t} className={chosen.includes(t) ? 'chip selected' : 'chip'} aria-pressed={chosen.includes(t)} onClick={() => fn(t)}>
          {label ? label(t) : t}
        </button>
      ))}
    </div>
  );
  const poster3 = (m: any, cls = 'mini-poster') => (
    <div className={cls} style={{ '--h': (m.id * 33) % 360 } as any}>
      {m.id === 2 ? (
        <img src={`${import.meta.env.BASE_URL}good-will-hunting.jpg`} alt="心灵捕手电影海报" loading="lazy" />
      ) : (
        <>
          <Film />
          <b>{m.title.slice(0, 6)}</b>
        </>
      )}
    </div>
  );
  const movieRow = (m: any, extra?: React.ReactNode) => (
    <div className="movie-row">
      {poster3(m)}
      <div>
        <h3>{m.title}</h3>
        <p>{m.tags.slice(0, 3).join(' · ')}</p>
        <small>
          {m.year ? `${m.year} · ` : ''}
          {m.type} · {m.duration} 分钟{m.type === '剧集' ? ' / 集' : ''}
        </small>
      </div>
      {extra ?? <strong className="gold">{m.rating.toFixed(1)}</strong>}
    </div>
  );
  const toggleGenre = (g: string) =>
    setFilters((f) => ({ ...f, genre: g === '全部' ? [] : f.genre.includes(g) ? f.genre.filter((x) => x !== g) : [...f.genre, g] }));

  const renderProfile = () => (
    <>
      <h3>偏爱的类型</h3>
      {chips(allTags, active.tags, toggleTag)}
      {(['actors'] as const).map((key) => (
        <section className="profile-section" key={key}>
          <h3>喜欢的演员</h3>
          <p className="muted">演员姓名精确匹配，多个名字可用逗号分隔。</p>
          <div className="chips">
            {active[key].map((t) => (
              <button className="chip" key={t} aria-label={`移除 ${t}`} onClick={() => update({ ...active, [key]: active[key].filter((x) => x !== t) })}>
                {t}
                <X size={14} />
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const input = e.currentTarget.elements.namedItem('entry') as HTMLInputElement;
              const value = input.value.trim();
              if (value) {
                update({ ...active, [key]: [...new Set([...active[key], ...value.split(/[,，、]/).map((x) => x.trim()).filter(Boolean)])] });
                input.value = '';
                notify('已保存');
              }
            }}
          >
            <input name="entry" placeholder="添加演员姓名" />
            <button type="submit">添加</button>
          </form>
        </section>
      ))}
      <BlacklistTearSheet key={editing} items={active.blacklist} onChange={(change) => {
        const setter = editing === 'partner' ? setPartner : setProfile;
        setter((p) => {
          const blacklist = change(p.blacklist);
          return { ...p, blacklist };
        });
      }} />
      <p className="muted">修改自动保存，只保存在这台设备上。</p>
    </>
  );

  // The assistant may only ever see films the existing engine would really offer:
  // filters plus both blacklists are applied here, before anything reaches the AI proxy.
  const aiCandidates = useMemo(() => {
    const base = { mode, mood, mbti, text, profile, partner, couple, exclude: [] as number[] };
    const { pool } = relaxFilters(movies, filters, (list: any[]) => rank(list, base).length > 0);
    return rank(pool, base).slice(0, 12);
  }, [mode, mood, mbti, text, profile, partner, couple, filters]);

  const recentTags = useMemo(() => {
    const tally = new Map<string, number>();
    history.slice(0, 12).forEach((h) => (byId.get(h.id)?.tags || []).forEach((t) => tally.set(t, (tally.get(t) || 0) + 1)));
    return [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([tag]) => tag);
  }, [history]);

  // Rebuilt every render on purpose: each handler delegates to the existing business action
  // with current state, so the assistant can never persist data through its own path.
  const assistantActions: Record<string, (params: any) => void> = {
    rerollMovie: () => void open(page === '/result' && (locked || round.length < ROUND_MAX)),
    setMood: ({ mood: next }) => chooseMood(next),
    addWatchlist: ({ movieId }) => void (byId.get(movieId) && !inWatch(movieId) && toggleWatch({ id: movieId })),
    removeWatchlist: ({ movieId }) => void (inWatch(movieId) && toggleWatch({ id: movieId })),
    openMovie: ({ movieId }) => void (byId.get(movieId) && openSheet('movie:' + movieId)),
    openCheckin: ({ movieId }) => openCheckin(byId.get(movieId) ? movieId : current?.id),
    openBlacklistAdd: ({ type, name }) => {
      setProfile((p) => ({ ...p, blacklist: [...p.blacklist, { id: blacklistId(), type, name }] }));
      setEditing('profile');
      nav('/profile');
      notify(`已把「${name}」加入黑名单，可以随时撕掉`);
    },
  };

  const section = page === '/library' ? '/library' : ['/', '/mbti', '/mood', '/result', '/share'].includes(page) ? '/' : '/me';
  const phase = reveal.phase;
  const revealing = phase !== 'done';
  const againLabel = !locked && round.length >= ROUND_MAX ? '本盒已翻完' : '再来一张';
  const showcaseActive = page === '/result' && (!!current || revealing);
  const movieTheme = getMovieTheme(current, mode === 'mood' ? mood : '', theme);
  const lockCurrent = () => {
    setLocked(true);
    haptic([12, 40, 12]);
    notify('今晚就看这部！看完记得回来打卡');
  };

  return (
    <div className={`app route-${page.slice(1) || 'home'} ${landscape ? 'landscape' : ''} ${showcaseActive ? 'showcase-active' : ''}`}
      style={showcaseActive ? showcaseVariables(movieTheme) as React.CSSProperties : undefined}>
      {showcaseActive && <div className="showcase-background" aria-hidden />}
      <div className="weather" aria-hidden>
        <span className="w1" />
        <span className="w2" />
        <span className="w3" />
      </div>
      <aside className="desktop-brand">
        <span className="brand-mark big" aria-hidden />
        <h1>
          泡泡选片<span>PAOPAO SELECT</span>
        </h1>
        <p>
          今晚的好故事，
          <br />
          藏在下一张卡里。
        </p>
        <div className="side-ticket">
          ADMIT ONE <span>✧</span> A LITTLE SERENDIPITY
        </div>
        <p className="side-hint">用手机扫码体验更佳 · 按住泡泡，啵一声开盒</p>
      </aside>
      <main>
        <header className="topbar">
          <button className="logo" onClick={() => nav('/')} aria-label="泡泡选片首页">
            <span className="brand-mark" aria-hidden />
            <span className="logo-text">
              泡泡选片<small>PAOPAO SELECT</small>
            </span>
          </button>
          <div className="top-actions">
            <button className="icon-btn" aria-label={muted ? '打开音效' : '静音'} aria-pressed={muted} onClick={() => setMuted(!muted)}>
              {muted ? <VolumeX size={19} /> : <Volume2 size={19} />}
            </button>
            <button className="icon-btn" aria-label={theme === 'dark' ? '切换到浅色' : '切换到深色'} onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}>
              {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
            </button>
          </div>
        </header>

        <div className="page" key={page}>
          {page === '/' && (
            <div className="home">
              <div className="home-title">
                <div className="eyebrow">今晚看什么？</div>
                <h1>
                  按住泡泡，<span>吹出今晚的故事</span>
                </h1>
              </div>
              <div className="mode-bar">
                <div className="seg" role="tablist" aria-label="推荐模式">
                  {[
                    ['mood', '心情'],
                    ['mbti', '人格'],
                    ['random', '随缘'],
                  ].map(([id, label]) => (
                    <button key={id} role="tab" aria-selected={mode === id} className={mode === id ? 'on' : ''} onClick={() => setMode(id)}>
                      {label}
                    </button>
                  ))}
                </div>
                <button className={`duo ${couple ? 'on' : ''}`} aria-pressed={couple} onClick={() => setCouple((c) => !c)}>
                  <Heart size={15} fill={couple ? 'currentColor' : 'none'} />
                  {couple ? '两个人' : '一个人'}
                </button>
              </div>
              <div className="context-row">
                {mode === 'mood' && (
                  <div className="mood-scroll" role="listbox" aria-label="此刻心情">
                    {Object.keys(WEATHER).map((k) => (
                      <button key={k} role="option" aria-selected={mood === k} className={`mood-chip ${mood === k ? 'on' : ''}`} onClick={() => chooseMood(k)}>
                        <i aria-hidden>{WEATHER[k].icon}</i>
                        {WEATHER[k].label}
                      </button>
                    ))}
                    <button className="mood-chip say" onClick={() => nav('/mood')}>
                      <Mic size={14} />
                      说说想看什么
                    </button>
                  </div>
                )}
                {mode === 'mbti' && (
                  <button className="context-btn" onClick={() => nav('/mbti')}>
                    <span>人格频率</span>
                    <b>
                      {mbti} · {mbtis[mbti][0]}
                    </b>
                    <ChevronRight size={17} />
                  </button>
                )}
                {mode === 'random' && (
                  <div className="context-btn static">
                    <span>
                      <Shuffle size={15} /> 让宇宙决定
                    </span>
                    <b>黑名单照样生效</b>
                  </div>
                )}
              </div>
              {text && (
                <div className="text-pill">
                  <span>“{text}”</span>
                  <button aria-label="清除这句要求" onClick={() => setText('')}>
                    <X size={14} />
                  </button>
                </div>
              )}
              <Bubble
                onOpen={() => open()}
                disabled={busy}
                couple={couple && !(round.length && !locked)}
                idleLabel={round.length && !locked ? '继续这一盒' : couple ? '一起开盒' : '开一盒'}
                hint={couple ? '两人各按一半 · 一人也能开' : '按住吹泡泡 · 轻点也能开'}
              />
              <div className="quota-line">
                <span>
                  今日还可开 <b>{left}</b> 盒
                </span>
                {filterCount > 0 && (
                  <button className="pill" onClick={() => nav('/library')}>
                    <SlidersHorizontal size={13} />
                    筛选 {filterCount} 项
                  </button>
                )}
                {couple && (
                  <button className="pill" onClick={() => nav('/couple')}>
                    <Heart size={13} />
                    两人画像
                  </button>
                )}
              </div>
              <div className="home-links">
                <button
                  className="link-card"
                  onClick={() => {
                    setOnboard(1);
                    setEditing('profile');
                    openSheet('onboard');
                  }}
                >
                  <Sparkles size={19} />
                  <div>
                    <b>{profile.tags.length ? '调整我的口味' : '想更懂我？'}</b>
                    <small>{profile.tags.length ? profile.tags.slice(0, 3).join(' / ') : '花 30 秒设置，可跳过'}</small>
                  </div>
                  <ChevronRight size={17} />
                </button>
                <button className={`link-card ${posterBusy ? 'processing' : ''}`} onClick={() => makePoster('app')} aria-busy={posterBusy}>
                  <Share2 size={19} />
                  <div>
                    <b>分享给朋友</b>
                    <small>{posterBusy ? '正在生成分享卡…' : '带二维码的分享卡'}</small>
                  </div>
                  <ChevronRight size={17} />
                </button>
              </div>
              <button className="egg-banner" onClick={() => nav('/aquarium')}>
                <EggSvg xp={egg.xp} />
                <div>
                  <b>
                    故事蛋 · {egg.xp}/{HATCH_XP}
                  </b>
                  <small>{egg.creatures.length ? `水族箱里已有 ${egg.creatures.length} 位伙伴` : '开盒就能喂养，孵化出海洋伙伴'}</small>
                  <span className="bar">
                    <i style={{ width: `${(egg.xp / HATCH_XP) * 100}%` }} />
                  </span>
                </div>
                <ChevronRight size={18} />
              </button>
            </div>
          )}

          {page === '/mbti' && (
            <>
              {backHeader('找到你的人格频率')}
              <p className="intro">不定义你，只是多懂你一点。</p>
              <div className="mbti-grid">
                {Object.entries(mbtis).map(([id, v]: any) => (
                  <button
                    className={'mbti ' + (id === mbti ? 'selected' : '')}
                    key={id}
                    onClick={() => {
                      setMbti(id);
                      setMode('mbti');
                      nav('/');
                    }}
                  >
                    <strong>{id}</strong>
                    <b>{v[0]}</b>
                    <small>{v[1]}</small>
                  </button>
                ))}
              </div>
            </>
          )}

          {page === '/mood' && (
            <>
              {backHeader('今晚什么心情？')}
              <div className="mood-intro">
                每一种情绪，
                <br />
                <em>都有一个故事接住它。</em>
              </div>
              {chips(
                Object.keys(moods),
                mode === 'mood' ? [mood] : [],
                chooseMood,
                (m) => (
                  <>
                    <i aria-hidden>{WEATHER[m]?.icon}</i>
                    {m}
                  </>
                ),
              )}
              <label className="field-label" htmlFor="wish">
                也可以，直接告诉泡泡
              </label>
              <div className="text-area">
                <textarea id="wish" value={text} maxLength={200} onChange={(e) => setText(e.target.value)} placeholder="例如：来部悬疑，2小时以内，别太烧脑" />              </div>
              <p className="muted">支持类型、时长、高分与烧脑度约束</p>
              <button className="primary" onClick={() => nav('/')}>
                带着这个心情开盒 <ChevronRight size={18} />
              </button>
            </>
          )}

          {page === '/result' &&
            (current || revealing ? (
              <>
                {backHeader('今晚的放映')}
                <MovieShowcaseResult movie={current} phase={phase} busy={busy}
                  mood={mode === 'mood' ? mood : ''} themeMode={theme} source={source}
                  round={round} selected={selected} roundMax={ROUND_MAX} locked={locked}
                  inWatch={!!current && inWatch(current.id)} favorite={!!current && isFav(current.id)}
                  againLabel={againLabel} againDisabled={!locked && round.length >= ROUND_MAX}
                  posterBusy={posterBusy} error={resultError}
                  onAgain={() => open(true)} onSelect={selectResult}
                  onWatch={() => current && toggleWatch(current)} onCheckin={() => current && openCheckin(current.id)}
                  onFavorite={() => current && toggleFav(current)} onShare={() => makePoster('movie')}
                  onLock={lockCurrent} onWhere={() => openSheet('watch')} />
              </>
            ) : (
              <div className="empty">
                <Clapperboard size={42} />
                <p>还没有拆开的故事</p>
                <button className="primary" onClick={() => nav('/')}>
                  去开一盒
                </button>
              </div>
            ))}

          {page === '/share' && (
            <>
              {backHeader(poster?.title || '分享卡')}
              {poster ? (
                <>
                  <img className="share-poster" src={poster.url} alt="泡泡选片分享卡" />
                  <button className="primary" onClick={doShare}>
                    <Share2 size={18} />
                    分享 / 保存图片
                  </button>
                  <p className="muted center">微信里可以直接长按图片保存或发送</p>
                </>
              ) : (
                <div className="empty">
                  <p>分享卡还没有生成</p>
                  <button className="primary" onClick={() => makePoster('app')}>
                    <Download size={18} />
                    生成分享卡
                  </button>
                </div>
              )}
            </>
          )}

          {page === '/library' && (
            <>
              <div className="section-heading">
                <h1>故事放映厅</h1>
                <button className={`pill ${filterCount ? 'on' : ''}`} onClick={() => openSheet('filters')}>
                  <SlidersHorizontal size={14} />
                  筛选{filterCount ? ` · ${filterCount}` : ''}
                </button>
              </div>
              <div className="search">
                <Search size={19} />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索片名、演员或类型" aria-label="搜索" />
                {query && (
                  <button className="icon-btn" aria-label="清空搜索" onClick={() => setQuery('')}>
                    <X size={16} />
                  </button>
                )}
              </div>
              <div className="scroll-chips">
                <div className="chips">
                  <button className={onlyFav ? 'chip selected' : 'chip'} aria-pressed={onlyFav} onClick={() => setOnlyFav((v) => !v)}>
                    <Bookmark size={14} fill={onlyFav ? 'currentColor' : 'none'} />
                    收藏
                  </button>
                  {GENRE_OPTIONS.map((g) => {
                    const on = g === '全部' ? !filters.genre.length : filters.genre.includes(g);
                    return (
                      <button key={g} className={on ? 'chip selected' : 'chip'} aria-pressed={on} onClick={() => toggleGenre(g)}>
                        {g}
                      </button>
                    );
                  })}
                </div>
              </div>
              <p className="muted small-note">
                {library.relaxed.length
                  ? `没有完全符合的，已放宽「${library.relaxed.map((k) => FILTER_NAMES[k]).join('、')}」`
                  : `${library.list.length} 部 · 评分为演示片库参考值，平台仅提供搜索入口`}
              </p>
              {library.list.map((m) => (
                <button className="movie-button" key={m.id} onClick={() => openSheet('movie:' + m.id)}>
                  {movieRow(m)}
                </button>
              ))}
              {!library.list.length && (
                <div className="empty">
                  <Film size={42} />
                  <h3>这里还没有故事</h3>
                  <p>{onlyFav ? '收藏喜欢的影片，它们会出现在这里。' : '试试其他关键词。'}</p>
                </div>
              )}
            </>
          )}

          {page === '/me' && (
            <>
              <h1 className="page-title">我的放映室</h1>
              <div className="profile-card">
                <span className="avatar big">
                  <User />
                </span>
                <div>
                  <h2>故事收藏家</h2>
                  <p>{profile.tags.length ? profile.tags.join(' / ') : '每一个偏好，都让泡泡更懂你'}</p>
                </div>
                <button
                  className="icon-btn"
                  aria-label="编辑画像"
                  onClick={() => {
                    setEditing('profile');
                    nav('/profile');
                  }}
                >
                  <Settings size={20} />
                </button>
              </div>

              <section className="card stats-card">
                <header>
                  <h2>本周观影</h2>
                  <small>周一至周日</small>
                </header>
                <div className="stat-nums">
                  <div>
                    <b>{stats.watched}</b>
                    <span>部已看</span>
                  </div>
                  <div>
                    <b>{stats.opened}</b>
                    <span>次开盒</span>
                  </div>
                  <div>
                    <b>{Math.round((stats.minutes / 60) * 10) / 10}</b>
                    <span>小时</span>
                  </div>
                </div>
                <div className="week-bars" aria-label="本周每日观影">
                  {stats.days.map((d) => (
                    <div key={d.key} className={d.key === new Date().toLocaleDateString('en-CA') ? 'today' : ''}>
                      <i style={{ height: `${Math.min(100, d.count * 34 + 6)}%` }} />
                      <small>{d.label}</small>
                    </div>
                  ))}
                </div>
                {stats.distribution.length ? (
                  <div className="genre-bars">
                    {stats.distribution.map((g) => (
                      <div key={g.tag} className="gbar">
                        <span>{g.tag}</span>
                        <i>
                          <em style={{ width: `${(g.count / stats.distribution[0].count) * 100}%` }} />
                        </i>
                        <b>{g.count}</b>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted">本周还没有打卡。看完一部，回来贴一张纪念卡吧。</p>
                )}
              </section>

              <section className="card">
                <header>
                  <h2>
                    <Waves size={17} /> 水族箱
                  </h2>
                  <button className="text-btn" onClick={() => nav('/aquarium')}>
                    故事蛋 {egg.xp}/{HATCH_XP} <ChevronRight size={15} />
                  </button>
                </header>
                <Aquarium creatures={egg.creatures} xp={egg.xp} compact onEgg={() => nav('/aquarium')} />
              </section>

              <section className="card">
                <header>
                  <h2>
                    <Ticket size={17} /> 纪念墙 · {memories.length}
                  </h2>
                  <button className="text-btn" onClick={() => openCheckin()}>
                    补打卡 <ChevronRight size={15} />
                  </button>
                </header>
                {memories.length ? (
                  <>
                    <Wall memories={memories} limit={3} onOpen={(m) => openSheet('memory:' + m.id)} />
                    <button className="ghost wide" onClick={() => nav('/memories')}>
                      看整面纪念墙
                    </button>
                  </>
                ) : (
                  <button className="empty-cta" onClick={() => openCheckin()}>
                    <Ticket size={26} />
                    <span>看完一部电影，贴一张票根或邮票</span>
                  </button>
                )}
              </section>

              <section className="card">
                <header>
                  <h2>
                    <Clock size={17} /> 稍后再看 · {watchlist.length}
                  </h2>
                </header>
                {watchlist.length ? (
                  watchlist.map((w) => {
                    const m = byId.get(w.id);
                    if (!m) return null;
                    return (
                      <div className="watch-item" key={w.id}>
                        <button className="movie-button" onClick={() => openSheet('movie:' + m.id)}>
                          {movieRow(m, <span />)}
                        </button>
                        <button className="icon-btn" aria-label={`移除 ${m.title}`} onClick={() => toggleWatch(m)}>
                          <X size={18} />
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <p className="muted">开盒遇到想看的，点「稍后再看」存在这里。</p>
                )}
              </section>

              <button
                className="menu-row"
                onClick={() => {
                  setEditing('profile');
                  nav('/profile');
                }}
              >
                <Settings size={19} />
                我的喜好与黑名单
                <ChevronRight size={18} />
              </button>
              <button className="menu-row" onClick={() => nav('/couple')}>
                <Heart size={19} />
                两个人的默契
                <ChevronRight size={18} />
              </button>
              <button
                className="menu-row"
                onClick={() => {
                  setOnlyFav(true);
                  nav('/library');
                }}
              >
                <Bookmark size={19} />
                我的收藏 · {favorites.length}
                <ChevronRight size={18} />
              </button>
              <button className="menu-row" onClick={() => nav('/history')}>
                <History size={19} />
                开盒足迹 · {history.length}
                <ChevronRight size={18} />
              </button>
            </>
          )}

          {page === '/history' && (
            <>
              {backHeader('开盒足迹')}
              {history.length ? (
                history.map((m, i) => (
                  <div key={i} className="history-item">
                    {movieRow(m)}
                    <small className="muted">
                      {new Date(m.date).toLocaleString('zh-CN')}
                      {m.couple ? ' · 双人共同盲盒' : ''}
                    </small>
                  </div>
                ))
              ) : (
                <div className="empty">
                  <Clapperboard size={40} />
                  <p>第一场相遇，还在等你开启。</p>
                </div>
              )}
            </>
          )}

          {page === '/memories' && (
            <>
              {backHeader(
                `纪念墙 · ${memories.length}`,
                <button className="icon-btn" aria-label="补打卡" onClick={() => openCheckin()}>
                  <Ticket size={20} />
                </button>,
              )}
              {memories.length ? (
                <Wall memories={memories} onOpen={(m) => openSheet('memory:' + m.id)} />
              ) : (
                <div className="empty">
                  <Ticket size={42} />
                  <p>墙上还空着。看完一部电影，贴上第一张。</p>
                </div>
              )}
              <button className="primary" onClick={() => openCheckin()}>
                <Ticket size={18} />
                补一张打卡
              </button>
            </>
          )}

          {page === '/aquarium' && (
            <>
              {backHeader('故事蛋 · 水族箱')}
              <Aquarium creatures={egg.creatures} xp={egg.xp} onEgg={feedEgg} />
              <div className="egg-card">
                <EggSvg xp={egg.xp} className="big" />
                <div>
                  <h2>一颗故事蛋</h2>
                  <p className="muted">
                    成长 {egg.xp}/{HATCH_XP} · 食物 {egg.food} · 连续开盒 {egg.streak} 天
                  </p>
                  <span className="bar">
                    <i style={{ width: `${(egg.xp / HATCH_XP) * 100}%` }} />
                  </span>
                </div>
              </div>
              <button className="primary" disabled={!egg.food} onClick={feedEgg}>
                {egg.food ? `投喂一份好故事（剩 ${egg.food} 份）` : '开一盒获得故事食物'}
              </button>
              <p className="muted center egg-tip">每开一盒 +1 成长、+1 食物（双人 +2）；连续多天开盒额外成长，SSR 让稀有伙伴更容易出现。</p>
              <h3 className="spaced">图鉴</h3>
              <div className="dex">
                {SPECIES.map((s) => {
                  const got = egg.creatures.some((c) => c.species === s.id);
                  return (
                    <div key={s.id} className={`dex-item ${got ? 'got' : ''} ${newborn.some((id) => egg.creatures.find((c) => c.id === id)?.species === s.id) ? 'new' : ''}`}>
                      <span className="dex-art">{got ? <CreatureSvg species={s.id} /> : '?'}</span>
                      <b>{got ? s.name : '???'}</b>
                      <small>{s.rarity}</small>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {page === '/profile' && (
            <>
              {backHeader(editing === 'partner' ? '另一半的观影画像' : '你的观影画像')}
              {renderProfile()}
            </>
          )}

          {page === '/couple' && (
            <>
              {backHeader('两个人的默契')}
              <div className="couple-hero">
                <Heart size={45} />
                <h1>各有所爱，也有交集。</h1>
                <p>共同喜欢的优先，两人的黑名单都算数。</p>
              </div>
              {['profile', 'partner'].map((key, i) => (
                <button
                  className="menu-row"
                  key={key}
                  onClick={() => {
                    setEditing(key);
                    nav('/profile');
                  }}
                >
                  <User size={20} />
                  <div>
                    <b>{i ? '另一半' : '我'}的画像</b>
                    <p>{(i ? partner : profile).tags.join(' / ') || '还没有填写喜好'}</p>
                  </div>
                  <ChevronRight size={18} />
                </button>
              ))}
              <button
                className="primary"
                onClick={() => {
                  setCouple(true);
                  nav('/');
                }}
              >
                <Heart size={18} />
                一起拆开今晚
              </button>
            </>
          )}
        </div>

        <nav className="tabbar" aria-label="主导航">
          {[
            ['/', '开盒', <Sparkles key="a" />],
            ['/library', '片库', <Clapperboard key="b" />],
            ['/me', '我的', <User key="c" />],
          ].map(([url, label, icon]: any) => (
            <button key={url} className={section === url ? 'active' : ''} aria-current={section === url ? 'page' : undefined} onClick={() => page !== url && nav(url)}>
              {icon}
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </main>

      {!intro && <PaopaoAssistant
        snapshot={{
          page, mode, mood, mbti,
          currentMovie: page === '/result' ? current : undefined,
          currentInWatchlist: !!current && inWatch(current.id),
          candidates: aiCandidates,
          blacklist: couple ? [...profile.blacklist, ...partner.blacklist] : profile.blacklist,
          likedTags: profile.tags, recentTags,
        }}
        hidden={!!sheet || phase === 'silhouette' || landscape}
        accent={showcaseActive ? movieTheme.accent : undefined}
        moods={Object.keys(moods)} movieIds={movies.map((m) => m.id)}
        movieById={(id) => byId.get(id)} inWatch={inWatch} actions={assistantActions} />}
      {intro && <Intro onDone={() => setIntro(false)} />}
      <SsrOverlay stamp={ssr} />
      {toast && (
        <div role="status" className="toast" key={toast}>
          {toast}
        </div>
      )}

      {sheet === 'filters' && (
        <LibraryFilterSheet
          applied={filters}
          platforms={platformsOf(movies).slice(1)}
          genres={GENRE_OPTIONS.slice(1)}
          platformLabel={(p) => PLATFORM_LABEL[p as keyof typeof PLATFORM_LABEL] || p}
          count={(f) => countFilteredMovies(movies, f, matchQuery)}
          onApply={setFilters}
          onClose={() => closeSheet()}
        />
      )}
      {sheet && sheet !== 'filters' && (
        <BottomSheet onClose={() => closeSheet()}>
            {sheet === 'onboard' && (
              <div className="onboarding">
                <span className="eyebrow">想更懂我 · {onboard} / 3</span>
                <h1>{onboard === 1 ? '先认识一下你的口味' : onboard === 2 ? '谁让你忍不住点开？' : '避开不想看的故事'}</h1>
                <p className="muted">
                  {onboard === 1 ? '选几个喜欢的类型，泡泡会更懂你。' : onboard === 2 ? '填写喜欢的演员，用逗号分隔。' : '不喜欢的片名、演员或内容，一律跳过。'}
                </p>
                {onboard === 1 ? (
                  chips(allTags, profile.tags, (t) => setProfile((p) => ({ ...p, tags: p.tags.includes(t) ? p.tags.filter((x) => x !== t) : [...p.tags, t] })))
                ) : (
                  <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={onboard === 2 ? '例如：梁朝伟、周星驰' : '例如：恐怖、某位演员、某部电影'} />
                )}
                <button
                  className="primary"
                  onClick={() => {
                    if (onboard > 1) {
                      const key = onboard === 2 ? 'actors' : 'blacklist';
                      const items = draft.split(/[,，、]/).map((x) => x.trim()).filter(Boolean);
                      if (items.length) setProfile((p) => key === 'actors'
                        ? { ...p, actors: [...new Set([...p.actors, ...items])] }
                        : { ...p, blacklist: [...p.blacklist, ...items.map((name) => ({ id: blacklistId(), type: allTags.includes(name) ? 'genre' : movies.some((m) => m.actors.includes(name)) ? 'actor' : 'title', name }))] });
                      setDraft('');
                    }
                    if (onboard === 3) {
                      finishOnboard();
                      notify('口味已记住，去吹一颗泡泡吧');
                    } else setOnboard(onboard + 1);
                  }}
                >
                  {onboard === 3 ? '好了，去开盒' : '下一步'}
                  <ChevronRight size={18} />
                </button>
                <button className="skip" onClick={finishOnboard}>
                  先跳过，稍后再说
                </button>
              </div>
            )}

            {sheet === 'watch' && (
              <>
                <h2>去哪里看？</h2>
                <p>打开平台搜索，片源和会员要求以平台实时结果为准。</p>
                {[
                  ['腾讯视频', 'https://v.qq.com/x/search/?q='],
                  ['爱奇艺', 'https://so.iqiyi.com/so/q_'],
                  ['优酷', 'https://so.youku.com/search_video/q_'],
                  ['哔哩哔哩', 'https://search.bilibili.com/all?keyword='],
                  ['Netflix', 'https://www.netflix.com/search?q='],
                ].map(([name, url]) => (
                  <a className="menu-row" href={url + encodeURIComponent(current?.title || '')} target="_blank" rel="noreferrer" key={name}>
                    {name}
                    <ChevronRight size={18} />
                  </a>
                ))}
              </>
            )}

            {sheet.startsWith('movie:') &&
              (() => {
                const m = byId.get(Number(sheet.split(':')[1]));
                if (!m) return null;
                return (
                  <>
                    {movieRow(m)}
                    <p>{m.synopsis}</p>
                    <p className="muted">{m.actors.join(' / ')}</p>
                    <div className="sheet-actions">
                      <button className={isFav(m.id) ? 'on' : ''} onClick={() => toggleFav(m)}>
                        <Bookmark size={18} fill={isFav(m.id) ? 'currentColor' : 'none'} />
                        {isFav(m.id) ? '已收藏' : '收藏'}
                      </button>
                      <button className={inWatch(m.id) ? 'on' : ''} onClick={() => toggleWatch(m)}>
                        {inWatch(m.id) ? <Check size={18} /> : <Clock size={18} />}
                        {inWatch(m.id) ? '已加入' : '稍后再看'}
                      </button>
                      <button onClick={() => openCheckin(m.id)}>
                        <Ticket size={18} />
                        打卡
                      </button>
                    </div>
                  </>
                );
              })()}

            {sheet === 'checkin' && <CheckinForm candidates={candidates} initialId={checkinFor ?? current?.id} onSaved={saveMemory} onCancel={() => closeSheet()} />}

            {sheet.startsWith('memory:') &&
              (() => {
                const m = memories.find((x) => x.id === sheet.slice(7));
                if (!m) return null;
                return (
                  <div className="memory-detail">
                    <MemoryCard m={m} />
                    <p className="muted center">
                      {m.kind === 'ticket' ? '机票票根' : '观影邮票'} · 贴于 {new Date(m.createdAt).toLocaleDateString('zh-CN')}
                    </p>
                    <button className={`ghost wide danger ${confirmDelete === m.id ? 'armed' : ''}`} onClick={() => deleteMemory(m)}>
                      <Trash2 size={16} />
                      {confirmDelete === m.id ? '再点一次，确认取下' : '从纪念墙取下'}
                    </button>
                  </div>
                );
              })()}

        </BottomSheet>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <HashRouter>
    <App />
  </HashRouter>,
);
