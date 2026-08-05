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

function decodeJwtPayload(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length < 2) return null;
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4;
    if (pad) b64 += '='.repeat(4 - pad);
    return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function projectRefFromJwt(token) {
  try {
    const payload = decodeJwtPayload(token);
    if (!payload) return '';
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

/** @returns {'valid'|'expired'|'invalid'} */
function jwtAccessState(token) {
  const payload = decodeJwtPayload(token);
  if (!payload?.sub) return 'invalid';
  const exp = Number(payload.exp);
  if (!Number.isFinite(exp)) return 'valid';
  const now = Math.floor(Date.now() / 1000);
  // 30s clock skew tolerance
  if (exp < now - 30) return 'expired';
  return 'valid';
}

/**
 * Validate user JWT via GoTrue REST (same as auth.getUser under the hood).
 * Avoids supabase-js edge cases when service_role is missing on the API host.
 */
async function verifyUserJwtWithAuthApi(url, apiKey, jwt) {
  const base = String(url || '').replace(/\/+$/, '');
  if (!base || !apiKey || !jwt) {
    return { user: null, error: 'missing_url_or_key' };
  }
  try {
    const res = await fetch(`${base}/auth/v1/user`, {
      method: 'GET',
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${jwt}`,
      },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg =
        body.msg ||
        body.error_description ||
        body.message ||
        body.error ||
        `auth_user_http_${res.status}`;
      return { user: null, error: String(msg) };
    }
    if (!body?.id) return { user: null, error: 'no_user' };
    return { user: body, error: null };
  } catch (err) {
    return { user: null, error: err?.message || 'auth_user_fetch_failed' };
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

    const accessState = jwtAccessState(jwt);
    if (accessState === 'invalid') {
      throw new HttpError(401, 'Session token is invalid. Sign out and sign in again, then retry.');
    }
    if (accessState === 'expired') {
      throw new HttpError(401, 'Session expired. Sign out and sign in again, then retry Sync eTimeOffice.');
    }

    // Try anon first (same key the browser uses), then service_role.
    // A wrong/stale anon key must not block Sync when service_role is valid.
    const validateKeys = [...new Set([anon, svc].filter(Boolean))];
    let userData = null;
    let verifyError = null;

    for (const validateKey of validateKeys) {
      const rest = await verifyUserJwtWithAuthApi(url, validateKey, jwt);
      if (rest.user) {
        userData = { user: rest.user };
        verifyError = null;
        break;
      }
      verifyError = rest.error || verifyError;

      const validateClient = createClient(url, validateKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await validateClient.auth.getUser(jwt);
      if (data?.user) {
        userData = data;
        verifyError = null;
        break;
      }
      verifyError = error?.message || verifyError || 'getUser failed';
    }

    if (!userData?.user) {
      const hint = String(verifyError || '').toLowerCase();
      // eslint-disable-next-line no-console
      console.warn('[auth] user JWT verify failed:', verifyError || 'no user', {
        hasAnon: Boolean(anon),
        hasServiceRole: Boolean(svc),
        keysTried: validateKeys.length,
        serverRef: serverRef || null,
        sessionRef: sessionRef || null,
        accessState,
      });
      let message = 'Invalid or expired session. Sign out and sign in again.';
      if (hint.includes('fetch') || hint.includes('network') || hint.includes('econnrefused')) {
        message =
          'Could not verify session with Supabase. Check server network and SUPABASE_URL, then restart the API.';
      } else if (!svc && anon) {
        message =
          'Could not verify your login with the attendance API. Sign out and sign in again. If it still fails, production API is missing SUPABASE_SERVICE_ROLE_KEY — add the production service_role key to .env.server and restart PM2.';
      } else if (!svc && !anon) {
        message =
          'Attendance API is missing Supabase keys. Fix production .env.server (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + anon key) and restart the API.';
      } else if (hint.includes('missing sub') || hint.includes('bad_jwt')) {
        message = 'Session token is invalid. Sign out and sign in again, then retry Sync eTimeOffice.';
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

    // Last resort: build a minimal profile from JWT user_metadata so Sync is not blocked
    // when service_role is missing and profiles RLS cannot be read.
    if (!profile && userData.user) {
      const meta = userData.user.user_metadata || {};
      const appMeta = userData.user.app_metadata || {};
      profile = {
        id: userData.user.id,
        email: userData.user.email || null,
        role: String(meta.role || appMeta.role || '').trim(),
        team: String(meta.team || appMeta.team || '').trim(),
        allowed_modules: meta.allowed_modules || appMeta.allowed_modules || [],
        allowed_sub_modules: meta.allowed_sub_modules || appMeta.allowed_sub_modules || [],
        employee_code: meta.employee_code || null,
      };
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
