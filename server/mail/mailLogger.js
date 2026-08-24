const REDACT_KEYS = new Set([
  'clientsecret',
  'client_secret',
  'microsoft_client_secret',
  'accesstoken',
  'access_token',
  'token',
  'password',
  'smtp_pass',
  'smtppass',
  'authorization',
]);

function sanitizeMeta(meta) {
  if (!meta || typeof meta !== 'object') return meta;
  const out = {};
  for (const [key, value] of Object.entries(meta)) {
    const normalized = String(key).toLowerCase();
    if (REDACT_KEYS.has(normalized)) {
      out[key] = '[redacted]';
      continue;
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = sanitizeMeta(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function maskEmail(email) {
  const text = String(email || '').trim();
  if (!text || !text.includes('@')) return '***';
  const [local, domain] = text.split('@');
  const visible = local.length <= 2 ? '*' : `${local.slice(0, 2)}***`;
  return `${visible}@${domain}`;
}

export function logMailInfo(event, meta = {}) {
  console.info(`[mail] ${event}`, sanitizeMeta(meta));
}

export function logMailWarn(event, meta = {}) {
  console.warn(`[mail] ${event}`, sanitizeMeta(meta));
}

export function logMailError(event, meta = {}) {
  console.error(`[mail] ${event}`, sanitizeMeta(meta));
}
