import { getSupabaseProjectRefFromUrl } from './supabaseConfig';

/** Staging Supabase project ref — must match .env.staging VITE_SUPABASE_URL */
export const STAGING_PROJECT_REF = 'xjzhlbpgnpcmbdlufhwo';

export function isStagingSupabaseProject() {
  return getSupabaseProjectRefFromUrl() === STAGING_PROJECT_REF;
}
