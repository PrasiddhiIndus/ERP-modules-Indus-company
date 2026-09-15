import { supabase } from './supabase';
import { apiUrl } from './apiBase';
import { getAdminApiAccessToken } from './userManagementAuthToken';

const PREFIX = 'admin-policies/';

function adminPolicyR2Url(subpath) {
  const sub = subpath.startsWith('/') ? subpath : `/${subpath}`;
  return apiUrl(`/api/admin-policies/r2${sub}`);
}

async function adminPolicyR2Fetch(subpath, init = {}) {
  let token = await getAdminApiAccessToken(supabase);
  if (!token) {
    throw new Error('You must be signed in to manage policy files.');
  }

  const doFetch = (accessToken) =>
    fetch(adminPolicyR2Url(subpath), {
      ...init,
      cache: 'no-store',
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

async function readJsonSafe(res) {
  const text = await res.text().catch(() => '');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 180) };
  }
}

export async function uploadAdminPolicyFileToR2({ file, documentId }) {
  const formData = new FormData();
  formData.append('documentId', String(documentId || '').trim());
  formData.append('fileName', file.name);
  if (file.type) formData.append('contentType', file.type);
  formData.append('file', file);

  const res = await adminPolicyR2Fetch('/upload', {
    method: 'POST',
    body: formData,
  });
  const body = await readJsonSafe(res);
  if (!res.ok) {
    throw new Error(body.message || `Upload failed (${res.status}).`);
  }
  const { objectKey, contentType } = body;
  if (!objectKey) throw new Error('Upload response missing file location.');
  return { objectKey: String(objectKey), contentType };
}

export async function presignAdminPolicyR2Get(objectKey, { download = false, fileName } = {}) {
  const key = String(objectKey || '').trim().replace(/^\/+/, '');
  if (!key.startsWith(PREFIX)) {
    throw new Error('This file is not stored in cloud file storage.');
  }

  const res = await adminPolicyR2Fetch('/presign-get', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      objectKey: key,
      download: Boolean(download),
      ...(fileName ? { fileName } : {}),
    }),
  });
  const body = await readJsonSafe(res);
  if (!res.ok) throw new Error(body.message || `Download link failed (${res.status}).`);
  if (!body.getUrl) throw new Error('Download link was not returned.');
  return body.getUrl;
}

export async function deleteAdminPolicyR2Object(objectKey) {
  const key = String(objectKey || '').trim().replace(/^\/+/, '');
  if (!key.startsWith(PREFIX)) return true;
  const res = await adminPolicyR2Fetch('/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ objectKey: key }),
  });
  const body = await readJsonSafe(res);
  if (!res.ok) throw new Error(body.message || `Delete failed (${res.status}).`);
  return true;
}
