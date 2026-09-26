import React, { useEffect, useRef, useState } from 'react';
import { HATCH_XP, eggStage, speciesById } from '../lib/egg.js';
import { haptic, sfx } from '../lib/fx.js';

export function CreatureSvg({ species }: { species: string }) {
  switch (species) {
    case 'jelly':
      return (
        <svg viewBox="0 0 64 80" className="sv jelly-svg">
          <defs>
            <radialGradient id="jg" cx="40%" cy="30%" r="70%">
              <stop offset="0" stopColor="#fff" stopOpacity=".95" />
              <stop offset=".4" stopColor="#f3a8ff" stopOpacity=".85" />
              <stop offset="1" stopColor="#9b6cf0" stopOpacity=".55" />
            </radialGradient>
          </defs>
          <g className="tentacles" stroke="#e7b2ff" strokeWidth="2.4" fill="none" strokeLinecap="round" opacity=".85">
            <path d="M18 38 q-4 10 2 18 t0 18" />
            <path d="M28 40 q4 10 -2 18 t2 16" />
            <path d="M38 40 q-4 10 2 18 t-2 16" />
            <path d="M47 38 q4 10 -2 18 t2 18" />
          </g>
          <path d="M6 38 C6 14 58 14 58 38 q-6 5 -13 0 q-6 5 -13 0 q-6 5 -13 0 q-6 5 -13 0z" fill="url(#jg)" />
          <circle cx="25" cy="30" r="2.4" fill="#3a1f55" />
          <circle cx="39" cy="30" r="2.4" fill="#3a1f55" />
          <path d="M29 35 q3 2.5 6 0" stroke="#3a1f55" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </svg>
      );
    case 'dolphin':
      return (
        <svg viewBox="0 0 96 56" className="sv dolphin-svg">
          <g className="tail">
            <path d="M14 30 L2 18 Q10 26 4 40 Z" fill="#5f8fd6" />
          </g>
          <path d="M12 30 C24 12 58 8 80 22 C88 27 94 28 95 31 C90 33 84 33 80 34 C64 46 34 46 12 30 Z" fill="#6fa3ea" />
          <path d="M22 34 C40 44 64 42 80 34 C64 40 40 40 22 34 Z" fill="#dbeeff" />
          <path d="M46 14 L54 2 L58 16 Z" fill="#5f8fd6" />
          <path d="M44 36 L38 48 L52 38 Z" fill="#5f8fd6" />
          <circle cx="76" cy="25" r="2.3" fill="#132a4a" />
          <path d="M84 31 q4 1 8 0" stroke="#132a4a" strokeWidth="1.3" fill="none" />
        </svg>
      );
    case 'octopus':
      return (
        <svg viewBox="0 0 72 72" className="sv octopus-svg">
          <g fill="#ef7aa0" className="arms">
            <path d="M16 40 C8 50 6 60 14 64 C10 56 16 50 22 46Z" />
            <path d="M24 44 C20 56 22 66 30 66 C26 60 28 52 32 46Z" />
            <path d="M40 46 C44 52 46 60 42 66 C50 66 52 56 48 44Z" />
            <path d="M50 42 C56 50 62 56 58 64 C66 60 64 50 56 40Z" />
          </g>
          <ellipse cx="36" cy="30" rx="22" ry="21" fill="#f58db0" />
          <ellipse cx="29" cy="20" rx="7" ry="4" fill="#fff" opacity=".45" />
          <circle cx="29" cy="32" r="3.2" fill="#3b1026" />
          <circle cx="43" cy="32" r="3.2" fill="#3b1026" />
          <circle cx="30" cy="31" r="1" fill="#fff" />
          <circle cx="44" cy="31" r="1" fill="#fff" />
          <path d="M33 39 q3 3 6 0" stroke="#3b1026" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        </svg>
      );
    case 'whale':
      return (
        <svg viewBox="0 0 128 72" className="sv whale-svg">
          <g className="tail">
            <path d="M14 38 C6 28 2 22 4 16 C10 24 16 26 20 30 C22 22 30 18 34 20 C28 26 24 34 22 40Z" fill="#2c4f9e" />
          </g>
          <path d="M18 40 C24 16 70 10 104 22 C120 28 124 42 116 52 C100 66 44 66 18 40Z" fill="#3a66c4" />
          <path d="M40 52 C62 62 96 62 114 50 C96 58 62 58 40 52Z" fill="#bfd6ff" />
          <path d="M60 50 L54 64 L70 54Z" fill="#2c4f9e" />
          <circle cx="98" cy="36" r="3" fill="#0d1d3f" />
          <path d="M106 46 q5 2 9 -1" stroke="#0d1d3f" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          <g className="spout" stroke="#bfe3ff" strokeWidth="2.4" strokeLinecap="round" fill="none">
            <path d="M92 16 q-4 -8 -10 -10" />
            <path d="M94 16 q0 -9 0 -13" />
            <path d="M96 16 q4 -8 10 -10" />
          </g>
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 72 48" className="sv fish-svg">
          <g className="tail">
            <path d="M16 24 L2 10 Q8 24 2 38 Z" fill="#ff9a4d" />
          </g>
          <ellipse cx="38" cy="24" rx="24" ry="16" fill="#ffb25c" />
          <path d="M30 9 C34 16 34 32 30 39" stroke="#fff" strokeWidth="4" fill="none" opacity=".9" />
          <path d="M44 9 C47 16 47 32 44 39" stroke="#fff" strokeWidth="3" fill="none" opacity=".75" />
          <path d="M36 8 L44 1 L48 10 Z" fill="#ff9a4d" />
          <circle cx="53" cy="21" r="3" fill="#2a1400" />
          <circle cx="54" cy="20" r="1" fill="#fff" />
          <path d="M58 28 q2 1.5 4 0" stroke="#2a1400" strokeWidth="1.4" fill="none" />
        </svg>
      );
  }
}

export function EggSvg({ xp = 0, className = '' }: { xp?: number; className?: string }) {
  const stage = eggStage(xp);
  return (
    <svg viewBox="0 0 64 80" className={`egg-svg ${stage} ${className}`} aria-hidden>
      <defs>
        <radialGradient id="eg" cx="38%" cy="30%" r="75%">
          <stop offset="0" stopColor="#fffaf0" />
          <stop offset=".6" stopColor="#f6e3c8" />
          <stop offset="1" stopColor="#d9b98f" />
        </radialGradient>
      </defs>
      <path d="M32 4 C50 4 60 34 60 50 C60 66 48 76 32 76 C16 76 4 66 4 50 C4 34 14 4 32 4Z" fill="url(#eg)" />
      <circle cx="22" cy="40" r="5" fill="#b8a3f0" opacity=".7" />
      <circle cx="42" cy="28" r="3.5" fill="#f3a3c9" opacity=".7" />
      <circle cx="40" cy="56" r="6" fill="#8fd3e8" opacity=".6" />
      <ellipse cx="22" cy="20" rx="6" ry="9" fill="#fff" opacity=".55" />
      {stage !== 'egg' && <path d="M14 46 l7 -5 l5 6 l6 -7 l5 5 l6 -6 l6 5" stroke="#8a6a44" strokeWidth="2" fill="none" strokeLinejoin="round" />}
    </svg>
  );
}

const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

type Creature = { id: string; species: string };

export default function Aquarium({ creatures, xp, compact = false, onEgg }: { creatures: Creature[]; xp: number; compact?: boolean; onEgg?: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [acting, setActing] = useState<Record<string, number>>({});

  useEffect(() => {
    const node = box.current;
    if (!node || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.05 });
    io.observe(node);
    return () => io.disconnect();
  }, []);

  function act(c: Creature) {
    haptic(c.species === 'whale' ? [20, 40, 20] : 12);
    if (c.species === 'jelly' || c.species === 'whale') sfx.hatch();
    else sfx.tap();
    setActing((a) => ({ ...a, [c.id]: Date.now() }));
    window.setTimeout(() => setActing((a) => {
      const n = { ...a };
      delete n[c.id];
      return n;
    }), c.species === 'whale' ? 1800 : 1300);
  }

  const shown = creatures.slice(-(compact ? 6 : 12));

  return (
    <div ref={box} className={`aquarium ${compact ? 'compact' : ''} ${visible ? '' : 'paused'}`}>
      <span className="rays" aria-hidden />
      <span className="sand" aria-hidden />
      <span className="weed w1" aria-hidden />
      <span className="weed w2" aria-hidden />
      <span className="weed w3" aria-hidden />
      <span className="rise r1" aria-hidden />
      <span className="rise r2" aria-hidden />
      <span className="rise r3" aria-hidden />
      {shown.map((c, i) => {
        const h = hash(c.id);
        const lane = c.species === 'whale' ? 18 : c.species === 'octopus' ? 62 : c.species === 'jelly' ? 8 + (h % 30) : 12 + (h % 52);
        const style = {
          '--top': `${lane}%`,
          '--dur': `${14 + (h % 9)}s`,
          '--delay': `-${h % 13}s`,
          '--start': `${2 + (h % 14)}%`,
        } as any;
        const sp = speciesById[c.species];
        return (
          <div key={c.id} className={`lane ${c.species} ${acting[c.id] ? 'act' : ''}`} style={style}>
            <div className="mover">
              <button className="swimmer" aria-label={`${sp?.name}，点一下${sp?.action}`} onClick={() => act(c)}>
                <span className="face">
                  <span className="bob">
                    <span className="actor">
                      <CreatureSvg species={c.species} />
                    </span>
                  </span>
                </span>
                {acting[c.id] && (c.species === 'fish' || c.species === 'whale') && (
                  <span className={`blow ${c.species === 'whale' ? 'big' : ''}`} aria-hidden>
                    <i />
                    <i />
                    <i />
                  </span>
                )}
              </button>
            </div>
          </div>
        );
      })}
      <button className="egg-nest" onClick={onEgg} aria-label={`故事蛋 ${xp}/${HATCH_XP}`}>
        <EggSvg xp={xp} />
        <small>
          {xp}/{HATCH_XP}
        </small>
      </button>
      {!creatures.length && <p className="aquarium-empty">开盒、连续开盒、投喂都能让故事蛋长大，孵化后会游进这里</p>}
    </div>
  );
}
