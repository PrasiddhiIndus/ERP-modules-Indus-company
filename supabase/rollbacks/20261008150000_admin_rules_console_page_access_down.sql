-- Rollback for 20261008150000_admin_rules_console_page_access.sql: admin roles only again.

CREATE OR REPLACE FUNCTION public.admin_rules_can_edit()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(auth.role(), '') = 'service_role'
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND coalesce((to_jsonb(p) ->> 'is_active')::boolean, true)
        AND public.normalize_erp_role(p.role) IN ('admin', 'super_admin', 'super_admin_pro')
    );
$$;

GRANT EXECUTE ON FUNCTION public.admin_rules_can_edit() TO authenticated, service_role;
