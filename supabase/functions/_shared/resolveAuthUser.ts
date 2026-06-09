// Resolve caller from access JWT (service-role getUser + Auth API fallback for ES256 keys).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

function userFromAuthBody(body: unknown) {
  if (!body || typeof body !== 'object') return null
  const b = body as { id?: string; user?: { id?: string } }
  if (b.id) return b as { id: string }
  if (b.user?.id) return b.user
  return null
}

export async function resolveAuthUser(jwt: string, supabaseUrl: string, serviceRoleKey: string) {
  const token = String(jwt || '').trim()
  if (!token) return null

  const base = supabaseUrl.replace(/\/+$/, '')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const apiKey = anonKey || serviceRoleKey

  if (anonKey) {
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: d1, error: e1 } = await userClient.auth.getUser()
    if (!e1 && d1?.user) return d1.user
  }

  try {
    const res = await fetch(`${base}/auth/v1/user`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: apiKey,
      },
    })
    if (res.ok) {
      const body = await res.json()
      const user = userFromAuthBody(body)
      if (user?.id) return user
    }
  } catch {
    /* try service-role getUser next */
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  const { data, error } = await admin.auth.getUser(token)
  if (!error && data?.user) return data.user

  return null
}
