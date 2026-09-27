import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PaopaoCharacter from './PaopaoCharacter';
import PaopaoChatSheet, { ChatMessage, ChatStatus } from './PaopaoChatSheet';
import PaopaoState, { baseForRequest } from '../lib/paopaoState.js';
import { pickLine } from '../lib/paopaoDialogue.js';
import { buildPaopaoContext, quickPrompts } from '../lib/paopaoContext.js';
import { ACTION_LABEL, validateAction } from '../lib/paopaoActions.js';
import {
  CHAT_ENDPOINT, loadConversation, messageId, saveConversation, clearConversation, streamChat, trimHistory,
} from '../lib/paopaoChat.js';
import { haptic, reducedMotion, sfx } from '../lib/fx.js';
import { onMany } from '../lib/assistantEvents.js';
import { animateSpring, claimGesture, clamp, createVelocity, nearestEdge, ownsGesture, releaseGesture } from '../lib/fluid.js';
import './PaopaoAssistant.css';

const BALL = 56;
const DOCK_SCALE = 0.8;
const CHAT_SCALE = 0.68;
const random = (min: number, max: number) => min + Math.random() * (max - min);

export type AssistantSnapshot = {
  page: string; mode: string; mood: string; mbti: string; currentMovie?: any; currentInWatchlist?: boolean;
  candidates?: any[]; blacklist?: { type: string; name: string }[]; likedTags?: string[]; recentTags?: string[];
};
type Props = {
  snapshot: AssistantSnapshot; hidden: boolean; accent?: string; moods: string[]; movieIds: number[];
  movieById: (id: number) => any; inWatch: (id: number) => boolean;
  actions: Record<string, (params: any) => void>;
};

type Placement = { x: number; y: number; scale: number };

/** Avoidance is preset per state instead of live collision detection: cheap and predictable. */
function placeBall(mode: 'docked' | 'floating' | 'chat', page: string, side: 'right' | 'left'): Placement {
  if (mode === 'chat') {
    const slot = document.querySelector('[data-paopao-morph="target"]')?.getBoundingClientRect();
    if (slot?.width) return { x: slot.left, y: slot.top, scale: slot.width / BALL };
  }
  if (mode === 'docked') {
    const logo = document.querySelector('.topbar .logo')?.getBoundingClientRect();
    if (logo?.width) {
      // Peeks out past the end of the wordmark, and stays clear of the top-right icon buttons.
      return {
        x: Math.min(logo.right + 2, window.innerWidth - BALL * DOCK_SCALE - 96),
        y: Math.max(2, logo.top - 12),
        scale: DOCK_SCALE,
      };
    }
  }
  const margin = 12;
  // Keep clear of the tab bar, and sit higher on the result page so the primary CTA stays free.
  const bottomSafe = 118;
  const y = Math.min(window.innerHeight - BALL - bottomSafe, window.innerHeight * (page === '/result' ? 0.4 : 0.56));
  return { x: side === 'right' ? window.innerWidth - BALL - margin : margin, y: Math.max(64, y), scale: 1 };
}

export default function PaopaoAssistant({ snapshot, hidden, accent, moods, movieIds, movieById, inWatch, actions }: Props) {
  const machine = useMemo(() => new PaopaoState(Date.now()), []);
  const [face, setFace] = useState(() => machine.snapshot().className);
  const [blinking, setBlinking] = useState(false);
  const [mode, setMode] = useState<'docked' | 'floating'>('docked');
  const [side, setSide] = useState<'right' | 'left'>('right');
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<Placement>({ x: -999, y: -999, scale: DOCK_SCALE });
  const [placed, setPlaced] = useState(false);
  const [bubble, setBubble] = useState<{ text: string; ask?: string } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadConversation());
  const [status, setStatus] = useState<ChatStatus>('idle');
  const [error, setError] = useState('');
  const [unread, setUnread] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ name: string; params: any; label: string } | null>(null);

  const ballRef = useRef<HTMLButtonElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; ox: number; oy: number; moved: boolean } | null>(null);
  const hold = useRef({ x: 0, y: 0, v: 0, spring: null as { stop: () => { x: number; v: number } } | null });
  const speed = useRef(createVelocity());
  const [held, setHeld] = useState(false);
  const seen = useRef(new Map<string, number>());
  const bubbleTimer = useRef(0);
  const idleTimer = useRef(0);
  const blinkTimer = useRef(0);
  const request = useRef<AbortController | null>(null);
  const live = useRef({ snapshot, actions, open, status, moods, movieIds });
  live.current = { snapshot, actions, open, status, moods, movieIds };

  useEffect(() => machine.subscribe((next: any) => setFace(next.className)), [machine]);
  useEffect(() => void saveConversation(messages), [messages]);

  // ---------- placement ----------
  const reposition = useCallback(() => {
    if (drag.current) return;
    setPlace(placeBall(live.current.open ? 'chat' : mode, live.current.snapshot.page, side));
  }, [mode, side]);

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const scrolled = (window.scrollY || document.documentElement.scrollTop || 0) > 96;
        setMode((current) => {
          if (scrolled && current === 'docked') {
            machine.fire('peek', Date.now());
            return 'floating';
          }
          return scrolled ? current : 'docked';
        });
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', reposition);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', reposition);
    };
  }, [machine, reposition]);

  useEffect(() => {
    // The target only exists once the sheet mounts and keeps moving while it slides in, so
    // follow it for a few frames instead of trusting a single measurement.
    let frame = 0;
    let stable = 0;
    let previous = '';
    const follow = () => {
      const next = placeBall(open ? 'chat' : mode, live.current.snapshot.page, side);
      const key = `${Math.round(next.x)}:${Math.round(next.y)}`;
      stable = key === previous ? stable + 1 : 0;
      previous = key;
      setPlace(next);
      if (stable < 3) frame = requestAnimationFrame(follow);
    };
    frame = requestAnimationFrame(follow);
    return () => cancelAnimationFrame(frame);
  }, [open, mode, side, snapshot.page, hidden]);

  useLayoutEffect(() => {
    // Measure before the first paint, and keep transitions off so nothing flies in from 0,0.
    reposition();
    const frame = requestAnimationFrame(() => setPlaced(true));
    return () => cancelAnimationFrame(frame);
  }, [reposition]);

  // ---------- expiring reactions, blinking, idle behaviour ----------
  useEffect(() => {
    let timer = 0;
    const tick = () => {
      const deadline = machine.nextDeadline();
      if (!deadline) return;
      timer = window.setTimeout(() => {
        machine.sweep(Date.now());
        tick();
      }, Math.max(60, deadline - Date.now()));
    };
    const unsubscribe = machine.subscribe(() => {
      clearTimeout(timer);
      tick();
    });
    tick();
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [machine]);

  useEffect(() => {
    if (reducedMotion()) return;
    const schedule = () => {
      blinkTimer.current = window.setTimeout(() => {
        const base = machine.snapshot().base;
        if (!document.hidden && base !== 'thinking' && base !== 'speaking') {
          setBlinking(true);
          window.setTimeout(() => setBlinking(false), 160);
        }
        schedule();
      }, random(8000, 15000));
    };
    schedule();
    return () => clearTimeout(blinkTimer.current);
  }, [machine]);

  const say = useCallback((trigger: string, mood = '') => {
    const now = Date.now();
    const line = pickLine(trigger, { mood, now, seen: seen.current });
    if (!line || live.current.open) return;
    seen.current.set(line.id, now);
    setBubble({ text: line.text, ask: line.ask });
    sfx.tap();
    clearTimeout(bubbleTimer.current);
    bubbleTimer.current = window.setTimeout(() => setBubble(null), 4600);
  }, []);

  const restIdle = useCallback(() => {
    clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => {
      if (document.hidden || live.current.open) return;
      const now = Date.now();
      if (machine.fire('yawn', now)) machine.setBase('sleepy', now);
      say('idle');
    }, random(45000, 90000));
  }, [machine, say]);

  useEffect(() => {
    const wake = () => {
      if (machine.snapshot().base === 'sleepy') machine.setBase('idle', Date.now());
      restIdle();
    };
    const onVisible = () => (document.hidden ? clearTimeout(idleTimer.current) : restIdle());
    document.addEventListener('pointerdown', wake, { passive: true });
    document.addEventListener('visibilitychange', onVisible);
    restIdle();
    return () => {
      clearTimeout(idleTimer.current);
      document.removeEventListener('pointerdown', wake);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [machine, restIdle]);

  // ---------- app events ----------
  useEffect(() => void machine.setMood(snapshot.mode === 'mood' ? snapshot.mood : ''), [machine, snapshot.mode, snapshot.mood]);

  useEffect(() => onMany({
    'mood:selected': (mood: string) => {
      machine.setMood(mood);
      say('mood:selected', mood);
    },
    'open:ready': () => say('open:ready'),
    'open:charging': () => machine.setModifier('size', 'small'),
    'open:threshold': () => {
      machine.setModifier('size', '');
      machine.fire('excited', Date.now());
    },
    'movie:revealed': (detail: any) => {
      machine.setModifier('size', '');
      machine.fire(detail?.rarity === 'SSR' ? 'excited' : 'lookAtCard', Date.now());
      say(detail?.rarity === 'SSR' ? 'movie:ssr' : 'movie:revealed');
    },
    'watchlist:added': () => {
      machine.fire('happy', Date.now());
      say('watchlist:added');
    },
    'checkin:success': () => {
      machine.fire('happy', Date.now());
      say('checkin:success');
    },
    'blacklist:added': () => machine.fire('happy', Date.now()),
    'blacklist:tear': () => machine.fire('surprised', Date.now()),
    'blacklist:empty': () => machine.fire('lookAtCard', Date.now()),
  }), [machine, say]);

  useEffect(() => {
    if (!messages.length) say('session:return');
    // Only on mount: a greeting on every re-render would be noise.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- AI request ----------
  /** Second gate: the proxy already validated, the client refuses anything unexpected again. */
  const runAction = useCallback((raw: { name: string; params: any }) => {
    const { snapshot: current, actions: handlers, moods: moodKeys, movieIds: ids } = live.current;
    const verified = validateAction(raw, { moods: moodKeys, movieIds: ids });
    if (!verified.ok) return;
    const { name, params, risk } = verified.action;
    if (risk === 'confirm') {
      setPendingAction({ name, params, label: `${ACTION_LABEL[name]}「${params.name}」` });
      return;
    }
    const handler = handlers[name];
    if (!handler) return;
    if (['openMovie', 'openCheckin'].includes(name)) setOpen(false);
    handler({ ...params, page: current.page });
    machine.fire('success', Date.now());
  }, [machine]);

  const ask = useCallback(async (text: string, replaceLast = false) => {
    if (request.current) return;
    const now = Date.now();
    setError('');
    setPendingAction(null);
    // Retry re-sends the existing user turn instead of duplicating it in the transcript.
    const lastUser = messages.map((m) => m.role).lastIndexOf('user');
    const outgoing: ChatMessage[] = replaceLast && lastUser >= 0
      ? messages.slice(0, lastUser + 1)
      : [...messages, { id: messageId(), role: 'user', content: text }];
    const context = buildPaopaoContext(text, live.current.snapshot) as any;
    setMessages(outgoing);
    setStatus('pending');
    machine.setBase('thinking', now);
    const controller = new AbortController();
    request.current = controller;
    const replyId = messageId();
    const action = { current: null as null | { name: string; params: any } };
    let streamed = '';
    const result = await streamChat({
      endpoint: CHAT_ENDPOINT,
      messages: trimHistory(outgoing),
      context,
      signal: controller.signal,
      onEvent: (event: any) => {
        if (event.type === 'delta' && typeof event.text === 'string') {
          if (!streamed) {
            setStatus('streaming');
            machine.setBase('speaking', Date.now());
            setMessages((list) => [...list, { id: replyId, role: 'assistant', content: event.text }]);
            streamed = event.text;
            return;
          }
          streamed += event.text;
          setMessages((list) => list.map((m) => (m.id === replyId ? { ...m, content: streamed } : m)));
        } else if (event.type === 'action' && event.name) {
          action.current = { name: event.name, params: event.params };
        }
      },
    });
    request.current = null;
    machine.setBase('chatIdle', Date.now());
    if (result.aborted) {
      setStatus('aborted');
      setMessages((list) => list.map((m) => (m.id === replyId ? { ...m, aborted: true } : m)));
      return;
    }
    if (result.error) {
      setStatus('error');
      setError(result.error);
      machine.fire('sad', Date.now());
      if (!live.current.open) setUnread(true);
      return;
    }
    setStatus('idle');
    // Cards only appear when the answer actually names films from the catalogue shortlist.
    const mentioned = [...(context.candidates || []), ...(context.currentMovie ? [context.currentMovie] : [])]
      .filter((movie: any) => movie?.title && streamed.includes(movie.title)).slice(0, 3).map((movie: any) => movie.id);
    if (mentioned.length) setMessages((list) => list.map((m) => (m.id === replyId ? { ...m, movieIds: mentioned } : m)));
    if (action.current) runAction(action.current);
    if (!live.current.open) setUnread(true);
  }, [machine, messages, runAction]);

  const stop = useCallback(() => {
    request.current?.abort();
    request.current = null;
    setStatus('aborted');
  }, []);

  const openChat = useCallback((prefill?: string) => {
    setBubble(null);
    setUnread(false);
    haptic(10);
    setOpen(true);
    if (prefill) setTimeout(() => ask(prefill), 240);
  }, [ask]);

  const closeChat = useCallback(() => {
    // A running answer keeps going in the background; the ball shows the working state.
    setOpen(false);
    setTimeout(() => ballRef.current?.focus({ preventScroll: true }), 0);
  }, []);

  const paintBall = (x: number, y: number, jellyX = 1, jellyY = 1) => {
    hold.current.x = x; hold.current.y = y;
    const el = layerRef.current;
    if (!el) return;
    el.style.setProperty('--paopao-x', `${x}px`);
    el.style.setProperty('--paopao-y', `${y}px`);
    el.style.setProperty('--paopao-jelly-x', String(jellyX));
    el.style.setProperty('--paopao-jelly-y', String(jellyY));
  };
  const stopBall = () => {
    hold.current.spring?.stop();
    hold.current.spring = null;
    return hold.current;
  };
  const snapBall = (vx: number, vy: number) => {
    const destY = clamp(hold.current.y + vy * 0.08, 64, window.innerHeight - BALL - 118);
    const destX = nearestEdge(hold.current.x + vx * 0.14, window.innerWidth, BALL, 12);
    setSide(destX < window.innerWidth / 2 ? 'left' : 'right');
    setMode('floating');
    stopBall();
    hold.current.spring = animateSpring({
      from: hold.current.x, to: destX, velocity: vx, tension: 210, friction: 20,
      onUpdate: (x) => paintBall(x, hold.current.y),
      onComplete: () => {
        hold.current.spring = null;
        setPlace({ x: destX, y: destY, scale: 1 });
        setHeld(false);
      },
    });
    animateSpring({
      from: hold.current.y, to: destY, velocity: vy, tension: 260, friction: 26,
      onUpdate: (y) => paintBall(hold.current.x, y),
    });
  };
  const onBallDown = (e: React.PointerEvent) => {
    if (open || (e.pointerType === 'mouse' && e.button !== 0)) return;
    stopBall();
    setHeld(true);
    setBlinking(false);
    const start = layerRef.current?.getBoundingClientRect();
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, ox: start?.left ?? place.x, oy: start?.top ?? place.y, moved: false };
    speed.current.reset();
    speed.current.add(e.clientX, e.clientY);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* */ }
    claimGesture(e.pointerId, 'ball');
  };
  const onBallMove = (e: React.PointerEvent) => {
    const g = drag.current;
    if (!g || g.id !== e.pointerId || !ownsGesture(e.pointerId, 'ball')) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (!g.moved && Math.hypot(dx, dy) < 8) return;
    g.moved = true;
    setMode('floating');
    speed.current.add(e.clientX, e.clientY);
    const { vx, vy } = speed.current.read();
    const jellyX = clamp(1 + vx / 4200, 0.94, 1.06);
    const jellyY = clamp(1 + vy / 4200, 0.94, 1.06);
    paintBall(g.ox + dx, clamp(g.oy + dy, 8, window.innerHeight - BALL - 24), jellyX, 2 - jellyY);
  };
  const onBallUp = (e: React.PointerEvent) => {
    const g = drag.current;
    if (!g || g.id !== e.pointerId) return;
    drag.current = null;
    releaseGesture(e.pointerId, 'ball');
    if (!g.moved) { setHeld(false); openChat(); return; }
    const { vx, vy } = speed.current.read();
    snapBall(vx, vy);
  };

  const prompts = useMemo(() => quickPrompts(snapshot), [snapshot]);
  const invisible = hidden || (place.x < -100);
  const busy = status === 'pending' || status === 'streaming';

  return <>
    {createPortal(<div ref={layerRef} data-gesture="ball" className={`paopao-layer ${open ? 'is-chat' : `is-${mode}`} ${invisible ? 'is-hidden' : ''} ${placed ? '' : 'is-fixing'} ${held ? 'is-held' : ''}`}
      style={{
        '--paopao-x': `${place.x}px`, '--paopao-y': `${place.y}px`, '--paopao-scale': place.scale,
        '--paopao-accent': accent || 'var(--mood-a)',
      } as React.CSSProperties}>
      <button ref={ballRef} className={`paopao-ball ${busy ? 'is-busy' : ''} ${unread ? 'has-news' : ''}`}
        aria-label={busy ? '泡泡正在回答，点击查看' : '打开泡泡 AI 助手'} aria-expanded={open} aria-haspopup="dialog"
        tabIndex={open ? -1 : 0}
        onPointerDown={onBallDown} onPointerMove={onBallMove}
        onPointerUp={onBallUp} onPointerCancel={onBallUp}>
        <PaopaoCharacter state={face} blinking={blinking} size={BALL} />
        {unread && <span className="paopao-dot" aria-hidden />}
      </button>
      {bubble && !open && <div className="paopao-bubble" role="status">
        {bubble.ask
          ? <button onClick={() => openChat(bubble.ask)}>{bubble.text}</button>
          : <span>{bubble.text}</span>}
      </div>}
    </div>, document.body)}

    {open && <PaopaoChatSheet messages={messages} status={status} error={error} face={face} prompts={prompts}
      movieById={movieById} inWatch={inWatch} pending={pendingAction}
      onSend={(text) => ask(text)} onStop={stop}
      onRetry={() => {
        const lastUser = [...messages].reverse().find((m) => m.role === 'user');
        if (lastUser) ask(lastUser.content, true);
      }}
      onNewChat={() => {
        setMessages([]);
        clearConversation();
        setStatus('idle');
        setError('');
        setPendingAction(null);
      }}
      onClose={closeChat}
      onOpenMovie={(id) => {
        setOpen(false);
        actions.openMovie?.({ movieId: id });
      }}
      onToggleWatch={(id) => {
        actions[inWatch(id) ? 'removeWatchlist' : 'addWatchlist']?.({ movieId: id });
        machine.fire('happy', Date.now());
      }}
      onConfirmPending={() => {
        if (!pendingAction) return;
        setOpen(false);
        actions[pendingAction.name]?.(pendingAction.params);
        setPendingAction(null);
      }}
      onDismissPending={() => setPendingAction(null)} />}
  </>;
}
