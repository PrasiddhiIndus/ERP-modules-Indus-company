-- Add vaisakh@indusfire.com to Salary Admin allowlist (app + RLS).

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
        'vaisakh@indusfire.com'
      )
  )
  OR lower(btrim(coalesce(auth.jwt() ->> 'email', ''))) IN (
    'rahul.ifspl@gmail.com',
    'bency@indusfire.com',
    'latha@indusfire.com',
    'vaisakh@indusfire.com'
  );
$salary_access$;

COMMENT ON FUNCTION public.admin_salary_user_has_access() IS
  'Salary Admin allowlist: rahul.ifspl@gmail.com, bency@indusfire.com, latha@indusfire.com, vaisakh@indusfire.com only.';

GRANT EXECUTE ON FUNCTION public.admin_salary_user_has_access() TO authenticated, service_role;

-- Legacy schema helper (if still present after older salary migrations)
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
      AS $salary_access$
        SELECT EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = auth.uid()
            AND lower(btrim(coalesce(p.email, ''))) IN (
              'rahul.ifspl@gmail.com',
              'bency@indusfire.com',
              'latha@indusfire.com',
              'vaisakh@indusfire.com'
            )
        )
        OR lower(btrim(coalesce(auth.jwt() ->> 'email', ''))) IN (
          'rahul.ifspl@gmail.com',
          'bency@indusfire.com',
          'latha@indusfire.com',
          'vaisakh@indusfire.com'
        );
      $salary_access$;
    $fn$;
  END IF;
END
$do$;
