/**
 * Supabase Edge Function: admin-bulk-create-users
 * Bulk create auth users + profiles (service role). Continue on per-row errors.
 *
 * Deploy: supabase functions deploy admin-bulk-create-users --no-verify-jwt
 */

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { resolveAuthUser } from '../_shared/resolveAuthUser.ts'
import { createOneAdminUser, type CreateUserBody } from '../_shared/adminCreateOneUser.ts'

const FN_VERSION = '20260703-bulk-create-1'
const MAX_BATCH_SIZE = 100
const ALLOWED_CREATOR_ROLES = new Set(['admin', 'super_admin', 'super_admin_pro'])

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

type BulkRow = CreateUserBody & { row?: number }

type BulkBody = {
  users?: BulkRow[]
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS })
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
    const creatorRole = await readCallerRole(db, supabaseUrl, serviceRoleKey, caller.id)
    if (!ALLOWED_CREATOR_ROLES.has(creatorRole)) {
      return json(403, {
        ok: false,
        error: 'Only Admin or Super Admin can create users',
        version: FN_VERSION,
      })
    }

    const results: Record<string, unknown>[] = []
    let created = 0
    let failed = 0

    for (let i = 0; i < users.length; i++) {
      const rowNum = Number(users[i]?.row) > 0 ? Number(users[i].row) : i + 2
      const emailHint = String(users[i]?.email ?? '').trim().toLowerCase()
      const outcome = await createOneAdminUser(db, supabaseUrl, serviceRoleKey, creatorRole, users[i])
      if (outcome.ok) {
        created += 1
        results.push({
          row: rowNum,
          ok: true,
          email: outcome.email,
          user_id: outcome.user_id,
          restored: outcome.restored,
        })
      } else {
        failed += 1
        results.push({
          row: rowNum,
          ok: false,
          email: emailHint || undefined,
          error: outcome.error,
        })
      }
    }

    return json(200, {
      ok: true,
      version: FN_VERSION,
      results,
      summary: { total: users.length, created, failed },
    })
  } catch (err) {
    return json(500, {
      ok: false,
      error: (err as Error)?.message ?? 'Internal server error',
      version: FN_VERSION,
    })
  }
})
