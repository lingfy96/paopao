import React, { useId } from 'react';

/**
 * Paopao's face. Pure SVG + CSS (no images, GIFs or animation libraries) with every expressive
 * part in its own group, so a state class can move eyes, brows, mouth and blush independently.
 */
export default function PaopaoCharacter({ state = '', size = 48, blinking = false, label }: {
  state?: string; size?: number; blinking?: boolean; label?: string;
}) {
  const id = useId().replace(/[^\w-]/g, '');
  const shell = `pp-shell-${id}`;
  const gloss = `pp-gloss-${id}`;
  return (
    <svg className={`paopao-face ${state} ${blinking ? 'is-blinking' : ''}`} viewBox="0 0 64 64"
      width={size} height={size} role={label ? 'img' : 'presentation'} aria-label={label} aria-hidden={label ? undefined : true}>
      <defs>
        <radialGradient id={shell} cx="36%" cy="30%" r="78%">
          <stop offset="0%" stopColor="var(--paopao-shell-light)" />
          <stop offset="62%" stopColor="var(--paopao-shell)" />
          <stop offset="100%" stopColor="var(--paopao-shell-deep)" />
        </radialGradient>
        <linearGradient id={gloss} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity=".92" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>

      <g className="bubble-shell">
        <circle cx="32" cy="32" r="25.5" fill={`url(#${shell})`} />
        <circle cx="32" cy="32" r="25.5" fill="none" stroke="var(--paopao-rim)" strokeWidth="1.4" />
        <circle cx="32" cy="32" r="21" fill="none" stroke="var(--paopao-rim)" strokeWidth=".7" opacity=".45" />
      </g>

      <g className="brows" stroke="var(--paopao-ink)" strokeWidth="1.9" strokeLinecap="round" fill="none">
        <path className="brow-left" d="M18.5 22.5q4 -2.2 8 -0.4" />
        <path className="brow-right" d="M37.5 22.1q4 -1.8 8 0.4" />
      </g>

      <g className="eyes">
        <g className="eye-left"><ellipse cx="24" cy="31" rx="4.6" ry="5.6" fill="var(--paopao-ink)" /></g>
        <g className="eye-right"><ellipse cx="40" cy="31" rx="4.6" ry="5.6" fill="var(--paopao-ink)" /></g>
      </g>
      <g className="pupils" fill="#fff">
        <circle className="spark-left" cx="25.7" cy="29.2" r="1.5" />
        <circle className="spark-right" cx="41.7" cy="29.2" r="1.5" />
      </g>
      <g className="eye-lids" stroke="var(--paopao-ink)" strokeWidth="2" strokeLinecap="round" fill="none">
        <path d="M19.8 31.4q4.2 3.4 8.4 0" />
        <path d="M35.8 31.4q4.2 3.4 8.4 0" />
      </g>

      <g className="mouth" fill="none" stroke="var(--paopao-ink)" strokeWidth="2" strokeLinecap="round">
        <path className="mouth-line" d="M27.5 40.5q4.5 4 9 0" />
        <ellipse className="mouth-open" cx="32" cy="42" rx="4" ry="4.4" fill="var(--paopao-ink)" stroke="none" />
      </g>

      <g className="blush" fill="var(--paopao-blush)">
        <ellipse cx="17.4" cy="37.6" rx="3.5" ry="2.2" />
        <ellipse cx="46.6" cy="37.6" rx="3.5" ry="2.2" />
      </g>

      <g className="highlight" fill={`url(#${gloss})`}>
        <ellipse cx="23" cy="17.5" rx="7.6" ry="4.6" transform="rotate(-24 23 17.5)" />
        <circle cx="43.5" cy="19.5" r="1.9" fill="#fff" opacity=".8" />
      </g>

      <g className="thinking-dots" fill="var(--paopao-ink)">
        <circle cx="26" cy="49" r="1.7" /><circle cx="32" cy="49" r="1.7" /><circle cx="38" cy="49" r="1.7" />
      </g>
    </svg>
  );
}
