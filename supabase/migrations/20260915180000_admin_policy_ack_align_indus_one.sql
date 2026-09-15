-- Align ERP Admin with Indus One acknowledgment fields.
-- Indus One writes: agreed (bool), acknowledged_at, acknowledged_name via RPC.
-- ERP may also have agreement_status / agreed_at from an earlier migration.

ALTER TABLE public.admin_employee_policy_assignments
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS acknowledged_name text,
  ADD COLUMN IF NOT EXISTS agreed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.admin_employee_policy_assignments.acknowledged_at IS
  'When the assigned employee agreed to the policy/terms in Indus One.';
COMMENT ON COLUMN public.admin_employee_policy_assignments.acknowledged_name IS
  'Typed full name used as the employee signature.';
COMMENT ON COLUMN public.admin_employee_policy_assignments.agreed IS
  'True after the employee checked Agree and Continue in Indus One.';

CREATE INDEX IF NOT EXISTS admin_employee_policy_assignments_ack_idx
  ON public.admin_employee_policy_assignments (employee_master_id, acknowledged_at DESC NULLS LAST);

DO $$
BEGIN
  -- Backfill Indus One columns from legacy ERP agreement columns (if present).
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'admin_employee_policy_assignments'
      AND column_name = 'agreement_status'
  ) THEN
    EXECUTE $sql$
      UPDATE public.admin_employee_policy_assignments
      SET
        agreed = true,
        acknowledged_at = coalesce(acknowledged_at, agreed_at, now())
      WHERE coalesce(agreed, false) IS NOT TRUE
        AND lower(coalesce(agreement_status, '')) = 'agreed'
    $sql$;

    EXECUTE $sql$
      UPDATE public.admin_employee_policy_assignments
      SET
        agreement_status = 'agreed',
        agreed_at = coalesce(agreed_at, acknowledged_at, now())
      WHERE coalesce(agreed, false) IS TRUE
        AND acknowledged_at IS NOT NULL
        AND (
          lower(coalesce(agreement_status, '')) <> 'agreed'
          OR agreed_at IS NULL
        )
    $sql$;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.acknowledge_my_policy_assignment(
  p_assignment_id uuid,
  p_signed_name text,
  p_agreed boolean DEFAULT true
)
RETURNS public.admin_employee_policy_assignments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.admin_employee_policy_assignments;
  v_name text;
  v_has_legacy boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF coalesce(p_agreed, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'You must agree to continue';
  END IF;

  v_name := nullif(btrim(coalesce(p_signed_name, '')), '');
  IF v_name IS NULL OR char_length(v_name) < 2 THEN
    RAISE EXCEPTION 'Please sign with your full name';
  END IF;

  IF p_assignment_id IS NULL THEN
    RAISE EXCEPTION 'assignment_id is required';
  END IF;

  SELECT a.*
  INTO v_row
  FROM public.admin_employee_policy_assignments a
  JOIN public.admin_ifsp_employee_master m ON m.id = a.employee_master_id
  LEFT JOIN public.profiles p ON p.id = auth.uid()
  WHERE a.id = p_assignment_id
    AND (
      m.user_id = auth.uid()
      OR (
        p.employee_code IS NOT NULL
        AND btrim(p.employee_code) <> ''
        AND m.employee_code = p.employee_code
      )
    )
  FOR UPDATE OF a;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assignment not found or not available to you';
  END IF;

  IF v_row.acknowledged_at IS NOT NULL AND coalesce(v_row.agreed, false) THEN
    RETURN v_row;
  END IF;

  UPDATE public.admin_employee_policy_assignments
  SET
    agreed = true,
    acknowledged_name = v_name,
    acknowledged_at = now()
  WHERE id = p_assignment_id
  RETURNING * INTO v_row;

  -- Keep legacy ERP columns in sync when they exist.
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'admin_employee_policy_assignments'
      AND column_name = 'agreement_status'
  ) INTO v_has_legacy;

  IF v_has_legacy THEN
    UPDATE public.admin_employee_policy_assignments
    SET
      agreement_status = 'agreed',
      agreed_at = coalesce(agreed_at, now())
    WHERE id = p_assignment_id
    RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.acknowledge_my_policy_assignment(uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acknowledge_my_policy_assignment(uuid, text, boolean) TO authenticated;

COMMENT ON FUNCTION public.acknowledge_my_policy_assignment(uuid, text, boolean) IS
  'Record Indus One agree + typed-name acknowledgment for the caller''s own policy assignment.';

NOTIFY pgrst, 'reload schema';
