// Supabase Edge Function: admin-update-profile
// Updates a user's profile (team/role/allowed_modules) (service role), for Super Admin/Super Admin Pro.
//
// Deploy:
// supabase functions deploy admin-update-profile
// Secrets:
// supabase secrets set SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
//
// @ts-nocheck

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

type Body = {
  id: string
  team?: string | null
  role?: string | null
  allowed_modules?: string[]
}

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

  const callerId = callerData.user.id
  const { data: callerProfile } = await admin.from('profiles').select('role').eq('id', callerId).maybeSingle()
  const callerRole = callerProfile?.role
  if (callerRole !== 'super_admin' && callerRole !== 'super_admin_pro') {
    return json(403, { error: 'Only Super Admin can update users' })
  }

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return json(400, { error: 'Invalid JSON body' })
  }

  const id = String(body.id || '').trim()
  if (!id) return json(400, { error: 'id is required' })

  const team = body.team === '' ? null : (body.team ?? null)
  const role = body.role ?? null
  const allowed = Array.isArray(body.allowed_modules) ? body.allowed_modules : []

  const { error: updErr } = await admin
    .from('profiles')
    .update({ team, role, allowed_modules: allowed })
    .eq('id', id)

  if (updErr) return json(500, { error: updErr.message || 'Failed to update profile' })
  return json(200, { ok: true })
})

