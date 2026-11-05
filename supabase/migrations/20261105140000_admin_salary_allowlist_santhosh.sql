-- Salary Admin access: add santhoshmenon@indusfire.com.
-- Existing allowlisted emails are unchanged.

CREATE OR REPLACE FUNCTION public.admin_salary_user_has_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $salary_access$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND lower(btrim(coalesce(p.email, ''))) IN (
        'rahul.ifspl@gmail.com',
        'bency@indusfire.com',
        'latha@indusfire.com',
        'vaisakh@indusfire.com',
        'vaisakh_fire@yahoo.co.in',
        'shilpa@indusfire.com',
        'sharmavivekz683@gmail.com',
        'santhoshmenon@indusfire.com'
      )
  )
  OR lower(btrim(coalesce(auth.jwt() ->> 'email', ''))) IN (
    'rahul.ifspl@gmail.com',
    'bency@indusfire.com',
    'latha@indusfire.com',
    'vaisakh@indusfire.com',
    'vaisakh_fire@yahoo.co.in',
    'shilpa@indusfire.com',
    'sharmavivekz683@gmail.com',
    'santhoshmenon@indusfire.com'
  );
$salary_access$;

GRANT EXECUTE ON FUNCTION public.admin_salary_user_has_access() TO authenticated, service_role;

DO $do$
BEGIN
  IF to_regprocedure('admin_salary.current_user_has_access()') IS NOT NULL THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION admin_salary.current_user_has_access()
      RETURNS boolean
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path = public
      SET row_security = off
      AS $salary_access$ SELECT public.admin_salary_user_has_access(); $salary_access$;
    $fn$;
  END IF;
END
$do$;

NOTIFY pgrst, 'reload schema';
