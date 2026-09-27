import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, Bookmark, Check, ChevronRight, Clock, RefreshCw, Send, Square, X } from 'lucide-react';
import BottomSheet from './BottomSheet';
import { ACTION_LABEL } from '../lib/paopaoActions.js';
import { CHAT_LIMITS, ERROR_TEXT, RETRYABLE, inputProblem, parseMarkdown } from '../lib/paopaoChat.js';

export type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string; movieIds?: number[]; aborted?: boolean };
export type ChatStatus = 'idle' | 'pending' | 'streaming' | 'error' | 'aborted';

type Props = {
  messages: ChatMessage[]; status: ChatStatus; error: string; face: string; prompts: string[];
  movieById: (id: number) => any; inWatch: (id: number) => boolean; pending?: { name: string; label: string } | null;
  onSend: (text: string) => void; onStop: () => void; onRetry: () => void; onNewChat: () => void; onClose: () => void;
  onOpenMovie: (id: number) => void; onToggleWatch: (id: number) => void; onConfirmPending: () => void; onDismissPending: () => void;
};

const STATUS_TEXT: Record<ChatStatus, string> = {
  idle: '在线', pending: '正在想…', streaming: '正在回答…', error: '刚刚走神了', aborted: '已停下',
};
const desktop = () => {
  try {
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  } catch {
    return false;
  }
};

function Markdown({ text }: { text: string }) {
  return <>{parseMarkdown(text).map((block: any, i: number) => block.type === 'ul'
    ? <ul key={i}>{block.items.map((tokens: any[], j: number) => <li key={j}><Tokens tokens={tokens} /></li>)}</ul>
    : <p key={i}><Tokens tokens={block.tokens} /></p>)}</>;
}
const Tokens = ({ tokens }: { tokens: any[] }) => <>{tokens.map((token, i) => token.type === 'strong'
  ? <strong key={i}>{token.text}</strong>
  : token.type === 'link' ? <a key={i} href={token.href} target="_blank" rel="noreferrer noopener">{token.text}</a>
    : <React.Fragment key={i}>{token.text}</React.Fragment>)}</>;

function MovieMiniCard({ movie, saved, onOpen, onToggle }: { movie: any; saved: boolean; onOpen: () => void; onToggle: () => void }) {
  const meta = [movie.year, movie.rating ? `${movie.rating.toFixed(1)} 分` : '', movie.duration ? `${movie.duration} 分钟` : ''].filter(Boolean);
  return <div className="paopao-movie">
    <button className="paopao-movie-main" onClick={onOpen} aria-label={`打开 ${movie.title}`}>
      <span className="paopao-movie-art" style={{ '--h': (movie.id * 33) % 360 } as React.CSSProperties} aria-hidden>
        {movie.title.slice(0, 2)}
      </span>
      <span className="paopao-movie-text">
        <b>{movie.title}</b>
        <small>{meta.join(' · ')}</small>
        {!!movie.tags?.length && <small>{movie.tags.slice(0, 3).join(' / ')}</small>}
      </span>
      <ChevronRight size={16} aria-hidden />
    </button>
    <button className={`paopao-movie-save ${saved ? 'on' : ''}`} aria-pressed={saved}
      aria-label={saved ? `把 ${movie.title} 移出想看` : `把 ${movie.title} 加入想看`} onClick={onToggle}>
      {saved ? <Check size={15} /> : <Bookmark size={15} />}{saved ? '已想看' : '想看'}
    </button>
  </div>;
}

export default function PaopaoChatSheet(props: Props) {
  const { messages, status, error } = props;
  const [draft, setDraft] = useState('');
  const [atBottom, setAtBottom] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const busy = status === 'pending' || status === 'streaming';
  const last = messages.at(-1);
  const liveText = status === 'idle' && last?.role === 'assistant' ? last.content.slice(0, 180) : '';

  useLayoutEffect(() => {
    const list = listRef.current;
    if (list && atBottom) list.scrollTop = list.scrollHeight;
  }, [messages, status, atBottom]);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    box.style.height = 'auto';
    box.style.height = `${Math.min(box.scrollHeight, 132)}px`;
  }, [draft]);

  function submit(value: string) {
    if (busy || inputProblem(value)) return;
    props.onSend(value.trim());
    setDraft('');
    setAtBottom(true);
  }

  const problem = inputProblem(draft);
  return <BottomSheet className="paopao-sheet" label="泡泡 AI 助手" hideClose onClose={props.onClose}>
    <header className="paopao-chat-head">
      {/* The floating ball itself flies in and lands here, so this slot stays empty. */}
      <span className="paopao-chat-avatar" data-paopao-morph="target" aria-hidden />
      <span className="paopao-chat-title">
        <b>泡泡</b>
        <small>{STATUS_TEXT[status]}</small>
      </span>
      <button className="paopao-chat-new" onClick={props.onNewChat} aria-label="开始新对话" disabled={busy}>
        <RefreshCw size={15} aria-hidden />新对话
      </button>
      <button className="icon-btn" aria-label="关闭泡泡助手" onClick={props.onClose}><X size={19} /></button>
    </header>

    <div className="paopao-chat-body" ref={listRef} onScroll={(e) => {
      const el = e.currentTarget;
      setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 48);
    }}>
      {!messages.length && <p className="paopao-chat-empty">
        {props.prompts[0] === '为什么推荐它？' ? '这张想聊聊吗？' : '今晚想看什么？'}
      </p>}
      {messages.map((message) => message.role === 'user'
        ? <p className="paopao-msg-user" key={message.id}>{message.content}</p>
        : <div className="paopao-msg-ai" key={message.id}>
          {message.content ? <Markdown text={message.content} /> : null}
          {!!message.movieIds?.length && <div className="paopao-movie-list">
            {message.movieIds.slice(0, 3).map((id) => {
              const movie = props.movieById(id);
              return movie ? <MovieMiniCard key={id} movie={movie} saved={props.inWatch(id)}
                onOpen={() => props.onOpenMovie(id)} onToggle={() => props.onToggleWatch(id)} /> : null;
            })}
          </div>}
          {message.aborted && <small className="paopao-msg-note">回答中断</small>}
        </div>)}
      {status === 'pending' && <p className="paopao-msg-thinking" role="status">泡泡正在想…</p>}
      {status === 'error' && <div className="paopao-msg-error" role="alert">
        <span>{ERROR_TEXT[error as keyof typeof ERROR_TEXT] || ERROR_TEXT.network}</span>
        {RETRYABLE.has(error) && <button onClick={props.onRetry}>重试</button>}
      </div>}
      {props.pending && <div className="paopao-confirm" role="group" aria-label="需要确认的操作">
        <span>要{props.pending.label}吗？</span>
        <button className="paopao-confirm-yes" onClick={props.onConfirmPending}>好，去添加</button>
        <button onClick={props.onDismissPending}>先不用</button>
      </div>}
    </div>

    {!atBottom && <button className="paopao-to-latest" onClick={() => setAtBottom(true)} aria-label="回到最新">
      <ArrowDown size={14} aria-hidden />回到最新
    </button>}

    <div className="paopao-chat-foot">
      <div className="paopao-prompts" role="group" aria-label="快捷提问">
        {props.prompts.map((prompt) => <button key={prompt} type="button" disabled={busy} onClick={() => submit(prompt)}>{prompt}</button>)}
      </div>
      <form className="paopao-composer" onSubmit={(e) => {
        e.preventDefault();
        submit(draft);
      }}>
        <label className="paopao-sr" htmlFor="paopao-input">和泡泡说点什么</label>
        <textarea id="paopao-input" ref={boxRef} rows={1} value={draft} placeholder="问问泡泡今晚看什么…"
          maxLength={CHAT_LIMITS.input + 200} autoFocus={desktop() || undefined}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && desktop()) {
              e.preventDefault();
              submit(draft);
            }
          }} />
        {busy
          ? <button type="button" className="paopao-send is-stop" aria-label="停止生成" onClick={props.onStop}><Square size={16} fill="currentColor" /></button>
          : <button type="submit" className="paopao-send" aria-label="发送" disabled={!!problem}><Send size={17} /></button>}
      </form>
      {problem === 'too-long' && <small className="paopao-limit" role="alert">太长了，先精简到 {CHAT_LIMITS.input} 字以内。</small>}
      {props.pending && <small className="paopao-limit">{ACTION_LABEL[props.pending.name] || '这个操作'}需要你确认。</small>}
    </div>
    <span className="paopao-sr" role="status" aria-live="polite">{liveText}</span>
  </BottomSheet>;
}
