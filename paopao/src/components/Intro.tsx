import React, { useEffect, useRef, useState } from 'react';
import storage from '../lib/storage.js';
import { reducedMotion, sfx } from '../lib/fx.js';

const DOTS = Array.from({ length: 14 }, (_, i) => {
  const a = (i / 14) * Math.PI * 2 + (i % 3) * 0.4;
  const r = 120 + (i % 4) * 45;
  return { x: Math.round(Math.cos(a) * r), y: Math.round(Math.sin(a) * r * 1.4), s: 6 + (i % 4) * 4, d: (i % 5) * 0.06 };
});

/** First visit ≈2.6s, later visits ≈1s. Tap anywhere or "跳过" to leave immediately. */
export default function Intro({ onDone }: { onDone: () => void }) {
  const seen = useRef(storage.get('introSeen', 0)).current;
  const total = reducedMotion() ? 500 : seen ? 1000 : 2600;
  const [leaving, setLeaving] = useState(false);
  const done = useRef(false);

  function finish(delay: number) {
    if (done.current) return;
    done.current = true;
    setLeaving(true);
    window.setTimeout(onDone, delay);
  }

  useEffect(() => {
    storage.set('introSeen', seen + 1);
    sfx.intro();
    const t = window.setTimeout(() => finish(380), total - 380);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className={`film-intro ${seen ? 'short' : 'long'} ${leaving ? 'leaving' : ''}`} style={{ '--total': `${total}ms` } as any} onPointerDown={() => finish(260)} role="presentation">
      <button
        className="film-intro-skip"
        onPointerDown={(e) => {
          e.stopPropagation();
          finish(200);
        }}
      >
        跳过
      </button>
      <div className="film-intro-dots" aria-hidden>
        {DOTS.map((d, i) => (
          <i key={i} style={{ '--x': `${d.x}px`, '--y': `${d.y}px`, '--s': `${d.s}px`, '--dd': `${d.d}s` } as any} />
        ))}
      </div>
      <div className="film-intro-logo">
        <span className="brand-mark big" aria-hidden />
        <h1>泡泡选片</h1>
        <small>PAOPAO SELECT</small>
        <p>今晚的好故事，藏在下一张卡里</p>
      </div>
    </div>
  );
}
