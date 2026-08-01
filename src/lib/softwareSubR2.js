import { supabase } from './supabase';
import { apiUrl } from './apiBase';
import { getAdminApiAccessToken } from './userManagementAuthToken';

function softwareSubR2Url(subpath) {
  const sub = subpath.startsWith('/') ? subpath : `/${subpath}`;
  return apiUrl(`/api/software-subscriptions/r2${sub}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientHttpStatus(status) {
  return status === 0 || status === 502 || status === 503 || status === 504;
}

/** Bearer fetch to software-subscription R2 routes; refreshes JWT on 401; retries transient proxy failures. */
async function softwareSubR2Fetch(subpath, init = {}) {
  let token = await getAdminApiAccessToken(supabase);
  if (!token) {
    throw new Error('You must be signed in to manage invoice attachments.');
  }

  const doFetch = (accessToken) =>
    fetch(softwareSubR2Url(subpath), {
      ...init,
      cache: 'no-store',
      headers: {
        ...(init.headers || {}),
        Authorization: `Bearer ${accessToken}`,
      },
    });

  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      let res = await doFetch(token);
      if (res.status === 401) {
        const refreshed = await getAdminApiAccessToken(supabase, { forceRefresh: true });
        if (refreshed && refreshed !== token) {
          token = refreshed;
          res = await doFetch(token);
        }
      }
      // Vite proxy returns 500 with empty/HTML body when the API process restarts mid-request.
      if (res.status === 500 && attempt < 2) {
        const peek = await res.clone().text().catch(() => '');
        const looksLikeProxyBlip =
          !peek.trim() ||
          /ECONNRESET|ECONNREFUSED|proxy error|socket hang up/i.test(peek) ||
          /^\s*</.test(peek);
        if (looksLikeProxyBlip) {
          await sleep(400 * (attempt + 1));
          continue;
        }
      }
      if (isTransientHttpStatus(res.status) && attempt < 2) {
        await sleep(400 * (attempt + 1));
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
      if (attempt < 2) {
        await sleep(400 * (attempt + 1));
        continue;
      }
    }
  }
  throw new Error(lastError?.message || 'Unable to reach the file server. Try again.');
}

async function readJsonSafe(res) {
  const text = await res.text().catch(() => '');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 180) };
  }
}

/**
 * @param {{ file: File, subscriptionId: string }} opts
 * @returns {Promise<{ objectKey: string, contentType?: string }>}
 */
export async function uploadSoftwareSubFileToR2({ file, subscriptionId }) {
  const formData = new FormData();
  formData.append('subscriptionId', String(subscriptionId || '').trim());
  formData.append('fileName', file.name);
  if (file.type) formData.append('contentType', file.type);
  formData.append('file', file);

  const res = await softwareSubR2Fetch('/upload', {
    method: 'POST',
    body: formData,
  });
  const body = await readJsonSafe(res);
  if (!res.ok) {
    throw new Error(body.message || `Upload failed (${res.status}).`);
  }
  const { objectKey, contentType } = body;
  if (!objectKey) throw new Error('Upload response missing object key.');
  return { objectKey: String(objectKey), contentType };
}

export async function presignSoftwareSubR2Get(objectKey) {
  const key = String(objectKey || '').trim().replace(/^\/+/, '');
  if (!key.startsWith('software-subscriptions/')) {
    throw new Error('This invoice file is not stored in cloud file storage.');
  }

  const res = await softwareSubR2Fetch('/presign-get', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ objectKey: key }),
  });
  const body = await readJsonSafe(res);
  if (!res.ok) {
    throw new Error(body.message || `Download link failed (${res.status}).`);
  }
  if (!body.getUrl) throw new Error('Download link was not returned.');
  return body.getUrl;
}

export async function deleteSoftwareSubR2Object(objectKey) {
  const key = String(objectKey || '').trim().replace(/^\/+/, '');
  const res = await softwareSubR2Fetch('/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ objectKey: key }),
  });
  const body = await readJsonSafe(res);
  if (!res.ok) throw new Error(body.message || `Delete failed (${res.status}).`);
  return true;
}

/** Infer storage backend from explicit field or object key shape. */
export function resolveSoftwareSubAttachmentStorage(attachment) {
  const path = String(attachment?.path || '').trim().replace(/^\/+/, '');
  // Prefer key shape — wrong storage flags were causing R2 calls for Supabase files.
  if (path.startsWith('software-subscriptions/')) return 'r2';
  const explicit = String(attachment?.storage || '').toLowerCase();
  if (explicit === 'supabase') return 'supabase';
  if (explicit === 'r2') return 'r2';
  return 'supabase';
}
