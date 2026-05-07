// Supabase Edge Function: admin-delete-user
// Deletes a Supabase Auth user + removes `profiles` row.
//
// Deploy:
// supabase functions deploy admin-delete-user
// Secrets:
// supabase secrets set SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
//
// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

type Body = { id: string }

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
    return json(403, { error: 'Only Super Admin can delete users' })
  }

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return json(400, { error: 'Invalid JSON body' })
  }

  const id = String(body.id || '').trim()
  if (!id) return json(400, { error: 'id is required' })
  if (id === callerId) return json(400, { error: 'You cannot delete your own account.' })

  const { data: targetProfile } = await admin.from('profiles').select('role').eq('id', id).maybeSingle()
  const targetRole = targetProfile?.role

  // Super Admin can delete any user (except self).

  // Delete Auth user (this also invalidates credentials).
  const { error: delAuthErr } = await admin.auth.admin.deleteUser(id)
  if (delAuthErr) return json(400, { error: delAuthErr.message || 'Could not delete auth user' })

  // Best-effort cleanup profile row (should cascade, but keep safe).
  try {
    await admin.from('profiles').delete().eq('id', id)
  } catch {
    /* ignore */
  }

  return json(200, { ok: true })
})

