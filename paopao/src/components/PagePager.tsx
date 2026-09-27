import React, { useEffect, useRef } from 'react';
import {
  animateSpring, axisOf, claimGesture, clamp, gestureKind, isEdgeX, isInteractive, ownsGesture,
  releaseGesture, rubberBand, shouldCommit, createVelocity,
} from '../lib/fluid.js';

type Props = {
  index: number;
  count?: number;
  onIndex: (index: number) => void;
  onProgress?: (progress: number) => void;
  children: React.ReactNode;
};

export default function PagePager({ index, count = 3, onIndex, onProgress, children }: Props) {
  const view = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const live = useRef({ index, onIndex, onProgress, count });
  live.current = { index, onIndex, onProgress, count };
  const motion = useRef({ x: 0, v: 0, width: 0, spring: null as { stop: () => { x: number; v: number } } | null });
  const drag = useRef<{ id: number; x: number; y: number; origin: number; axis: '' | 'x' | 'y' } | null>(null);
  const speed = useRef(createVelocity());

  const widthOf = () => motion.current.width || view.current?.clientWidth || window.innerWidth;
  const paint = (x: number, v = 0) => {
    motion.current.x = x;
    motion.current.v = v;
    if (track.current) track.current.style.transform = `translate3d(${x}px,0,0)`;
    live.current.onProgress?.(-x / Math.max(1, widthOf()));
  };
  const restX = (i = live.current.index) => -i * widthOf();
  const stopSpring = () => {
    if (motion.current.spring) {
      const last = motion.current.spring.stop();
      motion.current.spring = null;
      motion.current.x = last.x;
      motion.current.v = last.v;
    }
    return motion.current;
  };
  const bound = (raw: number) => {
    const w = widthOf(), min = -(live.current.count - 1) * w;
    if (raw > 0) return rubberBand(raw, w);
    if (raw < min) return min - rubberBand(min - raw, w);
    return raw;
  };
  const settle = (to: number, velocity = 0) => {
    const next = clamp(to, 0, live.current.count - 1);
    const target = restX(next);
    stopSpring();
    motion.current.spring = animateSpring({
      from: motion.current.x, to: target, velocity,
      onUpdate: paint,
      onComplete: () => {
        motion.current.spring = null;
        paint(target, 0);
        if (next !== live.current.index) live.current.onIndex(next);
      },
    });
  };

  useEffect(() => {
    const measure = () => {
      motion.current.width = view.current?.clientWidth || window.innerWidth;
      if (!drag.current) paint(restX(), 0);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (view.current) ro.observe(view.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => { if (!drag.current) settle(index, 0); }, [index]);
  useEffect(() => () => { stopSpring(); }, []);

  function down(e: React.PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const kind = gestureKind(e.target as Element);
    if (kind && kind !== 'page' && !isEdgeX(e.clientX, widthOf())) return;
    if (isInteractive(e.target) && !isEdgeX(e.clientX, widthOf())) return;
    const last = stopSpring();
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, origin: last.x, axis: '' };
    speed.current.reset();
    speed.current.add(e.clientX, e.clientY);
  }
  function move(e: React.PointerEvent) {
    const g = drag.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (!g.axis) {
      g.axis = axisOf(dx, dy);
      if (g.axis === 'y') { drag.current = null; return; }
      if (g.axis !== 'x') return;
      if (!claimGesture(e.pointerId, 'page')) { drag.current = null; return; }
      try { view.current?.setPointerCapture(e.pointerId); } catch { /* released */ }
    }
    if (g.axis !== 'x' || !ownsGesture(e.pointerId, 'page')) return;
    speed.current.add(e.clientX, e.clientY);
    paint(bound(g.origin + dx));
  }
  function up(e: React.PointerEvent, cancelled = false) {
    const g = drag.current;
    if (!g || g.id !== e.pointerId) return;
    drag.current = null;
    releaseGesture(e.pointerId, 'page');
    const { vx } = speed.current.read();
    const w = widthOf();
    const delta = motion.current.x - restX();
    const dir = cancelled || g.axis !== 'x' ? 0 : shouldCommit(delta, vx, w);
    settle(live.current.index - dir, vx);
  }

  return <div ref={view} className="pager" data-gesture="page"
    onPointerDown={down} onPointerMove={move}
    onPointerUp={(e) => up(e)} onPointerCancel={(e) => up(e, true)}>
    <div ref={track} className="pager-track">
      {React.Children.map(children, (child, i) =>
        <div className="pager-pane" data-pane={i} inert={i !== index || undefined}>{child}</div>)}
    </div>
  </div>;
}
