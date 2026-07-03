/**
 * Supabase Edge Function: admin-bulk-delete-users
 * Bulk delete auth users + profiles. Supports dry_run preview.
 *
 * Deploy: supabase functions deploy admin-bulk-delete-users --no-verify-jwt
 */

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { resolveAuthUser } from '../_shared/resolveAuthUser.ts'

const FN_VERSION = '20260703-bulk-delete-1'
const MAX_BATCH_SIZE = 100
const ALLOWED_DELETER_ROLES = new Set(['admin', 'super_admin', 'super_admin_pro'])
const PROTECTED_TARGET_ROLES = new Set(['super_admin', 'super_admin_pro'])

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

type DeleteRow = {
  row?: number
  email?: string
  employee_code?: string
}

type BulkBody = {
  users?: DeleteRow[]
  dry_run?: boolean
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

function createServiceClient(url: string, serviceRoleKey: string): SupabaseClient {
  return createClient(url.replace(/\/+$/, ''), serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function readCallerRole(db: SupabaseClient, callerId: string): Promise<string> {
  const { data } = await db.from('profiles').select('role').eq('id', callerId).maybeSingle()
  return String(data?.role ?? '').trim()
}

type ProfileMatch = {
  id: string
  email?: string | null
  employee_code?: string | null
  role?: string | null
  username?: string | null
}

async function resolveProfile(
  db: SupabaseClient,
  row: DeleteRow,
): Promise<{ profile: ProfileMatch | null; error: string | null }> {
  const email = normalizeEmail(row.email)
  const employeeCode = normalizeEmployeeCode(row.employee_code)

  if (!email && !employeeCode) {
    return { profile: null, error: 'email or employee_code is required' }
  }

  if (email) {
    const { data, error } = await db
      .from('profiles')
      .select('id, email, employee_code, role, username')
      .ilike('email', email)
      .maybeSingle()
    if (error) return { profile: null, error: error.message }
    if (data?.id) return { profile: data as ProfileMatch, error: null }
  }

  if (employeeCode) {
    const { data, error } = await db
      .from('profiles')
      .select('id, email, employee_code, role, username')
      .ilike('employee_code', employeeCode)
      .maybeSingle()
    if (error) return { profile: null, error: error.message }
    if (data?.id) return { profile: data as ProfileMatch, error: null }
  }

  return { profile: null, error: 'User not found' }
}

async function deleteProfileRecords(db: SupabaseClient, id: string): Promise<void> {
  try {
    await db.from('profiles').delete().eq('id', id)
  } catch {
    /* ignore */
  }
  try {
    await db.from('app_users').delete().eq('id', id)
  } catch {
    /* ignore */
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return json(200, { ok: true })
  if (req.method !== 'POST') {
    return json(405, { ok: false, error: 'Method not allowed', version: FN_VERSION })
  }

  try {
    const supabaseUrl = (Deno.env.get('SUPABASE_URL') ?? '').trim()
    const serviceRoleKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim()
    if (!supabaseUrl || !serviceRoleKey) {
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

    let body: BulkBody
    try {
      body = (await req.json()) as BulkBody
    } catch {
      return json(400, { ok: false, error: 'Invalid JSON body', version: FN_VERSION })
    }

    const users = Array.isArray(body.users) ? body.users : []
    const dryRun = body.dry_run === true

    if (!users.length) {
      return json(400, { ok: false, error: 'users array is required', version: FN_VERSION })
    }
    if (users.length > MAX_BATCH_SIZE) {
      return json(400, {
        ok: false,
        error: `Maximum ${MAX_BATCH_SIZE} users per batch.`,
        version: FN_VERSION,
      })
    }

    const caller = await resolveAuthUser(jwt, supabaseUrl, serviceRoleKey)
    if (!caller?.id) {
      return json(401, { ok: false, error: 'Invalid or expired token', version: FN_VERSION })
    }

    const db = createServiceClient(supabaseUrl, serviceRoleKey)
    const callerRole = await readCallerRole(db, caller.id)
    if (!ALLOWED_DELETER_ROLES.has(callerRole)) {
      return json(403, {
        ok: false,
        error: 'Only Admin or Super Admin can delete users',
        version: FN_VERSION,
      })
    }

    const results: Record<string, unknown>[] = []
    let deleted = 0
    let failed = 0

    for (let i = 0; i < users.length; i++) {
      const rowNum = Number(users[i]?.row) > 0 ? Number(users[i].row) : i + 2
      const { profile, error: resolveErr } = await resolveProfile(db, users[i])

      if (!profile?.id) {
        failed += 1
        results.push({
          row: rowNum,
          ok: false,
          email: normalizeEmail(users[i]?.email) || undefined,
          employee_code: normalizeEmployeeCode(users[i]?.employee_code) || undefined,
          error: resolveErr || 'User not found',
        })
        continue
      }

      if (profile.id === caller.id) {
        failed += 1
        results.push({
          row: rowNum,
          ok: false,
          email: profile.email,
          employee_code: profile.employee_code,
          error: 'You cannot delete your own account.',
        })
        continue
      }

      const targetRole = String(profile.role ?? '').trim()
      if (callerRole === 'admin' && PROTECTED_TARGET_ROLES.has(targetRole)) {
        failed += 1
        results.push({
          row: rowNum,
          ok: false,
          email: profile.email,
          employee_code: profile.employee_code,
          error: 'Only Super Admin can delete Super Admin users',
        })
        continue
      }

      if (dryRun) {
        deleted += 1
        results.push({
          row: rowNum,
          ok: true,
          preview: true,
          user_id: profile.id,
          email: profile.email,
          employee_code: profile.employee_code,
          username: profile.username,
          role: profile.role,
        })
        continue
      }

      const { error: delAuthErr } = await db.auth.admin.deleteUser(profile.id)
      if (delAuthErr) {
        failed += 1
        results.push({
          row: rowNum,
          ok: false,
          email: profile.email,
          employee_code: profile.employee_code,
          error: delAuthErr.message || 'Could not delete auth user',
        })
        continue
      }

      await deleteProfileRecords(db, profile.id)
      deleted += 1
      results.push({
        row: rowNum,
        ok: true,
        user_id: profile.id,
        email: profile.email,
        employee_code: profile.employee_code,
      })
    }

    return json(200, {
      ok: true,
      version: FN_VERSION,
      dry_run: dryRun,
      results,
      summary: {
        total: users.length,
        deleted: dryRun ? 0 : deleted,
        preview: dryRun ? deleted : 0,
        failed,
      },
    })
  } catch (err) {
    return json(500, {
      ok: false,
      error: (err as Error)?.message ?? 'Internal server error',
      version: FN_VERSION,
    })
  }
})
