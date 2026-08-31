-- P/PL, P/CL, P/SL must count as 1 full leave day everywhere (balance deduction, register recount).
--
-- Root cause: half-day composite marks were introduced as "0.5 present + 0.5 leave" (Option A).
-- Client leave-balance sync, annual-limit checks, and register summaries treated P/* as 0.5 while
-- full PL/SL/CL counted as 1. Approved-leave sync also deducted 0.5 via admin_leave_deductible_days
-- when half-day leave was approved on a punch-present day (register mark P/PL|P/CL|P/SL).
-- Employees with punch + half-day leave therefore showed 0.5; full-day leave without punch showed 1.

CREATE OR REPLACE FUNCTION indus_one.admin_leave_deductible_days(p_req indus_one.admin_leave_requests)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = indus_one, public
SET row_security = off
AS $$
  SELECT CASE
    WHEN indus_one.admin_leave_is_half_day_request(p_req) THEN (
      SELECT coalesce(sum(
        CASE
          WHEN indus_one.admin_leave_date_punch_priority(p_req.employee_code, d)
            AND indus_one.admin_leave_composite_half_day_mark(
                   indus_one.admin_leave_primary_attendance_mark(p_req.leave_type_code)
                 ) IS NOT NULL
          THEN 1::numeric
          WHEN NOT indus_one.admin_leave_date_punch_priority(p_req.employee_code, d)
          THEN 0.5::numeric
          ELSE 0::numeric
        END
      ), 0)
      FROM indus_one.admin_leave_working_dates(p_req.from_date, p_req.to_date, p_req.employee_code) AS d
    )
    ELSE (
      SELECT count(*)::numeric
      FROM indus_one.admin_leave_working_dates(p_req.from_date, p_req.to_date, p_req.employee_code) AS d
      WHERE NOT indus_one.admin_leave_date_punch_priority(p_req.employee_code, d)
    )
  END;
$$;

CREATE OR REPLACE FUNCTION indus_one.admin_leave_apply_balance_deduction(p_req indus_one.admin_leave_requests)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = indus_one, public
AS $$
DECLARE
  v_year integer;
  v_days numeric;
  v_code text;
  v_unused numeric;
  v_reg_code text;
BEGIN
  IF NOT indus_one.admin_leave_request_is_approved(p_req.status, p_req.overall_status) THEN
    RETURN;
  END IF;

  v_reg_code := indus_one.admin_leave_validate_request_employee(p_req);
  IF v_reg_code IS NULL THEN
    RETURN;
  END IF;

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
    WHERE public.norm_emp_code(y.employee_code) = public.norm_emp_code(v_reg_code)
      AND y.year = v_year
  ) THEN
    RETURN;
  END IF;

  IF v_code = 'PL' THEN
    SELECT coalesce(unused_pl, 0) INTO v_unused
    FROM indus_one.employee_leave_balances_yearly
    WHERE public.norm_emp_code(employee_code) = public.norm_emp_code(v_reg_code) AND year = v_year;
  ELSIF v_code = 'SL' THEN
    SELECT coalesce(unused_sl, 0) INTO v_unused
    FROM indus_one.employee_leave_balances_yearly
    WHERE public.norm_emp_code(employee_code) = public.norm_emp_code(v_reg_code) AND year = v_year;
  ELSE
    SELECT coalesce(unused_cl, 0) INTO v_unused
    FROM indus_one.employee_leave_balances_yearly
    WHERE public.norm_emp_code(employee_code) = public.norm_emp_code(v_reg_code) AND year = v_year;
  END IF;

  IF v_unused < v_days THEN
    RETURN;
  END IF;

  IF v_code = 'PL' THEN
    UPDATE indus_one.employee_leave_balances_yearly
    SET used_pl = used_pl + v_days, unused_pl = unused_pl - v_days, processed_at = now()
    WHERE public.norm_emp_code(employee_code) = public.norm_emp_code(v_reg_code) AND year = v_year;
  ELSIF v_code = 'SL' THEN
    UPDATE indus_one.employee_leave_balances_yearly
    SET used_sl = used_sl + v_days, unused_sl = unused_sl - v_days, processed_at = now()
    WHERE public.norm_emp_code(employee_code) = public.norm_emp_code(v_reg_code) AND year = v_year;
  ELSE
    UPDATE indus_one.employee_leave_balances_yearly
    SET used_cl = used_cl + v_days, unused_cl = unused_cl - v_days, processed_at = now()
    WHERE public.norm_emp_code(employee_code) = public.norm_emp_code(v_reg_code) AND year = v_year;
  END IF;

  INSERT INTO indus_one.admin_leave_balance_ledger (
    leave_request_id, employee_code, year, leave_type_code, delta_days, entry_type, note
  ) VALUES (
    p_req.id, v_reg_code, v_year, v_code, -v_days, 'deduct',
    CASE
      WHEN indus_one.admin_leave_is_half_day_request(p_req)
        AND v_days >= 1
        AND indus_one.admin_leave_composite_half_day_mark(
              indus_one.admin_leave_primary_attendance_mark(p_req.leave_type_code)
            ) IS NOT NULL THEN
        'Approved half-day leave — 1 balance day deducted (P/PL, P/CL, or P/SL composite mark)'
      WHEN indus_one.admin_leave_is_half_day_request(p_req) THEN
        'Approved half-day leave — balance deducted'
      ELSE
        'Approved leave — balance deducted (includes sandwich week-off days; excludes full-day punch-present days)'
    END
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
