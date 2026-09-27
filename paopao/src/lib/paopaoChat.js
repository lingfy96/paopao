import storage from './storage.js';

export const CHAT_LIMITS = Object.freeze({ input: 1200, requestRounds: 10, stored: 40 });
// Resolved from the deployment base so the proxy path is stable whatever the hash route is.
export const CHAT_ENDPOINT = `${import.meta.env?.BASE_URL || '/'}api/paopao/chat`;

const KEY = 'paopaoChat';
const text = (v) => (typeof v === 'string' ? v : '');

export const messageId = () => {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {
    /* older browsers */
  }
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
};

/** Stored conversations are capped so the DOM and localStorage never grow without bound. */
export function loadConversation() {
  return storage.get(KEY, []).filter((m) => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string')
    .slice(-CHAT_LIMITS.stored);
}
export const saveConversation = (messages) => storage.set(KEY, messages.slice(-CHAT_LIMITS.stored).map(
  ({ id, role, content, movieIds, aborted }) => ({ id, role, content, movieIds, aborted }),
));
export const clearConversation = () => storage.remove(KEY);

/** Only the most recent rounds travel with a request; empty/aborted turns are dropped. */
export function trimHistory(messages, rounds = CHAT_LIMITS.requestRounds) {
  return messages.filter((m) => text(m.content).trim()).slice(-rounds * 2)
    .map(({ role, content }) => ({ role, content: content.slice(0, CHAT_LIMITS.input) }));
}

export function inputProblem(value) {
  const trimmed = text(value).trim();
  if (!trimmed) return 'empty';
  if (trimmed.length > CHAT_LIMITS.input) return 'too-long';
  return '';
}

export const ERROR_TEXT = {
  auth: 'AI 暂时不可用（服务端未配置密钥），本地推荐照样能用。',
  rate: '问得有点快，几秒后再试一次？',
  offline: '网络好像断开了，连上再问我。',
  unavailable: '我这边的 AI 还没连上服务端，先用页面上的推荐吧。',
  network: '我刚刚走神了，再试一次？',
};
export const RETRYABLE = new Set(['rate', 'offline', 'network']);

export function errorKind(status) {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate';
  if (status === 404 || status === 501) return 'unavailable';
  return 'network';
}

/**
 * Streams the proxy's newline delimited events. The upstream answer is forwarded token by
 * token, so nothing is buffered and re-typed locally.
 * @returns {Promise<{aborted: boolean, error?: string}>}
 */
export async function streamChat({ endpoint = CHAT_ENDPOINT, messages, context, signal, onEvent, idleMs = 25000 }) {
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, context }),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) return { aborted: true };
    return { aborted: false, error: navigator.onLine === false ? 'offline' : 'network' };
  }
  if (!response.ok || !response.body) return { aborted: false, error: errorKind(response.status) };

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let failure = '';
  // A connection that goes silent without closing would otherwise leave the answer "typing" forever.
  let stalled = false;
  let idle = 0;
  const arm = () => {
    clearTimeout(idle);
    idle = setTimeout(() => {
      stalled = true;
      reader.cancel().catch(() => {});
    }, idleMs);
  };
  arm();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      arm();
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const payload = line.startsWith('data:') ? line.slice(5).trim() : line.trim();
        if (!payload || payload === '[DONE]') continue;
        let event;
        try {
          event = JSON.parse(payload);
        } catch {
          continue;
        }
        if (event?.type === 'error') failure = event.kind || 'network';
        else if (event?.type) onEvent?.(event);
      }
    }
  } catch (error) {
    if (signal?.aborted) return { aborted: true };
    return { aborted: false, error: 'network' };
  } finally {
    clearTimeout(idle);
    reader.releaseLock?.();
  }
  if (stalled) return { aborted: false, error: 'network' };
  return failure ? { aborted: false, error: failure } : { aborted: false };
}

const SAFE_LINK = /^https?:\/\//i;

/** Tiny safe subset: paragraphs, bullet lists, bold and http(s) links. No raw HTML is ever used. */
export function parseMarkdown(source) {
  const blocks = [];
  const bullet = /^[-*•]\s+/;
  const flush = (run, isList) => {
    if (!run.length) return;
    if (isList) blocks.push({ type: 'ul', items: run.map((line) => inline(line.replace(bullet, ''))) });
    else blocks.push({ type: 'p', tokens: inline(run.join(' ')) });
  };
  for (const chunk of text(source).split(/\n{2,}/)) {
    const lines = chunk.split('\n').map((line) => line.trim()).filter(Boolean);
    let run = [];
    let isList = false;
    for (const line of lines) {
      // Consecutive bullets stay one list; switching kind starts a new block.
      if (bullet.test(line) !== isList) {
        flush(run, isList);
        run = [];
        isList = !isList;
      }
      run.push(line);
    }
    flush(run, isList);
  }
  return blocks;
}

function inline(value) {
  const tokens = [];
  const pattern = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let match;
  while ((match = pattern.exec(value))) {
    if (match.index > last) tokens.push({ type: 'text', text: value.slice(last, match.index) });
    if (match[1]) tokens.push({ type: 'strong', text: match[1] });
    else if (SAFE_LINK.test(match[3])) tokens.push({ type: 'link', text: match[2], href: match[3] });
    else tokens.push({ type: 'text', text: match[2] });
    last = pattern.lastIndex;
  }
  if (last < value.length) tokens.push({ type: 'text', text: value.slice(last) });
  return tokens.length ? tokens : [{ type: 'text', text: value }];
}

export default { streamChat, parseMarkdown, trimHistory, loadConversation, saveConversation };
