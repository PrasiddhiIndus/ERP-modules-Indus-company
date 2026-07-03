/**
 * Single-user create logic shared by admin-bulk-create-users.
 * Mirrors admin-create-user behavior (auth + profiles); passwords go to Supabase Auth only.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { syncAppUsers } from './syncAppUsers.ts'

export type CreateUserBody = {
  email?: string
  password?: string
  username?: string
  employee_code?: string | null
  emp_code?: string | null
  team?: string | null
  role?: string | null
  allowed_modules?: string[]
  no_module_access?: boolean
}

export type CreateUserResult =
  | { ok: true; user_id: string; email: string; restored: boolean }
  | { ok: false; error: string; status?: number }

type ProfileRow = {
  id: string
  email?: string | null
  username?: string | null
  employee_code?: string | null
  team?: string | null
  role?: string | null
  allowed_modules?: string[]
}

function normalizeEmail(raw: unknown): string {
  return String(raw ?? '').trim().toLowerCase()
}

function normalizeEmployeeCode(raw: unknown): string | null {
  const s = String(raw ?? '').trim()
  return s || null
}

function readEmployeeCode(body: CreateUserBody): string | null {
  const raw =
    body.employee_code !== undefined && body.employee_code !== null
      ? body.employee_code
      : body.emp_code
  return normalizeEmployeeCode(raw)
}

function parseRpcProfile(data: unknown): ProfileRow | null {
  if (!data) return null
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data) as ProfileRow
      return parsed?.id ? parsed : null
    } catch {
      return null
    }
  }
  if (typeof data === 'object' && (data as ProfileRow).id) return data as ProfileRow
  return null
}

function restHeaders(serviceRoleKey: string) {
  return { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` }
}

async function findProfileByEmployeeCode(
  db: SupabaseClient,
  supabaseUrl: string,
  serviceRoleKey: string,
  employeeCode: string,
  excludeId?: string,
): Promise<{ taken: { id: string; email?: string | null } | null; error: string | null }> {
  const { data: rpcRows, error: rpcErr } = await db.rpc('profile_employee_code_taken', {
    p_code: employeeCode,
    p_exclude_id: excludeId ?? null,
  })
  if (!rpcErr) {
    const row = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows
    if (row?.id) return { taken: row, error: null }
    return { taken: null, error: null }
  }

  const base = supabaseUrl.replace(/\/+$/, '')
  const res = await fetch(
    `${base}/rest/v1/profiles?select=id,email&employee_code=ilike.${encodeURIComponent(employeeCode)}&limit=1`,
    { headers: restHeaders(serviceRoleKey) },
  )
  const text = await res.text()
  if (!res.ok) return { taken: null, error: text || `HTTP ${res.status}` }
  const rows = text ? JSON.parse(text) : []
  const row = Array.isArray(rows) ? rows[0] : null
  if (row?.id && (!excludeId || row.id !== excludeId)) return { taken: row, error: null }
  return { taken: null, error: null }
}

async function findAuthUserByEmail(db: SupabaseClient, email: string) {
  let page = 1
  while (page <= 20) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 })
    if (error) return { user: null, error }
    const users = data?.users ?? []
    const found = users.find((u) => normalizeEmail(u.email) === email)
    if (found) return { user: found, error: null }
    if (users.length < 200) break
    page += 1
  }
  return { user: null, error: null }
}

async function upsertProfile(
  db: SupabaseClient,
  row: {
    id: string
    email: string
    username: string
    team: string | null
    role: string
    allowed_modules: string[]
    employee_code: string
  },
): Promise<{ error: string | null; profile: ProfileRow | null }> {
  const { data, error } = await db.rpc('admin_upsert_profile', {
    p_id: row.id,
    p_email: row.email,
    p_username: row.username,
    p_team: row.team,
    p_role: row.role,
    p_allowed_modules: row.allowed_modules,
    p_employee_code: row.employee_code,
    p_set_employee_code: true,
  })

  if (error) {
    return { error: error.message, profile: null }
  }

  const profile = parseRpcProfile(data)
  if (!profile) {
    const fallback = await db
      .from('profiles')
      .upsert(row, { onConflict: 'id' })
      .select('id, email, username, employee_code, team, role, allowed_modules')
      .maybeSingle()
    if (fallback.error) return { error: fallback.error.message, profile: null }
    if (fallback.data?.id) {
      await syncAppUsers(db, {
        id: row.id,
        email: row.email,
        username: row.username,
        role: row.role,
        team: row.team,
      })
      return { error: null, profile: fallback.data as ProfileRow }
    }
    return { error: 'Profile upsert returned no row.', profile: null }
  }

  await syncAppUsers(db, {
    id: row.id,
    email: row.email,
    username: row.username,
    role: row.role,
    team: row.team,
  })
  return { error: null, profile }
}

export async function createOneAdminUser(
  db: SupabaseClient,
  supabaseUrl: string,
  serviceRoleKey: string,
  creatorRole: string,
  body: CreateUserBody,
): Promise<CreateUserResult> {
  const email = normalizeEmail(body.email)
  if (!email || !email.includes('@')) {
    return { ok: false, error: 'Valid email is required', status: 400 }
  }

  const password = String(body.password ?? '').trim()
  if (password.length < 6) {
    return { ok: false, error: 'Password is required (minimum 6 characters).', status: 400 }
  }

  const employeeCode = readEmployeeCode(body)
  if (!employeeCode) {
    return { ok: false, error: 'Employee code is required.', status: 400 }
  }

  const username = String(body.username ?? '').trim() || email.split('@')[0]
  const noModuleAccess = body.no_module_access === true
  const team = body.team === '' || body.team === undefined ? null : (body.team ?? null)
  const role = body.role ?? 'executive'
  const allowed = noModuleAccess
    ? []
    : Array.isArray(body.allowed_modules)
      ? body.allowed_modules
      : []

  if (creatorRole === 'admin' && (role === 'super_admin' || role === 'super_admin_pro')) {
    return { ok: false, error: 'Only Super Admin can assign Super Admin roles', status: 403 }
  }

  const codeCheck = await findProfileByEmployeeCode(db, supabaseUrl, serviceRoleKey, employeeCode)
  if (codeCheck.error) {
    return { ok: false, error: codeCheck.error, status: 500 }
  }
  if (codeCheck.taken) {
    return {
      ok: false,
      error: `Employee code "${employeeCode}" is already assigned to ${codeCheck.taken.email || codeCheck.taken.id}.`,
      status: 409,
    }
  }

  const profilePayload = {
    email,
    username,
    team,
    role,
    allowed_modules: allowed,
    employee_code: employeeCode,
  }

  const authMetadata = {
    full_name: username,
    username,
    employee_code: employeeCode,
    team,
    role,
    allowed_modules: allowed,
    ...(noModuleAccess ? { module_access_pending: true } : { module_access_pending: false }),
  }

  const { data: created, error: createErr } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: authMetadata,
  })

  let userId = created?.user?.id ?? null
  let restored = false

  if (createErr) {
    const msg = String(createErr.message ?? '').toLowerCase()
    const isDuplicate =
      msg.includes('already') || msg.includes('registered') || msg.includes('exists')
    if (!isDuplicate) {
      return { ok: false, error: createErr.message || 'Could not create auth user', status: 400 }
    }

    const { user: existing, error: findErr } = await findAuthUserByEmail(db, email)
    if (findErr || !existing?.id) {
      return {
        ok: false,
        error:
          'This email is already registered but could not be loaded. Remove the user in Supabase Authentication, then create again.',
        status: 400,
      }
    }

    userId = existing.id
    restored = true
    const { error: updateErr } = await db.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
      user_metadata: {
        ...profilePayload,
        ...(noModuleAccess ? { module_access_pending: true } : { module_access_pending: false }),
      },
    })
    if (updateErr) {
      return { ok: false, error: `User exists; could not update password: ${updateErr.message}`, status: 400 }
    }

    const codeRestore = await findProfileByEmployeeCode(
      db,
      supabaseUrl,
      serviceRoleKey,
      employeeCode,
      userId,
    )
    if (codeRestore.taken) {
      return {
        ok: false,
        error: `Employee code "${employeeCode}" is already assigned to ${codeRestore.taken.email || codeRestore.taken.id}.`,
        status: 409,
      }
    }
  }

  const { error: profErr } = await upsertProfile(db, {
    id: userId!,
    ...profilePayload,
  })
  if (profErr) {
    return {
      ok: false,
      error: `Auth user created but profile failed: ${profErr}`,
      status: 500,
    }
  }

  return { ok: true, user_id: userId!, email, restored }
}
