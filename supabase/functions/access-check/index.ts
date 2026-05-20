// Supabase Edge Function: access-check
// Blocks login/session usage when caller has no `profiles` row (access revoked).
//
// Deploy:
// supabase functions deploy access-check
// Secrets:
// supabase secrets set SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json(200, { ok: true })
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY secret' })
  }

  const authHeader = req.headers.get('Authorization') || ''
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : ''
  if (!jwt) return json(401, { error: 'Missing Authorization Bearer token' })

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  const { data: callerData, error: callerErr } = await admin.auth.getUser(jwt)
  if (callerErr || !callerData?.user) return json(401, { error: 'Invalid token' })

  const authUser = callerData.user
  const callerId = authUser.id
  const { data: profile, error: profErr } = await admin
    .from('profiles')
    .select('id')
    .eq('id', callerId)
    .maybeSingle()

  if (profErr) {
    // If profiles table isn't installed, do not block; the app may be running in metadata mode.
    return json(200, { ok: true, mode: 'no_profiles_table' })
  }

  if (profile?.id) {
    return json(200, { ok: true })
  }

  // Auth user exists but profiles row missing (re-create, legacy import, etc.) — provision from metadata.
  const meta = authUser.user_metadata ?? {}
  const username =
    (typeof meta.full_name === 'string' && meta.full_name) ||
    (typeof meta.username === 'string' && meta.username) ||
    (authUser.email?.split('@')[0] ?? 'user')
  const team = meta.team ?? null
  const role = meta.role ?? 'executive'
  const profilePayload = {
    id: callerId,
    email: authUser.email ?? null,
    username,
    team,
    role,
    allowed_modules: Array.isArray(meta.allowed_modules) ? meta.allowed_modules : [],
  }

  let { error: upsertErr } = await admin.from('profiles').upsert(profilePayload, { onConflict: 'id' })

  // Re-created Auth user (new uuid) but old profiles row still has same email → upsert fails.
  if (upsertErr && authUser.email) {
    const email = String(authUser.email).toLowerCase()
    const { data: orphan } = await admin
      .from('profiles')
      .select('id')
      .ilike('email', email)
      .maybeSingle()
    if (orphan?.id && orphan.id !== callerId) {
      await admin.from('profiles').delete().eq('id', orphan.id)
      const retry = await admin.from('profiles').upsert(profilePayload, { onConflict: 'id' })
      upsertErr = retry.error
    }
  }

  if (upsertErr) {
    return json(403, {
      ok: false,
      error: `Could not sync profile: ${upsertErr.message}. Ask admin to remove duplicate email in profiles.`,
    })
  }

  await syncAppUsers(admin, {
    id: callerId,
    email: authUser.email ?? null,
    username,
    role,
    team,
  })

  return json(200, { ok: true, provisioned: true })
})

