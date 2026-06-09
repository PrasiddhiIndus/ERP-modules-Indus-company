import { createClient } from '@supabase/supabase-js';

import { resolveAuthUser } from './adminProfileApi.js';



const LOG_PREFIX = '[admin/create-user]';

const API_VERSION = 'server-create-2';



function logError(step, detail) {

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



function isRpcMissingError(error, fnName) {

  if (!error) return false;

  const msg = String(error.message || error);

  return msg.includes(fnName) || String(error.code || '') === 'PGRST202';

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

    msg.includes('idx_profiles_employee_code') ||

    msg.includes('profiles_employee_code_unique')

  );

}



function throwCreateError(error, step) {

  logError('failed', { step, message: error?.message, code: error?.code });

  const err = new Error(error?.message || 'Could not create user');

  if (isDuplicateEmployeeCodeError(error)) err.status = 409;

  else if (isStackDepthError(error)) {

    err.message =

      'profiles RLS recursion (stack depth). Run supabase/scripts/fix_profiles_save.sql in Supabase SQL Editor, then retry.';

    err.status = 500;

    err.hint =

      'Run fix_profiles_save.sql then fix_profiles_employee_code_sync.sql in Supabase SQL Editor (employee_code triggers hit recursive RLS on employee master).';

  } else if (isRpcMissingError(error, 'admin_upsert_profile')) {

    err.message =

      'admin_upsert_profile RPC is missing. Run supabase/scripts/fix_profiles_save.sql in Supabase SQL Editor, then retry.';

    err.status = 500;

    err.hint = 'Deploy the profiles RLS migration (20260609180000_profiles_rls_definitive_fix.sql).';

  } else {

    err.status = Number(error?.status) >= 400 ? Number(error.status) : 500;

  }

  err.version = API_VERSION;

  throw err;

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



function restHeaders(key) {

  return { apikey: key, Authorization: `Bearer ${key}` };

}



function normalizeEmail(raw) {

  return String(raw ?? '').trim().toLowerCase();

}



function normalizeEmployeeCode(raw) {

  const s = String(raw ?? '').trim();

  return s || null;

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

  return data?.id ? data : null;

}



function parseRestError(text, status) {

  if (!text) return `HTTP ${status}`;

  try {

    const body = JSON.parse(text);

    return body?.message || body?.error || body?.hint || text;

  } catch {

    return text;

  }

}



async function readCallerRole(db, callerId) {

  const res = await fetch(

    `${db.base}/rest/v1/profiles?id=eq.${encodeURIComponent(callerId)}&select=role`,

    { headers: restHeaders(db.key) }

  );

  const text = await res.text();

  if (res.ok && text) {

    const rows = JSON.parse(text);

    const row = Array.isArray(rows) ? rows[0] : null;

    if (row?.role) return String(row.role).trim();

  } else if (!res.ok && isStackDepthError({ message: text })) {

    logError('caller role REST stack depth', text.slice(0, 200));

  }

  const { data: rpcRole, error: rpcErr } = await db.client.rpc('get_profile_role', {

    p_id: callerId,

  });

  if (!rpcErr && typeof rpcRole === 'string' && rpcRole.trim()) return rpcRole.trim();

  if (rpcErr) logError('caller role RPC failed', rpcErr.message);

  return '';

}



async function findProfileByEmployeeCode(db, employeeCode, excludeId) {

  const url = new URL(`${db.base}/rest/v1/profiles`);

  url.searchParams.set('select', 'id,email');

  url.searchParams.set('employee_code', `ilike.${employeeCode}`);

  url.searchParams.set('limit', '1');

  const res = await fetch(url.toString(), { headers: restHeaders(db.key) });

  const text = await res.text();

  if (!res.ok) {

    const msg = parseRestError(text, res.status);

    return { taken: null, error: { message: msg, status: res.status } };

  }

  const rows = text ? JSON.parse(text) : [];

  const row = Array.isArray(rows) ? rows[0] : null;

  if (row?.id && (!excludeId || row.id !== excludeId)) {

    return { taken: row, error: null };

  }

  return { taken: null, error: null };

}



async function upsertProfileViaRpc(db, row) {

  const { data, error } = await db.client.rpc('admin_upsert_profile', {

    p_id: row.id,

    p_email: row.email,

    p_username: row.username,

    p_team: row.team,

    p_role: row.role,

    p_allowed_modules: row.allowed_modules,

    p_employee_code: row.employee_code,

    p_set_employee_code: true,

  });

  if (error) return { profile: null, error };

  const profile = parseRpcProfile(data);

  if (profile) return { profile, error: null };

  return { profile: null, error: { message: 'Profile upsert returned no row.' } };

}



async function upsertProfileViaRest(db, row) {

  const payload = {

    id: row.id,

    email: row.email,

    username: row.username,

    team: row.team,

    role: row.role,

    allowed_modules: row.allowed_modules,

    employee_code: row.employee_code,

  };

  const res = await fetch(`${db.base}/rest/v1/profiles?on_conflict=id`, {

    method: 'POST',

    headers: {

      ...restHeaders(db.key),

      'Content-Type': 'application/json',

      Prefer: 'resolution=merge-duplicates,return=representation',

    },

    body: JSON.stringify(payload),

  });

  const text = await res.text();

  if (!res.ok) {

    const msg = parseRestError(text, res.status);

    logError('REST upsert failed', { status: res.status, message: msg });

    return { profile: null, error: { message: msg, status: res.status, code: undefined } };

  }

  const rows = text ? JSON.parse(text) : [];

  const profile = Array.isArray(rows) ? rows[0] : rows;

  if (profile?.id) return { profile, error: null };

  return { profile: null, error: { message: 'REST upsert returned no row.' } };

}



async function upsertProfile(db, row) {

  logError('profile upsert via RPC', { id: row.id, employee_code: row.employee_code });

  const rpc = await upsertProfileViaRpc(db, row);

  if (rpc.profile?.id) return rpc;



  const rpcErr = rpc.error;

  const tryRest =

    !rpcErr ||

    isRpcMissingError(rpcErr, 'admin_upsert_profile') ||

    isStackDepthError(rpcErr) ||

    String(rpcErr?.message || '').includes('returned no row');



  if (tryRest) {

    logError('profile upsert via REST fallback', {

      id: row.id,

      reason: rpcErr?.message || 'rpc-null',

    });

    const rest = await upsertProfileViaRest(db, row);

    if (rest.profile?.id) return rest;

    if (rest.error) return { profile: null, error: rest.error };

  }



  return { profile: null, error: rpcErr || { message: 'Profile upsert failed.' } };

}



async function findAuthUserByEmail(db, email) {

  let page = 1;

  while (page <= 20) {

    const { data, error } = await db.client.auth.admin.listUsers({ page, perPage: 200 });

    if (error) return { user: null, error };

    const users = data?.users ?? [];

    const found = users.find((u) => normalizeEmail(u.email) === email);

    if (found) return { user: found, error: null };

    if (users.length < 200) break;

    page += 1;

  }

  return { user: null, error: null };

}



export async function adminCreateUser(body, jwt, supabaseUrl, serviceRoleKey, anonKey) {

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



  const db = createServiceDb(supabaseUrl, serviceRoleKey);

  const callerRole = await readCallerRole(db, caller.id);

  if (!['super_admin', 'super_admin_pro', 'admin'].includes(callerRole)) {

    const err = new Error('Only Admin or Super Admin can create users');

    err.status = 403;

    err.version = API_VERSION;

    throw err;

  }



  const email = normalizeEmail(body?.email);

  if (!email || !email.includes('@')) {

    const err = new Error('Valid email is required');

    err.status = 400;

    err.version = API_VERSION;

    throw err;

  }



  const password = String(body?.password ?? '').trim();

  if (password.length < 6) {

    const err = new Error('Password is required (minimum 6 characters).');

    err.status = 400;

    err.version = API_VERSION;

    throw err;

  }



  const employeeCode = normalizeEmployeeCode(

    body?.employee_code !== undefined ? body.employee_code : body?.emp_code

  );

  if (!employeeCode) {

    const err = new Error('Employee code is required.');

    err.status = 400;

    err.version = API_VERSION;

    throw err;

  }



  const username = String(body?.username ?? '').trim() || email.split('@')[0];

  const team = body?.team === '' ? null : (body?.team ?? null);

  const role = body?.role ?? 'executive';

  const allowed = Array.isArray(body?.allowed_modules) ? body.allowed_modules : [];



  if (callerRole === 'admin' && (role === 'super_admin' || role === 'super_admin_pro')) {

    const err = new Error('Only Super Admin can assign Super Admin roles');

    err.status = 403;

    err.version = API_VERSION;

    throw err;

  }



  const codeCheck = await findProfileByEmployeeCode(db, employeeCode);

  if (codeCheck.error) {

    if (isStackDepthError(codeCheck.error)) {

      throwCreateError(codeCheck.error, 'employee_code-lookup');

    }

    logError('employee_code lookup failed', codeCheck.error.message);

    const err = new Error(codeCheck.error.message);

    err.status = 500;

    err.version = API_VERSION;

    throw err;

  }

  if (codeCheck.taken) {

    const err = new Error(

      `Employee code "${employeeCode}" is already assigned to ${codeCheck.taken.email || codeCheck.taken.id}.`

    );

    err.status = 409;

    err.version = API_VERSION;

    throw err;

  }



  logError('create start', { email, employeeCode, role, team });



  const profileFields = {

    email,

    username,

    team,

    role,

    allowed_modules: allowed,

    employee_code: employeeCode,

  };



  const { data: created, error: createErr } = await db.client.auth.admin.createUser({

    email,

    password,

    email_confirm: true,

    user_metadata: {

      full_name: username,

      username,

      employee_code: employeeCode,

      team,

      role,

      allowed_modules: allowed,

    },

  });



  let userId = created?.user?.id ?? null;

  let restored = false;



  if (createErr) {

    const msg = String(createErr.message || '').toLowerCase();

    const isDuplicate =

      msg.includes('already') || msg.includes('registered') || msg.includes('exists');

    if (!isDuplicate) {

      logError('auth.admin.createUser failed', createErr.message);

      const err = new Error(createErr.message || 'Could not create auth user');

      err.status = 400;

      err.version = API_VERSION;

      if (String(createErr.message || '').toLowerCase().includes('database error creating new user')) {
        err.hint =
          'Supabase auth.users trigger is failing. Run supabase/scripts/fix_auth_user_create.sql in the SQL Editor, then retry.';
      }

      throw err;

    }

    const { user: existing, error: findErr } = await findAuthUserByEmail(db, email);

    if (findErr || !existing?.id) {

      const err = new Error(

        'This email is already registered but could not be loaded. Remove the user in Supabase Authentication, then create again.'

      );

      err.status = 400;

      err.version = API_VERSION;

      throw err;

    }

    userId = existing.id;

    restored = true;

    const { error: updateErr } = await db.client.auth.admin.updateUserById(userId, {

      password,

      email_confirm: true,

      user_metadata: profileFields,

    });

    if (updateErr) {

      const err = new Error(`User exists; could not update password: ${updateErr.message}`);

      err.status = 400;

      err.version = API_VERSION;

      throw err;

    }

    const codeRestore = await findProfileByEmployeeCode(db, employeeCode, userId);

    if (codeRestore.taken) {

      const err = new Error(

        `Employee code "${employeeCode}" is already assigned to ${codeRestore.taken.email || codeRestore.taken.id}.`

      );

      err.status = 409;

      err.version = API_VERSION;

      throw err;

    }

  }



  const upserted = await upsertProfile(db, { id: userId, ...profileFields });

  if (!upserted.profile?.id) {

    const detail = upserted.error?.message || 'no row';

    logError('profile upsert failed', { userId, message: detail });

    throwCreateError(

      {

        message: `Auth user created but profile failed: ${detail}`,

        code: upserted.error?.code,

        status: upserted.error?.status,

      },

      'profile-upsert'

    );

  }



  return {

    ok: true,

    user_id: userId,

    email,

    profile: upserted.profile,

    restored,

    version: API_VERSION,

  };

}


