/**
 * Supabase Edge Function: admin-create-user
 * Creates auth user + profiles row (service role, bypasses RLS).
 *
 * Deploy: supabase functions deploy admin-create-user --no-verify-jwt
 */

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { resolveAuthUser } from '../_shared/resolveAuthUser.ts'
import { syncAppUsers } from '../_shared/syncAppUsers.ts'

const FN_VERSION = '20260610-create1'

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

const ALLOWED_CREATOR_ROLES = new Set(['admin', 'super_admin', 'super_admin_pro'])

type CreateUserBody = {
  email?: string
  password?: string
  username?: string
  employee_code?: string | null
  emp_code?: string | null
  team?: string | null
  role?: string | null
  allowed_modules?: string[]
}

type ProfileRow = {
  id: string
  email?: string | null
  username?: string | null
  employee_code?: string | null
  team?: string | null
  role?: string | null
  allowed_modules?: string[]
}

function logError(message: string, extra?: unknown): void {
  if (extra !== undefined) console.error(`[admin-create-user ${FN_VERSION}] ${message}`, extra)
  else console.error(`[admin-create-user ${FN_VERSION}] ${message}`)
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS })
}

function normalizeEmail(raw: unknown): string {
  return String(raw ?? '').trim().toLowerCase()
}

function normalizeEmployeeCode(raw: unknown): string | null {
  const s = String(raw ?? '').trim()
  return s || null
}

function readEmployeeCode(body: CreateUserBody): string | null {
  const raw =
    body.employee_code !== undefined && body.employee_code !== null
      ? body.employee_code
      : body.emp_code
  return normalizeEmployeeCode(raw)
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
  if (typeof data === 'object' && (data as ProfileRow).id) return data as ProfileRow
  return null
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

function restHeaders(serviceRoleKey: string) {
  return { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` }
}

async function readCallerRole(
  db: SupabaseClient,
  supabaseUrl: string,
  serviceRoleKey: string,
  callerId: string,
): Promise<string> {
  const base = supabaseUrl.replace(/\/+$/, '')
  const res = await fetch(
    `${base}/rest/v1/profiles?id=eq.${encodeURIComponent(callerId)}&select=role`,
    { headers: restHeaders(serviceRoleKey) },
  )
  if (res.ok) {
    const rows = await res.json()
    const row = Array.isArray(rows) ? rows[0] : null
    if (row?.role) return String(row.role).trim()
  }
  const { data: rpcRole } = await db.rpc('get_profile_role', { p_id: callerId })
  if (typeof rpcRole === 'string' && rpcRole.trim()) return rpcRole.trim()
  return ''
}

async function findProfileByEmployeeCode(
  supabaseUrl: string,
  serviceRoleKey: string,
  employeeCode: string,
  excludeId?: string,
): Promise<{ taken: { id: string; email?: string | null } | null; error: string | null }> {
  const base = supabaseUrl.replace(/\/+$/, '')
  const res = await fetch(
    `${base}/rest/v1/profiles?select=id,email&employee_code=ilike.${encodeURIComponent(employeeCode)}&limit=1`,
    { headers: restHeaders(serviceRoleKey) },
  )
  const text = await res.text()
  if (!res.ok) return { taken: null, error: text || `HTTP ${res.status}` }
  const rows = text ? JSON.parse(text) : []
  const row = Array.isArray(rows) ? rows[0] : null
  if (row?.id && (!excludeId || row.id !== excludeId)) return { taken: row, error: null }
  return { taken: null, error: null }
}

async function findAuthUserByEmail(db: SupabaseClient, email: string) {
  let page = 1
  while (page <= 20) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 })
    if (error) return { user: null, error }
    const users = data?.users ?? []
    const found = users.find((u) => normalizeEmail(u.email) === email)
    if (found) return { user: found, error: null }
    if (users.length < 200) break
    page += 1
  }
  return { user: null, error: null }
}

async function upsertProfile(
  db: SupabaseClient,
  row: {
    id: string
    email: string
    username: string
    team: string | null
    role: string
    allowed_modules: string[]
    employee_code: string
  },
): Promise<{ error: string | null; profile: ProfileRow | null }> {
  const { data, error } = await db.rpc('admin_upsert_profile', {
    p_id: row.id,
    p_email: row.email,
    p_username: row.username,
    p_team: row.team,
    p_role: row.role,
    p_allowed_modules: row.allowed_modules,
    p_employee_code: row.employee_code,
    p_set_employee_code: true,
  })

  if (error) {
    logError('admin_upsert_profile RPC failed', { message: error.message, code: error.code })
    return { error: error.message, profile: null }
  }

  const profile = parseRpcProfile(data)
  if (!profile) {
    const fallback = await db
      .from('profiles')
      .upsert(row, { onConflict: 'id' })
      .select('id, email, username, employee_code, team, role, allowed_modules')
      .maybeSingle()
    if (fallback.error) return { error: fallback.error.message, profile: null }
    if (fallback.data?.id) {
      await syncAppUsers(db, {
        id: row.id,
        email: row.email,
        username: row.username,
        role: row.role,
        team: row.team,
      })
      return { error: null, profile: fallback.data as ProfileRow }
    }
    return { error: 'Profile upsert returned no row.', profile: null }
  }

  await syncAppUsers(db, {
    id: row.id,
    email: row.email,
    username: row.username,
    role: row.role,
    team: row.team,
  })
  return { error: null, profile }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return json(200, { ok: true })
  if (req.method !== 'POST') {
    return json(405, { ok: false, error: 'Method not allowed', version: FN_VERSION })
  }

  let requestBody: CreateUserBody | null = null

  try {
    const supabaseUrl = (Deno.env.get('SUPABASE_URL') ?? '').trim()
    const serviceRoleKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim()
    if (!supabaseUrl || !serviceRoleKey) {
      logError('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
      return json(500, {
        ok: false,
        error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
        version: FN_VERSION,
      })
    }

    const authHeader = req.headers.get('Authorization') ?? ''
    const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
    if (!jwt) {
      return json(401, { ok: false, error: 'Missing Authorization Bearer token', version: FN_VERSION })
    }

    let body: CreateUserBody
    try {
      const raw = await req.text()
      if (!raw.trim()) {
        return json(400, { ok: false, error: 'Request body is empty', version: FN_VERSION })
      }
      body = JSON.parse(raw) as CreateUserBody
      requestBody = body
    } catch (parseErr) {
      logError('Invalid JSON', parseErr)
      return json(400, { ok: false, error: 'Invalid JSON body', version: FN_VERSION })
    }

    const caller = await resolveAuthUser(jwt, supabaseUrl, serviceRoleKey)
    if (!caller?.id) {
      return json(401, { ok: false, error: 'Invalid or expired token', version: FN_VERSION })
    }

    const db = createServiceClient(supabaseUrl, serviceRoleKey)
    const creatorRole = await readCallerRole(db, supabaseUrl, serviceRoleKey, caller.id)
    if (!ALLOWED_CREATOR_ROLES.has(creatorRole)) {
      logError('Forbidden creator role', { callerId: caller.id, creatorRole })
      return json(403, {
        ok: false,
        error: 'Only Admin or Super Admin can create users',
        version: FN_VERSION,
      })
    }

    const email = normalizeEmail(body.email)
    if (!email || !email.includes('@')) {
      return json(400, { ok: false, error: 'Valid email is required', version: FN_VERSION })
    }

    const password = String(body.password ?? '').trim()
    if (password.length < 6) {
      return json(400, {
        ok: false,
        error: 'Password is required (minimum 6 characters).',
        version: FN_VERSION,
      })
    }

    const employeeCode = readEmployeeCode(body)
    if (!employeeCode) {
      return json(400, { ok: false, error: 'Employee code is required.', version: FN_VERSION })
    }

    const username = String(body.username ?? '').trim() || email.split('@')[0]
    const team = body.team ?? null
    const role = body.role ?? 'executive'
    const allowed = Array.isArray(body.allowed_modules) ? body.allowed_modules : []

    if (
      creatorRole === 'admin' &&
      (role === 'super_admin' || role === 'super_admin_pro')
    ) {
      return json(403, {
        ok: false,
        error: 'Only Super Admin can assign Super Admin roles',
        version: FN_VERSION,
      })
    }

    const codeCheck = await findProfileByEmployeeCode(supabaseUrl, serviceRoleKey, employeeCode)
    if (codeCheck.error) {
      logError('employee_code lookup failed', codeCheck.error)
      return json(500, { ok: false, error: codeCheck.error, version: FN_VERSION })
    }
    if (codeCheck.taken) {
      return json(409, {
        ok: false,
        error: `Employee code "${employeeCode}" is already assigned to ${codeCheck.taken.email || codeCheck.taken.id}.`,
        version: FN_VERSION,
      })
    }

    logError('create request', { email, employeeCode, role, team })

    const profilePayload = {
      email,
      username,
      team,
      role,
      allowed_modules: allowed,
      employee_code: employeeCode,
    }

    const { data: created, error: createErr } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: username,
        username,
        employee_code: employeeCode,
        team,
        role,
        allowed_modules: allowed,
      },
    })

    let userId = created?.user?.id ?? null
    let restored = false

    if (createErr) {
      const msg = String(createErr.message ?? '').toLowerCase()
      const isDuplicate =
        msg.includes('already') || msg.includes('registered') || msg.includes('exists')
      if (!isDuplicate) {
        logError('auth.admin.createUser failed', createErr.message)
        return json(400, {
          ok: false,
          error: createErr.message || 'Could not create auth user',
          version: FN_VERSION,
        })
      }

      const { user: existing, error: findErr } = await findAuthUserByEmail(db, email)
      if (findErr || !existing?.id) {
        return json(400, {
          ok: false,
          error:
            'This email is already registered but could not be loaded. Remove the user in Supabase Authentication, then create again.',
          version: FN_VERSION,
        })
      }

      userId = existing.id
      restored = true
      const { error: updateErr } = await db.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
        user_metadata: profilePayload,
      })
      if (updateErr) {
        return json(400, {
          ok: false,
          error: `User exists; could not update password: ${updateErr.message}`,
          version: FN_VERSION,
        })
      }

      const codeRestore = await findProfileByEmployeeCode(
        supabaseUrl,
        serviceRoleKey,
        employeeCode,
        userId,
      )
      if (codeRestore.taken) {
        return json(409, {
          ok: false,
          error: `Employee code "${employeeCode}" is already assigned to ${codeRestore.taken.email || codeRestore.taken.id}.`,
          version: FN_VERSION,
        })
      }
    }

    const { error: profErr, profile } = await upsertProfile(db, {
      id: userId!,
      ...profilePayload,
    })
    if (profErr) {
      logError('profile upsert failed', { userId, message: profErr })
      return json(500, {
        ok: false,
        error: `Auth user created but profile failed: ${profErr}`,
        hint: 'Run supabase/scripts/fix_profiles_save.sql if you see stack depth errors.',
        version: FN_VERSION,
      })
    }

    return json(200, {
      ok: true,
      user_id: userId,
      email,
      profile,
      restored,
      version: FN_VERSION,
    })
  } catch (err) {
    logError('unhandled exception', {
      message: (err as Error)?.message,
      stack: (err as Error)?.stack,
      body: requestBody,
    })
    return json(500, {
      ok: false,
      error: (err as Error)?.message ?? 'Internal server error',
      version: FN_VERSION,
    })
  }
})
