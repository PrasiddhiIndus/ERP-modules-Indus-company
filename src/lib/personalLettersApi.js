/**
 * Personal letters (birthday / wedding anniversary greeting cards) API helpers.
 */
import { supabase } from './supabase';
import { apiUrl, fetchApiWithAuth, humanizeApiErrorMessage } from './apiBase';
import { getAdminApiAccessToken } from './userManagementAuthToken';

export const PERSONAL_LETTERS_TABLE = 'admin_personal_letters';

export function isMissingPersonalLettersTableError(err) {
  const msg = `${err?.message || ''} ${err?.details || ''} ${err?.code || ''}`;
  return /schema cache|does not exist|could not find the table|42p01|pgrst205/i.test(msg);
}

export function friendlyPersonalLettersError(err, fallback) {
  if (isMissingPersonalLettersTableError(err)) {
    return 'Personal Letters is not available yet. Ask IT to apply the latest database update.';
  }
  return humanizeApiErrorMessage(err, fallback || 'Something went wrong.');
}

export function personalLetterKindLabel(kind) {
  if (kind === 'anniversary') return 'Wedding anniversary';
  if (kind === 'birthday') return 'Birthday';
  return kind || 'Personal letter';
}

export async function fetchPersonalLetters({ employeeMasterId, fromDate, toDate, kind } = {}) {
  let q = supabase
    .from(PERSONAL_LETTERS_TABLE)
    .select(
      'id, employee_master_id, letter_kind, occasion_date, subject, employee_full_name, template_file, object_key, file_name, content_type, file_size, created_at'
    )
    .order('occasion_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (employeeMasterId) q = q.eq('employee_master_id', employeeMasterId);
  if (fromDate) q = q.gte('occasion_date', fromDate);
  if (toDate) q = q.lte('occasion_date', toDate);
  if (kind === 'birthday' || kind === 'anniversary') q = q.eq('letter_kind', kind);

  const { data, error } = await q.limit(500);
  if (error) throw error;
  return data || [];
}

export async function fetchPersonalLettersForEmployees(employeeIds = []) {
  const ids = [...new Set((employeeIds || []).filter(Boolean))];
  if (!ids.length) return [];
  const all = [];
  for (let i = 0; i < ids.length; i += 200) {
    const batch = ids.slice(i, i + 200);
    const { data, error } = await supabase
      .from(PERSONAL_LETTERS_TABLE)
      .select(
        'id, employee_master_id, letter_kind, occasion_date, subject, employee_full_name, file_name, created_at'
      )
      .in('employee_master_id', batch)
      .order('occasion_date', { ascending: false });
    if (error) throw error;
    all.push(...(data || []));
  }
  return all;
}

export async function runPersonalLettersGeneration() {
  const result = await fetchApiWithAuth('/api/admin/personal-letters/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
    timeoutMs: 180_000,
  });
  if (!result.ok) {
    throw new Error(result.error || result.data?.message || 'Could not generate personal letters.');
  }
  return result.data || {};
}

/**
 * Fetch greeting-card JPEG as a blob URL (same-origin /api — works on indus-erp.in).
 * Never follows cross-origin R2 redirects in the browser.
 */
export async function fetchPersonalLetterImageBlobUrl(letterId, { download = false, signal } = {}) {
  const id = String(letterId || '').trim();
  if (!id) throw new Error('Letter id is required.');
  const qs = download ? '?download=1' : '';
  let token = await getAdminApiAccessToken(supabase);
  if (!token) throw new Error('You must be signed in to open greeting cards.');

  const doFetch = (accessToken) =>
    fetch(apiUrl(`/api/admin/personal-letters/${encodeURIComponent(id)}/image${qs}`), {
      cache: 'no-store',
      redirect: 'error',
      signal,
      headers: { Authorization: `Bearer ${accessToken}` },
    });

  let res;
  try {
    res = await doFetch(token);
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new Error(
      humanizeApiErrorMessage(
        err,
        'Could not reach the greeting-card service. On the live site, confirm /api is proxied to the Node API.'
      )
    );
  }

  if (res.status === 401) {
    const refreshed = await getAdminApiAccessToken(supabase, { forceRefresh: true });
    if (refreshed && refreshed !== token) {
      try {
        res = await doFetch(refreshed);
      } catch (err) {
        if (err?.name === 'AbortError') throw err;
        throw new Error(humanizeApiErrorMessage(err, 'Could not open the greeting card.'));
      }
    }
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let message = `Could not open greeting card (${res.status}).`;
    try {
      const body = text ? JSON.parse(text) : {};
      if (body.message) message = body.message;
    } catch {
      if (text && !/<html/i.test(text)) message = text.slice(0, 180);
    }
    throw new Error(humanizeApiErrorMessage(message, message));
  }

  const contentType = String(res.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('application/json') || contentType.includes('text/html')) {
    const text = await res.text().catch(() => '');
    let message = 'Greeting card response was not an image.';
    try {
      const body = text ? JSON.parse(text) : {};
      if (body.message) message = body.message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }

  const blob = await res.blob();
  if (!blob || blob.size < 32) {
    throw new Error('Greeting card image was empty.');
  }
  return URL.createObjectURL(blob);
}
