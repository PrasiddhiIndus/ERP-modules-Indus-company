import { apiUrl, humanizeApiErrorMessage } from './apiBase';

const MAX_BYTES = 25 * 1024 * 1024;
/** JSON/base64 path stays under express.json 35mb limit (base64 ≈ +33%). */
const JSON_FALLBACK_MAX_BYTES = 18 * 1024 * 1024;

const MIME_EXT = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};

function fileExt(name) {
  const m = String(name || '')
    .toLowerCase()
    .match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}

/** Mobile camera / cloud picks often omit an extension — recover from MIME type. */
export function normalizePortalFileName(file) {
  const raw = String(file?.name || '').trim() || 'upload';
  if (fileExt(raw)) return raw.slice(0, 120);
  const ext = MIME_EXT[String(file?.type || '').toLowerCase()];
  if (!ext) return raw.slice(0, 120);
  return `${raw.replace(/\.+$/, '')}.${ext}`.slice(0, 120);
}

export async function assertPortalFileReadable(file) {
  if (!file) throw new Error('Choose a file to upload.');
  if (!Number.isFinite(file.size) || file.size <= 0) {
    throw new Error('That file looks empty. Please choose another file.');
  }
  if (file.size > MAX_BYTES) {
    throw new Error('This file is too large. Please upload a smaller file (under 25 MB).');
  }
  try {
    // Fail early when Android/iOS returns a cloud placeholder that cannot be read.
    await file.slice(0, Math.min(64, file.size)).arrayBuffer();
  } catch {
    throw new Error('Could not read that file. Save it to your phone, then upload again.');
  }
}

function isNetworkFailure(err) {
  const msg = String(err?.message || err || '');
  return /Could not reach the company API|Could not reach the server|timed out|Failed to fetch|NetworkError|Load failed|ECONNREFUSED|ECONNRESET|socket hang up|AbortError/i.test(
    msg
  );
}

async function parsePortalResponse(res, fallback) {
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    if (res.status === 413) {
      throw new Error('This file is too large for the server. Please upload a smaller file (under 25 MB).');
    }
    throw new Error(humanizeApiErrorMessage(body?.message || body?.error, fallback));
  }
  return body;
}

/**
 * Public token portal upload (recruitment / employee docs).
 * Tries multipart first; on network failure retries once, then JSON/base64 for smaller files.
 */
export async function portalUploadFile({ apiBasePath, token, fields = {}, file }) {
  await assertPortalFileReadable(file);
  const fileName = normalizePortalFileName(file);
  const url = apiUrl(`${apiBasePath}/${encodeURIComponent(token)}/upload`);

  const postMultipart = async () => {
    const form = new FormData();
    Object.entries(fields).forEach(([key, value]) => {
      if (value != null && value !== '') form.append(key, String(value));
    });
    form.append('fileName', fileName);
    form.append('file', file, fileName);
    let res;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 120_000);
      try {
        res = await fetch(url, { method: 'POST', body: form, signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      const aborted = err?.name === 'AbortError';
      throw new Error(
        humanizeApiErrorMessage(
          aborted ? 'API request timed out.' : err,
          'Could not reach the server. Check your connection and try again.'
        )
      );
    }
    return parsePortalResponse(res, 'Upload failed. Please try again.');
  };

  const postJsonBase64 = async () => {
    if (file.size > JSON_FALLBACK_MAX_BYTES) {
      throw new Error('Could not reach the company API server. Check your connection and try again.');
    }
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      const slice = bytes.subarray(i, i + chunk);
      let part = '';
      for (let j = 0; j < slice.length; j += 1) part += String.fromCharCode(slice[j]);
      binary += part;
    }
    const contentBase64 = btoa(binary);
    let res;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 120_000);
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...fields,
            fileName,
            contentType: file.type || undefined,
            contentBase64,
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      const aborted = err?.name === 'AbortError';
      throw new Error(
        humanizeApiErrorMessage(
          aborted ? 'API request timed out.' : err,
          'Could not reach the server. Check your connection and try again.'
        )
      );
    }
    return parsePortalResponse(res, 'Upload failed. Please try again.');
  };

  try {
    return await postMultipart();
  } catch (first) {
    if (!isNetworkFailure(first)) throw first;
    try {
      return await postMultipart();
    } catch (second) {
      if (!isNetworkFailure(second) || file.size > JSON_FALLBACK_MAX_BYTES) throw second;
      return postJsonBase64();
    }
  }
}
