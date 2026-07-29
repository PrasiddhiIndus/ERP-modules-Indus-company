import { createClient } from '@supabase/supabase-js';

const LEAVE_FETCH_CAP = 2000;
const INDUS_ONE = 'indus_one';

/**
 * Fetch all leave rows for the ERP leave inbox (bypasses RLS via service_role).
 * Returns both LMS leave_requests and admin_leave_requests for client-side merge.
 *
 * Table GRANT to service_role is required (see migration 20260729100000).
 * If leave_requests is missing grants, admin_leave_requests alone is still returned.
 */
export async function fetchAllLeaveInboxTables({ getSupabaseUrl, getServiceKey }) {
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
    client
      .schema(INDUS_ONE)
      .from('leave_requests')
      .select('*')
      .order('submitted_at', { ascending: false })
      .range(0, LEAVE_FETCH_CAP - 1),
    client
      .schema(INDUS_ONE)
      .from('admin_leave_requests')
      .select('*')
      .order('submitted_at', { ascending: false })
      .range(0, LEAVE_FETCH_CAP - 1),
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
