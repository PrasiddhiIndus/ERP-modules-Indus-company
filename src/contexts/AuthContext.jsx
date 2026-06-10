import React, { createContext, useContext, useEffect, useState, useRef, useMemo } from "react";
import { supabase, parseEdgeFunctionError, invokeAuthenticatedFunction } from "../lib/supabase";
import {
  getEmpCodeColumnSupported,
  isMissingProfileEmpCodeError,
  setEmpCodeColumnSupported,
  PROFILE_AUTH_SELECT,
  PROFILE_AUTH_SELECT_WITH_EMP,
} from "../lib/profileSelect";
import { getAccessibleModules } from "../config/roles";

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
    const getSession = async () => {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();
        
        // Handle refresh token errors
        if (error) {
          // Check if it's a refresh token error
          if (error.message?.includes('Refresh Token') || error.message?.includes('JWT') || error.message?.includes('Invalid Refresh Token')) {
            console.warn('Invalid refresh token detected, clearing session...');
            // Clear the invalid session
            try {
              await supabase.auth.signOut();
            } catch (e) {
              // Ignore signOut errors
            }
            // Clear all Supabase-related localStorage items
            Object.keys(localStorage).forEach(key => {
              if (key.includes('supabase') || key.includes('sb-')) {
                localStorage.removeItem(key);
              }
            });
            userRef.current = null;
            setUser(null);
          } else {
            console.error('Error getting session:', error);
            userRef.current = null;
            setUser(null);
          }
        } else {
          const newUser = session?.user ?? null;
          userRef.current = newUser?.id ?? null;
          setUser(newUser);
          setProfileRow(null);
          profileSyncAttemptedRef.current = null;
          if (newUser?.id && useProfilesTable) setProfileLoading(true);
        }
      } catch (error) {
        console.error('Error getting session:', error);
        // If it's a network error or backend not accessible, clear session
        if (error.message?.includes('Failed to fetch') || error.message?.includes('Network')) {
          console.warn('Supabase backend not accessible, clearing local session...');
          await supabase.auth.signOut();
          userRef.current = null;
          setUser(null);
        } else {
          userRef.current = null;
          setUser(null);
        }
      } finally {
        setLoading(false);
      }
    };
    getSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      // Only update if user state actually changed
      const newUser = session?.user ?? null;
      const newUserId = newUser?.id ?? null;
      
      // Prevent unnecessary updates if user hasn't changed
      if (userRef.current !== newUserId) {
        userRef.current = newUserId;
        setUser(newUser);
        setProfileRow(null);
        if (!newUserId) {
          profileSyncAttemptedRef.current = null;
        }
        if (newUserId && useProfilesTable && !signInProfileSyncRef.current) {
          setProfileLoading(true);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // New methodology: profiles is the single source of truth.
  // The app never guesses role/team from user_metadata; it uses `login-check`.
  const useProfilesTable = true;

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
    if (error || !data?.id) return { ok: false };
    setProfileRow(data);
    return { ok: true, profile: data };
  };

  const fetchProfileViaLoginCheck = async (accessToken, userId) => {
    const uid = userId || user?.id;
    if (!uid) return { ok: false };
    if (profileFetchInFlightRef.current === uid) {
      return { ok: false, message: "Profile sync in progress." };
    }
    profileFetchInFlightRef.current = uid;
    setProfileLoading(true);
    try {
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
      await fetchProfileViaLoginCheck(sess?.session?.access_token, user.id);
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
        emailRedirectTo: `${window.location.origin}/`,
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
      try {
        await supabase.from("profiles").upsert(
          {
            id: data.user.id,
            email: data.user.email,
            username: profileData?.username ?? "",
            team: profileData?.team ?? null,
            role: safeRole,
            allowed_modules: profileData?.allowed_modules ?? [],
          },
          { onConflict: "id" }
        );
      } catch (_) {
        // Profiles table may not exist or RLS may block; auth still works via user_metadata
      }
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
        const checked = await fetchProfileViaLoginCheck(
          result.data.session?.access_token,
          authUser.id
        );
        if (!checked.ok) {
          // Do not keep half-authenticated sessions.
          await clearInvalidSession();
          return {
            data: { session: null, user: null },
            error: { message: checked.message || "Could not load your access profile. Contact admin." },
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
      // legacy cleanup (profiles_skip no longer used)
      // Clear all Supabase-related localStorage items
      Object.keys(localStorage).forEach(key => {
        if (key.includes('supabase') || key.includes('sb-')) {
          localStorage.removeItem(key);
        }
      });
      userRef.current = null;
      setUser(null);
      return { error: null };
    } catch (err) {
      // legacy cleanup (profiles_skip no longer used)
      // Even if signOut fails, clear local state and storage
      Object.keys(localStorage).forEach(key => {
        if (key.includes('supabase') || key.includes('sb-')) {
          localStorage.removeItem(key);
        }
      });
      userRef.current = null;
      setUser(null);
      return { error: err };
    }
  };

  const clearInvalidSession = async () => {
    try {
      await supabase.auth.signOut();
      // legacy cleanup (profiles_skip no longer used)
      // Clear all Supabase-related localStorage items
      Object.keys(localStorage).forEach(key => {
        if (key.includes('supabase') || key.includes('sb-')) {
          localStorage.removeItem(key);
        }
      });
      userRef.current = null;
      setUser(null);
      return { error: null };
    } catch (err) {
      // Force clear local state even if signOut fails
      Object.keys(localStorage).forEach(key => {
        if (key.includes('supabase') || key.includes('sb-')) {
          localStorage.removeItem(key);
        }
      });
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
      {loading ? (
        <div className="flex items-center justify-center h-screen">
          <p>Loading...</p>
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
};
