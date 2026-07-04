import { createClient } from '@supabase/supabase-js';

const ADMIN_ROLES = new Set(['super_admin', 'super_admin_pro', 'admin']);
const HR_MODULES = new Set(['hr', 'payroll', 'admin']);
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

    const client = createSupabaseWithJwt(jwt);
    const { data: userData, error } = await client.auth.getUser(jwt);
    if (error || !userData?.user) throw new HttpError(401, 'Invalid or expired session.');

    const svc = getServiceRoleKey();
    const url = getSupabaseUrl();
    let profile = null;
    if (url && svc) {
      const adminClient = createClient(url, svc, { auth: { persistSession: false } });
      const { data } = await adminClient
        .from('profiles')
        .select('id, role, team, allowed_modules, employee_code, email')
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
          return res.status(403).json({ error: 'Forbidden.' });
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
    const modules = parseModules(ctx.profile?.allowed_modules);
    return hasModule(modules, HR_MODULES);
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
    requireBillingAccess: middleware((ctx) => hasBillingAccess(ctx)),
  };
}
