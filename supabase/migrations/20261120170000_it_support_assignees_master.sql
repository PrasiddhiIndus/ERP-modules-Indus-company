-- IT Support Assignees master (same pattern as categories): curated list for Assign dropdown.

CREATE TABLE IF NOT EXISTS public.it_support_assignees (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      uuid NOT NULL REFERENCES public.profiles(id),
  display_name    text NOT NULL,
  employee_code   text,
  is_active       boolean NOT NULL DEFAULT true,
  sort_order      int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_it_support_assignees_profile_live
  ON public.it_support_assignees (profile_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_it_support_assignees_active
  ON public.it_support_assignees (sort_order, display_name)
  WHERE deleted_at IS NULL AND is_active = true;

COMMENT ON TABLE public.it_support_assignees IS
  'IT Support Assign-to master — profiles shown in the Assigned to dropdown (managed like categories).';

ALTER TABLE public.it_support_assignees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS it_support_assignees_select ON public.it_support_assignees;
CREATE POLICY it_support_assignees_select ON public.it_support_assignees
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      public.current_user_is_it_support_agent()
      OR public.current_user_is_it_support_admin()
    )
  );

DROP POLICY IF EXISTS it_support_assignees_write ON public.it_support_assignees;
CREATE POLICY it_support_assignees_write ON public.it_support_assignees
  FOR ALL TO authenticated
  USING (public.current_user_is_it_support_admin())
  WITH CHECK (public.current_user_is_it_support_admin());

GRANT SELECT, INSERT, UPDATE ON public.it_support_assignees TO authenticated;

-- Seed from the previous grant/heuristic agent directory (only when empty).
INSERT INTO public.it_support_assignees (profile_id, display_name, employee_code, is_active, sort_order)
SELECT
  p.id,
  coalesce(
    nullif(btrim(em.full_name), ''),
    nullif(btrim(p.username), ''),
    nullif(split_part(coalesce(p.email, ''), '@', 1), ''),
    'Agent'
  ),
  coalesce(nullif(btrim(em.employee_code), ''), nullif(btrim(p.employee_code), '')),
  true,
  0
FROM public.profiles p
LEFT JOIN public.admin_ifsp_employee_master em
  ON p.employee_code IS NOT NULL
 AND lower(btrim(em.employee_code)) = lower(btrim(p.employee_code))
WHERE coalesce(p.is_active, true) = true
  AND (
    replace(lower(btrim(coalesce(p.role, ''))), ' ', '_') IN ('super_admin', 'super_admin_pro')
    OR COALESCE(p.allowed_modules, '[]'::jsonb) ? 'itIs'
    OR COALESCE(p.allowed_modules, '[]'::jsonb) ? 'itis'
    OR lower(btrim(coalesce(p.team, ''))) IN (
      'itis', 'it_is', 'it/is', 'it-is', 'information system', 'information systems'
    )
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(COALESCE(p.allowed_sub_modules, '[]'::jsonb)) s(val)
      WHERE lower(btrim(s.val)) IN ('itis.helpdesk-agent', 'itis.helpdesk-admin')
         OR lower(btrim(s.val)) LIKE 'itis.helpdesk-agent%'
         OR lower(btrim(s.val)) LIKE 'itis.helpdesk-admin%'
    )
    OR EXISTS (
      SELECT 1
      FROM public.admin_ifsp_employee_master em2
      WHERE p.employee_code IS NOT NULL
        AND lower(btrim(em2.employee_code)) = lower(btrim(p.employee_code))
        AND lower(btrim(coalesce(em2.department, ''))) IN (
          'information system', 'information systems', 'it/is', 'it'
        )
    )
  )
  AND NOT EXISTS (SELECT 1 FROM public.it_support_assignees a WHERE a.deleted_at IS NULL LIMIT 1);

-- Assigned-to dropdown reads the assignees master (Employee Master names).
CREATE OR REPLACE FUNCTION public.it_list_support_agents()
RETURNS TABLE (
  id uuid,
  username text,
  email text,
  employee_code text,
  role text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  IF NOT public.current_user_is_it_support_agent() THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  -- Prefer curated master when any live rows exist.
  IF EXISTS (
    SELECT 1 FROM public.it_support_assignees a
    WHERE a.deleted_at IS NULL AND COALESCE(a.is_active, true) = true
  ) THEN
    RETURN QUERY
    SELECT
      a.profile_id AS id,
      a.display_name AS username,
      p.email,
      a.employee_code,
      p.role
    FROM public.it_support_assignees a
    JOIN public.profiles p ON p.id = a.profile_id
    WHERE a.deleted_at IS NULL
      AND COALESCE(a.is_active, true) = true
      AND coalesce(p.is_active, true) = true
    ORDER BY a.sort_order ASC NULLS LAST, a.display_name ASC NULLS LAST;
    RETURN;
  END IF;

  -- Fallback (empty master): previous grant heuristic.
  RETURN QUERY
  SELECT p.id, p.username, p.email, p.employee_code, p.role
  FROM public.profiles p
  WHERE coalesce(p.is_active, true) = true
    AND (
      replace(lower(btrim(coalesce(p.role, ''))), ' ', '_') IN ('super_admin', 'super_admin_pro')
      OR COALESCE(p.allowed_modules, '[]'::jsonb) ? 'itIs'
      OR COALESCE(p.allowed_modules, '[]'::jsonb) ? 'itis'
      OR lower(btrim(coalesce(p.team, ''))) IN (
        'itis', 'it_is', 'it/is', 'it-is', 'information system', 'information systems'
      )
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(COALESCE(p.allowed_sub_modules, '[]'::jsonb)) s(val)
        WHERE lower(btrim(s.val)) IN ('itis.helpdesk-agent', 'itis.helpdesk-admin')
           OR lower(btrim(s.val)) LIKE 'itis.helpdesk-agent%'
           OR lower(btrim(s.val)) LIKE 'itis.helpdesk-admin%'
      )
    )
  ORDER BY p.username NULLS LAST, p.email;
END;
$$;

COMMENT ON FUNCTION public.it_list_support_agents() IS
  'Assigned-to options from it_support_assignees master (Employee Master display names).';
