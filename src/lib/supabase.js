import { createClient } from '@supabase/supabase-js'
import {
  assertBrowserSafeSupabaseKey,
  getSupabaseAnonKey,
  getSupabaseUrl,
  isSupabaseEnvConfigured,
  supabaseUrlLooksValid,
} from './supabaseConfig'

assertBrowserSafeSupabaseKey()

const supabaseUrl = getSupabaseUrl() || 'https://placeholder.supabase.co'
const supabaseAnonKey = getSupabaseAnonKey() || 'placeholder-key'

const isConfigured = isSupabaseEnvConfigured()

if (!isConfigured) {
  console.warn(
    '⚠️ Supabase env missing: copy .env.example to .env, set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (anon key only), restart dev server.'
  )
} else if (import.meta.env.PROD && !supabaseUrlLooksValid(supabaseUrl)) {
  console.warn('⚠️ VITE_SUPABASE_URL should be a valid https URL')
}

// Custom fetch: optional timeout when Supabase does not pass its own signal, plus clearer network errors.
// Avoid AbortSignal.any — combining signals broke some saves/updates with supabase-js.
const FETCH_TIMEOUT_MS = 20000

function shortUrlForLog(url) {
  try {
    const u = new URL(url)
    return `${u.pathname}${u.search}`
  } catch {
    return String(url).slice(0, 160)
  }
}

/**
 * When `options.signal` is absent, apply a timeout. When present, use Supabase’s signal as-is
 * (do not merge — merging caused flaky PATCH/POST to rest/v1).
 */
function resolveFetchSignal(options) {
  if (options.signal) {
    return { signal: options.signal, clearTimer: () => {} }
  }
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), clearTimer: () => {} }
  }
  const c = new AbortController()
  const tid = setTimeout(() => c.abort(), FETCH_TIMEOUT_MS)
  return {
    signal: c.signal,
    clearTimer: () => clearTimeout(tid),
  }
}

const customFetch = async (url, options = {}) => {
  const pathLog = shortUrlForLog(url)
  const { signal, clearTimer } = resolveFetchSignal(options)

  try {
    const res = await fetch(url, { ...options, signal })
    clearTimer()

    if (!res.ok && import.meta.env.DEV) {
      try {
        const ct = res.headers.get('content-type') || ''
        const clone = res.clone()
        const raw = await clone.text()
        let detail = ''
        if (ct.includes('application/json')) {
          try {
            const j = JSON.parse(raw)
            detail = j.message || j.error_description || j.hint || raw.slice(0, 400)
          } catch {
            detail = raw.slice(0, 400)
          }
        } else {
          detail = raw.slice(0, 400)
        }
        const method = (options.method || 'GET').toUpperCase()
        console.warn(`[Supabase fetch] ${method} ${pathLog} → HTTP ${res.status}`, detail || '(no body)')
      } catch {
        /* ignore logging failures */
      }
    }

    return res
  } catch (err) {
    clearTimer()
    // Keep AbortError as-is so supabase-js cancellation/retries behave correctly.
    if (err?.name === 'AbortError') {
      throw err
    }
    if (err?.message === 'Failed to fetch' || err?.message?.includes('NetworkError')) {
      throw new Error(
        `Cannot reach Supabase (${pathLog}). Check .env URL/key, restart dev server, firewall/VPN.`
      )
    }
    throw err
  }
}

async function pingSupabaseRest() {
  const base = String(supabaseUrl).replace(/\/+$/, '')
  // Use Auth health endpoint to verify reachability without intentional 401 noise.
  const url = `${base}/auth/v1/health`
  const res = await customFetch(url, {
    method: 'GET',
    headers: {
      apikey: supabaseAnonKey,
    },
  })
  if (!res.ok) {
    throw new Error(`Supabase health check failed (HTTP ${res.status}). Verify URL/key and project status.`)
  }
  return { ok: true, status: res.status }
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
    // 1) Session fetch (may be local-only if cached)
    const { error } = await supabase.auth.getSession();
    if (error && (error.message?.includes('fetch') || error.message?.toLowerCase().includes('network'))) {
      return { ok: false, message: `Cannot reach Supabase: ${error.message}. Check internet, firewall, or VPN.` }
    }

    // 2) Real network ping to Supabase REST
    await pingSupabaseRest()
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
