-- =============================================================================
-- Daily Attendance Register — department C/O + 3rd Saturday WO rules
--
-- WO (JS register sync; SQL earning mirrors for C/O):
--   Production, Production-FTC, Production - Neotech, R&M, M&M, Maintenance-FTC
--   → no auto WO on 3rd Saturday (work day; blank if no punch).
--
-- C/O earn:
--   Production* + R&M:
--     Sunday P / HD / punch-as-P → no C/O; Sunday P(OD) → C/O.
--     3rd Saturday is a normal work day → no C/O for plain present.
--   M&M + Maintenance-FTC:
--     Sunday or 3rd Saturday present / punch / P(OD) → C/O.
--
-- Updates only indus_one.comp_off_credits (revoke obsolete + reconcile).
-- Does not modify attendance register, punches, or employee master rows.
-- =============================================================================

CREATE OR REPLACE FUNCTION indus_one.comp_off_employee_department(p_employee_code text)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT lower(btrim(coalesce(m.department, '')))
  FROM public.admin_ifsp_employee_master m
  WHERE public.normalize_attendance_employee_code(m.employee_code)
      = public.normalize_attendance_employee_code(p_employee_code)
  LIMIT 1;
$$;

-- 3rd Saturday is NOT a C/O earning day (work day, no WO) for these depts.
CREATE OR REPLACE FUNCTION indus_one.comp_off_third_saturday_excluded_employee(p_employee_code text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(indus_one.comp_off_employee_department(p_employee_code), '') IN (
    'production',
    'production-ftc',
    'production - neotech',
    'r&m'
  );
$$;

-- Sunday: only P(OD) earns C/O (plain P / HD / punch-as-P does not).
CREATE OR REPLACE FUNCTION indus_one.comp_off_sunday_pod_only_employee(p_employee_code text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(indus_one.comp_off_employee_department(p_employee_code), '') IN (
    'production',
    'production-ftc',
    'production - neotech',
    'r&m'
  );
$$;

-- M&M / Maintenance-FTC: 3rd Saturday remains an earning day (work without WO mark).
-- Production* / R&M stay excluded via comp_off_third_saturday_excluded_employee.
CREATE OR REPLACE FUNCTION indus_one.comp_off_is_earning_day(
  p_date date,
  p_prior_mark text DEFAULT NULL,
  p_employee_code text DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    CASE
      WHEN p_date IS NULL THEN false
      WHEN indus_one.comp_off_normalize_mark(p_prior_mark) IN ('WO', 'NH/PH', 'NHPH') THEN true
      WHEN extract(dow FROM p_date) = 0 THEN true
      WHEN EXISTS (
        SELECT 1
        FROM public.admin_national_public_holidays h
        WHERE h.holiday_date = p_date
          AND h.holiday_type IN ('NH', 'PH')
      ) THEN true
      WHEN indus_one.comp_off_is_third_saturday(p_date)
        AND NOT indus_one.comp_off_third_saturday_excluded_employee(p_employee_code)
      THEN true
      ELSE false
    END;
$$;

CREATE OR REPLACE FUNCTION indus_one.comp_off_try_earn_credit(
  p_employee_code text,
  p_earned_date date,
  p_register_id uuid,
  p_mark text,
  p_prior_mark text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, indus_one
AS $$
DECLARE
  v_code text := indus_one.comp_off_norm_emp(p_employee_code);
  v_mark text := indus_one.comp_off_normalize_mark(p_mark);
  v_source text;
BEGIN
  IF v_code = '' OR p_earned_date IS NULL THEN RETURN; END IF;
  IF p_earned_date < indus_one.comp_off_cutoff_date() THEN RETURN; END IF;
  IF NOT indus_one.comp_off_is_present_mark(v_mark) THEN RETURN; END IF;
  IF NOT indus_one.comp_off_is_earning_day(p_earned_date, p_prior_mark, v_code) THEN RETURN; END IF;

  -- Production* / R&M: Sunday present earns only for P(OD).
  IF extract(dow FROM p_earned_date) = 0
     AND indus_one.comp_off_sunday_pod_only_employee(v_code)
     AND v_mark IS DISTINCT FROM 'P(OD)' THEN
    RETURN;
  END IF;

  v_source := CASE
    WHEN v_mark = 'P(OD)' THEN 'register_pod'
    ELSE 'register_p'
  END;

  INSERT INTO indus_one.comp_off_credits (
    employee_code, earned_date, source_type, source_register_id, source_key,
    credit_amount, expiry_date, status
  )
  VALUES (
    v_code,
    p_earned_date,
    v_source,
    p_register_id,
    v_code || '|' || p_earned_date::text,
    1,
    indus_one.comp_off_expiry_for_earned(p_earned_date),
    'available'
  )
  ON CONFLICT (employee_code, earned_date) DO UPDATE
  SET
    source_register_id = coalesce(excluded.source_register_id, indus_one.comp_off_credits.source_register_id),
    source_type = excluded.source_type,
    source_key = excluded.source_key,
    status = CASE
      WHEN indus_one.comp_off_credits.status = 'revoked'
        AND indus_one.comp_off_credits.consumed_amount = 0
      THEN 'available'
      ELSE indus_one.comp_off_credits.status
    END,
    updated_at = now();
END;
$$;

-- Align existing C/O credits to the new department rules (ledger only).
-- 1) Revoke Sunday non-POD credits for Production* / R&M (unconsumed only).
UPDATE indus_one.comp_off_credits c
SET
  status = 'revoked',
  updated_at = now()
WHERE c.earned_date >= indus_one.comp_off_cutoff_date()
  AND extract(dow FROM c.earned_date) = 0
  AND c.source_type IS DISTINCT FROM 'register_pod'
  AND c.consumed_amount = 0
  AND c.status IN ('available', 'partial')
  AND indus_one.comp_off_sunday_pod_only_employee(c.employee_code);

-- 2) Revoke 3rd-Saturday credits for Production* / R&M (normal work day; no C/O).
UPDATE indus_one.comp_off_credits c
SET
  status = 'revoked',
  updated_at = now()
WHERE c.earned_date >= indus_one.comp_off_cutoff_date()
  AND indus_one.comp_off_is_third_saturday(c.earned_date)
  AND c.consumed_amount = 0
  AND c.status IN ('available', 'partial')
  AND indus_one.comp_off_third_saturday_excluded_employee(c.employee_code);

-- 3) Reconcile so M&M / Maintenance-FTC 3rd-Saturday (and other valid) earns apply.
SELECT indus_one.reconcile_comp_off_credits_from_register();

COMMENT ON FUNCTION indus_one.comp_off_third_saturday_excluded_employee(text) IS
  'True when 3rd Saturday is a normal work day (no C/O for plain present): Production, Production-FTC, Production - Neotech, R&M.';

COMMENT ON FUNCTION indus_one.comp_off_sunday_pod_only_employee(text) IS
  'True when Sunday C/O is earned only for P(OD): Production, Production-FTC, Production - Neotech, R&M.';

NOTIFY pgrst, 'reload schema';
