-- Paste this entire script in Supabase SQL Editor (run as one query).
-- Creates/repairs Salary Admin allowlist access function.

CREATE SCHEMA IF NOT EXISTS admin_salary;

CREATE OR REPLACE FUNCTION admin_salary.current_user_has_access()
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
        'latha@indusfire.com'
      )
  )
  OR lower(btrim(coalesce(auth.jwt() ->> 'email', ''))) IN (
    'rahul.ifspl@gmail.com',
    'bency@indusfire.com',
    'latha@indusfire.com'
  );
$salary_access$;

COMMENT ON FUNCTION admin_salary.current_user_has_access() IS
  'Salary Admin allowlist: rahul.ifspl@gmail.com, bency@indusfire.com, latha@indusfire.com only.';

GRANT EXECUTE ON FUNCTION admin_salary.current_user_has_access() TO authenticated, service_role;
