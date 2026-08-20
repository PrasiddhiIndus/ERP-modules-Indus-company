/** Shared DSC / authorised-signature image helpers for Billing invoices. */

export function readImageAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImageDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

export async function buildSignaturePatternDataUrl(dataUrl) {
  const img = await loadImageDataUrl(dataUrl);
  const maxW = 640;
  const scale = Math.min(1, maxW / Math.max(1, img.naturalWidth || img.width));
  const w = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
  const h = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, w, h);

  const imageData = ctx.getImageData(0, 0, w, h);
  const px = imageData.data;
  const lum = new Float32Array(w * h);
  const integral = new Float32Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y += 1) {
    let rowSum = 0;
    for (let x = 0; x < w; x += 1) {
      const pixelIndex = y * w + x;
      const i = pixelIndex * 4;
      const value = (px[i] * 0.299) + (px[i + 1] * 0.587) + (px[i + 2] * 0.114);
      lum[pixelIndex] = value;
      rowSum += value;
      integral[(y + 1) * (w + 1) + (x + 1)] = integral[y * (w + 1) + (x + 1)] + rowSum;
    }
  }
  const localRadius = Math.max(8, Math.min(28, Math.round(Math.min(w, h) / 10)));
  const localAverage = (x, y) => {
    const x1 = Math.max(0, x - localRadius);
    const y1 = Math.max(0, y - localRadius);
    const x2 = Math.min(w - 1, x + localRadius);
    const y2 = Math.min(h - 1, y + localRadius);
    const stride = w + 1;
    const sum =
      integral[(y2 + 1) * stride + (x2 + 1)] -
      integral[y1 * stride + (x2 + 1)] -
      integral[(y2 + 1) * stride + x1] +
      integral[y1 * stride + x1];
    return sum / ((x2 - x1 + 1) * (y2 - y1 + 1));
  };

  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  let kept = 0;
  const alphaMask = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const pixelIndex = y * w + x;
      const i = (y * w + x) * 4;
      const r = px[i];
      const g = px[i + 1];
      const b = px[i + 2];
      const localDarkness = localAverage(x, y) - lum[pixelIndex];
      const colorSpread = Math.max(r, g, b) - Math.min(r, g, b);
      const penStroke =
        localDarkness > 16 ||
        (localDarkness > 10 && lum[pixelIndex] < 120) ||
        (localDarkness > 8 && colorSpread > 20 && lum[pixelIndex] < 155);
      if (!penStroke) {
        px[i + 3] = 0;
        continue;
      }
      const alpha = Math.min(255, Math.max(150, Math.round((localDarkness - 5) * 12)));
      px[i] = Math.max(0, Math.round(r * 0.25));
      px[i + 1] = Math.max(0, Math.round(g * 0.25));
      px[i + 2] = Math.max(0, Math.round(b * 0.25));
      px[i + 3] = alpha;
      alphaMask[pixelIndex] = alpha;
    }
  }

  // Remove any dark border or paper edge connected to the image boundary.
  const queue = [];
  const enqueue = (x, y) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const idx = y * w + x;
    if (!alphaMask[idx]) return;
    alphaMask[idx] = 0;
    px[idx * 4 + 3] = 0;
    queue.push(idx);
  };
  for (let x = 0; x < w; x += 1) {
    enqueue(x, 0);
    enqueue(x, h - 1);
  }
  for (let y = 0; y < h; y += 1) {
    enqueue(0, y);
    enqueue(w - 1, y);
  }
  while (queue.length) {
    const idx = queue.pop();
    const x = idx % w;
    const y = Math.floor(idx / w);
    enqueue(x + 1, y);
    enqueue(x - 1, y);
    enqueue(x, y + 1);
    enqueue(x, y - 1);
  }

  // Drop isolated speckles from paper texture/shadows without thinning real strokes.
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const maskIndex = y * w + x;
      if (!alphaMask[maskIndex]) continue;
      let neighbors = 0;
      for (let yy = Math.max(0, y - 1); yy <= Math.min(h - 1, y + 1); yy += 1) {
        for (let xx = Math.max(0, x - 1); xx <= Math.min(w - 1, x + 1); xx += 1) {
          if (xx === x && yy === y) continue;
          if (alphaMask[yy * w + xx]) neighbors += 1;
        }
      }
      const i = maskIndex * 4;
      if (neighbors < 1) {
        px[i + 3] = 0;
        continue;
      }
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      kept += 1;
    }
  }
  if (kept < 20 || maxX < minX || maxY < minY) {
    ctx.clearRect(0, 0, w, h);
    return canvas.toDataURL('image/png');
  }
  ctx.putImageData(imageData, 0, 0);

  const pad = 10;
  const cropX = Math.max(0, minX - pad);
  const cropY = Math.max(0, minY - pad);
  const cropW = Math.min(w - cropX, maxX - minX + 1 + pad * 2);
  const cropH = Math.min(h - cropY, maxY - minY + 1 + pad * 2);
  const out = document.createElement('canvas');
  out.width = Math.max(1, cropW);
  out.height = Math.max(1, cropH);
  const outCtx = out.getContext('2d');
  if (!outCtx) return canvas.toDataURL('image/png');
  outCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
  return out.toDataURL('image/png');
}

