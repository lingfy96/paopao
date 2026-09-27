import React, { useLayoutEffect, useRef, useState } from 'react';
import { ArrowRight, Bookmark, Check, ChevronDown, Clapperboard, Clock, Film, Share2, Star, Ticket } from 'lucide-react';
import { getMovieTheme, normalizeMovieCardData, showcaseVariables, SHOWCASE_TIMING } from '../lib/showcase.js';
import { reducedMotion } from '../lib/fx.js';
import {
  animateSpring, axisOf, CARD_DISTANCE, CARD_FLICK, claimGesture, createVelocity,
  isEdgeX, lerp, ownsGesture, releaseGesture, rubberBand, shouldCommit,
} from '../lib/fluid.js';
import type { RevealPhase } from './Reveal';
import './MovieShowcaseResult.css';

type Movie = { id: number; title: string; [key: string]: any };
type Snapshot = { movie: Movie; mood: string; themeMode: string };
type Props = {
  movie?: Movie; phase: RevealPhase; busy: boolean; mood: string; themeMode: string; source: string;
  round: Movie[]; selected: number; roundMax: number; locked: boolean; inWatch: boolean; favorite: boolean;
  againLabel: string; againDisabled: boolean; posterBusy: boolean; error: string;
  onAgain: () => void; onSelect: (index: number) => void; onWatch: () => void; onCheckin: () => void;
  onFavorite: () => void; onShare: () => void; onLock: () => void; onWhere: () => void;
};

function Poster({ src, title, motif }: { src: string; title: string; motif: string }) {
  const [failed, setFailed] = useState(false);
  return <div className={`showcase-poster motif-${motif}`}>
    {src && !failed ? <img src={src} alt={`${title}海报`} onError={() => setFailed(true)} /> :
      <div className="showcase-poster-art" role="img" aria-label={`${title}，抽象电影封面`}>
        <span className="poster-orbit" /><span className="poster-disc" /><span className="poster-cut" />
        <Film size={26} strokeWidth={1.25} /><small>PAOPAO<br />SELECT</small>
      </div>}
  </div>;
}

export function MovieShowcaseCard({ movie, mood, themeMode, heading = true }: Snapshot & { heading?: boolean }) {
  const data = normalizeMovieCardData(movie, mood, import.meta.env.BASE_URL);
  const theme = getMovieTheme(movie, mood, themeMode);
  const Heading = heading ? 'h1' : 'div';
  return <article className={`showcase-card title-${data.titleSize}`} data-movie-id={movie.id} data-rarity={data.rarity}
    style={showcaseVariables(theme) as React.CSSProperties} aria-label={heading ? `电影卡：${data.title}` : undefined}>
    <div className="showcase-card-top">
      <div className="showcase-tags">{data.genres.slice(0, 2).map((genre) => <span key={genre}>{genre}</span>)}</div>
      <span className="showcase-edition">{data.rarity || 'FILM'}<span className="edition-mark" aria-hidden /></span>
    </div>
    <div className="showcase-title-group">
      <Heading className="showcase-title">{data.title}</Heading>
      {data.originalTitle && <p className="showcase-original">{data.originalTitle}</p>}
    </div>
    {(data.year || data.rating || data.platform) && <div className="showcase-meta" aria-label="影片信息">
      {data.year && <span>{data.year}</span>}
      {data.rating && <span className="showcase-rating"><Star size={11} fill="currentColor" aria-hidden />{data.rating.toFixed(1)}</span>}
      {data.platform && <span>{data.platform}</span>}
    </div>}
    <div className="showcase-editorial">
      <div className="showcase-reason">
        <span className="showcase-small-label">{data.mood ? `此刻 · ${data.mood}` : '今晚的偶然'}</span>
        {data.recommendation && <p>{data.recommendation}</p>}
        {data.duration && <span className="showcase-runtime"><Clock size={12} />{data.duration} 分钟{movie.type === '剧集' ? ' / 集' : ''}</span>}
      </div>
      <Poster key={`${movie.id}-${data.poster}`} src={data.poster} title={data.title} motif={theme.motif} />
    </div>
    <div className="showcase-card-footer"><span>让好故事，遇见现在的你</span><span aria-hidden>PAOPAO / {String(movie.id).padStart(3, '0')}</span></div>
  </article>;
}

/** Only presentation snapshots live here. Quotas, selection and all writes remain in App. */
export default function MovieShowcaseResult(props: Props) {
  const { movie, phase, busy, mood, themeMode } = props;
  const snapshot = movie ? { movie, mood, themeMode } : null;
  const previous = useRef<Snapshot | null>(phase === 'silhouette' ? null : snapshot);
  const stageRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLDivElement>(null);
  const prevRef = useRef<HTMLDivElement>(null);
  const skipCss = useRef(false);
  const motion = useRef({ x: 0, v: 0, spring: null as { stop: () => { x: number; v: number } } | null });
  const drag = useRef<{ id: number; x: number; y: number; origin: number; axis: '' | 'x' | 'y' } | null>(null);
  const speed = useRef(createVelocity());
  const [transition, setTransition] = useState<{ outgoing: Snapshot | null; kind: 'rest' | 'initial' | 'next'; stamp: number }>({ outgoing: null, kind: 'rest', stamp: 0 });
  const preparing = phase === 'silhouette' || !movie;
  const prevMovie = props.round[props.selected - 1];
  const nextMovie = props.round[props.selected + 1];
  const canPrev = !!prevMovie;
  const canNext = !!nextMovie || !props.againDisabled;
  useLayoutEffect(() => {
    if (phase === 'silhouette') { previous.current = null; setTransition((state) => ({ ...state, outgoing: null, kind: 'rest' })); return; }
    if (!snapshot || (previous.current?.movie === movie && previous.current !== null)) return;
    const old = previous.current;
    previous.current = snapshot;
    if (skipCss.current) {
      skipCss.current = false;
      paint(0, 0);
      setTransition((state) => ({ outgoing: null, kind: 'rest', stamp: state.stamp + 1 }));
      return;
    }
    setTransition((state) => ({ outgoing: old, kind: old ? 'next' : 'initial', stamp: state.stamp + 1 }));
    const timeout = window.setTimeout(() => setTransition((state) => ({ ...state, outgoing: null, kind: 'rest' })), reducedMotion() ? SHOWCASE_TIMING.reduced : old ? SHOWCASE_TIMING.switch : SHOWCASE_TIMING.reveal);
    return () => clearTimeout(timeout);
  }, [movie, phase === 'silhouette']);
  const changing = busy || transition.kind !== 'rest';
  const data = movie ? normalizeMovieCardData(movie, mood, import.meta.env.BASE_URL) : null;
  const theme = getMovieTheme(movie, mood, themeMode);
  const widthOf = () => stageRef.current?.clientWidth || 360;
  function paint(x: number, v = 0) {
    motion.current.x = x; motion.current.v = v;
    const w = widthOf();
    const p = x / w;
    const depth = lerp(1, 0.955, Math.min(1, Math.abs(p)));
    const rise = lerp(0.94, 1, Math.min(1, Math.abs(p)));
    if (currentRef.current) currentRef.current.style.transform = `translate3d(${x}px,0,0) rotate(${p * 3.2}deg) scale(${depth})`;
    if (nextRef.current) {
      nextRef.current.style.transform = `translate3d(${x + w}px,0,0) scale(${x < 0 ? rise : 0.94})`;
      nextRef.current.style.opacity = x < 0 ? String(Math.min(1, -p * 1.35)) : '0';
    }
    if (prevRef.current) {
      prevRef.current.style.transform = `translate3d(${x - w}px,0,0) scale(${x > 0 ? rise : 0.94})`;
      prevRef.current.style.opacity = x > 0 ? String(Math.min(1, p * 1.35)) : '0';
    }
    stageRef.current?.classList.toggle('is-dragging', !!drag.current);
  }
  function stopSpring() {
    if (motion.current.spring) {
      const last = motion.current.spring.stop();
      motion.current.spring = null;
      motion.current.x = last.x; motion.current.v = last.v;
    }
    return motion.current;
  }
  function bound(raw: number) {
    const w = widthOf();
    if (raw > 0 && !canPrev) return rubberBand(raw, w);
    if (raw < 0 && !canNext) return -rubberBand(-raw, w);
    return raw;
  }
  function go(dir: number) {
    if (dir < 0 && nextMovie) { skipCss.current = true; props.onSelect(props.selected + 1); }
    else if (dir < 0) props.onAgain();
    else if (dir > 0 && prevMovie) { skipCss.current = true; props.onSelect(props.selected - 1); }
    paint(0, 0);
  }
  function settle(to: number, velocity: number, then?: () => void) {
    stopSpring();
    motion.current.spring = animateSpring({
      from: motion.current.x, to, velocity,
      onUpdate: paint,
      onComplete: () => { motion.current.spring = null; then ? then() : paint(to, 0); },
    });
  }
  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (preparing || (event.pointerType === 'mouse' && event.button !== 0) || isEdgeX(event.clientX)) return;
    const last = stopSpring();
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, origin: last.x, axis: '' };
    speed.current.reset(); speed.current.add(event.clientX, event.clientY);
  }
  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const g = drag.current;
    if (!g || g.id !== event.pointerId) return;
    const dx = event.clientX - g.x, dy = event.clientY - g.y;
    if (!g.axis) {
      g.axis = axisOf(dx, dy);
      if (g.axis === 'y') { drag.current = null; return; }
      if (g.axis !== 'x') return;
      if (!claimGesture(event.pointerId, 'card')) { drag.current = null; return; }
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* gone */ }
    }
    if (g.axis !== 'x' || !ownsGesture(event.pointerId, 'card')) return;
    speed.current.add(event.clientX, event.clientY);
    paint(bound(g.origin + dx));
  }
  function finishDrag(event: React.PointerEvent<HTMLDivElement>, cancelled = false) {
    const g = drag.current;
    if (!g || g.id !== event.pointerId) return;
    drag.current = null;
    releaseGesture(event.pointerId, 'card');
    const { vx } = speed.current.read();
    const w = widthOf();
    const dir = cancelled || g.axis !== 'x' ? 0 : shouldCommit(motion.current.x, vx, w, CARD_DISTANCE, CARD_FLICK);
    if (dir < 0 && canNext) settle(-w, vx, () => go(-1));
    else if (dir > 0 && canPrev) settle(w, vx, () => go(1));
    else settle(0, vx);
  }
  function again() {
    if (props.againDisabled || changing) return;
    const w = widthOf();
    settle(-w, 0, () => go(-1));
  }

  return <section className={`showcase-result motif-${theme.motif}`} aria-label="今晚的电影卡" aria-busy={busy}>
    <div className="showcase-decorations" aria-hidden><i /><i /><i /><i /></div>
    <div className="showcase-kicker"><span>今晚，故事属于你</span><span>{String(props.selected + 1).padStart(2, '0')} / {String(props.roundMax).padStart(2, '0')}</span></div>
    <div ref={stageRef} data-gesture="card" className={`showcase-stage is-${transition.kind} ${phase === 'leaving' ? 'is-pending' : ''}`}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove}
      onPointerUp={(event) => finishDrag(event)} onPointerCancel={(event) => finishDrag(event, true)}>
      <div className="showcase-stack" aria-hidden><i /><i /></div>
      {preparing ? <div className="showcase-mystery" role="status"><span>下一幕</span><Clapperboard size={54} strokeWidth={1} /><h1>故事正在<br />显影。</h1><p>为现在的你，挑一个好故事</p><div className="showcase-loading-line" /></div> :
        <div ref={currentRef} className="showcase-current" key={`${movie.id}-${transition.stamp}`}><MovieShowcaseCard {...snapshot!} /></div>}
      {!preparing && nextMovie && <div ref={nextRef} className="showcase-peek" aria-hidden inert>
        <MovieShowcaseCard movie={nextMovie} mood={mood} themeMode={themeMode} heading={false} /></div>}
      {!preparing && prevMovie && <div ref={prevRef} className="showcase-peek" aria-hidden inert>
        <MovieShowcaseCard movie={prevMovie} mood={mood} themeMode={themeMode} heading={false} /></div>}
      {!preparing && transition.outgoing && <div className="showcase-outgoing" aria-hidden inert><MovieShowcaseCard {...transition.outgoing} heading={false} /></div>}
    </div>
    {movie && !preparing && <p className="showcase-swipe-hint" aria-hidden>向左轻扫，也能抽下一张</p>}
    {movie && !preparing && <div className={`showcase-controls ${transition.kind === 'initial' ? 'controls-arriving' : ''}`}>
      <button className="showcase-next" aria-label={props.againLabel} disabled={changing || props.againDisabled} onClick={again}>
        <span>{phase === 'leaving' ? '正在抽下一张…' : props.againLabel}</span><ArrowRight size={22} aria-hidden />
      </button>
      <button className="showcase-where" aria-label="去哪里看" disabled={changing} onClick={props.onWhere}>
        <Clapperboard size={18} />
        <span>去哪里看</span>
        <ArrowRight size={20} aria-hidden />
      </button>
      {props.error && <p className="showcase-error" role="alert">{props.error}</p>}
      <div className="showcase-secondary">
        <button aria-label={props.inWatch ? '取消想看' : '想看'} aria-pressed={props.inWatch} disabled={changing} onClick={props.onWatch}>
          {props.inWatch ? <Check size={18} /> : <Clock size={18} />}<span>{props.inWatch ? '已想看' : '想看'}</span>
        </button>
        <button aria-label="看完打卡" disabled={changing} onClick={props.onCheckin}><Ticket size={18} />看完打卡</button>
      </div>
      <div className="showcase-tools">
        <button aria-label={props.locked ? '已锁定这部电影' : '就看这部'} disabled={changing || props.locked} onClick={props.onLock}><Check size={16} />{props.locked ? '已锁定' : '就看这部'}</button>
        <button aria-label={props.favorite ? '取消收藏' : '收藏电影'} aria-pressed={props.favorite} disabled={changing} onClick={props.onFavorite}><Bookmark size={16} fill={props.favorite ? 'currentColor' : 'none'} />{props.favorite ? '已收藏' : '收藏'}</button>
        <button aria-label="分享电影卡" disabled={changing || props.posterBusy} onClick={props.onShare}><Share2 size={16} />{props.posterBusy ? '生成中…' : '分享'}</button>
      </div>
      <div className="showcase-round">
        <p>{props.locked ? '已锁定 · 再来一张将开启新的一盒' : props.round.length >= props.roundMax ? '本盒已翻完，选一部锁定再开新盒' : `这一盒已翻开 ${props.round.length} / ${props.roundMax} 张`}</p>
        <div className="showcase-choices" aria-label="这一盒的电影">
          {props.round.map((item, i) => <button key={item.id} aria-label={`查看 ${item.title}`} aria-pressed={props.selected === i}
            disabled={changing || (props.locked && props.selected !== i)} onClick={() => props.onSelect(i)}><span>{String(i + 1).padStart(2, '0')}</span>{item.title}</button>)}
        </div>
      </div>
      <details className="showcase-details" key={movie.id}>
        <summary>关于这部电影<ChevronDown size={16} aria-hidden /></summary>
        {movie.bad && <p className="showcase-warning">片库提示：这部作品口碑较低，适合带着吐槽的心情观看。</p>}
        {data?.synopsis && <p>{data.synopsis}</p>}
        {!!data?.actors.length && <p>演员：{data.actors.join('、')}</p>}
        <p className="showcase-source">{props.source} · 评分为片库参考值</p>
      </details>
    </div>}
    <span className="showcase-sr" role="status" aria-live="polite">{!busy && movie ? `已切换至《${movie.title}》` : ''}</span>
  </section>;
}
