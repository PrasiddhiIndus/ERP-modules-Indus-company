// Supabase Edge Function: admin-create-user
// Creates a new auth user + upserts `profiles` row.
//
// Deploy:
// supabase functions deploy admin-create-user
// Set secrets:
// supabase secrets set SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
//
// This function requires the caller to be Super Admin (profiles.role = 'super_admin').
// @ts-nocheck

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

type CreateUserBody = {
  email: string
  password?: string
  username?: string
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

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  // Identify caller.
  const { data: callerData, error: callerErr } = await admin.auth.getUser(jwt)
  if (callerErr || !callerData?.user) return json(401, { error: 'Invalid token' })

  // Ensure Super Admin.
  const callerId = callerData.user.id
  const { data: callerProfile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', callerId)
    .maybeSingle()

  const creatorRole = callerProfile?.role
  if (
    creatorRole !== 'super_admin' &&
    creatorRole !== 'super_admin_pro' &&
    creatorRole !== 'admin'
  ) {
    return json(403, { error: 'Only Admin or Super Admin can create users' })
  }

  let body: CreateUserBody
  try {
    body = (await req.json()) as CreateUserBody
  } catch {
    return json(400, { error: 'Invalid JSON body' })
  }

  const email = String(body.email || '').trim().toLowerCase()
  if (!email || !email.includes('@')) return json(400, { error: 'Valid email is required' })

  const password = body.password ? String(body.password) : undefined
  const username = body.username ? String(body.username).trim() : email.split('@')[0]
  const team = body.team ?? null
  let role = body.role ?? 'executive'
  const allowed = Array.isArray(body.allowed_modules) ? body.allowed_modules : []

  if (
    creatorRole === 'admin' &&
    (role === 'super_admin' || role === 'super_admin_pro')
  ) {
    return json(403, { error: 'Only Super Admin can assign Super Admin roles' })
  }

  // Create auth user
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: username,
      team,
      role,
      allowed_modules: allowed,
    },
  })
  if (createErr || !created?.user) {
    return json(400, { error: createErr?.message || 'Could not create user' })
  }

  // Upsert profile
  await admin.from('profiles').upsert(
    {
      id: created.user.id,
      email,
      username,
      team,
      role,
      allowed_modules: allowed,
    },
    { onConflict: 'id' }
  )

  return json(200, { ok: true, user_id: created.user.id, email })
})

