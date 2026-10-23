-- =============================================================================
-- Reports & Analytics / Daily Register: Admin-module users see all punch rows.
--
-- Symptom
--   Users granted Admin (or Reports & Analytics via allowed_sub_modules like
--   admin.reports) can open the screen but only see their own punch in/out.
--
-- Cause
--   20260901100000 rewrote current_user_has_attendance_admin_access() and
--   dropped the alignment from 20260831150000:
--     - normalize_erp_role / normalize_erp_module_key (HOD, case, team labels)
--     - allowed_sub_modules (admin.reports, admin.employee, hr.attendance, …)
--   RLS then falls through to erp_attendance_punches_select_own (own code only).
--
-- Fix
--   Restore the single-profile gate that treats Admin module + Admin sub-modules
--   the same as full admin/hr/payroll access. Do NOT restore USING (true).
-- DATA SAFETY: function metadata only — no row changes.
-- =============================================================================

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
        public.normalize_erp_role(p.role) IN ('admin', 'super_admin', 'super_admin_pro')
        OR public.normalize_erp_module_key(p.team) IN ('hr', 'admin')
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(
            public.jsonb_text_array(to_jsonb(p) -> 'allowed_modules')
          ) AS m(value)
          WHERE public.normalize_erp_module_key(m.value) IN ('hr', 'payroll', 'admin')
        )
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(
            public.jsonb_text_array(to_jsonb(p) -> 'allowed_sub_modules')
          ) AS s(value)
          WHERE public.normalize_erp_module_key(split_part(s.value, '.', 1)) IN ('hr', 'payroll', 'admin')
        )
      )
  );
$$;

COMMENT ON FUNCTION public.current_user_has_attendance_admin_access() IS
  'Attendance / leave / Reports punch gate. role admin|hod|super_admin*, team hr|admin, or hr/payroll/admin in allowed_modules / allowed_sub_modules (e.g. admin.reports).';

GRANT EXECUTE ON FUNCTION public.current_user_has_attendance_admin_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_has_attendance_admin_access() TO service_role;

NOTIFY pgrst, 'reload schema';
