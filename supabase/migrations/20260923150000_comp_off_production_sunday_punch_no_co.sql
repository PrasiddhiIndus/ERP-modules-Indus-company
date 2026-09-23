-- =============================================================================
-- Production / Production-FTC / Production - Neotech (and R&M):
-- Sunday machine punch → mark P, do NOT earn C/O.
-- Sunday P(OD) → earn C/O +1.
--
-- Strengthens department matching and actively revokes any non-POD Sunday
-- credit when a plain P/HD / punch-as-P would have been earned.
-- C/O ledger only — no attendance register / punch / master row changes.
-- =============================================================================

CREATE OR REPLACE FUNCTION indus_one.comp_off_norm_department(p_dept text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(
    lower(btrim(coalesce(p_dept, ''))),
    '\s*-\s*',
    '-',
    'g'
  );
$$;

CREATE OR REPLACE FUNCTION indus_one.comp_off_employee_department(p_employee_code text)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT indus_one.comp_off_norm_department(m.department)
  FROM public.admin_ifsp_employee_master m
  WHERE public.normalize_attendance_employee_code(m.employee_code)
      = public.normalize_attendance_employee_code(p_employee_code)
  LIMIT 1;
$$;

-- Sunday: only P(OD) earns C/O for these depts (machine punch P / HD does not).
CREATE OR REPLACE FUNCTION indus_one.comp_off_sunday_pod_only_employee(p_employee_code text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(indus_one.comp_off_employee_department(p_employee_code), '') IN (
    'production',
    'production-ftc',
    'production-neotech',
    'r&m'
  );
$$;

CREATE OR REPLACE FUNCTION indus_one.comp_off_third_saturday_excluded_employee(p_employee_code text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(indus_one.comp_off_employee_department(p_employee_code), '') IN (
    'production',
    'production-ftc',
    'production-neotech',
    'r&m'
  );
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

  -- Production* / R&M: Sunday machine punch (P/HD) does not earn; P(OD) earns +1.
  -- Also revoke any leftover non-POD Sunday credit for this day.
  IF extract(dow FROM p_earned_date) = 0
     AND indus_one.comp_off_sunday_pod_only_employee(v_code)
     AND v_mark IS DISTINCT FROM 'P(OD)' THEN
    PERFORM indus_one.comp_off_try_revoke_credit(v_code, p_earned_date);
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

-- Clear existing incorrect Sunday non-POD credits for Production* / R&M.
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

SELECT indus_one.reconcile_comp_off_credits_from_register();

COMMENT ON FUNCTION indus_one.comp_off_sunday_pod_only_employee(text) IS
  'Sunday C/O only for P(OD): Production, Production-FTC, Production - Neotech, R&M. Machine punch P does not earn.';

NOTIFY pgrst, 'reload schema';
