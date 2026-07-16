import { supabase } from './supabase';
import { apiUrl } from './apiBase';
import { getAdminApiAccessToken } from './userManagementAuthToken';

function fleetR2Url(subpath) {
  const sub = subpath.startsWith('/') ? subpath : `/${subpath}`;
  return apiUrl(`/api/fleet/r2${sub}`);
}

/** Bearer fetch to fleet R2 routes; refreshes JWT on 401 (same as fetchApiWithAuth). */
async function fleetR2Fetch(subpath, init = {}) {
  let token = await getAdminApiAccessToken(supabase);
  if (!token) {
    throw new Error('You must be signed in to use fleet file storage.');
  }

  const doFetch = (accessToken) =>
    fetch(fleetR2Url(subpath), {
      ...init,
      headers: {
        ...(init.headers || {}),
        Authorization: `Bearer ${accessToken}`,
      },
    });

  let res = await doFetch(token);
  if (res.status === 401) {
    const refreshed = await getAdminApiAccessToken(supabase, { forceRefresh: true });
    if (refreshed && refreshed !== token) {
      res = await doFetch(refreshed);
    }
  }
  return res;
}

/**
 * Upload one file to Cloudflare R2 via the Node proxy (browser → Express → R2).
 * @param {{ file: File, scope: 'documents'|'drivers', segment: string }} opts
 * @returns {Promise<string>} R2 object key (store in Supabase)
 */
export async function uploadFleetFileToR2({ file, scope, segment }) {
  const formData = new FormData();
  formData.append('scope', scope);
  formData.append('segment', segment);
  formData.append('fileName', file.name);
  if (file.type) formData.append('contentType', file.type);
  formData.append('file', file);

  const res = await fleetR2Fetch('/upload', {
    method: 'POST',
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
  const res = await fleetR2Fetch('/presign-get', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
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

/** Trigger browser download via presigned R2 URL. */
export async function downloadFleetR2File(objectKey) {
  const url = await presignFleetR2Get(objectKey);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileLabelFromR2Key(objectKey);
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export const FLEET_ATTACHMENT_ACCEPT =
  '.pdf,.jpg,.jpeg,.png,.doc,.docx,application/pdf,image/jpeg,image/png,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** @typedef {{ key: string, file_name: string, uploaded_at: string, status: 'active'|'replaced'|'deleted', replaced_by?: string }} FleetDocumentHistoryEntry */

/**
 * @param {FleetDocumentHistoryEntry[]|unknown} history
 * @param {Omit<FleetDocumentHistoryEntry, 'uploaded_at'> & { uploaded_at?: string }} entry
 * @returns {FleetDocumentHistoryEntry[]}
 */
export function appendFleetDocumentHistory(history, entry) {
  const list = Array.isArray(history) ? [...history] : [];
  list.push({
    ...entry,
    uploaded_at: entry.uploaded_at || new Date().toISOString(),
  });
  return list;
}

/**
 * @param {FleetDocumentHistoryEntry[]|unknown} history
 * @param {string} key
 * @param {'replaced'|'deleted'} status
 * @param {{ replaced_by?: string }} [extra]
 * @returns {FleetDocumentHistoryEntry[]}
 */
export function markFleetDocumentHistoryEntry(history, key, status, extra = {}) {
  const list = Array.isArray(history) ? [...history] : [];
  return list.map((item) =>
    item.key === key && item.status === 'active'
      ? { ...item, status, ...extra }
      : item
  );
}
