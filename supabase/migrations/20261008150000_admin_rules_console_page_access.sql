-- Rules Console page access from User Management.
-- Users given the "Rules Console" page (allowed_sub_modules contains 'admin.rules-console') may do
-- everything Admin users can on the console: save values, review pending changes and manage groups.
-- The approval on/off switch stays Super Admin / Super Admin Pro only (admin_rules_can_configure).

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
        AND (
          public.normalize_erp_role(p.role) IN ('admin', 'super_admin', 'super_admin_pro')
          OR public.jsonb_text_array(to_jsonb(p) -> 'allowed_sub_modules') ? 'admin.rules-console'
        )
    );
$$;

GRANT EXECUTE ON FUNCTION public.admin_rules_can_edit() TO authenticated, service_role;
