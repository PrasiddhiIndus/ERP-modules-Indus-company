import { supabase } from './supabase';
import { apiUrl } from './apiBase';
import { getAdminApiAccessToken } from './userManagementAuthToken';

function marketingExpoR2Url(subpath) {
  const sub = subpath.startsWith('/') ? subpath : `/${subpath}`;
  return apiUrl(`/api/marketing/expo-r2${sub}`);
}

async function marketingExpoR2Fetch(subpath, init = {}) {
  let token = await getAdminApiAccessToken(supabase);
  if (!token) {
    throw new Error('You must be signed in to upload PDFs.');
  }

  const doFetch = (accessToken) =>
    fetch(marketingExpoR2Url(subpath), {
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
 * Upload one Expo / Seminar PDF to Cloudflare R2.
 * @param {File} file
 * @returns {Promise<{ objectKey: string, fileName: string }>}
 */
export async function uploadMarketingExpoPdfToR2(file) {
  const formData = new FormData();
  formData.append('fileName', file.name);
  if (file.type) formData.append('contentType', file.type);
  formData.append('file', file);

  const res = await marketingExpoR2Fetch('/upload', {
    method: 'POST',
    body: formData,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.message || `Upload failed (${res.status}).`);
  }
  const { objectKey, fileName } = body;
  if (!objectKey) throw new Error('Upload response missing object key.');
  return { objectKey: String(objectKey), fileName: String(fileName || file.name) };
}

export async function presignMarketingExpoR2Get(objectKey) {
  const res = await marketingExpoR2Fetch('/presign-get', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ objectKey }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || `Could not open PDF (${res.status}).`);
  if (!body.getUrl) throw new Error('Missing PDF link.');
  return body.getUrl;
}

export function marketingExpoFileLabel(item, index = 0) {
  if (item && typeof item === 'object') {
    return item.fileName || `PDF ${index + 1}`;
  }
  const raw = String(item || '');
  try {
    const path = decodeURIComponent(raw.split('?')[0].split('/').pop() || '');
    return path || `File ${index + 1}`;
  } catch {
    return `File ${index + 1}`;
  }
}

export async function openMarketingExpoFile(item) {
  if (item && typeof item === 'object' && item.objectKey) {
    const url = await presignMarketingExpoR2Get(item.objectKey);
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  if (typeof item === 'string' && item) {
    window.open(item, '_blank', 'noopener,noreferrer');
  }
}
