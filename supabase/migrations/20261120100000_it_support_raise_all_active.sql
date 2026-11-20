-- IT Support: every active authenticated user can raise / see own tickets.
-- Agent and admin gates stay grant-based (IT/IS / helpdesk-agent / helpdesk-admin).

CREATE OR REPLACE FUNCTION public.current_user_has_it_support_raise()
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
      AND COALESCE(p.is_active, true) = true
  );
$$;

COMMENT ON FUNCTION public.current_user_has_it_support_raise() IS
  'IT Support: any active signed-in user can raise tickets and see their own.';

GRANT EXECUTE ON FUNCTION public.current_user_has_it_support_raise() TO authenticated, service_role;
