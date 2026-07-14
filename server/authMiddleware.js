import { createClient } from '@supabase/supabase-js';

const ADMIN_ROLES = new Set(['super_admin', 'super_admin_pro', 'admin']);
const HR_MODULES = new Set(['hr', 'payroll', 'admin']);
const HR_TEAMS = new Set(['hr', 'admin']);
const BILLING_MODULES = new Set(['billing', 'commercialMt', 'commercialRm', 'commercial']);
const BILLING_TEAMS = new Set(['billing', 'commercial', 'commercialMt', 'commercialRm']);
const BILLING_ROLES = new Set(['admin', 'billing']);

function parseModules(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((m) => String(m || '').trim()).filter(Boolean);
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

  function createSupabaseWithJwt(jwt) {
    const url = getSupabaseUrl();
    const svc = getServiceRoleKey();
    const anon = getAnonKey();
    const key = svc || anon;
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
    const key = svc || anon;
    if (!url || !key) {
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
        `API server is linked to a different Supabase project than this login. Update SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the production .env.server (must match the website), then restart the API.`
      );
    }

    const validateClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error } = await validateClient.auth.getUser(jwt);
    if (error || !userData?.user) {
      const hint = String(error?.message || '').toLowerCase();
      const message =
        hint.includes('fetch') || hint.includes('network') || hint.includes('econnrefused')
          ? 'Could not verify session with Supabase. Check server network and SUPABASE_URL.'
          : !svc
            ? 'Invalid or expired session (API missing a valid SUPABASE_SERVICE_ROLE_KEY matching SUPABASE_URL). Sign out and sign in again, or fix production .env.server and restart the API.'
            : 'Invalid or expired session. Sign out and sign in again.';
      throw new HttpError(401, message);
    }

    const client = createSupabaseWithJwt(jwt);

    const profileSelect = 'id, role, team, allowed_modules, employee_code, email';
    let profile = null;
    if (url && svc) {
      const adminClient = createClient(url, svc, { auth: { persistSession: false } });
      const { data } = await adminClient
        .from('profiles')
        .select(profileSelect)
        .eq('id', userData.user.id)
        .maybeSingle();
      profile = data || null;
    }

    // Fallback: read own profile via user JWT + RLS (staging dev without matching service_role).
    if (!profile) {
      const { data } = await client
        .from('profiles')
        .select(profileSelect)
        .eq('id', userData.user.id)
        .maybeSingle();
      profile = data || null;
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
            ? 'Could not load your profile on the API server. For staging, add SUPABASE_SERVICE_ROLE_KEY to .env.server.staging (matching .env.staging) and restart npm run dev:staging.'
            : 'Admin or HR module access is required for this API.';
          return res.status(403).json({ error: 'Forbidden.', message });
        }
        return next();
      } catch (err) {
        const status = Number(err?.status) || 401;
        return res.status(status).json({ error: err?.message || 'Unauthorized.' });
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
    const role = String(ctx.profile?.role || '').trim();
    if (BILLING_ROLES.has(role)) return true;
    const team = String(ctx.profile?.team || '').trim();
    if (BILLING_TEAMS.has(team)) return true;
    const modules = parseModules(ctx.profile?.allowed_modules);
    return hasModule(modules, BILLING_MODULES);
  }

  return {
    requireAuth: middleware(null),
    requireAdmin: middleware((ctx) => isAdmin(ctx)),
    requireHrOrAdmin: middleware((ctx) => hasHrAccess(ctx)),
    requireAttendanceAdmin: middleware((ctx) => hasAttendanceAdminAccess(ctx)),
    requireBillingAccess: middleware((ctx) => hasBillingAccess(ctx)),
  };
}
