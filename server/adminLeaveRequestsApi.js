import { createClient } from '@supabase/supabase-js';

const LEAVE_FETCH_CAP = 20000;
const PAGE_SIZE = 1000;
const INDUS_ONE = 'indus_one';

const PARALLEL_PAGES = 4;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function pageQuery(client, table, from, range) {
  let query = client.schema(INDUS_ONE).from(table).select('*');
  // Optional overlap window (register overlay): same rule the client applies afterwards.
  if (range) query = query.lte('from_date', range.toDate).gte('to_date', range.fromDate);
  return query.order('submitted_at', { ascending: false }).range(from, from + PAGE_SIZE - 1);
}

/**
 * Same rows and order as reading page after page; the first page is read alone, then
 * further pages are fetched a few at a time instead of strictly one after another.
 */
async function fetchAllRows(client, table, range = null) {
  const all = [];
  const first = await pageQuery(client, table, 0, range);
  if (first.error) return { data: all, error: first.error };
  const firstRows = first.data || [];
  all.push(...firstRows);
  if (firstRows.length < PAGE_SIZE) return { data: all, error: null };

  let from = PAGE_SIZE;
  while (from < LEAVE_FETCH_CAP) {
    const offsets = [];
    for (let i = 0; i < PARALLEL_PAGES && from + i * PAGE_SIZE < LEAVE_FETCH_CAP; i += 1) {
      offsets.push(from + i * PAGE_SIZE);
    }
    const results = await Promise.all(offsets.map((offset) => pageQuery(client, table, offset, range)));
    for (const { data, error } of results) {
      if (error) return { data: all, error };
      const rows = data || [];
      all.push(...rows);
      if (rows.length < PAGE_SIZE) return { data: all, error: null };
    }
    from += offsets.length * PAGE_SIZE;
  }
  return { data: all, error: null };
}

/** Accepts only a valid YYYY-MM-DD pair; anything else means "no range" (full inbox). */
export function parseLeaveOverlapRange(fromDate, toDate) {
  const f = String(fromDate || '').trim();
  const t = String(toDate || '').trim();
  if (!ISO_DATE_RE.test(f) || !ISO_DATE_RE.test(t) || f > t) return null;
  return { fromDate: f, toDate: t };
}

/**
 * Fetch all leave rows for the ERP leave inbox (bypasses RLS via service_role).
 * Returns both LMS leave_requests and admin_leave_requests for client-side merge.
 *
 * Table GRANT to service_role is required (see migration 20260729100000).
 * If leave_requests is missing grants, admin_leave_requests alone is still returned.
 */
export async function fetchAllLeaveInboxTables({ getSupabaseUrl, getServiceKey, range = null }) {
  const url = typeof getSupabaseUrl === 'function' ? getSupabaseUrl() : getSupabaseUrl;
  const key = typeof getServiceKey === 'function' ? getServiceKey() : getServiceKey;
  if (!url || !key) {
    const err = new Error(
      'Server missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (.env.server). Cannot load all leave requests.'
    );
    err.status = 503;
    throw err;
  }

  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const [lmsRes, adminRes] = await Promise.all([
    fetchAllRows(client, 'leave_requests', range),
    fetchAllRows(client, 'admin_leave_requests', range),
  ]);

  const lmsRows = lmsRes.error ? [] : lmsRes.data || [];
  const adminRows = adminRes.error ? [] : adminRes.data || [];

  if (lmsRes.error) {
    // eslint-disable-next-line no-console
    console.warn(
      '[leave-requests] leave_requests unavailable (using admin_leave_requests if present):',
      lmsRes.error.message
    );
  }
  if (adminRes.error) {
    // eslint-disable-next-line no-console
    console.warn(
      '[leave-requests] admin_leave_requests unavailable (using leave_requests if present):',
      adminRes.error.message
    );
  }

  // Only hard-fail when neither table is readable.
  if (lmsRes.error && adminRes.error) {
    const err = new Error(
      lmsRes.error.message ||
        adminRes.error.message ||
        'Failed to load leave requests. Grant SELECT on indus_one.leave_requests and indus_one.admin_leave_requests to service_role.'
    );
    err.status = 502;
    err.details = { lms: lmsRes.error, admin: adminRes.error };
    throw err;
  }

  return {
    lmsRows,
    adminRows,
    warnings: {
      leave_requests: lmsRes.error?.message || null,
      admin_leave_requests: adminRes.error?.message || null,
    },
  };
}
