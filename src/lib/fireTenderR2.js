import { supabase } from './supabase';
import { apiUrl } from './apiBase';
import { getAdminApiAccessToken } from './userManagementAuthToken';

function fireTenderR2Url(subpath) {
  const sub = subpath.startsWith('/') ? subpath : `/${subpath}`;
  return apiUrl(`/api/fire-tender/r2${sub}`);
}

async function fireTenderR2Fetch(subpath, init = {}) {
  let token = await getAdminApiAccessToken(supabase);
  if (!token) {
    throw new Error('You must be signed in to manage tender documents.');
  }

  const doFetch = (accessToken) =>
    fetch(fireTenderR2Url(subpath), {
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
 * Upload one tender document to Cloudflare R2 (prefix fire-tender/tenders/{tenderId}/).
 * @returns {Promise<string>} object key
 */
export async function uploadFireTenderFileToR2({ file, tenderId }) {
  const formData = new FormData();
  formData.append('tenderId', String(tenderId || '').trim());
  formData.append('fileName', file.name);
  if (file.type) formData.append('contentType', file.type);
  formData.append('file', file);

  const res = await fireTenderR2Fetch('/upload', {
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

export async function presignFireTenderR2Get(objectKey, { download = false, fileName } = {}) {
  const res = await fireTenderR2Fetch('/presign-get', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      objectKey,
      download: Boolean(download),
      ...(fileName ? { fileName } : {}),
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || `Download link failed (${res.status}).`);
  if (!body.getUrl) throw new Error('Missing download URL.');
  return body.getUrl;
}

function fileLabelFromKey(objectKey, fallbackName = '') {
  if (fallbackName) return String(fallbackName);
  const s = String(objectKey || '');
  const i = s.lastIndexOf('/');
  const tail = i >= 0 ? s.slice(i + 1) : s;
  const m = tail.match(/^\d+-(.+)$/);
  return m ? m[1] : tail || 'download';
}

export async function viewFireTenderR2File(objectKey) {
  const url = await presignFireTenderR2Get(objectKey, { download: false });
  window.open(url, '_blank', 'noopener,noreferrer');
}

export async function downloadFireTenderR2File(objectKey, fileName) {
  const label = fileLabelFromKey(objectKey, fileName);
  const url = await presignFireTenderR2Get(objectKey, { download: true, fileName: label });
  const a = document.createElement('a');
  a.href = url;
  a.download = label;
  a.rel = 'noopener noreferrer';
  a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function normalizeTenderDocuments(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((d) => ({
      name: String(d?.name || '').trim(),
      object_key: String(d?.object_key || d?.objectKey || '').trim(),
      uploaded_at: d?.uploaded_at || d?.uploadedAt || null,
    }))
    .filter((d) => d.object_key);
}
