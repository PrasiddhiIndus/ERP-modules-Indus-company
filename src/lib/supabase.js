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

/** Display names — avoid vague “something” wording in the UI. */
const ENTITY_LABELS = {
  po_wo: 'PO/WO',
  invoice: 'Tax invoice',
  add_on_invoice: 'Add-on invoice',
  manpower_enquiries: 'Manpower enquiry',
  profiles: 'User profile',
  marketing_enquiries: 'Marketing enquiry',
  marketing_quotations: 'Marketing quotation',
  marketing_clients: 'Marketing client',
  marketing_products: 'Marketing product line',
  credit_debit_note: 'Credit/debit note',
  payment_advice: 'Payment advice',
  tenders: 'Fire tender',
  costing_rows: 'Costing sheet row',
}

const ACTIVITY_IGNORE_TABLES = new Set([
  'invoice_line_item',
  'invoice_attachment',
  'attachments',
  'marketing_enquiry_documents',
  'po_rate_category',
  'po_contact_log',
])

function humanEntityName(entity) {
  const raw = String(entity || '').trim()
  if (!raw) return 'Record'
  if (raw.startsWith('rpc:')) {
    const fn = raw.slice(4).replace(/_/g, ' ')
    return fn ? `server fn «${fn}»` : 'RPC'
  }
  const key = raw.toLowerCase()
  return ENTITY_LABELS[key] || raw.replace(/_/g, ' ')
}

/** Where in the ERP the user likely was when the mutation ran. */
function screenHint(route) {
  const r = String(route || '')
  if (!r.startsWith('/app')) return r.slice(0, 72) || null
  if (r.includes('/billing/create-invoice')) return 'Billing · Create invoice'
  if (r.includes('/billing/manage-invoices')) return 'Billing · Manage invoices'
  if (r.includes('/billing/add-on-invoices')) return 'Billing · Add-on invoices'
  if (r.includes('/billing/credit-notes')) return 'Billing · Credit / debit notes'
  if (r.includes('/billing/generated-e-invoice')) return 'Billing · E-invoice'
  if (r.includes('/commercial/manpower-training/po-entry') || r.match(/commercial\/.*?po-entry/i)) {
    return r.includes('rm-mm-amc') ? 'Commercial RM · PO entry' : 'Commercial MT · PO entry'
  }
  if (r.includes('/commercial/') && r.includes('manpower-management')) return 'Commercial · Manpower enquiries'
  if (r.includes('/marketing/')) return 'Marketing'
  if (r.includes('/manpower')) return 'Manpower (Commercial MT)'
  if (r.includes('/fire-tender')) return 'Fire tender'
  if (r.includes('/user-management')) return 'User management'
  return `App · ${r.replace(/^\/app\/?/, '').slice(0, 52)}`.trim()
}

/** Parse `id=eq.<uuid>` from PostgREST query (PATCH/DELETE on one row). */
function parseRestRowId(fullUrl) {
  try {
    const u = new URL(fullUrl)
    const qs = Object.fromEntries(u.searchParams.entries())
    const candidates = []
    Object.entries(qs).forEach(([k, val]) => {
      if (/^id$/i.test(k)) {
        const raw = String(val).trim()
        const m = /^eq\.(.+)/i.exec(raw) || /^in\.\(([^)]+)\)/i.exec(raw)
        if (m && m[1]) candidates.push(m[1].split(',')[0].trim().replace(/^["']|["']$/g, ''))
        else if (raw) candidates.push(raw)
      }
    })
    const id = candidates[0]
    if (id && id.length >= 8) return { short: `${id.slice(0, 8)}…`, full: id }
  } catch {
    /* ignore */
  }
  return null
}

function tryParseJsonBody(rawBody) {
  if (rawBody == null) return null
  const s = typeof rawBody === 'string' ? rawBody : String(rawBody)
  const t = s.trim()
  if (!t || t.length > 96000) return null
  try {
    const j = JSON.parse(t)
    return Array.isArray(j) ? j[0] : j
  } catch {
    return null
  }
}

/** Long text / credential-like keys → never ship values into the activity log */
const PATCH_KEY_HIDE_VALUE = new Set([
  'remarks',
  'billing_address',
  'shipping_address',
  'gstin',
  'password',
  'token',
  'authorization_to',
  'service_description',
  'invoice_terms_text',
  'payload',
])

function shortenVal(v, max = 72) {
  if (v == null || v === '') return ''
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'object') return '…'
  const str = String(v).trim().replace(/\s+/g, ' ')
  return str.length > max ? `${str.slice(0, max - 2)}…` : str
}

/**
 * Describes approval / rejection / submission style changes from PATCH body (snake or camel keys).
 */
function describeWorkflowSignals(obj, entityLower) {
  if (!obj || typeof obj !== 'object') return null

  const pick = (...keys) => {
    for (const k of keys) {
      if (obj[k] != null && obj[k] !== '') return obj[k]
    }
    return null
  }

  const aprRaw = pick('approval_status', 'approvalStatus')
  const apr = String(aprRaw || '').trim().toLowerCase()
  if (aprRaw != null && aprRaw !== '')
    switch (apr) {
      case 'approved':
      case 'approve':
        return { headline: 'approved', badge: 'APPROVED', kind: 'approval' }
      case 'sent_for_approval':
      case 'sent':
        return { headline: 'submitted for approval', badge: 'SUBMITTED', kind: 'submit' }
      case 'rejected':
      case 'reject':
        return { headline: 'rejected', badge: 'REJECTED', kind: 'reject' }
      case 'draft':
        return { headline: 'saved as draft', badge: 'DRAFT', kind: 'draft' }
      default:
        if (apr)
          return { headline: `set approval to “${apr}”`, badge: 'CHANGED', kind: 'update' }
    }

  const cnRaw = pick('cn_dn_request_status', 'cnDnRequestStatus')
  const cn = String(cnRaw || '').trim().toLowerCase()
  if (cnRaw != null && cnRaw !== '')
    switch (cn) {
      case 'pending':
        return { headline: 'requested CN/DN approval', badge: 'SUBMITTED', kind: 'submit' }
      case 'approved':
        return { headline: 'approved CN/DN request', badge: 'APPROVED', kind: 'approval' }
      case 'rejected':
        return { headline: 'rejected CN/DN request', badge: 'REJECTED', kind: 'reject' }
      default:
        if (cn)
          return { headline: `set CN/DN status to “${cn}”`, badge: 'CHANGED', kind: 'update' }
    }

  const supRaw = pick('supplementary_request_status')
  const sup = String(supRaw || '').trim().toLowerCase()
  if (supRaw != null && supRaw !== '')
    switch (sup) {
      case 'pending':
        return { headline: 'requested post‑contract billing', badge: 'SUBMITTED', kind: 'submit' }
      case 'approved':
        return { headline: 'approved post‑contract billing', badge: 'APPROVED', kind: 'approval' }
      case 'rejected':
        return { headline: 'rejected post‑contract billing request', badge: 'REJECTED', kind: 'reject' }
      default:
        if (sup)
          return { headline: `set supplementary status to “${sup}”`, badge: 'CHANGED', kind: 'update' }
    }

  if (
    entityLower === 'manpower_enquiries' ||
    entityLower === 'manpower_enquiry' ||
    entityLower.includes('manpower')
  ) {
    const st = String(pick('status') ?? '').trim()
    const sl = st.toLowerCase()
    if (sl === 'approved') return { headline: 'approved enquiry', badge: 'APPROVED', kind: 'approval' }
    if (sl === 'rejected') return { headline: 'rejected enquiry', badge: 'REJECTED', kind: 'reject' }
    if (st) return { headline: `set status to “${sl}”`, badge: 'UPDATED', kind: 'update' }
  }

  return null
}

/** Short “what fields changed?” line — values only when short / non-sensitive */
function summarizePatchChanges(obj, maxParts = 4) {
  if (!obj || typeof obj !== 'object') return ''
  const parts = []
  for (const key of Object.keys(obj)) {
    if (PATCH_KEY_HIDE_VALUE.has(key)) {
      parts.push(`${key}`)
      continue
    }
    const val = obj[key]
    const sv = shortenVal(val, 64)
    if (!sv || sv === '…') parts.push(`${key}`)
    else parts.push(`${key} → ${sv}`)
    if (parts.length >= maxParts) break
  }
  if (!parts.length) return ''
  return parts.join('; ')
}

/** Build `{ action, badge, summary, … }` stored in erp_activity_log.details */
function buildActivityDetails(method, entity, route, fullUrl, rawBody) {
  const m = String(method || '').toUpperCase()
  const e = String(entity || '').toLowerCase()
  const entityLabel = humanEntityName(entity)
  const screen = screenHint(route)
  const rowRef = parseRestRowId(fullUrl)
  const payload = m === 'PATCH' || m === 'PUT' ? tryParseJsonBody(rawBody) : null

  let badge = 'CHANGED'
  let summaryCore = ''
  let detailLine = ''

  if (m === 'POST') {
    badge = 'CREATED'
    summaryCore = `Created ${entityLabel}`
  } else if (m === 'DELETE') {
    badge = 'DELETED'
    summaryCore = `Deleted ${entityLabel}`
  } else if (m === 'PATCH' || m === 'PUT') {
    badge = 'UPDATED'
    const wf = describeWorkflowSignals(payload, e)
    if (wf) {
      badge = wf.badge
      summaryCore = `${wf.headline.charAt(0).toUpperCase() + wf.headline.slice(1)} — ${entityLabel}`
    } else {
      summaryCore = `Updated ${entityLabel}`
    }
    detailLine = summarizePatchChanges(payload, 5)
  } else {
    badge = m
    summaryCore = `Changed ${entityLabel}`
  }

  const bits = [summaryCore]
  if (screen) bits.push(`(${screen})`)
  const summary = bits.join(' ')

  if (rowRef && (m === 'PATCH' || m === 'DELETE')) {
    detailLine = detailLine ? `${detailLine} · row ${rowRef.short}` : `Row ${rowRef.short}`
  }

  if (e.startsWith('rpc:')) {
    const fn = e.replace(/^rpc:/, '').replace(/_/g, ' ')
    badge = m === 'POST' ? 'RPC' : 'RPC'
    return {
      action: m === 'POST' ? 'INSERT' : 'CALL',
      badge,
      summary: m === 'POST' ? `Ran server function “${fn}”` : `Called “${fn}”`,
      detail: screen ? `Screen: ${screen}` : '',
      entity_label: entityLabel,
      screen,
    }
  }

  return {
    action: m === 'POST' ? 'INSERT' : m === 'PATCH' ? 'UPDATE' : m === 'DELETE' ? 'DELETE' : m,
    badge,
    summary,
    detail: detailLine,
    entity_label: entityLabel,
    screen,
    record_ref: rowRef?.short || null,
    http_method: m,
  }
}

function parseRestEntity(url) {
  try {
    const u = new URL(url)
    const parts = u.pathname.split('/').filter(Boolean)
    const restIdx = parts.indexOf('rest')
    if (restIdx < 0 || parts[restIdx + 1] !== 'v1') return null
    const next = parts[restIdx + 2]
    if (!next) return null
    if (next === 'rpc' && parts[restIdx + 3]) return `rpc:${parts[restIdx + 3]}`
    return next
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
  if (String(url).includes('/functions/v1/')) return false
  const e = String(entity).toLowerCase()
  if (ACTIVITY_IGNORE_TABLES.has(e)) return false
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
    const res = await baseFetch(url, {
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
    if (!res.ok) {
      let detail = ''
      try {
        detail = (await res.text()).slice(0, 400)
      } catch {
        /* ignore */
      }
      if (import.meta.env.DEV) {
        console.warn(`[Activity log] Could not write to ${ACTIVITY_TABLE} (HTTP ${res.status}).`, detail || '')
      }
    }
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn('[Activity log] Flush failed:', err?.message || err)
    }
    // Never block the app for logging failures.
  }
}

function enqueueActivityLog(row) {
  // Dedupe burst clicks: identical verb + target + body hint within 3s → keep one.
  const d = row?.details || {}
  const sig = d.summary
    ? `${d.badge || ''}__${d.summary}__${row?.details?.path || ''}__${String(d.detail || '').slice(0, 120)}`
    : null
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
      const bodyCandidate = options.body
      const details = buildActivityDetails(method, entity, route, url, bodyCandidate)
      if (details.summary) {
        enqueueActivityLog({
          action: details.action,
          entity,
          route,
          success: res.ok,
          status_code: res.status,
          details: {
            path: pathLog,
            summary: details.summary,
            badge: details.badge,
            detail: details.detail || null,
            entity_label: details.entity_label || null,
            screen: details.screen || null,
            record_ref: details.record_ref || null,
            http_method: details.http_method || method,
          },
        })
      }
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
