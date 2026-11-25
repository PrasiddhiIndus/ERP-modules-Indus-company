-- Raise Ticket: load issue-type masters for any active user (no Masters-page grant required).
-- Write policies stay admin-only.

CREATE OR REPLACE FUNCTION public.it_list_raise_masters()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = v_uid
      AND COALESCE(p.is_active, true) = true
  ) THEN
    RAISE EXCEPTION 'Your account is inactive';
  END IF;

  RETURN jsonb_build_object(
    'categories',
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', c.id,
            'name', c.name,
            'description', c.description,
            'is_active', c.is_active,
            'sort_order', c.sort_order,
            'created_at', c.created_at
          )
          ORDER BY c.sort_order ASC NULLS LAST, c.name ASC
        )
        FROM public.it_ticket_categories c
        WHERE c.deleted_at IS NULL
          AND COALESCE(c.is_active, true) = true
      ),
      '[]'::jsonb
    ),
    'subcategories',
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', s.id,
            'category_id', s.category_id,
            'name', s.name,
            'description', s.description,
            'is_active', s.is_active,
            'sort_order', s.sort_order,
            'created_at', s.created_at
          )
          ORDER BY s.sort_order ASC NULLS LAST, s.name ASC
        )
        FROM public.it_ticket_subcategories s
        WHERE s.deleted_at IS NULL
          AND COALESCE(s.is_active, true) = true
      ),
      '[]'::jsonb
    )
  );
END;
$$;

COMMENT ON FUNCTION public.it_list_raise_masters() IS
  'Active IT Support issue types for Raise Ticket — any active signed-in user; does not require Masters access.';

GRANT EXECUTE ON FUNCTION public.it_list_raise_masters() TO authenticated, service_role;

-- Align SELECT policies: raise form readers need masters without admin grant.
DROP POLICY IF EXISTS it_ticket_categories_select ON public.it_ticket_categories;
CREATE POLICY it_ticket_categories_select ON public.it_ticket_categories
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND public.current_user_has_it_support_raise());

DROP POLICY IF EXISTS it_ticket_subcategories_select ON public.it_ticket_subcategories;
CREATE POLICY it_ticket_subcategories_select ON public.it_ticket_subcategories
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND public.current_user_has_it_support_raise());
