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
  readCachedSessionUser,
} from "../lib/authSessionUtils";
import { getAccessibleModules } from "../config/roles";
import PageLoader from "../components/PageLoader";

const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profileRow, setProfileRow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const userRef = useRef(null);
  const profileSyncAttemptedRef = useRef(null);
  const signInProfileSyncRef = useRef(false);
  const profileFetchInFlightRef = useRef(null);

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

    const SESSION_READ_TIMEOUT_MS = 15000;

    const getSession = async () => {
      try {
        if (clearSessionIfSupabaseProjectMismatch()) {
          userRef.current = null;
          setUser(null);
          setProfileRow(null);
          profileSyncAttemptedRef.current = null;
        }

        const sessionResult = await Promise.race([
          supabase.auth.getSession(),
          new Promise((_, reject) => {
            setTimeout(
              () => reject(new Error('Session read timed out — using cached session if available')),
              SESSION_READ_TIMEOUT_MS
            );
          }),
        ]);

        const {
          data: { session },
          error,
        } = sessionResult;

        if (error) {
          if (isInvalidRefreshTokenError(error.message)) {
            console.warn('Invalid refresh token detected, clearing session...');
            try {
              await supabase.auth.signOut();
            } catch {
              /* ignore */
            }
            clearSupabaseAuthStorage();
            userRef.current = null;
            setUser(null);
          } else if (isTransientAuthError(error.message)) {
            console.warn('Transient error reading session, keeping cached session:', error.message);
            applySessionUser(session?.user ?? readCachedSessionUser());
          } else {
            console.error('Error getting session:', error);
            const cachedUser = session?.user ?? readCachedSessionUser();
            if (cachedUser) {
              applySessionUser(cachedUser);
            } else {
              userRef.current = null;
              setUser(null);
            }
          }
        } else {
          applySessionUser(session?.user ?? null);
        }
      } catch (error) {
        console.error('Error getting session:', error);
        if (isInvalidRefreshTokenError(error.message)) {
          try {
            await supabase.auth.signOut();
          } catch {
            /* ignore */
          }
          clearSupabaseAuthStorage();
          userRef.current = null;
          setUser(null);
        } else {
          const cachedUser = readCachedSessionUser();
          if (cachedUser) {
            console.warn('Using cached session after session read failure:', error.message);
            applySessionUser(cachedUser);
          } else if (String(error?.message || '').includes('timed out')) {
            clearSupabaseAuthStorage();
            userRef.current = null;
            setUser(null);
          } else {
            userRef.current = null;
            setUser(null);
          }
        }
      } finally {
        setLoading(false);
      }
    };
    getSession();

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

  // New methodology: profiles is the single source of truth.
  const useProfilesTable = true;

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
        if (retryable) {
          await new Promise((r) => setTimeout(r, 300));
          const { data: sess } = await supabase.auth.getSession();
          const retryToken = accessToken || sess?.session?.access_token;
          ({ data, error } = await run(retryToken));
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
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
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
    signInProfileSyncRef.current = true;
    try {
      const result = await supabase.auth.signInWithPassword({
        email: normEmail,
        password,
      });
      if (result?.error) {
        return result;
      }
      if (result?.data?.session) {
        await supabase.auth.setSession(result.data.session);
      }
      if (result?.data?.user?.id) {
        const authUser = result.data.user;
        profileSyncAttemptedRef.current = authUser.id;
        userRef.current = authUser.id;
        setUser(authUser);
        await ensureProfileFromAuthUser(authUser);
        const checked = await fetchProfileViaLoginCheck(
          result.data.session?.access_token,
          authUser.id,
          authUser
        );
        if (!checked.ok) {
          const profileMsg = checked.message || "Could not load your access profile. Contact admin.";
          if (isAuthCredentialError(profileMsg) && !isTransientAuthError(profileMsg)) {
            await clearInvalidSession();
            return {
              data: { session: null, user: null },
              error: { message: profileMsg },
            };
          }
          return {
            ...result,
            error: { message: profileMsg },
          };
        }
        return { ...result, profile: checked.profile };
      }
      return result;
    } catch (err) {
      const msg = err?.message || String(err);
      const isNetwork = msg.includes('Failed to fetch') || msg.includes('Cannot reach Supabase') || msg.includes('timed out') || msg.includes('NetworkError');
      return {
        data: { session: null, user: null },
        error: { message: isNetwork ? 'Cannot reach Supabase. Check .env, restart dev server (npm run dev), and firewall/network.' : msg },
      };
    } finally {
      signInProfileSyncRef.current = false;
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
    // Single source of truth is `profiles`. If profileRow is missing, treat as not ready.
    return null;
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
      {loading ? <PageLoader fullScreen label="Loading session…" /> : children}
    </AuthContext.Provider>
  );
};
