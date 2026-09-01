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
import { safeSelfSignupProfile } from '../_shared/safeSelfProfile.ts'

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

  // Missing row: executive stub only. Never copy metadata role / modules / team / code.
  // Do not delete another profiles row if the email is already taken.
  const profilePayload = safeSelfSignupProfile(callerId, authUser.email ?? null, authUser.user_metadata ?? {})

  const { error: upsertErr } = await admin.from('profiles').upsert(profilePayload, { onConflict: 'id' })

  if (upsertErr) {
    return json(403, {
      ok: false,
      error: `Could not sync profile: ${upsertErr.message}. Ask admin to remove duplicate email in profiles.`,
    })
  }

  await syncAppUsers(admin, {
    id: callerId,
    email: authUser.email ?? null,
    username: profilePayload.username,
    role: 'executive',
    team: null,
  })

  return json(200, { ok: true, provisioned: true })
})

