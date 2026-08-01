import { supabase } from './supabase';
import { apiUrl } from './apiBase';
import { getAdminApiAccessToken } from './userManagementAuthToken';

function softwareSubR2Url(subpath) {
  const sub = subpath.startsWith('/') ? subpath : `/${subpath}`;
  return apiUrl(`/api/software-subscriptions/r2${sub}`);
}

/** Bearer fetch to software-subscription R2 routes; refreshes JWT on 401. */
async function softwareSubR2Fetch(subpath, init = {}) {
  let token = await getAdminApiAccessToken(supabase);
  if (!token) {
    throw new Error('You must be signed in to manage invoice attachments.');
  }

  const doFetch = (accessToken) =>
    fetch(softwareSubR2Url(subpath), {
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
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.message || `Upload failed (${res.status}).`);
  }
  const { objectKey, contentType } = body;
  if (!objectKey) throw new Error('Upload response missing object key.');
  return { objectKey: String(objectKey), contentType };
}

export async function presignSoftwareSubR2Get(objectKey) {
  const res = await softwareSubR2Fetch('/presign-get', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ objectKey }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || `Download link failed (${res.status}).`);
  if (!body.getUrl) throw new Error('Download link was not returned.');
  return body.getUrl;
}

export async function deleteSoftwareSubR2Object(objectKey) {
  const res = await softwareSubR2Fetch('/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ objectKey }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || `Delete failed (${res.status}).`);
  return true;
}

/** Infer storage backend from explicit field or object key shape. */
export function resolveSoftwareSubAttachmentStorage(attachment) {
  const explicit = String(attachment?.storage || '').toLowerCase();
  if (explicit === 'r2' || explicit === 'supabase') return explicit;
  const path = String(attachment?.path || '').trim();
  if (path.startsWith('software-subscriptions/')) return 'r2';
  return 'supabase';
}
