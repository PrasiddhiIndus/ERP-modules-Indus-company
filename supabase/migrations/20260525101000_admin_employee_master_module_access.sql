-- Admin Employee Master is shared Admin-module data, not per-user private data.
-- Allow users with Admin module access to view/edit all employee master rows.

CREATE OR REPLACE FUNCTION public.current_user_has_admin_module_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role IN ('admin', 'super_admin', 'super_admin_pro')
          OR p.team = 'admin'
          OR COALESCE(p.allowed_modules, '[]'::jsonb) ? 'admin'
        )
    );
$$;

COMMENT ON FUNCTION public.current_user_has_admin_module_access() IS
  'RLS helper: Admin module users may manage shared admin employee master data.';

ALTER TABLE public.admin_ifsp_employee_master ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_employee_master_module_select" ON public.admin_ifsp_employee_master;
DROP POLICY IF EXISTS "admin_employee_master_module_insert" ON public.admin_ifsp_employee_master;
DROP POLICY IF EXISTS "admin_employee_master_module_update" ON public.admin_ifsp_employee_master;
DROP POLICY IF EXISTS "admin_employee_master_module_delete" ON public.admin_ifsp_employee_master;

CREATE POLICY "admin_employee_master_module_select"
  ON public.admin_ifsp_employee_master FOR SELECT
  TO authenticated
  USING (public.current_user_has_admin_module_access());

CREATE POLICY "admin_employee_master_module_insert"
  ON public.admin_ifsp_employee_master FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_has_admin_module_access());

CREATE POLICY "admin_employee_master_module_update"
  ON public.admin_ifsp_employee_master FOR UPDATE
  TO authenticated
  USING (public.current_user_has_admin_module_access())
  WITH CHECK (public.current_user_has_admin_module_access());

CREATE POLICY "admin_employee_master_module_delete"
  ON public.admin_ifsp_employee_master FOR DELETE
  TO authenticated
  USING (public.current_user_has_admin_module_access());
