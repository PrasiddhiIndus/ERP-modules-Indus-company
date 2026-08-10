import React, { createContext, useContext, useEffect, useState, useRef, useMemo } from "react";
import { supabase, parseEdgeFunctionError, invokeAuthenticatedFunction } from "../lib/supabase";
import {
  getEmpCodeColumnSupported,
  isMissingProfileEmpCodeError,
  setEmpCodeColumnSupported,
  PROFILE_AUTH_SELECT,
  PROFILE_AUTH_SELECT_WITH_EMP,
  isMissingProfileAllowedSubModulesError,
  isMissingProfileModuleAccessPendingError,
  isMissingProfileIsActiveError,
} from "../lib/profileSelect";
import {
  clearSupabaseAuthStorage,
  clearSessionIfSupabaseProjectMismatch,
  isAuthCredentialError,
  isInvalidRefreshTokenError,
  isTransientAuthError,
  readCachedAccessToken,
  readCachedSessionUser,
  readCachedProfileRow,
  writeCachedProfileRow,
  clearCachedProfileRow,
  markSupabaseSessionHydrated,
  resetSupabaseSessionHydration,
  directSignInWithPassword,
  isCachedAccessTokenExpired,
  hydrateSupabaseAuthFromCache,
  ensureFreshCachedSession,
  hasCachedRefreshToken,
  readCachedAuthSession,
} from "../lib/authSessionUtils";
import { getAccessibleModules, getAccessibleSubModulePaths, getNavVisibleModuleKeys, normalizeAppRole, parseAllowedSubModules, ROLES } from "../config/roles";
import { logLoginStage } from "../lib/loginFlow";
import {
  ACCOUNT_INACTIVE_MESSAGE,
  isAuthBannedError,
} from "../lib/accountInactive";
import {
  isBillingVerticalSuperRole,
  listMyBillingVerticalGrants,
  profileHasBillingModuleAccess,
} from "../lib/billingVerticalAccess";

/** Build role/profile from auth user metadata — used for immediate post-login navigation. */
function buildAuthProfile(authUser) {
  if (!authUser) return null;
  const email = String(authUser.email || '').trim().toLowerCase();
  const meta = authUser.user_metadata || {};
  return {
    username: meta.username || meta.full_name || email.split('@')[0] || 'User',
    team: meta.team ?? null,
    role: normalizeAppRole(meta.role) || ROLES.EXECUTIVE,
    allowed_modules: Array.isArray(meta.allowed_modules) ? meta.allowed_modules : [],
    allowed_sub_modules: Array.isArray(meta.allowed_sub_modules) ? meta.allowed_sub_modules : [],
    module_access_pending: meta.module_access_pending === true,
    is_active: true,
  };
}

const PROFILE_FETCH_TIMEOUT_MS = 20000;
const PROFILE_SYNC_RETRIES = 3;

function withTimeout(promise, ms, label = 'Request') {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
    }),
  ]);
}

const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);

/** Restore user from localStorage synchronously — no network wait on first paint. */
function readInitialAuthUser() {
  if (typeof window === 'undefined') return null;
  if (clearSessionIfSupabaseProjectMismatch()) return null;
  const session = readCachedAuthSession();
  if (!session?.access_token && !session?.refresh_token) return null;
  if (isCachedAccessTokenExpired()) {
    // Keep identity while refresh_token can renew the JWT (async bootstrap refreshes).
    if (session?.refresh_token && session?.user) return session.user;
    clearSupabaseAuthStorage();
    return null;
  }
  return readCachedSessionUser();
}

function readInitialProfileRow() {
  const authUser = readInitialAuthUser();
  return authUser?.id ? readCachedProfileRow(authUser.id) : null;
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => readInitialAuthUser());
  const [profileRow, setProfileRow] = useState(() => readInitialProfileRow());
  const [billingVerticalCodes, setBillingVerticalCodes] = useState([]);
  const [billingVerticalGrantsReady, setBillingVerticalGrantsReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(() => {
    const authUser = readInitialAuthUser();
    if (!authUser?.id) return false;
    return !readCachedProfileRow(authUser.id);
  });
  const userRef = useRef(null);
  const profileSyncAttemptedRef = useRef(null);
  const signInProfileSyncRef = useRef(false);
  const profileFetchInFlightRef = useRef(null);
  const useProfilesTable = true;

  useEffect(() => {
    if (user?.id && useProfilesTable) {
      userRef.current = user.id;
    }
  }, []);

  // Restore React user from localStorage when JWT is valid but state was cleared (e.g. hydrate race).
  useEffect(() => {
    if (user?.id) return;
    const token = readCachedAccessToken();
    if (token && !isCachedAccessTokenExpired()) {
      const cachedUser = readCachedSessionUser();
      if (!cachedUser?.id) return;
      userRef.current = cachedUser.id;
      setUser(cachedUser);
      setProfileRow(readCachedProfileRow(cachedUser.id));
      logLoginStage('session-restored-from-cache', { userId: cachedUser.id });
      return;
    }
    // Expired access JWT with refresh token — restore after refresh (handled in bootstrap effect).
    if (!hasCachedRefreshToken()) return;
    const cachedUser = readCachedSessionUser();
    if (!cachedUser?.id) return;
    userRef.current = cachedUser.id;
    setUser(cachedUser);
    setProfileRow(readCachedProfileRow(cachedUser.id));
    logLoginStage('session-restored-pending-refresh', { userId: cachedUser.id });
  }, [user?.id]);

  useEffect(() => {
    const applySessionUser = (sessionUser) => {
      const newUser = sessionUser ?? null;
      const newUserId = newUser?.id ?? null;
      userRef.current = newUserId;
      setUser(newUser);
      setProfileRow(newUserId ? readCachedProfileRow(newUserId) : null);
      profileSyncAttemptedRef.current = null;
      if (newUserId && useProfilesTable) {
        // Profile sync is non-blocking; userProfile falls back to auth metadata.
      }
    };

    let cancelled = false;
    let refreshTimer = null;

    const refreshSessionInBackground = async () => {
      // On login page, still refresh when access JWT is expired/near-expiry so we can redirect.
      const onLoginPage =
        typeof window !== 'undefined' && window.location.pathname === '/';
      if (
        onLoginPage &&
        readCachedAccessToken() &&
        !isCachedAccessTokenExpired()
      ) {
        return;
      }
      try {
        const fresh = await ensureFreshCachedSession({ refreshIfWithinSeconds: 120 });
        if (cancelled) return;
        if (fresh?.user) {
          if (userRef.current !== fresh.user.id) {
            applySessionUser(fresh.user);
          } else if (!userRef.current) {
            applySessionUser(fresh.user);
          }
          void hydrateSupabaseAuthFromCache(supabase);
          return;
        }
        if (!readCachedAccessToken() && !hasCachedRefreshToken()) {
          userRef.current = null;
          setUser(null);
          setProfileRow(null);
        }
      } catch {
        // Non-blocking — cached session already shown or user on login page.
      }
    };

    void refreshSessionInBackground();
    // Proactively renew access JWT before expiry so long sessions stay signed in.
    refreshTimer = window.setInterval(() => {
      void ensureFreshCachedSession({ refreshIfWithinSeconds: 300 }).then((fresh) => {
        if (cancelled || !fresh?.user) return;
        if (userRef.current !== fresh.user.id) applySessionUser(fresh.user);
        void hydrateSupabaseAuthFromCache(supabase);
      });
    }, 60_000);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        // directSignInWithPassword persists JWT in localStorage before supabase-js hydrates;
        // ignore spurious SIGNED_OUT while a valid or refreshable cached session still exists.
        const token = readCachedAccessToken();
        if (token && !isCachedAccessTokenExpired()) {
          const cachedUser = readCachedSessionUser();
          if (cachedUser?.id) {
            userRef.current = cachedUser.id;
            setUser(cachedUser);
            setProfileRow(readCachedProfileRow(cachedUser.id));
            return;
          }
        }
        if (hasCachedRefreshToken()) {
          void ensureFreshCachedSession({ forceRefresh: true }).then((fresh) => {
            if (fresh?.user) {
              userRef.current = fresh.user.id;
              setUser(fresh.user);
              setProfileRow(readCachedProfileRow(fresh.user.id));
              return;
            }
            userRef.current = null;
            setUser(null);
            setProfileRow(null);
            clearCachedProfileRow();
            profileSyncAttemptedRef.current = null;
          });
          return;
        }
        userRef.current = null;
        setUser(null);
        setProfileRow(null);
        clearCachedProfileRow();
        profileSyncAttemptedRef.current = null;
        return;
      }

      if (event === 'TOKEN_REFRESHED' && session?.user) {
        applySessionUser(session.user);
        return;
      }

      const newUser = session?.user ?? null;
      if (!newUser) return;

      const newUserId = newUser.id;
      if (userRef.current !== newUserId) {
        userRef.current = newUserId;
        setUser(newUser);
        setProfileRow(readCachedProfileRow(newUserId));
        profileSyncAttemptedRef.current = null;
      }
    });

    return () => {
      cancelled = true;
      if (refreshTimer) window.clearInterval(refreshTimer);
      subscription.unsubscribe();
    };
  }, []);

  const STAGING_PROFILE_SQL_HINT =
    "Profile access blocked on staging DB. In Supabase SQL Editor run: supabase/staging_fix_403.sql (then refresh and sign in again).";

  const isProfileAccessDeniedError = (error) => {
    if (!error) return false;
    const code = String(error.code || "");
    const msg = String(error.message || "").toLowerCase();
    return (
      code === "42501" ||
      msg.includes("permission denied") ||
      msg.includes("row-level security") ||
      msg.includes("403")
    );
  };

  const ensureProfileFromAuthUser = async (authUser) => {
    if (!authUser?.id) return false;
    const readExisting = () =>
      supabase.from("profiles").select("id").eq("id", authUser.id).maybeSingle();
    const { data: existing } = await withTimeout(
      readExisting(),
      PROFILE_FETCH_TIMEOUT_MS,
      'Profile lookup'
    ).catch(() => ({ data: null }));
    if (existing?.id) return true;

    const meta = authUser.user_metadata || {};
    const allowed = meta.allowed_modules;
    const allowedSub = meta.allowed_sub_modules;
    const emailLocal = (authUser.email || "user@local").split("@")[0];
    const payload = {
      id: authUser.id,
      email: authUser.email ?? null,
      username: String(meta.username || meta.full_name || emailLocal).trim() || emailLocal,
      team: meta.team ?? null,
      role: meta.role || "executive",
      allowed_modules: Array.isArray(allowed) ? allowed : [],
      allowed_sub_modules: Array.isArray(allowedSub) ? allowedSub : [],
    };
    const insert = () => supabase.from("profiles").insert(payload);
    const { error } = await withTimeout(
      insert(),
      PROFILE_FETCH_TIMEOUT_MS,
      'Profile insert'
    ).catch((err) => ({ error: err }));
    if (error?.code === "23505") return true;
    return !error;
  };

  const fetchProfileFromTable = async (userId) => {
    const preferEmpCode = getEmpCodeColumnSupported() !== false;
    const selectCols = preferEmpCode ? PROFILE_AUTH_SELECT_WITH_EMP : PROFILE_AUTH_SELECT;
    let { data, error } = await supabase
      .from("profiles")
      .select(selectCols)
      .eq("id", userId)
      .maybeSingle();
    if (error && isMissingProfileIsActiveError(error)) {
      const withoutActive = preferEmpCode
        ? "id, email, username, employee_code, team, role, allowed_modules, allowed_sub_modules, module_access_pending"
        : "id, email, username, team, role, allowed_modules, allowed_sub_modules, module_access_pending";
      ({ data, error } = await supabase
        .from("profiles")
        .select(withoutActive)
        .eq("id", userId)
        .maybeSingle());
      if (data) data.is_active = true;
    }
    if (error && isMissingProfileModuleAccessPendingError(error)) {
      const withoutPending = preferEmpCode
        ? "id, email, username, employee_code, team, role, allowed_modules, allowed_sub_modules"
        : "id, email, username, team, role, allowed_modules, allowed_sub_modules";
      ({ data, error } = await supabase
        .from("profiles")
        .select(withoutPending)
        .eq("id", userId)
        .maybeSingle());
      if (data) data.module_access_pending = false;
    }
    if (error && isMissingProfileAllowedSubModulesError(error)) {
      const legacyCols = preferEmpCode
        ? "id, email, username, employee_code, team, role, allowed_modules"
        : "id, email, username, team, role, allowed_modules";
      ({ data, error } = await supabase
        .from("profiles")
        .select(legacyCols)
        .eq("id", userId)
        .maybeSingle());
      if (data) {
        data.allowed_sub_modules = [];
        data.module_access_pending = false;
      }
    }
    if (error && preferEmpCode && isMissingProfileEmpCodeError(error)) {
      setEmpCodeColumnSupported(false);
      ({ data, error } = await supabase
        .from("profiles")
        .select(PROFILE_AUTH_SELECT)
        .eq("id", userId)
        .maybeSingle());
      if (data && !Array.isArray(data.allowed_sub_modules)) data.allowed_sub_modules = [];
    } else if (!error && preferEmpCode) {
      setEmpCodeColumnSupported(true);
    }
    if (error) {
      return {
        ok: false,
        message: isProfileAccessDeniedError(error) ? STAGING_PROFILE_SQL_HINT : error.message,
      };
    }
    if (!data?.id) return { ok: false };
    setProfileRow(data);
    writeCachedProfileRow(data);
    return { ok: true, profile: data };
  };

  const fetchProfileViaLoginCheck = async (accessToken, userId, authUser = null, opts = {}) => {
    const { background = false } = opts;
    const uid = userId || user?.id;
    if (!uid) return { ok: false };
    if (profileFetchInFlightRef.current === uid) {
      return { ok: false, message: "Profile sync in progress." };
    }
    profileFetchInFlightRef.current = uid;
    try {
      let tableFirst;
      try {
        tableFirst = await withTimeout(
          fetchProfileFromTable(uid),
          PROFILE_FETCH_TIMEOUT_MS,
          'Profile read'
        );
      } catch (err) {
        tableFirst = {
          ok: false,
          message: String(err?.message || err).includes('timed out')
            ? 'Profile read timed out. Check profiles table RLS in Supabase (run production_login_fix.sql).'
            : String(err?.message || err),
        };
      }
      if (tableFirst.ok) return tableFirst;

      let userForProfile = authUser;
      if (!userForProfile) {
        try {
          const { data: userData } = await withTimeout(
            supabase.auth.getUser(),
            PROFILE_FETCH_TIMEOUT_MS,
            'Auth user'
          );
          userForProfile = userData?.user ?? null;
        } catch {
          userForProfile = null;
        }
      }
      if (userForProfile?.id === uid) {
        await ensureProfileFromAuthUser(userForProfile);
        let afterUpsert;
        try {
          afterUpsert = await withTimeout(
            fetchProfileFromTable(uid),
            PROFILE_FETCH_TIMEOUT_MS,
            'Profile read'
          );
        } catch (err) {
          afterUpsert = { ok: false, message: String(err?.message || err) };
        }
        if (afterUpsert.ok) return afterUpsert;
        if (afterUpsert.message) return afterUpsert;
      } else if (tableFirst.message) {
        return { ok: false, message: tableFirst.message };
      }

      const run = (token) =>
        invokeAuthenticatedFunction("login-check", { body: {} }, token || accessToken);

      let data;
      let error;
      try {
        ({ data, error } = await withTimeout(
          run(accessToken),
          PROFILE_FETCH_TIMEOUT_MS,
          'login-check'
        ));
      } catch (err) {
        error = { message: String(err?.message || err) };
        data = null;
      }
      if (error) {
        const msg = await parseEdgeFunctionError(error, data);
        if (
          data?.code === "account_inactive" ||
          /inactive/i.test(String(data?.error || msg || ""))
        ) {
          setProfileRow((prev) => ({
            ...(prev?.id === uid ? prev : { id: uid }),
            is_active: false,
          }));
          return { ok: false, inactive: true, message: ACCOUNT_INACTIVE_MESSAGE };
        }
        const retryable =
          msg === "Invalid token" ||
          msg.includes("Missing Authorization") ||
          msg === "Not signed in";
        if (retryable && accessToken) {
          await new Promise((r) => setTimeout(r, 300));
          try {
            ({ data, error } = await withTimeout(
              run(accessToken),
              PROFILE_FETCH_TIMEOUT_MS,
              'login-check'
            ));
          } catch (err) {
            error = { message: String(err?.message || err) };
            data = null;
          }
        }
        if (error) {
          let tableFallback;
          try {
            tableFallback = await withTimeout(
              fetchProfileFromTable(uid),
              PROFILE_FETCH_TIMEOUT_MS,
              'Profile read'
            );
          } catch (err) {
            tableFallback = { ok: false, message: String(err?.message || err) };
          }
          if (tableFallback.ok) return tableFallback;
          const msg2 = await parseEdgeFunctionError(error, data);
          return { ok: false, message: msg2 };
        }
      }
      if (!data?.ok || !data?.profile?.id) {
        let tableFallback;
        try {
          tableFallback = await withTimeout(
            fetchProfileFromTable(uid),
            PROFILE_FETCH_TIMEOUT_MS,
            'Profile read'
          );
        } catch (err) {
          tableFallback = { ok: false, message: String(err?.message || err) };
        }
        if (tableFallback.ok) return tableFallback;
        return { ok: false, message: data?.error || "Could not load profile." };
      }
      setProfileRow(data.profile);
      writeCachedProfileRow(data.profile);
      return { ok: true, profile: data.profile };
    } finally {
      if (profileFetchInFlightRef.current === uid) {
        profileFetchInFlightRef.current = null;
      }
      setProfileLoading(false);
    }
  };

  const syncProfileInBackground = (accessToken, userId, authUser = null) => {
    if (!userId || !accessToken) return;
    setProfileLoading(true);
    void (async () => {
      for (let attempt = 1; attempt <= PROFILE_SYNC_RETRIES; attempt += 1) {
        setProfileLoading(true);
        const result = await fetchProfileViaLoginCheck(accessToken, userId, authUser, {
          background: true,
        });
        if (result.ok) return;
        if (attempt < PROFILE_SYNC_RETRIES) {
          await new Promise((r) => setTimeout(r, 400 * attempt));
        }
      }
      if (!readCachedProfileRow(userId)) {
        const meta = authUser?.user_metadata || {};
        const fallbackRow = {
          id: userId,
          email: authUser?.email ?? null,
          username: meta.username || meta.full_name || authUser?.email?.split("@")[0] || "User",
          team: meta.team ?? null,
          role: meta.role ?? null,
          allowed_modules: Array.isArray(meta.allowed_modules) ? meta.allowed_modules : [],
          allowed_sub_modules: Array.isArray(meta.allowed_sub_modules) ? meta.allowed_sub_modules : [],
        };
        writeCachedProfileRow(fallbackRow);
        setProfileRow(fallbackRow);
      }
      setProfileLoading(false);
    })();
  };

  useEffect(() => {
    if (!user?.id) {
      setProfileRow(null);
      clearCachedProfileRow();
      setProfileLoading(false);
      return;
    }
    if (profileRow?.id === user.id) {
      setProfileLoading(false);
      return;
    }
    if (signInProfileSyncRef.current) return;
    profileSyncAttemptedRef.current = user.id;
    const token = readCachedAccessToken();
    if (!token) return;
    setProfileLoading(true);
    syncProfileInBackground(token, user.id, user);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, profileRow?.id]);

  // Register user + save role-based profile (username, team, role, allowed_modules for manager)
  const signUpWithProfile = async (email, password, profileData) => {
    const safeRole = profileData?.role || 'executive';
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/login`,
        data: {
          full_name: profileData?.username ?? "",
          phone: profileData?.phone ?? "",
          company: profileData?.company ?? "",
          team: profileData?.team ?? null,
          role: safeRole,
          allowed_modules: profileData?.allowed_modules ?? [],
        },
      },
    });

    if (error) return { error };

    if (data?.user && useProfilesTable) {
      await ensureProfileFromAuthUser({
        ...data.user,
        user_metadata: {
          ...(data.user.user_metadata || {}),
          username: profileData?.username ?? "",
          team: profileData?.team ?? null,
          role: safeRole,
          allowed_modules: profileData?.allowed_modules ?? [],
        },
      });
    }
    return { data, error: null };
  };

  const resendConfirmation = async (email) => {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email,
      options: {
        emailRedirectTo: `${window.location.origin}/login`
      }
    });
    return { error };
  };

  const requestPasswordReset = async (email) => {
    const normEmail = String(email || '').trim().toLowerCase();
    const { error } = await supabase.auth.resetPasswordForEmail(normEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    return { error };
  };

  const completePasswordReset = async (password) => {
    const { data, error } = await supabase.auth.updateUser({ password });
    return { data, error };
  };

  const signIn = async (email, password) => {
    const normEmail = String(email || "").trim().toLowerCase();
    resetSupabaseSessionHydration();
    signInProfileSyncRef.current = true;
    let profileSyncStarted = false;
    try {
      // Direct GoTrue REST login — avoids supabase-js auth lock hang on production.
      const result = await directSignInWithPassword(normEmail, password);

      if (result?.error) {
        const msg = result.error.message || '';
        if (isAuthBannedError(result.error)) {
          return {
            data: { session: null, user: null },
            error: { message: ACCOUNT_INACTIVE_MESSAGE, code: 'account_inactive' },
          };
        }
        if (isTransientAuthError(msg) || msg.toLowerCase().includes('abort')) {
          return {
            data: { session: null, user: null },
            error: {
              message:
                'Login timed out or network failed. Check internet/VPN, confirm Supabase production project is active, then try again.',
            },
          };
        }
        return result;
      }

      const authUser = result?.data?.user;
      const session = result?.data?.session;
      if (!authUser?.id || !session) {
        return {
          data: { session: null, user: null },
          error: { message: 'Sign in did not return a session. Confirm email in Supabase or contact admin.' },
        };
      }

      profileSyncAttemptedRef.current = authUser.id;
      userRef.current = authUser.id;
      setUser(authUser);
      markSupabaseSessionHydrated();
      logLoginStage('session-stored', {
        userId: authUser.id,
        expiresAt: session.expires_at,
      });

      // Sync supabase-js in-memory session (best-effort, capped) so auto-refresh does not
      // emit SIGNED_OUT and wipe the user before ProtectedRoute renders.
      try {
        const hydrated = await Promise.race([
          hydrateSupabaseAuthFromCache(supabase),
          new Promise((resolve) => setTimeout(() => resolve(false), 4000)),
        ]);
        logLoginStage('session-hydrate', { ok: Boolean(hydrated) });
      } catch {
        logLoginStage('session-hydrate', { ok: false, reason: 'exception' });
      }

      const quickProfile = buildAuthProfile(authUser);

      profileSyncStarted = true;
      void (async () => {
        try {
          await ensureProfileFromAuthUser(authUser);
          syncProfileInBackground(session.access_token, authUser.id, authUser);
        } catch (err) {
          console.warn('Background profile sync after login:', err?.message || err);
        } finally {
          signInProfileSyncRef.current = false;
        }
      })();

      return { ...result, profile: quickProfile };
    } catch (err) {
      const msg = err?.message || String(err);
      const isNetwork = msg.includes('Failed to fetch') || msg.includes('Cannot reach Supabase') || msg.includes('timed out') || msg.includes('NetworkError') || msg.includes('abort');
      return {
        data: { session: null, user: null },
        error: {
          message: isNetwork
            ? 'Cannot reach Supabase. Check internet/VPN, confirm the production project is active in Supabase Dashboard, then try again.'
            : msg,
        },
      };
    } finally {
      if (!profileSyncStarted) signInProfileSyncRef.current = false;
    }
  };

  /** Verify 6-digit email OTP (for "Confirm Your Signup" flow). */
  const verifyEmailOtp = async (email, token) => {
    return await supabase.auth.verifyOtp({ email, token: token.trim(), type: "email" });
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      clearSupabaseAuthStorage();
      clearCachedProfileRow();
      userRef.current = null;
      setUser(null);
      setProfileRow(null);
      setBillingVerticalCodes([]);
      setBillingVerticalGrantsReady(false);
      return { error: null };
    } catch (err) {
      clearSupabaseAuthStorage();
      clearCachedProfileRow();
      userRef.current = null;
      setUser(null);
      setProfileRow(null);
      setBillingVerticalCodes([]);
      setBillingVerticalGrantsReady(false);
      return { error: err };
    }
  };

  /** Apply sessionStorage profile cache to React state (after login-check). */
  const applyCachedProfile = (userId = user?.id) => {
    const uid = userId || userRef.current;
    if (!uid) return;
    const row = readCachedProfileRow(uid);
    if (row) {
      setProfileRow(row);
      setProfileLoading(false);
    }
  };

  /** Apply authorization profile immediately after login (before navigation). */
  const applyLoginProfile = (profile, userId = user?.id) => {
    const uid = userId || userRef.current;
    if (!uid || !profile) return;
    const cached = readCachedProfileRow(uid);
    const meta = user?.user_metadata || {};
    const row = {
      id: uid,
      email: cached?.email ?? user?.email ?? null,
      username:
        cached?.username ??
        profile.username ??
        meta.username ??
        meta.full_name ??
        user?.email?.split("@")[0] ??
        "User",
      team: profile.team ?? cached?.team ?? meta.team ?? null,
      role: profile.role ?? cached?.role ?? normalizeAppRole(meta.role) ?? null,
      allowed_modules: Array.isArray(profile.allowed_modules)
        ? profile.allowed_modules
        : Array.isArray(cached?.allowed_modules)
          ? cached.allowed_modules
          : Array.isArray(meta.allowed_modules)
            ? meta.allowed_modules
            : [],
      allowed_sub_modules: Array.isArray(profile.allowed_sub_modules)
        ? profile.allowed_sub_modules
        : Array.isArray(cached?.allowed_sub_modules)
          ? cached.allowed_sub_modules
          : Array.isArray(meta.allowed_sub_modules)
            ? meta.allowed_sub_modules
            : [],
      module_access_pending:
        profile.module_access_pending === true ||
        cached?.module_access_pending === true ||
        meta.module_access_pending === true,
      is_active: profile.is_active === false || cached?.is_active === false ? false : true,
    };
    writeCachedProfileRow(row);
    setProfileRow(row);
    setProfileLoading(false);
  };

  const clearInvalidSession = async () => {
    try {
      await supabase.auth.signOut();
      clearSupabaseAuthStorage();
      clearCachedProfileRow();
      userRef.current = null;
      setUser(null);
      setProfileRow(null);
      return { error: null };
    } catch (err) {
      clearSupabaseAuthStorage();
      clearCachedProfileRow();
      userRef.current = null;
      setUser(null);
      setProfileRow(null);
      return { error: err };
    }
  };

  const permissionsReady = useMemo(() => {
    if (!user?.id) return true;
    return profileRow?.id === user.id;
  }, [user?.id, profileRow?.id]);

  const userProfile = useMemo(() => {
    if (!user?.id || !permissionsReady || !profileRow) return null;

    return {
      username: profileRow.username ?? user?.email?.split('@')[0],
      team: profileRow.team ?? null,
      role: normalizeAppRole(profileRow.role),
      allowed_modules: Array.isArray(profileRow.allowed_modules) ? profileRow.allowed_modules : [],
      allowed_sub_modules: (() => {
        const fromRow = parseAllowedSubModules(profileRow.allowed_sub_modules);
        if (fromRow.length) return fromRow;
        return parseAllowedSubModules(user?.user_metadata?.allowed_sub_modules);
      })(),
      module_access_pending:
        profileRow.module_access_pending === true ||
        user?.user_metadata?.module_access_pending === true,
      is_active: profileRow.is_active !== false,
      billing_vertical_codes: billingVerticalCodes,
      billing_vertical_grants_ready: billingVerticalGrantsReady,
    };
  }, [user, profileRow, permissionsReady, billingVerticalCodes, billingVerticalGrantsReady]);

  // Mid-session cut-off: profile refresh with is_active=false forces sign-out.
  useEffect(() => {
    if (!user?.id || !profileRow?.id) return;
    if (profileRow.is_active !== false) return;
    logLoginStage('session-inactive-signout', { userId: user.id });
    void (async () => {
      try {
        await supabase.auth.signOut();
      } catch {
        /* ignore */
      }
      clearSupabaseAuthStorage();
      clearCachedProfileRow();
      userRef.current = null;
      setUser(null);
      setProfileRow(null);
    })();
  }, [user?.id, profileRow?.id, profileRow?.is_active]);

  // Load billing vertical grants for the signed-in user (same table RLS/RPC uses).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user?.id || !permissionsReady || !profileRow) {
        setBillingVerticalCodes([]);
        setBillingVerticalGrantsReady(false);
        return;
      }
      const role = normalizeAppRole(profileRow.role);
      if (isBillingVerticalSuperRole(role)) {
        if (!cancelled) {
          setBillingVerticalCodes([]);
          setBillingVerticalGrantsReady(true);
        }
        return;
      }
      const profileForBilling = {
        team: profileRow.team,
        allowed_modules: profileRow.allowed_modules,
        allowed_sub_modules: profileRow.allowed_sub_modules,
      };
      if (!profileHasBillingModuleAccess(profileForBilling)) {
        if (!cancelled) {
          setBillingVerticalCodes([]);
          setBillingVerticalGrantsReady(true);
        }
        return;
      }
      try {
        const grants = await listMyBillingVerticalGrants();
        if (!cancelled) {
          setBillingVerticalCodes((grants || []).map((g) => g.code).filter(Boolean));
          setBillingVerticalGrantsReady(true);
        }
      } catch (err) {
        console.warn('Failed to load billing vertical grants', err);
        if (!cancelled) {
          setBillingVerticalCodes([]);
          setBillingVerticalGrantsReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    user?.id,
    permissionsReady,
    profileRow?.id,
    profileRow?.role,
    profileRow?.team,
    profileRow?.allowed_modules,
    profileRow?.allowed_sub_modules,
  ]);

  const accessibleModules = useMemo(
    () => (userProfile ? getAccessibleModules(userProfile) : new Set()),
    [userProfile]
  );

  const subModulePaths = useMemo(
    () => (userProfile ? getAccessibleSubModulePaths(userProfile, user?.user_metadata) : new Set()),
    [userProfile, user?.user_metadata]
  );

  const navVisibleModules = useMemo(
    () => (userProfile ? getNavVisibleModuleKeys(userProfile, accessibleModules, user?.user_metadata) : new Set()),
    [userProfile, accessibleModules, user?.user_metadata]
  );

  // Best-effort: if this user is force-super-admin (by email), keep `profiles.role`
  // in sync so server-side RBAC (Edge Functions / SQL helpers) sees the same role.
  useEffect(() => {
    if (!useProfilesTable) return;
    if (!user?.id) return;
    if (!userProfile?.role) return;
    if (userProfile.role !== 'super_admin' && userProfile.role !== 'super_admin_pro') return;
    if (!profileRow) return;
    if (profileRow.role === userProfile.role) return;
    let cancelled = false;
    (async () => {
      try {
        await supabase.from('profiles').update({ role: userProfile.role }).eq('id', user.id);
      } catch (_) {
        // If RLS blocks this, ignore; UI will still work.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [useProfilesTable, user?.id, userProfile?.role, profileRow?.role]);

  useEffect(() => {
    if (!profileLoading || permissionsReady) return undefined;
    const t = setTimeout(() => {
      if (!user?.id || profileRow?.id === user.id) {
        setProfileLoading(false);
        return;
      }
      const meta = user.user_metadata || {};
      const fallbackRow = {
        id: user.id,
        email: user.email ?? null,
        username: meta.username || meta.full_name || user.email?.split("@")[0] || "User",
        team: meta.team ?? null,
        role: meta.role ?? null,
        allowed_modules: Array.isArray(meta.allowed_modules) ? meta.allowed_modules : [],
        allowed_sub_modules: Array.isArray(meta.allowed_sub_modules) ? meta.allowed_sub_modules : [],
      };
      writeCachedProfileRow(fallbackRow);
      setProfileRow(fallbackRow);
      setProfileLoading(false);
    }, PROFILE_FETCH_TIMEOUT_MS + 3000);
    return () => clearTimeout(t);
  }, [profileLoading, permissionsReady, user, profileRow?.id]);

  return (
    <AuthContext.Provider value={{ user, loading, profileLoading, permissionsReady, userProfile, accessibleModules, subModulePaths, navVisibleModules, billingVerticalCodes, billingVerticalGrantsReady, signIn, signOut, signUpWithProfile, resendConfirmation, requestPasswordReset, completePasswordReset, clearInvalidSession, verifyEmailOtp, applyCachedProfile, applyLoginProfile }}>
      {children}
    </AuthContext.Provider>
  );
};
