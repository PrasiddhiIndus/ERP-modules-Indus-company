import { createClient } from '@supabase/supabase-js';

const ADMIN_ROLES = new Set(['super_admin', 'super_admin_pro', 'admin']);
const HR_MODULES = new Set(['hr', 'payroll', 'admin']);
const HR_TEAMS = new Set(['hr', 'admin']);
const BILLING_MODULES = new Set(['billing', 'commercialmt', 'commercialrm', 'commercial']);
const BILLING_TEAMS = new Set(['billing', 'commercial', 'commercialmt', 'commercialrm']);
const BILLING_ROLES = new Set(['admin', 'billing']);
const BILLING_SUB_MODULE_PREFIXES = ['billing.', 'commercialmt.', 'commercialrm.', 'commercial.'];

function parseModules(raw) {
  if (Array.isArray(raw)) {
    return raw.map((m) => String(m || '').trim()).filter(Boolean);
  }
  if (raw && typeof raw === 'object') {
    return Object.keys(raw)
      .filter((k) => raw[k])
      .map((k) => String(k || '').trim())
      .filter(Boolean);
  }
  return [];
}

function hasModule(modules, allowed) {
  return modules.some((m) => allowed.has(m));
}

function projectRefFromUrl(url) {
  const m = String(url || '').match(/https?:\/\/([^.]+)\.supabase\.co/i);
  return m ? m[1] : '';
}

function projectRefFromJwt(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length < 2) return '';
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    const fromRef = String(payload?.ref || '').trim();
    if (fromRef) return fromRef;
    // Access tokens often omit `ref`; iss is https://<project>.supabase.co/auth/v1
    const iss = String(payload?.iss || '').trim();
    const fromIss = iss.match(/https?:\/\/([^.]+)\.supabase\.co/i);
    return fromIss ? fromIss[1] : '';
  } catch {
    return '';
  }
}

export function createAuthMiddleware({ getSupabaseUrl, getServiceRoleKey, getAnonKey, HttpError }) {
  function extractBearer(req) {
    const authHeader = req.headers.authorization || '';
    return authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';
  }

  /** User-scoped client (anon + JWT) for RLS. Prefer anon — same key the browser uses. */
  function createUserClient(jwt) {
    const url = getSupabaseUrl();
    const anon = getAnonKey();
    const svc = getServiceRoleKey();
    const key = anon || svc;
    if (!url || !key) {
      throw new HttpError(500, 'Server missing Supabase URL or API key.');
    }
    return createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: jwt ? { headers: { Authorization: `Bearer ${jwt}` } } : undefined,
    });
  }

  async function loadAuthContext(req) {
    const jwt = extractBearer(req);
    if (!jwt) throw new HttpError(401, 'Missing Authorization Bearer token.');

    const url = getSupabaseUrl();
    const svc = getServiceRoleKey();
    const anon = getAnonKey();
    if (!url || (!svc && !anon)) {
      throw new HttpError(500, 'Server missing Supabase URL or API key.');
    }

    const serverRef = projectRefFromUrl(url);
    const sessionRef = projectRefFromJwt(jwt);
    if (serverRef && sessionRef && serverRef !== sessionRef) {
      // eslint-disable-next-line no-console
      console.warn(
        `[auth] JWT project "${sessionRef}" does not match server SUPABASE_URL project "${serverRef}". Fix .env.server on the API host.`
      );
      throw new HttpError(
        401,
        `API server is linked to a different Supabase project than this login. Update SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.server (must match the website), then restart the API.`
      );
    }

    // Validate the user JWT with the anon key first (matches the website login).
    // Do not require service_role for getUser — missing/mismatched service_role must not
    // surface as a false "expired session / fix SERVICE_ROLE_KEY" error on Sync.
    const validateKey = anon || svc;
    const validateClient = createClient(url, validateKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error } = await validateClient.auth.getUser(jwt);
    if (error || !userData?.user) {
      const hint = String(error?.message || '').toLowerCase();
      // eslint-disable-next-line no-console
      console.warn('[auth] getUser failed:', error?.message || 'no user', {
        hasAnon: Boolean(anon),
        hasServiceRole: Boolean(svc),
        serverRef: serverRef || null,
        sessionRef: sessionRef || null,
      });
      let message = 'Invalid or expired session. Sign out and sign in again.';
      if (hint.includes('fetch') || hint.includes('network') || hint.includes('econnrefused')) {
        message =
          'Could not verify session with Supabase. Check server network and SUPABASE_URL, then restart the API.';
      } else if (hint.includes('missing sub') || hint.includes('bad_jwt')) {
        message =
          'Session token is invalid. Sign out and sign in again, then retry Sync eTimeOffice.';
      }
      throw new HttpError(401, message);
    }

    const profileSelectWithSubs =
      'id, role, team, allowed_modules, allowed_sub_modules, employee_code, email';
    const profileSelectBasic = 'id, role, team, allowed_modules, employee_code, email';

    async function loadProfile(db) {
      const withSubs = await db
        .from('profiles')
        .select(profileSelectWithSubs)
        .eq('id', userData.user.id)
        .maybeSingle();
      if (withSubs.data) return withSubs.data;
      // Older DBs may lack allowed_sub_modules; retry without it.
      if (withSubs.error) {
        const basic = await db
          .from('profiles')
          .select(profileSelectBasic)
          .eq('id', userData.user.id)
          .maybeSingle();
        return basic.data || null;
      }
      return null;
    }

    let profile = null;
    if (url && svc) {
      const adminClient = createClient(url, svc, { auth: { persistSession: false } });
      profile = await loadProfile(adminClient);
    }

    // Fallback: read own profile via user JWT + RLS (works when service_role is missing).
    if (!profile) {
      profile = await loadProfile(createUserClient(jwt));
    }

    return { jwt, user: userData.user, profile };
  }

  function middleware(checkFn) {
    return async (req, res, next) => {
      try {
        const ctx = await loadAuthContext(req);
        req.auth = ctx;
        req.user = ctx.user;
        req.profile = ctx.profile;
        if (checkFn && !checkFn(ctx)) {
          const message = !ctx.profile
            ? 'Could not load your profile on the API server. Add a valid SUPABASE_SERVICE_ROLE_KEY matching SUPABASE_URL to .env.server (or ensure profiles RLS allows reading your own row), then restart the API.'
            : 'Admin or HR module access is required for this API.';
          return res.status(403).json({ error: 'Forbidden.', message });
        }
        return next();
      } catch (err) {
        const status = Number(err?.status) || 401;
        return res.status(status).json({
          error: err?.message || 'Unauthorized.',
          message: err?.message || 'Unauthorized.',
        });
      }
    };
  }

  function isAdmin(ctx) {
    const role = String(ctx.profile?.role || '').trim();
    return ADMIN_ROLES.has(role);
  }

  function hasHrAccess(ctx) {
    if (isAdmin(ctx)) return true;
    const team = String(ctx.profile?.team || '').trim();
    if (HR_TEAMS.has(team)) return true;
    const modules = parseModules(ctx.profile?.allowed_modules);
    return hasModule(modules, HR_MODULES);
  }

  /** Matches SQL `current_user_has_attendance_admin_access()` for raw attendance / eTime sync. */
  function hasAttendanceAdminAccess(ctx) {
    if (isAdmin(ctx)) return true;
    const team = String(ctx.profile?.team || '').trim();
    if (HR_TEAMS.has(team)) return true;
    const modules = parseModules(ctx.profile?.allowed_modules);
    return modules.includes('hr') || modules.includes('admin');
  }

  function hasBillingAccess(ctx) {
    if (isAdmin(ctx)) return true;
    const role = String(ctx.profile?.role || '').trim().toLowerCase();
    if (BILLING_ROLES.has(role)) return true;
    // Employee Master stores "Commercial"; RLS/UI map that to commercialMt — match case-insensitively.
    const team = String(ctx.profile?.team || '').trim().toLowerCase();
    if (BILLING_TEAMS.has(team)) return true;
    const modules = parseModules(ctx.profile?.allowed_modules).map((m) => m.toLowerCase());
    if (hasModule(modules, BILLING_MODULES)) return true;
    const subModules = parseModules(ctx.profile?.allowed_sub_modules).map((m) => m.toLowerCase());
    return subModules.some((s) => BILLING_SUB_MODULE_PREFIXES.some((prefix) => s.startsWith(prefix)));
  }

  return {
    requireAuth: middleware(null),
    requireAdmin: middleware((ctx) => isAdmin(ctx)),
    requireHrOrAdmin: middleware((ctx) => hasHrAccess(ctx)),
    requireAttendanceAdmin: middleware((ctx) => hasAttendanceAdminAccess(ctx)),
    requireBillingAccess: middleware((ctx) => hasBillingAccess(ctx)),
  };
}
