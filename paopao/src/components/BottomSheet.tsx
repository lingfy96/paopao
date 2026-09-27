import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { animateSpring, axisOf, claimGesture, createVelocity, ownsGesture, releaseGesture, rubberBand, shouldCommit } from '../lib/fluid.js';

/** Shared visual shell, with keyboard focus containment and background scroll lock. */
export default function BottomSheet({ children, onClose, label = '操作菜单', className = '', hideClose = false, closing = false }: {
  children: React.ReactNode; onClose: () => void; label?: string; className?: string; hideClose?: boolean; closing?: boolean;
}) {
  const panel = useRef<HTMLElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const drag = useRef<{ id: number; x: number; y: number; origin: number; axis: '' | 'x' | 'y' } | null>(null);
  const motion = useRef({ y: 0, spring: null as { stop: () => { x: number; v: number } } | null });
  const speed = useRef(createVelocity());

  const paint = (y: number) => {
    motion.current.y = y;
    const el = backdrop.current;
    if (!el) return;
    el.style.setProperty('--sheet-y', `${Math.max(0, y)}px`);
    el.style.setProperty('--sheet-dim', String(Math.max(0.35, 1 - Math.max(0, y) / 420)));
  };
  const stop = () => { motion.current.spring?.stop(); motion.current.spring = null; };

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const element = panel.current!;
    const focusable = () => Array.from(element.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea, select, a[href], [tabindex="0"]')).filter((e) => e.getClientRects().length);
    (element.querySelector<HTMLElement>('[autofocus]') || focusable()[0] || element).focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); closeRef.current(); }
      if (e.key !== 'Tab') return;
      const list = focusable();
      const first = list[0], last = list.at(-1);
      if (!first) { e.preventDefault(); element.focus(); }
      else if (e.shiftKey && (document.activeElement === first || !element.contains(document.activeElement))) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !element.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', onKey, true);
      stop();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  function down(e: React.PointerEvent, force = false) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (!force && (panel.current?.scrollTop || 0) > 2) return;
    stop();
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, origin: motion.current.y, axis: force ? 'y' : '' };
    speed.current.reset();
    speed.current.add(0, e.clientY);
    backdrop.current?.classList.add('is-dragging');
  }
  function move(e: React.PointerEvent) {
    const g = drag.current;
    if (!g || g.id !== e.pointerId) return;
    const dy = e.clientY - g.y;
    if (!g.axis) {
      g.axis = axisOf(e.clientX - g.x, dy);
      if (g.axis === 'x') { drag.current = null; backdrop.current?.classList.remove('is-dragging'); return; }
      if (g.axis !== 'y') return;
      if (!claimGesture(e.pointerId, 'sheet')) { drag.current = null; return; }
      try { panel.current?.setPointerCapture(e.pointerId); } catch { /* */ }
    }
    if (g.axis !== 'y' || !ownsGesture(e.pointerId, 'sheet')) return;
    speed.current.add(0, e.clientY);
    paint(dy < 0 ? -rubberBand(-dy, 160) : g.origin + dy);
  }
  function up(e: React.PointerEvent, cancelled = false) {
    const g = drag.current;
    if (!g || g.id !== e.pointerId) return;
    drag.current = null;
    releaseGesture(e.pointerId, 'sheet');
    backdrop.current?.classList.remove('is-dragging');
    const { vy } = speed.current.read();
    const h = panel.current?.offsetHeight || 400;
    const commit = !cancelled && g.axis === 'y' && shouldCommit(motion.current.y, vy, h, 0.22, 850) > 0;
    if (commit) {
      backdrop.current?.classList.add('is-settling');
      motion.current.spring = animateSpring({
        from: motion.current.y, to: h + 40, velocity: Math.max(vy, 400),
        onUpdate: paint, onComplete: () => closeRef.current(),
      });
    } else {
      backdrop.current?.classList.add('is-settling');
      motion.current.spring = animateSpring({
        from: motion.current.y, to: 0, velocity: vy,
        onUpdate: paint, onComplete: () => backdrop.current?.classList.remove('is-settling'),
      });
    }
  }

  return createPortal(<div ref={backdrop} data-gesture="sheet" className={`modal-backdrop ${className ? className + '-backdrop' : ''} ${closing ? 'is-closing' : ''}`}
    style={{ '--sheet-y': '0px', '--sheet-dim': '1' } as React.CSSProperties} onClick={onClose}>
    <section ref={panel} className={`sheet ${className} ${closing ? 'is-closing' : ''}`} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => down(e)} onPointerMove={move} onPointerUp={(e) => up(e)} onPointerCancel={(e) => up(e, true)}>
      {!hideClose && <button className="close icon-btn" aria-label="关闭" onClick={onClose}><X size={20} /></button>}
      {!hideClose && <div className="sheet-handle" onPointerDown={(e) => down(e, true)} />}
      {children}
    </section>
  </div>, document.body);
}
