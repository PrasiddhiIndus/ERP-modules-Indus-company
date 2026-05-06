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
const baseFetch = fetch

// Activity logging: minimal overhead, batched, fire-and-forget.
const ACTIVITY_TABLE = 'erp_activity_log'
const ACTIVITY_FLUSH_MS = 2000
const ACTIVITY_MAX_BATCH = 20
let activityQueue = []
let activityFlushTimer = null
let lastEnqueuedSig = null
let lastEnqueuedAt = 0

function friendlyUserNameFromEmail(email) {
  const e = String(email || '').trim()
  if (!e.includes('@')) return 'Someone'
  const local = e.split('@')[0] || ''
  const raw = (local.split('.')[0] || local).trim()
  if (!raw) return 'Someone'
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase()
}

function toFriendlyActionText(method, entity, route) {
  const m = String(method || '').toUpperCase()
  const e = String(entity || '').toLowerCase()
  const r = String(route || '')

  // Ignore noisy child tables; we only want human-readable high-level activities.
  const ignoreEntities = new Set([
    'invoice_line_item',
    'invoice_attachment',
    'attachments',
    'marketing_enquiry_documents',
  ])
  if (ignoreEntities.has(e)) return null

  // Billing
  if (e === 'invoice') return m === 'POST' ? 'created an invoice' : m === 'PATCH' ? 'updated an invoice' : m === 'DELETE' ? 'deleted an invoice' : null
  if (e === 'add_on_invoice') return m === 'POST' ? 'created an add-on invoice' : m === 'PATCH' ? 'updated an add-on invoice' : m === 'DELETE' ? 'deleted an add-on invoice' : null

  // Marketing
  if (e === 'marketing_enquiries') return m === 'POST' ? 'raised a marketing enquiry' : m === 'PATCH' ? 'updated a marketing enquiry' : m === 'DELETE' ? 'deleted a marketing enquiry' : null
  if (e === 'marketing_quotations') return m === 'POST' ? 'created a quotation' : m === 'PATCH' ? 'updated a quotation' : m === 'DELETE' ? 'deleted a quotation' : null
  if (e === 'marketing_clients') return m === 'POST' ? 'created a marketing client' : m === 'PATCH' ? 'updated a marketing client' : m === 'DELETE' ? 'deleted a marketing client' : null
  if (e === 'marketing_products') return m === 'POST' ? 'created a product' : m === 'PATCH' ? 'updated a product' : m === 'DELETE' ? 'deleted a product' : null

  // Fallback: if we can infer from route (keep it generic; no table spam)
  if (r.startsWith('/app/marketing') && m === 'POST') return 'created a marketing record'
  if (r.startsWith('/app/billing') && m === 'POST') return 'created a billing record'
  return null
}

function parseRestEntity(url) {
  try {
    const u = new URL(url)
    const parts = u.pathname.split('/').filter(Boolean)
    const restIdx = parts.indexOf('rest')
    if (restIdx >= 0 && parts[restIdx + 1] === 'v1' && parts[restIdx + 2]) {
      return parts[restIdx + 2]
    }
    return null
  } catch {
    return null
  }
}

function shouldLogRequest(url, options) {
  const method = String(options?.method || 'GET').toUpperCase()
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return false
  const entity = parseRestEntity(url)
  if (!entity) return false
  if (entity === ACTIVITY_TABLE) return false
  // Skip auth/health/storage noise
  if (String(url).includes('/auth/v1/')) return false
  if (String(url).includes('/storage/v1/')) return false
  return true
}

async function flushActivityQueue() {
  if (!activityQueue.length) return
  const batch = activityQueue
  activityQueue = []
  if (activityFlushTimer) {
    clearTimeout(activityFlushTimer)
    activityFlushTimer = null
  }

  try {
    if (!supabaseUrlLooksValid(supabaseUrl)) return
    const { data } = await supabase.auth.getSession()
    const token = data?.session?.access_token
    const user = data?.session?.user
    if (!token) return

    const url = `${String(supabaseUrl).replace(/\/+$/, '')}/rest/v1/${ACTIVITY_TABLE}`
    await baseFetch(url, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(
        batch.map((r) => ({
          ...r,
          user_id: r.user_id ?? user?.id ?? null,
          user_email: r.user_email ?? user?.email ?? null,
        }))
      ),
    })
  } catch {
    // Never block the app for logging failures.
  }
}

function enqueueActivityLog(row) {
  // Dedupe burst clicks: same summary within 3s → keep one.
  const summary = row?.details?.summary
  const sig = summary ? `${summary}__${row?.route || ''}` : null
  const now = Date.now()
  if (sig && lastEnqueuedSig === sig && now - lastEnqueuedAt < 3000) return
  if (sig) {
    lastEnqueuedSig = sig
    lastEnqueuedAt = now
  }

  activityQueue.push(row)
  if (activityQueue.length >= ACTIVITY_MAX_BATCH) {
    void flushActivityQueue()
    return
  }
  if (!activityFlushTimer) {
    activityFlushTimer = setTimeout(() => void flushActivityQueue(), ACTIVITY_FLUSH_MS)
  }
}

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
    const res = await baseFetch(url, { ...options, signal })
    clearTimer()

    // Activity log for mutations (batched). Keep payload minimal to avoid load/PII.
    if (shouldLogRequest(url, options)) {
      const method = String(options?.method || 'GET').toUpperCase()
      const entity = parseRestEntity(url)
      const route = typeof window !== 'undefined' ? window.location.pathname : null
      const summaryVerb = toFriendlyActionText(method, entity, route)
      if (!summaryVerb) {
        return res
      }
      enqueueActivityLog({
        action: method === 'POST' ? 'INSERT' : method === 'PATCH' ? 'UPDATE' : method === 'DELETE' ? 'DELETE' : method,
        entity,
        route,
        success: res.ok,
        status_code: res.status,
        details: {
          path: pathLog,
          summary: summaryVerb,
        },
      })
    }

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
