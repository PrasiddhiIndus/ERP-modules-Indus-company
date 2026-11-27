-- Rollback for 20261127150000_site_employee_email_and_supervisors.sql
-- Restores the previous functions / view and removes the supervisor scope.
-- Supervisor logins keep their profile row; their screens stay as last set
-- (remove hr.site-attendance from them in People Management first if needed).
-- DATA: drops people_login_emails, site_supervisor_logins and site_supervisor_history.

DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND p.polname IN ('site_supervisor_scope', 'site_supervisor_block')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS site_supervisor_scope ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS site_supervisor_block ON public.%I', t);
  END LOOP;
END $$;

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
$$;

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

DROP VIEW IF EXISTS public.hr_people_directory;
CREATE VIEW public.hr_people_directory
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
GRANT SELECT ON public.hr_people_directory TO authenticated;
GRANT SELECT ON public.hr_people_directory TO service_role;

DROP FUNCTION IF EXISTS public.list_site_supervisors(bigint);
DROP FUNCTION IF EXISTS public.list_site_supervisor_candidates(bigint);
DROP FUNCTION IF EXISTS public.remove_site_supervisor(bigint);
DROP FUNCTION IF EXISTS public.assign_site_supervisor(bigint, bigint);
DROP FUNCTION IF EXISTS public.site_supervisor_precheck(bigint, bigint);
DROP FUNCTION IF EXISTS public.site_login_apply_email(bigint, uuid, text);
DROP FUNCTION IF EXISTS public.site_login_email_precheck(bigint, text);
DROP FUNCTION IF EXISTS public.set_person_login_email(bigint, text);
DROP FUNCTION IF EXISTS public.site_person_login_profile_id(bigint);
DROP FUNCTION IF EXISTS public.site_person_email_conflict(bigint, text);
DROP TABLE IF EXISTS public.site_supervisor_history;
DROP TABLE IF EXISTS public.site_supervisor_logins;
DROP TABLE IF EXISTS public.people_login_emails;
DROP FUNCTION IF EXISTS public.current_user_is_site_supervisor();
DROP FUNCTION IF EXISTS public.current_user_supervised_site_ids();

NOTIFY pgrst, 'reload schema';
