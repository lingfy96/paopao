import React, { useEffect, useState } from 'react';
import { Clapperboard, Sparkles } from 'lucide-react';
import { Burst } from './Bubble';

export type RevealPhase = 'leaving' | 'bubble' | 'silhouette' | 'flip' | 'done';

export default function Reveal({ phase, rarity, children }: { phase: RevealPhase; rarity?: string; children: React.ReactNode }) {
  return (
    <div className={`reveal ${phase} r-${rarity || 'R'}`}>
      {phase === 'bubble' && (
        <div className="mini-bubble-wrap" aria-hidden>
          <span className="mini-bubble" />
        </div>
      )}
      {phase === 'silhouette' && <Burst count={10} />}
      <div className="flipper">
        <div className="face back" aria-hidden={phase === 'done'}>
          <div className="silhouette">
            <div className="card-top">
              PAOPAO SELECT <Sparkles size={14} />
            </div>
            <div className="silhouette-figure">
              <Clapperboard size={58} strokeWidth={1} />
              <span className="q">?</span>
            </div>
            <div className="card-label">下一幕 · 即将揭晓</div>
            <div className="shimmer-line" />
          </div>
        </div>
        <div className="face front">{children}</div>
      </div>
      {(phase === 'silhouette' || phase === 'bubble' || phase === 'leaving') && (
        <p className="reveal-status" role="status">
          {phase === 'silhouette' ? '故事正在显影…' : phase === 'bubble' ? '再吹一颗…' : '收起这一张…'}
        </p>
      )}
    </div>
  );
}

export function SsrOverlay({ stamp }: { stamp: number }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!stamp) return;
    setOn(true);
    const t = window.setTimeout(() => setOn(false), 1900);
    return () => clearTimeout(t);
  }, [stamp]);
  if (!on) return null;
  return (
    <div className="ssr-overlay" aria-hidden key={stamp}>
      <span className="ssr-flash" />
      <span className="ssr-rays" />
      <Burst count={24} gold />
      <span className="ssr-word">SSR</span>
    </div>
  );
}
