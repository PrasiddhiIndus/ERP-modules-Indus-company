import { createClient } from '@supabase/supabase-js';

const PROFILE_SELECT =
  'id, email, username, employee_code, team, role, allowed_modules, created_at';

const LOG_PREFIX = '[admin/update-profile]';

function logStep(step, detail = undefined) {
  if (detail !== undefined) {
    console.error(LOG_PREFIX, step, detail);
  } else {
    console.error(LOG_PREFIX, step);
  }
}

function isMissingEmployeeCodeError(error) {
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('employee_code') && (msg.includes('does not exist') || msg.includes('42703'));
}

function isStackDepthError(error) {
  return String(error?.message || '').toLowerCase().includes('stack depth');
}

function isDuplicateEmployeeCodeError(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return (
    String(error?.code || '') === '23505' ||
    msg.includes('already assigned') ||
    msg.includes('duplicate key') ||
    msg.includes('idx_profiles_employee_code')
  );
}

function isRpcMissingError(error, fnName) {
  if (!error) return false;
  const msg = String(error.message || error);
  return msg.includes(fnName) || String(error.code || '') === 'PGRST202';
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

function parseRpcProfile(data) {
  if (!data) return null;
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      return parsed?.id ? parsed : null;
    } catch {
      return null;
    }
  }
  if (typeof data === 'object' && data.id) return data;
  return null;
}

function createServiceDb(supabaseUrl, serviceRoleKey) {
  const base = String(supabaseUrl).replace(/\/+$/, '');
  return {
    base,
    key: serviceRoleKey,
    client: createClient(base, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
        },
      },
    }),
  };
}

function serviceRestHeaders(db) {
  return {
    apikey: db.key,
    Authorization: `Bearer ${db.key}`,
  };
}

/** PostgREST PATCH with service_role only — never pass user JWT here. */
async function patchProfileViaRest(db, id, patch) {
  const res = await fetch(`${db.base}/rest/v1/profiles?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      ...serviceRestHeaders(db),
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(patch),
  });
  const text = await res.text();
  let rows = [];
  if (text) {
    try {
      rows = JSON.parse(text);
    } catch {
      return { data: null, error: { message: text || `HTTP ${res.status}`, status: res.status } };
    }
  }
  if (!res.ok) {
    const msg = rows?.message || rows?.error || rows?.hint || text || `HTTP ${res.status}`;
    logStep('REST PATCH failed', { id, status: res.status, message: msg });
    return {
      data: null,
      error: { message: String(msg), status: res.status, code: rows?.code },
    };
  }
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (row?.id) return { data: row, error: null };
  logStep('REST PATCH returned 0 rows', { id, patchKeys: Object.keys(patch) });
  return readProfileViaRest(db, id);
}

async function readProfileViaRest(db, id, selectCols = PROFILE_SELECT) {
  const res = await fetch(
    `${db.base}/rest/v1/profiles?id=eq.${encodeURIComponent(id)}&select=${encodeURIComponent(selectCols)}`,
    { headers: serviceRestHeaders(db) }
  );
  const text = await res.text();
  if (!res.ok) {
    let msg = text || `HTTP ${res.status}`;
    try {
      const body = JSON.parse(text);
      msg = body?.message || body?.error || msg;
    } catch {
      /* use raw text */
    }
    return { data: null, error: { message: String(msg), status: res.status } };
  }
  const rows = text ? JSON.parse(text) : [];
  const row = Array.isArray(rows) ? rows[0] : rows;
  return { data: row?.id ? row : null, error: null };
}

async function saveProfileViaRpc(db, { id, team, role, allowed, employeeCode, setEmployeeCode }) {
  const { data, error } = await db.client.rpc('admin_save_profile', {
    p_id: id,
    p_team: team,
    p_role: role,
    p_allowed_modules: allowed,
    p_employee_code: employeeCode ?? null,
    p_set_employee_code: setEmployeeCode,
  });
  if (error) {
    logStep('RPC admin_save_profile error', {
      id,
      code: error.code,
      message: error.message,
      details: error.details,
    });
    return { profile: null, error };
  }
  const profile = parseRpcProfile(data);
  if (profile) return { profile, error: null };
  logStep('RPC admin_save_profile returned null/empty', { id, dataType: typeof data });
  return { profile: null, error: { message: 'Profile row not found after RPC save (id may not exist).' } };
}

function userFromAuthBody(body) {
  if (!body || typeof body !== 'object') return null;
  if (body.id) return body;
  if (body.user?.id) return body.user;
  return null;
}

export async function resolveAuthUser(jwt, supabaseUrl, serviceRoleKey, anonKey) {
  const token = String(jwt || '').trim();
  if (!token) return null;

  const base = String(supabaseUrl).replace(/\/+$/, '');
  const apiKey = anonKey || serviceRoleKey;

  if (anonKey) {
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: d1, error: e1 } = await userClient.auth.getUser();
    if (!e1 && d1?.user) return d1.user;
  }

  try {
    const res = await fetch(`${base}/auth/v1/user`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: apiKey,
      },
    });
    if (res.ok) {
      const body = await res.json();
      const user = userFromAuthBody(body);
      if (user?.id) return user;
    }
  } catch {
    /* try service-role getUser next */
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data, error } = await admin.auth.getUser(token);
  if (!error && data?.user) return data.user;

  return null;
}

function normalizeEmployeeCode(raw) {
  const s = String(raw ?? '').trim();
  return s || null;
}

async function readCallerRole(db, callerId) {
  const { data: row, error } = await readProfileViaRest(db, callerId, 'role');
  if (!error && row?.role) return String(row.role).trim();

  const { data: rpcRole, error: rpcErr } = await db.client.rpc('get_profile_role', {
    p_id: callerId,
  });
  if (!rpcErr && typeof rpcRole === 'string' && rpcRole.trim()) {
    return rpcRole.trim();
  }

  if (error) {
    logStep('caller role REST failed', { callerId, message: error.message });
    if (!isStackDepthError(error)) throw error;
  }
  if (rpcErr) {
    logStep('caller role RPC failed', { callerId, message: rpcErr.message });
    if (!isRpcMissingError(rpcErr, 'get_profile_role') && !isStackDepthError(rpcErr)) {
      throw rpcErr;
    }
  }
  return '';
}

function throwSaveError(error, step) {
  logStep('save failed', { step, message: error?.message, code: error?.code });
  const err = new Error(error?.message || 'Failed to update profile');
  if (isDuplicateEmployeeCodeError(error)) err.status = 409;
  else if (isStackDepthError(error)) {
    err.message =
      'profiles RLS recursion (stack depth). Run supabase/scripts/fix_profiles_save.sql in Supabase SQL Editor, then retry.';
    err.status = 500;
    err.hint =
      'Run fix_profiles_save.sql then fix_profiles_employee_code_sync.sql in SQL Editor (profiles + employee_code sync triggers).';
    err.version = 'server-api-5';
  } else {
    err.status = Number(error?.status) >= 400 ? Number(error.status) : 500;
  }
  throw err;
}

export async function adminUpdateProfile(body, jwt, supabaseUrl, serviceRoleKey, anonKey) {
  if (!isServiceRoleKey(serviceRoleKey)) {
    const err = new Error(
      'Server SUPABASE_SERVICE_ROLE_KEY is missing or not a service_role key. Fix .env.server and restart npm run dev.',
    );
    err.status = 500;
    throw err;
  }

  const caller = await resolveAuthUser(jwt, supabaseUrl, serviceRoleKey, anonKey);
  if (!caller?.id) {
    const err = new Error('Invalid token');
    err.status = 401;
    throw err;
  }

  const db = createServiceDb(supabaseUrl, serviceRoleKey);
  logStep('start', {
    targetId: body?.id,
    callerId: caller.id,
    supabaseHost: db.base,
    serviceRole: true,
  });

  let callerRole = '';
  try {
    callerRole = await readCallerRole(db, caller.id);
  } catch (roleErr) {
    const err = new Error(`Could not verify caller role: ${roleErr.message}`);
    err.status = 500;
    throw err;
  }
  if (callerRole !== 'super_admin' && callerRole !== 'super_admin_pro') {
    const err = new Error('Only Super Admin can update users');
    err.status = 403;
    throw err;
  }

  const id = String(body?.id || '').trim();
  if (!id) {
    const err = new Error('id is required');
    err.status = 400;
    throw err;
  }

  const team = body.team === '' ? null : (body.team ?? null);
  const role = body.role ?? null;
  const allowed = Array.isArray(body.allowed_modules) ? body.allowed_modules : [];
  const setUsername = body.username !== undefined;
  const username = setUsername ? normalizeEmployeeCode(body.username) : undefined;
  const setEmployeeCode =
    body.employee_code !== undefined || body.emp_code !== undefined;
  const employeeCode = setEmployeeCode
    ? normalizeEmployeeCode(
        body.employee_code !== undefined ? body.employee_code : body.emp_code
      )
    : undefined;

  const patch = { team, role, allowed_modules: allowed };
  if (setEmployeeCode) patch.employee_code = employeeCode;

  let profile = null;
  let saveErr = null;

  logStep('save via RPC', { id, setEmployeeCode, employeeCode: employeeCode ?? null });
  const rpcSave = await saveProfileViaRpc(db, {
    id,
    team,
    role,
    allowed,
    employeeCode,
    setEmployeeCode,
  });
  if (rpcSave.profile?.id) {
    profile = rpcSave.profile;
    logStep('RPC save ok', { id });
  } else if (rpcSave.error && !isRpcMissingError(rpcSave.error, 'admin_save_profile')) {
    saveErr = rpcSave.error;
  }

  if (!profile?.id && (!saveErr || isStackDepthError(saveErr) || isMissingEmployeeCodeError(saveErr))) {
    logStep('save via REST fallback', { id, reason: saveErr?.message || 'rpc-null' });
    let { data, error } = await patchProfileViaRest(db, id, patch);
    if (error && isMissingEmployeeCodeError(error) && patch.employee_code !== undefined) {
      const patchNoCode = { ...patch };
      delete patchNoCode.employee_code;
      ;({ data, error } = await patchProfileViaRest(db, id, patchNoCode));
    }
    if (!error && data?.id) {
      profile = data;
      saveErr = null;
      logStep('REST save ok', { id });
    } else if (error) {
      saveErr = error;
    }
  }

  if (profile?.id) {
    if (setUsername) {
      const { data: patched, error: userPatchErr } = await patchProfileViaRest(db, id, {
        username: username ?? null,
      });
      if (patched?.id) {
        profile = patched;
      } else if (userPatchErr) {
        logStep('username patch failed', { id, message: userPatchErr.message });
        const err = new Error(userPatchErr.message || 'Could not save username.');
        err.status = userPatchErr.status || 500;
        throw err;
      }
    }

    try {
      const { error: metaErr } = await db.client.auth.admin.updateUserById(id, {
        user_metadata: {
          team,
          role,
          allowed_modules: allowed,
          module_access_pending: false,
          ...(setEmployeeCode ? { employee_code: employeeCode } : {}),
          ...(setUsername ? { username: username ?? null, full_name: username ?? null } : {}),
        },
      });
      if (metaErr) {
        logStep('auth metadata sync failed (non-fatal)', { id, message: metaErr.message });
      }
    } catch (metaErr) {
      logStep('auth metadata sync threw (non-fatal)', { id, message: metaErr?.message });
    }
    return { ok: true, profile, version: 'server-api-5' };
  }

  if (saveErr) throwSaveError(saveErr, 'profiles-save');

  const err = new Error(`No profiles row for user ${id}. Nothing was saved.`);
  err.status = 404;
  throw err;
}
