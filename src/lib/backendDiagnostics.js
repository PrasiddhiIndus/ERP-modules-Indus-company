import { supabase } from './supabase'

const DEFAULT_TIMEOUT_MS = 8000

function withTimeout(promise, timeoutMs, timeoutMessage) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)),
  ])
}

async function checkRestRoot({ supabaseUrl, supabaseAnonKey }) {
  const url = `${String(supabaseUrl).replace(/\/+$/, '')}/rest/v1/`
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
  })
  return { ok: true, status: res.status }
}

async function checkRealtimeWebSocket({ supabaseUrl, supabaseAnonKey }) {
  const wsUrl = `${String(supabaseUrl)
    .replace(/^https:/i, 'wss:')
    .replace(/^http:/i, 'ws:')
    .replace(/\/+$/, '')}/realtime/v1/websocket?apikey=${encodeURIComponent(supabaseAnonKey)}&vsn=1.0.0`

  return await new Promise((resolve) => {
    let done = false
    const ws = new WebSocket(wsUrl)

    const finish = (result) => {
      if (done) return
      done = true
      try {
        ws.close()
      } catch {
        /* ignore */
      }
      resolve(result)
    }

    const t = setTimeout(() => finish({ ok: false, error: 'Realtime websocket timeout (likely blocked by proxy/firewall)' }), 5000)

    ws.onopen = () => {
      clearTimeout(t)
      finish({ ok: true })
    }
    ws.onerror = () => {
      clearTimeout(t)
      finish({ ok: false, error: 'Realtime websocket failed (blocked or network reset)' })
    }
    ws.onclose = () => {
      clearTimeout(t)
      if (!done) finish({ ok: false, error: 'Realtime websocket closed before open' })
    }
  })
}

async function safeTableCheck(label, operation) {
  const startedAt = Date.now()
  try {
    const { data, error } = await operation()
    if (error) {
      return {
        label,
        ok: false,
        kind: 'supabase_error',
        error: error.message || String(error),
        code: error.code || null,
        ms: Date.now() - startedAt,
      }
    }
    return {
      label,
      ok: true,
      kind: 'ok',
      rows: Array.isArray(data) ? data.length : data ? 1 : 0,
      ms: Date.now() - startedAt,
    }
  } catch (e) {
    return {
      label,
      ok: false,
      kind: 'exception',
      error: e?.message || String(e),
      ms: Date.now() - startedAt,
    }
  }
}

/**
 * Dev helper: run a quick end-to-end connectivity test for Supabase.
 * - Distinguishes "network blocked" from "schema not exposed" vs "RLS denied".
 * - Safe: only does small `select('id').limit(1)` reads.
 */
export async function runBackendDiagnostics(options = {}) {
  const supabaseUrl = options.supabaseUrl ?? import.meta.env.VITE_SUPABASE_URL
  const supabaseAnonKey = options.supabaseAnonKey ?? import.meta.env.VITE_SUPABASE_ANON_KEY

  const results = []

  if (!supabaseUrl || !supabaseAnonKey) {
    results.push({
      label: 'env',
      ok: false,
      kind: 'config',
      error: 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY (create .env and restart dev server).',
    })
    return results
  }

  // Network-level checks
  try {
    const r = await withTimeout(
      checkRestRoot({ supabaseUrl, supabaseAnonKey }),
      DEFAULT_TIMEOUT_MS,
      'REST root timeout'
    )
    results.push({ label: 'supabase_rest', ok: true, kind: 'http', status: r.status })
  } catch (e) {
    results.push({ label: 'supabase_rest', ok: false, kind: 'network', error: e?.message || String(e) })
  }

  try {
    const rt = await checkRealtimeWebSocket({ supabaseUrl, supabaseAnonKey })
    results.push({ label: 'supabase_realtime_ws', ...rt, kind: rt.ok ? 'ws' : 'ws_error' })
  } catch (e) {
    results.push({ label: 'supabase_realtime_ws', ok: false, kind: 'ws_error', error: e?.message || String(e) })
  }

  // Table checks (these can fail due to RLS/schema exposure even when network is OK)
  results.push(
    await safeTableCheck('billing.po_wo', () => supabase.schema('billing').from('po_wo').select('id').limit(1))
  )
  results.push(
    await safeTableCheck('billing.invoice', () => supabase.schema('billing').from('invoice').select('id').limit(1))
  )
  results.push(
    await safeTableCheck('public.manpower_enquiries', () => supabase.from('manpower_enquiries').select('id').limit(1))
  )
  results.push(await safeTableCheck('public.tenders', () => supabase.from('tenders').select('id').limit(1)))

  return results
}

