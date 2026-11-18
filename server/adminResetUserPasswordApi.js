/**
 * Super Admin only: set a user's Auth password.
 * Updates auth.users password hash only — no profile / modules / team / emp code changes.
 */
import { createClient } from '@supabase/supabase-js';
import { resolveAuthUser } from './adminProfileApi.js';

const LOG_PREFIX = '[admin/reset-user-password]';
const API_VERSION = 'server-reset-password-1';
const MIN_PASSWORD_LENGTH = 8;
const ALLOWED_ROLES = new Set(['super_admin', 'super_admin_pro']);

function logError(step, detail) {
  // Never log password values.
  console.error(LOG_PREFIX, step, detail);
}

function isServiceRoleKey(key) {
  try {
    const parts = String(key || '').split('.');
    if (parts.length < 2) return false;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return payload?.role === 'service_role';
  } catch {
    return false;
  }
}

function createServiceClient(supabaseUrl, serviceRoleKey) {
  const base = String(supabaseUrl).replace(/\/+$/, '');
  return createClient(base, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
    },
  });
}

async function readCallerRole(client, callerId) {
  const { data: row, error } = await client
    .from('profiles')
    .select('role')
    .eq('id', callerId)
    .maybeSingle();
  if (!error && row?.role) return String(row.role).trim();

  const { data: rpcRole, error: rpcErr } = await client.rpc('get_profile_role', {
    p_id: callerId,
  });
  if (!rpcErr && typeof rpcRole === 'string' && rpcRole.trim()) return rpcRole.trim();

  if (error) logError('caller role select failed', { message: error.message });
  if (rpcErr) logError('caller role rpc failed', { message: rpcErr.message });
  return '';
}

/**
 * @param {{ userId?: string, password?: string }} body
 * @param {string} jwt caller access token
 */
export async function adminResetUserPassword(body, jwt, supabaseUrl, serviceRoleKey, anonKey) {
  if (!isServiceRoleKey(serviceRoleKey)) {
    const err = new Error(
      'Server SUPABASE_SERVICE_ROLE_KEY is missing or invalid. Fix .env.server and restart npm run dev.'
    );
    err.status = 500;
    err.version = API_VERSION;
    throw err;
  }

  const caller = await resolveAuthUser(jwt, supabaseUrl, serviceRoleKey, anonKey);
  if (!caller?.id) {
    const err = new Error('Invalid token');
    err.status = 401;
    err.version = API_VERSION;
    throw err;
  }

  const client = createServiceClient(supabaseUrl, serviceRoleKey);
  const callerRole = await readCallerRole(client, caller.id);
  if (!ALLOWED_ROLES.has(callerRole)) {
    const err = new Error('Only Super Admin can reset user passwords');
    err.status = 403;
    err.version = API_VERSION;
    throw err;
  }

  const userId = String(body?.userId || body?.id || '').trim();
  if (!userId) {
    const err = new Error('userId is required');
    err.status = 400;
    err.version = API_VERSION;
    throw err;
  }

  const password = String(body?.password ?? '');
  if (password.length < MIN_PASSWORD_LENGTH) {
    const err = new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    err.status = 400;
    err.version = API_VERSION;
    throw err;
  }

  const { data: target, error: getErr } = await client.auth.admin.getUserById(userId);
  if (getErr || !target?.user?.id) {
    logError('target user lookup failed', { userId, message: getErr?.message || 'not found' });
    const err = new Error('User not found in Authentication.');
    err.status = 404;
    err.version = API_VERSION;
    throw err;
  }

  const { error: updateErr } = await client.auth.admin.updateUserById(userId, { password });
  if (updateErr) {
    logError('updateUserById failed', { userId, message: updateErr.message });
    const err = new Error(updateErr.message || 'Could not update password.');
    err.status = 400;
    err.version = API_VERSION;
    throw err;
  }

  return {
    ok: true,
    userId,
    version: API_VERSION,
  };
}
