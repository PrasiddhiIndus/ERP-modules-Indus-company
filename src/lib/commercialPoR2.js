import { supabase } from './supabase';
import { apiUrl } from './apiBase';
import { getAdminApiAccessToken } from './userManagementAuthToken';

function commercialPoR2Url(subpath) {
  const sub = subpath.startsWith('/') ? subpath : `/${subpath}`;
  return apiUrl(`/api/commercial-po/r2${sub}`);
}

/** Bearer fetch to commercial PO R2 routes; refreshes JWT on 401. */
async function commercialPoR2Fetch(subpath, init = {}) {
  let token = await getAdminApiAccessToken(supabase);
  if (!token) {
    throw new Error('You must be signed in to upload PO documents.');
  }

  const doFetch = (accessToken) =>
    fetch(commercialPoR2Url(subpath), {
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
 * Upload one PO document to Cloudflare R2 (bucket indus-erp-uploads, prefix commercial-po/).
 * @param {{ file: File, poId: string, folder: 'po-copy'|'scope-of-work'|'penalty-clause' }} opts
 * @returns {Promise<string>} R2 object key (store in Supabase jsonb)
 */
export async function uploadCommercialPoFileToR2({ file, poId, folder }) {
  const formData = new FormData();
  formData.append('poId', String(poId || '').trim());
  formData.append('folder', String(folder || '').trim());
  formData.append('fileName', file.name);
  if (file.type) formData.append('contentType', file.type);
  formData.append('file', file);

  const res = await commercialPoR2Fetch('/upload', {
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

export async function presignCommercialPoR2Get(objectKey, { download = false, fileName } = {}) {
  const res = await commercialPoR2Fetch('/presign-get', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
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

function fileLabelFromCommercialPoKey(objectKey, fallbackName = '') {
  if (fallbackName) return String(fallbackName);
  const s = String(objectKey || '');
  const i = s.lastIndexOf('/');
  const tail = i >= 0 ? s.slice(i + 1) : s;
  const m = tail.match(/^\d+-(.+)$/);
  return m ? m[1] : tail || 'download';
}

/** Open PO document in a new tab (inline). */
export async function viewCommercialPoR2File(objectKey) {
  const url = await presignCommercialPoR2Get(objectKey, { download: false });
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** Trigger browser download via presigned R2 URL (Content-Disposition: attachment). */
export async function downloadCommercialPoR2File(objectKey, fileName) {
  const label = fileLabelFromCommercialPoKey(objectKey, fileName);
  const url = await presignCommercialPoR2Get(objectKey, { download: true, fileName: label });
  const a = document.createElement('a');
  a.href = url;
  a.download = label;
  a.rel = 'noopener noreferrer';
  a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Short temporary share URL (in-memory code; no DB). Valid ~24h; opens redirect to R2. */
export async function createCommercialPoShareLink(objectKey) {
  const res = await commercialPoR2Fetch('/share-link', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ objectKey }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || `Share link failed (${res.status}).`);
  let shareUrl = String(body.shareUrl || '').trim();
  if (!shareUrl && body.code) {
    shareUrl = `/api/commercial-po/f/${body.code}`;
  }
  if (!shareUrl) throw new Error('Missing share URL.');
  // Always copy an absolute URL so paste works outside the ERP tab.
  if (shareUrl.startsWith('/') && typeof window !== 'undefined' && window.location?.origin) {
    shareUrl = `${window.location.origin}${shareUrl}`;
  }
  return shareUrl;
}
