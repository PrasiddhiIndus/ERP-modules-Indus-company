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

  // Fetch profile from DB when user exists. If table missing or 500, use user_metadata only.
  // Set VITE_USE_PROFILES_TABLE=true only after running supabase/migrations/20250220000000_profiles_for_roles.sql
  // to avoid 500 errors until the profiles table exists.
  const useProfilesTable = import.meta.env.VITE_USE_PROFILES_TABLE === "true" || import.meta.env.VITE_USE_PROFILES_TABLE === true;
  const PROFILES_SKIP_KEY = "profiles_skip";
  useEffect(() => {
    if (!user?.id) {
      setProfileRow(null);
      return;
    }
    if (!useProfilesTable) {
      setProfileRow(null);
      return;
    }
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(PROFILES_SKIP_KEY) === "1") {
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
        try {
          sessionStorage.setItem(PROFILES_SKIP_KEY, "1");
        } catch (_) {}
        setProfileRow(null);
      } catch (_) {
        try {
          sessionStorage.setItem(PROFILES_SKIP_KEY, "1");
        } catch (_) {}
        if (!cancelled) setProfileRow(null);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, useProfilesTable]);

  // Register user + save role-based profile (username, team, role, allowed_modules for manager)
  const signUpWithProfile = async (email, password, profileData) => {
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
          role: profileData?.role ?? "executive",
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
            role: profileData?.role ?? "executive",
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
    return await supabase.auth.signInWithPassword({ email, password });
  };

  /** Verify 6-digit email OTP (for "Confirm Your Signup" flow). */
  const verifyEmailOtp = async (email, token) => {
    return await supabase.auth.verifyOtp({ email, token: token.trim(), type: "email" });
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      try {
        sessionStorage.removeItem("profiles_skip");
      } catch (_) {}
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
      try {
        sessionStorage.removeItem("profiles_skip");
      } catch (_) {}
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
      try {
        sessionStorage.removeItem("profiles_skip");
      } catch (_) {}
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
    if (profileRow) {
      return {
        username: profileRow.username ?? user?.email?.split("@")[0],
        team: profileRow.team ?? null,
        role: profileRow.role ?? null,
        allowed_modules: Array.isArray(profileRow.allowed_modules) ? profileRow.allowed_modules : [],
      };
    }
    const meta = user?.user_metadata;
    if (!meta) return null;
    return {
      username: meta.full_name ?? user?.email?.split("@")[0],
      team: meta.team ?? null,
      role: meta.role ?? null,
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
