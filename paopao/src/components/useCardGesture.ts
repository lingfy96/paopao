import React, { useEffect, useRef } from 'react';

const THRESHOLD = 110;

/**
 * Drag the result card: horizontal drag tilts it in 3D; pulling down past THRESHOLD (only when the page
 * is scrolled to the top, so normal scrolling never triggers it) fires onSwipeDown.
 */
export default function useCardGesture(enabled: boolean, onSwipeDown: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const live = useRef({ enabled, onSwipeDown });
  live.current = { enabled, onSwipeDown };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let active = false;
    let sx = 0, sy = 0, dx = 0, dy = 0, startScroll = 0;

    const paint = (x: number, y: number, settle: boolean) => {
      el.style.transition = settle ? 'transform 0.5s cubic-bezier(0.34,1.56,0.64,1)' : 'none';
      if (!x && !y) {
        el.style.transform = '';
        return;
      }
      const ry = Math.max(-18, Math.min(18, x * 0.12));
      const pull = Math.max(0, y);
      el.style.transform = `translateY(${pull * 0.45}px) rotateX(${-Math.min(12, pull * 0.06)}deg) rotateY(${ry}deg)`;
    };
    const start = (x: number, y: number) => {
      if (!live.current.enabled) return;
      active = true;
      sx = x;
      sy = y;
      dx = dy = 0;
      startScroll = window.scrollY || document.documentElement.scrollTop || 0;
    };
    const move = (x: number, y: number) => {
      if (!active) return;
      dx = x - sx;
      dy = y - sy;
      const pull = startScroll <= 4 ? dy : 0;
      paint(dx, pull, false);
      el.classList.toggle('armed', pull > THRESHOLD && Math.abs(dx) < pull * 0.8);
    };
    const end = () => {
      if (!active) return;
      active = false;
      const fire = startScroll <= 4 && dy > THRESHOLD && Math.abs(dx) < dy * 0.8;
      el.classList.remove('armed');
      paint(0, 0, true);
      if (fire && live.current.enabled) live.current.onSwipeDown();
    };

    const ts = (e: TouchEvent) => e.touches.length === 1 && start(e.touches[0].clientX, e.touches[0].clientY);
    const tm = (e: TouchEvent) => e.touches.length === 1 && move(e.touches[0].clientX, e.touches[0].clientY);
    const pd = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      start(e.clientX, e.clientY);
      const pm = (ev: PointerEvent) => move(ev.clientX, ev.clientY);
      const pu = () => {
        end();
        window.removeEventListener('pointermove', pm);
        window.removeEventListener('pointerup', pu);
      };
      window.addEventListener('pointermove', pm);
      window.addEventListener('pointerup', pu);
    };
    el.addEventListener('touchstart', ts, { passive: true });
    el.addEventListener('touchmove', tm, { passive: true });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    el.addEventListener('pointerdown', pd);
    return () => {
      el.removeEventListener('touchstart', ts);
      el.removeEventListener('touchmove', tm);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', end);
      el.removeEventListener('pointerdown', pd);
    };
  }, []);

  return ref;
}

export function GestureCard({ enabled, onSwipeDown, children }: { enabled: boolean; onSwipeDown: () => void; children: React.ReactNode }) {
  const ref = useCardGesture(enabled, onSwipeDown);
  return React.createElement('div', { ref, className: 'gesture-card' }, children);
}
