// Supabase Edge Function: admin-create-user
// Creates a new auth user + upserts `profiles` row.
//
// Deploy: supabase functions deploy admin-create-user --no-verify-jwt
//
// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { syncAppUsers } from '../_shared/syncAppUsers.ts'

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

async function findAuthUserByEmail(admin: ReturnType<typeof createClient>, email: string) {
  let page = 1
  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) return { user: null, error }
    const users = data?.users ?? []
    const found = users.find((u) => String(u.email || '').toLowerCase() === email)
    if (found) return { user: found, error: null }
    if (users.length < 200) break
    page += 1
  }
  return { user: null, error: null }
}

async function upsertProfile(
  admin: ReturnType<typeof createClient>,
  row: {
    id: string
    email: string
    username: string
    team: string | null
    role: string
    allowed_modules: string[]
  },
) {
  let { error } = await admin.from('profiles').upsert(row, { onConflict: 'id' })
  if (error && row.email) {
    const { data: orphan } = await admin
      .from('profiles')
      .select('id')
      .ilike('email', row.email)
      .maybeSingle()
    if (orphan?.id && orphan.id !== row.id) {
      await admin.from('profiles').delete().eq('id', orphan.id)
      const retry = await admin.from('profiles').upsert(row, { onConflict: 'id' })
      error = retry.error
    }
  }
  if (error) return { error }
  await syncAppUsers(admin, {
    id: row.id,
    email: row.email,
    username: row.username,
    role: row.role,
    team: row.team,
  })
  return { error: null }
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

  const { data: callerData, error: callerErr } = await admin.auth.getUser(jwt)
  if (callerErr || !callerData?.user) return json(401, { error: 'Invalid token' })

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

  const password = body.password ? String(body.password) : ''
  if (!password || password.length < 6) {
    return json(400, { error: 'Password is required (minimum 6 characters).' })
  }

  const username = body.username ? String(body.username).trim() : email.split('@')[0]
  const team = body.team ?? null
  const role = body.role ?? 'executive'
  const allowed = Array.isArray(body.allowed_modules) ? body.allowed_modules : []

  if (
    creatorRole === 'admin' &&
    (role === 'super_admin' || role === 'super_admin_pro')
  ) {
    return json(403, { error: 'Only Super Admin can assign Super Admin roles' })
  }

  const profileRow = {
    email,
    username,
    team,
    role,
    allowed_modules: allowed,
  }

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

  if (!createErr && created?.user) {
    const { error: profErr } = await upsertProfile(admin, {
      id: created.user.id,
      ...profileRow,
    })
    if (profErr) {
      return json(400, { error: `Auth user created but profile failed: ${profErr.message}` })
    }
    return json(200, {
      ok: true,
      user_id: created.user.id,
      email,
      auth_user: true,
      profile: true,
      app_users: true,
    })
  }

  const createMsg = String(createErr?.message || '').toLowerCase()
  const isDuplicate =
    createMsg.includes('already') ||
    createMsg.includes('registered') ||
    createMsg.includes('exists')

  if (!isDuplicate) {
    return json(400, { error: createErr?.message || 'Could not create auth user' })
  }

  // Email already in Auth — restore/link profile instead of failing opaque 400.
  const { user: existing, error: findErr } = await findAuthUserByEmail(admin, email)
  if (findErr) {
    return json(400, { error: createErr?.message || 'User already exists' })
  }
  if (!existing?.id) {
    return json(400, {
      error:
        'This email is already registered but could not be loaded. Remove the user in Supabase Authentication, then create again.',
    })
  }

  const { error: updateErr } = await admin.auth.admin.updateUserById(existing.id, {
    password,
    email_confirm: true,
    user_metadata: {
      full_name: username,
      team,
      role,
      allowed_modules: allowed,
    },
  })
  if (updateErr) {
    return json(400, { error: `User exists; could not update password: ${updateErr.message}` })
  }

  const { error: profErr } = await upsertProfile(admin, {
    id: existing.id,
    ...profileRow,
  })
  if (profErr) {
    return json(400, { error: `Profile save failed: ${profErr.message}` })
  }

  return json(200, { ok: true, user_id: existing.id, email, restored: true })
})
