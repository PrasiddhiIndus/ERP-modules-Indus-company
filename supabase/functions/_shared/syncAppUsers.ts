// Best-effort sync legacy public.app_users from profiles / auth metadata.
// @ts-nocheck
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

export type AppUserSyncRow = {
  id: string
  email?: string | null
  username: string
  role?: string | null
  team?: string | null
}

/** Returns error message if sync failed; null if ok or table absent. */
export async function syncAppUsers(
  admin: SupabaseClient,
  row: AppUserSyncRow,
): Promise<string | null> {
  const payload: Record<string, unknown> = {
    id: row.id,
    email: row.email ?? null,
    full_name: row.username,
  }
  if (row.role != null) payload.role = row.role
  if (row.team != null) payload.team = row.team

  const { error } = await admin.from('app_users').upsert(payload, { onConflict: 'id' })
  if (!error) return null

  const msg = String(error.message || error)
  // Table missing or wrong schema — do not fail user create/login.
  if (
    msg.includes('does not exist') ||
    msg.includes('Could not find the table') ||
    msg.includes('schema cache')
  ) {
    return null
  }
  return msg
}
