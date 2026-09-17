import { createClient } from '@supabase/supabase-js';

const PROFILE_SELECT =
  'id, email, username, employee_code, team, role, allowed_modules, allowed_sub_modules, module_access_pending, is_active, created_at';

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

function normalizeModulesForCompare(raw) {
  if (Array.isArray(raw)) return raw.filter(Boolean).map(String).sort();
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(Boolean).map(String).sort() : [];
    } catch {
      return [];
    }
  }
  return [];
}

function profilePrivilegesMatch(profile, { team, role, allowed, allowedSub }) {
  if (!profile?.id) return false;
  const actualTeam = profile.team == null || profile.team === '' ? null : String(profile.team);
  const expectedTeam = team == null || team === '' ? null : String(team);
  if (actualTeam !== expectedTeam) return false;
  if ((profile.role ?? null) !== (role ?? null)) return false;
  if (JSON.stringify(normalizeModulesForCompare(profile.allowed_modules)) !==
      JSON.stringify(normalizeModulesForCompare(allowed))) {
    return false;
  }
  if (JSON.stringify(normalizeModulesForCompare(profile.allowed_sub_modules)) !==
      JSON.stringify(normalizeModulesForCompare(allowedSub))) {
    return false;
  }
  if (profile.module_access_pending === true) return false;
  return true;
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

async function parseRestPatchResponse(res, id, patchKeys, label) {
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
    logStep(`${label} failed`, { id, status: res.status, message: msg });
    return {
      data: null,
      error: { message: String(msg), status: res.status, code: rows?.code },
    };
  }
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (row?.id) return { data: row, error: null };
  logStep(`${label} returned 0 rows`, { id, patchKeys });
  return { data: null, error: { message: 'No profile row returned from PATCH', status: 404 } };
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
  const parsed = await parseRestPatchResponse(res, id, Object.keys(patch), 'REST PATCH');
  if (parsed.data?.id) return parsed;
  if (parsed.error && !String(parsed.error.message || '').includes('No profile row')) {
    return parsed;
  }
  return readProfileViaRest(db, id);
}

/**
 * Privilege PATCH as the signed-in Super Admin (caller JWT).
 * privilege-protect allows this via is_current_user_admin / role EXISTS check,
 * even when service_role JWT role claim is empty inside SECURITY DEFINER RPCs.
 */
async function patchProfilePrivilegesViaCaller(supabaseUrl, anonKey, jwt, id, patch) {
  const base = String(supabaseUrl).replace(/\/+$/, '');
  const apiKey = anonKey || '';
  if (!apiKey || !jwt) {
    return { data: null, error: { message: 'Missing anon key or caller token for privilege save', status: 500 } };
  }
  const res = await fetch(`${base}/rest/v1/profiles?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(patch),
  });
  return parseRestPatchResponse(res, id, Object.keys(patch), 'caller privilege PATCH');
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

function asJsonbArray(list) {
  // PostgREST jsonb params must be JSON values (not PG text[]).
  return Array.isArray(list) ? list.filter(Boolean).map(String) : [];
}

async function saveProfileViaRpc(db, { id, team, role, allowed, allowedSub, employeeCode, setEmployeeCode, isActive }) {
  const rpcArgs = {
    p_id: id,
    p_team: team,
    p_role: role,
    p_allowed_modules: asJsonbArray(allowed),
    p_employee_code: employeeCode ?? null,
    p_set_employee_code: setEmployeeCode,
  };
  if (Array.isArray(allowedSub)) {
    rpcArgs.p_allowed_sub_modules = asJsonbArray(allowedSub);
  }
  if (typeof isActive === 'boolean') {
    rpcArgs.p_is_active = isActive;
  }
  const { data, error } = await db.client.rpc('admin_save_profile', rpcArgs);
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

function normalizeEmail(raw) {
  return String(raw ?? '').trim().toLowerCase();
}

async function findProfileIdByEmail(db, email) {
  const target = normalizeEmail(email);
  if (!target) return { id: null, error: null };
  const res = await fetch(
    `${db.base}/rest/v1/profiles?email=eq.${encodeURIComponent(target)}&select=id&limit=1`,
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
    return { id: null, error: { message: String(msg), status: res.status } };
  }
  const rows = text ? JSON.parse(text) : [];
  const row = Array.isArray(rows) ? rows[0] : rows;
  return { id: row?.id ?? null, error: null };
}

/** Updates auth.users.email + profiles.email (login identity). */
async function applyEmailChange(db, userId, emailRaw) {
  if (emailRaw === undefined) return { changed: false, email: null, error: null };
  const newEmail = normalizeEmail(emailRaw);
  if (!newEmail || !newEmail.includes('@')) {
    return { changed: false, email: null, error: { message: 'Valid email is required', status: 400 } };
  }

  const { data: current } = await readProfileViaRest(db, userId, 'email');
  const currentEmail = normalizeEmail(current?.email);
  if (currentEmail === newEmail) return { changed: false, email: newEmail, error: null };

  const { id: existingId, error: findErr } = await findProfileIdByEmail(db, newEmail);
  if (findErr) {
    return {
      changed: false,
      email: null,
      error: { message: findErr.message || 'Could not verify email availability', status: 500 },
    };
  }
  if (existingId && existingId !== userId) {
    return {
      changed: false,
      email: null,
      error: { message: 'This email is already registered to another user.', status: 409 },
    };
  }

  const { error: authErr } = await db.client.auth.admin.updateUserById(userId, {
    email: newEmail,
    email_confirm: true,
  });
  if (authErr) {
    const msg = String(authErr.message || 'Could not update login email');
    const status =
      msg.toLowerCase().includes('already') || msg.toLowerCase().includes('registered') ? 409 : 400;
    return { changed: false, email: null, error: { message: msg, status } };
  }

  const { data: patched, error: profileErr } = await patchProfileViaRest(db, userId, { email: newEmail });
  if (profileErr || !patched?.id) {
    logStep('profiles email patch failed after auth email update', {
      userId,
      message: profileErr?.message,
    });
    return {
      changed: true,
      email: newEmail,
      error: {
        message:
          profileErr?.message ||
          'Login email was updated but the profile row could not be synced. Contact support.',
        status: 500,
      },
    };
  }

  return { changed: true, email: newEmail, error: null };
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

  const emailToApply = body.email !== undefined ? normalizeEmail(body.email) : undefined;
  if (emailToApply !== undefined && (!emailToApply || !emailToApply.includes('@'))) {
    const err = new Error('Valid email is required');
    err.status = 400;
    throw err;
  }

  const team = body.team === '' ? null : (body.team ?? null);
  const role = body.role ?? null;
  const allowed = Array.isArray(body.allowed_modules) ? body.allowed_modules : [];
  const allowedSub = Array.isArray(body.allowed_sub_modules) ? body.allowed_sub_modules : [];
  const setUsername = body.username !== undefined;
  const username = setUsername ? normalizeEmployeeCode(body.username) : undefined;
  const setEmployeeCode =
    body.employee_code !== undefined || body.emp_code !== undefined;
  const employeeCode = setEmployeeCode
    ? normalizeEmployeeCode(
        body.employee_code !== undefined ? body.employee_code : body.emp_code
      )
    : undefined;

  const patch = {
    team,
    role,
    allowed_modules: allowed,
    allowed_sub_modules: allowedSub,
    module_access_pending: false,
  };
  if (typeof body.is_active === 'boolean') {
    patch.is_active = body.is_active;
  }
  if (setEmployeeCode) patch.employee_code = employeeCode;

  let profile = null;
  let saveErr = null;

  logStep('save via RPC', {
    id,
    team,
    role,
    modules: allowed.length,
    subModules: allowedSub.length,
    setEmployeeCode,
    employeeCode: employeeCode ?? null,
  });
  const rpcSave = await saveProfileViaRpc(db, {
    id,
    team,
    role,
    allowed,
    allowedSub,
    employeeCode,
    setEmployeeCode,
    isActive: typeof body.is_active === 'boolean' ? body.is_active : undefined,
  });
  if (rpcSave.profile?.id) {
    profile = rpcSave.profile;
    logStep('RPC save ok', {
      id,
      team: profile.team ?? null,
      modules: Array.isArray(profile.allowed_modules) ? profile.allowed_modules.length : 0,
      pending: profile.module_access_pending === true,
    });
    // Only backfill sub-modules / is_active via REST when RPC row is missing them.
    // Never re-PATCH team/role/allowed_modules here — privilege-protect trigger can
    // silently restore OLD values when service_role JWT role claim is empty.
    const rpcSubs = normalizeModulesForCompare(profile.allowed_sub_modules);
    const wantSubs = normalizeModulesForCompare(allowedSub);
    const needSubPatch = JSON.stringify(rpcSubs) !== JSON.stringify(wantSubs);
    const needActivePatch =
      typeof body.is_active === 'boolean' && profile.is_active !== body.is_active;
    if (needSubPatch || needActivePatch) {
      const restPatch = {};
      if (needSubPatch) restPatch.allowed_sub_modules = allowedSub;
      if (needActivePatch) restPatch.is_active = body.is_active;
      const subPatch = await patchProfileViaRest(db, id, restPatch);
      if (subPatch.data?.id) {
        profile = { ...profile, ...subPatch.data };
      } else if (subPatch.error) {
        logStep('sub-modules REST patch failed', { id, message: subPatch.error.message });
      }
    }
  } else if (rpcSave.error && !isRpcMissingError(rpcSave.error, 'admin_save_profile')) {
    saveErr = rpcSave.error;
  }

  if (!profile?.id) {
    if (saveErr && isDuplicateEmployeeCodeError(saveErr)) {
      throwSaveError(saveErr, 'profiles-save');
    }
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
          allowed_sub_modules: allowedSub,
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

    if (emailToApply !== undefined) {
      const emailResult = await applyEmailChange(db, id, emailToApply);
      if (emailResult.error) {
        const err = new Error(emailResult.error.message);
        err.status = emailResult.error.status || 500;
        throw err;
      }
    }

    const { data: freshProfile, error: readErr } = await readProfileViaRest(db, id);
    if (!readErr && freshProfile?.id) {
      profile = freshProfile;
    }

    if (!profilePrivilegesMatch(profile, { team, role, allowed, allowedSub })) {
      logStep('privilege persist mismatch — retrying as caller', {
        id,
        expected: { team, role, modules: allowed.length, subModules: allowedSub.length },
        actual: {
          team: profile?.team ?? null,
          role: profile?.role ?? null,
          modules: normalizeModulesForCompare(profile?.allowed_modules).length,
          pending: profile?.module_access_pending === true,
        },
      });
      const privilegePatch = {
        team,
        role,
        allowed_modules: allowed,
        allowed_sub_modules: allowedSub,
        module_access_pending: false,
      };
      if (typeof body.is_active === 'boolean') {
        privilegePatch.is_active = body.is_active;
      }
      const callerPatch = await patchProfilePrivilegesViaCaller(
        supabaseUrl,
        anonKey,
        jwt,
        id,
        privilegePatch
      );
      if (callerPatch.data?.id) {
        profile = callerPatch.data;
      } else if (callerPatch.error) {
        logStep('caller privilege PATCH failed', {
          id,
          message: callerPatch.error.message,
          status: callerPatch.error.status,
        });
      }
      const { data: reRead } = await readProfileViaRest(db, id);
      if (reRead?.id) profile = reRead;
    }

    if (!profilePrivilegesMatch(profile, { team, role, allowed, allowedSub })) {
      logStep('privilege persist mismatch after save', {
        id,
        expected: { team, role, allowed, allowedSub },
        actual: {
          team: profile?.team ?? null,
          role: profile?.role ?? null,
          allowed_modules: profile?.allowed_modules ?? [],
          allowed_sub_modules: profile?.allowed_sub_modules ?? [],
          module_access_pending: profile?.module_access_pending === true,
        },
      });
      const err = new Error(
        'Team/module assignments did not persist. Apply migration 20260916190000_fix_admin_save_profile_privilege_guard.sql (or supabase db push), then retry.'
      );
      err.status = 500;
      err.hint = 'profiles privilege guard blocked admin_save_profile';
      throw err;
    }

    return { ok: true, profile, version: 'server-api-6' };
  }

  if (saveErr) throwSaveError(saveErr, 'profiles-save');

  const err = new Error(`No profiles row for user ${id}. Nothing was saved.`);
  err.status = 404;
  throw err;
}
