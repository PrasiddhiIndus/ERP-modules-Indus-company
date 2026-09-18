-- =============================================================================
-- Restore module access for people who already have a team, modules, or a
-- Super Admin role, but were locked to Settings by a stale pending flag.
--
-- Cause: login/signup stubs and privilege-guard writes could leave
-- module_access_pending = true on assigned profiles. The SPA treats that as
-- settings-only, so every module disappeared.
--
-- DATA: only clears the pending flag where access is already assigned.
-- Does not grant new modules or change role/team.
-- =============================================================================

UPDATE public.profiles
SET module_access_pending = false
WHERE module_access_pending IS TRUE
  AND (
    replace(lower(btrim(coalesce(role, ''))), ' ', '_') IN (
      'super_admin', 'superadmin', 'super_admin_pro', 'superadmin_pro'
    )
    OR NULLIF(btrim(coalesce(team, '')), '') IS NOT NULL
    OR CASE
         WHEN allowed_modules IS NULL THEN false
         WHEN jsonb_typeof(allowed_modules) = 'array' THEN jsonb_array_length(allowed_modules) > 0
         ELSE false
       END
    OR CASE
         WHEN allowed_sub_modules IS NULL THEN false
         WHEN jsonb_typeof(allowed_sub_modules) = 'array' THEN jsonb_array_length(allowed_sub_modules) > 0
         ELSE false
       END
  );

COMMENT ON COLUMN public.profiles.module_access_pending IS
  'True only for logins that exist but have not been assigned a team/modules yet. Assigned and Super Admin rows must stay false.';
