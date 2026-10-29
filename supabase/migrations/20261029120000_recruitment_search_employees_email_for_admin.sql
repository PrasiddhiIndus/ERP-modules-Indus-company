-- Interviewer typeahead needs login / master emails for Admin role users.
-- profiles SELECT is limited to own row + super_admin*; Employee Master email_id
-- is often blank, so Admin logins saw names without emails while Super Admin did not.

CREATE OR REPLACE FUNCTION public.admin_recruitment_search_employees(p_term text)
RETURNS TABLE (
  id text,
  name text,
  code text,
  designation text,
  email text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_term text := btrim(coalesce(p_term, ''));
  v_like text;
BEGIN
  IF NOT (
    public.admin_recruitment_can('view')
    OR public.admin_recruitment_can('interviews')
    OR public.admin_recruitment_can('settings')
  ) THEN
    RAISE EXCEPTION 'You do not have access to search employees for recruitment.';
  END IF;

  IF char_length(v_term) < 2 THEN
    RETURN;
  END IF;

  -- Escape LIKE wildcards in the user term
  v_like := '%' || replace(replace(replace(v_term, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  RETURN QUERY
  WITH master AS (
    SELECT
      e.id::text AS mid,
      btrim(coalesce(e.full_name, '')) AS mname,
      btrim(coalesce(e.employee_code, '')) AS mcode,
      btrim(coalesce(e.designation, '')) AS mdesig,
      btrim(coalesce(e.email_id, '')) AS memail
    FROM public.admin_ifsp_employee_master e
    WHERE e.status = 'Active'
      AND (
        nullif(btrim(coalesce(e.employee_type, '')), '') IS NULL
        OR lower(btrim(e.employee_type)) = 'in_house'
      )
      AND (
        e.full_name ILIKE v_like ESCAPE '\'
        OR e.employee_code ILIKE v_like ESCAPE '\'
      )
    ORDER BY e.full_name ASC NULLS LAST
    LIMIT 20
  ),
  profile_hits AS (
    SELECT
      p.id::text AS pid,
      btrim(coalesce(p.username, '')) AS pname,
      btrim(coalesce(p.employee_code, '')) AS pcode,
      btrim(coalesce(p.email, '')) AS pemail
    FROM public.profiles p
    WHERE coalesce((to_jsonb(p) ->> 'is_active')::boolean, true)
      AND (
        p.username ILIKE v_like ESCAPE '\'
        OR p.email ILIKE v_like ESCAPE '\'
        OR p.employee_code ILIKE v_like ESCAPE '\'
      )
    LIMIT 20
  ),
  master_enriched AS (
    SELECT
      m.mid AS eid,
      coalesce(nullif(m.mname, ''), nullif(ph.pname, ''), '') AS ename,
      m.mcode AS ecode,
      m.mdesig AS edesig,
      coalesce(
        nullif(m.memail, ''),
        nullif(ph.pemail, ''),
        nullif((
          SELECT btrim(coalesce(p2.email, ''))
          FROM public.profiles p2
          WHERE m.mcode <> ''
            AND lower(btrim(coalesce(p2.employee_code, ''))) = lower(m.mcode)
          LIMIT 1
        ), ''),
        ''
      ) AS eemail
    FROM master m
    LEFT JOIN profile_hits ph
      ON m.mcode <> '' AND lower(m.mcode) = lower(ph.pcode)
  ),
  profile_only AS (
    SELECT
      ('profile-' || ph.pid) AS eid,
      coalesce(
        nullif(ph.pname, ''),
        nullif(split_part(ph.pemail, '@', 1), ''),
        ''
      ) AS ename,
      ph.pcode AS ecode,
      ''::text AS edesig,
      ph.pemail AS eemail
    FROM profile_hits ph
    WHERE NOT EXISTS (
      SELECT 1
      FROM master_enriched me
      WHERE ph.pcode <> ''
        AND lower(me.ecode) = lower(ph.pcode)
    )
  ),
  combined AS (
    SELECT * FROM master_enriched
    UNION ALL
    SELECT * FROM profile_only
  )
  SELECT c.eid, c.ename, c.ecode, c.edesig, c.eemail
  FROM combined c
  WHERE c.ename <> ''
  LIMIT 15;
END;
$$;

COMMENT ON FUNCTION public.admin_recruitment_search_employees(text) IS
  'Recruitment interviewer / employee typeahead with emails. SECURITY DEFINER so Admin role can resolve profile emails (profiles RLS is own-row + super_admin only).';

REVOKE ALL ON FUNCTION public.admin_recruitment_search_employees(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_recruitment_search_employees(text) TO authenticated, service_role;
