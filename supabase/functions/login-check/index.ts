// Supabase Edge Function: login-check
// Single source of truth for roles: public.profiles (never Auth metadata).
// - Verifies caller JWT
// - Ensures a profiles row exists (best-effort provisioning for legacy users)
// - Returns the profile used by the app for access + redirect
//
// Deploy:
// supabase functions deploy login-check --no-verify-jwt
//
// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { resolveAuthUser } from '../_shared/resolveAuthUser.ts'
import { syncAppUsers } from '../_shared/syncAppUsers.ts'
import {
  authMetadataHasPrivilegeKeys,
  nameOnlyUserMetadata,
  safeSelfSignupProfile,
} from '../_shared/safeSelfProfile.ts'

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
  const meta = u.user_metadata ?? {}

  const stripPrivilegeMetadata = async (profileRow) => {
    const metaRole = String(meta.role || '').trim()
    const profileRole = String(profileRow?.role || '').trim()
    const conflict =
      (metaRole && metaRole !== profileRole) ||
      (profileRow?.module_access_pending === true &&
        Array.isArray(meta.allowed_modules) &&
        meta.allowed_modules.length > 0)
    if (!authMetadataHasPrivilegeKeys(meta)) return
    if (profileRow && !conflict && profileRow.module_access_pending !== true) return
    try {
      await admin.auth.admin.updateUserById(userId, {
        user_metadata: nameOnlyUserMetadata(meta, email),
      })
    } catch {
      /* login must not fail if metadata cleanup is unavailable */
    }
  }

  const readProfile = async () => {
    let res = await admin
      .from('profiles')
      .select(
        'id, email, username, employee_code, team, role, allowed_modules, allowed_sub_modules, module_access_pending, is_active',
      )
      .eq('id', userId)
      .maybeSingle()
    const msg = String(res.error?.message || '').toLowerCase()
    if (res.error && msg.includes('is_active') && msg.includes('does not exist')) {
      res = await admin
        .from('profiles')
        .select(
          'id, email, username, employee_code, team, role, allowed_modules, allowed_sub_modules, module_access_pending',
        )
        .eq('id', userId)
        .maybeSingle()
      if (res.data) res.data.is_active = true
    }
    const msgPending = String(res.error?.message || '').toLowerCase()
    if (
      res.error &&
      (msgPending.includes('module_access_pending') ||
        msgPending.includes('employee_code') ||
        msgPending.includes('emp_code') ||
        msgPending.includes('allowed_sub_modules')) &&
      msgPending.includes('does not exist')
    ) {
      // Progressive fallback for DBs that have not applied newer profile columns yet.
      if (msgPending.includes('module_access_pending')) {
        res = await admin
          .from('profiles')
          .select('id, email, username, employee_code, team, role, allowed_modules, allowed_sub_modules')
          .eq('id', userId)
          .maybeSingle()
        if (res.data) {
          res.data.module_access_pending = false
          if (res.data.is_active === undefined) res.data.is_active = true
        }
      }
      const msg2 = String(res.error?.message || '').toLowerCase()
      if (
        res.error &&
        (msg2.includes('employee_code') || msg2.includes('emp_code') || msg2.includes('allowed_sub_modules')) &&
        msg2.includes('does not exist')
      ) {
        res = await admin
          .from('profiles')
          .select('id, email, username, team, role, allowed_modules')
          .eq('id', userId)
          .maybeSingle()
        if (res.data) {
          res.data.allowed_sub_modules = []
          res.data.module_access_pending = false
          res.data.is_active = true
        }
      }
    }
    return res
  }

  const { data: existing, error: readErr } = await readProfile()
  if (readErr) {
    return json(500, { ok: false, error: `Could not read profiles: ${readErr.message}` })
  }
  if (existing?.id) {
    if (existing.is_active === false) {
      return json(403, {
        ok: false,
        error: 'Your account is inactive. Contact your administrator.',
        code: 'account_inactive',
      })
    }
    await syncAppUsers(admin, {
      id: existing.id,
      email: existing.email ?? email,
      username: existing.username || (email?.split('@')[0] ?? 'user'),
      role: existing.role ?? 'executive',
      team: existing.team ?? null,
    })
    await stripPrivilegeMetadata(existing)
    return json(200, { ok: true, profile: existing })
  }

  // Missing row: executive stub only. Never copy metadata role / modules / team / employee_code.
  const profilePayload = safeSelfSignupProfile(userId, email, meta)

  const { error: upsertErr } = await admin.from('profiles').upsert(profilePayload, { onConflict: 'id' })

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
    username: createdProfile.username || profilePayload.username,
    role: createdProfile.role ?? 'executive',
    team: createdProfile.team ?? null,
  })
  await stripPrivilegeMetadata(createdProfile)

  return json(200, { ok: true, profile: createdProfile, provisioned: true })
})

