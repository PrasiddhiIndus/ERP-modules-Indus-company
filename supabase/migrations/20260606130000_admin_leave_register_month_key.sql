-- LMS leave workflow may insert admin_attendance_register rows without month_key.
-- Ensure leave approval always sets month_key; backfill on any insert with a null month_key.

CREATE OR REPLACE FUNCTION public.admin_attendance_register_fill_month_key()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.register_date IS NOT NULL
    AND (NEW.month_key IS NULL OR btrim(NEW.month_key) = '')
  THEN
    NEW.month_key := to_char(NEW.register_date, 'YYYY-MM');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_attendance_register_fill_month_key ON public.admin_attendance_register;
CREATE TRIGGER trg_admin_attendance_register_fill_month_key
  BEFORE INSERT ON public.admin_attendance_register
  FOR EACH ROW
  EXECUTE FUNCTION public.admin_attendance_register_fill_month_key();

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
BEGIN
  v_mark := indus_one.admin_leave_primary_attendance_mark(p_req.leave_type_code);

  FOR v_date IN
    SELECT * FROM indus_one.admin_leave_working_dates(p_req.from_date, p_req.to_date)
  LOOP
    v_month_key := to_char(v_date, 'YYYY-MM');

    SELECT r.mark, r.mark_source, r.leave_request_id
    INTO v_prev_mark, v_prev_source, v_prev_leave_id
    FROM public.admin_attendance_register r
    WHERE r.employee_code = p_req.emp_code
      AND r.register_date = v_date
    LIMIT 1;

    v_row_exists := FOUND;
    v_can_apply := true;

    IF v_row_exists THEN
      IF indus_one.admin_leave_mark_is_manual(v_prev_mark, v_prev_source) THEN
        v_can_apply := false;
      ELSIF NOT indus_one.admin_leave_mark_is_punch(v_prev_mark, v_prev_source)
        AND v_prev_leave_id IS DISTINCT FROM p_req.id
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
      p_req.id, p_req.emp_code, v_date, v_mark,
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
      WHERE employee_code = p_req.emp_code
        AND register_date = v_date;
    ELSE
      INSERT INTO public.admin_attendance_register (
        employee_code, register_date, month_key, mark, mark_source, leave_request_id, updated_at
      ) VALUES (
        p_req.emp_code, v_date, v_month_key, v_mark, 'leave', p_req.id, now()
      );
    END IF;
  END LOOP;
END;
$$;
