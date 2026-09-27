import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import BottomSheet from './BottomSheet';
import PaopaoCharacter from './PaopaoCharacter';
import { DURATION_STOPS, SCORE_TIERS, activeCount, defaultFilters, normalizeFilters, summarizeFilters } from '../lib/filters.js';
import { haptic, reducedMotion, sfx } from '../lib/fx.js';
import { claimGesture, releaseGesture } from '../lib/fluid.js';
import './LibraryFilterSheet.css';

export type LibraryFilters = { minRating: number; platform: string[]; maxDuration: number; genre: string[] };
type Look = -1 | 0 | 1;
type Sample = { t: number; v: number };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const easeOut = (k: number) => 1 - (1 - k) ** 4;
const SNAP_MS = 320;
const INERTIA_MS = 120;
const POP_GAP_MS = 900;

/** Velocity (units / ms) over the last ~100ms of samples. */
function velocity(samples: Sample[]) {
  const last = samples.at(-1);
  const first = samples.find((s) => last && last.t - s.t <= 100);
  if (!last || !first || last.t === first.t) return 0;
  return (last.v - first.v) / (last.t - first.t);
}

/** Nearest stop after a short inertial throw, never more than one stop past where the finger let go. */
function settle(pos: number, samples: Sample[], nearest: (p: number) => number) {
  const here = nearest(pos);
  return clamp(nearest(pos + velocity(samples) * INERTIA_MS), here - 1, here + 1);
}

/**
 * Horizontal-intent drag on top of a vertically scrolling sheet. Nothing is captured until the
 * finger has clearly moved sideways; a vertical start is left to the browser (paired with
 * `touch-action: pan-y` in CSS, which makes the browser fire pointercancel when it scrolls).
 */
function useAxisDrag(h: {
  onDrag: (e: React.PointerEvent, first: boolean) => void;
  onRelease: (cancelled: boolean) => void;
  onTap?: (e: React.PointerEvent) => void;
}) {
  const hr = useRef(h);
  hr.current = h;
  const state = useRef<{ id: number; x: number; y: number; active: boolean } | null>(null);
  const suppressUntil = useRef(0);
  const finish = (e: React.PointerEvent, cancelled: boolean) => {
    const s = state.current;
    if (!s || s.id !== e.pointerId) return;
    state.current = null;
    if (s.active) {
      releaseGesture(e.pointerId, 'local');
      suppressUntil.current = performance.now() + 400;
      hr.current.onRelease(cancelled);
    } else if (!cancelled) hr.current.onTap?.(e);
  };
  return {
    onPointerDown(e: React.PointerEvent) {
      if (state.current || (e.pointerType === 'mouse' && e.button !== 0)) return;
      state.current = { id: e.pointerId, x: e.clientX, y: e.clientY, active: false };
    },
    onPointerMove(e: React.PointerEvent) {
      const s = state.current;
      if (!s || s.id !== e.pointerId) return;
      if (s.active) return hr.current.onDrag(e, false);
      const dx = Math.abs(e.clientX - s.x);
      const dy = Math.abs(e.clientY - s.y);
      const slop = e.pointerType === 'mouse' ? 4 : 8;
      if (dy > slop && dy >= dx) {
        state.current = null;
        return;
      }
      if (dx < slop || dx < dy * 1.2) return;
      s.active = true;
      if (!claimGesture(e.pointerId, 'local')) { state.current = null; return; }
      try {
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
      } catch {
        /* pointer already gone */
      }
      hr.current.onDrag(e, true);
    },
    onPointerUp: (e: React.PointerEvent) => finish(e, false),
    onPointerCancel: (e: React.PointerEvent) => finish(e, true),
    onClickCapture(e: React.MouseEvent) {
      if (performance.now() < suppressUntil.current) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
  };
}

type Feedback = { onLook: (dir: Look) => void; onSnap: (dragged: boolean) => boolean };

/** A keyed, self-clearing burst: the bubble re-forms in place and the particles are removed afterwards. */
function usePop() {
  const [pop, setPop] = useState({ key: 0, on: false });
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const fire = useCallback(() => {
    clearTimeout(timer.current);
    setPop((p) => ({ key: p.key + 1, on: true }));
    timer.current = window.setTimeout(() => setPop((p) => ({ ...p, on: false })), 640);
  }, []);
  return [pop, fire] as const;
}

// ---------------------------------------------------------------- SCORE
function ScoreRail({ value, onChange, onLook, onSnap }: { value: number; onChange: (v: number) => void } & Feedback) {
  const index = Math.max(0, SCORE_TIERS.findIndex((t) => t.value === value));
  const track = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const geo = useRef({ left: 0, width: 1, pos: 0, lastX: 0, samples: [] as Sample[] });
  const indexRef = useRef(index);
  indexRef.current = index;
  const [dragging, setDragging] = useState(false);
  const [pop, firePop] = usePop();
  const popTimer = useRef(0);
  const n = SCORE_TIERS.length;
  const frac = (i: number) => (2 * i + 1) / (2 * n);
  const nearest = (p: number) => clamp(Math.round((p - frac(0)) * n), 0, n - 1);

  const drag = useAxisDrag({
    onDrag(e, first) {
      const g = geo.current;
      if (first) {
        const r = track.current!.getBoundingClientRect();
        Object.assign(g, { left: r.left, width: r.width || 1, lastX: e.clientX, samples: [] });
        setDragging(true);
      }
      g.pos = clamp((e.clientX - g.left) / g.width, frac(0), frac(n - 1));
      rail.current?.style.setProperty('--p', String(g.pos));
      g.samples.push({ t: e.timeStamp, v: g.pos });
      if (g.samples.length > 8) g.samples.shift();
      const dx = e.clientX - g.lastX;
      if (Math.abs(dx) > 1.5) onLook(dx < 0 ? -1 : 1);
      g.lastX = e.clientX;
      const i = nearest(g.pos);
      if (i !== indexRef.current) onChange(SCORE_TIERS[i].value);
    },
    onRelease(cancelled) {
      const g = geo.current;
      const target = cancelled ? nearest(g.pos) : settle(g.pos, g.samples, nearest);
      // Same style change as dropping --p, so the snap is a real transition rather than a jump.
      track.current?.classList.remove('is-dragging');
      rail.current?.style.removeProperty('--p');
      setDragging(false);
      onLook(0);
      onChange(SCORE_TIERS[target].value);
      if (cancelled) return;
      clearTimeout(popTimer.current);
      popTimer.current = window.setTimeout(() => onSnap(true) && firePop(), reducedMotion() ? 0 : 260);
    },
  });
  useEffect(() => () => clearTimeout(popTimer.current), []);

  function onKey(e: React.KeyboardEvent, i: number) {
    const next = { ArrowLeft: i - 1, ArrowUp: i - 1, ArrowRight: i + 1, ArrowDown: i + 1, Home: 0, End: n - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const j = clamp(next, 0, n - 1);
    onChange(SCORE_TIERS[j].value);
    buttons.current[j]?.focus();
  }

  return (
    <div ref={track} data-gesture="local" className={`fs-score ${dragging ? 'is-dragging' : ''}`} role="radiogroup" aria-label="评分" {...drag}>
      <span className="fs-score-line" aria-hidden="true" />
      <div ref={rail} className="fs-score-rail" style={{ '--sel': frac(index) } as React.CSSProperties} aria-hidden="true">
        <span className={`fs-drag-bubble ${pop.on ? 'is-popping' : ''}`} key={pop.key} />
        {pop.on && <span className="fs-sparks" key={`s${pop.key}`}><i /><i /><i /></span>}
      </div>
      {SCORE_TIERS.map((t, i) => (
        <button
          key={t.value}
          ref={(el) => { buttons.current[i] = el; }}
          type="button"
          role="radio"
          aria-checked={i === index}
          tabIndex={i === index ? 0 : -1}
          className={`fs-score-node ${i === index ? 'is-on' : ''}`}
          onClick={() => { if (i !== index) { onChange(t.value); onSnap(false); } }}
          onKeyDown={(e) => onKey(e, i)}
        >
          <span className="fs-dot" aria-hidden="true" />
          <span className="fs-score-name">{t.label}</span>
          <span className="fs-score-no" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- DURATION
const ARC_W = 340;
const ARC_H = 112;
const ARC_PATH = 'M 26 90 C 118 38, 222 38, 314 90';
const WIDEST_STOP = DURATION_STOPS.reduce((a, s) => (s.label.length > a.length ? s.label : a), '');
const ARC_SAMPLES = 120;

type Point = { x: number; y: number; l: number };

function RollingNumber({ text }: { text: string }) {
  const [items, setItems] = useState([{ id: 0, text, out: false }]);
  const prev = useRef(text);
  useEffect(() => {
    if (text === prev.current) return;
    prev.current = text;
    setItems((list) => [...list.filter((x) => !x.out).map((x) => ({ ...x, out: true })), { id: performance.now(), text, out: false }]);
    const timer = setTimeout(() => setItems((list) => list.filter((x) => !x.out)), 340);
    return () => clearTimeout(timer);
  }, [text]);
  return (
    <span className="fs-num-box" aria-hidden="true">
      <span className="fs-num-ghost">{WIDEST_STOP}</span>
      {items.map((x) => (
        <span key={x.id} className={`fs-num ${x.out ? 'is-out' : x.id ? 'is-in' : ''}`}>{x.text}</span>
      ))}
    </span>
  );
}

function DurationArc({ value, onChange, onLook, onSnap }: { value: number; onChange: (v: number) => void } & Feedback) {
  const uid = useId().replace(/[^\w-]/g, '');
  const index = Math.max(0, DURATION_STOPS.findIndex((s) => s.value === value));
  const indexRef = useRef(index);
  indexRef.current = index;
  const svg = useRef<SVGSVGElement>(null);
  const path = useRef<SVGPathElement>(null);
  const active = useRef<SVGPathElement>(null);
  const bubble = useRef<SVGGElement>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const [dragging, setDragging] = useState(false);
  const [pop, firePop] = usePop();
  const m = useRef({ total: 1, len: 0, raf: 0, target: -1, lastX: 0, samples: [] as Sample[], dragging: false });
  const last = DURATION_STOPS.length - 1;
  const stopLen = (i: number) => (m.current.total * i) / last;
  const nearest = (l: number) => clamp(Math.round((l / m.current.total) * last), 0, last);

  useLayoutEffect(() => {
    const p = path.current;
    if (!p) return;
    const total = p.getTotalLength();
    m.current.total = total;
    const list: Point[] = [];
    for (let i = 0; i <= ARC_SAMPLES; i++) {
      const l = (total * i) / ARC_SAMPLES;
      const pt = p.getPointAtLength(l);
      list.push({ x: pt.x, y: pt.y, l });
    }
    setPoints(list);
  }, []);

  const pointAt = useCallback((l: number): Point => {
    if (!points.length) return { x: 0, y: 0, l };
    const f = (clamp(l, 0, m.current.total) / m.current.total) * ARC_SAMPLES;
    const a = points[Math.floor(f)];
    const b = points[Math.min(ARC_SAMPLES, Math.floor(f) + 1)];
    const k = f - Math.floor(f);
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, l };
  }, [points]);

  const place = useCallback((l: number) => {
    const s = m.current;
    s.len = clamp(l, 0, s.total);
    const pt = pointAt(s.len);
    bubble.current?.setAttribute('transform', `translate(${pt.x.toFixed(2)} ${pt.y.toFixed(2)})`);
    if (active.current) active.current.style.strokeDashoffset = String(s.total - s.len);
  }, [pointAt]);

  /** Moves the bubble *along the path* (never in a straight line) to `to`. */
  const glide = useCallback((to: number, done?: () => void) => {
    const s = m.current;
    cancelAnimationFrame(s.raf);
    s.target = to;
    const from = s.len;
    const ms = reducedMotion() ? 120 : SNAP_MS;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      place(from + (to - from) * easeOut(k));
      if (k < 1) s.raf = requestAnimationFrame(step);
      else {
        s.raf = 0;
        s.target = -1;
        done?.();
      }
    };
    s.raf = requestAnimationFrame(step);
  }, [place]);

  useLayoutEffect(() => {
    if (!points.length) return;
    if (active.current) active.current.style.strokeDasharray = String(m.current.total);
    place(stopLen(indexRef.current));
  }, [points]);

  useEffect(() => {
    const s = m.current;
    if (!points.length || s.dragging) return;
    const to = stopLen(index);
    if (Math.abs(s.len - to) > 0.5 && s.target !== to) glide(to);
  }, [index, points]);

  useEffect(() => () => cancelAnimationFrame(m.current.raf), []);

  /** Closest point on the sampled path to a client-space pointer, refined onto the segment. */
  function project(clientX: number, clientY: number) {
    const el = svg.current;
    const ctm = el?.getScreenCTM();
    if (!el || !ctm || !points.length) return null;
    const pt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < points.length; i++) {
      const d = (points[i].x - pt.x) ** 2 + (points[i].y - pt.y) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    let len = points[best].l;
    let dist = Math.sqrt(bestD);
    for (const j of [best - 1, best + 1]) {
      const a = points[best];
      const b = points[j];
      if (!b) continue;
      const vx = b.x - a.x;
      const vy = b.y - a.y;
      const k = clamp(((pt.x - a.x) * vx + (pt.y - a.y) * vy) / (vx * vx + vy * vy || 1), 0, 1);
      const d = Math.hypot(a.x + vx * k - pt.x, a.y + vy * k - pt.y);
      if (d < dist) { dist = d; len = a.l + (b.l - a.l) * k; }
    }
    return { len, dist };
  }

  const drag = useAxisDrag({
    onDrag(e, first) {
      const s = m.current;
      if (first) {
        cancelAnimationFrame(s.raf);
        s.target = -1;
        s.dragging = true;
        s.samples = [];
        s.lastX = e.clientX;
        setDragging(true);
      }
      const hit = project(e.clientX, e.clientY);
      if (!hit) return;
      place(hit.len);
      s.samples.push({ t: e.timeStamp, v: hit.len });
      if (s.samples.length > 8) s.samples.shift();
      const dx = e.clientX - s.lastX;
      if (Math.abs(dx) > 1.5) onLook(dx < 0 ? -1 : 1);
      s.lastX = e.clientX;
      const i = nearest(hit.len);
      if (i !== indexRef.current) onChange(DURATION_STOPS[i].value);
    },
    onRelease(cancelled) {
      const s = m.current;
      const target = cancelled ? nearest(s.len) : settle(s.len, s.samples, nearest);
      s.dragging = false;
      setDragging(false);
      onLook(0);
      onChange(DURATION_STOPS[target].value);
      glide(stopLen(target), () => {
        if (!cancelled && onSnap(true)) firePop();
      });
    },
    onTap(e) {
      const hit = project(e.clientX, e.clientY);
      if (!hit || hit.dist > 44) return;
      const i = nearest(hit.len);
      if (i === indexRef.current) return;
      onChange(DURATION_STOPS[i].value);
      onSnap(false);
    },
  });

  function onKey(e: React.KeyboardEvent) {
    const next = { ArrowLeft: index - 1, ArrowDown: index - 1, ArrowRight: index + 1, ArrowUp: index + 1, Home: 0, End: last }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    onChange(DURATION_STOPS[clamp(next, 0, last)].value);
  }

  const stop = DURATION_STOPS[index];
  const valueText = stop.value ? `${stop.label} 分钟以内` : '不限时长';
  const stopPoints = points.length ? DURATION_STOPS.map((_, i) => pointAt(stopLen(i))) : [];

  return (
    <>
      <div className="fs-duration-readout" aria-hidden="true">
        <RollingNumber text={stop.label} />
        <span className="fs-num-unit">{stop.value ? '分钟以内' : '不限时长'}</span>
      </div>
      <div
        data-gesture="local"
        className={`fs-arc ${dragging ? 'is-dragging' : ''}`}
        role="slider"
        tabIndex={0}
        aria-label="时长上限"
        aria-valuemin={0}
        aria-valuemax={last}
        aria-valuenow={index}
        aria-valuetext={valueText}
        onKeyDown={onKey}
        {...drag}
      >
        <svg ref={svg} viewBox={`0 0 ${ARC_W} ${ARC_H}`} aria-hidden="true" focusable="false">
          <defs>
            <linearGradient id={`fs-arc-${uid}`} gradientUnits="userSpaceOnUse" x1="26" y1="0" x2="314" y2="0">
              <stop offset="0%" className="fs-grad-a" />
              <stop offset="100%" className="fs-grad-b" />
            </linearGradient>
            <radialGradient id={`fs-bub-${uid}`} cx="36%" cy="30%" r="75%">
              <stop offset="0%" className="fs-bub-a" />
              <stop offset="55%" className="fs-bub-b" />
              <stop offset="100%" className="fs-bub-c" />
            </radialGradient>
          </defs>
          <path ref={path} d={ARC_PATH} className="fs-arc-base" />
          <path ref={active} d={ARC_PATH} className="fs-arc-active" stroke={`url(#fs-arc-${uid})`} />
          {stopPoints.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={i === index ? 5.5 : 4} className={`fs-arc-node ${i === index ? 'is-on' : i < index ? 'is-passed' : ''}`} />
          ))}
          <g ref={bubble} className="fs-arc-bubble">
            <g className={`fs-arc-bubble-body ${pop.on ? 'is-popping' : ''}`} key={pop.key}>
              <circle r="17" className="fs-arc-halo" />
              <circle r="11" fill={`url(#fs-bub-${uid})`} className="fs-arc-orb" />
            </g>
            {pop.on && (
              <g className="fs-arc-sparks" key={`s${pop.key}`}>
                <circle r="1.8" style={{ '--dx': '-15px', '--dy': '-12px' } as React.CSSProperties} />
                <circle r="1.5" style={{ '--dx': '16px', '--dy': '-10px' } as React.CSSProperties} />
                <circle r="1.3" style={{ '--dx': '2px', '--dy': '-19px' } as React.CSSProperties} />
              </g>
            )}
          </g>
        </svg>
        {stopPoints.map((p, i) => {
          const end = i === 0 || i === last;
          return (
            <span
              key={i}
              className={`fs-arc-label ${i === 0 ? 'is-start' : i === last ? 'is-end' : ''} ${i === index ? 'is-on' : ''}`}
              style={{ left: `${(p.x / ARC_W) * 100}%`, top: `${(p.y / ARC_H) * 100}%` }}
              aria-hidden="true"
            >
              <b>{DURATION_STOPS[i].label}</b>
              {end && <small>{i === 0 ? 'SHORT' : 'LONG'}</small>}
            </span>
          );
        })}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- SHEET
export default function LibraryFilterSheet({ applied, platforms, genres, platformLabel, count, onApply, onClose }: {
  applied: LibraryFilters;
  platforms: string[];
  genres: string[];
  platformLabel: (p: string) => string;
  count: (f: LibraryFilters) => number;
  onApply: (f: LibraryFilters) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<LibraryFilters>(() => normalizeFilters(applied));
  const [closing, setClosing] = useState(false);
  const [facetsOpen, setFacetsOpen] = useState(false);
  const [look, setLook] = useState<Look>(0);
  const [blink, setBlink] = useState(false);
  const lastSnap = useRef(0);
  const timers = useRef<number[]>([]);
  const facetBody = useRef<HTMLDivElement>(null);
  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const matched = useMemo(() => count(draft), [draft]);
  const pristine = activeCount(draft) === 0;

  const set = (patch: Partial<LibraryFilters>) => setDraft((d) => ({ ...d, ...patch }));
  const toggle = (key: 'platform' | 'genre', v: string) =>
    setDraft((d) => ({ ...d, [key]: d[key].includes(v) ? d[key].filter((x) => x !== v) : [...d[key], v] }));

  const feedback: Feedback = {
    onLook: (dir) => setLook((cur) => (cur === dir ? cur : dir)),
    /** Returns whether the visual pop may play; quick successive snaps only get the node glow. */
    onSnap(dragged) {
      const now = performance.now();
      const calm = now - lastSnap.current > POP_GAP_MS;
      lastSnap.current = now;
      if (!dragged || !calm) return false;
      sfx.softPop();
      haptic(14);
      if (reducedMotion()) return false;
      if (Math.random() < 0.5) {
        setBlink(true);
        later(() => setBlink(false), 160);
      }
      return true;
    },
  };

  function requestClose() {
    if (closing) return;
    setClosing(true);
    later(onClose, reducedMotion() ? 0 : 300);
  }

  function apply() {
    if (!matched) return;
    onApply(normalizeFilters(draft));
    requestClose();
  }

  function reset() {
    setDraft(normalizeFilters(defaultFilters));
  }

  /** Scrolls only the sheet (never the page behind it) so the opened chips clear the sticky footer. */
  function revealFacets() {
    const body = facetBody.current;
    const scroller = body?.closest<HTMLElement>('.sheet');
    if (!body || !scroller) return;
    const view = scroller.getBoundingClientRect();
    const footer = scroller.querySelector<HTMLElement>('.fs-footer')?.offsetHeight || 0;
    const box = body.getBoundingClientRect();
    const by = Math.min(box.bottom - (view.bottom - footer), box.top - view.top - 72);
    if (by > 0) scroller.scrollBy({ top: by, behavior: reducedMotion() ? 'auto' : 'smooth' });
  }

  function toggleFacets() {
    if (!facetsOpen) later(revealFacets, 340);
    setFacetsOpen(!facetsOpen);
  }

  const summary = summarizeFilters(draft, { platformLabel });
  const shortSummary = summarizeFilters(draft, { short: true, platformLabel });
  const facetChips = (key: 'platform' | 'genre', options: string[], label: (v: string) => string, allLabel: string) => (
    <div className="chips">
      <button type="button" className={`chip ${draft[key].length ? '' : 'selected'}`} aria-pressed={!draft[key].length} onClick={() => set({ [key]: [] })}>
        {allLabel}
      </button>
      {options.map((o) => (
        <button type="button" key={o} className={`chip ${draft[key].includes(o) ? 'selected' : ''}`} aria-pressed={draft[key].includes(o)} onClick={() => toggle(key, o)}>
          {label(o)}
        </button>
      ))}
    </div>
  );

  return (
    <BottomSheet onClose={requestClose} label="片库筛选" className="filter-sheet" hideClose closing={closing}>
      <span className="fs-watermark" aria-hidden="true">PAOPAO</span>
      <header className="fs-head">
        <div className="fs-title">
          <span className="fs-eyebrow">FILTER</span>
          <h2>
            片库筛选
            <span className="fs-mascot" aria-hidden="true">
              <PaopaoCharacter size={28} state={look < 0 ? 'look-left' : look > 0 ? 'look-right' : ''} blinking={blink} />
            </span>
          </h2>
        </div>
        <div className="fs-head-actions">
          <button type="button" className="fs-reset" onClick={reset} disabled={pristine}>重置</button>
          <button type="button" className="fs-close" aria-label="关闭" onClick={requestClose}>
            <X size={18} />
          </button>
        </div>
      </header>

      <section className="fs-block">
        <div className="fs-label"><span>SCORE</span></div>
        <ScoreRail value={draft.minRating} onChange={(v) => set({ minRating: v })} {...feedback} />
      </section>

      <section className="fs-block">
        <div className="fs-label"><span>DURATION</span><span>MIN</span></div>
        <DurationArc value={draft.maxDuration} onChange={(v) => set({ maxDuration: v })} {...feedback} />
      </section>

      <section className={`fs-facets ${facetsOpen ? 'is-open' : ''}`}>
        <button type="button" className="fs-facet-toggle" aria-expanded={facetsOpen} aria-controls="fs-facet-body" onClick={toggleFacets}>
          <span className="fs-facet-title">平台 · 类型</span>
          <span className="fs-facet-sum">
            <span className="is-full">{summary}</span>
            <span className="is-short">{shortSummary}</span>
          </span>
          <Plus size={16} className="fs-plus" aria-hidden="true" />
        </button>
        <div id="fs-facet-body" ref={facetBody} className="fs-facet-body" inert={!facetsOpen}>
          <div className="fs-facet-inner">
            <h3>平台</h3>
            {facetChips('platform', platforms, platformLabel, '全部平台')}
            <h3>类型</h3>
            {facetChips('genre', genres, (g) => g, '全部类型')}
          </div>
        </div>
      </section>

      <footer className="fs-footer">
        {matched === 0 && (
          <p className="fs-empty" role="status">
            条件有点严格，放宽一点试试。
            <button type="button" onClick={reset}>重置筛选</button>
          </p>
        )}
        <button type="button" className="fs-cta" disabled={matched === 0} onClick={apply}>
          {matched === 0 ? '没有匹配影片' : `查看 ${matched} 部结果`}
        </button>
      </footer>
    </BottomSheet>
  );
}
