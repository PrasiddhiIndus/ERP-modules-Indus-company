-- Module-scoped access helper + Admin Employee Master policies.
-- Executive/Manager users can view/edit data inside their assigned team module
-- and explicit extra modules from User Management (public.profiles.allowed_modules).

CREATE OR REPLACE FUNCTION public.current_user_can_access_module(module_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH requested AS (
    SELECT lower(trim(coalesce(module_key, ''))) AS key
  )
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    CROSS JOIN requested r
    WHERE p.id = auth.uid()
      AND r.key <> ''
      AND (
        p.role IN ('super_admin', 'super_admin_pro')
        OR (
          p.role = 'admin'
          AND r.key NOT IN ('usermanagement', 'softwaresubscriptions')
        )
        OR lower(coalesce(p.team, '')) = r.key
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(coalesce(p.allowed_modules, '[]'::jsonb)) AS m(value)
          WHERE lower(m.value) = r.key
        )
      )
  );
$$;

COMMENT ON FUNCTION public.current_user_can_access_module(text) IS
  'True when the signed-in user has the requested module via role, team, or allowed_modules.';

ALTER TABLE public.admin_ifsp_employee_master ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_ifsp_employee_master_select_module_access"
  ON public.admin_ifsp_employee_master;
DROP POLICY IF EXISTS "admin_ifsp_employee_master_insert_module_access"
  ON public.admin_ifsp_employee_master;
DROP POLICY IF EXISTS "admin_ifsp_employee_master_update_module_access"
  ON public.admin_ifsp_employee_master;
DROP POLICY IF EXISTS "admin_ifsp_employee_master_delete_module_access"
  ON public.admin_ifsp_employee_master;

CREATE POLICY "admin_ifsp_employee_master_select_module_access"
  ON public.admin_ifsp_employee_master FOR SELECT
  TO authenticated
  USING (public.current_user_can_access_module('admin'));

CREATE POLICY "admin_ifsp_employee_master_insert_module_access"
  ON public.admin_ifsp_employee_master FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_can_access_module('admin'));

CREATE POLICY "admin_ifsp_employee_master_update_module_access"
  ON public.admin_ifsp_employee_master FOR UPDATE
  TO authenticated
  USING (public.current_user_can_access_module('admin'))
  WITH CHECK (public.current_user_can_access_module('admin'));

CREATE POLICY "admin_ifsp_employee_master_delete_module_access"
  ON public.admin_ifsp_employee_master FOR DELETE
  TO authenticated
  USING (public.current_user_can_access_module('admin'));
