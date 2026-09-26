import React, { useEffect, useState } from 'react';
import { Check, Clock, Sparkles } from 'lucide-react';

const QUERY = '(orientation: landscape) and (max-height: 560px)';

export function useLandscape() {
  const get = () => {
    try {
      return window.matchMedia(QUERY).matches;
    } catch {
      return false;
    }
  };
  const [on, setOn] = useState(get);
  useEffect(() => {
    let mq: MediaQueryList;
    try {
      mq = window.matchMedia(QUERY);
    } catch {
      return;
    }
    const fn = () => setOn(mq.matches);
    mq.addEventListener ? mq.addEventListener('change', fn) : mq.addListener(fn);
    return () => (mq.removeEventListener ? mq.removeEventListener('change', fn) : mq.removeListener(fn));
  }, []);
  return on;
}

type Props = {
  movie: any;
  revealing: boolean;
  card: React.ReactNode;
  inWatch: boolean;
  locked: boolean;
  againLabel: string;
  againDisabled: boolean;
  onAgain: () => void;
  onWatch: () => void;
  onLock: () => void;
};

/** Landscape "放映厅" presentation of the current result: letterbox, subtitle title, projector meta. */
export default function Cinema({ movie, revealing, card, inWatch, locked, againLabel, againDisabled, onAgain, onWatch, onLock }: Props) {
  return (
    <div className={`cinema ${revealing ? 'revealing' : ''}`}>
      <span className="letterbox top" aria-hidden />
      <div className="cinema-screen">
        <div className="cinema-card">{card}</div>
        <div className="cinema-info">
          <span className="cinema-now">NOW SHOWING · 今晚放映</span>
          {movie && !revealing ? (
            <>
              <h1 className="cinema-title">《{movie.title}》</h1>
              <p className="cinema-meta">
                {movie.year && <span>{movie.year}</span>}
                <span>{movie.duration} 分钟{movie.type === '剧集' ? ' / 集' : ''}</span>
                <span>★ {movie.rating}</span>
                <span>{movie.rarity}</span>
              </p>
              <p className="cinema-subtitle">— {movie.reason} —</p>
              <div className="cinema-actions">
                <button onClick={onWatch} className={inWatch ? 'on' : ''}>
                  {inWatch ? <Check size={16} /> : <Clock size={16} />}
                  {inWatch ? '已加入' : '稍后再看'}
                </button>
                <button onClick={onAgain} disabled={againDisabled}>
                  <Sparkles size={16} />
                  {againLabel}
                </button>
                <button className="primary" onClick={onLock} disabled={locked}>
                  <Check size={16} />
                  {locked ? '已锁定' : '就看这部'}
                </button>
              </div>
            </>
          ) : (
            <h1 className="cinema-title dim">灯光渐暗…</h1>
          )}
        </div>
      </div>
      <span className="letterbox bottom" aria-hidden />
    </div>
  );
}
