-- Production security hardening — ONE file for BOTH staging and production.
--
-- WHERE TO RUN
--   Staging (xjzhlbpgnpcmbdlufhwo): run this entire file in SQL Editor.
--   Production (wbyzhknaqcjqqtwopupl): run this SAME file in SQL Editor.
--
-- Do NOT use the older unguarded script (no to_regclass guards, no emp_code rename).
-- This file is a superset: on production it applies the same policies; on staging it
-- skips missing tables/schemas and renames emp_code → employee_code when needed.
--
-- NEVER run staging_fix_403.sql or staging_public_schema_all.sql on production.

-- ── Module access helpers ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.current_user_has_hr_payroll_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role IN ('super_admin', 'super_admin_pro', 'admin')
        OR p.allowed_modules @> '"hr"'::jsonb
        OR p.allowed_modules @> '"payroll"'::jsonb
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_has_amc_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role IN ('super_admin', 'super_admin_pro', 'admin')
        OR p.allowed_modules @> '"amc"'::jsonb
        OR p.allowed_modules @> '"procurement"'::jsonb
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_has_attendance_admin_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role IN ('super_admin', 'super_admin_pro', 'admin')
        OR p.allowed_modules @> '"hr"'::jsonb
        OR p.allowed_modules @> '"admin"'::jsonb
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_employee_code()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT NULLIF(btrim(p.employee_code), '')
  FROM public.profiles p
  WHERE p.id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.current_user_has_hr_payroll_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_has_amc_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_has_attendance_admin_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_employee_code() TO authenticated;

-- ── Profiles: block self-escalation of role / modules / team ─────────────────
CREATE OR REPLACE FUNCTION public.guard_profiles_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  IF auth.uid() = OLD.id AND NOT public.is_current_user_admin() THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Cannot change your own role.' USING ERRCODE = '42501';
    END IF;
    IF NEW.allowed_modules IS DISTINCT FROM OLD.allowed_modules THEN
      RAISE EXCEPTION 'Cannot change your own module access.' USING ERRCODE = '42501';
    END IF;
    IF NEW.team IS DISTINCT FROM OLD.team THEN
      RAISE EXCEPTION 'Cannot change your own team.' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profiles_self_update ON public.profiles;
CREATE TRIGGER trg_guard_profiles_self_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profiles_self_update();

DO $$
BEGIN
  IF to_regprocedure('public.get_profile_role(uuid)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.get_profile_role(uuid) FROM authenticated;
    GRANT EXECUTE ON FUNCTION public.get_profile_role(uuid) TO service_role;
  ELSE
    RAISE NOTICE 'Skipping get_profile_role grant changes — function not present.';
  END IF;
END $$;

-- ── Billing access: remove bootstrap bypass (skip if billing schema missing) ──
DO $$
BEGIN
  IF to_regnamespace('billing') IS NULL THEN
    RAISE NOTICE 'Skipping billing.current_user_has_billing_access — billing schema not present.';
    RETURN;
  END IF;

  EXECUTE $fn$
CREATE OR REPLACE FUNCTION billing.current_user_has_billing_access()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  has_access boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('super_admin', 'super_admin_pro')
  ) INTO has_access;
  IF has_access THEN RETURN true; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role IN ('admin', 'billing')
        OR p.team IN ('billing', 'commercial', 'commercialMt', 'commercialRm')
        OR (
          p.allowed_modules IS NOT NULL
          AND (
            p.allowed_modules @> '"billing"'::jsonb
            OR p.allowed_modules @> '"commercialMt"'::jsonb
            OR p.allowed_modules @> '"commercialRm"'::jsonb
            OR p.allowed_modules @> '"commercial"'::jsonb
          )
        )
      )
  ) INTO has_access;
  RETURN COALESCE(has_access, false);
END;
$body$;
$fn$;
END $$;

-- ── HR payroll RLS (only tables that exist) ───────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'hr_payroll_sites','hr_employee_payroll_profile','hr_payroll_components_master',
    'hr_site_payroll_formula_sets','hr_site_payroll_formula_components',
    'hr_payroll_runs','hr_payroll_run_employees','hr_payroll_employee_monthly_summary',
    'hr_payroll_employee_component_values','hr_payroll_manual_inputs',
    'hr_payroll_pf_details','hr_payroll_esic_details','hr_payroll_pt_state_rules',
    'hr_payroll_pt_details','hr_payroll_tds_rules','hr_payroll_tds_details',
    'hr_payroll_loans','hr_payroll_loan_recoveries','hr_payroll_payslips','hr_payroll_audit_logs'
  ]
  LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      RAISE NOTICE 'Skipping HR payroll RLS for public.% — table not present.', t;
      CONTINUE;
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS hr_payroll_auth_all ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS hr_payroll_admin_all ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS hr_payroll_self_read ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY hr_payroll_admin_all ON public.%I FOR ALL TO authenticated USING (public.current_user_has_hr_payroll_access()) WITH CHECK (public.current_user_has_hr_payroll_access())',
      t
    );
  END LOOP;
END $$;

-- Payslips: employees may read own row (when table exists)
DO $$
BEGIN
  IF to_regclass('public.hr_payroll_payslips') IS NULL THEN
    RAISE NOTICE 'Skipping hr_payroll_payslips self-read policy — table not present.';
    RETURN;
  END IF;

  DROP POLICY IF EXISTS hr_payroll_self_read ON public.hr_payroll_payslips;
  CREATE POLICY hr_payroll_self_read ON public.hr_payroll_payslips
    FOR SELECT TO authenticated
    USING (
      public.current_user_has_hr_payroll_access()
      OR EXISTS (
        SELECT 1 FROM public.admin_ifsp_employee_master em
        WHERE em.id = hr_payroll_payslips.employee_master_id
          AND lower(btrim(em.employee_code)) = lower(btrim(public.current_user_employee_code()))
      )
    );

  DROP POLICY IF EXISTS hr_payroll_auth_all ON public.hr_payroll_payslips;
  DROP POLICY IF EXISTS hr_payroll_admin_all ON public.hr_payroll_payslips;
  CREATE POLICY hr_payroll_admin_all ON public.hr_payroll_payslips
    FOR ALL TO authenticated
    USING (public.current_user_has_hr_payroll_access())
    WITH CHECK (public.current_user_has_hr_payroll_access());
END $$;

-- ── AMC RLS (only tables that exist) ──────────────────────────────────────────
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'amc_settings_masters', 'amc_customers', 'amc_contracts', 'amc_contract_sites',
    'amc_assets', 'amc_pm_schedules', 'amc_complaints', 'amc_service_visits',
    'amc_service_reports', 'amc_technician_allocations', 'amc_alerts',
    'amc_contract_renewals', 'amc_activity_logs'
  ]
  LOOP
    IF to_regclass(format('public.%I', tbl)) IS NULL THEN
      RAISE NOTICE 'Skipping AMC RLS for public.% — table not present.', tbl;
      CONTINUE;
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS amc_%s_auth_all ON public.%I', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS amc_%s_module_access ON public.%I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY amc_%s_module_access ON public.%I FOR ALL TO authenticated USING (public.current_user_has_amc_access()) WITH CHECK (public.current_user_has_amc_access())',
      tbl, tbl
    );
  END LOOP;
END $$;

-- ── Attendance register RLS (skip if table missing) ───────────────────────────
DO $$
DECLARE
  att_emp_col text;
BEGIN
  IF to_regclass('public.admin_attendance_register') IS NULL THEN
    RAISE NOTICE 'Skipping admin_attendance_register RLS — table not present.';
    RETURN;
  END IF;

  -- Production uses employee_code; older DBs may still have emp_code.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'admin_attendance_register' AND column_name = 'emp_code'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'admin_attendance_register' AND column_name = 'employee_code'
  ) THEN
    ALTER TABLE public.admin_attendance_register RENAME COLUMN emp_code TO employee_code;
    RAISE NOTICE 'Renamed public.admin_attendance_register.emp_code → employee_code';
  END IF;

  DROP POLICY IF EXISTS admin_attendance_register_select_authenticated ON public.admin_attendance_register;
  DROP POLICY IF EXISTS admin_attendance_register_insert_authenticated ON public.admin_attendance_register;
  DROP POLICY IF EXISTS admin_attendance_register_update_authenticated ON public.admin_attendance_register;
  DROP POLICY IF EXISTS admin_attendance_register_delete_authenticated ON public.admin_attendance_register;
  DROP POLICY IF EXISTS admin_attendance_register_hr_all ON public.admin_attendance_register;
  DROP POLICY IF EXISTS admin_attendance_register_self_read ON public.admin_attendance_register;

  CREATE POLICY admin_attendance_register_hr_all ON public.admin_attendance_register
    FOR ALL TO authenticated
    USING (public.current_user_has_attendance_admin_access())
    WITH CHECK (public.current_user_has_attendance_admin_access());

  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'admin_attendance_register'
        AND column_name = 'employee_code'
    ) THEN 'employee_code'
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'admin_attendance_register'
        AND column_name = 'emp_code'
    ) THEN 'emp_code'
    ELSE 'employee_code'
  END INTO att_emp_col;

  EXECUTE format(
    'CREATE POLICY admin_attendance_register_self_read ON public.admin_attendance_register
      FOR SELECT TO authenticated
      USING (
        public.current_user_has_attendance_admin_access()
        OR lower(btrim(%I)) = lower(btrim(public.current_user_employee_code()))
      )',
    att_emp_col
  );
END $$;

-- ── indus_one: revoke anon, tighten leave balances (skip if schema missing) ───
DO $$
DECLARE
  rec record;
  bal_emp_col text;
BEGIN
  IF to_regnamespace('indus_one') IS NULL THEN
    RAISE NOTICE 'Skipping indus_one RLS — schema not present.';
    RETURN;
  END IF;

  -- Staging may still have emp_code (before 20260609150000); align to employee_code.
  FOR rec IN
    SELECT unnest(ARRAY[
      'admin_leave_requests',
      'admin_leave_balance_ledger',
      'employee_pl_encash_pref',
      'employee_leave_balances_yearly'
    ]::text[]) AS tbl
  LOOP
    IF to_regclass(format('indus_one.%I', rec.tbl)) IS NULL THEN
      CONTINUE;
    END IF;
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'indus_one' AND table_name = rec.tbl AND column_name = 'emp_code'
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'indus_one' AND table_name = rec.tbl AND column_name = 'employee_code'
    ) THEN
      EXECUTE format('ALTER TABLE indus_one.%I RENAME COLUMN emp_code TO employee_code', rec.tbl);
      RAISE NOTICE 'Renamed indus_one.%.emp_code → employee_code', rec.tbl;
    END IF;
  END LOOP;

  REVOKE ALL ON ALL TABLES IN SCHEMA indus_one FROM anon;
  REVOKE ALL ON SCHEMA indus_one FROM anon;

  IF to_regclass('indus_one.leave_carry_forward_rules') IS NOT NULL THEN
    DROP POLICY IF EXISTS leave_carry_forward_rules_select_authenticated ON indus_one.leave_carry_forward_rules;
    DROP POLICY IF EXISTS leave_carry_forward_rules_write_authenticated ON indus_one.leave_carry_forward_rules;
    DROP POLICY IF EXISTS leave_carry_forward_rules_hr ON indus_one.leave_carry_forward_rules;
    CREATE POLICY leave_carry_forward_rules_hr ON indus_one.leave_carry_forward_rules
      FOR ALL TO authenticated
      USING (public.current_user_has_attendance_admin_access())
      WITH CHECK (public.current_user_has_attendance_admin_access());
  END IF;

  IF to_regclass('indus_one.employee_pl_encash_pref') IS NOT NULL THEN
    DROP POLICY IF EXISTS employee_pl_encash_pref_select_authenticated ON indus_one.employee_pl_encash_pref;
    DROP POLICY IF EXISTS employee_pl_encash_pref_write_authenticated ON indus_one.employee_pl_encash_pref;
    DROP POLICY IF EXISTS employee_pl_encash_pref_hr ON indus_one.employee_pl_encash_pref;
    CREATE POLICY employee_pl_encash_pref_hr ON indus_one.employee_pl_encash_pref
      FOR ALL TO authenticated
      USING (public.current_user_has_attendance_admin_access())
      WITH CHECK (public.current_user_has_attendance_admin_access());
  END IF;

  IF to_regclass('indus_one.employee_leave_balances_yearly') IS NOT NULL THEN
    DROP POLICY IF EXISTS employee_leave_balances_yearly_select_authenticated ON indus_one.employee_leave_balances_yearly;
    DROP POLICY IF EXISTS employee_leave_balances_yearly_write_authenticated ON indus_one.employee_leave_balances_yearly;
    DROP POLICY IF EXISTS employee_leave_balances_hr ON indus_one.employee_leave_balances_yearly;
    DROP POLICY IF EXISTS employee_leave_balances_self ON indus_one.employee_leave_balances_yearly;
    CREATE POLICY employee_leave_balances_hr ON indus_one.employee_leave_balances_yearly
      FOR ALL TO authenticated
      USING (public.current_user_has_attendance_admin_access())
      WITH CHECK (public.current_user_has_attendance_admin_access());

    SELECT CASE
      WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'indus_one'
          AND table_name = 'employee_leave_balances_yearly'
          AND column_name = 'employee_code'
      ) THEN 'employee_code'
      WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'indus_one'
          AND table_name = 'employee_leave_balances_yearly'
          AND column_name = 'emp_code'
      ) THEN 'emp_code'
      ELSE 'employee_code'
    END INTO bal_emp_col;

    EXECUTE format(
      'CREATE POLICY employee_leave_balances_self ON indus_one.employee_leave_balances_yearly
        FOR SELECT TO authenticated
        USING (
          public.current_user_has_attendance_admin_access()
          OR lower(btrim(%I)) = lower(btrim(public.current_user_employee_code()))
        )',
      bal_emp_col
    );
  END IF;
END $$;

-- ── Leave functions (skip if indus_one leave workflow not installed) ───────────
DO $$
DECLARE
  att_reg_emp_col text;
BEGIN
  IF to_regnamespace('indus_one') IS NULL
     OR to_regclass('indus_one.admin_leave_requests') IS NULL THEN
    RAISE NOTICE 'Skipping leave function updates — indus_one leave workflow not present.';
    RETURN;
  END IF;

  IF to_regclass('public.admin_attendance_register') IS NOT NULL THEN
    SELECT CASE
      WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'admin_attendance_register'
          AND column_name = 'employee_code'
      ) THEN 'employee_code'
      WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'admin_attendance_register'
          AND column_name = 'emp_code'
      ) THEN 'emp_code'
      ELSE 'employee_code'
    END INTO att_reg_emp_col;
  ELSE
    att_reg_emp_col := 'employee_code';
  END IF;

  EXECUTE format($fn$
CREATE OR REPLACE FUNCTION indus_one.admin_leave_working_dates(
  p_from date,
  p_to date,
  p_employee_code text DEFAULT NULL
)
RETURNS SETOF date
LANGUAGE sql
STABLE
AS $body$
  SELECT d::date
  FROM generate_series(p_from, p_to, interval '1 day') AS g(d)
  WHERE extract(dow FROM d::date) <> 0
    AND (
      p_employee_code IS NULL
      OR btrim(p_employee_code) = ''
      OR NOT EXISTS (
        SELECT 1
        FROM public.admin_attendance_register r
        WHERE lower(btrim(r.%I)) = lower(btrim(p_employee_code))
          AND r.register_date = d::date
          AND r.mark IN ('WO', 'NHPH')
      )
    );
$body$;
$fn$, att_reg_emp_col);

  IF to_regprocedure('indus_one.admin_leave_deductible_days(indus_one.admin_leave_requests)') IS NOT NULL
     AND to_regprocedure('indus_one.admin_leave_date_punch_priority(text,date)') IS NOT NULL THEN
    EXECUTE $fn$
CREATE OR REPLACE FUNCTION indus_one.admin_leave_apply_balance_deduction(p_req indus_one.admin_leave_requests)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = indus_one, public
AS $body$
DECLARE
  v_year integer;
  v_days numeric;
  v_code text;
  v_unused numeric;
BEGIN
  v_code := upper(btrim(p_req.leave_type_code));
  IF v_code NOT IN ('PL', 'SL', 'CL') THEN
    RETURN;
  END IF;

  v_year := extract(year FROM p_req.from_date)::integer;
  v_days := indus_one.admin_leave_deductible_days(p_req);

  IF v_days <= 0 THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM indus_one.employee_leave_balances_yearly y
    WHERE y.employee_code = p_req.employee_code AND y.year = v_year
  ) THEN
    RAISE EXCEPTION 'No leave balance record for employee % in year %.', p_req.employee_code, v_year
      USING ERRCODE = '23514';
  END IF;

  IF v_code = 'PL' THEN
    SELECT coalesce(unused_pl, 0) INTO v_unused
    FROM indus_one.employee_leave_balances_yearly
    WHERE employee_code = p_req.employee_code AND year = v_year;
  ELSIF v_code = 'SL' THEN
    SELECT coalesce(unused_sl, 0) INTO v_unused
    FROM indus_one.employee_leave_balances_yearly
    WHERE employee_code = p_req.employee_code AND year = v_year;
  ELSE
    SELECT coalesce(unused_cl, 0) INTO v_unused
    FROM indus_one.employee_leave_balances_yearly
    WHERE employee_code = p_req.employee_code AND year = v_year;
  END IF;

  IF v_unused < v_days THEN
    RAISE EXCEPTION 'Insufficient % balance (need %, have %).', v_code, v_days, v_unused
      USING ERRCODE = '23514';
  END IF;

  IF v_code = 'PL' THEN
    UPDATE indus_one.employee_leave_balances_yearly
    SET used_pl = used_pl + v_days, unused_pl = unused_pl - v_days, processed_at = now()
    WHERE employee_code = p_req.employee_code AND year = v_year;
  ELSIF v_code = 'SL' THEN
    UPDATE indus_one.employee_leave_balances_yearly
    SET used_sl = used_sl + v_days, unused_sl = unused_sl - v_days, processed_at = now()
    WHERE employee_code = p_req.employee_code AND year = v_year;
  ELSE
    UPDATE indus_one.employee_leave_balances_yearly
    SET used_cl = used_cl + v_days, unused_cl = unused_cl - v_days, processed_at = now()
    WHERE employee_code = p_req.employee_code AND year = v_year;
  END IF;

  INSERT INTO indus_one.admin_leave_balance_ledger (
    leave_request_id, employee_code, year, leave_type_code, delta_days, entry_type, note
  ) VALUES (
    p_req.id, p_req.employee_code, v_year, v_code, -v_days, 'deduct',
    'Approved leave — balance deducted (excludes punch-present days)'
  );
END;
$body$;
$fn$;

    EXECUTE $fn$
CREATE OR REPLACE FUNCTION indus_one.admin_leave_deductible_days(p_req indus_one.admin_leave_requests)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = indus_one, public
SET row_security = off
AS $body$
  SELECT count(*)::numeric
  FROM indus_one.admin_leave_working_dates(p_req.from_date, p_req.to_date, p_req.employee_code) AS d
  WHERE NOT indus_one.admin_leave_date_punch_priority(p_req.employee_code, d);
$body$;
$fn$;
  END IF;
END $$;
