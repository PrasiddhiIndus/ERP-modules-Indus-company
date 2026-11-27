import { createClient } from '@supabase/supabase-js';
import { resolveAuthUser } from './adminProfileApi.js';

const API_VERSION = 'server-site-login-2';

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

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Site Supervisor passwords: 8–72 characters with a letter and a number. */
export function supervisorPasswordProblem(password) {
  const p = String(password || '');
  if (p.length < 8) return 'Password must be at least 8 characters.';
  if (p.length > 72) return 'Password must be at most 72 characters.';
  if (!/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) return 'Password must contain at least one letter and one number.';
  return null;
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
 * Change the sign-in email of a site employee: Supabase Auth first, then
 * profiles.email and the employee's email together (rolled back on failure).
 * With no login yet, only the employee's email is saved.
 */
async function updateSiteLoginEmail({ personId, email }, userDb, serviceDb) {
  const pre = await userDb.rpc('site_login_email_precheck', { p_person_id: personId, p_email: email });
  if (pre.error) throw fail(rpcStatus(pre.error), pre.error.message);
  const profileId = pre.data?.profile_id || null;

  if (!profileId) {
    const { error } = await serviceDb.rpc('site_login_apply_email', {
      p_person_id: personId,
      p_profile_id: null,
      p_email: email,
    });
    if (error) throw fail(500, `Could not save the email: ${error.message}`);
    return { ok: true, person_id: personId, email, login_updated: false, version: API_VERSION };
  }

  const { data: current, error: getErr } = await serviceDb.auth.admin.getUserById(profileId);
  if (getErr || !current?.user) throw fail(404, 'The login for this employee was not found.');
  const oldEmail = String(current.user.email || '').toLowerCase();

  if (oldEmail !== email) {
    const { error: updErr } = await serviceDb.auth.admin.updateUserById(profileId, { email, email_confirm: true });
    if (updErr) {
      if (isDuplicateAuthError(updErr)) throw fail(409, 'This email already has a login. Use a different email.');
      throw fail(400, updErr.message || 'Could not change the sign-in email.');
    }
  }

  const { error: applyErr } = await serviceDb.rpc('site_login_apply_email', {
    p_person_id: personId,
    p_profile_id: profileId,
    p_email: email,
  });
  if (applyErr) {
    if (oldEmail && oldEmail !== email) {
      await serviceDb.auth.admin.updateUserById(profileId, { email: oldEmail, email_confirm: true }).catch(() => {});
    }
    throw fail(500, `Could not save the email: ${applyErr.message}`);
  }
  return { ok: true, person_id: personId, email, login_updated: true, version: API_VERSION };
}

/**
 * HR: create an ERP / Indus One login for a site employee (public.people), or change
 * the sign-in email of an existing one (action: 'update_email').
 * Authorization and linking rules live in the database (site_login_create_precheck,
 * site_login_email_precheck, site_supervisor_precheck, set_site_employee_login_access,
 * assign_site_supervisor), called with the caller's own token.
 * With supervisor_site_id the new login becomes the Site Supervisor of that site
 * (HR -> Site Attendance -> Attendance only, that site only).
 * An email that is already registered is never taken over.
 */
export async function hrCreateSiteLogin(body, jwt, supabaseUrl, serviceRoleKey, anonKey) {
  const caller = await resolveAuthUser(jwt, supabaseUrl, serviceRoleKey, anonKey);
  if (!caller?.id) throw fail(401, 'Invalid or expired session. Sign in again.');

  const personId = Number(body?.person_id);
  if (!Number.isFinite(personId) || personId <= 0) throw fail(400, 'Site employee is required.');

  const email = String(body?.email ?? '').trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) throw fail(400, 'A valid email is required.');

  const userDb = createClient(supabaseUrl, anonKey || serviceRoleKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const serviceDb = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (String(body?.action || '') === 'update_email') {
    return updateSiteLoginEmail({ personId, email }, userDb, serviceDb);
  }

  const supervisorSiteId = body?.supervisor_site_id == null || body.supervisor_site_id === ''
    ? null
    : Number(body.supervisor_site_id);
  if (supervisorSiteId != null && (!Number.isFinite(supervisorSiteId) || supervisorSiteId <= 0)) {
    throw fail(400, 'Site is required.');
  }

  let password = String(body?.password ?? '');
  if (supervisorSiteId != null) {
    // Chosen by HR: used exactly as typed.
    const problem = supervisorPasswordProblem(password);
    if (problem) throw fail(400, problem);
  } else {
    password = password.trim();
    if (password.length < 6) throw fail(400, 'Temporary password must be at least 6 characters.');
  }

  const subModules = Array.isArray(body?.allowed_sub_modules)
    ? body.allowed_sub_modules.map((s) => String(s).trim()).filter(Boolean)
    : [];

  const pre = await userDb.rpc('site_login_create_precheck', { p_person_id: personId });
  if (pre.error) throw fail(rpcStatus(pre.error), pre.error.message);
  const emailPre = await userDb.rpc('site_login_email_precheck', { p_person_id: personId, p_email: email });
  if (emailPre.error) throw fail(rpcStatus(emailPre.error), emailPre.error.message);
  if (supervisorSiteId != null) {
    const supPre = await userDb.rpc('site_supervisor_precheck', { p_person_id: personId, p_site_id: supervisorSiteId });
    if (supPre.error) throw fail(rpcStatus(supPre.error), supPre.error.message);
  }
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

  const warnings = [];
  const emailSync = await serviceDb.rpc('site_login_apply_email', {
    p_person_id: personId,
    p_profile_id: userId,
    p_email: email,
  });
  if (emailSync.error) warnings.push(`the employee email was not saved (${emailSync.error.message})`);

  const access = supervisorSiteId != null
    ? await userDb.rpc('assign_site_supervisor', { p_person_id: personId, p_site_id: supervisorSiteId })
    : await userDb.rpc('set_site_employee_login_access', {
      p_person_id: personId,
      p_is_active: true,
      p_sub_modules: subModules,
    });
  if (access.error) {
    warnings.push(
      supervisorSiteId != null
        ? `supervisor access was not given (${access.error.message}). Use Add Site Supervisor again for this employee.`
        : `screens were not saved (${access.error.message})`
    );
  }

  return {
    ok: true,
    user_id: userId,
    email,
    employee_code: employeeCode,
    access_saved: !access.error,
    supervisor_site_id: supervisorSiteId,
    ...(warnings.length ? { warning: `Login created, but ${warnings.join('; ')}` } : {}),
    version: API_VERSION,
  };
}
