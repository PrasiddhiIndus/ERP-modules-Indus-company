-- =============================================================================
-- HR People Management: L1 / L2 HR leads for site employees (public.people).
--
-- Why
--   public.people (site workforce, owned by the standalone HR app) has no owner.
--   Each site employee gets an L1 (direct) and L2 (skip-level) lead picked from
--   the HR team in Employee Master (admin_ifsp_employee_master, department HR /
--   Dahej-HR, Active).
--
-- Design
--   - public.people and public.sites are NOT altered. Leads live in a 1:1
--     sidecar (same pattern as people_sensitive_details).
--   - Every change is appended to people_hr_leads_history (no FK, never deleted)
--     so reassignments and bulk updates are always recoverable.
--   - Writes go only through set_people_hr_leads(), which validates that each
--     lead is an active HR team member and stores the canonical code + name.
--   - HR-only users cannot read Employee Master under its RLS, so the HR team
--     list is exposed through list_hr_team_leads() (minimal columns, gated).
--   - hr_people_directory: read view (security_invoker) of people + leads +
--     current site, for server-side filter / sort / paging.
--
-- DATA SAFETY: additive only. No existing rows or columns are changed.
-- =============================================================================

DO $$
BEGIN
  IF to_regclass('public.people') IS NULL THEN
    RAISE EXCEPTION 'public.people does not exist — apply the HR attendance tables first.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- HR team membership (shared by list + validation)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_hr_team_department(dept text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(regexp_replace(btrim(coalesce(dept, '')), '\s+', ' ', 'g')) IN (
    'hr', 'human resource', 'human resources', 'hr dept', 'hr department', 'dahej-hr'
  )
$$;

COMMENT ON FUNCTION public.is_hr_team_department(text) IS
  'Employee Master departments that form the HR team (HR, Dahej-HR and HR aliases). Mirrors isHrDepartment() in the SPA.';

-- ---------------------------------------------------------------------------
-- Sidecar: current leads per person
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.people_hr_leads (
  person_id bigint PRIMARY KEY REFERENCES public.people (id) ON DELETE CASCADE,
  l1_employee_code text,
  l1_employee_name text,
  l2_employee_code text,
  l2_employee_name text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid DEFAULT auth.uid(),
  CONSTRAINT people_hr_leads_l1_l2_distinct CHECK (
    l1_employee_code IS NULL
    OR l2_employee_code IS NULL
    OR lower(btrim(l1_employee_code)) <> lower(btrim(l2_employee_code))
  )
);

COMMENT ON TABLE public.people_hr_leads IS
  'L1 / L2 HR leads for site employees (people). Codes reference Employee Master HR team; names are a snapshot at assignment time.';

CREATE INDEX IF NOT EXISTS people_hr_leads_l1_code_idx
  ON public.people_hr_leads (lower(btrim(l1_employee_code)));
CREATE INDEX IF NOT EXISTS people_hr_leads_l2_code_idx
  ON public.people_hr_leads (lower(btrim(l2_employee_code)));

ALTER TABLE public.people_hr_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS people_hr_leads_select ON public.people_hr_leads;
CREATE POLICY people_hr_leads_select
  ON public.people_hr_leads FOR SELECT TO authenticated
  USING (
    (SELECT public.current_user_can_access_module('hr'))
    OR (SELECT public.current_user_has_admin_module_access())
  );

-- No insert/update/delete policies: writes only via set_people_hr_leads().
GRANT SELECT ON public.people_hr_leads TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.people_hr_leads TO service_role;

-- ---------------------------------------------------------------------------
-- Append-only history
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.people_hr_leads_history (
  id bigserial PRIMARY KEY,
  person_id bigint NOT NULL,
  action text NOT NULL,
  old_l1_employee_code text,
  old_l1_employee_name text,
  new_l1_employee_code text,
  new_l1_employee_name text,
  old_l2_employee_code text,
  old_l2_employee_name text,
  new_l2_employee_code text,
  new_l2_employee_name text,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid
);

COMMENT ON TABLE public.people_hr_leads_history IS
  'Audit trail of L1 / L2 HR lead changes. Kept even if the person row is removed.';

CREATE INDEX IF NOT EXISTS people_hr_leads_history_person_idx
  ON public.people_hr_leads_history (person_id, changed_at DESC);

ALTER TABLE public.people_hr_leads_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS people_hr_leads_history_select ON public.people_hr_leads_history;
CREATE POLICY people_hr_leads_history_select
  ON public.people_hr_leads_history FOR SELECT TO authenticated
  USING (
    (SELECT public.current_user_can_access_module('hr'))
    OR (SELECT public.current_user_has_admin_module_access())
  );

GRANT SELECT ON public.people_hr_leads_history TO authenticated;
GRANT SELECT, INSERT ON public.people_hr_leads_history TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.people_hr_leads_history_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.people_hr_leads_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.l1_employee_code IS NOT DISTINCT FROM OLD.l1_employee_code
     AND NEW.l2_employee_code IS NOT DISTINCT FROM OLD.l2_employee_code THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.people_hr_leads_history (
    person_id, action,
    old_l1_employee_code, old_l1_employee_name, new_l1_employee_code, new_l1_employee_name,
    old_l2_employee_code, old_l2_employee_name, new_l2_employee_code, new_l2_employee_name,
    changed_by
  )
  VALUES (
    coalesce(NEW.person_id, OLD.person_id),
    lower(TG_OP),
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.l1_employee_code END,
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.l1_employee_name END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.l1_employee_code END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.l1_employee_name END,
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.l2_employee_code END,
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.l2_employee_name END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.l2_employee_code END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.l2_employee_name END,
    auth.uid()
  );

  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_people_hr_leads_audit ON public.people_hr_leads;
CREATE TRIGGER trg_people_hr_leads_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.people_hr_leads
  FOR EACH ROW EXECUTE FUNCTION public.people_hr_leads_audit();

-- ---------------------------------------------------------------------------
-- HR team picker (readable by HR-module users)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_hr_team_leads()
RETURNS TABLE (
  id text,
  employee_code text,
  employee_id text,
  full_name text,
  department text,
  designation text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.current_user_can_access_module('hr') OR public.current_user_has_admin_module_access()) THEN
    RAISE EXCEPTION 'Not allowed to view the HR team' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    m.id::text,
    nullif(btrim(coalesce(m.employee_code, '')), ''),
    nullif(btrim(coalesce(m.employee_id, '')), ''),
    nullif(btrim(coalesce(m.full_name, '')), ''),
    nullif(btrim(coalesce(m.department, '')), ''),
    nullif(btrim(coalesce(m.designation, '')), '')
  FROM public.admin_ifsp_employee_master m
  WHERE public.is_hr_team_department(m.department)
    AND lower(btrim(coalesce(m.status, ''))) IN ('active', '')
    AND coalesce(nullif(btrim(m.employee_code), ''), nullif(btrim(m.employee_id), '')) IS NOT NULL
  ORDER BY m.full_name;
END;
$$;

COMMENT ON FUNCTION public.list_hr_team_leads() IS
  'Active HR team (Employee Master HR / Dahej-HR) for L1/L2 lead pickers. Minimal columns; HR or Admin module required.';

REVOKE ALL ON FUNCTION public.list_hr_team_leads() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_hr_team_leads() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Set leads for one or many people (validated)
--   p_set_l1 / p_set_l2 = false → leave that lead unchanged.
--   Empty code with p_set_* = true → clear that lead.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_people_hr_leads(
  p_person_ids bigint[],
  p_set_l1 boolean,
  p_l1_code text,
  p_set_l2 boolean,
  p_l2_code text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_set_l1 boolean := coalesce(p_set_l1, false);
  v_set_l2 boolean := coalesce(p_set_l2, false);
  v_l1_in text := nullif(btrim(coalesce(p_l1_code, '')), '');
  v_l2_in text := nullif(btrim(coalesce(p_l2_code, '')), '');
  v_l1_code text;
  v_l1_name text;
  v_l2_code text;
  v_l2_name text;
  v_conflicts integer;
  v_count integer;
BEGIN
  IF NOT (public.current_user_can_access_module('hr') OR public.current_user_has_admin_module_access()) THEN
    RAISE EXCEPTION 'Not allowed to change HR leads' USING ERRCODE = '42501';
  END IF;

  IF p_person_ids IS NULL OR cardinality(p_person_ids) = 0 OR NOT (v_set_l1 OR v_set_l2) THEN
    RETURN 0;
  END IF;

  IF v_set_l1 AND v_l1_in IS NOT NULL THEN
    SELECT coalesce(nullif(btrim(m.employee_code), ''), btrim(m.employee_id)), btrim(m.full_name)
      INTO v_l1_code, v_l1_name
    FROM public.admin_ifsp_employee_master m
    WHERE public.is_hr_team_department(m.department)
      AND lower(btrim(coalesce(m.status, ''))) IN ('active', '')
      AND (lower(btrim(m.employee_code)) = lower(v_l1_in) OR lower(btrim(m.employee_id)) = lower(v_l1_in))
    LIMIT 1;
    IF v_l1_code IS NULL THEN
      RAISE EXCEPTION 'L1 lead "%" is not an active HR team member.', v_l1_in USING ERRCODE = '22023';
    END IF;
  END IF;

  IF v_set_l2 AND v_l2_in IS NOT NULL THEN
    SELECT coalesce(nullif(btrim(m.employee_code), ''), btrim(m.employee_id)), btrim(m.full_name)
      INTO v_l2_code, v_l2_name
    FROM public.admin_ifsp_employee_master m
    WHERE public.is_hr_team_department(m.department)
      AND lower(btrim(coalesce(m.status, ''))) IN ('active', '')
      AND (lower(btrim(m.employee_code)) = lower(v_l2_in) OR lower(btrim(m.employee_id)) = lower(v_l2_in))
    LIMIT 1;
    IF v_l2_code IS NULL THEN
      RAISE EXCEPTION 'L2 lead "%" is not an active HR team member.', v_l2_in USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Resulting L1 must differ from resulting L2 on every affected row.
  SELECT count(*) INTO v_conflicts
  FROM unnest(p_person_ids) AS t(pid)
  LEFT JOIN public.people_hr_leads l ON l.person_id = t.pid
  WHERE lower(CASE WHEN v_set_l1 THEN v_l1_code ELSE l.l1_employee_code END)
      = lower(CASE WHEN v_set_l2 THEN v_l2_code ELSE l.l2_employee_code END);
  IF v_conflicts > 0 THEN
    RAISE EXCEPTION 'L1 and L2 must be different people (% record(s) would have the same lead for both).', v_conflicts
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.people_hr_leads AS l (
    person_id, l1_employee_code, l1_employee_name, l2_employee_code, l2_employee_name, updated_at, updated_by
  )
  SELECT DISTINCT p.id,
    CASE WHEN v_set_l1 THEN v_l1_code END,
    CASE WHEN v_set_l1 THEN v_l1_name END,
    CASE WHEN v_set_l2 THEN v_l2_code END,
    CASE WHEN v_set_l2 THEN v_l2_name END,
    now(),
    auth.uid()
  FROM public.people p
  WHERE p.id = ANY (p_person_ids)
  ON CONFLICT (person_id) DO UPDATE SET
    l1_employee_code = CASE WHEN v_set_l1 THEN EXCLUDED.l1_employee_code ELSE l.l1_employee_code END,
    l1_employee_name = CASE WHEN v_set_l1 THEN EXCLUDED.l1_employee_name ELSE l.l1_employee_name END,
    l2_employee_code = CASE WHEN v_set_l2 THEN EXCLUDED.l2_employee_code ELSE l.l2_employee_code END,
    l2_employee_name = CASE WHEN v_set_l2 THEN EXCLUDED.l2_employee_name ELSE l.l2_employee_name END,
    updated_at = now(),
    updated_by = auth.uid();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.set_people_hr_leads(bigint[], boolean, text, boolean, text) IS
  'Assign / clear L1 and L2 HR leads for site employees. Validates HR team membership and L1 <> L2. History is written by trigger.';

REVOKE ALL ON FUNCTION public.set_people_hr_leads(bigint[], boolean, text, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_people_hr_leads(bigint[], boolean, text, boolean, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Directory view: people + leads + current site
-- Explicit people columns (not p.*) so the standalone HR app can still add or
-- drop its own columns without being blocked by this view.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS site_assignments_person_from_idx
  ON public.site_assignments (person_id, from_date DESC);

CREATE OR REPLACE VIEW public.hr_people_directory
WITH (security_invoker = on)
AS
SELECT
  p.id,
  p.unique_code,
  p.full_name,
  p.designation,
  p.father_name,
  p.phone_no,
  p.pf_no,
  p.esic_no,
  p.category_name,
  p.joining_date,
  p.leaving_date,
  p.is_active,
  p.created_at,
  l.l1_employee_code,
  l.l1_employee_name,
  l.l2_employee_code,
  l.l2_employee_name,
  l.updated_at AS leads_updated_at,
  cs.site_id AS current_site_id,
  cs.site_name AS current_site_name,
  cs.location AS current_site_location
FROM public.people p
LEFT JOIN public.people_hr_leads l ON l.person_id = p.id
LEFT JOIN LATERAL (
  SELECT sa.site_id, s.site_name, s.location
  FROM public.site_assignments sa
  LEFT JOIN public.sites s ON s.id = sa.site_id
  WHERE sa.person_id = p.id
    AND (sa.to_date IS NULL OR sa.to_date >= current_date)
    AND (sa.from_date IS NULL OR sa.from_date <= current_date)
  ORDER BY sa.from_date DESC NULLS LAST
  LIMIT 1
) cs ON true;

COMMENT ON VIEW public.hr_people_directory IS
  'HR People Management list: site employees with L1/L2 HR leads and current site. Read-only.';

GRANT SELECT ON public.hr_people_directory TO authenticated;
GRANT SELECT ON public.hr_people_directory TO service_role;

NOTIFY pgrst, 'reload schema';
