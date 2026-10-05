-- =============================================================================
-- Compensation Scheme 2026-27 (Annexure-I salary breakup)
--
-- 1. admin_payroll_rule_versions — Payroll Rule Master, versioned by Effective From
--    and keyed by scheme (Old / New). A version used by a saved CTC record is locked:
--    rules can only change through a new version.
-- 2. admin_salary_structures / admin_salary_structure_revisions — new Annexure-I
--    columns. Existing CTC rows keep working unchanged (structure_version IS NULL).
-- 3. admin_salary_ctc_audit — old / new values for CTC and rule changes.
--
-- Access: same rule as the rest of Salary Admin (admin_salary_user_has_access()).
-- DATA SAFETY: additive only.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Payroll Rule Master
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_payroll_rule_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme text NOT NULL CHECK (scheme IN ('old', 'new')),
  effective_from date NOT NULL,
  rules_json jsonb NOT NULL,
  annexure_title text NOT NULL DEFAULT 'COMPENSATION SCHEME – YEAR 2026-27',
  annexure_note text,
  signatory_company text,
  signatory_title text,
  remarks text,
  locked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT admin_payroll_rule_versions_scheme_from_unique UNIQUE (scheme, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_admin_payroll_rule_versions_lookup
  ON public.admin_payroll_rule_versions (scheme, effective_from DESC);

COMMENT ON TABLE public.admin_payroll_rule_versions IS
  'Payroll Rule Master for the Annexure-I salary breakup. One row per scheme per Effective From date. Locked once used by a CTC record.';

DROP TRIGGER IF EXISTS trg_admin_payroll_rule_versions_updated_at ON public.admin_payroll_rule_versions;
CREATE TRIGGER trg_admin_payroll_rule_versions_updated_at
  BEFORE UPDATE ON public.admin_payroll_rule_versions
  FOR EACH ROW EXECUTE FUNCTION public.admin_salary_set_updated_at();

CREATE OR REPLACE FUNCTION public.admin_payroll_rule_versions_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.locked THEN
      RAISE EXCEPTION 'This rule version is used by saved CTC records and cannot be deleted.';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.locked AND (
       NEW.rules_json IS DISTINCT FROM OLD.rules_json
    OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
    OR NEW.scheme IS DISTINCT FROM OLD.scheme
  ) THEN
    RAISE EXCEPTION 'This rule version is used by saved CTC records. Create a new version with a new Effective From date.';
  END IF;
  IF OLD.locked AND NOT NEW.locked THEN
    NEW.locked := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_payroll_rule_versions_guard ON public.admin_payroll_rule_versions;
CREATE TRIGGER trg_admin_payroll_rule_versions_guard
  BEFORE UPDATE OR DELETE ON public.admin_payroll_rule_versions
  FOR EACH ROW EXECUTE FUNCTION public.admin_payroll_rule_versions_guard();

INSERT INTO public.admin_payroll_rule_versions
  (scheme, effective_from, rules_json, annexure_note, signatory_company, signatory_title, remarks)
SELECT s.scheme, DATE '2026-04-01',
  '{
    "BENCH_SKILLED": 13585, "BENCH_SEMI": 13325, "BASIC_PCT": 50, "HRA_PCT": 40,
    "BONUS_PCT": 8.33, "MED_B2": 2500, "MED_B3": 5000,
    "BAND1_MAX": 18136, "BAND2_MAX": 30000, "BAND3_MAX": 49999,
    "PF_THRESHOLD": 25000, "EE_PF_PCT": 12, "EE_PF_FIXED": 3000,
    "ER_PF_PCT": 13, "ER_PF_FIXED": 3250,
    "ESIC_THRESHOLD": 21000, "EE_ESIC_PCT": 0.75, "ER_ESIC_PCT": 3.75,
    "PT_MONTHLY": 200, "GRATUITY_PCT": 4.81, "EXGRATIA_CAP": 20000,
    "MEDICLAIM_YEAR": 5000, "LE_DAYS": 7, "LE_DIVISOR": 26
  }'::jsonb,
  '*Note: The salary and its components mentioned herein are subject to revision in accordance with applicable Government laws and regulations from time to time, without any impact on the total CTC.',
  'For Indus Fire Safety Private Limited',
  'C.E.O.',
  'Compensation Scheme 2026-27 (initial seed)'
FROM (VALUES ('old'), ('new')) AS s(scheme)
ON CONFLICT (scheme, effective_from) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Annexure-I columns on the CTC tables
-- ---------------------------------------------------------------------------
ALTER TABLE public.admin_salary_structures
  ADD COLUMN IF NOT EXISTS structure_version text,
  ADD COLUMN IF NOT EXISTS skill_category text,
  ADD COLUMN IF NOT EXISTS salary_scheme text,
  ADD COLUMN IF NOT EXISTS employee_status text,
  ADD COLUMN IF NOT EXISTS employee_category text,
  ADD COLUMN IF NOT EXISTS salary_band smallint,
  ADD COLUMN IF NOT EXISTS input_basis text,
  ADD COLUMN IF NOT EXISTS input_amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS rule_version_id uuid,
  ADD COLUMN IF NOT EXISTS validation_status text,
  ADD COLUMN IF NOT EXISTS is_custom boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_overrides_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS system_values_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS revision_type text,
  ADD COLUMN IF NOT EXISTS conveyance_monthly numeric(14,2),
  ADD COLUMN IF NOT EXISTS stat_bonus_monthly numeric(14,2),
  ADD COLUMN IF NOT EXISTS medical_allowance_monthly numeric(14,2),
  ADD COLUMN IF NOT EXISTS ex_gratia_monthly numeric(14,2),
  ADD COLUMN IF NOT EXISTS pf_wage_monthly numeric(14,2);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admin_salary_structures_rule_version_fk') THEN
    ALTER TABLE public.admin_salary_structures
      ADD CONSTRAINT admin_salary_structures_rule_version_fk
      FOREIGN KEY (rule_version_id) REFERENCES public.admin_payroll_rule_versions (id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admin_salary_structures_annexure_values_chk') THEN
    ALTER TABLE public.admin_salary_structures
      ADD CONSTRAINT admin_salary_structures_annexure_values_chk CHECK (
        (skill_category IS NULL OR skill_category IN ('skilled', 'semi_skilled'))
        AND (salary_scheme IS NULL OR salary_scheme IN ('old', 'new'))
        AND (employee_status IS NULL OR employee_status IN ('probation', 'confirmed'))
        AND (input_basis IS NULL OR input_basis IN ('gross', 'ctc'))
        AND (revision_type IS NULL OR revision_type IN
          ('initial', 'increment', 'confirmation', 'scheme_change', 'correction', 'custom'))
      );
  END IF;
END $$;

COMMENT ON COLUMN public.admin_salary_structures.structure_version IS
  'annexure_2026 = Compensation Scheme (Annexure-I) record. NULL = earlier CTC structure.';
COMMENT ON COLUMN public.admin_salary_structures.stat_bonus_monthly IS
  'Advance Against Statutory Bonus (Part A). bonus_monthly remains the earlier Part B bonus line.';

ALTER TABLE public.admin_salary_structure_revisions
  ADD COLUMN IF NOT EXISTS effective_to date;

COMMENT ON COLUMN public.admin_salary_structure_revisions.effective_to IS
  'Last day this archived CTC applied (day before the next record''s W.E.F.).';

-- Lock a rule version once a CTC record uses it.
CREATE OR REPLACE FUNCTION public.admin_salary_lock_rule_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.rule_version_id IS NOT NULL THEN
    UPDATE public.admin_payroll_rule_versions
      SET locked = true
      WHERE id = NEW.rule_version_id AND locked = false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_salary_structures_lock_rule ON public.admin_salary_structures;
CREATE TRIGGER trg_admin_salary_structures_lock_rule
  AFTER INSERT OR UPDATE OF rule_version_id ON public.admin_salary_structures
  FOR EACH ROW EXECUTE FUNCTION public.admin_salary_lock_rule_version();

-- ---------------------------------------------------------------------------
-- 3. Audit (old / new values, user, timestamp)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_salary_ctc_audit (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  table_name text NOT NULL,
  record_id text,
  employee_master_id bigint,
  action text NOT NULL,
  old_values jsonb,
  new_values jsonb,
  changed_by uuid,
  changed_by_email text,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_salary_ctc_audit_employee
  ON public.admin_salary_ctc_audit (employee_master_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_salary_ctc_audit_table
  ON public.admin_salary_ctc_audit (table_name, changed_at DESC);

CREATE OR REPLACE FUNCTION public.admin_salary_ctc_audit_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_j jsonb := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END;
  new_j jsonb := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END;
  ref jsonb := coalesce(new_j, old_j);
BEGIN
  IF TG_OP = 'UPDATE' AND (old_j - 'updated_at') = (new_j - 'updated_at') THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.admin_salary_ctc_audit
    (table_name, record_id, employee_master_id, action, old_values, new_values, changed_by, changed_by_email)
  VALUES (
    TG_TABLE_NAME,
    ref ->> 'id',
    NULLIF(ref ->> 'employee_master_id', '')::bigint,
    lower(TG_OP),
    old_j,
    new_j,
    auth.uid(),
    auth.jwt() ->> 'email'
  );
  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_salary_structures_audit ON public.admin_salary_structures;
CREATE TRIGGER trg_admin_salary_structures_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.admin_salary_structures
  FOR EACH ROW EXECUTE FUNCTION public.admin_salary_ctc_audit_fn();

DROP TRIGGER IF EXISTS trg_admin_payroll_rule_versions_audit ON public.admin_payroll_rule_versions;
CREATE TRIGGER trg_admin_payroll_rule_versions_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.admin_payroll_rule_versions
  FOR EACH ROW EXECUTE FUNCTION public.admin_salary_ctc_audit_fn();

-- ---------------------------------------------------------------------------
-- Access (same as Salary Admin)
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_payroll_rule_versions TO authenticated, service_role;
GRANT SELECT ON public.admin_salary_ctc_audit TO authenticated;
GRANT ALL ON public.admin_salary_ctc_audit TO service_role;

ALTER TABLE public.admin_payroll_rule_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_salary_ctc_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_payroll_rule_versions_all ON public.admin_payroll_rule_versions;
CREATE POLICY admin_payroll_rule_versions_all ON public.admin_payroll_rule_versions
  FOR ALL TO authenticated
  USING (public.admin_salary_user_has_access())
  WITH CHECK (public.admin_salary_user_has_access());

DROP POLICY IF EXISTS admin_salary_ctc_audit_select ON public.admin_salary_ctc_audit;
CREATE POLICY admin_salary_ctc_audit_select ON public.admin_salary_ctc_audit
  FOR SELECT TO authenticated
  USING (public.admin_salary_user_has_access());

NOTIFY pgrst, 'reload schema';
