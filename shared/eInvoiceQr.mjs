import QRCode from 'qrcode';

const SIGNED_QR_KEYS = new Set([
  'signedqrcode',
  'signedqr',
  'qrcode',
  'qrcodedata',
  'signedqrdata',
]);

function compactBase64(value) {
  return String(value || '').replace(/\s+/g, '');
}

/** True only for a real PNG or JPEG data URL. A signed-QR JWT pasted into a data URL is not an image. */
export function isQrImageDataUrl(value) {
  if (typeof value !== 'string') return false;
  const match = value.trim().match(/^data:image\/(png|jpe?g);base64,([\s\S]+)$/i);
  if (!match) return false;
  const payload = compactBase64(match[2]);
  return payload.startsWith('iVBORw0KGgo') || payload.startsWith('/9j/');
}

function parseMaybeJson(value) {
  if (typeof value !== 'string') return value;
  const text = value.trim();
  if (!text.startsWith('{') && !text.startsWith('[')) return value;
  try {
    return JSON.parse(text);
  } catch {
    return value;
  }
}

/** Whitebooks often returns `data` as a JSON string. Expand those before looking for the signed QR. */
function expandProviderPayload(data, depth = 0) {
  if (!data || typeof data !== 'object' || depth > 4) return data;
  if (Array.isArray(data)) return data.map((item) => expandProviderPayload(item, depth + 1));
  const out = { ...data };
  for (const key of ['data', 'Data', 'providerResponse']) {
    const parsed = parseMaybeJson(out[key]);
    if (parsed && typeof parsed === 'object') out[key] = expandProviderPayload(parsed, depth + 1);
  }
  return out;
}

function keyName(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Payload NIC/Whitebooks put in SignedQRCode.
 * It is usually a JWT (eyJ...), sometimes a long signed string that does not start with eyJ,
 * and sometimes a PNG. Do not require the JWT shape — that dropped real QR payloads.
 */
function isSignedQrValue(value) {
  return typeof value === 'string' && value.trim().length >= 12;
}

/**
 * NIC/Whitebooks SignedQRCode. Walks objects and JSON strings.
 * Ignores SignedInvoice (also a JWT) and short placeholder fields.
 */
export function findSignedQrCode(root) {
  const data = expandProviderPayload(root);
  const stack = [data];
  const seen = new Set();
  let fallback = null;
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== 'object') continue;
    if (seen.has(cur)) continue;
    seen.add(cur);
    const entries = Array.isArray(cur) ? cur.entries() : Object.entries(cur);
    for (const [name, value] of entries) {
      const key = keyName(name);
      if (SIGNED_QR_KEYS.has(key) && isSignedQrValue(value)) {
        const text = String(value).trim();
        if (key === 'signedqrcode' || key === 'signedqr' || key === 'signedqrdata') return text;
        if (!fallback) fallback = text;
      }
      if (typeof value === 'string') {
        const parsed = parseMaybeJson(value);
        if (parsed && typeof parsed === 'object') stack.push(parsed);
        continue;
      }
      if (value && typeof value === 'object') stack.push(value);
    }
  }
  return fallback;
}

function imageDataUrlFromBase64(value) {
  const compact = compactBase64(value);
  if (compact.startsWith('iVBORw0KGgo')) return `data:image/png;base64,${compact}`;
  if (compact.startsWith('/9j/')) return `data:image/jpeg;base64,${compact}`;
  return null;
}

/** Pull the signed text out of a data URL that is not actually a PNG/JPEG. */
function signedPayloadFromValue(value) {
  const text = String(value || '').trim();
  const match = text.match(/^data:[^,]*,([\s\S]+)$/i);
  return (match ? match[1] : text).trim();
}

/**
 * Turn a Whitebooks signed QR (JWT text, PNG base64, or an existing data URL) into a PNG data URL.
 * The GST QR must encode the signed payload itself, not only the IRN.
 */
export async function signedQrToImageDataUrl(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (isQrImageDataUrl(raw)) return raw;
  const payload = signedPayloadFromValue(raw);
  const embedded = imageDataUrlFromBase64(payload);
  if (embedded) return embedded;
  if (payload.length < 12) return null;
  try {
    return await QRCode.toDataURL(payload, {
      errorCorrectionLevel: 'L',
      margin: 1,
      width: 280,
    });
  } catch (err) {
    console.warn('e-invoice QR image failed', err?.message || err);
    return null;
  }
}
