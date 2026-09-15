-- Track whether an assigned employee has agreed to a policy / terms document.

ALTER TABLE public.admin_employee_policy_assignments
  ADD COLUMN IF NOT EXISTS agreement_status text NOT NULL DEFAULT 'pending'
    CHECK (agreement_status IN ('pending', 'agreed'));

ALTER TABLE public.admin_employee_policy_assignments
  ADD COLUMN IF NOT EXISTS agreed_at timestamptz;

ALTER TABLE public.admin_employee_policy_assignments
  ADD COLUMN IF NOT EXISTS agreement_note text;

COMMENT ON COLUMN public.admin_employee_policy_assignments.agreement_status IS
  'Employee acknowledgment: pending until they agree in Indus One; then agreed.';

COMMENT ON COLUMN public.admin_employee_policy_assignments.agreed_at IS
  'When the employee marked the document as agreed.';

CREATE INDEX IF NOT EXISTS admin_employee_policy_assignments_status_idx
  ON public.admin_employee_policy_assignments (document_id, agreement_status);

-- Employees may update only their own assignment acknowledgment (Indus One).
DROP POLICY IF EXISTS admin_employee_policy_assignments_update_own_ack
  ON public.admin_employee_policy_assignments;

CREATE POLICY admin_employee_policy_assignments_update_own_ack
  ON public.admin_employee_policy_assignments
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.admin_ifsp_employee_master m
      LEFT JOIN public.profiles p ON p.id = auth.uid()
      WHERE m.id = admin_employee_policy_assignments.employee_master_id
        AND (
          m.user_id = auth.uid()
          OR (
            p.employee_code IS NOT NULL
            AND btrim(p.employee_code) <> ''
            AND m.employee_code = p.employee_code
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.admin_ifsp_employee_master m
      LEFT JOIN public.profiles p ON p.id = auth.uid()
      WHERE m.id = admin_employee_policy_assignments.employee_master_id
        AND (
          m.user_id = auth.uid()
          OR (
            p.employee_code IS NOT NULL
            AND btrim(p.employee_code) <> ''
            AND m.employee_code = p.employee_code
          )
        )
    )
    AND agreement_status IN ('pending', 'agreed')
  );

NOTIFY pgrst, 'reload schema';
