-- Reverts to the narrowed gate from 20260901100000 (own punches for sub-module-only Admin users).

CREATE OR REPLACE FUNCTION public.current_user_has_attendance_admin_access()
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
        p.role IN ('admin', 'super_admin', 'super_admin_pro')
        OR lower(coalesce(p.team, '')) IN ('hr', 'admin')
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(coalesce(p.allowed_modules, '[]'::jsonb)) AS m(value)
          WHERE lower(m.value) IN ('hr', 'payroll', 'admin')
        )
      )
  );
$$;

COMMENT ON FUNCTION public.current_user_has_attendance_admin_access() IS
  'Cheap attendance/HR admin gate (single profiles read).';

GRANT EXECUTE ON FUNCTION public.current_user_has_attendance_admin_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_has_attendance_admin_access() TO service_role;

NOTIFY pgrst, 'reload schema';
