/**
 * Rebuild appointment-footer-full.png at Letter width (612pt @ 150dpi = 1275px).
 * Extends the existing A4-width (1240px) asset so black/red bars reach Letter edges.
 */
import fs from 'fs';
import sharp from 'sharp';

const SRC = 'server/assets/appointment-footer-full.png';
const OUT = 'server/assets/appointment-footer-full.png';
const TARGET_W = 1275; // 612pt * 150/72
const TARGET_H = 155;

const meta = await sharp(SRC).metadata();
console.log('src', meta.width, meta.height);

const src = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { data, info } = src;
const w = info.width;
const h = info.height;
const ch = info.channels;

const out = Buffer.alloc(TARGET_W * TARGET_H * 4, 255);
// Fill white opaque
for (let i = 0; i < TARGET_W * TARGET_H; i += 1) {
  out[i * 4] = 255;
  out[i * 4 + 1] = 255;
  out[i * 4 + 2] = 255;
  out[i * 4 + 3] = 255;
}

const padLeft = Math.floor((TARGET_W - w) / 2);
const padRight = TARGET_W - w - padLeft;

function sample(x, y) {
  const i = (y * w + x) * ch;
  return [data[i], data[i + 1], data[i + 2], ch > 3 ? data[i + 3] : 255];
}

for (let y = 0; y < Math.min(h, TARGET_H); y += 1) {
  const leftPx = sample(0, y);
  const rightPx = sample(w - 1, y);
  for (let x = 0; x < padLeft; x += 1) {
    const o = (y * TARGET_W + x) * 4;
    out[o] = leftPx[0];
    out[o + 1] = leftPx[1];
    out[o + 2] = leftPx[2];
    out[o + 3] = leftPx[3];
  }
  for (let x = 0; x < w; x += 1) {
    const [r, g, b, a] = sample(x, y);
    const o = (y * TARGET_W + padLeft + x) * 4;
    out[o] = r;
    out[o + 1] = g;
    out[o + 2] = b;
    out[o + 3] = a;
  }
  for (let x = 0; x < padRight; x += 1) {
    const o = (y * TARGET_W + padLeft + w + x) * 4;
    out[o] = rightPx[0];
    out[o + 1] = rightPx[1];
    out[o + 2] = rightPx[2];
    out[o + 3] = rightPx[3];
  }
}

await sharp(out, { raw: { width: TARGET_W, height: TARGET_H, channels: 4 } })
  .png()
  .toFile(OUT);

const check = await sharp(OUT).metadata();
console.log('out', check.width, check.height, 'pt', (check.width * 72) / 150, (check.height * 72) / 150);
