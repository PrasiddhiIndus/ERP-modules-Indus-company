-- Candidate requisitions (Indus One managers) — ERP Admin / HR access.
-- Table may already exist from Indus One migration; create IF NOT EXISTS for ERP-only DBs.

CREATE TABLE IF NOT EXISTS public.hr_candidate_requisitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_no text UNIQUE,
  raised_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_master_id bigint NOT NULL REFERENCES public.admin_ifsp_employee_master(id) ON DELETE CASCADE,
  department text,
  designation_requested text NOT NULL,
  positions_count integer NOT NULL DEFAULT 1 CHECK (positions_count > 0 AND positions_count <= 99),
  employment_type text NOT NULL DEFAULT 'Permanent',
  location text,
  required_by_date date,
  experience_min_years numeric(4, 1),
  skills_required text,
  justification text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'filled', 'cancelled')),
  hr_remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hr_candidate_requisitions
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS calling_started_at timestamptz;

COMMENT ON TABLE public.hr_candidate_requisitions IS
  'Manager-initiated candidate / manpower requisitions from Indus One; reviewed in INDUS OS Admin Recruitment.';

CREATE INDEX IF NOT EXISTS hr_candidate_requisitions_raiser_idx
  ON public.hr_candidate_requisitions (raised_by_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS hr_candidate_requisitions_status_idx
  ON public.hr_candidate_requisitions (status, created_at DESC);

CREATE OR REPLACE FUNCTION public.hr_candidate_requisitions_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hr_candidate_requisitions_updated_at
  ON public.hr_candidate_requisitions;
CREATE TRIGGER trg_hr_candidate_requisitions_updated_at
  BEFORE UPDATE ON public.hr_candidate_requisitions
  FOR EACH ROW
  EXECUTE FUNCTION public.hr_candidate_requisitions_set_updated_at();

ALTER TABLE public.hr_candidate_requisitions ENABLE ROW LEVEL SECURITY;

GRANT SELECT, UPDATE ON public.hr_candidate_requisitions TO authenticated;
GRANT ALL ON public.hr_candidate_requisitions TO service_role;

-- Admin / HR recruitment staff can list and update all requisitions.
DROP POLICY IF EXISTS hr_candidate_requisitions_select_hr ON public.hr_candidate_requisitions;
CREATE POLICY hr_candidate_requisitions_select_hr
  ON public.hr_candidate_requisitions
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_can_access_calling_master()
    OR (SELECT public.current_user_can_access_module('admin'))
    OR (SELECT public.current_user_has_admin_module_access())
    OR (SELECT public.current_user_can_access_module('hr'))
  );

DROP POLICY IF EXISTS hr_candidate_requisitions_update_hr ON public.hr_candidate_requisitions;
CREATE POLICY hr_candidate_requisitions_update_hr
  ON public.hr_candidate_requisitions
  FOR UPDATE
  TO authenticated
  USING (
    public.current_user_can_access_calling_master()
    OR (SELECT public.current_user_can_access_module('admin'))
    OR (SELECT public.current_user_has_admin_module_access())
    OR (SELECT public.current_user_can_access_module('hr'))
  )
  WITH CHECK (
    public.current_user_can_access_calling_master()
    OR (SELECT public.current_user_can_access_module('admin'))
    OR (SELECT public.current_user_has_admin_module_access())
    OR (SELECT public.current_user_can_access_module('hr'))
  );

NOTIFY pgrst, 'reload schema';
