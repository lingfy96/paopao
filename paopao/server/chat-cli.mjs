// Streaming bridge for the Flask backend: JSON request on stdin, newline delimited events on
// stdout. Keeping the logic in paopaoChat.mjs means Python never holds a second copy of the
// prompt, the schema or the action whitelist.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { streamPaopaoChat } from './paopaoChat.mjs';

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
loadEnv(join(dirname(fileURLToPath(import.meta.url)), '../.env'));

let body = {};
try {
  body = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {
  process.stdout.write(`${JSON.stringify({ type: 'error', kind: 'bad-request', message: '请求不是合法 JSON' })}\n`);
  process.exit(0);
}

for await (const event of streamPaopaoChat(body, {
  apiKey: process.env.ZHIPU_API_KEY || '',
  model: process.env.ZHIPU_MODEL || undefined,
  baseUrl: process.env.ZHIPU_BASE_URL || undefined,
})) {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}
