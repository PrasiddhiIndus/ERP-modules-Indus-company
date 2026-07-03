import { invokeAuthenticatedFunction, parseEdgeFunctionError } from './supabase';
import { getAdminApiAccessToken } from './userManagementAuthToken';
import { createUserAccount } from './userManagementCreateApi';

const BULK_FETCH_TIMEOUT_MS = 120000;

function isNetworkUnreachable(error, status) {
  if (status === 404 || status === 0) return true;
  const msg = String(error?.message || '');
  return (
    msg.includes('Failed to fetch') ||
    msg.includes('ECONNRESET') ||
    msg.includes('NetworkError') ||
    msg.includes('Load failed') ||
    msg.includes('timed out') ||
    msg.includes('abort')
  );
}

async function callLocal(path, token, body) {
  try {
    const signal =
      typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(BULK_FETCH_TIMEOUT_MS)
        : undefined;
    const res = await fetch(path, {
      method: 'POST',
      signal,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return { data, error: null, status: res.status };
    return {
      data,
      status: res.status,
      error: { message: data?.error || `Request failed (${res.status})`, status: res.status },
    };
  } catch (err) {
    return {
      data: null,
      status: 0,
      error: { message: err?.message || String(err), status: 0 },
    };
  }
}

async function callBulkApi(supabase, { edgeName, localPath, body }) {
  const token = await getAdminApiAccessToken(supabase);
  if (!token) {
    return { ok: false, message: 'Not signed in. Sign in again and retry.' };
  }

  async function callEdge() {
    const edge = await invokeAuthenticatedFunction(
      edgeName,
      { body, timeoutMs: BULK_FETCH_TIMEOUT_MS },
      token
    );
    const status = edge.error?.context?.status ?? (edge.data?.ok === false ? 500 : 0);
    return { ...edge, status };
  }

  async function finishFromEdge(edge) {
    if (!edge.error && edge.data?.ok === true) {
      return { ok: true, data: edge.data };
    }
    const message = await parseEdgeFunctionError(edge.error, edge.data);
    return { ok: false, message };
  }

  async function finishFromLocal(local) {
    const { data, error } = local;
    if (!error) {
      if (data?.ok === true) return { ok: true, data };
      return { ok: false, message: data?.error || 'Request failed.' };
    }
    return { ok: false, message: error.message || 'Request failed.' };
  }

  const preferEdge = import.meta.env.PROD;

  // Dev: local Node API first (same as single-user create). Prod: edge, then local fallback.
  if (!preferEdge) {
    const local = await callLocal(localPath, token, body);
    if (!local.error && local.data?.ok === true) return finishFromLocal(local);
    const localStatus = local.status ?? local.error?.status ?? 0;
    if (!isNetworkUnreachable(local.error, localStatus) && localStatus < 500) {
      return finishFromLocal(local);
    }
    const edge = await callEdge();
    if (!edge.error && edge.data?.ok === true) return finishFromEdge(edge);
    return finishFromLocal(local);
  }

  if (preferEdge) {
    const edge = await callEdge();
    if (!edge.error && edge.data?.ok === true) return finishFromEdge(edge);
    const edgeStatus = edge.status || edge.error?.context?.status || 0;
    if (!isNetworkUnreachable(edge.error, edgeStatus)) return finishFromEdge(edge);
    return finishFromLocal(await callLocal(localPath, token, body));
  }

  return finishFromLocal(await callLocal(localPath, token, body));
}

/**
 * Import users one-by-one via admin-create-user (most reliable in dev; avoids bulk edge deploy).
 */
export async function bulkCreateUsersSequential(supabase, users, { onProgress } = {}) {
  const results = [];
  let created = 0;
  let failed = 0;

  for (let i = 0; i < users.length; i++) {
    const row = users[i];
    onProgress?.(i + 1, users.length);

    const payload = {
      email: row.email,
      password: row.password,
      username: row.username,
      employee_code: row.employee_code,
      team: row.team,
      role: row.role,
      allowed_modules: row.allowed_modules ?? [],
      ...(row.no_module_access ? { no_module_access: true } : {}),
    };

    const outcome = await createUserAccount(supabase, payload);
    if (outcome.ok) {
      created += 1;
      results.push({
        row: row.row ?? i + 2,
        ok: true,
        email: row.email,
        user_id: outcome.data?.user_id,
      });
    } else {
      failed += 1;
      results.push({
        row: row.row ?? i + 2,
        ok: false,
        email: row.email,
        error: outcome.message || 'Could not create user',
      });
    }
  }

  return {
    ok: true,
    data: {
      ok: true,
      results,
      summary: { total: users.length, created, failed },
    },
  };
}

/** @param {import('@supabase/supabase-js').SupabaseClient} supabase */
export async function bulkCreateUsers(supabase, users, options = {}) {
  if (options.sequential) {
    return bulkCreateUsersSequential(supabase, users, options);
  }
  return callBulkApi(supabase, {
    edgeName: 'admin-bulk-create-users',
    localPath: '/api/admin/bulk-create-users',
    body: { users },
  });
}

/** @param {import('@supabase/supabase-js').SupabaseClient} supabase */
export async function bulkDeleteUsers(supabase, users, { dryRun = false } = {}) {
  return callBulkApi(supabase, {
    edgeName: 'admin-bulk-delete-users',
    localPath: '/api/admin/bulk-delete-users',
    body: { users, dry_run: dryRun },
  });
}
