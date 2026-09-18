/**
 * Post-auth navigation helpers — profile resolution, safe landing paths, staged logging.
 * Auth architecture unchanged: Supabase JWT in localStorage + profiles for authorization.
 */

import {
  getAccessibleModules,
  getLoginRedirectPath,
  getLandingPathForUser,
  isPathAllowed,
  normalizeAccessProfile,
  normalizeTeamModuleKey,
  resolveTeamModuleKey,
  parseAllowedModulesList,
  ROLES,
  normalizeAppRole,
  isEmptyPendingAccessStub,
  MODULE_LANDING_PATHS,
  TEAMS,
} from '../config/roles';
import { invokeAuthenticatedFunction, supabase } from './supabase';
import { writeCachedProfileRow, readCachedProfileRow } from './authSessionUtils';
import {
  ACCOUNT_INACTIVE_CODE,
  ACCOUNT_INACTIVE_MESSAGE,
} from './accountInactive';

export const LOGIN_LOG_PREFIX = '[login-flow]';

/** Enable with VITE_LOGIN_DEBUG=true in .env */
export function logLoginStage(stage, detail = {}) {
  const verbose =
    import.meta.env.DEV ||
    String(import.meta.env.VITE_LOGIN_DEBUG || '').toLowerCase() === 'true';
  if (verbose) {
    console.info(LOGIN_LOG_PREFIX, stage, detail);
  }
}

export function buildProfileFromSession(session, quickProfile) {
  const row = quickProfile;
  const rowModules = parseAllowedModulesList(row?.allowed_modules);
  const rowSubModules = parseAllowedModulesList(row?.allowed_sub_modules);
  const hasRow = Boolean(row?.role || rowModules.length || rowSubModules.length || row?.team);
  const inactiveFromRow = row?.is_active === false;
  return normalizeAccessProfile({
    role: row?.role ?? "executive",
    team: row?.team ?? null,
    allowed_modules: rowModules,
    allowed_sub_modules: rowSubModules,
    module_access_pending: hasRow ? row?.module_access_pending === true : true,
    is_active: inactiveFromRow ? false : true,
  });
}

function cacheProfileSnapshot(session, profile) {
  if (!session?.user?.id) return;
  writeCachedProfileRow({
    id: session.user.id,
    email: session.user.email,
    username: session.user.email?.split("@")[0],
    team: profile.team ?? null,
    role: profile.role ?? "executive",
    allowed_modules: parseAllowedModulesList(profile.allowed_modules),
    allowed_sub_modules: parseAllowedModulesList(profile.allowed_sub_modules),
    module_access_pending: profile.module_access_pending === true,
    is_active: profile.is_active !== false,
  });
}

/** Older deployed login-check builds omit privilege columns — detect that shape. */
function loginCheckProfileMissingPrivilegeFields(row) {
  if (!row || typeof row !== 'object') return true;
  return (
    !Object.prototype.hasOwnProperty.call(row, 'allowed_sub_modules') ||
    !Object.prototype.hasOwnProperty.call(row, 'module_access_pending') ||
    !Object.prototype.hasOwnProperty.call(row, 'is_active')
  );
}

/**
 * Fill privilege fields from profiles when login-check returns a truncated row.
 * Uses the signed-in user's JWT (RLS self-read).
 */
async function fillPrivilegeFieldsFromProfilesTable(userId) {
  if (!userId) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select(
      'team, role, allowed_modules, allowed_sub_modules, module_access_pending, is_active, employee_code, username, email'
    )
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) {
    logLoginStage('profile-table-fill-failed', {
      userId,
      message: error?.message || 'no-row',
    });
    return null;
  }
  return data;
}

function mergeLoginCheckProfile(edgeProfile, tableRow, cached) {
  const base = { ...(edgeProfile || {}) };
  // Prefer the live profiles row. Never copy pending=true from a signup stub cache.
  const fill = tableRow || (cached && !isEmptyPendingAccessStub(cached) ? cached : {}) || {};
  if (!Object.prototype.hasOwnProperty.call(base, 'allowed_sub_modules')) {
    base.allowed_sub_modules = fill.allowed_sub_modules;
  }
  if (!Object.prototype.hasOwnProperty.call(base, 'allowed_modules')) {
    base.allowed_modules = fill.allowed_modules;
  }
  if (!Object.prototype.hasOwnProperty.call(base, 'module_access_pending')) {
    // Legacy login-check omitted this column. Missing ≠ pending.
    base.module_access_pending = tableRow ? tableRow.module_access_pending === true : false;
  }
  if (!Object.prototype.hasOwnProperty.call(base, 'is_active')) {
    base.is_active = fill.is_active;
  }
  if (base.team == null && fill.team != null) base.team = fill.team;
  if (!base.role && fill.role) base.role = fill.role;
  return base;
}

function preferRicherProfile(candidate, cached) {
  if (cached && isEmptyPendingAccessStub(candidate) && !isEmptyPendingAccessStub(cached)) {
    return cached;
  }
  return candidate;
}

/**
 * Load authorization profile: login-check (preferred) → profiles cache / safe stub.
 * Never grants role or modules from Auth metadata. Never throws.
 */
export async function fetchLoginProfile(session, quickProfile, { timeoutMs = 8000 } = {}) {
  const cached = session?.user?.id ? readCachedProfileRow(session.user.id) : null;
  const seed = cached?.id ? cached : quickProfile;
  const fallback = buildProfileFromSession(session, seed);
  const accessToken = session?.access_token;
  if (!accessToken) {
    logLoginStage('profile-skipped', { reason: 'no-access-token' });
    return { profile: fallback, source: 'safe-default', warning: null };
  }

  logLoginStage('profile-fetch-start', { userId: session?.user?.id });

  const checkPromise = invokeAuthenticatedFunction('login-check', { body: {} }, accessToken);
  const timeoutPromise = new Promise((resolve) => {
    setTimeout(() => resolve({ timedOut: true }), timeoutMs);
  });

  try {
    const result = await Promise.race([checkPromise, timeoutPromise]);
    if (result?.timedOut) {
      logLoginStage('profile-fetch-timeout', { timeoutMs });
      const profile = preferRicherProfile(fallback, cached);
      cacheProfileSnapshot(session, profile);
      return {
        profile,
        source: 'safe-default-timeout',
        warning: 'Profile sync timed out. Sidebar may update in a moment.',
      };
    }

    const { data: chk, error } = result;

    // login-check returns HTTP 403 + body for inactive — do not soft-fallback to metadata.
    if (
      chk?.ok === false &&
      (chk.code === ACCOUNT_INACTIVE_CODE || /inactive/i.test(String(chk.error || '')))
    ) {
      logLoginStage('profile-inactive', { source: 'login-check-reject' });
      return {
        profile: normalizeAccessProfile({ ...fallback, is_active: false }),
        source: 'login-check',
        warning: null,
        inactive: true,
        error: ACCOUNT_INACTIVE_MESSAGE,
        code: ACCOUNT_INACTIVE_CODE,
      };
    }

    if (error) {
      logLoginStage('profile-fetch-error', { message: error?.message || String(error) });
      const profile = preferRicherProfile(fallback, cached);
      cacheProfileSnapshot(session, profile);
      return {
        profile,
        source: 'safe-default-after-error',
        warning: null,
      };
    }

    if (chk?.ok && chk?.profile) {
      let rawProfile = chk.profile;
      let source = 'login-check';
      if (loginCheckProfileMissingPrivilegeFields(rawProfile)) {
        logLoginStage('profile-login-check-incomplete', {
          keys: Object.keys(rawProfile || {}),
        });
        const tableRow = await fillPrivilegeFieldsFromProfilesTable(session.user.id);
        rawProfile = mergeLoginCheckProfile(rawProfile, tableRow, cached);
        if (tableRow) source = 'login-check+profiles';
      }
      const profile = preferRicherProfile(
        normalizeAccessProfile({
          role: rawProfile.role,
          team: rawProfile.team ?? null,
          allowed_modules: rawProfile.allowed_modules,
          allowed_sub_modules: rawProfile.allowed_sub_modules,
          module_access_pending: rawProfile.module_access_pending === true,
          is_active: rawProfile.is_active !== false,
        }),
        cached
      );
      writeCachedProfileRow({
        id: session.user.id,
        email: rawProfile.email ?? session.user.email ?? null,
        username: rawProfile.username ?? null,
        team: profile.team,
        role: profile.role,
        allowed_modules: profile.allowed_modules,
        allowed_sub_modules: profile.allowed_sub_modules,
        employee_code: rawProfile.employee_code ?? null,
        module_access_pending: profile.module_access_pending === true,
        is_active: profile.is_active !== false,
      });
      if (profile.is_active === false) {
        logLoginStage('profile-inactive', { source });
        return {
          profile,
          source,
          warning: null,
          inactive: true,
          error: ACCOUNT_INACTIVE_MESSAGE,
          code: ACCOUNT_INACTIVE_CODE,
        };
      }
      logLoginStage('profile-loaded', {
        source,
        role: profile.role,
        team: profile.team,
        modules: profile.allowed_modules,
        subModules: profile.allowed_sub_modules,
        module_access_pending: profile.module_access_pending === true,
      });
      return { profile, source, warning: null };
    }

    logLoginStage('profile-fetch-empty', { chk });
    const emptyProfile = preferRicherProfile(fallback, cached);
    cacheProfileSnapshot(session, emptyProfile);
    return { profile: emptyProfile, source: 'safe-default', warning: null };
  } catch (err) {
    logLoginStage('profile-fetch-exception', { message: err?.message || String(err) });
    const profile = preferRicherProfile(fallback, cached);
    cacheProfileSnapshot(session, profile);
    return { profile, source: 'safe-default-exception', warning: null };
  }
}

/**
 * Pick a landing URL that exists in the router and passes isPathAllowed.
 * Never returns /login. Avoids /app/dashboard when user lacks overview.
 */
export function resolveSafeLandingPath(userProfile, accessibleModules) {
  const mods =
    accessibleModules?.size ? accessibleModules : getAccessibleModules(userProfile);
  const role = normalizeAppRole(userProfile?.role);

  const candidates = [];

  if (
    role === ROLES.ADMIN ||
    role === ROLES.SUPER_ADMIN ||
    role === ROLES.SUPER_ADMIN_PRO
  ) {
    candidates.push('/app/dashboard');
  } else if (role === ROLES.EXECUTIVE || role === ROLES.MANAGER) {
    candidates.push(getLandingPathForUser(userProfile, mods));
  } else {
    candidates.push(getLoginRedirectPath(userProfile, mods));
  }

  const teamKey = resolveTeamModuleKey(userProfile?.team);
  if (teamKey && MODULE_LANDING_PATHS[teamKey]) {
    candidates.push(MODULE_LANDING_PATHS[teamKey]);
  }

  for (const k of (userProfile?.allowed_modules || []).map(normalizeTeamModuleKey).filter(Boolean)) {
    if (MODULE_LANDING_PATHS[k]) candidates.push(MODULE_LANDING_PATHS[k]);
  }

  const sortedMods = [...mods]
    .filter((k) => k !== 'overview' && k !== 'settings')
    .sort();
  for (const k of sortedMods) {
    if (MODULE_LANDING_PATHS[k]) candidates.push(MODULE_LANDING_PATHS[k]);
  }

  if (mods.has('settings')) candidates.push('/app/settings');
  if (mods.has('overview')) candidates.push('/app/dashboard');

  const seen = new Set();
  for (const path of candidates) {
    if (!path || seen.has(path)) continue;
    seen.add(path);
    if (isPathAllowed(path, mods)) {
      logLoginStage('landing-resolved', { path, role, team: userProfile?.team });
      return path;
    }
    logLoginStage('landing-rejected', { path, reason: 'not-allowed-for-modules' });
  }

  const fallback = mods.has('settings') ? '/app/settings' : '/app/dashboard';
  logLoginStage('landing-fallback', { path: fallback });
  return fallback;
}

/**
 * Full post-login pipeline: verify session → profile → modules → safe path.
 */
export async function planPostLoginNavigation(session, quickProfile, options = {}) {
  if (!session?.access_token || !session?.user?.id) {
    logLoginStage('auth-failed', { reason: 'missing-session' });
    return {
      ok: false,
      error:
        'Sign in did not return a session. Confirm your email in Supabase Authentication or contact an administrator.',
    };
  }

  logLoginStage('auth-success', { userId: session.user.id, email: session.user.email });

  const { profile, source, warning, inactive, error: inactiveError } = await fetchLoginProfile(
    session,
    quickProfile,
    options
  );
  if (inactive || profile?.is_active === false) {
    logLoginStage('auth-inactive', { userId: session.user.id });
    return {
      ok: false,
      inactive: true,
      error: inactiveError || ACCOUNT_INACTIVE_MESSAGE,
      code: ACCOUNT_INACTIVE_CODE,
      profile,
    };
  }

  const mods = getAccessibleModules(profile);
  if (!mods.size) {
    logLoginStage('auth-no-modules', { userId: session.user.id });
    return {
      ok: false,
      inactive: true,
      error: ACCOUNT_INACTIVE_MESSAGE,
      code: ACCOUNT_INACTIVE_CODE,
      profile,
    };
  }

  const path = resolveSafeLandingPath(profile, mods);

  logLoginStage('redirect-planned', {
    path,
    profileSource: source,
    role: profile.role,
    team: profile.team,
    moduleKeys: [...mods],
  });

  if (!isPathAllowed(path, mods)) {
    logLoginStage('redirect-invalid', { path });
    return {
      ok: false,
      error:
        'Your account loaded but no valid module home was found. Ask an administrator to set your Team in User Management.',
    };
  }

  return { ok: true, path, profile, mods, warning };
}

/** Dev-only: warn when a TEAMS entry has no MODULE_LANDING_PATHS entry. */
export function validateTeamLandingPaths() {
  if (!import.meta.env.DEV) return;
  const missing = TEAMS.map((t) => t.value)
    .map((value) => ({ value, key: normalizeTeamModuleKey(value) }))
    .filter(({ key }) => !MODULE_LANDING_PATHS[key])
    .map(({ value }) => value);
  if (missing.length) {
    console.warn(LOGIN_LOG_PREFIX, 'teams-missing-landing-path', missing);
  }
}
