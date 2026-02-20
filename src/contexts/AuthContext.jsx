import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import { supabase } from "../lib/supabase";

const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
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
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Register user + save extra profile info
  const signUpWithProfile = async (email, password, fullName, phone, company) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: {
          full_name: fullName,
          phone,
          company,
        },
      },
    });

    if (error) return { error };

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

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
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

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut, signUpWithProfile, resendConfirmation, clearInvalidSession }}>
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
