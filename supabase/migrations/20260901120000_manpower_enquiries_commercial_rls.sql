-- =============================================================================
-- manpower_enquiries: shared Commercial board — not world-readable.
--
-- Intent
--   Commercial MT / RM / Sales share one enquiry pipeline.
--   Do NOT restrict to creator user_id (the board would look empty).
--   Marketing / Finance / random login must not dump the table.
--
-- Access
--   SELECT/INSERT/UPDATE/DELETE: admin|super_admin*|hod, or module/team
--   commercialMt | commercialRm | sales (incl. team alias "commercial").
--   DELETE stays with the Commercial board so list delete still works.
--
-- Do NOT restore USING (true) / *_authenticated / erp_auth_*.
-- DATA SAFETY: policy metadata only — no row changes.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.current_user_has_commercial_enquiry_access()
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
        replace(lower(btrim(coalesce(p.role, ''))), ' ', '_') IN (
          'admin', 'hod', 'super_admin', 'superadmin',
          'super_admin_pro', 'superadmin_pro'
        )
        OR lower(btrim(coalesce(p.team, ''))) IN (
          'commercialmt', 'commercial_mt', 'commercial-mt', 'commercial',
          'commercialrm', 'commercial_rm', 'commercial-rm', 'sales', 'r&m'
        )
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(
            CASE WHEN jsonb_typeof(p.allowed_modules) = 'array' THEN p.allowed_modules ELSE '[]'::jsonb END
          ) AS m(value)
          WHERE lower(btrim(m.value)) IN (
            'commercialmt', 'commercialrm', 'sales', 'commercial'
          )
        )
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(
            CASE WHEN jsonb_typeof(p.allowed_sub_modules) = 'array' THEN p.allowed_sub_modules ELSE '[]'::jsonb END
          ) AS s(value)
          WHERE lower(split_part(btrim(s.value), '.', 1)) IN (
            'commercialmt', 'commercialrm', 'sales', 'commercial'
          )
        )
      )
  );
$$;

COMMENT ON FUNCTION public.current_user_has_commercial_enquiry_access() IS
  'Shared Commercial enquiry board. admin/hod/super_admin*, or commercialMt/commercialRm/sales (team, allowed_modules, allowed_sub_modules). Not creator-only.';

GRANT EXECUTE ON FUNCTION public.current_user_has_commercial_enquiry_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_has_commercial_enquiry_access() TO service_role;

DO $$
BEGIN
  IF to_regclass('public.manpower_enquiries') IS NULL THEN
    RAISE NOTICE 'Skipping manpower_enquiries RLS — table not present.';
    RETURN;
  END IF;

  ALTER TABLE public.manpower_enquiries ENABLE ROW LEVEL SECURITY;

  GRANT SELECT, INSERT, UPDATE, DELETE ON public.manpower_enquiries TO authenticated;
  GRANT ALL ON public.manpower_enquiries TO service_role;

  DROP POLICY IF EXISTS manpower_enquiries_select_authenticated ON public.manpower_enquiries;
  DROP POLICY IF EXISTS manpower_enquiries_insert_authenticated ON public.manpower_enquiries;
  DROP POLICY IF EXISTS manpower_enquiries_update_authenticated ON public.manpower_enquiries;
  DROP POLICY IF EXISTS manpower_enquiries_delete_authenticated ON public.manpower_enquiries;
  DROP POLICY IF EXISTS "manpower_enquiries_select_authenticated" ON public.manpower_enquiries;
  DROP POLICY IF EXISTS "manpower_enquiries_insert_authenticated" ON public.manpower_enquiries;
  DROP POLICY IF EXISTS "manpower_enquiries_update_authenticated" ON public.manpower_enquiries;
  DROP POLICY IF EXISTS "manpower_enquiries_delete_authenticated" ON public.manpower_enquiries;
  DROP POLICY IF EXISTS erp_auth_select_manpower_enquiries ON public.manpower_enquiries;
  DROP POLICY IF EXISTS erp_auth_insert_manpower_enquiries ON public.manpower_enquiries;
  DROP POLICY IF EXISTS erp_auth_update_manpower_enquiries ON public.manpower_enquiries;
  DROP POLICY IF EXISTS erp_auth_delete_manpower_enquiries ON public.manpower_enquiries;
  DROP POLICY IF EXISTS manpower_enquiries_commercial_all ON public.manpower_enquiries;

  CREATE POLICY manpower_enquiries_commercial_all ON public.manpower_enquiries
    FOR ALL TO authenticated
    USING ((SELECT public.current_user_has_commercial_enquiry_access()))
    WITH CHECK ((SELECT public.current_user_has_commercial_enquiry_access()));
END $$;

-- Enquiry files in storage: same gate (any login must not list manpower-docs).
DO $$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RETURN;
  END IF;

  DROP POLICY IF EXISTS manpower_docs_select_authenticated ON storage.objects;
  DROP POLICY IF EXISTS manpower_docs_insert_authenticated ON storage.objects;
  DROP POLICY IF EXISTS manpower_docs_update_authenticated ON storage.objects;
  DROP POLICY IF EXISTS manpower_docs_delete_authenticated ON storage.objects;
  DROP POLICY IF EXISTS "manpower_docs_select_authenticated" ON storage.objects;
  DROP POLICY IF EXISTS "manpower_docs_insert_authenticated" ON storage.objects;
  DROP POLICY IF EXISTS "manpower_docs_update_authenticated" ON storage.objects;
  DROP POLICY IF EXISTS "manpower_docs_delete_authenticated" ON storage.objects;

  CREATE POLICY manpower_docs_select_authenticated ON storage.objects
    FOR SELECT TO authenticated
    USING (
      bucket_id = 'manpower-docs'
      AND (SELECT public.current_user_has_commercial_enquiry_access())
    );
  CREATE POLICY manpower_docs_insert_authenticated ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'manpower-docs'
      AND (SELECT public.current_user_has_commercial_enquiry_access())
    );
  CREATE POLICY manpower_docs_update_authenticated ON storage.objects
    FOR UPDATE TO authenticated
    USING (
      bucket_id = 'manpower-docs'
      AND (SELECT public.current_user_has_commercial_enquiry_access())
    )
    WITH CHECK (
      bucket_id = 'manpower-docs'
      AND (SELECT public.current_user_has_commercial_enquiry_access())
    );
  CREATE POLICY manpower_docs_delete_authenticated ON storage.objects
    FOR DELETE TO authenticated
    USING (
      bucket_id = 'manpower-docs'
      AND (SELECT public.current_user_has_commercial_enquiry_access())
    );
END $$;

NOTIFY pgrst, 'reload schema';
