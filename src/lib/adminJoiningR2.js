import { supabase } from './supabase';
import { apiUrl } from './apiBase';
import { getAdminApiAccessToken } from './userManagementAuthToken';

const PREFIX = 'admin-joining/';

function joiningR2Url(subpath) {
  const sub = subpath.startsWith('/') ? subpath : `/${subpath}`;
  return apiUrl(`/api/admin-joining/r2${sub}`);
}

async function joiningR2Fetch(subpath, init = {}) {
  let token = await getAdminApiAccessToken(supabase);
  if (!token) {
    throw new Error('You must be signed in to manage joining documents.');
  }

  const doFetch = (accessToken) =>
    fetch(joiningR2Url(subpath), {
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

function friendlyJoiningR2NetworkError(err) {
  const msg = String(err?.message || err || '');
  if (
    err instanceof TypeError ||
    /failed to fetch|networkerror|load failed|econnrefused/i.test(msg)
  ) {
    return [
      'Could not reach the joining-document file service.',
      import.meta.env.DEV
        ? 'Run `npm run dev` (Vite + API on port 8787) and retry.'
        : 'On the live server, confirm the Node API is running (PM2) and /api is reverse-proxied, or set VITE_API_BASE_URL and redeploy.',
    ].join(' ');
  }
  return msg || 'Could not open the joining document.';
}

export async function uploadJoiningFileToR2({ file, employeeMasterId, documentId }) {
  const formData = new FormData();
  formData.append('employeeMasterId', String(employeeMasterId || '').trim());
  formData.append('documentId', String(documentId || '').trim());
  formData.append('fileName', file.name);
  if (file.type) formData.append('contentType', file.type);
  formData.append('file', file);

  const res = await joiningR2Fetch('/upload', { method: 'POST', body: formData });
  const body = await readJsonSafe(res);
  if (!res.ok) throw new Error(body.message || `Upload failed (${res.status}).`);
  if (!body.objectKey) throw new Error('Upload response missing file location.');
  return { objectKey: String(body.objectKey), contentType: body.contentType };
}

export async function presignJoiningR2Get(objectKey, { download = false, fileName } = {}) {
  const key = String(objectKey || '').trim().replace(/^\/+/, '');
  if (!key.startsWith(PREFIX)) {
    throw new Error('This file is not stored in cloud file storage.');
  }
  let res;
  try {
    res = await joiningR2Fetch('/presign-get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        objectKey: key,
        download: Boolean(download),
        ...(fileName ? { fileName } : {}),
      }),
    });
  } catch (err) {
    throw new Error(friendlyJoiningR2NetworkError(err));
  }
  const body = await readJsonSafe(res);
  if (!res.ok) throw new Error(body.message || `Download link failed (${res.status}).`);
  if (!body.getUrl) throw new Error('Download link was not returned.');
  return body.getUrl;
}

export async function deleteJoiningR2Object(objectKey) {
  const key = String(objectKey || '').trim().replace(/^\/+/, '');
  if (!key.startsWith(PREFIX)) return true;
  const res = await joiningR2Fetch('/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ objectKey: key }),
  });
  const body = await readJsonSafe(res);
  if (!res.ok) throw new Error(body.message || `Delete failed (${res.status}).`);
  return true;
}
