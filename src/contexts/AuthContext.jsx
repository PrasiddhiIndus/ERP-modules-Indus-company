import React, { createContext, useContext, useEffect, useState, useRef, useMemo } from "react";
import { supabase, parseEdgeFunctionError, invokeAuthenticatedFunction } from "../lib/supabase";
import {
  getEmpCodeColumnSupported,
  isMissingProfileEmpCodeError,
  setEmpCodeColumnSupported,
  PROFILE_AUTH_SELECT,
  PROFILE_AUTH_SELECT_WITH_EMP,
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
} from "../lib/authSessionUtils";
import { getAccessibleModules, normalizeAppRole, ROLES } from "../config/roles";
import { logLoginStage } from "../lib/loginFlow";

/** Build role/profile from auth user metadata — used for immediate post-login navigation. */
function buildAuthProfile(authUser) {
  if (!authUser) return null;
  const email = String(authUser.email || '').trim().toLowerCase();
  const meta = authUser.user_metadata || {};
  const superAdminEmailsRaw = String(import.meta.env.VITE_SUPER_ADMIN_EMAILS || '').trim();
  const superAdminEmails = superAdminEmailsRaw
    ? superAdminEmailsRaw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    : [];
  const forcedRole =
    email === 'rahul.ifspl@gmail.com'
      ? 'super_admin_pro'
      : superAdminEmails.includes(email)
        ? 'super_admin'
        : null;
  return {
    username: meta.username || meta.full_name || email.split('@')[0] || 'User',
    team: meta.team ?? null,
    role: normalizeAppRole(forcedRole || meta.role || null),
    allowed_modules: Array.isArray(meta.allowed_modules) ? meta.allowed_modules : [],
    module_access_pending: meta.module_access_pending === true,
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
  const token = readCachedAccessToken();
  if (!token) return null;
  if (isCachedAccessTokenExpired()) {
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
  const [loading, setLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
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
    if (!token || isCachedAccessTokenExpired()) return;
    const cachedUser = readCachedSessionUser();
    if (!cachedUser?.id) return;
    userRef.current = cachedUser.id;
    setUser(cachedUser);
    setProfileRow(readCachedProfileRow(cachedUser.id));
    logLoginStage('session-restored-from-cache', { userId: cachedUser.id });
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

    const refreshSessionInBackground = async () => {
      if (typeof window !== 'undefined' && window.location.pathname === '/') return;
      if (!readCachedAccessToken() || isCachedAccessTokenExpired()) return;
      try {
        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('getSession timed out')), 8000);
        });
        const { data: { session }, error } = await Promise.race([sessionPromise, timeoutPromise]);
        if (error) {
          if (isInvalidRefreshTokenError(error.message)) {
            // Keep direct-REST sessions when localStorage JWT is still valid.
            if (readCachedAccessToken() && !isCachedAccessTokenExpired()) {
              const cachedUser = readCachedSessionUser();
              if (cachedUser?.id) {
                userRef.current = cachedUser.id;
                setUser((prev) => prev ?? cachedUser);
                return;
              }
            }
            clearSupabaseAuthStorage();
            userRef.current = null;
            setUser(null);
          }
          return;
        }
        if (session?.user && userRef.current !== session.user.id) {
          applySessionUser(session.user);
        }
      } catch {
        // Non-blocking — cached session already shown or user on login page.
      }
    };

    void refreshSessionInBackground();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        // directSignInWithPassword persists JWT in localStorage before supabase-js hydrates;
        // ignore spurious SIGNED_OUT while a valid cached session still exists.
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
        userRef.current = null;
        setUser(null);
        setProfileRow(null);
        clearCachedProfileRow();
        profileSyncAttemptedRef.current = null;
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

    return () => subscription.unsubscribe();
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
    const emailLocal = (authUser.email || "user@local").split("@")[0];
    const payload = {
      id: authUser.id,
      email: authUser.email ?? null,
      username: String(meta.username || meta.full_name || emailLocal).trim() || emailLocal,
      team: meta.team ?? null,
      role: meta.role || "executive",
      allowed_modules: Array.isArray(allowed) ? allowed : [],
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
    if (error && preferEmpCode && isMissingProfileEmpCodeError(error)) {
      setEmpCodeColumnSupported(false);
      ({ data, error } = await supabase
        .from("profiles")
        .select(PROFILE_AUTH_SELECT)
        .eq("id", userId)
        .maybeSingle());
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
    void (async () => {
      for (let attempt = 1; attempt <= PROFILE_SYNC_RETRIES; attempt += 1) {
        const result = await fetchProfileViaLoginCheck(accessToken, userId, authUser, {
          background: true,
        });
        if (result.ok) return;
        if (attempt < PROFILE_SYNC_RETRIES) {
          await new Promise((r) => setTimeout(r, 400 * attempt));
        }
      }
    })();
  };

  useEffect(() => {
    if (!user?.id) {
      setProfileRow(null);
      clearCachedProfileRow();
      setProfileLoading(false);
      return;
    }
    if (signInProfileSyncRef.current) return;
    profileSyncAttemptedRef.current = user.id;
    const token = readCachedAccessToken();
    if (!token) return;
    syncProfileInBackground(token, user.id, user);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Register user + save role-based profile (username, team, role, allowed_modules for manager)
  const signUpWithProfile = async (email, password, profileData) => {
    const normEmail = String(email || '').trim().toLowerCase();
    const forcedRole = normEmail === 'rahul.ifspl@gmail.com' ? 'super_admin_pro' : null;
    const safeRole = forcedRole || profileData?.role || "executive";
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

  /** Apply sessionStorage profile cache to React state (after login-check). */
  const applyCachedProfile = (userId = user?.id) => {
    const uid = userId || userRef.current;
    if (!uid) return;
    const row = readCachedProfileRow(uid);
    if (row) setProfileRow(row);
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

  const userProfile = useMemo(() => {
    if (!user) return null;
    const email = String(user?.email || '').trim().toLowerCase();
    const isSuperAdminPro = email === 'rahul.ifspl@gmail.com';
    const superAdminEmailsRaw = String(import.meta.env.VITE_SUPER_ADMIN_EMAILS || '').trim();
    const superAdminEmails = superAdminEmailsRaw
      ? superAdminEmailsRaw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
      : [];
    const forcedSuperRole = isSuperAdminPro
      ? 'super_admin_pro'
      : (superAdminEmails.includes(email) ? 'super_admin' : null);

    if (profileRow) {
      const dbRole = normalizeAppRole(profileRow.role);
      const effectiveRole =
        forcedSuperRole && dbRole !== ROLES.SUPER_ADMIN && dbRole !== ROLES.SUPER_ADMIN_PRO
          ? forcedSuperRole
          : (dbRole ?? forcedSuperRole);
      return {
        username: profileRow.username ?? user?.email?.split("@")[0],
        team: profileRow.team ?? null,
        role: effectiveRole,
        allowed_modules: Array.isArray(profileRow.allowed_modules) ? profileRow.allowed_modules : [],
        module_access_pending: user?.user_metadata?.module_access_pending === true,
      };
    }

    return buildAuthProfile(user);
  }, [user, profileRow]);

  const accessibleModules = useMemo(
    () => (userProfile ? getAccessibleModules(userProfile) : new Set()),
    [userProfile]
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
    if (!profileLoading) return undefined;
    const t = setTimeout(() => setProfileLoading(false), PROFILE_FETCH_TIMEOUT_MS + 3000);
    return () => clearTimeout(t);
  }, [profileLoading]);

  return (
    <AuthContext.Provider value={{ user, loading, profileLoading, userProfile, accessibleModules, signIn, signOut, signUpWithProfile, resendConfirmation, requestPasswordReset, completePasswordReset, clearInvalidSession, verifyEmailOtp, applyCachedProfile }}>
      {children}
    </AuthContext.Provider>
  );
};
