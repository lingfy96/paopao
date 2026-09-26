import React, { useEffect, useRef, useState } from 'react';
import { Camera, Check, ImageOff, MapPin, X } from 'lucide-react';
import storage from '../lib/storage.js';
import { compressImage } from '../lib/canvas.js';
import { haptic } from '../lib/fx.js';

export type Memory = {
  id: string;
  movieId: number;
  title: string;
  year?: number;
  tags: string[];
  rating?: number;
  date: string;
  city: string;
  review: string;
  kind: 'ticket' | 'stamp';
  imageKey?: string;
  seat: string;
  tilt: number;
  createdAt: string;
};

const hue = (s: string) => [...s].reduce((a, c) => (a * 17 + c.charCodeAt(0)) % 360, 40);
const fmtDate = (d: string) => (d || '').replace(/-/g, '.');

function useImage(key?: string, preview?: string) {
  const [url, setUrl] = useState<string | null>(preview || null);
  useEffect(() => {
    if (preview) return setUrl(preview);
    let live = true;
    storage.getImage(key).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [key, preview]);
  return url;
}

export function Ticket({ m, preview }: { m: Memory; preview?: string }) {
  const photo = useImage(m.imageKey, preview);
  return (
    <div className="ticket">
      <div className="ticket-main" style={photo ? { backgroundImage: `url(${photo})` } : { '--h': hue(m.title) } as any}>
        <div className="ticket-shade" />
        <div className="ticket-head">
          <span>✈ PAOPAO AIR</span>
          <span>BOARDING PASS</span>
        </div>
        <div className="ticket-route">
          <div>
            <small>FROM</small>
            <b>今晚</b>
          </div>
          <span className="ticket-plane">- - ✈ - -</span>
          <div className="to">
            <small>TO</small>
            <b>{m.title}</b>
          </div>
        </div>
        <div className="ticket-grid">
          <div>
            <small>DATE</small>
            <b>{fmtDate(m.date)}</b>
          </div>
          <div>
            <small>CITY</small>
            <b>{m.city || '某座城市'}</b>
          </div>
          <div>
            <small>SEAT</small>
            <b>{m.seat}</b>
          </div>
        </div>
        {m.review && <p className="ticket-review">“{m.review}”</p>}
        {!photo && m.imageKey && (
          <span className="ticket-nophoto">
            <ImageOff size={12} /> 照片未保存在本机
          </span>
        )}
      </div>
      <div className="ticket-stub">
        <small>GATE</small>
        <b>{String(m.movieId).padStart(3, '0')}</b>
        <span className="barcode" aria-hidden />
        <small>{m.year || ''}</small>
      </div>
    </div>
  );
}

export function Stamp({ m }: { m: Memory }) {
  return (
    <div className="stamp">
      <div className="stamp-inner">
        <div className="stamp-art" style={{ '--h': hue(m.title) } as any}>
          <span>{m.title.slice(0, 1)}</span>
          <em>{(m.rating || 0).toFixed(1)}</em>
        </div>
        <b className="stamp-title">{m.title}</b>
        <small>
          {m.year ? `${m.year} · ` : ''}
          {m.tags.slice(0, 2).join(' · ')}
        </small>
        {m.review && <p className="stamp-review">“{m.review}”</p>}
      </div>
      <svg className="postmark" viewBox="0 0 100 100" aria-hidden>
        <circle cx="50" cy="50" r="44" />
        <circle cx="50" cy="50" r="34" />
        <text x="50" y="47">{fmtDate(m.date).slice(2)}</text>
        <text x="50" y="62" className="city">{(m.city || 'PAOPAO').slice(0, 5)}</text>
      </svg>
      <span className="chop">已观影</span>
    </div>
  );
}

export function MemoryCard({ m, onClick, preview }: { m: Memory; onClick?: () => void; preview?: string }) {
  const content = m.kind === 'ticket' ? <Ticket m={m} preview={preview} /> : <Stamp m={m} />;
  if (!onClick) return content;
  return (
    <button className={`memory ${m.kind}`} style={{ '--tilt': `${m.tilt}deg` } as any} onClick={onClick} aria-label={`纪念卡：${m.title}`}>
      <span className="tape" aria-hidden />
      {content}
    </button>
  );
}

export function Wall({ memories, onOpen, limit }: { memories: Memory[]; onOpen: (m: Memory) => void; limit?: number }) {
  const list = limit ? memories.slice(0, limit) : memories;
  return (
    <div className="wall">
      {list.map((m) => (
        <MemoryCard key={m.id} m={m} onClick={() => onOpen(m)} />
      ))}
    </div>
  );
}

type Candidate = { id: number; title: string; year?: number; tags: string[]; rating: number };

export function CheckinForm({
  candidates,
  initialId,
  onSaved,
  onCancel,
}: {
  candidates: Candidate[];
  initialId?: number;
  onSaved: (m: Memory) => void;
  onCancel: () => void;
}) {
  const today = new Date().toLocaleDateString('en-CA');
  const [movieId, setMovieId] = useState<number>(initialId ?? candidates[0]?.id);
  const [date, setDate] = useState(today);
  const [city, setCity] = useState(() => storage.get('lastCity', ''));
  const [review, setReview] = useState('');
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | undefined>();
  const [state, setState] = useState<'idle' | 'reading' | 'saving'>('idle');
  const seat = useRef(`${1 + Math.floor(Math.random() * 12)}${'ABCDEF'[Math.floor(Math.random() * 6)]}`);
  const tilt = useRef(Math.round((Math.random() * 6 - 3) * 10) / 10);
  const movie = candidates.find((c) => c.id === movieId) || candidates[0];

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setState('reading');
    const blob = await compressImage(file);
    setState('idle');
    if (!blob) return;
    setPhoto(blob);
    try {
      setPreview(URL.createObjectURL(blob));
    } catch {
      setPreview(undefined);
    }
  }

  const draft: Memory | null = movie
    ? {
        id: '',
        movieId: movie.id,
        title: movie.title,
        year: movie.year,
        tags: movie.tags,
        rating: movie.rating,
        date,
        city: city.trim(),
        review: review.trim(),
        kind: photo ? 'ticket' : 'stamp',
        seat: seat.current,
        tilt: tilt.current,
        createdAt: '',
      }
    : null;

  async function save() {
    if (!draft || state !== 'idle') return;
    setState('saving');
    haptic(15);
    const id = `m${Date.now().toString(36)}`;
    let imageKey: string | undefined;
    if (photo) {
      imageKey = `img-${id}`;
      await storage.saveImage(imageKey, photo).catch(() => false);
    }
    if (draft.city) storage.set('lastCity', draft.city);
    onSaved({ ...draft, id, imageKey, createdAt: new Date().toISOString() });
  }

  if (!movie || !draft) {
    return (
      <div className="empty small">
        <p>先开一盒，遇见一部电影，再回来打卡吧。</p>
        <button className="primary" onClick={onCancel}>
          好的
        </button>
      </div>
    );
  }

  return (
    <div className="checkin">
      <h2>看完了？留个纪念</h2>
      <p className="muted">{photo ? '有照片 → 生成机票票根' : '没有照片 → 生成观影邮票'}</p>
      <div className="checkin-preview">
        <MemoryCard m={draft} preview={preview} />
      </div>
      <label className="field">
        <span>影片</span>
        <select value={movie.id} onChange={(e) => setMovieId(Number(e.target.value))}>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </label>
      <div className="field-row">
        <label className="field">
          <span>日期</span>
          <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value || today)} />
        </label>
        <label className="field">
          <span>
            <MapPin size={13} /> 城市
          </span>
          <input value={city} maxLength={12} onChange={(e) => setCity(e.target.value)} placeholder="例如：上海" />
        </label>
      </div>
      <label className="field">
        <span>一句话评价（可不填）</span>
        <input value={review} maxLength={40} onChange={(e) => setReview(e.target.value)} placeholder="最后十分钟值回今晚。" />
      </label>
      <div className="photo-row">
        <label className={`photo-pick ${state === 'reading' ? 'loading' : ''}`}>
          <input type="file" accept="image/*" onChange={pick} />
          <Camera size={18} />
          {state === 'reading' ? '读取中…' : photo ? '换一张照片' : '添加照片（可选）'}
        </label>
        {photo && (
          <button
            className="ghost small"
            onClick={() => {
              setPhoto(null);
              setPreview(undefined);
            }}
          >
            <X size={15} />
            不用照片
          </button>
        )}
      </div>
      <button className={`primary ${state === 'saving' ? 'processing' : ''}`} disabled={state !== 'idle'} onClick={save}>
        <Check size={18} />
        {state === 'saving' ? '正在贴上纪念墙…' : '保存到纪念墙'}
      </button>
    </div>
  );
}
