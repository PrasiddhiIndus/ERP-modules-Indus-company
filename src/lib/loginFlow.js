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
  ROLES,
  normalizeAppRole,
  MODULE_LANDING_PATHS,
  TEAMS,
} from '../config/roles';
import { invokeAuthenticatedFunction } from './supabase';
import { writeCachedProfileRow } from './authSessionUtils';

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
  const meta = session?.user?.user_metadata || {};
  const row = quickProfile;
  return normalizeAccessProfile({
    role: row?.role ?? meta.role ?? null,
    team: row?.team ?? meta.team ?? null,
    allowed_modules: Array.isArray(row?.allowed_modules)
      ? row.allowed_modules
      : Array.isArray(meta.allowed_modules)
        ? meta.allowed_modules
        : [],
  });
}

function cacheProfileSnapshot(session, profile) {
  if (!session?.user?.id) return;
  const meta = session.user.user_metadata || {};
  writeCachedProfileRow({
    id: session.user.id,
    email: session.user.email,
    username: meta.username || meta.full_name || session.user.email?.split('@')[0],
    team: profile.team,
    role: profile.role,
    allowed_modules: profile.allowed_modules,
  });
}

/**
 * Load authorization profile: login-check (preferred) → auth metadata fallback.
 * Never throws; returns { profile, source, warning }.
 */
export async function fetchLoginProfile(session, quickProfile, { timeoutMs = 8000 } = {}) {
  const fallback = buildProfileFromSession(session, quickProfile);
  const accessToken = session?.access_token;
  if (!accessToken) {
    logLoginStage('profile-skipped', { reason: 'no-access-token' });
    return { profile: fallback, source: 'metadata', warning: null };
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
      cacheProfileSnapshot(session, fallback);
      return {
        profile: fallback,
        source: 'metadata-timeout',
        warning: 'Profile sync timed out; using account metadata. Sidebar may update in a moment.',
      };
    }

    const { data: chk, error } = result;
    if (error) {
      logLoginStage('profile-fetch-error', { message: error?.message || String(error) });
      cacheProfileSnapshot(session, fallback);
      return {
        profile: fallback,
        source: 'metadata-after-error',
        warning: null,
      };
    }

    if (chk?.ok && chk?.profile) {
      writeCachedProfileRow(chk.profile);
      const profile = normalizeAccessProfile({
        role: chk.profile.role,
        team: chk.profile.team ?? null,
        allowed_modules: chk.profile.allowed_modules,
      });
      logLoginStage('profile-loaded', {
        source: 'login-check',
        role: profile.role,
        team: profile.team,
        modules: profile.allowed_modules,
      });
      return { profile, source: 'login-check', warning: null };
    }

    logLoginStage('profile-fetch-empty', { chk });
    cacheProfileSnapshot(session, fallback);
    return { profile: fallback, source: 'metadata', warning: null };
  } catch (err) {
    logLoginStage('profile-fetch-exception', { message: err?.message || String(err) });
    cacheProfileSnapshot(session, fallback);
    return { profile: fallback, source: 'metadata-exception', warning: null };
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

  const teamKey = normalizeTeamModuleKey(userProfile?.team);
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

  const { profile, source, warning } = await fetchLoginProfile(session, quickProfile, options);
  const mods = getAccessibleModules(profile);
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
