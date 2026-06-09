/**
 * Supabase Edge Function: admin-update-profile
 *
 * Lets an authenticated admin update another user's profile row (team, role,
 * allowed_modules, employee_code). Uses the service role for DB writes so RLS
 * does not block the operation.
 *
 * Deploy:
 *   supabase functions deploy admin-update-profile --no-verify-jwt
 *
 * Required secrets (auto-injected on hosted Supabase; set manually for local serve):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional:
 *   SUPABASE_ANON_KEY (improves JWT validation for user access tokens)
 */

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { resolveAuthUser } from '../_shared/resolveAuthUser.ts'

const FN_VERSION = '20260610-prod1'

const PROFILE_SELECT =
  'id, email, username, employee_code, team, role, allowed_modules, created_at'

/** Roles allowed to call this function (normalized lowercase). */
const ALLOWED_CALLER_ROLES = new Set([
  'admin',
  'superadmin',
  'super_admin',
  'super_admin_pro',
])

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RequestBody = {
  /** Target user UUID (preferred by this ERP frontend). */
  id?: string
  /** Alias accepted for compatibility. */
  user_id?: string
  team?: string | null
  role?: string | null
  allowed_modules?: string[]
  employee_code?: string | null
  /** @deprecated use employee_code */
  emp_code?: string | null
}

type ProfileRow = {
  id: string
  email?: string | null
  username?: string | null
  employee_code?: string | null
  team?: string | null
  role?: string | null
  allowed_modules?: string[]
  created_at?: string
}

type ApiError = {
  message: string
  code?: string | null
  details?: string | null
  status?: number
}

type EnvConfig = {
  supabaseUrl: string
  serviceRoleKey: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function logError(message: string, extra?: unknown): void {
  if (extra !== undefined) {
    console.error(`[admin-update-profile ${FN_VERSION}] ${message}`, extra)
  } else {
    console.error(`[admin-update-profile ${FN_VERSION}] ${message}`)
  }
}

function logInfo(message: string, extra?: unknown): void {
  if (extra !== undefined) {
    console.log(`[admin-update-profile ${FN_VERSION}] ${message}`, extra)
  } else {
    console.log(`[admin-update-profile ${FN_VERSION}] ${message}`)
  }
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS })
}

function normalizeRole(role: string | null | undefined): string {
  return String(role ?? '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_')
}

function isAllowedCallerRole(role: string | null | undefined): boolean {
  const normalized = normalizeRole(role)
  if (!normalized) return false
  if (ALLOWED_CALLER_ROLES.has(normalized)) return true
  // Accept "superadmin" without underscore
  if (normalized === 'superadmin' || normalized === 'super_admin') return true
  return false
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

function normalizeEmployeeCode(raw: unknown): string | null {
  const s = String(raw ?? '').trim()
  return s || null
}

function readTargetUserId(body: RequestBody): string {
  return String(body.id ?? body.user_id ?? '').trim()
}

function readEmployeeCodeFromBody(body: RequestBody): string | undefined {
  if (body.employee_code !== undefined) return normalizeEmployeeCode(body.employee_code) ?? undefined
  if (body.emp_code !== undefined) return normalizeEmployeeCode(body.emp_code) ?? undefined
  return undefined
}

function sanitizeBodyForLog(body: RequestBody | null): Record<string, unknown> | null {
  if (!body || typeof body !== 'object') return null
  return {
    user_id: readTargetUserId(body) || null,
    team: body.team ?? null,
    role: body.role ?? null,
    employee_code:
      body.employee_code !== undefined
        ? body.employee_code
        : body.emp_code !== undefined
          ? body.emp_code
          : undefined,
    allowed_modules_count: Array.isArray(body.allowed_modules)
      ? body.allowed_modules.length
      : 0,
  }
}

function hasAtLeastOneUpdateField(body: RequestBody): boolean {
  return (
    body.team !== undefined ||
    body.role !== undefined ||
    body.allowed_modules !== undefined ||
    body.employee_code !== undefined ||
    body.emp_code !== undefined
  )
}

function parseRpcProfile(data: unknown): ProfileRow | null {
  if (!data) return null
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data) as ProfileRow
      return parsed?.id ? parsed : null
    } catch {
      return null
    }
  }
  if (typeof data === 'object' && (data as ProfileRow).id) {
    return data as ProfileRow
  }
  return null
}

function isServiceRoleKey(key: string): boolean {
  try {
    const parts = key.split('.')
    if (parts.length < 2) return false
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    const payload = JSON.parse(atob(padded)) as { role?: string }
    return payload?.role === 'service_role'
  } catch {
    return false
  }
}

function isStackDepthError(err: { message?: string } | null | undefined): boolean {
  return String(err?.message ?? '').toLowerCase().includes('stack depth')
}

function isRpcMissingError(err: { message?: string; code?: string } | null | undefined, fn: string): boolean {
  if (!err) return false
  return String(err.message ?? '').includes(fn) || String(err.code ?? '') === 'PGRST202'
}

function isDuplicateEmployeeCode(err: ApiError | null | undefined): boolean {
  if (!err) return false
  const msg = String(err.message ?? '').toLowerCase()
  return (
    String(err.code ?? '') === '23505' ||
    msg.includes('already assigned') ||
    msg.includes('duplicate key')
  )
}

function statusForSaveError(err: ApiError | null | undefined): number {
  if (!err) return 500
  if (isDuplicateEmployeeCode(err)) return 409
  if (Number(err.status) >= 400 && Number(err.status) < 600) return Number(err.status)
  return 500
}

function readEnv(): EnvConfig | { error: string } {
  const supabaseUrl = (Deno.env.get('SUPABASE_URL') ?? '').trim()
  const serviceRoleKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim()

  if (!supabaseUrl) {
    return { error: 'SUPABASE_URL is not set. Add it in Dashboard → Edge Functions → Secrets.' }
  }
  if (!serviceRoleKey) {
    return {
      error:
        'SUPABASE_SERVICE_ROLE_KEY is not set. Add the service_role key from Project Settings → API.',
    }
  }
  if (!isServiceRoleKey(serviceRoleKey)) {
    return {
      error:
        'SUPABASE_SERVICE_ROLE_KEY is not a valid service_role JWT. Use the service_role key, not anon.',
    }
  }

  return { supabaseUrl, serviceRoleKey }
}

function createServiceClient(url: string, serviceRoleKey: string): SupabaseClient {
  const base = url.replace(/\/+$/, '')
  return createClient(base, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
    },
  })
}

function restHeaders(serviceRoleKey: string): Record<string, string> {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  }
}

// ---------------------------------------------------------------------------
// Database (service role — bypasses RLS)
// ---------------------------------------------------------------------------

async function readProfileViaRest(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
  select = PROFILE_SELECT,
): Promise<{ data: ProfileRow | null; error: ApiError | null }> {
  const base = supabaseUrl.replace(/\/+$/, '')
  try {
    const res = await fetch(
      `${base}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=${encodeURIComponent(select)}`,
      { headers: restHeaders(serviceRoleKey) },
    )
    const text = await res.text()
    if (!res.ok) {
      let message = text || `HTTP ${res.status}`
      try {
        const parsed = JSON.parse(text) as { message?: string; error?: string }
        message = parsed.message ?? parsed.error ?? message
      } catch {
        /* keep raw */
      }
      return { data: null, error: { message, status: res.status } }
    }
    const rows = text ? (JSON.parse(text) as ProfileRow[]) : []
    const row = Array.isArray(rows) ? rows[0] : null
    return { data: row?.id ? row : null, error: null }
  } catch (err) {
    return { data: null, error: { message: (err as Error)?.message ?? String(err) } }
  }
}

async function readCallerRole(
  db: SupabaseClient,
  supabaseUrl: string,
  serviceRoleKey: string,
  callerId: string,
): Promise<{ role: string | null; error: ApiError | null }> {
  const rest = await readProfileViaRest(supabaseUrl, serviceRoleKey, callerId, 'role')
  if (!rest.error && rest.data?.role) {
    return { role: String(rest.data.role).trim(), error: null }
  }

  const { data: rpcRole, error: rpcErr } = await db.rpc('get_profile_role', { p_id: callerId })
  if (!rpcErr && typeof rpcRole === 'string' && rpcRole.trim()) {
    return { role: rpcRole.trim(), error: null }
  }

  if (rest.error && !isStackDepthError(rest.error)) {
    return { role: null, error: rest.error }
  }
  if (rpcErr && !isRpcMissingError(rpcErr, 'get_profile_role') && !isStackDepthError(rpcErr)) {
    return { role: null, error: { message: rpcErr.message, code: rpcErr.code } }
  }

  return { role: null, error: null }
}

async function patchProfileViaRest(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
  patch: Record<string, unknown>,
): Promise<{ data: ProfileRow | null; error: ApiError | null }> {
  const base = supabaseUrl.replace(/\/+$/, '')
  try {
    const res = await fetch(`${base}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      headers: {
        ...restHeaders(serviceRoleKey),
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(patch),
    })
    const text = await res.text()
    let rows: unknown = null
    if (text) {
      try {
        rows = JSON.parse(text)
      } catch {
        return { data: null, error: { message: text || `HTTP ${res.status}`, status: res.status } }
      }
    }
    if (!res.ok) {
      const body = rows as { message?: string; hint?: string; code?: string } | null
      const message = body?.message ?? body?.hint ?? text ?? `HTTP ${res.status}`
      return { data: null, error: { message: String(message), code: body?.code ?? null, status: res.status } }
    }
    const row = Array.isArray(rows) ? (rows as ProfileRow[])[0] : (rows as ProfileRow)
    if (row?.id) return { data: row, error: null }
    return readProfileViaRest(supabaseUrl, serviceRoleKey, userId)
  } catch (err) {
    return { data: null, error: { message: (err as Error)?.message ?? String(err) } }
  }
}

async function saveProfileViaRpc(
  db: SupabaseClient,
  args: {
    userId: string
    team: string | null
    role: string | null
    allowed: string[]
    employeeCode: string | undefined
    setEmployeeCode: boolean
  },
): Promise<{ profile: ProfileRow | null; error: ApiError | null }> {
  const { data, error } = await db.rpc('admin_save_profile', {
    p_id: args.userId,
    p_team: args.team,
    p_role: args.role,
    p_allowed_modules: args.allowed,
    p_employee_code: args.employeeCode ?? null,
    p_set_employee_code: args.setEmployeeCode,
  })

  if (error) {
    logError('admin_save_profile RPC failed', {
      userId: args.userId,
      code: error.code,
      message: error.message,
      details: error.details,
    })
    return { profile: null, error: { message: error.message, code: error.code, details: error.details } }
  }

  const profile = parseRpcProfile(data)
  if (profile) return { profile, error: null }

  logError('admin_save_profile returned no row', { userId: args.userId, dataType: typeof data })
  return { profile: null, error: { message: 'Target profile not found or not updated.', status: 404 } }
}

async function saveProfile(
  db: SupabaseClient,
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
  team: string | null,
  role: string | null,
  allowed: string[],
  employeeCode: string | undefined,
): Promise<{ profile: ProfileRow | null; error: ApiError | null }> {
  const setEmployeeCode = employeeCode !== undefined
  const patch: Record<string, unknown> = { team, role, allowed_modules: allowed }
  if (setEmployeeCode) patch.employee_code = employeeCode

  // Primary path: RPC with SECURITY DEFINER + row_security off (avoids RLS recursion).
  const rpc = await saveProfileViaRpc(db, {
    userId,
    team,
    role,
    allowed,
    employeeCode,
    setEmployeeCode,
  })
  if (rpc.profile?.id) return rpc

  let saveErr: ApiError | null = rpc.error
  if (saveErr && isRpcMissingError(saveErr, 'admin_save_profile')) {
    logInfo('admin_save_profile not deployed — REST fallback', { userId })
    saveErr = null
  } else if (saveErr && !isStackDepthError(saveErr)) {
    return { profile: null, error: saveErr }
  }

  // Fallback: direct REST PATCH with service_role (also bypasses RLS).
  const rest = await patchProfileViaRest(supabaseUrl, serviceRoleKey, userId, patch)
  if (rest.data?.id) return { profile: rest.data, error: null }
  if (rest.error) {
    logError('REST PATCH failed', { userId, message: rest.error.message })
    return { profile: null, error: rest.error }
  }

  return { profile: null, error: saveErr ?? { message: 'Profile update failed.', status: 500 } }
}

async function syncAuthMetadata(
  db: SupabaseClient,
  userId: string,
  meta: Record<string, unknown>,
): Promise<{ ok: boolean; warning?: string }> {
  try {
    const { error } = await db.auth.admin.updateUserById(userId, { user_metadata: meta })
    if (error) {
      logError('auth.admin.updateUserById failed (profile already saved)', {
        userId,
        message: error.message,
      })
      return { ok: false, warning: error.message }
    }
    return { ok: true }
  } catch (err) {
    logError('auth.admin.updateUserById threw', { userId, message: (err as Error)?.message })
    return { ok: false, warning: (err as Error)?.message ?? 'Auth metadata sync failed' }
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateBody(body: RequestBody): ApiError | null {
  const userId = readTargetUserId(body)
  if (!userId) {
    return { message: 'user_id (or id) is required', status: 400 }
  }
  if (!isUuid(userId)) {
    return { message: 'user_id must be a valid UUID', status: 400 }
  }
  if (!hasAtLeastOneUpdateField(body)) {
    return {
      message:
        'At least one update field is required: team, role, allowed_modules, or employee_code',
      status: 400,
    }
  }
  if (body.role != null && String(body.role).trim() === '') {
    return { message: 'role cannot be an empty string', status: 400 }
  }
  if (body.allowed_modules != null && !Array.isArray(body.allowed_modules)) {
    return { message: 'allowed_modules must be an array', status: 400 }
  }
  return null
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return jsonResponse(200, { ok: true })
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { ok: false, error: 'Method not allowed. Use POST.', version: FN_VERSION })
  }

  let requestBody: RequestBody | null = null

  try {
    // ── Environment ──────────────────────────────────────────────────────────
    const envResult = readEnv()
    if ('error' in envResult) {
      logError('Missing or invalid environment', envResult)
      return jsonResponse(500, { ok: false, error: envResult.error, version: FN_VERSION })
    }
    const { supabaseUrl, serviceRoleKey } = envResult

    // ── Auth header ──────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization') ?? ''
    const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
    if (!jwt) {
      return jsonResponse(401, {
        ok: false,
        error: 'Missing Authorization Bearer token. Sign in and retry.',
        version: FN_VERSION,
      })
    }

    // ── Body ─────────────────────────────────────────────────────────────────
    let body: RequestBody
    try {
      const raw = await req.text()
      if (!raw.trim()) {
        return jsonResponse(400, { ok: false, error: 'Request body is empty', version: FN_VERSION })
      }
      body = JSON.parse(raw) as RequestBody
      requestBody = body
    } catch (parseErr) {
      logError('Malformed JSON body', parseErr)
      return jsonResponse(400, { ok: false, error: 'Invalid JSON in request body', version: FN_VERSION })
    }

    logInfo('request', sanitizeBodyForLog(body))

    const validationError = validateBody(body)
    if (validationError) {
      return jsonResponse(validationError.status ?? 400, {
        ok: false,
        error: validationError.message,
        version: FN_VERSION,
      })
    }

    // ── Caller identity ────────────────────────────────────────────────────────
    const caller = await resolveAuthUser(jwt, supabaseUrl, serviceRoleKey)
    if (!caller?.id) {
      logError('Invalid or expired JWT')
      return jsonResponse(401, {
        ok: false,
        error: 'Invalid or expired session. Sign in again.',
        version: FN_VERSION,
      })
    }

    const db = createServiceClient(supabaseUrl, serviceRoleKey)

    // ── Caller must be admin / super admin ───────────────────────────────────
    const { role: callerRole, error: roleReadErr } = await readCallerRole(
      db,
      supabaseUrl,
      serviceRoleKey,
      caller.id,
    )

    if (roleReadErr) {
      logError('Failed to read caller role from profiles', {
        callerId: caller.id,
        message: roleReadErr.message,
      })
      return jsonResponse(500, {
        ok: false,
        error: `Could not verify caller role: ${roleReadErr.message}`,
        hint: isStackDepthError(roleReadErr)
          ? 'Run supabase/scripts/fix_profiles_save.sql in SQL Editor (RLS recursion fix).'
          : null,
        version: FN_VERSION,
      })
    }

    if (!isAllowedCallerRole(callerRole)) {
      logError('Forbidden — caller lacks admin role', { callerId: caller.id, callerRole })
      return jsonResponse(403, {
        ok: false,
        error: 'Only admin or super admin users can update profiles',
        caller_role: callerRole ?? null,
        version: FN_VERSION,
      })
    }

    // ── Apply update (service role) ────────────────────────────────────────────
    const userId = readTargetUserId(body)
    const team = body.team === '' ? null : (body.team ?? null)
    const role = body.role ?? null
    const allowed = Array.isArray(body.allowed_modules) ? body.allowed_modules : []
    const employeeCode = readEmployeeCodeFromBody(body)

    const { profile, error: saveErr } = await saveProfile(
      db,
      supabaseUrl,
      serviceRoleKey,
      userId,
      team,
      role,
      allowed,
      employeeCode,
    )

    if (saveErr) {
      const status = statusForSaveError(saveErr)
      logError('Profile save failed', {
        userId,
        status,
        message: saveErr.message,
        code: saveErr.code,
      })
      return jsonResponse(status, {
        ok: false,
        error: saveErr.message,
        code: saveErr.code ?? null,
        hint: isStackDepthError(saveErr)
          ? 'Run supabase/scripts/fix_profiles_save.sql in SQL Editor.'
          : null,
        version: FN_VERSION,
      })
    }

    if (!profile?.id) {
      logError('No profile returned after save', { userId })
      return jsonResponse(404, {
        ok: false,
        error: `No profile found for user_id ${userId}`,
        version: FN_VERSION,
      })
    }

    // ── Sync auth metadata (non-fatal) ─────────────────────────────────────────
    const metaSync = await syncAuthMetadata(db, userId, {
      team,
      role,
      allowed_modules: allowed,
      ...(employeeCode !== undefined ? { employee_code: employeeCode } : {}),
    })

    logInfo('success', { userId, metaSyncOk: metaSync.ok })

    return jsonResponse(200, {
      ok: true,
      profile,
      meta_sync: metaSync,
      version: FN_VERSION,
    })
  } catch (err) {
    logError('Unhandled exception', {
      message: (err as Error)?.message ?? String(err),
      stack: (err as Error)?.stack,
      payload: sanitizeBodyForLog(requestBody),
    })
    return jsonResponse(500, {
      ok: false,
      error: (err as Error)?.message ?? 'Internal server error',
      version: FN_VERSION,
    })
  }
})
