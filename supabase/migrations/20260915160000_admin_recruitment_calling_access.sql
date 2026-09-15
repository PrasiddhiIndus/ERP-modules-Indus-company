-- Admin Recruitment uses the same Calling Database as HR.
-- Grant table/RPC access to Admin module users (full admin or admin.recruitment*),
-- without opening every Admin sub-module (store/alerts/etc.) to candidate PII.
--
-- Helpers below are created here so this script can run even when
-- 20260831150000_role_based_admin_hr_access_align.sql was never applied.

CREATE OR REPLACE FUNCTION public.normalize_erp_role(raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE replace(lower(btrim(coalesce(raw, ''))), ' ', '_')
    WHEN 'hod' THEN 'admin'
    WHEN 'admin' THEN 'admin'
    WHEN 'superadmin' THEN 'super_admin'
    WHEN 'super_admin' THEN 'super_admin'
    WHEN 'superadmin_pro' THEN 'super_admin_pro'
    WHEN 'super_admin_pro' THEN 'super_admin_pro'
    ELSE replace(lower(btrim(coalesce(raw, ''))), ' ', '_')
  END
$$;

CREATE OR REPLACE FUNCTION public.normalize_erp_module_key(raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(btrim(coalesce(raw, '')))
    WHEN 'hr' THEN 'hr'
    WHEN 'dahej-hr' THEN 'hr'
    WHEN 'admin' THEN 'admin'
    WHEN 'administration' THEN 'admin'
    WHEN 'management' THEN 'admin'
    WHEN 'payroll' THEN 'payroll'
    ELSE lower(btrim(coalesce(raw, '')))
  END
$$;

CREATE OR REPLACE FUNCTION public.jsonb_text_array(src jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN jsonb_typeof(src) = 'array' THEN src ELSE '[]'::jsonb END
$$;

GRANT EXECUTE ON FUNCTION public.normalize_erp_role(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.normalize_erp_module_key(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.jsonb_text_array(jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.current_user_can_access_calling_master()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND auth.uid() IS NOT NULL
      AND (
        public.current_user_can_access_module('hr')
        OR public.normalize_erp_role(p.role) IN ('admin', 'super_admin', 'super_admin_pro')
        OR public.normalize_erp_module_key(p.team) = 'admin'
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(
            CASE
              WHEN jsonb_typeof(COALESCE(p.allowed_modules, '[]'::jsonb)) = 'array'
                THEN p.allowed_modules
              ELSE '[]'::jsonb
            END
          ) AS m(value)
          WHERE public.normalize_erp_module_key(m.value) = 'admin'
        )
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(
            CASE
              WHEN jsonb_typeof(COALESCE(p.allowed_sub_modules, '[]'::jsonb)) = 'array'
                THEN p.allowed_sub_modules
              ELSE '[]'::jsonb
            END
          ) AS s(value)
          WHERE s.value = 'admin.recruitment'
             OR s.value LIKE 'admin.recruitment.%'
             OR s.value = 'admin.employee'
        )
      )
  );
$$;

COMMENT ON FUNCTION public.current_user_can_access_calling_master() IS
  'True when the user may run Calling Database / Recruitment (HR module, full Admin, or admin.recruitment*).';

GRANT EXECUTE ON FUNCTION public.current_user_can_access_calling_master() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_can_access_calling_master() TO service_role;

-- ---------------------------------------------------------------------------
-- Calling Database RLS — same rows, HR or Admin recruitment
-- ---------------------------------------------------------------------------
ALTER POLICY hr_calling_dropdown_masters_select ON public.hr_calling_dropdown_masters
  USING (public.current_user_can_access_calling_master());
ALTER POLICY hr_calling_dropdown_masters_insert ON public.hr_calling_dropdown_masters
  WITH CHECK (public.current_user_can_access_calling_master());
ALTER POLICY hr_calling_dropdown_masters_update ON public.hr_calling_dropdown_masters
  USING (public.current_user_can_access_calling_master())
  WITH CHECK (public.current_user_can_access_calling_master());
ALTER POLICY hr_calling_dropdown_masters_delete ON public.hr_calling_dropdown_masters
  USING (public.current_user_can_access_calling_master());

ALTER POLICY hr_calling_dropdown_options_select ON public.hr_calling_dropdown_options
  USING (public.current_user_can_access_calling_master());
ALTER POLICY hr_calling_dropdown_options_insert ON public.hr_calling_dropdown_options
  WITH CHECK (public.current_user_can_access_calling_master());
ALTER POLICY hr_calling_dropdown_options_update ON public.hr_calling_dropdown_options
  USING (public.current_user_can_access_calling_master())
  WITH CHECK (public.current_user_can_access_calling_master());
ALTER POLICY hr_calling_dropdown_options_delete ON public.hr_calling_dropdown_options
  USING (public.current_user_can_access_calling_master());

ALTER POLICY hr_calling_candidates_select ON public.hr_calling_candidates
  USING (public.current_user_can_access_calling_master());
ALTER POLICY hr_calling_candidates_insert ON public.hr_calling_candidates
  WITH CHECK (public.current_user_can_access_calling_master());
ALTER POLICY hr_calling_candidates_update ON public.hr_calling_candidates
  USING (public.current_user_can_access_calling_master())
  WITH CHECK (public.current_user_can_access_calling_master());
ALTER POLICY hr_calling_candidates_delete ON public.hr_calling_candidates
  USING (public.current_user_can_access_calling_master());

ALTER POLICY hr_calling_offer_counters_select ON public.hr_calling_offer_counters
  USING (public.current_user_can_access_calling_master());
ALTER POLICY hr_calling_offer_counters_insert ON public.hr_calling_offer_counters
  WITH CHECK (public.current_user_can_access_calling_master());
ALTER POLICY hr_calling_offer_counters_update ON public.hr_calling_offer_counters
  USING (public.current_user_can_access_calling_master())
  WITH CHECK (public.current_user_can_access_calling_master());

ALTER POLICY hr_calling_settings_select ON public.hr_calling_settings
  USING (public.current_user_can_access_calling_master());
ALTER POLICY hr_calling_settings_insert ON public.hr_calling_settings
  WITH CHECK (public.current_user_can_access_calling_master());
ALTER POLICY hr_calling_settings_update ON public.hr_calling_settings
  USING (public.current_user_can_access_calling_master())
  WITH CHECK (public.current_user_can_access_calling_master());

ALTER POLICY hr_calling_reusable_emp_select ON public.hr_calling_reusable_employee_codes
  USING (public.current_user_can_access_calling_master());
ALTER POLICY hr_calling_reusable_ref_select ON public.hr_calling_reusable_offer_refs
  USING (public.current_user_can_access_calling_master());

-- Recruitment-sourced Site IOM rows: Admin recruiters can sync after confirm.
-- Full Site IOM register stays HR-gated via existing policies.
DROP POLICY IF EXISTS hr_site_iom_entries_recruitment_select ON public.hr_site_iom_entries;
DROP POLICY IF EXISTS hr_site_iom_entries_recruitment_update ON public.hr_site_iom_entries;

CREATE POLICY hr_site_iom_entries_recruitment_select
  ON public.hr_site_iom_entries FOR SELECT TO authenticated
  USING (
    public.current_user_can_access_calling_master()
    AND source_calling_candidate_id IS NOT NULL
  );

CREATE POLICY hr_site_iom_entries_recruitment_update
  ON public.hr_site_iom_entries FOR UPDATE TO authenticated
  USING (
    public.current_user_can_access_calling_master()
    AND source_calling_candidate_id IS NOT NULL
  )
  WITH CHECK (
    public.current_user_can_access_calling_master()
    AND source_calling_candidate_id IS NOT NULL
  );

-- ---------------------------------------------------------------------------
-- RPCs: swap HR-only guard for calling-master helper (keeps latest function bodies)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
  src text;
  updated integer := 0;
BEGIN
  FOR r IN
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND (
        p.proname LIKE 'hr_calling_%'
        OR p.proname = 'hr_allocate_shared_employee_code'
      )
  LOOP
    src := pg_get_functiondef(r.oid);
    IF src IS NULL THEN
      CONTINUE;
    END IF;
    IF src !~* 'current_user_can_access_module\(\s*''hr''\s*\)' THEN
      CONTINUE;
    END IF;
    src := regexp_replace(
      src,
      'current_user_can_access_module\(\s*''hr''\s*\)',
      'current_user_can_access_calling_master()',
      'gi'
    );
    EXECUTE src;
    updated := updated + 1;
  END LOOP;

  RAISE NOTICE 'admin_recruitment_calling_access: updated % calling RPCs', updated;
END;
$$;
