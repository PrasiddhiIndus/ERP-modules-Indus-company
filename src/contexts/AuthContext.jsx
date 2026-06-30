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
  isCachedAccessTokenExpired,
} from "../lib/authSessionUtils";
import { getAccessibleModules } from "../config/roles";

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
    role: forcedRole || meta.role || 'executive',
    allowed_modules: Array.isArray(meta.allowed_modules) ? meta.allowed_modules : [],
  };
}

const SIGN_IN_TIMEOUT_MS = 20000;

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

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => readInitialAuthUser());
  const [profileRow, setProfileRow] = useState(null);
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

  useEffect(() => {
    const applySessionUser = (sessionUser) => {
      const newUser = sessionUser ?? null;
      const newUserId = newUser?.id ?? null;
      userRef.current = newUserId;
      setUser(newUser);
      setProfileRow(null);
      profileSyncAttemptedRef.current = null;
      if (newUserId && useProfilesTable) setProfileLoading(true);
    };

    const refreshSessionInBackground = async () => {
      if (!readCachedAccessToken() || isCachedAccessTokenExpired()) return;
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          if (isInvalidRefreshTokenError(error.message)) {
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
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        userRef.current = null;
        setUser(null);
        setProfileRow(null);
        profileSyncAttemptedRef.current = null;
        return;
      }

      const newUser = session?.user ?? null;
      if (!newUser) return;

      const newUserId = newUser.id;
      if (userRef.current !== newUserId) {
        userRef.current = newUserId;
        setUser(newUser);
        setProfileRow(null);
        profileSyncAttemptedRef.current = null;
        if (useProfilesTable && !signInProfileSyncRef.current) {
          setProfileLoading(true);
        }
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
    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", authUser.id)
      .maybeSingle();
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
    const { error } = await supabase.from("profiles").insert(payload);
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
    return { ok: true, profile: data };
  };

  const fetchProfileViaLoginCheck = async (accessToken, userId, authUser = null) => {
    const uid = userId || user?.id;
    if (!uid) return { ok: false };
    if (profileFetchInFlightRef.current === uid) {
      return { ok: false, message: "Profile sync in progress." };
    }
    profileFetchInFlightRef.current = uid;
    setProfileLoading(true);
    try {
      const tableFirst = await fetchProfileFromTable(uid);
      if (tableFirst.ok) return tableFirst;

      let userForProfile = authUser;
      if (!userForProfile) {
        const { data: userData } = await supabase.auth.getUser();
        userForProfile = userData?.user ?? null;
      }
      if (userForProfile?.id === uid) {
        await ensureProfileFromAuthUser(userForProfile);
        const afterUpsert = await fetchProfileFromTable(uid);
        if (afterUpsert.ok) return afterUpsert;
        if (afterUpsert.message) return afterUpsert;
      } else if (tableFirst.message) {
        return { ok: false, message: tableFirst.message };
      }

      const run = (token) =>
        invokeAuthenticatedFunction("login-check", { body: {} }, token || accessToken);

      let { data, error } = await run(accessToken);
      if (error) {
        const msg = await parseEdgeFunctionError(error, data);
        const retryable =
          msg === "Invalid token" ||
          msg.includes("Missing Authorization") ||
          msg === "Not signed in";
        if (retryable && accessToken) {
          await new Promise((r) => setTimeout(r, 300));
          ({ data, error } = await run(accessToken));
        }
        if (error) {
          const tableFallback = await fetchProfileFromTable(uid);
          if (tableFallback.ok) return tableFallback;
          const msg2 = await parseEdgeFunctionError(error, data);
          return { ok: false, message: msg2 };
        }
      }
      if (!data?.ok || !data?.profile?.id) {
        const tableFallback = await fetchProfileFromTable(uid);
        if (tableFallback.ok) return tableFallback;
        return { ok: false, message: data?.error || "Could not load profile." };
      }
      setProfileRow(data.profile);
      return { ok: true, profile: data.profile };
    } finally {
      if (profileFetchInFlightRef.current === uid) {
        profileFetchInFlightRef.current = null;
      }
      setProfileLoading(false);
    }
  };

  useEffect(() => {
    if (!user?.id) {
      setProfileRow(null);
      setProfileLoading(false);
      return;
    }
    if (signInProfileSyncRef.current) return;
    if (profileSyncAttemptedRef.current === user.id) return;
    profileSyncAttemptedRef.current = user.id;
    void (async () => {
      const token = readCachedAccessToken();
      if (!token) return;
      await new Promise((r) => setTimeout(r, 150));
      await fetchProfileViaLoginCheck(token, user.id);
    })();
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
  }

  const signIn = async (email, password) => {
    const normEmail = String(email || "").trim().toLowerCase();
    setLoading(true);
    try {
      const result = await Promise.race([
        supabase.auth.signInWithPassword({ email: normEmail, password }),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Login timed out')), SIGN_IN_TIMEOUT_MS);
        }),
      ]);

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

      const quickProfile = buildAuthProfile(authUser);

      // Sync profiles table in background — do not block login (production was hanging here).
      void (async () => {
        try {
          await ensureProfileFromAuthUser(authUser);
          await fetchProfileViaLoginCheck(session.access_token, authUser.id, authUser);
        } catch (err) {
          console.warn('Background profile sync after login:', err?.message || err);
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
      setLoading(false);
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
      userRef.current = null;
      setUser(null);
      return { error: null };
    } catch (err) {
      clearSupabaseAuthStorage();
      userRef.current = null;
      setUser(null);
      return { error: err };
    }
  };

  const clearInvalidSession = async () => {
    try {
      await supabase.auth.signOut();
      clearSupabaseAuthStorage();
      userRef.current = null;
      setUser(null);
      return { error: null };
    } catch (err) {
      clearSupabaseAuthStorage();
      userRef.current = null;
      setUser(null);
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
      const dbRole = profileRow.role ?? null;
      const effectiveRole =
        forcedSuperRole && dbRole !== 'super_admin' && dbRole !== 'super_admin_pro'
          ? forcedSuperRole
          : (dbRole ?? forcedSuperRole);
      return {
        username: profileRow.username ?? user?.email?.split("@")[0],
        team: profileRow.team ?? null,
        role: effectiveRole,
        allowed_modules: Array.isArray(profileRow.allowed_modules) ? profileRow.allowed_modules : [],
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

  return (
    <AuthContext.Provider value={{ user, loading, profileLoading, userProfile, accessibleModules, signIn, signOut, signUpWithProfile, resendConfirmation, clearInvalidSession, verifyEmailOtp }}>
      {children}
    </AuthContext.Provider>
  );
};
