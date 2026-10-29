/**
 * Opaque portal links: email uses /r/<sealed> so the raw token is not visible.
 * Sealed payload is AES-256-GCM(plainToken).
 */
import crypto from 'crypto';

function secretKey() {
  const raw = String(process.env.PORTAL_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'indus-portal-link').trim();
  return crypto.createHash('sha256').update(raw).digest();
}

export function sealPortalToken(plainToken) {
  const plain = String(plainToken || '').trim();
  if (!plain) throw new Error('Missing portal token.');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', secretKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64url');
}

/** Returns plain token, or null when the value is not a valid sealed payload. */
export function tryUnsealPortalToken(sealed) {
  try {
    const buf = Buffer.from(String(sealed || '').trim(), 'base64url');
    if (buf.length < 29) return null;
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', secretKey(), iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8').trim();
    return plain || null;
  } catch {
    return null;
  }
}

/** Resolve either a sealed /r/ code or a legacy plain portal token. */
export function resolvePortalTokenParam(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const unsealed = tryUnsealPortalToken(raw);
  return unsealed || raw;
}
