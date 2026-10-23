-- If 20261023160000 was applied in an earlier form that DROP'd
-- admin_leave_apply_attendance and recreated it as RETURNS void, restore the
-- Indus One jsonb wrapper used by leave approval triggers.

DROP FUNCTION IF EXISTS indus_one.admin_leave_apply_attendance(indus_one.admin_leave_requests);

CREATE FUNCTION indus_one.admin_leave_apply_attendance(
  p_req indus_one.admin_leave_requests
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = indus_one, public
SET row_security = off
AS $$
DECLARE
  v_reg_code text;
  v_emp_code text;
  v_code text;
  v_year integer;
  v_available numeric;
  v_has_balance boolean;
  v_result jsonb;
BEGIN
  v_emp_code := coalesce(
    nullif(btrim(p_req.employee_code), ''),
    indus_one.admin_leave_request_employee_code(p_req.id)
  );

  v_reg_code := coalesce(
    indus_one.admin_leave_register_employee_code(v_emp_code),
    nullif(btrim(v_emp_code), '')
  );

  v_code := upper(btrim(coalesce(p_req.leave_type_code, '')));
  v_year := extract(year FROM p_req.from_date)::integer;

  IF v_code NOT IN ('PL', 'SL', 'CL') OR v_reg_code IS NULL THEN
    v_result := indus_one.admin_leave_apply_attendance_sufficient(p_req);
    IF pg_trigger_depth() = 0 THEN
      UPDATE indus_one.admin_leave_requests
      SET
        paid_leave_days = (v_result ->> 'paid_leave_days')::numeric,
        lwp_days = (v_result ->> 'lwp_days')::numeric,
        applied_day_marks = coalesce(v_result -> 'applied_day_marks', '[]'::jsonb),
        updated_at = now()
      WHERE id = p_req.id;
    END IF;
    RETURN v_result;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM indus_one.employee_leave_balances_yearly y
    WHERE indus_one.leave_attendance_norm_code(y.employee_code)
            = indus_one.leave_attendance_norm_code(v_reg_code)
      AND y.year = v_year
  ) INTO v_has_balance;

  IF NOT v_has_balance THEN
    v_result := indus_one.admin_leave_apply_attendance_sufficient(p_req);
    IF pg_trigger_depth() = 0 THEN
      UPDATE indus_one.admin_leave_requests
      SET
        paid_leave_days = (v_result ->> 'paid_leave_days')::numeric,
        lwp_days = (v_result ->> 'lwp_days')::numeric,
        applied_day_marks = coalesce(v_result -> 'applied_day_marks', '[]'::jsonb),
        updated_at = now()
      WHERE id = p_req.id;
    END IF;
    RETURN v_result;
  END IF;

  v_available := indus_one.admin_leave_yearly_unused_balance(v_reg_code, v_year, v_code);

  IF NOT indus_one.admin_leave_needs_partial_lwp(p_req, v_available) THEN
    v_result := indus_one.admin_leave_apply_attendance_sufficient(p_req);
  ELSE
    v_result := indus_one.admin_leave_apply_attendance_partial(p_req, v_available);
  END IF;

  IF pg_trigger_depth() = 0 THEN
    UPDATE indus_one.admin_leave_requests
    SET
      paid_leave_days = (v_result ->> 'paid_leave_days')::numeric,
      lwp_days = (v_result ->> 'lwp_days')::numeric,
      applied_day_marks = coalesce(v_result -> 'applied_day_marks', '[]'::jsonb),
      updated_at = now()
    WHERE id = p_req.id;
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION indus_one.admin_leave_apply_attendance(indus_one.admin_leave_requests) TO authenticated;

NOTIFY pgrst, 'reload schema';
