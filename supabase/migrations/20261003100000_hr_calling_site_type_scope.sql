-- Calling Database: Fire / Safety split.
--   1. hr_calling_candidates.site_type ('Fire' | 'Safety'), backfilled from the caller's
--      Employee Master department (Human Resource-Safety → Safety, otherwise Fire).
--   2. User scope from profiles.allowed_sub_modules:
--        calling-scope.fire / calling-scope.safety
--      No key → both types (unchanged). Super Admin / Super Admin Pro → both.
--   3. RLS on hr_calling_candidates limits rows to the user's types.
-- Mirrors src/pages/hr/callingMaster/callingSiteTypeAccess.js.

ALTER TABLE public.hr_calling_candidates
  ADD COLUMN IF NOT EXISTS site_type text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hr_calling_candidates_site_type_check'
  ) THEN
    ALTER TABLE public.hr_calling_candidates
      ADD CONSTRAINT hr_calling_candidates_site_type_check
      CHECK (site_type IN ('Fire', 'Safety'));
  END IF;
END $$;

COMMENT ON COLUMN public.hr_calling_candidates.site_type IS
  'Fire or Safety recruitment line. Drives the Calling Database filter and per-user access.';

-- Caller department → site type
CREATE OR REPLACE FUNCTION public.hr_calling_site_type_for_caller(p_calling_by text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.admin_ifsp_employee_master m
      WHERE lower(btrim(m.full_name)) = lower(btrim(coalesce(p_calling_by, '')))
        AND lower(regexp_replace(btrim(coalesce(m.department, '')), '\s+', ' ', 'g'))
            IN ('human resource-safety', 'human resource - safety', 'hr-safety', 'hr - safety')
    ) THEN 'Safety'
    ELSE 'Fire'
  END
$$;

UPDATE public.hr_calling_candidates c
SET site_type = public.hr_calling_site_type_for_caller(c.calling_by)
WHERE c.site_type IS NULL;

-- ---------------------------------------------------------------------------
-- Current user's allowed site types (never empty)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_calling_site_types()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  WITH me AS (
    SELECT
      public.normalize_erp_role(p.role) AS role,
      CASE
        WHEN jsonb_typeof(COALESCE(p.allowed_sub_modules, '[]'::jsonb)) = 'array'
          THEN p.allowed_sub_modules
        ELSE '[]'::jsonb
      END AS subs
    FROM public.profiles p
    WHERE p.id = auth.uid()
  ),
  picked AS (
    SELECT array_remove(ARRAY[
      CASE WHEN me.subs ? 'calling-scope.fire' THEN 'Fire' END,
      CASE WHEN me.subs ? 'calling-scope.safety' THEN 'Safety' END
    ], NULL) AS types,
    me.role
    FROM me
  )
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM picked) THEN ARRAY['Fire', 'Safety']
    WHEN (SELECT role FROM picked) IN ('super_admin', 'super_admin_pro') THEN ARRAY['Fire', 'Safety']
    WHEN cardinality((SELECT types FROM picked)) = 0 THEN ARRAY['Fire', 'Safety']
    ELSE (SELECT types FROM picked)
  END
$$;

COMMENT ON FUNCTION public.current_user_calling_site_types() IS
  'Calling Database site types visible to the current user (calling-scope.fire / calling-scope.safety; none = both).';

GRANT EXECUTE ON FUNCTION public.current_user_calling_site_types() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.current_user_can_access_calling_site_type(p_site_type text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT p_site_type IS NULL OR p_site_type = ANY (public.current_user_calling_site_types())
$$;

GRANT EXECUTE ON FUNCTION public.current_user_can_access_calling_site_type(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Fill site_type on insert when the caller did not send one (referral RPC,
-- Admin in-house recruitment). Single-type users get their type.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_hr_calling_candidates_site_type_default()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_types text[];
BEGIN
  IF NEW.site_type IS NULL OR btrim(NEW.site_type) = '' THEN
    v_types := public.current_user_calling_site_types();
    IF cardinality(v_types) = 1 THEN
      NEW.site_type := v_types[1];
    ELSE
      NEW.site_type := public.hr_calling_site_type_for_caller(NEW.calling_by);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hr_calling_candidates_site_type_default ON public.hr_calling_candidates;
CREATE TRIGGER trg_hr_calling_candidates_site_type_default
  BEFORE INSERT ON public.hr_calling_candidates
  FOR EACH ROW EXECUTE FUNCTION public.trg_hr_calling_candidates_site_type_default();

ALTER TABLE public.hr_calling_candidates
  ALTER COLUMN site_type SET NOT NULL;

CREATE INDEX IF NOT EXISTS hr_calling_candidates_site_type_idx
  ON public.hr_calling_candidates (site_type)
  WHERE is_active = true;

-- ---------------------------------------------------------------------------
-- RLS: Calling Master access AND allowed site type
-- ---------------------------------------------------------------------------
ALTER POLICY hr_calling_candidates_select ON public.hr_calling_candidates
  USING (
    public.current_user_can_access_calling_master()
    AND public.current_user_can_access_calling_site_type(site_type)
  );
ALTER POLICY hr_calling_candidates_insert ON public.hr_calling_candidates
  WITH CHECK (
    public.current_user_can_access_calling_master()
    AND public.current_user_can_access_calling_site_type(site_type)
  );
ALTER POLICY hr_calling_candidates_update ON public.hr_calling_candidates
  USING (
    public.current_user_can_access_calling_master()
    AND public.current_user_can_access_calling_site_type(site_type)
  )
  WITH CHECK (
    public.current_user_can_access_calling_master()
    AND public.current_user_can_access_calling_site_type(site_type)
  );
ALTER POLICY hr_calling_candidates_delete ON public.hr_calling_candidates
  USING (
    public.current_user_can_access_calling_master()
    AND public.current_user_can_access_calling_site_type(site_type)
  );

NOTIFY pgrst, 'reload schema';
