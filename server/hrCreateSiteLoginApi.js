import { createClient } from '@supabase/supabase-js';
import { resolveAuthUser } from './adminProfileApi.js';

const API_VERSION = 'server-site-login-1';

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  err.version = API_VERSION;
  return err;
}

function rpcStatus(error) {
  const code = String(error?.code || '');
  if (code === '42501') return 403;
  if (code === 'P0002') return 404;
  if (code === '23505') return 409;
  if (code === '22023') return 400;
  return 500;
}

function isDuplicateAuthError(error) {
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('already') || msg.includes('registered') || msg.includes('exists');
}

async function findAuthUserByEmail(serviceDb, email) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await serviceDb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return null;
    const users = data?.users ?? [];
    const found = users.find((u) => String(u.email || '').toLowerCase() === email);
    if (found) return found;
    if (users.length < 200) return null;
  }
  return null;
}

/**
 * An earlier attempt for this same employee may have created the auth user and then
 * been interrupted before the profile was saved. Only that orphan is reused: no
 * profile row, and the auth metadata carries this employee's code.
 */
async function findResumableOrphan(serviceDb, email, employeeCode) {
  const existing = await findAuthUserByEmail(serviceDb, email);
  if (!existing?.id) return null;
  const metaCode = String(existing.user_metadata?.employee_code || '').trim().toLowerCase();
  if (!metaCode || metaCode !== employeeCode.toLowerCase()) return null;
  const { data: profile } = await serviceDb.from('profiles').select('id').eq('id', existing.id).maybeSingle();
  return profile ? null : existing;
}

/**
 * HR People Management: create an ERP login for a site employee (public.people).
 * Authorization and linking rules live in the database (site_login_create_precheck,
 * set_site_employee_login_access), called with the caller's own token.
 * Unlike admin create-user, an email that is already registered is never taken over.
 */
export async function hrCreateSiteLogin(body, jwt, supabaseUrl, serviceRoleKey, anonKey) {
  const caller = await resolveAuthUser(jwt, supabaseUrl, serviceRoleKey, anonKey);
  if (!caller?.id) throw fail(401, 'Invalid or expired session. Sign in again.');

  const personId = Number(body?.person_id);
  if (!Number.isFinite(personId) || personId <= 0) throw fail(400, 'Site employee is required.');

  const email = String(body?.email ?? '').trim().toLowerCase();
  if (!email || !email.includes('@')) throw fail(400, 'A valid email is required.');

  const password = String(body?.password ?? '').trim();
  if (password.length < 6) throw fail(400, 'Temporary password must be at least 6 characters.');

  const subModules = Array.isArray(body?.allowed_sub_modules)
    ? body.allowed_sub_modules.map((s) => String(s).trim()).filter(Boolean)
    : [];

  const userDb = createClient(supabaseUrl, anonKey || serviceRoleKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const serviceDb = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const pre = await userDb.rpc('site_login_create_precheck', { p_person_id: personId });
  if (pre.error) throw fail(rpcStatus(pre.error), pre.error.message);
  const employeeCode = String(pre.data?.employee_code || '').trim();
  const username = String(pre.data?.full_name || '').trim() || email.split('@')[0];

  const { data: created, error: createErr } = await serviceDb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: username, username, employee_code: employeeCode, role: 'executive' },
  });
  let userId = created?.user?.id;
  let resumed = false;
  if (createErr) {
    if (!isDuplicateAuthError(createErr)) throw fail(400, createErr.message || 'Could not create the login.');
    const orphan = await findResumableOrphan(serviceDb, email, employeeCode);
    if (!orphan) throw fail(409, 'This email already has a login. Use a different email.');
    const { error: pwErr } = await serviceDb.auth.admin.updateUserById(orphan.id, { password, email_confirm: true });
    if (pwErr) throw fail(500, `Could not finish the earlier attempt: ${pwErr.message}`);
    userId = orphan.id;
    resumed = true;
  }
  if (!userId) throw fail(500, 'Login was not created. Please try again.');

  const prof = await serviceDb.rpc('admin_upsert_profile', {
    p_id: userId,
    p_email: email,
    p_username: username,
    p_team: null,
    p_role: 'executive',
    p_allowed_modules: [],
    p_employee_code: employeeCode,
    p_set_employee_code: true,
    p_module_access_pending: true,
  });
  if (prof.error) {
    if (!resumed) await serviceDb.auth.admin.deleteUser(userId).catch(() => {});
    throw fail(500, `Could not save the login profile: ${prof.error.message}`);
  }

  const access = await userDb.rpc('set_site_employee_login_access', {
    p_person_id: personId,
    p_is_active: true,
    p_sub_modules: subModules,
  });

  return {
    ok: true,
    user_id: userId,
    email,
    employee_code: employeeCode,
    access_saved: !access.error,
    ...(access.error ? { warning: `Login created, but screens were not saved: ${access.error.message}` } : {}),
    version: API_VERSION,
  };
}
