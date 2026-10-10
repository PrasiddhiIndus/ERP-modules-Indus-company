-- Rollback for 20261010110000_admin_salary_allowlist_vaisakh_yahoo.sql
-- Restores the 20261005190000 allowlist (without vaisakh_fire@yahoo.co.in).

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
        'shilpa@indusfire.com',
        'sharmavivekz683@gmail.com'
      )
  )
  OR lower(btrim(coalesce(auth.jwt() ->> 'email', ''))) IN (
    'rahul.ifspl@gmail.com',
    'bency@indusfire.com',
    'latha@indusfire.com',
    'vaisakh@indusfire.com',
    'shilpa@indusfire.com',
    'sharmavivekz683@gmail.com'
  );
$salary_access$;

NOTIFY pgrst, 'reload schema';
