// Serverless proxy for Vercel-style deployments. The Zhipu key only ever exists here, in
// ZHIPU_API_KEY; the browser talks to this route and nothing else.
import { streamPaopaoChat, createRateLimiter } from '../../server/paopaoChat.mjs';

const allow = createRateLimiter({ windowMs: 60000, max: 20 });

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = '';
  for await (const chunk of req) raw += chunk;
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: '只支持 POST' });
    return;
  }
  const key = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'anonymous';
  if (!allow(key)) {
    res.status(429).json({ error: '请求过于频繁' });
    return;
  }
  const body = await readBody(req);
  if (!body) {
    res.status(400).json({ error: '请求不是合法 JSON' });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const controller = new AbortController();
  res.on('close', () => controller.abort());
  try {
    for await (const event of streamPaopaoChat(body, {
      apiKey: process.env.ZHIPU_API_KEY || '',
      model: process.env.ZHIPU_MODEL || undefined,
      baseUrl: process.env.ZHIPU_BASE_URL || undefined,
      signal: controller.signal,
    })) {
      if (res.writableEnded) return;
      if (event.type === 'error' && event.status === 401) console.error('[paopao] Zhipu auth failed: check ZHIPU_API_KEY');
      const { status, ...safe } = event;
      res.write(`data: ${JSON.stringify(safe)}\n\n`);
    }
  } catch (error) {
    console.error('[paopao] chat proxy failed:', error?.message);
    if (!res.writableEnded) res.write(`data: ${JSON.stringify({ type: 'error', kind: 'upstream', message: 'AI 暂时不可用' })}\n\n`);
  }
  if (!res.writableEnded) res.end();
}
