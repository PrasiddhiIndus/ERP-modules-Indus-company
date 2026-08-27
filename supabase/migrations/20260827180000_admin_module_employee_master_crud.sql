-- =============================================================================
-- Restore Admin-module CRUD on employee master.
--
-- After Indus One Option A (20260827110000), employee-master policies used only
-- current_user_has_admin_module_access() which is role-only (N1). ERP then added
-- a SELECT-only attendance-admin policy so Admin-module users (team/allowed_modules)
-- could see the grid but not INSERT/UPDATE/DELETE.
--
-- Product intent: users with Admin module access must read/write/delete Admin Ops
-- employee master data. Keep N1 role gate as an OR (privilege users still work).
-- Do NOT restore erp_auth_* USING (true) for authenticated (N8 stays).
-- DATA SAFETY: policy metadata only — no row updates/deletes.
-- =============================================================================

DO $$
BEGIN
  IF to_regclass('public.admin_ifsp_employee_master') IS NULL THEN
    RAISE NOTICE 'Skipping — admin_ifsp_employee_master not present.';
    RETURN;
  END IF;

  GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_ifsp_employee_master TO authenticated;
  GRANT ALL ON public.admin_ifsp_employee_master TO service_role;

  -- Drop Option A role-only CRUD + SELECT-only crutch (recreated below as needed)
  DROP POLICY IF EXISTS admin_ifsp_employee_master_select_module_access
    ON public.admin_ifsp_employee_master;
  DROP POLICY IF EXISTS admin_ifsp_employee_master_insert_module_access
    ON public.admin_ifsp_employee_master;
  DROP POLICY IF EXISTS admin_ifsp_employee_master_update_module_access
    ON public.admin_ifsp_employee_master;
  DROP POLICY IF EXISTS admin_ifsp_employee_master_delete_module_access
    ON public.admin_ifsp_employee_master;
  DROP POLICY IF EXISTS admin_employee_master_module_select
    ON public.admin_ifsp_employee_master;
  DROP POLICY IF EXISTS admin_employee_master_module_insert
    ON public.admin_ifsp_employee_master;
  DROP POLICY IF EXISTS admin_employee_master_module_update
    ON public.admin_ifsp_employee_master;
  DROP POLICY IF EXISTS admin_employee_master_module_delete
    ON public.admin_ifsp_employee_master;
  DROP POLICY IF EXISTS admin_ifsp_employee_master_attendance_admin_select
    ON public.admin_ifsp_employee_master;

  -- Full CRUD for Admin module (C2) OR privileged roles (N1)
  CREATE POLICY admin_ifsp_employee_master_select_module_access
    ON public.admin_ifsp_employee_master
    FOR SELECT TO authenticated
    USING (
      (SELECT public.current_user_can_access_module('admin'))
      OR (SELECT public.current_user_has_admin_module_access())
    );

  CREATE POLICY admin_ifsp_employee_master_insert_module_access
    ON public.admin_ifsp_employee_master
    FOR INSERT TO authenticated
    WITH CHECK (
      (SELECT public.current_user_can_access_module('admin'))
      OR (SELECT public.current_user_has_admin_module_access())
    );

  CREATE POLICY admin_ifsp_employee_master_update_module_access
    ON public.admin_ifsp_employee_master
    FOR UPDATE TO authenticated
    USING (
      (SELECT public.current_user_can_access_module('admin'))
      OR (SELECT public.current_user_has_admin_module_access())
    )
    WITH CHECK (
      (SELECT public.current_user_can_access_module('admin'))
      OR (SELECT public.current_user_has_admin_module_access())
    );

  CREATE POLICY admin_ifsp_employee_master_delete_module_access
    ON public.admin_ifsp_employee_master
    FOR DELETE TO authenticated
    USING (
      (SELECT public.current_user_can_access_module('admin'))
      OR (SELECT public.current_user_has_admin_module_access())
    );

  -- HR / payroll attendance admins may list employees for Daily Register
  -- without getting write access to employee master.
  CREATE POLICY admin_ifsp_employee_master_attendance_admin_select
    ON public.admin_ifsp_employee_master
    FOR SELECT TO authenticated
    USING ((SELECT public.current_user_has_attendance_admin_access()));
END $$;

NOTIFY pgrst, 'reload schema';
