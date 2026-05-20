// Supabase Edge Function: login-check
// Single source of truth for roles: public.profiles.
// - Verifies caller JWT
// - Ensures a profiles row exists (best-effort provisioning for legacy users)
// - Returns the profile used by the app for access + redirect
//
// Deploy:
// supabase functions deploy login-check --no-verify-jwt
//
// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { syncAppUsers } from '../_shared/syncAppUsers.ts'

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    },
  })
}

function normalizeRole(role: unknown) {
  const r = String(role || '').trim()
  if (!r) return 'executive'
  // Only allow the 4 roles the app supports.
  if (r === 'super_admin' || r === 'super_admin_pro' || r === 'admin' || r === 'manager' || r === 'executive') {
    return r
  }
  return 'executive'
}

/** Resolve caller from access JWT (service-role getUser + Auth API fallback for ES256 keys). */
async function resolveAuthUser(jwt: string, supabaseUrl: string, serviceRoleKey: string) {
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  const { data, error } = await admin.auth.getUser(jwt)
  if (!error && data?.user) return data.user

  const base = supabaseUrl.replace(/\/+$/, '')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const apiKey = anonKey || serviceRoleKey

  try {
    const res = await fetch(`${base}/auth/v1/user`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${jwt}`,
        apikey: apiKey,
      },
    })
    if (res.ok) {
      const body = await res.json()
      if (body?.id) return body
    }
  } catch {
    /* try anon client next */
  }

  if (anonKey) {
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: d2, error: e2 } = await userClient.auth.getUser()
    if (!e2 && d2?.user) return d2.user
  }

  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json(200, { ok: true })
  if (req.method !== 'POST') return json(405, { ok: false, error: 'Method not allowed' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { ok: false, error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' })
  }

  const authHeader = req.headers.get('Authorization') || ''
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : ''
  if (!jwt) return json(401, { ok: false, error: 'Missing Authorization Bearer token' })

  const u = await resolveAuthUser(jwt, supabaseUrl, serviceRoleKey)
  if (!u?.id) return json(401, { ok: false, error: 'Invalid token' })

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  const userId = u.id
  const email = u.email ?? null

  const readProfile = async () => {
    return await admin
      .from('profiles')
      .select('id, email, username, team, role, allowed_modules')
      .eq('id', userId)
      .maybeSingle()
  }

  const { data: existing, error: readErr } = await readProfile()
  if (readErr) {
    return json(500, { ok: false, error: `Could not read profiles: ${readErr.message}` })
  }
  if (existing?.id) {
    await syncAppUsers(admin, {
      id: existing.id,
      email: existing.email ?? email,
      username: existing.username || (email?.split('@')[0] ?? 'user'),
      role: existing.role ?? 'executive',
      team: existing.team ?? null,
    })
    return json(200, { ok: true, profile: existing })
  }

  // Provision missing profile row (legacy / recreated auth users).
  const meta = u.user_metadata ?? {}
  const username =
    (typeof meta.full_name === 'string' && meta.full_name) ||
    (typeof meta.username === 'string' && meta.username) ||
    (email?.split('@')[0] ?? 'user')
  const team = meta.team ?? null
  const role = normalizeRole(meta.role)
  const allowed = Array.isArray(meta.allowed_modules) ? meta.allowed_modules : []

  const profilePayload = {
    id: userId,
    email,
    username,
    team,
    role,
    allowed_modules: allowed,
  }

  let { error: upsertErr } = await admin.from('profiles').upsert(profilePayload, { onConflict: 'id' })

  // Clean up orphan profile row that blocks insertion (same email, different id).
  if (upsertErr && email) {
    const { data: orphan } = await admin.from('profiles').select('id').ilike('email', email).maybeSingle()
    if (orphan?.id && orphan.id !== userId) {
      await admin.from('profiles').delete().eq('id', orphan.id)
      const retry = await admin.from('profiles').upsert(profilePayload, { onConflict: 'id' })
      upsertErr = retry.error
    }
  }

  if (upsertErr) {
    return json(403, { ok: false, error: `Could not provision profile: ${upsertErr.message}` })
  }

  const { data: createdProfile } = await readProfile()
  if (!createdProfile?.id) {
    return json(500, { ok: false, error: 'Profile provisioning succeeded but row was not readable' })
  }

  await syncAppUsers(admin, {
    id: createdProfile.id,
    email: createdProfile.email ?? email,
    username: createdProfile.username || username,
    role: createdProfile.role ?? role,
    team: createdProfile.team ?? team,
  })

  return json(200, { ok: true, profile: createdProfile, provisioned: true })
})

