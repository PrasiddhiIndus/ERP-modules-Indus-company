import React, { createContext, useContext, useEffect, useState, useRef, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { getAccessibleModules } from "../config/roles";

const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profileRow, setProfileRow] = useState(null);
  const [loading, setLoading] = useState(true);
  const userRef = useRef(null);

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
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch profile from DB when user exists. If table missing or access denied, fall back to user_metadata.
  // NOTE: We do NOT permanently "skip" profiles anymore — role gating (Super Admin) depends on this row.
  const useProfilesTable =
    import.meta.env.VITE_USE_PROFILES_TABLE === "true" ||
    import.meta.env.VITE_USE_PROFILES_TABLE === true;
  useEffect(() => {
    if (!user?.id) {
      setProfileRow(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("id, email, username, team, role, allowed_modules")
          .eq("id", user.id)
          .maybeSingle();
        if (cancelled) return;
        if (!error && data) {
          setProfileRow(data);
          return;
        }
        setProfileRow(null);
      } catch (_) {
        if (!cancelled) setProfileRow(null);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, useProfilesTable]);

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
    try {
      return await supabase.auth.signInWithPassword({ email, password });
    } catch (err) {
      const msg = err?.message || String(err);
      const isNetwork = msg.includes('Failed to fetch') || msg.includes('Cannot reach Supabase') || msg.includes('timed out') || msg.includes('NetworkError');
      return {
        data: { session: null, user: null },
        error: { message: isNetwork ? 'Cannot reach Supabase. Check .env, restart dev server (npm run dev), and firewall/network.' : msg },
      };
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
    if (profileRow) {
      return {
        username: profileRow.username ?? user?.email?.split("@")[0],
        team: profileRow.team ?? null,
        role: profileRow.role ?? (isSuperAdminPro ? 'super_admin_pro' : (superAdminEmails.includes(email) ? 'super_admin' : null)),
        allowed_modules: Array.isArray(profileRow.allowed_modules) ? profileRow.allowed_modules : [],
      };
    }
    const meta = user?.user_metadata;
    if (!meta) return null;
    return {
      username: meta.full_name ?? user?.email?.split("@")[0],
      team: meta.team ?? null,
      role: meta.role ?? (isSuperAdminPro ? 'super_admin_pro' : (superAdminEmails.includes(email) ? 'super_admin' : null)),
      allowed_modules: Array.isArray(meta.allowed_modules) ? meta.allowed_modules : [],
    };
  }, [user, profileRow]);

  const accessibleModules = useMemo(
    () => (userProfile ? getAccessibleModules(userProfile) : new Set()),
    [userProfile]
  );

  return (
    <AuthContext.Provider value={{ user, loading, userProfile, accessibleModules, signIn, signOut, signUpWithProfile, resendConfirmation, clearInvalidSession, verifyEmailOtp }}>
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
