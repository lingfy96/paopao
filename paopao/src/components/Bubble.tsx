import React, { useEffect, useRef, useState } from 'react';
import { haptic, reducedMotion, sfx, unlockAudio } from '../lib/fx.js';
import { emit } from '../lib/assistantEvents.js';

const CHARGE_MS = 1500;
const OVERHOLD_MS = 450;
const PARTNER_WAIT_MS = 1500;
const SOLO_CAP = 0.6;

type Props = {
  onOpen: () => void;
  disabled?: boolean;
  idleLabel: string;
  hint: string;
  couple?: boolean;
};

type Phase = 'idle' | 'charging' | 'pop';
type Side = 'L' | 'R';

export function Burst({ count = 14, gold = false }: { count?: number; gold?: boolean }) {
  return (
    <span className={'burst' + (gold ? ' gold' : '')} aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <i key={i} style={{ '--a': `${(360 / count) * i + (i % 2) * 9}deg`, '--d': `${70 + (i % 3) * 26}px` } as any} />
      ))}
    </span>
  );
}

const DECO = [
  { left: 4, size: 26, dur: 9, delay: 0 },
  { left: 14, size: 14, dur: 7, delay: -3 },
  { left: 84, size: 20, dur: 8, delay: -1.5 },
  { left: 92, size: 12, dur: 6.5, delay: -4.5 },
  { left: 76, size: 16, dur: 10, delay: -6 },
  { left: 8, size: 18, dur: 11, delay: -7.5 },
];

/** Small floating bubbles around the main one; tap to pop, they respawn. */
function DecoBubbles() {
  const [popped, setPopped] = useState<Record<number, number>>({});
  const [gen, setGen] = useState<Record<number, number>>({});
  function pop(i: number) {
    if (popped[i]) return;
    sfx.tap();
    haptic(8);
    setPopped((p) => ({ ...p, [i]: Date.now() }));
    window.setTimeout(() => {
      setPopped((p) => {
        const n = { ...p };
        delete n[i];
        return n;
      });
      setGen((g) => ({ ...g, [i]: (g[i] || 0) + 1 }));
    }, 1800);
  }
  return (
    <div className="deco" aria-hidden>
      {DECO.map((d, i) => (
        <button
          key={`${i}-${gen[i] || 0}`}
          tabIndex={-1}
          className={`deco-bubble ${popped[i] ? 'popped' : ''}`}
          style={{ '--l': `${d.left}%`, '--s': `${d.size}px`, '--dur': `${d.dur}s`, '--delay': `${d.delay}s` } as any}
          onPointerDown={() => pop(i)}
        >
          <span />
          {popped[i] && <Burst count={8} />}
        </button>
      ))}
    </div>
  );
}

export default function Bubble({ onOpen, disabled, idleLabel, hint, couple = false }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [stage, setStage] = useState(0);
  const [sides, setSides] = useState<{ L: boolean; R: boolean }>({ L: false, R: false });
  const [waiting, setWaiting] = useState(false);
  const el = useRef<HTMLButtonElement>(null);
  const s = useRef({
    active: false,
    start: 0,
    raf: 0,
    stop: () => {},
    stage: 0,
    timers: [] as number[],
    pointers: new Map<number, Side>(),
    everBoth: false,
    fusedAt: 0,
    partnerTimer: 0,
  });

  useEffect(
    () => () => {
      cancelAnimationFrame(s.current.raf);
      s.current.stop();
      s.current.timers.forEach(clearTimeout);
      clearTimeout(s.current.partnerTimer);
    },
    [],
  );

  const setCharge = (v: number) => el.current?.style.setProperty('--charge', v.toFixed(3));
  const fused = () => sides.L && sides.R;

  // The assistant steps back while the main bubble is being blown, then cheers at the threshold.
  useEffect(() => {
    if (phase === 'charging') emit(stage >= 3 ? 'open:threshold' : 'open:charging', stage);
    else if (phase === 'idle') emit('open:charging:end', 0);
  }, [phase, stage]);

  function reset() {
    const st = s.current;
    st.stage = 0;
    st.pointers.clear();
    st.everBoth = false;
    setPhase('idle');
    setStage(0);
    setSides({ L: false, R: false });
    setWaiting(false);
    setCharge(0);
  }

  function pop() {
    const st = s.current;
    if (!st.active && phase !== 'charging') return;
    st.active = false;
    cancelAnimationFrame(st.raf);
    clearTimeout(st.partnerTimer);
    st.stop();
    setPhase('pop');
    setWaiting(false);
    sfx.pop();
    haptic(st.everBoth ? [18, 30, 18] : 18);
    const fast = reducedMotion();
    st.timers.push(window.setTimeout(onOpen, fast ? 40 : 240));
    st.timers.push(window.setTimeout(reset, fast ? 200 : 720));
  }

  function tick() {
    const st = s.current;
    if (!st.active) return;
    const elapsed = performance.now() - st.start;
    const both = st.pointers.size >= 2;
    const cap = couple && !both && !st.everBoth ? SOLO_CAP : 1;
    const v = Math.min(cap, elapsed / CHARGE_MS);
    setCharge(v);
    const next = v >= 1 ? 3 : v > 0.55 ? 2 : v > 0.18 ? 1 : 0;
    if (next !== st.stage) {
      st.stage = next;
      setStage(next);
      if (next === 3) haptic(8);
    }
    const holdStart = couple && st.everBoth ? Math.max(st.start, st.fusedAt) : st.start;
    if (v >= 1 && performance.now() - holdStart >= CHARGE_MS + OVERHOLD_MS) return pop();
    st.raf = requestAnimationFrame(tick);
  }

  function begin() {
    const st = s.current;
    unlockAudio();
    haptic(10);
    st.active = true;
    st.start = performance.now();
    st.stop = sfx.inflate(CHARGE_MS);
    setPhase('charging');
    st.raf = requestAnimationFrame(tick);
  }

  function down(e: React.PointerEvent) {
    if (disabled || phase === 'pop') return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const st = s.current;
    let side: Side = 'L';
    if (couple) {
      const r = el.current!.getBoundingClientRect();
      side = e.clientX < r.left + r.width / 2 ? 'L' : 'R';
      if ([...st.pointers.values()].includes(side)) return;
    } else if (st.active) return;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    st.pointers.set(e.pointerId, side);
    const now = { L: [...st.pointers.values()].includes('L'), R: [...st.pointers.values()].includes('R') };
    setSides(now);
    if (!st.active) begin();
    if (couple && now.L && now.R) {
      if (!st.everBoth) {
        st.everBoth = true;
        st.fusedAt = performance.now();
        haptic([12, 30, 12]);
        sfx.hatch();
      }
      clearTimeout(st.partnerTimer);
      setWaiting(false);
    }
  }

  function up(e: React.PointerEvent) {
    const st = s.current;
    if (!st.pointers.has(e.pointerId)) return;
    st.pointers.delete(e.pointerId);
    if (!couple) return pop();
    const now = { L: [...st.pointers.values()].includes('L'), R: [...st.pointers.values()].includes('R') };
    setSides(now);
    // Only one person ever pressed → behave exactly like the solo bubble.
    if (!st.everBoth) return pop();
    if (!st.pointers.size) return pop();
    setWaiting(true);
    clearTimeout(st.partnerTimer);
    st.partnerTimer = window.setTimeout(pop, PARTNER_WAIT_MS);
  }

  let label = idleLabel;
  if (phase === 'pop') label = '啵！';
  else if (phase === 'charging') {
    if (couple && waiting) label = '等 TA 松手…';
    else if (couple && fused()) label = stage >= 2 ? '一起松手！' : '合体中…';
    else if (couple) label = '等 TA 按住另一边';
    else label = ['继续吹…', '再大一点…', '松手，啵！', '要破啦！'][stage];
  }
  const sub = phase !== 'idle' ? (couple && phase === 'charging' && !fused() ? '一个人松手也能开' : ' ') : hint;

  return (
    <div className={`bubble-stage ${phase} stage-${stage} ${couple ? 'couple' : ''} ${sides.L ? 'l-on' : ''} ${sides.R ? 'r-on' : ''} ${sides.L && sides.R ? 'fused' : ''}`}>
      <DecoBubbles />
      <span className="bubble-halo" aria-hidden />
      <button
        ref={el}
        type="button"
        className="bubble"
        disabled={disabled}
        aria-label={couple ? `${idleLabel}：两人各按住一半一起松手，一个人也能开` : `${idleLabel}：按住吹泡泡，轻点也能开盒`}
        onPointerDown={down}
        onPointerUp={up}
        onPointerCancel={up}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && phase === 'idle' && !disabled) {
            e.preventDefault();
            s.current.active = true;
            setPhase('charging');
            pop();
          }
        }}
      >
        <span className="bubble-body" aria-hidden>
          <span className="bubble-shine" />
          <span className="bubble-shine small" />
        </span>
        {couple && (
          <span className="halves" aria-hidden>
            <span className="half l">
              <em>我</em>
            </span>
            <span className="half r">
              <em>TA</em>
            </span>
          </span>
        )}
        <span className="bubble-label">
          <b>{label}</b>
          <small>{sub}</small>
        </span>
      </button>
      {phase === 'pop' && <Burst />}
    </div>
  );
}
