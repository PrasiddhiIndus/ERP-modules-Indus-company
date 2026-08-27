import { createClient } from '@supabase/supabase-js'
import {
  SUPABASE_AUTH_STORAGE_KEY,
  readCachedAccessToken,
  isCachedAccessTokenExpired,
  hasCachedRefreshToken,
  ensureFreshCachedSession,
} from './authSessionUtils'
import {
  assertBrowserSafeSupabaseKey,
  getSupabaseAnonKey,
  getSupabaseUrl,
  isSupabaseEnvConfigured,
  supabaseUrlLooksValid,
} from './supabaseConfig'
import {
  resolveModule,
  humanEntityName,
  getActivityFormatter,
  methodToActionKey,
  stripSensitiveForActivity,
  ACTIVITY_SENSITIVE_KEYS,
} from './activityDescriptors'

assertBrowserSafeSupabaseKey()

const supabaseUrl = getSupabaseUrl() || 'https://placeholder.supabase.co'
const supabaseAnonKey = getSupabaseAnonKey() || 'placeholder-key'

const isConfigured = isSupabaseEnvConfigured()

if (!isConfigured) {
  const mode = import.meta.env.MODE || 'development'
  const envHint =
    mode === 'staging'
      ? 'copy .env.staging.example to .env.staging, set staging VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then restart (npm run dev:staging).'
      : 'copy .env.example to .env, set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (anon key only), restart dev server.'
  console.warn(`⚠️ Supabase env missing: ${envHint}`)
} else if (import.meta.env.PROD && !supabaseUrlLooksValid(supabaseUrl)) {
  console.warn('⚠️ VITE_SUPABASE_URL should be a valid https URL')
}

// Custom fetch: optional timeout when Supabase does not pass its own signal, plus clearer network errors.
// Avoid AbortSignal.any — combining signals broke some saves/updates with supabase-js.
const FETCH_TIMEOUT_MS = 20000
const AUTH_FETCH_TIMEOUT_MS = 25000
/** Bulk punch upserts / large REST writes need more headroom than normal reads. */
const HEAVY_REST_FETCH_TIMEOUT_MS = 60000
const baseFetch = fetch
const useStrictSupabaseHealthCheck =
  import.meta.env.VITE_STRICT_SUPABASE_HEALTH_CHECK === 'true' ||
  import.meta.env.VITE_STRICT_SUPABASE_HEALTH_CHECK === true

// Activity logging: minimal overhead, batched, fire-and-forget.
const ACTIVITY_TABLE = 'erp_activity_log'
const ACTIVITY_FLUSH_MS = 2000
const ACTIVITY_MAX_BATCH = 20
let activityQueue = []
let activityFlushTimer = null
let lastEnqueuedSig = null
let lastEnqueuedAt = 0

const ACTIVITY_IGNORE_TABLES = new Set([
  'invoice_line_item',
  'invoice_attachment',
  'attachments',
  'marketing_enquiry_documents',
  'maintenance_enquiry_documents',
  'software_subscription_invoice_files',
  'po_rate_category',
  'po_contact_log',
])

/** Where in the ERP the user likely was when the mutation ran (fallback when module map misses). */
function screenHint(route) {
  return resolveModule(route)
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

/** Alias — sensitive keys live in activityDescriptors. */
const PATCH_KEY_HIDE_VALUE = ACTIVITY_SENSITIVE_KEYS

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
 * Used only for generic fallback when no ACTIVITY_DESCRIPTORS entry exists.
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

/**
 * Build activity details for erp_activity_log.
 * Prefers ACTIVITY_DESCRIPTORS; falls back to generic entity summaries.
 *
 * @param {string} method
 * @param {string} entity
 * @param {string|null} route
 * @param {string} fullUrl
 * @param {unknown} rawBody request body
 * @param {unknown} [responseRow] parsed response row (first element if array)
 */
function buildActivityDetails(method, entity, route, fullUrl, rawBody, responseRow = null) {
  const m = String(method || '').toUpperCase()
  const e = String(entity || '').toLowerCase()
  const entityLabel = humanEntityName(entity)
  const moduleLabel = resolveModule(route) || screenHint(route)
  const rowRef = parseRestRowId(fullUrl)
  const actionKey = methodToActionKey(m, e)
  const action =
    e.startsWith('rpc:')
      ? m === 'POST'
        ? 'INSERT'
        : 'CALL'
      : m === 'POST'
        ? 'INSERT'
        : m === 'PATCH' || m === 'PUT'
          ? 'UPDATE'
          : m === 'DELETE'
            ? 'DELETE'
            : m

  const rawReq =
    m === 'GET' || m === 'HEAD' ? null : tryParseJsonBody(rawBody)
  const safeReq = stripSensitiveForActivity(rawReq)
  const safeRes = stripSensitiveForActivity(
    responseRow && typeof responseRow === 'object' ? responseRow : tryParseJsonBody(responseRow)
  )

  const formatter = getActivityFormatter(e, actionKey)
  if (formatter) {
    try {
      const formatted = formatter(safeReq, safeRes, route)
      if (formatted?.summary) {
        const detailLine =
          actionKey === 'UPDATE' || actionKey === 'DELETE'
            ? summarizePatchChanges(safeReq, 5)
            : ''
        let detail = detailLine || null
        if (rowRef && (actionKey === 'UPDATE' || actionKey === 'DELETE') && !formatted.record_ref) {
          detail = detail ? `${detail} · row ${rowRef.short}` : `Row ${rowRef.short}`
        }
        return {
          action,
          badge: formatted.badge || (actionKey === 'INSERT' ? 'CREATED' : actionKey),
          summary: formatted.summary,
          detail,
          entity_label: entityLabel,
          screen: moduleLabel,
          module: moduleLabel,
          record_ref: formatted.record_ref || rowRef?.short || null,
          http_method: m,
        }
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn('[Activity log] Descriptor failed; using generic summary.', err?.message || err)
      }
    }
  }

  // —— Generic fallback (unchanged behaviour for uncovered entities) ——
  let badge = 'CHANGED'
  let summaryCore = ''
  let detailLine = ''
  const payload = actionKey === 'UPDATE' ? safeReq : null

  if (e.startsWith('rpc:')) {
    const fn = e.replace(/^rpc:/, '').replace(/_/g, ' ')
    return {
      action: m === 'POST' ? 'INSERT' : 'CALL',
      badge: 'RPC',
      summary: m === 'POST' ? `ran server function “${fn}”` : `called “${fn}”`,
      detail: moduleLabel ? `Screen: ${moduleLabel}` : '',
      entity_label: entityLabel,
      screen: moduleLabel,
      module: moduleLabel,
      record_ref: null,
      http_method: m,
    }
  }

  if (m === 'POST') {
    badge = 'CREATED'
    summaryCore = `created ${entityLabel}`
  } else if (m === 'DELETE') {
    badge = 'DELETED'
    summaryCore = `deleted ${entityLabel}`
  } else if (m === 'PATCH' || m === 'PUT') {
    badge = 'UPDATED'
    const wf = describeWorkflowSignals(payload, e)
    if (wf) {
      badge = wf.badge
      summaryCore = `${wf.headline} — ${entityLabel}`
    } else {
      summaryCore = `updated ${entityLabel}`
    }
    detailLine = summarizePatchChanges(payload, 5)
  } else {
    badge = m
    summaryCore = `changed ${entityLabel}`
  }

  const bits = [summaryCore]
  if (moduleLabel) bits.push(`(${moduleLabel})`)
  const summary = bits.join(' ')

  if (rowRef && (m === 'PATCH' || m === 'DELETE')) {
    detailLine = detailLine ? `${detailLine} · row ${rowRef.short}` : `Row ${rowRef.short}`
  }

  return {
    action,
    badge,
    summary,
    detail: detailLine,
    entity_label: entityLabel,
    screen: moduleLabel,
    module: moduleLabel,
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
          module: r.module ?? r.details?.module ?? r.details?.screen ?? null,
          record_ref: r.record_ref ?? r.details?.record_ref ?? null,
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
 * Tables confirmed missing from PostgREST schema cache (404 / PGRST205).
 * Session-scoped: after the first miss, GET/HEAD short-circuit to empty results
 * so dashboards do not keep hammering missing relations (e.g. maintenance_*).
 *
 * Also pre-seed relations that exist in app code but are not deployed on this
 * project's schema (no CREATE TABLE in tracked migrations) — avoids even the
 * first browser Network 404.
 */
const missingRestRelations = new Set([
  'maintenance_enquiries',
  'maintenance_quotations',
  'maintenance_quotation_items',
  'maintenance_quotation_revisions',
  'maintenance_clients',
  'maintenance_products',
  'maintenance_costing_sheets',
  'maintenance_follow_ups',
  'maintenance_site_visits',
  'maintenance_contracts',
  'maintenance_notifications',
  'maintenance_enquiry_documents',
  'maintenance_mail_templates',
  'maintenance_gst_documents',
  'maintenance_expo_seminars',
  'maintenance_expo_visitors',
])
const missingRestRelationsLogged = new Set()
/** In-flight probes keyed by table — collapses parallel HEAD/GETs racing the first 404. */
const restRelationProbeInflight = new Map()

function parseRestTableName(url) {
  const entity = parseRestEntity(url)
  if (!entity || entity.startsWith('rpc:')) return null
  return entity
}

function looksLikeMissingRelation(status, bodyText = '') {
  if (status === 404) return true
  const text = String(bodyText || '')
  return (
    /PGRST205/i.test(text) ||
    /could not find the table/i.test(text) ||
    /relation .* does not exist/i.test(text) ||
    /schema cache/i.test(text)
  )
}

function emptyRestListResponse(method) {
  const headers = {
    'Content-Type': 'application/json',
    'Content-Range': '*/0',
  }
  if (String(method || 'GET').toUpperCase() === 'HEAD') {
    return new Response(null, { status: 200, headers })
  }
  return new Response('[]', { status: 200, headers })
}

/** True when this session already learned the relation is absent from the API schema. */
export function isRestRelationMissing(tableName) {
  return missingRestRelations.has(String(tableName || ''))
}

export function markRestRelationMissing(tableName) {
  const name = String(tableName || '').trim()
  if (name) missingRestRelations.add(name)
}

/** Clear a pre-seeded / discovered miss (e.g. after deploying maintenance schema). */
export function clearRestRelationMissing(tableName) {
  const name = String(tableName || '').trim()
  if (!name) return
  missingRestRelations.delete(name)
  missingRestRelationsLogged.delete(name)
}

function isTimeoutError(err) {
  const name = String(err?.name || '').toLowerCase()
  const msg = String(err?.message || '').toLowerCase()
  return name === 'timeouterror' || msg.includes('timed out') || msg.includes('timeout')
}

/**
 * When `options.signal` is absent, apply a timeout. Auth calls (login, refresh, user)
 * also time out so production never hangs forever on a stuck token refresh.
 */
function resolveFetchSignal(options, url) {
  if (options.signal) {
    return { signal: options.signal, clearTimer: () => {} }
  }
  const urlStr = String(url)
  const method = String(options?.method || 'GET').toUpperCase()
  let timeoutMs = FETCH_TIMEOUT_MS
  if (urlStr.includes('/auth/v1/')) {
    timeoutMs = AUTH_FETCH_TIMEOUT_MS
  } else if (
    urlStr.includes('erp_attendance_punches') ||
    urlStr.includes('admin_attendance_register')
  ) {
    // Month register / punch scans under RLS need more headroom than default GETs.
    timeoutMs = HEAVY_REST_FETCH_TIMEOUT_MS
  }
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return { signal: AbortSignal.timeout(timeoutMs), clearTimer: () => {} }
  }
  const c = new AbortController()
  const tid = setTimeout(() => c.abort(), timeoutMs)
  return {
    signal: c.signal,
    clearTimer: () => clearTimeout(tid),
  }
}

/** Module data calls must wait for JWT hydration or RLS returns empty rows. */
function fetchNeedsSessionHydration(urlStr) {
  return (
    urlStr.includes('/rest/v1/') ||
    urlStr.includes('/storage/v1/') ||
    (urlStr.includes('/functions/v1/') && !urlStr.includes('/functions/v1/login-check'))
  );
}

/** Attach user JWT from localStorage — avoids setSession/getSession auth lock that blocks login. */
async function applyCachedUserAuthHeader(urlStr, options = {}) {
  if (!fetchNeedsSessionHydration(urlStr)) return options;
  let token = readCachedAccessToken();
  if ((!token || isCachedAccessTokenExpired()) && hasCachedRefreshToken()) {
    const fresh = await ensureFreshCachedSession({
      forceRefresh: !token || isCachedAccessTokenExpired(0),
      refreshIfWithinSeconds: 120,
    });
    token = fresh?.access_token || readCachedAccessToken();
  }
  // Prefer a still-usable JWT; if refresh failed keep trying with cached token only when not hard-expired.
  if (!token || isCachedAccessTokenExpired(0)) return options;

  const headers = new Headers(options.headers || {});
  const existing = headers.get('Authorization') || '';
  // Prefer user JWT over anon key on every module REST/storage request.
  if (!existing || existing === `Bearer ${supabaseAnonKey}` || !existing.startsWith('Bearer ey')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return { ...options, headers };
}

let supabaseClientRef = null;

const customFetch = async (url, options = {}) => {
  const pathLog = shortUrlForLog(url)
  const urlStr = String(url)
  const method = String(options?.method || 'GET').toUpperCase()
  const restTable = parseRestTableName(urlStr)

  // Known / previously missing relations: never hit the network on reads.
  if (restTable && missingRestRelations.has(restTable) && (method === 'GET' || method === 'HEAD')) {
    return emptyRestListResponse(method)
  }

  // Collapse parallel first-probes for the same table (avoids double browser 404).
  if (restTable && (method === 'GET' || method === 'HEAD')) {
    const inflight = restRelationProbeInflight.get(restTable)
    if (inflight) {
      const shared = await inflight
      if (missingRestRelations.has(restTable)) return emptyRestListResponse(method)
      // Re-run only if the shared probe succeeded (table exists).
      if (shared?.ok) {
        /* fall through to own request */
      } else if (shared) {
        return emptyRestListResponse(method)
      }
    }
  }

  const fetchOptions = await applyCachedUserAuthHeader(urlStr, options)
  const { signal, clearTimer } = resolveFetchSignal(fetchOptions, url)
  if (signal !== undefined) fetchOptions.signal = signal

  let probeResolve
  if (restTable && (method === 'GET' || method === 'HEAD') && !restRelationProbeInflight.has(restTable)) {
    restRelationProbeInflight.set(
      restTable,
      new Promise((resolve) => {
        probeResolve = resolve
      })
    )
  }

  try {
    const res = await baseFetch(url, fetchOptions)
    clearTimer()

    // Activity log for mutations (batched). Keep payload minimal to avoid load/PII.
    if (shouldLogRequest(url, options)) {
      const entity = parseRestEntity(url)
      const route = typeof window !== 'undefined' ? window.location.pathname : null
      const bodyCandidate = options.body

      // Parse response only for logged mutations (generated fields like tax_invoice_number).
      let responseRow = null
      try {
        const ct = res.headers.get('content-type') || ''
        if (ct.includes('application/json')) {
          const text = await res.clone().text()
          if (text && text.length <= 96000) {
            responseRow = tryParseJsonBody(text)
          }
        }
      } catch {
        /* ignore — Prefer: return=minimal yields empty body */
      }

      const details = buildActivityDetails(method, entity, route, url, bodyCandidate, responseRow)
      if (details.summary) {
        enqueueActivityLog({
          action: details.action,
          entity,
          route,
          module: details.module || details.screen || null,
          record_ref: details.record_ref || null,
          success: res.ok,
          status_code: res.status,
          details: {
            path: pathLog,
            summary: details.summary,
            badge: details.badge,
            detail: details.detail || null,
            entity_label: details.entity_label || null,
            screen: details.screen || null,
            module: details.module || details.screen || null,
            record_ref: details.record_ref || null,
            http_method: details.http_method || method,
          },
        })
      }
    }

    if (!res.ok) {
      let raw = ''
      let detail = ''
      try {
        const ct = res.headers.get('content-type') || ''
        const clone = res.clone()
        raw = await clone.text()
        if (ct.includes('application/json')) {
          try {
            const j = JSON.parse(raw)
            detail = j.message || j.error_description || j.hint || j.code || raw.slice(0, 400)
          } catch {
            detail = raw.slice(0, 400)
          }
        } else {
          detail = raw.slice(0, 400)
        }
      } catch {
        /* ignore body read failures */
      }

      const missing = restTable && looksLikeMissingRelation(res.status, `${detail}\n${raw}`)
      if (missing) {
        markRestRelationMissing(restTable)
        if (import.meta.env.DEV && !missingRestRelationsLogged.has(restTable)) {
          missingRestRelationsLogged.add(restTable)
          console.info(
            `[Supabase] Relation "${restTable}" is not in this project's schema — further reads will return empty until reload.`
          )
        }
        probeResolve?.({ ok: false, missing: true })
      } else if (import.meta.env.DEV) {
        const skipStagingBillingNoise =
          import.meta.env.MODE === 'staging' &&
          res.status === 406 &&
          pathLog.includes('po_wo')
        if (!skipStagingBillingNoise) {
          console.warn(`[Supabase fetch] ${method} ${pathLog} → HTTP ${res.status}`, detail || '(no body)')
        }
        probeResolve?.({ ok: false, missing: false })
      } else {
        probeResolve?.({ ok: false, missing: false })
      }
    } else {
      probeResolve?.({ ok: true })
    }

    if (restTable) restRelationProbeInflight.delete(restTable)
    return res
  } catch (err) {
    clearTimer()
    probeResolve?.({ ok: false, missing: false })
    if (restTable) restRelationProbeInflight.delete(restTable)
    // Keep AbortError as-is so supabase-js cancellation/retries behave correctly.
    if (err?.name === 'AbortError') {
      throw err
    }
    if (isTimeoutError(err)) {
      if (String(pathLog).includes('erp_attendance_punches')) {
        throw new Error(
          'Saving attendance punches timed out. Try Sync again; the server now saves punches in smaller batches.'
        )
      }
      throw new Error(
        `Supabase request timed out (${pathLog}). Check internet, firewall/VPN, or Supabase project availability.`
      )
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

/** Public teams/modules config — always uses anon key (avoids 401 when session JWT is invalid). */
export async function fetchPublicAppAccessConfig() {
  if (!isConfigured) {
    return { data: null, error: new Error('Supabase env not configured') }
  }
  const base = String(supabaseUrl).replace(/\/+$/, '')
  const params = new URLSearchParams({
    select: 'id,teams,modules,module_path_prefixes,updated_at',
    id: 'eq.default',
  })
  const url = `${base}/rest/v1/erp_app_access_config?${params}`
  try {
    const res = await baseFetch(url, {
      method: 'GET',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
        Accept: 'application/json',
      },
    })
    if (!res.ok) {
      let detail = ''
      try {
        const body = await res.json()
        detail = body?.hint || body?.message || ''
      } catch {
        /* ignore */
      }
      const stagingHint =
        import.meta.env.MODE === 'staging' &&
        (res.status === 401 || String(detail).toLowerCase().includes('permission denied'))
          ? ' Run supabase/staging_bootstrap.sql then staging_fix_403.sql in staging Supabase SQL Editor (project xjzhlbpgnpcmbdlufhwo).'
          : ''
      return {
        data: null,
        error: new Error(`HTTP ${res.status}${detail ? `: ${detail}` : ''}${stagingHint}`),
      }
    }
    const rows = await res.json()
    const row = Array.isArray(rows) ? rows[0] : null
    return { data: row ?? null, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: customFetch },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
    storageKey: SUPABASE_AUTH_STORAGE_KEY,
  },
})

supabaseClientRef = supabase

/**
 * Check if Supabase is reachable and env is configured.
 * Use this to show a clear error on the other machine when data doesn't load.
 * @returns {{ ok: boolean, message?: string }}
 */
const CONNECTION_CHECK_TIMEOUT_MS = 12000

function withTimeout(promise, ms, label = 'Connection check') {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
    }),
  ])
}

export async function checkSupabaseConnection() {
  if (!isConfigured) {
    return {
      ok: false,
      message: 'Environment not configured. Add a .env file with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then restart the dev server (npm run dev).',
    };
  }
  try {
    // Do not use getSession() here — it may trigger token refresh on /auth/v1/ with no timeout
    // and leave production stuck on "Checking connection…" when refresh hangs.
    await withTimeout(pingSupabaseRest(), CONNECTION_CHECK_TIMEOUT_MS, 'Supabase health check')

    if (useStrictSupabaseHealthCheck) {
      const base = String(supabaseUrl).replace(/\/+$/, '')
      const url = `${base}/rest/v1/`
      await withTimeout(
        baseFetch(url, {
          method: 'HEAD',
          headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` },
          signal: typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
            ? AbortSignal.timeout(CONNECTION_CHECK_TIMEOUT_MS)
            : undefined,
        }),
        CONNECTION_CHECK_TIMEOUT_MS,
        'Supabase REST check'
      )
    }
    return { ok: true };
  } catch (err) {
    const msg = err?.message || String(err);
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || isTimeoutError(err)) {
      return {
        ok: false,
        message: 'Network timeout: cannot reach Supabase. Check internet connection, firewall, VPN, or Supabase project availability.',
      };
    }
    return {
      ok: false,
      message: msg || 'Could not connect to the server.',
    };
  }
}

/**
 * Invoke an Edge Function with the signed-in user's access JWT.
 * supabase.functions.invoke falls back to the anon key when getSession() is briefly empty
 * (common right after sign-in / onAuthStateChange), which makes login-check return "Invalid token".
 *
 * @param {string} name
 * @param {{ body?: unknown, method?: string, headers?: Record<string, string> }} [options]
 * @param {string} [accessToken] optional token (e.g. from signInWithPassword result)
 */
export async function invokeAuthenticatedFunction(name, options = {}, accessToken) {
  let token = accessToken
  if (!token) {
    const { data } = await supabase.auth.getSession()
    token = data?.session?.access_token
  }
  if (!token) {
    return {
      data: null,
      error: { message: 'Not signed in', name: 'FunctionsError', context: null },
    }
  }

  const base = String(supabaseUrl).replace(/\/+$/, '')
  const url = `${base}/functions/v1/${name}`
  const method = String(options.method || 'POST').toUpperCase()
  const body =
    options.body !== undefined && method !== 'GET' && method !== 'HEAD'
      ? JSON.stringify(options.body)
      : undefined

  try {
    const fnTimeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 15000
    const fetchSignal =
      typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(fnTimeoutMs)
        : undefined
    const res = await baseFetch(url, {
      method,
      signal: fetchSignal,
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      body,
    })

    let data = null
    const text = await res.text()
    if (text) {
      try {
        data = JSON.parse(text)
      } catch {
        data = { raw: text }
      }
    }

    if (!res.ok) {
      return {
        data,
        error: {
          message: `Edge Function returned a non-2xx status code: ${res.status}`,
          name: 'FunctionsHttpError',
          context: {
            status: res.status,
            json: async () => data ?? {},
          },
        },
      }
    }
    return { data, error: null }
  } catch (err) {
    return {
      data: null,
      error: {
        message: err?.message || String(err),
        name: 'FunctionsFetchError',
        context: null,
      },
    }
  }
}

/**
 * Edge Functions return a generic message on 4xx/5xx; read JSON body when available.
 * @param {import('@supabase/supabase-js').FunctionsError | null} fnError
 * @param {Record<string, unknown> | null} [data]
 */
export async function parseEdgeFunctionError(fnError, data) {
  if (data?.error && typeof data.error === 'string') {
    const hint = typeof data.hint === 'string' && data.hint.trim() ? data.hint.trim() : ''
    return hint ? `${data.error} (${hint})` : data.error
  }
  if (data?.message && typeof data.message === 'string') return data.message
  const ctx = fnError?.context
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = await ctx.json()
      if (body?.error) return String(body.error)
      if (body?.message) return String(body.message)
    } catch (_) {
      /* ignore */
    }
  }
  const msg = fnError?.message || ''
  if (msg && !msg.includes('non-2xx')) return msg
  return 'Request failed. Check your role, password (min 6 chars), and that the email is not already registered.'
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
