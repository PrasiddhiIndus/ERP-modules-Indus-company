-- =============================================================================
-- HR Site: site employee email + Site Supervisor logins.
--
-- 1) Employee email
--    people_login_emails: optional email per site employee (public.people),
--    1:1 sidecar keyed by person (people is owned by the standalone HR app and
--    is NOT altered). The employee code (people.unique_code) is the link to the
--    login: an email already used by a login is accepted only for the person
--    whose employee code matches that login. Writes go through
--    set_person_login_email(); when the person already has a login with a
--    different email, the change must go through the site-login service so
--    Supabase Auth, profiles.email and this table change together
--    (site_login_apply_email, service_role only).
--
-- 2) Site Supervisors
--    site_supervisor_logins: login (profile) -> person -> the ONE site the
--    supervisor manages. Keyed by profile_id so the restriction never depends
--    on the employee-code link staying intact. No FK to people / sites: if a
--    person or site is deleted the row stays and the supervisor simply sees
--    nothing (fails closed).
--    assign_site_supervisor() sets exactly the supervisor access:
--      allowed_sub_modules = hr.site-attendance + site-attendance-page.attendance
--      allowed_modules = [], team = NULL, module_access_pending = false
--
-- 3) Site-level restriction (database, not just UI)
--    RESTRICTIVE policies — they only narrow access, and only for users who
--    have a site_supervisor_logins row. Everyone else is unaffected.
--      - sites / people / site_assignments / site_designations: read own site
--        only, no writes.
--      - attendance / site_grid_placements / summary_remarks: own site only.
--      - HR sensitive / payroll / leads / supervisor & HR-manager credential
--        tables: no access.
--
-- DATA SAFETY: additive only. No existing rows are changed by this migration.
-- =============================================================================

DO $$
BEGIN
  IF to_regprocedure('public.site_employee_login_links()') IS NULL THEN
    RAISE EXCEPTION 'Apply 20260930180000_site_employee_logins.sql first.';
  END IF;
  IF to_regprocedure('public.site_login_create_precheck(bigint)') IS NULL THEN
    RAISE EXCEPTION 'Apply 20260930190000_site_login_create.sql first.';
  END IF;
  IF to_regprocedure('public.current_user_has_site_attendance_access()') IS NULL THEN
    RAISE EXCEPTION 'Apply 20261027160000_site_attendance_import_batches.sql first.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.people_login_emails (
  person_id bigint PRIMARY KEY REFERENCES public.people (id) ON DELETE CASCADE,
  email text NOT NULL CHECK (email = lower(btrim(email)) AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid DEFAULT auth.uid()
);

COMMENT ON TABLE public.people_login_emails IS
  'Optional email of a site employee (people). Linked to the ERP / Indus One login by employee code (people.unique_code = profiles.employee_code).';

CREATE UNIQUE INDEX IF NOT EXISTS people_login_emails_email_uq ON public.people_login_emails (email);

ALTER TABLE public.people_login_emails ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.site_supervisor_logins (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
  person_id bigint NOT NULL,
  site_id bigint NOT NULL,
  employee_code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid DEFAULT auth.uid()
);

COMMENT ON TABLE public.site_supervisor_logins IS
  'Site Supervisor logins: the one site each supervisor login may see in Site Attendance. Written only by assign_site_supervisor / remove_site_supervisor.';

CREATE UNIQUE INDEX IF NOT EXISTS site_supervisor_logins_person_uq ON public.site_supervisor_logins (person_id);
CREATE INDEX IF NOT EXISTS site_supervisor_logins_site_idx ON public.site_supervisor_logins (site_id);

ALTER TABLE public.site_supervisor_logins ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.site_supervisor_history (
  id bigserial PRIMARY KEY,
  profile_id uuid NOT NULL,
  person_id bigint NOT NULL,
  action text NOT NULL CHECK (action IN ('assigned', 'site_changed', 'removed')),
  old_site_id bigint,
  new_site_id bigint,
  old_allowed_modules jsonb,
  old_allowed_sub_modules jsonb,
  old_team text,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid
);

COMMENT ON TABLE public.site_supervisor_history IS
  'Append-only audit of Site Supervisor assignments, including the access the login had before.';

CREATE INDEX IF NOT EXISTS site_supervisor_history_person_idx
  ON public.site_supervisor_history (person_id, changed_at DESC);

ALTER TABLE public.site_supervisor_history ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Supervisor scope helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_supervised_site_ids()
RETURNS bigint[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT CASE WHEN count(*) = 0 THEN NULL ELSE array_agg(s.site_id) END
  FROM public.site_supervisor_logins s
  WHERE auth.uid() IS NOT NULL AND s.profile_id = auth.uid()
$$;

COMMENT ON FUNCTION public.current_user_supervised_site_ids() IS
  'Site ids a Site Supervisor login may see; NULL when the caller is not a site supervisor (no restriction).';

CREATE OR REPLACE FUNCTION public.current_user_is_site_supervisor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.site_supervisor_logins s WHERE s.profile_id = auth.uid())
$$;

GRANT EXECUTE ON FUNCTION public.current_user_supervised_site_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_is_site_supervisor() TO authenticated, service_role;

-- Import batches already use this check; supervisors are narrowed to their site.
CREATE OR REPLACE FUNCTION public.current_user_can_access_site_attendance_site(p_site_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT public.current_user_has_site_attendance_access()
    AND EXISTS (
      SELECT 1 FROM public.sites s
      WHERE s.id = p_site_id
        AND public.current_user_can_access_calling_site_type(NULLIF(btrim(s.site_type), ''))
    )
    AND (
      public.current_user_supervised_site_ids() IS NULL
      OR p_site_id = ANY (public.current_user_supervised_site_ids())
    )
$$;

GRANT EXECUTE ON FUNCTION public.current_user_can_access_site_attendance_site(bigint) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS on the new tables
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS people_login_emails_select ON public.people_login_emails;
CREATE POLICY people_login_emails_select
  ON public.people_login_emails FOR SELECT TO authenticated
  USING (
    (
      (SELECT public.current_user_has_site_attendance_access())
      OR (SELECT public.current_user_can_manage_site_logins())
      OR (SELECT public.current_user_has_admin_module_access())
    )
    AND (
      (SELECT public.current_user_supervised_site_ids()) IS NULL
      OR EXISTS (
        SELECT 1 FROM public.site_assignments sa
        WHERE sa.person_id = people_login_emails.person_id
          AND sa.site_id = ANY ((SELECT public.current_user_supervised_site_ids())::bigint[])
      )
    )
  );
-- No INSERT / UPDATE / DELETE policies: writes only through the functions below.
GRANT SELECT ON public.people_login_emails TO authenticated;
GRANT ALL ON public.people_login_emails TO service_role;

DROP POLICY IF EXISTS site_supervisor_logins_select ON public.site_supervisor_logins;
CREATE POLICY site_supervisor_logins_select
  ON public.site_supervisor_logins FOR SELECT TO authenticated
  USING (
    profile_id = auth.uid()
    OR (SELECT public.current_user_can_manage_site_logins())
    OR (SELECT public.current_user_has_admin_module_access())
  );
GRANT SELECT ON public.site_supervisor_logins TO authenticated;
GRANT ALL ON public.site_supervisor_logins TO service_role;

DROP POLICY IF EXISTS site_supervisor_history_select ON public.site_supervisor_history;
CREATE POLICY site_supervisor_history_select
  ON public.site_supervisor_history FOR SELECT TO authenticated
  USING (
    (SELECT public.current_user_can_manage_site_logins())
    OR (SELECT public.current_user_has_admin_module_access())
  );
GRANT SELECT ON public.site_supervisor_history TO authenticated;
GRANT SELECT, INSERT ON public.site_supervisor_history TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.site_supervisor_history_id_seq TO service_role;

-- ---------------------------------------------------------------------------
-- Email: validation shared by HR edits and the site-login service
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.site_person_email_conflict(p_person_id bigint, p_email text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_code text;
  v_other record;
BEGIN
  IF v_email = '' THEN RETURN NULL; END IF;
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RETURN 'Enter a valid email address.';
  END IF;

  SELECT unique_code::text INTO v_code FROM public.people WHERE id = p_person_id;

  SELECT p.id, p.unique_code::text AS unique_code, p.full_name::text AS full_name INTO v_other
  FROM public.people_login_emails e
  JOIN public.people p ON p.id = e.person_id
  WHERE e.email = v_email AND e.person_id <> p_person_id
  LIMIT 1;
  IF FOUND THEN
    RETURN format('This email is already linked to %s (%s).', coalesce(v_other.full_name, 'another employee'), coalesce(v_other.unique_code, '—'));
  END IF;

  SELECT pr.employee_code::text AS employee_code INTO v_other
  FROM public.profiles pr
  WHERE lower(btrim(pr.email)) = v_email
  LIMIT 1;
  IF FOUND AND coalesce(public.norm_emp_code(v_other.employee_code), '') <> coalesce(public.norm_emp_code(v_code), '#') THEN
    RETURN 'This email is already used by another login. Use a different email.';
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.site_person_email_conflict(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.site_person_email_conflict(bigint, text) TO service_role;

/** Login (profile) linked to a person by employee code, if any. */
CREATE OR REPLACE FUNCTION public.site_person_login_profile_id(p_person_id bigint)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT pr.id
  FROM public.people pe
  JOIN public.profiles pr
    ON public.norm_emp_code(pr.employee_code) = public.norm_emp_code(pe.unique_code::text)
  WHERE pe.id = p_person_id
    AND coalesce(public.norm_emp_code(pe.unique_code::text), '') <> ''
  ORDER BY pr.created_at
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.site_person_login_profile_id(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.site_person_login_profile_id(bigint) TO service_role;

/**
 * HR People Master: set / clear a site employee's email.
 * When the person already has a login with a different email, raises
 * LOGIN_EMAIL_SYNC_REQUIRED (P0001) so the SPA routes the change through the
 * site-login service (Auth + profile + this table together).
 */
CREATE OR REPLACE FUNCTION public.set_person_login_email(p_person_id bigint, p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_conflict text;
  v_profile uuid;
  v_login_email text;
BEGIN
  IF public.current_user_is_site_supervisor()
     OR NOT (public.current_user_has_site_attendance_access() OR public.current_user_can_manage_site_logins()) THEN
    RAISE EXCEPTION 'Not allowed to change employee emails.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.people WHERE id = p_person_id) THEN
    RAISE EXCEPTION 'Site employee not found.' USING ERRCODE = 'P0002';
  END IF;

  v_profile := public.site_person_login_profile_id(p_person_id);
  IF v_profile IS NOT NULL THEN
    SELECT lower(btrim(email)) INTO v_login_email FROM public.profiles WHERE id = v_profile;
    IF v_email = '' THEN
      RAISE EXCEPTION 'This employee signs in with this email. It cannot be removed while the login exists.' USING ERRCODE = '22023';
    END IF;
    IF v_email IS DISTINCT FROM v_login_email THEN
      RAISE EXCEPTION 'LOGIN_EMAIL_SYNC_REQUIRED' USING ERRCODE = 'P0001',
        HINT = 'The employee has a login; change the email through the site-login service.';
    END IF;
  END IF;

  IF v_email = '' THEN
    DELETE FROM public.people_login_emails WHERE person_id = p_person_id;
    RETURN jsonb_build_object('person_id', p_person_id, 'email', NULL);
  END IF;

  v_conflict := public.site_person_email_conflict(p_person_id, v_email);
  IF v_conflict IS NOT NULL THEN
    RAISE EXCEPTION '%', v_conflict USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.people_login_emails (person_id, email, updated_at, updated_by)
  VALUES (p_person_id, v_email, now(), auth.uid())
  ON CONFLICT (person_id) DO UPDATE
    SET email = EXCLUDED.email, updated_at = now(), updated_by = auth.uid()
    WHERE public.people_login_emails.email IS DISTINCT FROM EXCLUDED.email;

  RETURN jsonb_build_object('person_id', p_person_id, 'email', v_email);
END;
$$;

REVOKE ALL ON FUNCTION public.set_person_login_email(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_person_login_email(bigint, text) TO authenticated, service_role;

/**
 * Site-login service, caller token: may this caller create / re-email the login
 * of this person with this email? Returns the linked profile id (NULL if none).
 */
CREATE OR REPLACE FUNCTION public.site_login_email_precheck(p_person_id bigint, p_email text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_conflict text;
  v_profile uuid;
BEGIN
  IF NOT public.current_user_can_manage_site_logins() THEN
    RAISE EXCEPTION 'Only HR can manage site employee logins.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.people WHERE id = p_person_id) THEN
    RAISE EXCEPTION 'Site employee not found.' USING ERRCODE = 'P0002';
  END IF;
  IF lower(btrim(coalesce(p_email, ''))) = '' THEN
    RAISE EXCEPTION 'A valid email is required.' USING ERRCODE = '22023';
  END IF;
  v_conflict := public.site_person_email_conflict(p_person_id, p_email);
  IF v_conflict IS NOT NULL THEN
    RAISE EXCEPTION '%', v_conflict USING ERRCODE = '23505';
  END IF;
  SELECT l.profile_id INTO v_profile FROM public.site_employee_login_links() l WHERE l.person_id = p_person_id LIMIT 1;
  RETURN jsonb_build_object('person_id', p_person_id, 'profile_id', v_profile);
END;
$$;

REVOKE ALL ON FUNCTION public.site_login_email_precheck(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.site_login_email_precheck(bigint, text) TO authenticated, service_role;

/** Service only (after Auth was updated): profile email + employee email together. */
CREATE OR REPLACE FUNCTION public.site_login_apply_email(p_person_id bigint, p_profile_id uuid, p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_email text := lower(btrim(coalesce(p_email, '')));
BEGIN
  IF v_email = '' THEN
    RAISE EXCEPTION 'Email is required.' USING ERRCODE = '22023';
  END IF;
  IF p_profile_id IS NOT NULL THEN
    PERFORM set_config('erp.bypass_profile_privilege_guard', 'on', true);
    UPDATE public.profiles SET email = v_email, updated_at = now() WHERE id = p_profile_id;
  END IF;
  INSERT INTO public.people_login_emails (person_id, email, updated_at, updated_by)
  VALUES (p_person_id, v_email, now(), NULL)
  ON CONFLICT (person_id) DO UPDATE SET email = EXCLUDED.email, updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.site_login_apply_email(bigint, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.site_login_apply_email(bigint, uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- Site Supervisor assignment
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.site_supervisor_precheck(p_person_id bigint, p_site_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_person record;
BEGIN
  IF NOT public.current_user_can_manage_site_logins() THEN
    RAISE EXCEPTION 'Only HR can add site supervisors.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.sites WHERE id = p_site_id) THEN
    RAISE EXCEPTION 'Site not found.' USING ERRCODE = 'P0002';
  END IF;

  SELECT id, unique_code::text AS unique_code, is_active INTO v_person FROM public.people WHERE id = p_person_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Site employee not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_person.is_active IS FALSE THEN
    RAISE EXCEPTION 'This site employee is inactive.' USING ERRCODE = '22023';
  END IF;
  IF coalesce(public.norm_emp_code(v_person.unique_code), '') = '' THEN
    RAISE EXCEPTION 'This site employee has no employee code yet.' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.site_assignments sa
    WHERE sa.person_id = p_person_id
      AND sa.site_id = p_site_id
      AND (sa.to_date IS NULL OR sa.to_date >= current_date)
      AND (sa.from_date IS NULL OR sa.from_date <= current_date)
  ) THEN
    RAISE EXCEPTION 'This employee is not currently assigned to this site.' USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object('person_id', p_person_id, 'site_id', p_site_id, 'employee_code', v_person.unique_code);
END;
$$;

REVOKE ALL ON FUNCTION public.site_supervisor_precheck(bigint, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.site_supervisor_precheck(bigint, bigint) TO authenticated, service_role;

/**
 * Make a site employee's login a Site Supervisor of one site (or move it to
 * another site). Sets exactly: ERP login on, HR -> Site Attendance -> Attendance
 * page, restricted to p_site_id. Earlier access is kept in site_supervisor_history.
 */
CREATE OR REPLACE FUNCTION public.assign_site_supervisor(p_person_id bigint, p_site_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_profile_id uuid;
  v_code text;
  v_old public.profiles%ROWTYPE;
  v_prev public.site_supervisor_logins%ROWTYPE;
  v_subs jsonb := '["hr.site-attendance", "site-attendance-page.attendance"]'::jsonb;
BEGIN
  PERFORM public.site_supervisor_precheck(p_person_id, p_site_id);

  SELECT l.profile_id INTO v_profile_id
  FROM public.site_employee_login_links() l
  WHERE l.person_id = p_person_id
  LIMIT 1;
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'This employee has no login linked by employee code. Create the login first.' USING ERRCODE = 'P0002';
  END IF;
  IF v_profile_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot change your own login access.' USING ERRCODE = '42501';
  END IF;

  SELECT unique_code::text INTO v_code FROM public.people WHERE id = p_person_id;
  SELECT * INTO v_old FROM public.profiles WHERE id = v_profile_id FOR UPDATE;
  SELECT * INTO v_prev FROM public.site_supervisor_logins WHERE profile_id = v_profile_id;

  PERFORM set_config('erp.bypass_profile_privilege_guard', 'on', true);

  UPDATE public.profiles
  SET
    role = 'executive',
    team = NULL,
    allowed_modules = '[]'::jsonb,
    allowed_sub_modules = v_subs,
    module_access_pending = false,
    updated_at = now()
  WHERE id = v_profile_id;

  INSERT INTO public.site_supervisor_logins (profile_id, person_id, site_id, employee_code, created_by, updated_by)
  VALUES (v_profile_id, p_person_id, p_site_id, btrim(v_code), auth.uid(), auth.uid())
  ON CONFLICT (profile_id) DO UPDATE
    SET person_id = EXCLUDED.person_id,
        site_id = EXCLUDED.site_id,
        employee_code = EXCLUDED.employee_code,
        updated_at = now(),
        updated_by = auth.uid();

  INSERT INTO public.site_supervisor_history (
    profile_id, person_id, action, old_site_id, new_site_id,
    old_allowed_modules, old_allowed_sub_modules, old_team, changed_by
  ) VALUES (
    v_profile_id, p_person_id,
    CASE WHEN v_prev.profile_id IS NULL THEN 'assigned' ELSE 'site_changed' END,
    v_prev.site_id, p_site_id,
    public.jsonb_text_array(to_jsonb(v_old) -> 'allowed_modules'),
    public.jsonb_text_array(to_jsonb(v_old) -> 'allowed_sub_modules'),
    v_old.team,
    auth.uid()
  );

  INSERT INTO public.site_login_access_history (
    person_id, profile_id, old_is_active, new_is_active,
    old_allowed_sub_modules, new_allowed_sub_modules, changed_by
  ) VALUES (
    p_person_id, v_profile_id, v_old.is_active, v_old.is_active,
    public.jsonb_text_array(to_jsonb(v_old) -> 'allowed_sub_modules'), v_subs, auth.uid()
  );

  RETURN jsonb_build_object('profile_id', v_profile_id, 'person_id', p_person_id, 'site_id', p_site_id);
END;
$$;

REVOKE ALL ON FUNCTION public.assign_site_supervisor(bigint, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_site_supervisor(bigint, bigint) TO authenticated, service_role;

/** Remove the supervisor role: drops the site row and the two supervisor screens. Login stays. */
CREATE OR REPLACE FUNCTION public.remove_site_supervisor(p_person_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_row public.site_supervisor_logins%ROWTYPE;
  v_old public.profiles%ROWTYPE;
  v_subs jsonb;
BEGIN
  IF NOT public.current_user_can_manage_site_logins() THEN
    RAISE EXCEPTION 'Only HR can remove site supervisors.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.site_supervisor_logins WHERE person_id = p_person_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This employee is not a site supervisor.' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.profile_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot change your own login access.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_old FROM public.profiles WHERE id = v_row.profile_id FOR UPDATE;

  SELECT coalesce(jsonb_agg(v ORDER BY v), '[]'::jsonb) INTO v_subs
  FROM jsonb_array_elements_text(public.jsonb_text_array(to_jsonb(v_old) -> 'allowed_sub_modules')) s(v)
  WHERE v NOT IN ('hr.site-attendance', 'site-attendance-page.attendance');

  PERFORM set_config('erp.bypass_profile_privilege_guard', 'on', true);
  UPDATE public.profiles SET allowed_sub_modules = v_subs, updated_at = now() WHERE id = v_row.profile_id;

  DELETE FROM public.site_supervisor_logins WHERE profile_id = v_row.profile_id;

  INSERT INTO public.site_supervisor_history (
    profile_id, person_id, action, old_site_id, new_site_id,
    old_allowed_modules, old_allowed_sub_modules, old_team, changed_by
  ) VALUES (
    v_row.profile_id, p_person_id, 'removed', v_row.site_id, NULL,
    public.jsonb_text_array(to_jsonb(v_old) -> 'allowed_modules'),
    public.jsonb_text_array(to_jsonb(v_old) -> 'allowed_sub_modules'),
    v_old.team, auth.uid()
  );

  INSERT INTO public.site_login_access_history (
    person_id, profile_id, old_is_active, new_is_active,
    old_allowed_sub_modules, new_allowed_sub_modules, changed_by
  ) VALUES (
    p_person_id, v_row.profile_id, v_old.is_active, v_old.is_active,
    public.jsonb_text_array(to_jsonb(v_old) -> 'allowed_sub_modules'), v_subs, auth.uid()
  );

  RETURN jsonb_build_object('profile_id', v_row.profile_id, 'person_id', p_person_id);
END;
$$;

REVOKE ALL ON FUNCTION public.remove_site_supervisor(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_site_supervisor(bigint) TO authenticated, service_role;

/** Edit Site picker: people currently assigned to a site, with email and login / supervisor state. */
CREATE OR REPLACE FUNCTION public.list_site_supervisor_candidates(p_site_id bigint)
RETURNS TABLE (
  person_id bigint,
  employee_code text,
  full_name text,
  designation text,
  email text,
  has_login boolean,
  login_email text,
  supervisor_site_id bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  IF NOT public.current_user_can_manage_site_logins() THEN
    RAISE EXCEPTION 'Only HR can add site supervisors.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (pe.id)
    pe.id,
    pe.unique_code::text,
    pe.full_name::text,
    pe.designation::text,
    e.email,
    (l.profile_id IS NOT NULL),
    pr.email::text,
    ss.site_id
  FROM public.site_assignments sa
  JOIN public.people pe ON pe.id = sa.person_id
  LEFT JOIN public.people_login_emails e ON e.person_id = pe.id
  LEFT JOIN public.site_employee_login_links() l ON l.person_id = pe.id
  LEFT JOIN public.profiles pr ON pr.id = l.profile_id
  LEFT JOIN public.site_supervisor_logins ss ON ss.person_id = pe.id
  WHERE sa.site_id = p_site_id
    AND (sa.to_date IS NULL OR sa.to_date >= current_date)
    AND (sa.from_date IS NULL OR sa.from_date <= current_date)
    AND pe.is_active IS NOT FALSE
  ORDER BY pe.id;
END;
$$;

REVOKE ALL ON FUNCTION public.list_site_supervisor_candidates(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_site_supervisor_candidates(bigint) TO authenticated, service_role;

/** Edit Site: current supervisors of a site. */
CREATE OR REPLACE FUNCTION public.list_site_supervisors(p_site_id bigint)
RETURNS TABLE (
  person_id bigint,
  profile_id uuid,
  employee_code text,
  full_name text,
  login_email text,
  is_active boolean,
  current_site_id bigint,
  current_site_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  IF NOT (public.current_user_can_manage_site_logins() OR public.current_user_has_admin_module_access()) THEN
    RAISE EXCEPTION 'Not allowed to view site supervisors.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    ss.person_id,
    ss.profile_id,
    coalesce(d.unique_code::text, ss.employee_code),
    d.full_name::text,
    pr.email::text,
    coalesce((to_jsonb(pr) ->> 'is_active')::boolean, true),
    d.current_site_id,
    d.current_site_name::text
  FROM public.site_supervisor_logins ss
  JOIN public.profiles pr ON pr.id = ss.profile_id
  LEFT JOIN public.hr_people_directory d ON d.id = ss.person_id
  WHERE ss.site_id = p_site_id
  ORDER BY d.full_name NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.list_site_supervisors(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_site_supervisors(bigint) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- hr_people_directory: + email (appended column; definition otherwise unchanged)
-- ---------------------------------------------------------------------------
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
  cs.location AS current_site_location,
  em.email
FROM public.people p
LEFT JOIN public.people_hr_leads l ON l.person_id = p.id
LEFT JOIN public.people_login_emails em ON em.person_id = p.id
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

GRANT SELECT ON public.hr_people_directory TO authenticated;
GRANT SELECT ON public.hr_people_directory TO service_role;

-- ---------------------------------------------------------------------------
-- list_site_employee_logins: + person email and supervisor site (User Management)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.list_site_employee_logins(bigint);

CREATE FUNCTION public.list_site_employee_logins(p_person_id bigint DEFAULT NULL)
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
  l2_employee_name text,
  person_email text,
  current_site_id bigint,
  supervisor_site_id bigint,
  supervisor_site_name text
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
    d.l2_employee_name,
    d.email,
    d.current_site_id,
    ss.site_id,
    st.site_name::text
  FROM public.site_employee_login_links() l
  JOIN public.profiles pr ON pr.id = l.profile_id
  JOIN public.hr_people_directory d ON d.id = l.person_id
  LEFT JOIN public.site_supervisor_logins ss ON ss.profile_id = pr.id
  LEFT JOIN public.sites st ON st.id = ss.site_id
  WHERE p_person_id IS NULL OR l.person_id = p_person_id
  ORDER BY d.full_name NULLS LAST, pr.email;
END;
$$;

REVOKE ALL ON FUNCTION public.list_site_employee_logins(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_site_employee_logins(bigint) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Restrictive policies: narrow Site Supervisors only.
-- Applied only where RLS is already enabled (never switched on here, so the
-- standalone HR app keeps working); skipped tables are reported as WARNINGs.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  v_scope text := '((SELECT public.current_user_supervised_site_ids()) IS NULL OR site_id = ANY ((SELECT public.current_user_supervised_site_ids())::bigint[]))';
  v_not_sup text := '((SELECT public.current_user_supervised_site_ids()) IS NULL)';
  v_rls boolean;
BEGIN
  -- Site-scoped read + write
  FOREACH t IN ARRAY ARRAY['attendance', 'site_grid_placements', 'summary_remarks'] LOOP
    SELECT c.relrowsecurity INTO v_rls FROM pg_class c WHERE c.oid = to_regclass(format('public.%I', t));
    IF v_rls IS NULL THEN CONTINUE; END IF;
    IF NOT v_rls THEN RAISE WARNING 'RLS is off on public.% — site supervisor scope NOT enforced there.', t; CONTINUE; END IF;
    EXECUTE format('DROP POLICY IF EXISTS site_supervisor_scope ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY site_supervisor_scope ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING %s WITH CHECK %s',
      t, v_scope, v_scope
    );
  END LOOP;

  -- Site-scoped read, no writes
  FOREACH t IN ARRAY ARRAY['site_assignments', 'site_designations'] LOOP
    SELECT c.relrowsecurity INTO v_rls FROM pg_class c WHERE c.oid = to_regclass(format('public.%I', t));
    IF v_rls IS NULL THEN CONTINUE; END IF;
    IF NOT v_rls THEN RAISE WARNING 'RLS is off on public.% — site supervisor scope NOT enforced there.', t; CONTINUE; END IF;
    EXECUTE format('DROP POLICY IF EXISTS site_supervisor_scope ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS site_supervisor_no_write ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY site_supervisor_scope ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING %s WITH CHECK %s',
      t, v_scope, v_not_sup
    );
  END LOOP;

  -- sites: own site only, no writes
  SELECT c.relrowsecurity INTO v_rls FROM pg_class c WHERE c.oid = to_regclass('public.sites');
  IF v_rls THEN
    DROP POLICY IF EXISTS site_supervisor_scope ON public.sites;
    EXECUTE format(
      'CREATE POLICY site_supervisor_scope ON public.sites AS RESTRICTIVE FOR ALL TO authenticated USING %s WITH CHECK %s',
      '((SELECT public.current_user_supervised_site_ids()) IS NULL OR id = ANY ((SELECT public.current_user_supervised_site_ids())::bigint[]))',
      v_not_sup
    );
  ELSIF v_rls IS NOT NULL THEN
    RAISE WARNING 'RLS is off on public.sites — site supervisor scope NOT enforced there.';
  END IF;

  -- people: only people with an assignment at the supervised site, no writes
  SELECT c.relrowsecurity INTO v_rls FROM pg_class c WHERE c.oid = to_regclass('public.people');
  IF v_rls THEN
    DROP POLICY IF EXISTS site_supervisor_scope ON public.people;
    EXECUTE format(
      'CREATE POLICY site_supervisor_scope ON public.people AS RESTRICTIVE FOR ALL TO authenticated USING %s WITH CHECK %s',
      '((SELECT public.current_user_supervised_site_ids()) IS NULL OR EXISTS (SELECT 1 FROM public.site_assignments sa WHERE sa.person_id = people.id AND sa.site_id = ANY ((SELECT public.current_user_supervised_site_ids())::bigint[])))',
      v_not_sup
    );
  ELSIF v_rls IS NOT NULL THEN
    RAISE WARNING 'RLS is off on public.people — site supervisor scope NOT enforced there.';
  END IF;

  -- No access at all: credentials, HR managers, sensitive / salary / payroll / leads / letters
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND (
        c.relname IN (
          'site_supervisors', 'hr_managers', 'site_hr_managers',
          'people_sensitive_details', 'people_hr_leads', 'people_hr_leads_history',
          'hr_site_iom_entries', 'hr_candidate_requisitions', 'hr_employee_payroll_profile',
          'admin_official_letters', 'admin_personal_letters', 'admin_probation_reviews',
          'site_login_access_history', 'site_supervisor_history',
          'site_attendance_import_batches', 'site_attendance_import_cells'
        )
        OR c.relname LIKE 'people\_salary\_%'
        OR c.relname LIKE 'hr\_payroll\_%'
        OR c.relname LIKE 'hr\_site\_payroll\_%'
        OR c.relname LIKE 'pay\_%'
      )
  LOOP
    SELECT c.relrowsecurity INTO v_rls FROM pg_class c WHERE c.oid = to_regclass(format('public.%I', t));
    IF NOT v_rls THEN RAISE WARNING 'RLS is off on public.% — site supervisor block NOT enforced there.', t; CONTINUE; END IF;
    EXECUTE format('DROP POLICY IF EXISTS site_supervisor_block ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY site_supervisor_block ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING %s WITH CHECK %s',
      t, v_not_sup, v_not_sup
    );
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
