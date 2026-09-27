/**
 * Aliyun FC custom-runtime web server: static `dist` + /api/paopao/chat.
 * The Zhipu key stays in ZHIPU_API_KEY and never reaches the browser.
 */
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { streamPaopaoChat, createRateLimiter } from './paopaoChat.mjs';

const ROOT = join(fileURLToPath(new URL('..', import.meta.url)));
const DIST = join(ROOT, 'dist');
const PORT = Number(process.env.FC_SERVER_PORT || process.env.PORT || 9000);
const allow = createRateLimiter({ windowMs: 60000, max: 20 });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
};

function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const i = trimmed.indexOf('=');
    const key = trimmed.slice(0, i).trim();
    const value = trimmed.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}
loadEnv(join(ROOT, '.env'));

function clientKey(req) {
  return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'anonymous';
}

function safeFile(urlPath) {
  const decoded = decodeURIComponent((urlPath || '/').split('?')[0]);
  const relative = decoded.replace(/^\/+/, '') || 'index.html';
  const full = normalize(join(DIST, relative));
  if (!full.startsWith(DIST + sep) && full !== DIST) return null;
  return full;
}

function sendFile(res, file) {
  const type = MIME[extname(file).toLowerCase()] || 'application/octet-stream';
  const cache = extname(file) === '.html' || file.endsWith('sw.js') ? 'no-cache' : 'public, max-age=31536000, immutable';
  // FC HTTP trigger otherwise adds Content-Disposition: attachment and the browser downloads HTML.
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': cache, 'Content-Disposition': 'inline' });
  createReadStream(file).pipe(res);
}

function sendIndex(res) {
  const index = join(DIST, 'index.html');
  if (!existsSync(index)) {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('frontend build missing');
    return;
  }
  sendFile(res, index);
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  return JSON.parse(raw);
}

async function chat(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'POST,OPTIONS' });
    res.end();
    return;
  }
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: '只支持 POST' }));
    return;
  }
  if (!allow(clientKey(req))) {
    res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: '请求过于频繁' }));
    return;
  }
  let body;
  try {
    body = await readJson(req);
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: '请求不是合法 JSON' }));
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const controller = new AbortController();
  req.on('close', () => controller.abort());
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

function staticOrSpa(req, res) {
  const url = (req.url || '/').split('?')[0];
  if (url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'inline' });
    res.end(JSON.stringify({ ok: true, chat: Boolean(process.env.ZHIPU_API_KEY) }));
    return;
  }
  const file = safeFile(url);
  if (file && existsSync(file) && statSync(file).isFile()) return sendFile(res, file);
  if (file && existsSync(join(file, 'index.html'))) return sendFile(res, join(file, 'index.html'));
  sendIndex(res);
}

const server = createServer((req, res) => {
  const path = (req.url || '/').split('?')[0];
  if (path === '/api/paopao/chat' || path === '/paopao/api/paopao/chat') return void chat(req, res);
  if (req.method === 'GET' || req.method === 'HEAD') return staticOrSpa(req, res);
  res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[paopao] fc web listening on ${PORT}, dist=${existsSync(DIST)}`);
});
