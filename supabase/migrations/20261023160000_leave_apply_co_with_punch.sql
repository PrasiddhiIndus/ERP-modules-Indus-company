-- Approved C/O with a biometric punch: still write CO (leave-sourced) so the
-- Daily Attendance Register / My Attendance can show CO+P.
--
-- Patch the Indus One jsonb path (`admin_leave_apply_attendance_sufficient`).
-- Do NOT replace `admin_leave_apply_attendance` with RETURNS void — live DB
-- returns jsonb and leave approval assigns the result.

CREATE OR REPLACE FUNCTION indus_one.admin_leave_apply_attendance_sufficient(
  p_req indus_one.admin_leave_requests
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = indus_one, public
SET row_security = off
AS $$
DECLARE
  v_mark text;
  v_date date;
  v_reg_code text;
  v_emp_code text;
  v_is_half_day boolean;
  v_marks jsonb := '[]'::jsonb;
  v_paid numeric := coalesce(p_req.days, 0);
  v_type text;
BEGIN
  v_emp_code := coalesce(
    nullif(btrim(p_req.employee_code), ''),
    indus_one.admin_leave_request_employee_code(p_req.id)
  );

  IF v_emp_code IS NULL AND p_req.employee_master_id IS NOT NULL THEN
    SELECT coalesce(
      nullif(btrim(m.employee_code::text), ''),
      nullif(btrim(m.employee_id::text), '')
    )
    INTO v_emp_code
    FROM public.admin_ifsp_employee_master m
    WHERE m.id = p_req.employee_master_id;
  END IF;

  v_reg_code := coalesce(
    indus_one.admin_leave_register_employee_code(v_emp_code),
    nullif(btrim(v_emp_code), '')
  );

  IF v_reg_code IS NULL OR btrim(v_reg_code) = '' THEN
    RETURN jsonb_build_object(
      'paid_leave_days', 0,
      'lwp_days', 0,
      'applied_day_marks', '[]'::jsonb
    );
  END IF;

  v_is_half_day := indus_one.admin_leave_is_half_day(p_req.days);
  v_type := upper(btrim(indus_one.admin_leave_primary_attendance_mark(p_req.leave_type_code)));
  v_mark := v_type;
  IF v_is_half_day THEN
    v_mark := 'P/' || v_type;
  END IF;

  FOR v_date IN
    SELECT * FROM indus_one.admin_leave_working_dates(p_req.from_date, p_req.to_date, v_reg_code)
  LOOP
    IF NOT v_is_half_day AND indus_one.admin_leave_date_punch_priority(v_reg_code, v_date) THEN
      -- Keep approved comp-off on punch days; UI combines as CO+P.
      IF v_type <> 'CO' THEN
        CONTINUE;
      END IF;
      v_mark := 'CO';
    END IF;

    PERFORM indus_one.admin_leave_write_register_mark(p_req, v_reg_code, v_date, v_mark);

    v_marks := v_marks || jsonb_build_array(jsonb_build_object(
      'date', v_date::text,
      'mark', v_mark,
      'paid_amount', CASE WHEN v_is_half_day THEN coalesce(p_req.days, 0.5) ELSE 1 END
    ));
  END LOOP;

  IF upper(btrim(coalesce(p_req.leave_type_code, ''))) NOT IN ('PL', 'SL', 'CL') THEN
    v_paid := 0;
  END IF;

  RETURN jsonb_build_object(
    'paid_leave_days', v_paid,
    'lwp_days', 0,
    'applied_day_marks', v_marks
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
