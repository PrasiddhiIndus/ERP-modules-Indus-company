-- Fix leave → daily attendance register sync (normalized employee_code + backfill).

CREATE OR REPLACE FUNCTION indus_one.admin_leave_register_employee_code(p_code text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT coalesce(
    (
      SELECT m.employee_code
      FROM public.admin_ifsp_employee_master m
      WHERE public.norm_emp_code(m.employee_code) = public.norm_emp_code(p_code)
         OR public.norm_emp_code(m.employee_id::text) = public.norm_emp_code(p_code)
      ORDER BY m.updated_at DESC NULLS LAST
      LIMIT 1
    ),
    public.normalize_attendance_employee_code(p_code)
  );
$$;

CREATE OR REPLACE FUNCTION indus_one.admin_leave_apply_attendance(p_req indus_one.admin_leave_requests)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = indus_one, public
AS $$
DECLARE
  v_mark text;
  v_date date;
  v_month_key text;
  v_prev_mark text;
  v_prev_source text;
  v_prev_leave_id uuid;
  v_row_exists boolean;
  v_can_apply boolean;
  v_reg_code text;
BEGIN
  v_mark := indus_one.admin_leave_primary_attendance_mark(p_req.leave_type_code);
  v_reg_code := indus_one.admin_leave_register_employee_code(p_req.employee_code);

  IF v_reg_code IS NULL OR btrim(v_reg_code) = '' THEN
    RETURN;
  END IF;

  FOR v_date IN
    SELECT * FROM indus_one.admin_leave_working_dates(p_req.from_date, p_req.to_date)
  LOOP
    IF indus_one.admin_leave_date_punch_priority(v_reg_code, v_date) THEN
      CONTINUE;
    END IF;

    v_month_key := to_char(v_date, 'YYYY-MM');

    SELECT r.mark, r.mark_source, r.leave_request_id
    INTO v_prev_mark, v_prev_source, v_prev_leave_id
    FROM public.admin_attendance_register r
    WHERE public.norm_emp_code(r.employee_code) = public.norm_emp_code(v_reg_code)
      AND r.register_date = v_date
    LIMIT 1;

    v_row_exists := FOUND;
    v_can_apply := true;

    IF v_row_exists THEN
      IF indus_one.admin_leave_mark_is_manual(v_prev_mark, v_prev_source) THEN
        v_can_apply := false;
      ELSIF NOT indus_one.admin_leave_mark_is_punch(v_prev_mark, v_prev_source)
        AND v_prev_leave_id IS DISTINCT FROM p_req.id
        AND coalesce(lower(btrim(v_prev_source)), '') = 'leave'
      THEN
        v_can_apply := false;
      END IF;
    END IF;

    IF NOT v_can_apply THEN
      CONTINUE;
    END IF;

    INSERT INTO indus_one.admin_leave_attendance_marks (
      leave_request_id, employee_code, register_date, applied_mark,
      previous_mark, previous_mark_source
    ) VALUES (
      p_req.id, v_reg_code, v_date, v_mark,
      CASE WHEN v_row_exists THEN v_prev_mark ELSE NULL END,
      CASE WHEN v_row_exists THEN v_prev_source ELSE NULL END
    )
    ON CONFLICT (leave_request_id, register_date) DO NOTHING;

    IF v_row_exists THEN
      UPDATE public.admin_attendance_register
      SET
        mark = v_mark,
        mark_source = 'leave',
        leave_request_id = p_req.id,
        month_key = coalesce(nullif(btrim(month_key), ''), v_month_key),
        updated_at = now()
      WHERE public.norm_emp_code(employee_code) = public.norm_emp_code(v_reg_code)
        AND register_date = v_date;
    ELSE
      INSERT INTO public.admin_attendance_register (
        employee_code, register_date, month_key, mark, mark_source, leave_request_id, updated_at
      ) VALUES (
        v_reg_code, v_date, v_month_key, v_mark, 'leave', p_req.id, now()
      );
    END IF;
  END LOOP;
END;
$$;

-- Re-apply approved leave marks for a date window (idempotent).
CREATE OR REPLACE FUNCTION indus_one.sync_approved_leaves_to_register(
  p_from date,
  p_to date
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = indus_one, public
AS $$
DECLARE
  v_req indus_one.admin_leave_requests%ROWTYPE;
  v_count integer := 0;
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN
    RETURN 0;
  END IF;

  FOR v_req IN
    SELECT *
    FROM indus_one.admin_leave_requests
    WHERE status = 'approved'
      AND from_date <= p_to
      AND to_date >= p_from
    ORDER BY decided_at NULLS LAST, updated_at
  LOOP
    PERFORM indus_one.admin_leave_apply_attendance(v_req);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION indus_one.sync_approved_leaves_to_register(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION indus_one.sync_approved_leaves_to_register(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION indus_one.sync_approved_leaves_to_register(date, date) TO service_role;

NOTIFY pgrst, 'reload schema';
