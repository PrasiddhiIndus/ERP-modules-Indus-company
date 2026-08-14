-- =============================================================================
-- Admin Salary — Person-specific CTC components + history
-- + custom monthly amounts on CTC structure (JSON)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.admin_salary_person_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_master_id bigint NOT NULL
    REFERENCES public.admin_ifsp_employee_master(id) ON DELETE CASCADE,

  code text NOT NULL,
  name text NOT NULL,
  parent_code text NOT NULL DEFAULT 'PART_A'
    CHECK (parent_code IN ('PART_A', 'PART_B', 'BOTH')),
  kind text NOT NULL DEFAULT 'custom',
  formula text NOT NULL DEFAULT 'Manual',
  formula_label text,
  is_optional_preset boolean NOT NULL DEFAULT false,
  is_system boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  show_on_profile boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 50,

  amount_monthly numeric(14,2),
  amount_pa numeric(14,2),

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT admin_salary_person_components_code_chk
    CHECK (char_length(code) BETWEEN 1 AND 32),
  CONSTRAINT admin_salary_person_components_emp_code_uq
    UNIQUE (employee_master_id, code)
);

CREATE INDEX IF NOT EXISTS idx_admin_salary_person_components_employee
  ON public.admin_salary_person_components (employee_master_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_admin_salary_person_components_active
  ON public.admin_salary_person_components (employee_master_id)
  WHERE active = true;

DROP TRIGGER IF EXISTS trg_admin_salary_person_components_updated_at
  ON public.admin_salary_person_components;
CREATE TRIGGER trg_admin_salary_person_components_updated_at
  BEFORE UPDATE ON public.admin_salary_person_components
  FOR EACH ROW EXECUTE FUNCTION public.admin_salary_set_updated_at();

COMMENT ON TABLE public.admin_salary_person_components IS
  'Person-specific CTC salary components (Part A / Part B extras). Company defaults stay in app code.';

CREATE TABLE IF NOT EXISTS public.admin_salary_person_component_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_master_id bigint NOT NULL
    REFERENCES public.admin_ifsp_employee_master(id) ON DELETE CASCADE,
  component_id uuid
    REFERENCES public.admin_salary_person_components(id) ON DELETE SET NULL,

  code text NOT NULL,
  name text,
  parent_code text,
  action text NOT NULL
    CHECK (action IN ('created', 'updated', 'deleted', 'amount_changed', 'restored')),
  snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  remarks text,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_salary_person_comp_hist_employee
  ON public.admin_salary_person_component_history (employee_master_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_salary_person_comp_hist_code
  ON public.admin_salary_person_component_history (employee_master_id, code, created_at DESC);

COMMENT ON TABLE public.admin_salary_person_component_history IS
  'Audit history for person CTC components — added/changed/removed per employee.';

ALTER TABLE public.admin_salary_structures
  ADD COLUMN IF NOT EXISTS custom_component_amounts_json jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.admin_salary_structures.custom_component_amounts_json IS
  'Manual monthly amounts for person custom CTC components, keyed by component code.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_salary_person_components TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_salary_person_component_history TO authenticated, service_role;

ALTER TABLE public.admin_salary_person_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_salary_person_component_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_salary_person_components_all ON public.admin_salary_person_components;
CREATE POLICY admin_salary_person_components_all ON public.admin_salary_person_components
  FOR ALL TO authenticated
  USING (public.admin_salary_user_has_access())
  WITH CHECK (public.admin_salary_user_has_access());

DROP POLICY IF EXISTS admin_salary_person_component_history_all
  ON public.admin_salary_person_component_history;
CREATE POLICY admin_salary_person_component_history_all
  ON public.admin_salary_person_component_history
  FOR ALL TO authenticated
  USING (public.admin_salary_user_has_access())
  WITH CHECK (public.admin_salary_user_has_access());
