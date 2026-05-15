import { supabase } from './supabase';


function getFleetApiOrigin() {
  const fromEnv = String(import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');
  if (fromEnv) return fromEnv;
  if (import.meta.env.DEV) return 'http://127.0.0.1:8787';
  return '';
}

function fleetR2Url(subpath) {
  const sub = subpath.startsWith('/') ? subpath : `/${subpath}`;
  const origin = getFleetApiOrigin();
  if (origin) return `${origin}/api/fleet/r2${sub}`;
  return `/api/fleet/r2${sub}`;
}

/**
 * Upload one file to Cloudflare R2 via the Node proxy (browser → Express → R2).
 * @param {{ file: File, scope: 'documents'|'drivers', segment: string }} opts
 * @returns {Promise<string>} R2 object key (store in Supabase)
 */
export async function uploadFleetFileToR2({ file, scope, segment }) {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session?.access_token) {
    throw new Error('You must be signed in to upload files.');
  }

  const formData = new FormData();
  formData.append('scope', scope);
  formData.append('segment', segment);
  formData.append('fileName', file.name);
  if (file.type) formData.append('contentType', file.type);
  formData.append('file', file);

  const res = await fetch(fleetR2Url('/upload'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
    body: formData,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.message || `Upload failed (${res.status}).`);
  }
  const { objectKey } = body;
  if (!objectKey) throw new Error('Upload response missing object key.');
  return String(objectKey);
}

export async function presignFleetR2Get(objectKey) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('You must be signed in to open this file.');
  }
  const res = await fetch(fleetR2Url('/presign-get'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ objectKey }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || `Download link failed (${res.status}).`);
  if (!body.getUrl) throw new Error('Missing download URL.');
  return body.getUrl;
}

/** Safe segment for fleet upload API (min 4 chars after server-side sanitize). */
export function buildFleetUploadSegment(parts) {
  const raw = String(parts || '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
  if (raw.length >= 4) return raw;
  return `seg-${Date.now()}`.slice(0, 72);
}

/**
 * Read R2 keys from a row (jsonb array or legacy single URL / key in file_url).
 * @param {Record<string, unknown>} row
 * @param {string} [legacyUrlField='file_url']
 * @returns {string[]}
 */
export function parseFleetAttachmentKeys(row, legacyUrlField = 'file_url') {
  const k = row?.r2_attachment_keys;
  if (Array.isArray(k)) return k.filter(Boolean).map(String);
  if (k && typeof k === 'string') {
    try {
      const p = JSON.parse(k);
      if (Array.isArray(p)) return p.filter(Boolean).map(String);
    } catch {
      /* ignore */
    }
  }
  const legacy = legacyUrlField ? row?.[legacyUrlField] : null;
  if (legacy && String(legacy).trim().startsWith('fleet/')) {
    return [String(legacy).trim()];
  }
  return [];
}

export function fileLabelFromR2Key(key) {
  const s = String(key || '');
  const i = s.lastIndexOf('/');
  const tail = i >= 0 ? s.slice(i + 1) : s;
  const m = tail.match(/^\d+-(.+)$/);
  return m ? m[1] : tail || key;
}
