import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-key'

// Check if environment variables are properly set
const isConfigured = supabaseUrl !== 'https://placeholder.supabase.co' && supabaseAnonKey !== 'placeholder-key'

if (!isConfigured) {
  console.warn('⚠️ Supabase environment variables are not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file')
}

// Custom fetch: timeout + clearer errors so "Failed to fetch" becomes actionable
const FETCH_TIMEOUT_MS = 20000
const customFetch = async (url, options = {}) => {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  const signal = options.signal ?? controller.signal
  try {
    const res = await fetch(url, { ...options, signal })
    clearTimeout(timeoutId)
    return res
  } catch (err) {
    clearTimeout(timeoutId)
    if (err?.name === 'AbortError') {
      throw new Error('Connection timed out. Check your internet and try again.')
    }
    if (err?.message === 'Failed to fetch' || err?.message?.includes('NetworkError')) {
      throw new Error(
        'Cannot reach Supabase. Check: (1) .env has VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, (2) Restart dev server after editing .env, (3) Firewall/antivirus, (4) Try another network.'
      )
    }
    throw err
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: customFetch },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
    storageKey: 'supabase.auth.token',
  },
})

/**
 * Check if Supabase is reachable and env is configured.
 * Use this to show a clear error on the other machine when data doesn't load.
 * @returns {{ ok: boolean, message?: string }}
 */
export async function checkSupabaseConnection() {
  if (!isConfigured) {
    return {
      ok: false,
      message: 'Environment not configured. Add a .env file with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then restart the dev server (npm run dev).',
    };
  }
  try {
    const { error } = await supabase.auth.getSession();
    if (error && (error.message?.includes('fetch') || error.message?.toLowerCase().includes('network'))) {
      return {
        ok: false,
        message: `Cannot reach Supabase: ${error.message}. Check internet, firewall, or VPN.`,
      };
    }
    return { ok: true };
  } catch (err) {
    const msg = err?.message || String(err);
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
      return {
        ok: false,
        message: 'Network error: cannot reach Supabase. Check internet connection, firewall, or try disabling VPN.',
      };
    }
    return {
      ok: false,
      message: msg || 'Could not connect to the server.',
    };
  }
}

// Helper function to clear all auth-related storage
export const clearAuthStorage = () => {
  try {
    // Clear all Supabase-related localStorage items
    Object.keys(localStorage).forEach(key => {
      if (key.includes('supabase') || key.includes('sb-')) {
        localStorage.removeItem(key);
      }
    });
    console.log('Auth storage cleared');
  } catch (error) {
    console.error('Error clearing auth storage:', error);
  }
}
