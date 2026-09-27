import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronRight, Pencil, Trash2 } from 'lucide-react';
import BottomSheet from './BottomSheet';
import { blacklistId } from '../lib/blacklist.js';
import { emit as assistantEmit } from '../lib/assistantEvents.js';
import { haptic, reducedMotion, sfx } from '../lib/fx.js';
import './BlacklistTearSheet.css';

export type BlacklistEntry = { id: string; type: 'actor' | 'genre' | 'title'; name: string };
const labels = { actor: '演员', genre: '类型', title: '片名' };
const placeholders = { actor: '输入演员姓名', genre: '输入不想看的类型', title: '输入片名' };
type Change = (updater: (items: BlacklistEntry[]) => BlacklistEntry[]) => void;
type Tear = { item: BlacklistEntry; rect: DOMRect; reduced: boolean; last: boolean };
type Fresh = { id: string; mode: 'add' | 'edit' } | null;

function PaperRow({ item, disabled, onMenu, onDelete, fresh }: {
  item: BlacklistEntry; disabled: boolean; onMenu: () => void;
  onDelete: (element: HTMLElement) => void; fresh: Fresh;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const timer = useRef(0);
  const gesture = useRef<{ x: number; y: number; axis: '' | 'x' | 'y'; startOpen: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [holding, setHolding] = useState(false);
  const [swiped, setSwiped] = useState(false);
  function cancelHold() { clearTimeout(timer.current); setHolding(false); }
  useEffect(() => {
    const cancel = () => { cancelHold(); gesture.current = null; suppressClick.current = true; };
    window.addEventListener('scroll', cancel, true);
    window.addEventListener('blur', cancel);
    return () => { clearTimeout(timer.current); window.removeEventListener('scroll', cancel, true); window.removeEventListener('blur', cancel); };
  }, []);
  useEffect(() => { if (disabled) { cancelHold(); gesture.current = null; } }, [disabled]);
  return <div className={`paper-row ${swiped ? 'is-swiped' : ''} ${fresh ? `paper-row-${fresh.mode === 'add' ? 'new' : 'edited'}` : ''}`}>
    <button className="paper-swipe-delete" disabled={disabled || !swiped} tabIndex={swiped ? 0 : -1} aria-hidden={!swiped}
      aria-label={`删除 ${item.name}`} onClick={() => button.current && onDelete(button.current)}>删除</button>
    <button ref={button} disabled={disabled} className={`paper-row-face ${holding ? 'paper-holding' : ''} ${swiped ? 'paper-swiped' : ''}`}
      aria-label={`${labels[item.type]} ${item.name}，编辑或删除`} aria-haspopup="dialog"
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        if (!e.isPrimary || e.button !== 0 || disabled) return;
        suppressClick.current = false;
        gesture.current = { x: e.clientX, y: e.clientY, axis: '', startOpen: swiped };
        setHolding(true);
        const element = e.currentTarget;
        timer.current = window.setTimeout(() => {
          if (!gesture.current || disabled) return;
          suppressClick.current = true;
          cancelHold();
          gesture.current = null;
          onDelete(element);
        }, 600);
      }}
      onPointerMove={(e) => {
        const g = gesture.current;
        if (!g) return;
        const dx = e.clientX - g.x, dy = e.clientY - g.y;
        if (Math.hypot(dx, dy) > 8) { cancelHold(); suppressClick.current = true; }
        if (!g.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 12) {
          g.axis = Math.abs(dx) > Math.abs(dy) * 1.25 ? 'x' : 'y';
          if (g.axis === 'x') e.currentTarget.setPointerCapture(e.pointerId);
        }
        if (g.axis === 'x') setSwiped(dx < -40 || (g.startOpen && dx < 30));
      }}
      onPointerUp={() => { cancelHold(); gesture.current = null; }}
      onPointerCancel={() => { cancelHold(); gesture.current = null; suppressClick.current = true; }}
      onLostPointerCapture={(e) => { if (e.target === e.currentTarget) { cancelHold(); gesture.current = null; } }}
      onPointerLeave={() => { cancelHold(); }}
      onClick={(e) => {
        if (e.detail !== 0 && suppressClick.current) return;
        if (swiped) setSwiped(false); else onMenu();
      }}>
      <span className="paper-type">{labels[item.type]}</span><span className="paper-name">{item.name}</span><ChevronRight size={15} aria-hidden />
    </button>
  </div>;
}

export default function BlacklistTearSheet({ items, onChange }: { items: BlacklistEntry[]; onChange: Change }) {
  const [expanded, setExpanded] = useState(true);
  const [visibleCount, setVisibleCount] = useState(4);
  const [sheet, setSheet] = useState<'add' | 'edit' | 'menu' | ''>('');
  const [selected, setSelected] = useState<BlacklistEntry | null>(null);
  const [type, setType] = useState<BlacklistEntry['type']>('actor');
  const [name, setName] = useState('');
  const [tear, setTear] = useState<Tear | null>(null);
  const [fresh, setFresh] = useState<Fresh>(null);
  const [announcement, setAnnouncement] = useState('');
  const [emptyFrom, setEmptyFrom] = useState(0);
  const root = useRef<HTMLElement>(null);
  const lock = useRef<Tear | null>(null);
  const fallback = useRef(0);
  const freshTimer = useRef(0);
  const emptyTimer = useRef(0);
  const settleTimer = useRef(0);
  const pushed = useRef(false);
  const latest = useRef(onChange);
  latest.current = onChange;
  const paperId = useId();
  const disabled = !!tear;

  function showSheet(mode: 'add' | 'menu', item?: BlacklistEntry) {
    if (lock.current) return;
    setSelected(item || null); setName(''); setType('actor'); setSheet(mode);
    if (!pushed.current) {
      window.history.pushState({ ...window.history.state, blacklistSheet: true }, '');
      pushed.current = true;
    }
  }
  function closeSheet() {
    setSheet('');
    if (pushed.current) { pushed.current = false; window.history.back(); }
  }
  useEffect(() => {
    const back = () => { pushed.current = false; setSheet(''); };
    window.addEventListener('popstate', back);
    return () => {
      window.removeEventListener('popstate', back);
      clearTimeout(fallback.current); clearTimeout(freshTimer.current); clearTimeout(emptyTimer.current); clearTimeout(settleTimer.current);
      // Navigating away mid-animation still commits the user's explicit deletion.
      const pending = lock.current;
      if (pending) { lock.current = null; latest.current((list) => list.filter((x) => x.id !== pending.item.id)); }
    };
  }, []);
  useEffect(() => {
    clearTimeout(emptyTimer.current);
    if (items.length === 0) emptyTimer.current = window.setTimeout(() => assistantEmit('blacklist:empty'), 560);
    return () => clearTimeout(emptyTimer.current);
  }, [items.length]);
  useEffect(() => {
    if (!tear && announcement.startsWith('已删除') &&
      (document.activeElement === document.body || root.current?.contains(document.activeElement))) {
      root.current?.querySelector<HTMLButtonElement>('.paper-add')?.focus({ preventScroll: true });
    }
  }, [tear, announcement]);
  function finishDelete() {
    const pending = lock.current;
    if (!pending) return;
    lock.current = null;
    clearTimeout(fallback.current);
    if (pending.last) {
      setEmptyFrom(pending.rect.height);
      clearTimeout(settleTimer.current);
      settleTimer.current = window.setTimeout(() => setEmptyFrom(0), pending.reduced ? 180 : 650);
    }
    latest.current((list) => list.filter((x) => x.id !== pending.item.id));
    setTear(null);
    setAnnouncement(`已删除 ${pending.item.name}`);
  }
  function deleteItem(item: BlacklistEntry, element?: HTMLElement) {
    if (lock.current) return;
    const row = element || root.current?.querySelector<HTMLElement>(`[data-entry-id="${CSS.escape(item.id)}"] .paper-row-face`);
    if (!row) return;
    const pending = { item, rect: row.getBoundingClientRect(), reduced: reducedMotion(), last: items.length === 1 };
    lock.current = pending; setTear(pending);
    if (sheet) closeSheet();
    assistantEmit('blacklist:tear', { left: items.length - 1 });
    haptic([12, 25, 10]); sfx.tear();
    fallback.current = window.setTimeout(finishDelete, pending.reduced ? 240 : 1400);
  }
  function save(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || lock.current) return;
    clearTimeout(settleTimer.current); setEmptyFrom(0);
    const adding = sheet !== 'edit';
    const item = { id: !adding && selected ? selected.id : blacklistId(), type, name: trimmed };
    if (!adding) latest.current((list) => list.map((x) => x.id === item.id ? item : x));
    else {
      latest.current((list) => [...list, item]);
      setVisibleCount(Math.max(visibleCount, items.length + 1)); setExpanded(true);
      assistantEmit('blacklist:added');
    }
    setFresh({ id: item.id, mode: adding ? 'add' : 'edit' }); clearTimeout(freshTimer.current);
    freshTimer.current = window.setTimeout(() => setFresh(null), 800);
    setAnnouncement(adding ? '已添加黑名单' : '黑名单已更新');
    closeSheet();
  }

  return <section ref={root} className="blacklist-roll-section" aria-label="黑名单">
    <p className="muted paper-description">黑名单优先于所有偏好。</p>
    <div className={`tear-sheet ${expanded ? 'paper-expanded' : ''} ${items.length ? '' : 'paper-empty'} ${emptyFrom ? 'paper-empty-returning' : ''}`} style={{ '--empty-start': `${emptyFrom}px` } as React.CSSProperties}>
      <div className="paper-slot" aria-hidden="true" />
      <div className="paper-sheet">
        <div className="paper-under" aria-hidden="true" />
        <div className="paper-body">
          <button disabled={disabled} className="paper-header" aria-label={expanded ? '收起黑名单' : '展开黑名单'} aria-expanded={expanded} aria-controls={paperId}
            onClick={() => setExpanded(!expanded)}>
            <strong>黑名单</strong>
            {items.length > 0 && <span className="paper-count" aria-hidden="true">{items.length} 条</span>}
            <ChevronDown size={16} strokeWidth={2.2} aria-hidden="true" />
          </button>
          <div className="paper-reveal" id={paperId} inert={!expanded} aria-hidden={!expanded}>
            <div className="paper-clip"><div className="paper-web">
              {items.length === 0 ? <div className="paper-empty-slot"><p className="paper-empty-message">没有不喜欢的，今天心情不错</p></div> :
                items.slice(0, visibleCount).map((item) => <div key={item.id} data-entry-id={item.id}
                  className={`paper-row-slot ${tear?.item.id === item.id ? `paper-removing ${tear.last ? 'paper-removing-last' : ''}` : ''}`}>
                  <div><PaperRow item={item} disabled={disabled} fresh={fresh?.id === item.id ? fresh : null} onMenu={() => showSheet('menu', item)} onDelete={(element) => deleteItem(item, element)} /></div>
                </div>)}
              {items.length > visibleCount && <button className="paper-more" disabled={disabled} onClick={() => setVisibleCount((n) => n + 4)}>
                继续拉纸 · 还有 {items.length - visibleCount} 条<ChevronDown size={14} aria-hidden />
              </button>}
              <button className="paper-add" disabled={disabled} onClick={() => showSheet('add')}>{items.length ? '＋ 添加黑名单' : '＋ 添加第一条'}</button>
            </div></div>
          </div>
        </div>
        <div className="paper-edge" aria-hidden="true" />
      </div>
    </div>
    <span className="paper-sr" role="status" aria-live="polite">{announcement}</span>
    {sheet && <BottomSheet label={sheet === 'menu' ? '黑名单操作' : sheet === 'edit' ? '编辑黑名单' : '添加黑名单'} onClose={closeSheet}>
      {sheet === 'menu' && selected ? <div className="blacklist-sheet">
        <h2>{selected.name}</h2>
        <button className="menu-row" aria-label={`编辑 ${selected.name}`} onClick={() => { setName(selected.name); setType(selected.type); setSheet('edit'); }}><Pencil size={18} />编辑<ChevronRight size={16} /></button>
        <button className="menu-row paper-danger" disabled={disabled} aria-label={`删除 ${selected.name}`} onClick={() => deleteItem(selected)}><Trash2 size={18} />删除<ChevronRight size={16} /></button>
      </div> : <form className="blacklist-sheet" onSubmit={save}>
        <h2>{sheet === 'edit' ? '编辑黑名单' : '添加黑名单'}</h2>
        <fieldset><legend>类型</legend><div className="blacklist-types">
          {(Object.keys(labels) as BlacklistEntry['type'][]).map((value) => <label key={value}>
            <input type="radio" name="blacklist-type" value={value} checked={type === value} onChange={() => setType(value)} /><span>{labels[value]}</span>
          </label>)}
        </div></fieldset>
        <label className="blacklist-name">名称<input autoFocus value={name} maxLength={100} placeholder={placeholders[type]} onChange={(e) => setName(e.target.value)} /></label>
        <button className="primary" disabled={!name.trim()} type="submit">{sheet === 'edit' ? '保存' : '添加'}</button>
      </form>}
    </BottomSheet>}
    {tear && createPortal(<div className={`paper-tear-layer ${tear.reduced ? 'paper-tear-reduced' : ''}`} aria-hidden="true"
      style={{ left: tear.rect.left, top: tear.rect.top, width: tear.rect.width, height: tear.rect.height }}>
      <div className="paper-torn-piece" onAnimationEnd={(e) => { if (e.target === e.currentTarget) finishDelete(); }}>
        <div className="paper-scrap">
          <span className="paper-type">{labels[tear.item.type]}</span><span className="paper-name">{tear.item.name}</span><ChevronRight size={15} />
        </div>
      </div>
    </div>, document.body)}
  </section>;
}
