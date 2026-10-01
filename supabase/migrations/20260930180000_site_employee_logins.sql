-- =============================================================================
-- Site employee logins: access managed from HR People Management.
--
-- Why
--   Site workforce (public.people) who sign in to the ERP should have their
--   login enabled/disabled and their screens chosen by HR, next to the L1 / L2
--   leads HR already owns. User Management shows them read-only under
--   "Site Employees"; IFSPL staff stay managed exactly as before.
--
-- Link
--   A login (profiles) belongs to a site person when its employee_code matches
--   people.unique_code (normalized), AND the code is not an IFSPL employee in
--   Employee Master, AND the login is not an admin-level role. Nothing is
--   stored for the link, so fixing a code in either place re-links instantly.
--
-- Access rules
--   - Managers: admin roles, or HR staff (team HR / full HR module / People
--     Management screen) who are not themselves site-employee logins. Holding a
--     single HR screen is NOT enough (current_user_can_access_module('hr') is
--     true for any hr.* screen, which site workers may be granted).
--   - HR sets is_active and screen-level access (allowed_sub_modules).
--     Full-module grants (allowed_modules) set by admins are preserved.
--   - Admin, IT/IS, Finance screens and HR salary / payroll / People
--     Management cannot be granted from here. If an admin already granted
--     one, HR saves keep it untouched.
--   - Every change is appended to site_login_access_history.
--
-- DATA SAFETY: additive only. No existing rows or columns are changed.
-- =============================================================================

DO $$
BEGIN
  IF to_regclass('public.people') IS NULL THEN
    RAISE EXCEPTION 'public.people does not exist — apply the HR attendance tables first.';
  END IF;
  IF to_regclass('public.hr_people_directory') IS NULL THEN
    RAISE EXCEPTION 'Apply 20260930140000_people_hr_leads.sql first.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Link: profile <-> person
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.site_employee_login_links()
RETURNS TABLE (profile_id uuid, person_id bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT DISTINCT ON (pr.id) pr.id, pe.id
  FROM public.profiles pr
  JOIN public.people pe
    ON public.norm_emp_code(pe.unique_code::text) = public.norm_emp_code(pr.employee_code)
  WHERE coalesce(public.norm_emp_code(pr.employee_code), '') <> ''
    AND public.normalize_erp_role(pr.role) NOT IN ('admin', 'super_admin', 'super_admin_pro')
    AND NOT EXISTS (
      SELECT 1
      FROM public.admin_ifsp_employee_master em
      WHERE public.norm_emp_code(em.employee_code) = public.norm_emp_code(pr.employee_code)
    )
  ORDER BY pr.id, pe.is_active DESC NULLS LAST, pe.id DESC
$$;

COMMENT ON FUNCTION public.site_employee_login_links() IS
  'Logins that belong to site employees: profiles.employee_code = people.unique_code, excluding IFSPL employees and admin roles.';

REVOKE ALL ON FUNCTION public.site_employee_login_links() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.site_employee_login_links() TO service_role;

CREATE OR REPLACE FUNCTION public.current_user_is_site_employee_login()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.site_employee_login_links() l WHERE l.profile_id = auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.current_user_can_manage_site_logins()
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
        public.normalize_erp_role(p.role) IN ('admin', 'super_admin', 'super_admin_pro')
        OR (
          NOT public.current_user_is_site_employee_login()
          AND (
            public.normalize_erp_module_key(p.team) = 'hr'
            OR EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(public.jsonb_text_array(to_jsonb(p) -> 'allowed_modules')) m(value)
              WHERE public.normalize_erp_module_key(m.value) = 'hr'
            )
            OR EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(public.jsonb_text_array(to_jsonb(p) -> 'allowed_sub_modules')) s(value)
              WHERE lower(btrim(s.value)) = 'hr.people-management'
            )
          )
        )
      )
  )
$$;

COMMENT ON FUNCTION public.current_user_can_manage_site_logins() IS
  'Admin roles, or HR staff (team / full HR module / People Management screen) who are not site-employee logins themselves.';

GRANT EXECUTE ON FUNCTION public.current_user_is_site_employee_login() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_can_manage_site_logins() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_site_login_grantable_screen(p_key text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(btrim(p_key), '') ~ '^[A-Za-z]+\.[A-Za-z0-9._-]+$'
    AND lower(split_part(btrim(p_key), '.', 1)) NOT IN ('admin', 'itis', 'finance')
    AND lower(btrim(p_key)) NOT IN ('hr.salary-management', 'hr.payroll-module', 'hr.people-management')
    AND lower(btrim(p_key)) NOT LIKE 'hr.salary-management.%'
    AND lower(btrim(p_key)) NOT LIKE 'hr.payroll-module.%'
    AND lower(btrim(p_key)) NOT LIKE 'hr.people-management.%'
$$;

COMMENT ON FUNCTION public.is_site_login_grantable_screen(text) IS
  'Screens HR may grant to a site-employee login. Mirrors SITE_LOGIN_BLOCKED_* in the SPA.';

-- ---------------------------------------------------------------------------
-- Append-only history
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.site_login_access_history (
  id bigserial PRIMARY KEY,
  person_id bigint NOT NULL,
  profile_id uuid NOT NULL,
  old_is_active boolean,
  new_is_active boolean,
  old_allowed_sub_modules jsonb,
  new_allowed_sub_modules jsonb,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid
);

COMMENT ON TABLE public.site_login_access_history IS
  'Audit trail of site-employee login access changes made from People Management.';

CREATE INDEX IF NOT EXISTS site_login_access_history_person_idx
  ON public.site_login_access_history (person_id, changed_at DESC);

ALTER TABLE public.site_login_access_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS site_login_access_history_select ON public.site_login_access_history;
CREATE POLICY site_login_access_history_select
  ON public.site_login_access_history FOR SELECT TO authenticated
  USING (
    (SELECT public.current_user_can_manage_site_logins())
    OR (SELECT public.current_user_has_admin_module_access())
  );

GRANT SELECT ON public.site_login_access_history TO authenticated;
GRANT SELECT, INSERT ON public.site_login_access_history TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.site_login_access_history_id_seq TO service_role;

-- ---------------------------------------------------------------------------
-- List (People Management + User Management "Site Employees")
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_site_employee_logins(p_person_id bigint DEFAULT NULL)
RETURNS TABLE (
  profile_id uuid,
  email text,
  username text,
  employee_code text,
  is_active boolean,
  allowed_modules jsonb,
  allowed_sub_modules jsonb,
  created_at timestamptz,
  person_id bigint,
  full_name text,
  designation text,
  person_is_active boolean,
  current_site_name text,
  l1_employee_code text,
  l1_employee_name text,
  l2_employee_code text,
  l2_employee_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  IF NOT (public.current_user_can_manage_site_logins() OR public.current_user_has_admin_module_access()) THEN
    RAISE EXCEPTION 'Not allowed to view site employee logins.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    pr.id,
    pr.email::text,
    pr.username::text,
    pr.employee_code::text,
    coalesce((to_jsonb(pr) ->> 'is_active')::boolean, true),
    public.jsonb_text_array(to_jsonb(pr) -> 'allowed_modules'),
    public.jsonb_text_array(to_jsonb(pr) -> 'allowed_sub_modules'),
    pr.created_at,
    d.id,
    d.full_name::text,
    d.designation::text,
    d.is_active,
    d.current_site_name::text,
    d.l1_employee_code,
    d.l1_employee_name,
    d.l2_employee_code,
    d.l2_employee_name
  FROM public.site_employee_login_links() l
  JOIN public.profiles pr ON pr.id = l.profile_id
  JOIN public.hr_people_directory d ON d.id = l.person_id
  WHERE p_person_id IS NULL OR l.person_id = p_person_id
  ORDER BY d.full_name NULLS LAST, pr.email;
END;
$$;

REVOKE ALL ON FUNCTION public.list_site_employee_logins(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_site_employee_logins(bigint) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Update access (People Management only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_site_employee_login_access(
  p_person_id bigint,
  p_is_active boolean,
  p_sub_modules text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_profile_id uuid;
  v_old public.profiles%ROWTYPE;
  v_new public.profiles%ROWTYPE;
  v_bad text;
  v_subs jsonb;
BEGIN
  IF NOT public.current_user_can_manage_site_logins() THEN
    RAISE EXCEPTION 'Only HR can change site employee login access.' USING ERRCODE = '42501';
  END IF;

  SELECT l.profile_id INTO v_profile_id
  FROM public.site_employee_login_links() l
  WHERE l.person_id = p_person_id
  LIMIT 1;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'This person has no login linked by employee code.' USING ERRCODE = 'P0002';
  END IF;

  IF v_profile_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot change your own login access.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_old FROM public.profiles WHERE id = v_profile_id FOR UPDATE;

  -- Screens HR cannot grant may still exist from an admin; keep them, never add new ones.
  SELECT k INTO v_bad
  FROM unnest(coalesce(p_sub_modules, ARRAY[]::text[])) k
  WHERE btrim(k) <> ''
    AND NOT public.is_site_login_grantable_screen(k)
    AND NOT (public.jsonb_text_array(to_jsonb(v_old) -> 'allowed_sub_modules') ? btrim(k))
  LIMIT 1;

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Screen "%" cannot be granted to a site employee.', v_bad USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(jsonb_agg(DISTINCT k ORDER BY k), '[]'::jsonb) INTO v_subs
  FROM (
    SELECT btrim(x) AS k
    FROM unnest(coalesce(p_sub_modules, ARRAY[]::text[])) x
    WHERE btrim(x) <> ''
    UNION
    SELECT o.value
    FROM jsonb_array_elements_text(public.jsonb_text_array(to_jsonb(v_old) -> 'allowed_sub_modules')) o(value)
    WHERE NOT public.is_site_login_grantable_screen(o.value)
  ) s;

  PERFORM set_config('erp.bypass_profile_privilege_guard', 'on', true);

  UPDATE public.profiles
  SET
    is_active = coalesce(p_is_active, is_active),
    allowed_sub_modules = v_subs,
    module_access_pending = false,
    updated_at = now()
  WHERE id = v_profile_id
  RETURNING * INTO v_new;

  INSERT INTO public.site_login_access_history (
    person_id, profile_id,
    old_is_active, new_is_active,
    old_allowed_sub_modules, new_allowed_sub_modules,
    changed_by
  ) VALUES (
    p_person_id, v_profile_id,
    v_old.is_active, v_new.is_active,
    public.jsonb_text_array(to_jsonb(v_old) -> 'allowed_sub_modules'), v_subs,
    auth.uid()
  );

  RETURN jsonb_build_object(
    'profile_id', v_new.id,
    'is_active', v_new.is_active,
    'allowed_sub_modules', v_subs
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_site_employee_login_access(bigint, boolean, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_site_employee_login_access(bigint, boolean, text[]) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
