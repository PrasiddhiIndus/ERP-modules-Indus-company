/**
 * Supabase Edge Function: hr-create-site-login
 * HR People Management — create an ERP login for a site employee (public.people).
 * Mirrors server/hrCreateSiteLoginApi.js. Authorization and link rules live in the
 * database (site_login_create_precheck, set_site_employee_login_access), called
 * with the caller's own token. An already-registered email is never taken over.
 *
 * Deploy: supabase functions deploy hr-create-site-login --no-verify-jwt
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { resolveAuthUser } from '../_shared/resolveAuthUser.ts'

const FN_VERSION = '20260930-site-login1'

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ ...body, version: FN_VERSION }), { status, headers: CORS_HEADERS })
}

function rpcStatus(error: { code?: string } | null): number {
  const code = String(error?.code ?? '')
  if (code === '42501') return 403
  if (code === 'P0002') return 404
  if (code === '23505') return 409
  if (code === '22023') return 400
  return 500
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return json(200, { ok: true })
  if (req.method !== 'POST') return json(405, { ok: false, error: 'Method not allowed' })

  try {
    const supabaseUrl = (Deno.env.get('SUPABASE_URL') ?? '').trim()
    const serviceRoleKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim()
    const anonKey = (Deno.env.get('SUPABASE_ANON_KEY') ?? '').trim()
    if (!supabaseUrl || !serviceRoleKey) {
      return json(500, { ok: false, error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' })
    }

    const authHeader = req.headers.get('Authorization') ?? ''
    const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
    if (!jwt) return json(401, { ok: false, error: 'Missing Authorization Bearer token' })

    const caller = await resolveAuthUser(jwt, supabaseUrl, serviceRoleKey)
    if (!caller?.id) return json(401, { ok: false, error: 'Invalid or expired session. Sign in again.' })

    const body = await req.json().catch(() => ({}))
    const personId = Number(body?.person_id)
    if (!Number.isFinite(personId) || personId <= 0) {
      return json(400, { ok: false, error: 'Site employee is required.' })
    }
    const email = String(body?.email ?? '').trim().toLowerCase()
    if (!email || !email.includes('@')) return json(400, { ok: false, error: 'A valid email is required.' })
    const password = String(body?.password ?? '').trim()
    if (password.length < 6) {
      return json(400, { ok: false, error: 'Temporary password must be at least 6 characters.' })
    }
    const subModules: string[] = Array.isArray(body?.allowed_sub_modules)
      ? body.allowed_sub_modules.map((s: unknown) => String(s).trim()).filter(Boolean)
      : []

    const userDb = createClient(supabaseUrl, anonKey || serviceRoleKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const serviceDb = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const pre = await userDb.rpc('site_login_create_precheck', { p_person_id: personId })
    if (pre.error) return json(rpcStatus(pre.error), { ok: false, error: pre.error.message })
    const employeeCode = String(pre.data?.employee_code ?? '').trim()
    const username = String(pre.data?.full_name ?? '').trim() || email.split('@')[0]

    const { data: created, error: createErr } = await serviceDb.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: username, username, employee_code: employeeCode, role: 'executive' },
    })
    let userId = created?.user?.id
    let resumed = false
    if (createErr) {
      const msg = String(createErr.message ?? '').toLowerCase()
      if (!(msg.includes('already') || msg.includes('registered') || msg.includes('exists'))) {
        return json(400, { ok: false, error: createErr.message || 'Could not create the login.' })
      }
      // Reuse only an orphan from an interrupted attempt for this same employee:
      // no profile row, and auth metadata carries this employee's code.
      let orphanId: string | null = null
      for (let page = 1; page <= 20 && !orphanId; page += 1) {
        const { data: list, error: listErr } = await serviceDb.auth.admin.listUsers({ page, perPage: 200 })
        if (listErr) break
        const users = list?.users ?? []
        const found = users.find((u) => String(u.email ?? '').toLowerCase() === email)
        if (found) {
          const metaCode = String(found.user_metadata?.employee_code ?? '').trim().toLowerCase()
          const { data: prof } = await serviceDb.from('profiles').select('id').eq('id', found.id).maybeSingle()
          if (metaCode && metaCode === employeeCode.toLowerCase() && !prof) orphanId = found.id
          break
        }
        if (users.length < 200) break
      }
      if (!orphanId) return json(409, { ok: false, error: 'This email already has a login. Use a different email.' })
      const { error: pwErr } = await serviceDb.auth.admin.updateUserById(orphanId, { password, email_confirm: true })
      if (pwErr) return json(500, { ok: false, error: `Could not finish the earlier attempt: ${pwErr.message}` })
      userId = orphanId
      resumed = true
    }
    if (!userId) return json(500, { ok: false, error: 'Login was not created. Please try again.' })

    const prof = await serviceDb.rpc('admin_upsert_profile', {
      p_id: userId,
      p_email: email,
      p_username: username,
      p_team: null,
      p_role: 'executive',
      p_allowed_modules: [],
      p_employee_code: employeeCode,
      p_set_employee_code: true,
      p_module_access_pending: true,
    })
    if (prof.error) {
      if (!resumed) await serviceDb.auth.admin.deleteUser(userId).catch(() => {})
      return json(500, { ok: false, error: `Could not save the login profile: ${prof.error.message}` })
    }

    const access = await userDb.rpc('set_site_employee_login_access', {
      p_person_id: personId,
      p_is_active: true,
      p_sub_modules: subModules,
    })

    return json(200, {
      ok: true,
      user_id: userId,
      email,
      employee_code: employeeCode,
      access_saved: !access.error,
      ...(access.error ? { warning: `Login created, but screens were not saved: ${access.error.message}` } : {}),
    })
  } catch (err) {
    console.error(`[hr-create-site-login ${FN_VERSION}]`, (err as Error)?.message)
    return json(500, { ok: false, error: (err as Error)?.message ?? 'Internal server error' })
  }
})
