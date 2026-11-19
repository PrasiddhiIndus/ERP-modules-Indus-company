import { supabase } from './supabase';
import { apiUrl, humanizeApiErrorMessage, isRawServerHtmlDump } from './apiBase';
import { getAdminApiAccessToken } from './userManagementAuthToken';

const KEY_PREFIX = 'it-support/';

function itSupportR2Url(subpath) {
  const sub = subpath.startsWith('/') ? subpath : `/${subpath}`;
  return apiUrl(`/api/it-support/r2${sub}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientHttpStatus(status) {
  return status === 0 || status === 502 || status === 503 || status === 504;
}

export function humanizeItSupportError(err, fallback = 'Unable to complete this action.') {
  return humanizeApiErrorMessage(err, fallback);
}

async function itSupportR2Fetch(subpath, init = {}) {
  let token = await getAdminApiAccessToken(supabase);
  if (!token) {
    throw new Error('You must be signed in to manage ticket attachments.');
  }

  const doFetch = (accessToken) =>
    fetch(itSupportR2Url(subpath), {
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
      if (res.status === 500 && attempt < 2) {
        const peek = await res.clone().text().catch(() => '');
        const looksLikeProxyBlip =
          !peek.trim() ||
          /ECONNRESET|ECONNREFUSED|proxy error|socket hang up/i.test(peek) ||
          isRawServerHtmlDump(peek);
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
  throw new Error(
    humanizeItSupportError(lastError, 'Unable to reach the file server. Try again.')
  );
}

async function readJsonSafe(res) {
  const text = await res.text().catch(() => '');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    if (isRawServerHtmlDump(text) || /Internal Server Error/i.test(text)) {
      // eslint-disable-next-line no-console
      console.warn('[itSupportR2] file server returned HTML instead of JSON');
    }
    return {
      message: 'Attachment could not be processed just now. Please try again in a moment.',
    };
  }
}

/**
 * @param {{ file: File, ticketId: string }} opts
 * @returns {Promise<{ objectKey: string, contentType?: string }>}
 */
export async function uploadItSupportFileToR2({ file, ticketId }) {
  const formData = new FormData();
  formData.append('ticketId', String(ticketId || '').trim());
  formData.append('fileName', file.name);
  if (file.type) formData.append('contentType', file.type);
  formData.append('file', file);

  const res = await itSupportR2Fetch('/upload', {
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

export async function presignItSupportR2Get(objectKey) {
  const key = String(objectKey || '').trim().replace(/^\/+/, '');
  if (!key.startsWith(KEY_PREFIX)) {
    throw new Error('This attachment is not stored in cloud file storage.');
  }

  const res = await itSupportR2Fetch('/presign-get', {
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

export async function deleteItSupportR2Object(objectKey) {
  const key = String(objectKey || '').trim().replace(/^\/+/, '');
  const res = await itSupportR2Fetch('/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ objectKey: key }),
  });
  const body = await readJsonSafe(res);
  if (!res.ok) throw new Error(body.message || `Delete failed (${res.status}).`);
  return true;
}
