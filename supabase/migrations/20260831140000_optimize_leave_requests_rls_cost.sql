-- =============================================================================
-- Leave inbox (approval requests): SELECT timeout + expensive per-row RLS.
--
-- Symptom: GET indus_one.leave_requests / admin_leave_requests select=*
-- HTTP 500 57014 statement timeout when the SPA falls back after API 429.
--
-- Cause: policies call current_user_has_admin_module_access(),
-- current_user_can_access_module('admin'), current_user_has_attendance_admin_access()
-- and current_user_is_manager() per row without InitPlan.
--
-- Fix: wrap the same OR branches in (SELECT ...) once per statement.
-- HR/Admin/managers still see all requests; employees still see own.
-- Do NOT restore USING (true). Do NOT drop Leave Approvals.
-- DATA SAFETY: policy metadata only — no row changes.
-- =============================================================================

SET lock_timeout = '20s';

DO $$
BEGIN
  IF to_regnamespace('indus_one') IS NULL THEN
    RAISE NOTICE 'Skipping leave-request RLS — indus_one not present.';
    RETURN;
  END IF;

  IF to_regclass('indus_one.admin_leave_requests') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE ON indus_one.admin_leave_requests TO authenticated;
    GRANT SELECT ON indus_one.admin_leave_requests TO service_role;

    DROP POLICY IF EXISTS admin_leave_requests_select_own ON indus_one.admin_leave_requests;
    CREATE POLICY admin_leave_requests_select_own ON indus_one.admin_leave_requests
      FOR SELECT TO authenticated
      USING (
        user_id = (SELECT auth.uid())
        OR (SELECT public.current_user_has_admin_module_access())
        OR (SELECT public.current_user_can_access_module('admin'))
        OR (SELECT public.current_user_has_attendance_admin_access())
        OR (SELECT coalesce(indus_one.current_user_is_manager(), false))
      );

    DROP POLICY IF EXISTS admin_leave_requests_update ON indus_one.admin_leave_requests;
    CREATE POLICY admin_leave_requests_update ON indus_one.admin_leave_requests
      FOR UPDATE TO authenticated
      USING (
        user_id = (SELECT auth.uid())
        OR (SELECT public.current_user_has_admin_module_access())
        OR (SELECT public.current_user_can_access_module('admin'))
        OR (SELECT public.current_user_has_attendance_admin_access())
        OR (SELECT coalesce(indus_one.current_user_is_manager(), false))
      )
      WITH CHECK (
        user_id = (SELECT auth.uid())
        OR (SELECT public.current_user_has_admin_module_access())
        OR (SELECT public.current_user_can_access_module('admin'))
        OR (SELECT public.current_user_has_attendance_admin_access())
        OR (SELECT coalesce(indus_one.current_user_is_manager(), false))
      );
  END IF;

  IF to_regclass('indus_one.leave_requests') IS NOT NULL THEN
    GRANT SELECT, UPDATE ON indus_one.leave_requests TO authenticated;
    GRANT SELECT ON indus_one.leave_requests TO service_role;

    DROP POLICY IF EXISTS leave_requests_select_erp ON indus_one.leave_requests;
    CREATE POLICY leave_requests_select_erp ON indus_one.leave_requests
      FOR SELECT TO authenticated
      USING (
        user_id = (SELECT auth.uid())
        OR (SELECT public.current_user_has_admin_module_access())
        OR (SELECT public.current_user_can_access_module('admin'))
        OR (SELECT public.current_user_has_attendance_admin_access())
        OR (SELECT coalesce(indus_one.current_user_is_manager(), false))
      );

    DROP POLICY IF EXISTS leave_requests_update_erp ON indus_one.leave_requests;
    CREATE POLICY leave_requests_update_erp ON indus_one.leave_requests
      FOR UPDATE TO authenticated
      USING (
        user_id = (SELECT auth.uid())
        OR (SELECT public.current_user_has_admin_module_access())
        OR (SELECT public.current_user_can_access_module('admin'))
        OR (SELECT public.current_user_has_attendance_admin_access())
        OR (SELECT coalesce(indus_one.current_user_is_manager(), false))
      )
      WITH CHECK (
        user_id = (SELECT auth.uid())
        OR (SELECT public.current_user_has_admin_module_access())
        OR (SELECT public.current_user_can_access_module('admin'))
        OR (SELECT public.current_user_has_attendance_admin_access())
        OR (SELECT coalesce(indus_one.current_user_is_manager(), false))
      );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
