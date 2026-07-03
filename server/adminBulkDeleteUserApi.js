import { createClient } from '@supabase/supabase-js';
import { resolveAuthUser } from './adminProfileApi.js';

const API_VERSION = 'server-bulk-delete-1';
export const BULK_USER_MAX_BATCH = 100;

const ALLOWED_DELETER_ROLES = new Set(['admin', 'super_admin', 'super_admin_pro']);
const PROTECTED_TARGET_ROLES = new Set(['super_admin', 'super_admin_pro']);

function normalizeEmail(raw) {
  return String(raw ?? '').trim().toLowerCase();
}

function normalizeEmployeeCode(raw) {
  const s = String(raw ?? '').trim();
  return s || null;
}

function createServiceDb(supabaseUrl, serviceRoleKey) {
  return {
    client: createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  };
}

async function readCallerRole(db, callerId) {
  const { data } = await db.client.from('profiles').select('role').eq('id', callerId).maybeSingle();
  return String(data?.role ?? '').trim();
}

async function resolveProfile(db, row) {
  const email = normalizeEmail(row?.email);
  const employeeCode = normalizeEmployeeCode(row?.employee_code);

  if (!email && !employeeCode) {
    return { profile: null, error: 'email or employee_code is required' };
  }

  if (email) {
    const { data, error } = await db.client
      .from('profiles')
      .select('id, email, employee_code, role, username')
      .ilike('email', email)
      .maybeSingle();
    if (error) return { profile: null, error: error.message };
    if (data?.id) return { profile: data, error: null };
  }

  if (employeeCode) {
    const { data, error } = await db.client
      .from('profiles')
      .select('id, email, employee_code, role, username')
      .ilike('employee_code', employeeCode)
      .maybeSingle();
    if (error) return { profile: null, error: error.message };
    if (data?.id) return { profile: data, error: null };
  }

  return { profile: null, error: 'User not found' };
}

async function deleteProfileRecords(db, id) {
  try {
    await db.client.from('profiles').delete().eq('id', id);
  } catch {
    /* ignore */
  }
  try {
    await db.client.from('app_users').delete().eq('id', id);
  } catch {
    /* ignore */
  }
}

export async function adminBulkDeleteUsers(body, jwt, supabaseUrl, serviceRoleKey, anonKey) {
  const users = Array.isArray(body?.users) ? body.users : [];
  const dryRun = body?.dry_run === true;

  if (!users.length) {
    const err = new Error('users array is required');
    err.status = 400;
    err.version = API_VERSION;
    throw err;
  }
  if (users.length > BULK_USER_MAX_BATCH) {
    const err = new Error(`Maximum ${BULK_USER_MAX_BATCH} users per batch.`);
    err.status = 400;
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

  const db = createServiceDb(supabaseUrl, serviceRoleKey);
  const callerRole = await readCallerRole(db, caller.id);
  if (!ALLOWED_DELETER_ROLES.has(callerRole)) {
    const err = new Error('Only Admin or Super Admin can delete users');
    err.status = 403;
    err.version = API_VERSION;
    throw err;
  }

  const results = [];
  let deleted = 0;
  let failed = 0;

  for (let i = 0; i < users.length; i++) {
    const rowNum = Number(users[i]?.row) > 0 ? Number(users[i].row) : i + 2;
    const { profile, error: resolveErr } = await resolveProfile(db, users[i]);

    if (!profile?.id) {
      failed += 1;
      results.push({
        row: rowNum,
        ok: false,
        email: normalizeEmail(users[i]?.email) || undefined,
        employee_code: normalizeEmployeeCode(users[i]?.employee_code) || undefined,
        error: resolveErr || 'User not found',
      });
      continue;
    }

    if (profile.id === caller.id) {
      failed += 1;
      results.push({
        row: rowNum,
        ok: false,
        email: profile.email,
        employee_code: profile.employee_code,
        error: 'You cannot delete your own account.',
      });
      continue;
    }

    const targetRole = String(profile.role ?? '').trim();
    if (callerRole === 'admin' && PROTECTED_TARGET_ROLES.has(targetRole)) {
      failed += 1;
      results.push({
        row: rowNum,
        ok: false,
        email: profile.email,
        employee_code: profile.employee_code,
        error: 'Only Super Admin can delete Super Admin users',
      });
      continue;
    }

    if (dryRun) {
      deleted += 1;
      results.push({
        row: rowNum,
        ok: true,
        preview: true,
        user_id: profile.id,
        email: profile.email,
        employee_code: profile.employee_code,
        username: profile.username,
        role: profile.role,
      });
      continue;
    }

    const { error: delAuthErr } = await db.client.auth.admin.deleteUser(profile.id);
    if (delAuthErr) {
      failed += 1;
      results.push({
        row: rowNum,
        ok: false,
        email: profile.email,
        employee_code: profile.employee_code,
        error: delAuthErr.message || 'Could not delete auth user',
      });
      continue;
    }

    await deleteProfileRecords(db, profile.id);
    deleted += 1;
    results.push({
      row: rowNum,
      ok: true,
      user_id: profile.id,
      email: profile.email,
      employee_code: profile.employee_code,
    });
  }

  return {
    ok: true,
    version: API_VERSION,
    dry_run: dryRun,
    results,
    summary: {
      total: users.length,
      deleted: dryRun ? 0 : deleted,
      preview: dryRun ? deleted : 0,
      failed,
    },
  };
}
