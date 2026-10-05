-- Salary Admin access: add shilpa@indusfire.com and sharmavivekz683@gmail.com.
-- Same function body as 20260812130000; existing emails unchanged.

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

GRANT EXECUTE ON FUNCTION public.admin_salary_user_has_access() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
