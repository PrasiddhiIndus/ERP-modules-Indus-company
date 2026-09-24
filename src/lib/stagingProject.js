import { getSupabaseProjectRefFromUrl } from './supabaseConfig';

/** Retired staging Supabase project ref — kept only to reject accidental use. */
export const STAGING_PROJECT_REF = 'xjzhlbpgnpcmbdlufhwo';

/** True only if the browser is still pointed at the retired staging project. */
export function isStagingSupabaseProject() {
  return getSupabaseProjectRefFromUrl() === STAGING_PROJECT_REF;
}
