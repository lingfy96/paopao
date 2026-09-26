import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/** Shared visual shell, with keyboard focus containment and background scroll lock. */
export default function BottomSheet({ children, onClose, label = '操作菜单' }: {
  children: React.ReactNode; onClose: () => void; label?: string;
}) {
  const panel = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
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
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(<div className="modal-backdrop" onClick={onClose}>
    <section ref={panel} className="sheet" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
      <button className="close icon-btn" aria-label="关闭" onClick={onClose}><X size={20} /></button>
      <div className="sheet-handle" />
      {children}
    </section>
  </div>, document.body);
}
