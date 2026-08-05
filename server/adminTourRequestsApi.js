import { createClient } from '@supabase/supabase-js';

const TOUR_FETCH_CAP = 2000;
const INDUS_ONE = 'indus_one';

/**
 * Fetch all tour rows for the ERP tour inbox (bypasses RLS via service_role).
 * Returns both LMS tour_requests and admin_tour_requests for client-side merge.
 */
export async function fetchAllTourInboxTables({ getSupabaseUrl, getServiceKey }) {
  const url = typeof getSupabaseUrl === 'function' ? getSupabaseUrl() : getSupabaseUrl;
  const key = typeof getServiceKey === 'function' ? getServiceKey() : getServiceKey;
  if (!url || !key) {
    const err = new Error(
      'Server missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (.env.server). Cannot load all tour requests.'
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
      .from('tour_requests')
      .select('*')
      .order('submitted_at', { ascending: false })
      .range(0, TOUR_FETCH_CAP - 1),
    client
      .schema(INDUS_ONE)
      .from('admin_tour_requests')
      .select('*')
      .order('submitted_at', { ascending: false })
      .range(0, TOUR_FETCH_CAP - 1),
  ]);

  const lmsRows = lmsRes.error ? [] : lmsRes.data || [];
  const adminRows = adminRes.error ? [] : adminRes.data || [];

  if (lmsRes.error) {
    // eslint-disable-next-line no-console
    console.warn(
      '[tour-requests] tour_requests unavailable (using admin_tour_requests if present):',
      lmsRes.error.message
    );
  }
  if (adminRes.error) {
    // eslint-disable-next-line no-console
    console.warn(
      '[tour-requests] admin_tour_requests unavailable (using tour_requests if present):',
      adminRes.error.message
    );
  }

  if (lmsRes.error && adminRes.error) {
    const err = new Error(
      lmsRes.error.message ||
        adminRes.error.message ||
        'Failed to load tour requests. Grant SELECT on indus_one.tour_requests and indus_one.admin_tour_requests to service_role.'
    );
    err.status = 502;
    err.details = { lms: lmsRes.error, admin: adminRes.error };
    throw err;
  }

  return {
    lmsRows,
    adminRows,
    warnings: {
      tour_requests: lmsRes.error?.message || null,
      admin_tour_requests: adminRes.error?.message || null,
    },
  };
}
