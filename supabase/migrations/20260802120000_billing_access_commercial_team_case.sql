-- Commercial PO Entry (Manpower / Training): profiles.team from Employee Master is
-- stored as "Commercial" (title case). Frontend maps that to commercialMt, but RLS
-- compared team with exact lowercase keys and denied SELECT/INSERT on billing.po_wo.
-- Normalize team / module keys case-insensitively; also honor commercialMt.* sub-modules.

DO $$
BEGIN
  IF to_regnamespace('billing') IS NULL THEN
    RAISE NOTICE 'Skipping billing.current_user_has_billing_access — billing schema not present.';
    RETURN;
  END IF;

  EXECUTE $fn$
CREATE OR REPLACE FUNCTION billing.current_user_has_billing_access()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  has_access boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('super_admin', 'super_admin_pro')
  ) INTO has_access;
  IF has_access THEN RETURN true; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        lower(trim(COALESCE(p.role, ''))) IN ('admin', 'billing')
        OR lower(trim(COALESCE(p.team, ''))) IN ('billing', 'commercial', 'commercialmt', 'commercialrm')
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(COALESCE(p.allowed_modules, '[]'::jsonb)) m(val)
          WHERE lower(trim(m.val)) IN ('billing', 'commercial', 'commercialmt', 'commercialrm')
        )
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(
            COALESCE(to_jsonb(p) -> 'allowed_sub_modules', '[]'::jsonb)
          ) s(val)
          WHERE lower(trim(s.val)) LIKE 'billing.%'
             OR lower(trim(s.val)) LIKE 'commercialmt.%'
             OR lower(trim(s.val)) LIKE 'commercialrm.%'
             OR lower(trim(s.val)) LIKE 'commercial.%'
        )
      )
  ) INTO has_access;
  RETURN COALESCE(has_access, false);
END;
$body$;
$fn$;
END $$;

GRANT EXECUTE ON FUNCTION billing.current_user_has_billing_access() TO authenticated;
