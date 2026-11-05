-- Candidate profile updates call admin_recruitment_requisition_is_linkable when a
-- requisition is linked. That helper was missing on the live database, so Postgres
-- raised 42883 and the screen showed "Recruitment is being updated."
-- Creates the helper only. Does not rewrite candidates, requisitions, or balances.

CREATE OR REPLACE FUNCTION public.admin_recruitment_requisition_is_linkable(p_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_recruitment_requisitions
    WHERE id = p_id
      AND status IN ('submitted', 'pending_approval', 'approved', 'open')
  );
$$;

REVOKE ALL ON FUNCTION public.admin_recruitment_requisition_is_linkable(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_recruitment_requisition_is_linkable(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
