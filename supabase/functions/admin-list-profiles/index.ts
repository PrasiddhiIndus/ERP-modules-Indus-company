// Supabase Edge Function: admin-list-profiles
// Lists profiles with pagination (service role), for Super Admin/Super Admin Pro.
//
// Deploy:
// supabase functions deploy admin-list-profiles
// Secrets:
// supabase secrets set SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
//
// @ts-nocheck

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

type Body = {
  page?: number
  page_size?: number
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
    return json(403, { error: 'Only Super Admin can view all users' })
  }

  let body: Body = {}
  try {
    body = (await req.json()) as Body
  } catch {
    body = {}
  }
  const page = Math.max(0, Number(body.page ?? 0) || 0)
  const pageSize = Math.min(50, Math.max(1, Number(body.page_size ?? 10) || 10))
  const from = page * pageSize
  const to = from + pageSize - 1

  const { data, error, count } = await admin
    .from('profiles')
    .select('id, email, username, team, role, allowed_modules, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) return json(500, { error: error.message || 'Failed to fetch profiles' })
  return json(200, { ok: true, data: data ?? [], count: count ?? 0 })
})

