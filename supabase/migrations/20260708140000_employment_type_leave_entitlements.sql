-- Employment-type driven leave entitlements (probation monthly accrual + prorated annual on confirmation).

-- Track confirmation date for mid-year probation → permanent/voucher/PIP transitions.
ALTER TABLE public.admin_ifsp_employee_master
  ADD COLUMN IF NOT EXISTS confirmation_date date;

COMMENT ON COLUMN public.admin_ifsp_employee_master.confirmation_date IS
  'Date employee was confirmed (probation → permanent/voucher/PIP). Drives prorated annual leave for the balance year.';

CREATE TABLE IF NOT EXISTS indus_one.employee_employment_type_changes (
  id bigserial PRIMARY KEY,
  employee_master_id bigint REFERENCES public.admin_ifsp_employee_master(id) ON DELETE SET NULL,
  employee_code text NOT NULL,
  old_employment_type text,
  new_employment_type text,
  confirmation_date date,
  changed_at timestamptz NOT NULL DEFAULT now(),
  leave_recalculated_year int
);

CREATE INDEX IF NOT EXISTS employee_employment_type_changes_code_idx
  ON indus_one.employee_employment_type_changes (employee_code, changed_at DESC);

-- Extended leave balance columns (SBEL, SPLA, SPLB, SPLM, Paternity).
ALTER TABLE indus_one.employee_leave_balances_yearly
  ADD COLUMN IF NOT EXISTS sbel_entitlement numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS spla_entitlement numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS splb_entitlement numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS splm_entitlement numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paternity_entitlement numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opening_sbel numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opening_spla numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opening_splb numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opening_splm numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opening_paternity numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS used_sbel numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS used_spla numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS used_splb numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS used_splm numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS used_paternity numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unused_sbel numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unused_spla numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unused_splb numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unused_splm numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unused_paternity numeric NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION indus_one.normalize_employment_type_for_leave(p_type text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(btrim(coalesce(p_type, '')))
    WHEN 'consultant' THEN 'consultant'
    WHEN 'c' THEN 'consultant'
    WHEN 'voucher' THEN 'voucher'
    WHEN 'voucher_employee' THEN 'voucher'
    WHEN 'v' THEN 'voucher'
    WHEN 'probation' THEN 'probation'
    WHEN 'probahtion' THEN 'probation'
    WHEN 'contract' THEN 'contract'
    WHEN 'pip' THEN 'pip'
    WHEN 'performance_improvement_plan' THEN 'pip'
    WHEN 'notice_period' THEN 'notice_period'
    WHEN 'notice' THEN 'notice_period'
    WHEN 'permanent' THEN 'permanent'
    WHEN 'p' THEN 'permanent'
    ELSE 'permanent'
  END;
$$;

CREATE OR REPLACE FUNCTION indus_one.is_annual_leave_employment_type(p_type text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT indus_one.normalize_employment_type_for_leave(p_type) IN ('permanent', 'voucher', 'pip');
$$;

CREATE OR REPLACE FUNCTION indus_one.is_probation_employment_type(p_type text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT indus_one.normalize_employment_type_for_leave(p_type) = 'probation';
$$;

CREATE OR REPLACE FUNCTION indus_one.count_calendar_months_in_year(
  p_year int,
  p_start_month int,
  p_end_month int
)
RETURNS int
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT GREATEST(
    0,
    LEAST(GREATEST(coalesce(p_end_month, 12), 1), 12)
      - GREATEST(coalesce(p_start_month, 1), 1)
      + 1
  );
$$;

CREATE OR REPLACE FUNCTION indus_one.compute_leave_entitlements(
  p_employment_type text,
  p_date_of_joining date,
  p_confirmation_date date,
  p_year int
)
RETURNS TABLE (
  pl_entitlement numeric,
  cl_entitlement numeric,
  sl_entitlement numeric,
  sbel_entitlement numeric,
  spla_entitlement numeric,
  splb_entitlement numeric,
  splm_entitlement numeric,
  paternity_entitlement numeric,
  probation_months int,
  annual_months int
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_type text := indus_one.normalize_employment_type_for_leave(p_employment_type);
  v_doj_month int := 1;
  v_conf_month int;
  v_probation_months int := 0;
  v_annual_months int := 0;
  v_annual_factor numeric := 0;

  c_pl constant numeric := 18;
  c_cl constant numeric := 8;
  c_sl constant numeric := 8;
  c_sbel constant numeric := 2;
  c_spla constant numeric := 0.5;
  c_splb constant numeric := 0.5;
  c_splm constant numeric := 3;
  c_paternity constant numeric := 3;
  c_prob_cl constant numeric := 1;
  c_prob_sl constant numeric := 1;
BEGIN
  IF p_date_of_joining IS NOT NULL
     AND EXTRACT(YEAR FROM p_date_of_joining)::int = p_year THEN
    v_doj_month := EXTRACT(MONTH FROM p_date_of_joining)::int;
  END IF;

  pl_entitlement := 0;
  cl_entitlement := 0;
  sl_entitlement := 0;
  sbel_entitlement := 0;
  spla_entitlement := 0;
  splb_entitlement := 0;
  splm_entitlement := 0;
  paternity_entitlement := 0;
  probation_months := 0;
  annual_months := 0;

  IF indus_one.is_probation_employment_type(v_type) THEN
    v_probation_months := indus_one.count_calendar_months_in_year(p_year, v_doj_month, 12);
    probation_months := v_probation_months;
    cl_entitlement := round(v_probation_months * c_prob_cl, 2);
    sl_entitlement := round(v_probation_months * c_prob_sl, 2);
    RETURN NEXT;
    RETURN;
  END IF;

  IF NOT indus_one.is_annual_leave_employment_type(v_type) THEN
    RETURN NEXT;
    RETURN;
  END IF;

  IF p_confirmation_date IS NOT NULL
     AND EXTRACT(YEAR FROM p_confirmation_date)::int = p_year THEN
    v_conf_month := EXTRACT(MONTH FROM p_confirmation_date)::int;
    v_probation_months := indus_one.count_calendar_months_in_year(
      p_year,
      v_doj_month,
      GREATEST(v_conf_month - 1, 0)
    );
    v_annual_months := indus_one.count_calendar_months_in_year(p_year, v_conf_month, 12);
    probation_months := v_probation_months;
    annual_months := v_annual_months;
    v_annual_factor := v_annual_months::numeric / 12.0;

    cl_entitlement := round((v_probation_months * c_prob_cl) + (c_cl * v_annual_factor), 2);
    sl_entitlement := round((v_probation_months * c_prob_sl) + (c_sl * v_annual_factor), 2);
    pl_entitlement := round(c_pl * v_annual_factor, 2);
    sbel_entitlement := round(c_sbel * v_annual_factor, 2);
    spla_entitlement := round(c_spla * v_annual_factor, 2);
    splb_entitlement := round(c_splb * v_annual_factor, 2);
    splm_entitlement := round(c_splm * v_annual_factor, 2);
    paternity_entitlement := round(c_paternity * v_annual_factor, 2);
    RETURN NEXT;
    RETURN;
  END IF;

  IF p_date_of_joining IS NOT NULL
     AND EXTRACT(YEAR FROM p_date_of_joining)::int = p_year THEN
    v_annual_months := indus_one.count_calendar_months_in_year(p_year, v_doj_month, 12);
  ELSE
    v_annual_months := 12;
  END IF;

  annual_months := v_annual_months;
  v_annual_factor := v_annual_months::numeric / 12.0;

  pl_entitlement := round(c_pl * v_annual_factor, 2);
  cl_entitlement := round(c_cl * v_annual_factor, 2);
  sl_entitlement := round(c_sl * v_annual_factor, 2);
  sbel_entitlement := round(c_sbel * v_annual_factor, 2);
  spla_entitlement := round(c_spla * v_annual_factor, 2);
  splb_entitlement := round(c_splb * v_annual_factor, 2);
  splm_entitlement := round(c_splm * v_annual_factor, 2);
  paternity_entitlement := round(c_paternity * v_annual_factor, 2);

  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION indus_one.recalculate_employee_leave_entitlements(
  p_employee_code text,
  p_year int DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::int
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = indus_one, public
AS $$
DECLARE
  v_code text := upper(btrim(coalesce(p_employee_code, '')));
  v_emp record;
  v_ent record;
BEGIN
  IF v_code = '' OR p_year IS NULL OR p_year < 1900 THEN
    RETURN;
  END IF;

  SELECT
    m.employee_code,
    m.employment_type,
    m.date_of_joining,
    m.confirmation_date,
    m.status
  INTO v_emp
  FROM public.admin_ifsp_employee_master m
  WHERE upper(btrim(coalesce(m.employee_code, ''))) = v_code
  ORDER BY m.id DESC
  LIMIT 1;

  IF NOT FOUND OR coalesce(v_emp.status, '') IS DISTINCT FROM 'Active' THEN
    RETURN;
  END IF;

  SELECT *
  INTO v_ent
  FROM indus_one.compute_leave_entitlements(
    v_emp.employment_type,
    v_emp.date_of_joining,
    v_emp.confirmation_date,
    p_year
  );

  INSERT INTO indus_one.employee_leave_balances_yearly (
    employee_code,
    year,
    pl_entitlement,
    sl_entitlement,
    cl_entitlement,
    sbel_entitlement,
    spla_entitlement,
    splb_entitlement,
    splm_entitlement,
    paternity_entitlement,
    unused_pl,
    unused_sl,
    unused_cl,
    unused_sbel,
    unused_spla,
    unused_splb,
    unused_splm,
    unused_paternity,
    processed_at
  )
  VALUES (
    v_code,
    p_year,
    v_ent.pl_entitlement,
    v_ent.sl_entitlement,
    v_ent.cl_entitlement,
    v_ent.sbel_entitlement,
    v_ent.spla_entitlement,
    v_ent.splb_entitlement,
    v_ent.splm_entitlement,
    v_ent.paternity_entitlement,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    now()
  )
  ON CONFLICT (employee_code, year) DO UPDATE SET
    pl_entitlement = EXCLUDED.pl_entitlement,
    sl_entitlement = EXCLUDED.sl_entitlement,
    cl_entitlement = EXCLUDED.cl_entitlement,
    sbel_entitlement = EXCLUDED.sbel_entitlement,
    spla_entitlement = EXCLUDED.spla_entitlement,
    splb_entitlement = EXCLUDED.splb_entitlement,
    splm_entitlement = EXCLUDED.splm_entitlement,
    paternity_entitlement = EXCLUDED.paternity_entitlement,
    unused_pl = GREATEST(
      0,
      coalesce(employee_leave_balances_yearly.opening_pl, 0)
        - coalesce(employee_leave_balances_yearly.used_pl, 0)
    ),
    unused_sl = GREATEST(
      0,
      coalesce(employee_leave_balances_yearly.opening_sl, 0)
        - coalesce(employee_leave_balances_yearly.used_sl, 0)
    ),
    unused_cl = GREATEST(
      0,
      coalesce(employee_leave_balances_yearly.opening_cl, 0)
        - coalesce(employee_leave_balances_yearly.used_cl, 0)
    ),
    unused_sbel = GREATEST(
      0,
      coalesce(employee_leave_balances_yearly.opening_sbel, 0)
        - coalesce(employee_leave_balances_yearly.used_sbel, 0)
    ),
    unused_spla = GREATEST(
      0,
      coalesce(employee_leave_balances_yearly.opening_spla, 0)
        - coalesce(employee_leave_balances_yearly.used_spla, 0)
    ),
    unused_splb = GREATEST(
      0,
      coalesce(employee_leave_balances_yearly.opening_splb, 0)
        - coalesce(employee_leave_balances_yearly.used_splb, 0)
    ),
    unused_splm = GREATEST(
      0,
      coalesce(employee_leave_balances_yearly.opening_splm, 0)
        - coalesce(employee_leave_balances_yearly.used_splm, 0)
    ),
    unused_paternity = GREATEST(
      0,
      coalesce(employee_leave_balances_yearly.opening_paternity, 0)
        - coalesce(employee_leave_balances_yearly.used_paternity, 0)
    ),
    processed_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION indus_one.recalculate_all_leave_entitlements_for_year(
  p_year int DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::int
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = indus_one, public
AS $$
DECLARE
  v_count int := 0;
  v_code text;
BEGIN
  FOR v_code IN
    SELECT upper(btrim(m.employee_code))
    FROM public.admin_ifsp_employee_master m
    WHERE coalesce(m.status, '') = 'Active'
      AND btrim(coalesce(m.employee_code, '')) <> ''
  LOOP
    PERFORM indus_one.recalculate_employee_leave_entitlements(v_code, p_year);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_admin_ifsp_employee_master_employment_type_leave_before()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, indus_one
AS $$
DECLARE
  v_old text;
  v_new text;
BEGIN
  v_new := indus_one.normalize_employment_type_for_leave(NEW.employment_type);
  IF TG_OP = 'UPDATE' THEN
    v_old := indus_one.normalize_employment_type_for_leave(OLD.employment_type);
    IF indus_one.is_probation_employment_type(v_old)
       AND indus_one.is_annual_leave_employment_type(v_new) THEN
      IF NEW.confirmation_date IS NULL THEN
        NEW.confirmation_date := CURRENT_DATE;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_admin_ifsp_employee_master_employment_type_leave_after()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, indus_one
AS $$
DECLARE
  v_old text;
  v_new text;
  v_year int := EXTRACT(YEAR FROM CURRENT_DATE)::int;
  v_code text;
BEGIN
  v_new := indus_one.normalize_employment_type_for_leave(NEW.employment_type);
  IF TG_OP = 'UPDATE' THEN
    v_old := indus_one.normalize_employment_type_for_leave(OLD.employment_type);
    IF v_old IS NOT DISTINCT FROM v_new
       AND NEW.confirmation_date IS NOT DISTINCT FROM OLD.confirmation_date
       AND NEW.date_of_joining IS NOT DISTINCT FROM OLD.date_of_joining THEN
      RETURN NEW;
    END IF;
  END IF;

  v_code := upper(btrim(coalesce(NEW.employee_code, '')));
  IF v_code <> '' THEN
    INSERT INTO indus_one.employee_employment_type_changes (
      employee_master_id,
      employee_code,
      old_employment_type,
      new_employment_type,
      confirmation_date,
      leave_recalculated_year
    ) VALUES (
      NEW.id,
      v_code,
      CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.employment_type END,
      NEW.employment_type,
      NEW.confirmation_date,
      v_year
    );

    PERFORM indus_one.recalculate_employee_leave_entitlements(v_code, v_year);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_employee_master_employment_type_leave ON public.admin_ifsp_employee_master;
DROP TRIGGER IF EXISTS trg_employee_master_employment_type_leave_before ON public.admin_ifsp_employee_master;
DROP TRIGGER IF EXISTS trg_employee_master_employment_type_leave_after ON public.admin_ifsp_employee_master;

CREATE TRIGGER trg_employee_master_employment_type_leave_before
  BEFORE UPDATE OF employment_type
  ON public.admin_ifsp_employee_master
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_admin_ifsp_employee_master_employment_type_leave_before();

CREATE TRIGGER trg_employee_master_employment_type_leave_after
  AFTER INSERT OR UPDATE OF employment_type, confirmation_date, date_of_joining
  ON public.admin_ifsp_employee_master
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_admin_ifsp_employee_master_employment_type_leave_after();

GRANT EXECUTE ON FUNCTION indus_one.recalculate_employee_leave_entitlements(text, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION indus_one.recalculate_all_leave_entitlements_for_year(int) TO authenticated, service_role;
GRANT SELECT ON indus_one.employee_employment_type_changes TO authenticated, service_role;

ALTER TABLE indus_one.employee_employment_type_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employee_employment_type_changes_select_authenticated
  ON indus_one.employee_employment_type_changes;
CREATE POLICY employee_employment_type_changes_select_authenticated
  ON indus_one.employee_employment_type_changes FOR SELECT
  TO authenticated USING (true);
