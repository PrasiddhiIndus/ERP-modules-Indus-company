-- =============================================================================
-- Role-based Admin/HR (assigned modules + sub-modules) must see the same
-- attendance, leave ledger, and leave-approval data as other admin logins.
--
-- Symptom
--   User Management grants Admin/HR screens via team, allowed_modules, or
--   allowed_sub_modules (e.g. admin.employee). The SPA opens Daily Register,
--   Leave Management, and Leave Approvals. Super Admin / role=admin logins
--   see all employees. Role-based accounts (HOD, department team labels,
--   sub-module-only grants, mixed-case role) see empty or own-only rows.
--
-- Cause
--   RLS helpers only matched exact role 'admin' / team 'hr'|'admin' /
--   allowed_modules hr|payroll|admin. They ignored:
--     - HOD (UI maps HOD → Admin)
--     - case (Admin vs admin)
--     - Employee Master team labels (Dahej-HR, Administration, Management)
--     - allowed_sub_modules (admin.employee, hr.attendance, …)
--
-- Fix
--   Align SQL with User Management + src/config/roles.js.
--   Keep a single profiles read (no nested C2/N1). Do NOT restore USING (true).
-- DATA SAFETY: function/policy metadata only — no row changes.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.normalize_erp_role(raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE replace(lower(btrim(coalesce(raw, ''))), ' ', '_')
    WHEN 'hod' THEN 'admin'
    WHEN 'admin' THEN 'admin'
    WHEN 'superadmin' THEN 'super_admin'
    WHEN 'super_admin' THEN 'super_admin'
    WHEN 'superadmin_pro' THEN 'super_admin_pro'
    WHEN 'super_admin_pro' THEN 'super_admin_pro'
    ELSE replace(lower(btrim(coalesce(raw, ''))), ' ', '_')
  END
$$;

COMMENT ON FUNCTION public.normalize_erp_role(text) IS
  'Canonical profile role. HOD → admin. Case-insensitive.';

CREATE OR REPLACE FUNCTION public.normalize_erp_module_key(raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(btrim(coalesce(raw, '')))
    WHEN 'hr' THEN 'hr'
    WHEN 'dahej-hr' THEN 'hr'
    WHEN 'admin' THEN 'admin'
    WHEN 'administration' THEN 'admin'
    WHEN 'management' THEN 'admin'
    WHEN 'payroll' THEN 'payroll'
    ELSE lower(btrim(coalesce(raw, '')))
  END
$$;

COMMENT ON FUNCTION public.normalize_erp_module_key(text) IS
  'Map Employee Master / User Management team labels to ERP module keys (hr, admin, payroll).';

GRANT EXECUTE ON FUNCTION public.normalize_erp_role(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_erp_role(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.normalize_erp_module_key(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_erp_module_key(text) TO service_role;

-- Cheap JSONB array reader — missing key / non-array → empty array.
CREATE OR REPLACE FUNCTION public.jsonb_text_array(src jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN jsonb_typeof(src) = 'array' THEN src ELSE '[]'::jsonb END
$$;

COMMENT ON FUNCTION public.jsonb_text_array(jsonb) IS
  'Return src when it is a JSON array, otherwise []. Safe for missing profile module columns.';

GRANT EXECUTE ON FUNCTION public.jsonb_text_array(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.jsonb_text_array(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.current_user_can_access_module(module_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  WITH requested AS (
    SELECT public.normalize_erp_module_key(module_key) AS key
  )
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    CROSS JOIN requested r
    WHERE p.id = auth.uid()
      AND auth.uid() IS NOT NULL
      AND r.key <> ''
      AND (
        public.normalize_erp_role(p.role) IN ('super_admin', 'super_admin_pro')
        OR (
          public.normalize_erp_role(p.role) = 'admin'
          AND r.key NOT IN ('usermanagement', 'softwaresubscriptions')
        )
        OR public.normalize_erp_module_key(p.team) = r.key
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(
            public.jsonb_text_array(to_jsonb(p) -> 'allowed_modules')
          ) AS m(value)
          WHERE public.normalize_erp_module_key(m.value) = r.key
        )
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(
            public.jsonb_text_array(to_jsonb(p) -> 'allowed_sub_modules')
          ) AS s(value)
          WHERE public.normalize_erp_module_key(split_part(s.value, '.', 1)) = r.key
        )
      )
  );
$$;

COMMENT ON FUNCTION public.current_user_can_access_module(text) IS
  'True when the signed-in user has the module via role (incl. HOD), mapped team, allowed_modules, or allowed_sub_modules.';

CREATE OR REPLACE FUNCTION public.current_user_has_admin_module_access()
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
        OR public.normalize_erp_module_key(p.team) = 'admin'
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(
            public.jsonb_text_array(to_jsonb(p) -> 'allowed_modules')
          ) AS m(value)
          WHERE public.normalize_erp_module_key(m.value) = 'admin'
        )
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(
            public.jsonb_text_array(to_jsonb(p) -> 'allowed_sub_modules')
          ) AS s(value)
          WHERE public.normalize_erp_module_key(split_part(s.value, '.', 1)) = 'admin'
        )
      )
  );
$$;

COMMENT ON FUNCTION public.current_user_has_admin_module_access() IS
  'Admin Employee Master / Admin Ops: role admin|hod|super_admin*, mapped team admin, or admin in allowed_modules / allowed_sub_modules.';

-- Single profiles read. Do not nest can_access_module here — large attendance
-- scans re-evaluate nested helpers unless policies wrap with (SELECT ...).
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
  'Attendance / leave admin gate. role admin|hod|super_admin*, mapped team hr|admin, or hr/payroll/admin in allowed_modules / allowed_sub_modules.';

GRANT EXECUTE ON FUNCTION public.current_user_can_access_module(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_can_access_module(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.current_user_has_admin_module_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_has_admin_module_access() TO service_role;
GRANT EXECUTE ON FUNCTION public.current_user_has_attendance_admin_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_has_attendance_admin_access() TO service_role;

NOTIFY pgrst, 'reload schema';
