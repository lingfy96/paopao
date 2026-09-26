// Canvas output: share card (with QR), per-movie poster, and photo compression. All functions resolve null on failure.
import qrcode from 'qrcode-generator';

export const shareUrl = () => {
  try {
    return import.meta.env.VITE_PUBLIC_URL || location.origin + location.pathname;
  } catch {
    return 'https://paopao.select';
  }
};

const FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC",sans-serif';

function drawQr(ctx, text, x, y, size) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const cell = size / n;
  ctx.fillStyle = '#16121f';
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) if (qr.isDark(r, c)) ctx.fillRect(x + c * cell, y + r * cell, Math.ceil(cell), Math.ceil(cell));
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function bubble(ctx, x, y, r, color) {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.05, x, y, r);
  g.addColorStop(0, 'rgba(255,255,255,.85)');
  g.addColorStop(0.25, color + 'cc');
  g.addColorStop(1, color + '22');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.35)';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function wrap(ctx, text, x, y, maxWidth, lineHeight, maxLines = 4) {
  let line = '';
  let lines = 0;
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxWidth) {
      ctx.fillText(line, x, y);
      y += lineHeight;
      line = ch;
      if (++lines >= maxLines - 1) break;
    } else line += ch;
  }
  if (line) ctx.fillText(line, x, y);
  return y + lineHeight;
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('no-canvas');
  return { c, ctx };
}

function backdrop(ctx, w, h, a = '#9b6cf0', b = '#d9a441') {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#1d1530');
  g.addColorStop(1, '#0b0b10');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const glow = ctx.createRadialGradient(w * 0.7, h * 0.25, 10, w * 0.7, h * 0.25, w * 0.8);
  glow.addColorStop(0, a + '66');
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  const glow2 = ctx.createRadialGradient(w * 0.1, h * 0.85, 10, w * 0.1, h * 0.85, w * 0.7);
  glow2.addColorStop(0, b + '40');
  glow2.addColorStop(1, 'transparent');
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, w, h);
}

function qrPanel(ctx, url, x, y, size, caption) {
  ctx.fillStyle = '#fff';
  roundRect(ctx, x, y, size, size, 22);
  ctx.fill();
  try {
    drawQr(ctx, url, x + 18, y + 18, size - 36);
  } catch {
    ctx.fillStyle = '#16121f';
    ctx.font = `24px ${FONT}`;
    ctx.fillText('泡泡选片', x + 40, y + size / 2);
  }
  ctx.fillStyle = '#cbbfe0';
  ctx.font = `24px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(caption, x + size / 2, y + size + 42);
  ctx.textAlign = 'left';
}

const toUrl = (c) => {
  try {
    return c.toDataURL('image/png');
  } catch {
    return null;
  }
};

/** @typedef {{ url?: string, a?: string, b?: string }} PosterOptions */

/** App-level share card for the home page. @param {PosterOptions} [opts] */
export function drawShareCard({ url = shareUrl(), a, b } = {}) {
  try {
    const W = 750, H = 1200;
    const { c, ctx } = canvas(W, H);
    backdrop(ctx, W, H, a, b);
    bubble(ctx, 560, 250, 150, a || '#b77cf0');
    bubble(ctx, 400, 150, 46, '#f0a6d8');
    bubble(ctx, 660, 470, 34, '#e9c77a');
    bubble(ctx, 120, 640, 26, '#8fb0ff');
    ctx.fillStyle = '#b9a5d8';
    ctx.font = `600 24px ${FONT}`;
    ctx.fillText('PAOPAO SELECT', 64, 120);
    ctx.fillStyle = '#fff';
    ctx.font = `800 92px ${FONT}`;
    ctx.fillText('泡泡选片', 60, 240);
    ctx.fillStyle = '#eadcff';
    ctx.font = `500 38px ${FONT}`;
    ctx.fillText('今晚的好故事，', 64, 370);
    ctx.fillText('藏在下一张卡里', 64, 426);
    ctx.fillStyle = '#a99cbd';
    ctx.font = `28px ${FONT}`;
    ctx.fillText('按住一颗泡泡 → 啵 → 翻出今晚的电影', 64, 520);
    ctx.fillText('不用注册，扫码 5 秒开盒', 64, 566);
    ctx.strokeStyle = 'rgba(255,255,255,.14)';
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.moveTo(60, 660);
    ctx.lineTo(690, 660);
    ctx.stroke();
    ctx.setLineDash([]);
    qrPanel(ctx, url, 245, 730, 260, '扫码，吹一颗属于你的泡泡');
    ctx.fillStyle = '#6f6585';
    ctx.font = `20px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('ADMIT ONE · A LITTLE SERENDIPITY', W / 2, 1140);
    ctx.textAlign = 'left';
    return toUrl(c);
  } catch {
    return null;
  }
}

/** Poster for a single recommended movie (kept from the original result-page share, rebranded + QR). @param {any} movie @param {PosterOptions} [opts] */
export function drawMoviePoster(movie, { url = shareUrl(), a, b } = {}) {
  try {
    const W = 750, H = 1200;
    const { c, ctx } = canvas(W, H);
    backdrop(ctx, W, H, a, b);
    ctx.strokeStyle = movie.rarity === 'SSR' ? '#e2c27d' : '#a78bfa';
    ctx.lineWidth = 2;
    roundRect(ctx, 34, 34, W - 68, H - 68, 28);
    ctx.stroke();
    ctx.fillStyle = '#c8b2ff';
    ctx.font = `600 24px ${FONT}`;
    ctx.fillText('泡泡选片 · PAOPAO SELECT', 70, 110);
    ctx.fillStyle = movie.rarity === 'SSR' ? '#f0d38f' : '#ebd8a5';
    ctx.font = `bold 110px Georgia,serif`;
    ctx.fillText(movie.rarity || 'R', 66, 250);
    ctx.fillStyle = '#fff';
    ctx.font = `800 58px ${FONT}`;
    const after = wrap(ctx, movie.title, 70, 360, 610, 72, 3);
    ctx.font = `28px ${FONT}`;
    ctx.fillStyle = '#d0c8df';
    ctx.fillText(`★ ${movie.rating} · ${movie.year ? movie.year + ' · ' : ''}${movie.duration} 分钟 · ${movie.tags.slice(0, 2).join(' / ')}`, 70, after + 10);
    ctx.fillStyle = '#e9ddff';
    ctx.font = `30px ${FONT}`;
    wrap(ctx, `“${movie.reason || movie.synopsis}”`, 70, after + 100, 610, 48, 4);
    qrPanel(ctx, url, 70, 850, 220, '扫码也来开一盒');
    ctx.fillStyle = '#a99cbd';
    ctx.font = `26px ${FONT}`;
    ctx.fillText(new Date().toLocaleDateString('zh-CN'), 340, 930);
    ctx.fillText('今晚的好故事，', 340, 990);
    ctx.fillText('藏在下一张卡里', 340, 1034);
    return toUrl(c);
  } catch {
    return null;
  }
}

/** Downscale a user photo to a JPEG Blob. Resolves null when anything fails. */
export function compressImage(file, max = 1080, quality = 0.82) {
  return new Promise((resolve) => {
    try {
      if (!file || !/^image\//.test(file.type)) return resolve(null);
      const url = URL.createObjectURL(file);
      const img = new Image();
      const done = (v) => {
        URL.revokeObjectURL(url);
        resolve(v);
      };
      img.onload = () => {
        try {
          const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
          const { c, ctx } = canvas(Math.round(img.naturalWidth * scale), Math.round(img.naturalHeight * scale));
          ctx.drawImage(img, 0, 0, c.width, c.height);
          c.toBlob((blob) => done(blob), 'image/jpeg', quality);
        } catch {
          done(null);
        }
      };
      img.onerror = () => done(null);
      setTimeout(() => done(null), 8000);
      img.src = url;
    } catch {
      resolve(null);
    }
  });
}

export async function dataUrlToFile(dataUrl, name) {
  try {
    const blob = await (await fetch(dataUrl)).blob();
    return new File([blob], name, { type: 'image/png' });
  } catch {
    return null;
  }
}
