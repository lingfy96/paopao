// Decode the newest CDP Page.captureScreenshot response into a PNG: node tools/shot.mjs <name>
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const dir = path.join(os.homedir(), '.cursor', 'browser-logs');
const latest = fs
  .readdirSync(dir)
  .filter((f) => f.startsWith('cdp-response-Page.captureScreenshot'))
  .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
  .sort((a, b) => b.t - a.t)[0];
if (!latest) throw new Error('no capture found');
const json = JSON.parse(fs.readFileSync(path.join(dir, latest.f), 'utf8'));
const data = json.data || json.result?.data;
const out = path.join(fileURLToPath(new URL('../screenshots/', import.meta.url)), `${process.argv[2] || 'shot'}.png`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.from(data, 'base64'));
fs.unlinkSync(path.join(dir, latest.f));
console.log(out);
