-- Leave workflow: attendance + balance only after full approval (overall_status / status).
-- Pending / withdrawn / rejected never write register marks. Revert on terminal negative from approved.

-- ---------------------------------------------------------------------------
-- overall_status (multi-tier rollup) + withdrawn
-- ---------------------------------------------------------------------------
ALTER TABLE indus_one.admin_leave_requests
  ADD COLUMN IF NOT EXISTS overall_status text;

UPDATE indus_one.admin_leave_requests
SET overall_status = status
WHERE overall_status IS NULL;

ALTER TABLE indus_one.admin_leave_requests
  ALTER COLUMN overall_status SET DEFAULT 'pending';

ALTER TABLE indus_one.admin_leave_requests
  DROP CONSTRAINT IF EXISTS admin_leave_requests_status_check;

ALTER TABLE indus_one.admin_leave_requests
  ADD CONSTRAINT admin_leave_requests_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'withdrawn'));

ALTER TABLE indus_one.admin_leave_requests
  DROP CONSTRAINT IF EXISTS admin_leave_requests_overall_status_check;

ALTER TABLE indus_one.admin_leave_requests
  ADD CONSTRAINT admin_leave_requests_overall_status_check
  CHECK (
    overall_status IS NULL
    OR overall_status IN ('pending', 'approved', 'rejected', 'cancelled', 'withdrawn')
  );

COMMENT ON COLUMN indus_one.admin_leave_requests.overall_status IS
  'Final workflow rollup (e.g. after L1/L2). When set, drives attendance side effects with status.';

-- ---------------------------------------------------------------------------
-- Status helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION indus_one.admin_leave_effective_status(
  p_status text,
  p_overall_status text DEFAULT NULL
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(btrim(coalesce(
    nullif(btrim(p_overall_status), ''),
    nullif(btrim(p_status), '')
  )));
$$;

CREATE OR REPLACE FUNCTION indus_one.admin_leave_is_fully_approved(p_req indus_one.admin_leave_requests)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT indus_one.admin_leave_effective_status(p_req.status, p_req.overall_status) = 'approved';
$$;

CREATE OR REPLACE FUNCTION indus_one.admin_leave_is_terminal_negative(p_req indus_one.admin_leave_requests)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT indus_one.admin_leave_effective_status(p_req.status, p_req.overall_status)
    IN ('rejected', 'cancelled', 'withdrawn');
$$;

-- Resolve employee_code via master link; NULL when code does not match employee_master_id.
CREATE OR REPLACE FUNCTION indus_one.admin_leave_validate_request_employee(
  p_req indus_one.admin_leave_requests
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, indus_one
SET row_security = off
AS $$
DECLARE
  v_master_code text;
  v_reg_code text;
BEGIN
  IF p_req.employee_master_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF p_req.employee_code IS NULL OR btrim(p_req.employee_code) = '' THEN
    RETURN NULL;
  END IF;

  SELECT m.employee_code
  INTO v_master_code
  FROM public.admin_ifsp_employee_master m
  WHERE m.id = p_req.employee_master_id
  LIMIT 1;

  IF v_master_code IS NULL OR btrim(v_master_code) = '' THEN
    RETURN NULL;
  END IF;

  IF public.norm_emp_code(v_master_code) <> public.norm_emp_code(p_req.employee_code) THEN
    RETURN NULL;
  END IF;

  v_reg_code := indus_one.admin_leave_register_employee_code(v_master_code);
  IF v_reg_code IS NULL OR btrim(v_reg_code) = '' THEN
    RETURN NULL;
  END IF;

  RETURN v_reg_code;
END;
$$;

-- ---------------------------------------------------------------------------
-- Attendance apply (validated employee_code only)
-- ---------------------------------------------------------------------------
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
  IF NOT indus_one.admin_leave_is_fully_approved(p_req) THEN
    RETURN;
  END IF;

  v_reg_code := indus_one.admin_leave_validate_request_employee(p_req);
  IF v_reg_code IS NULL THEN
    RETURN;
  END IF;

  v_mark := indus_one.admin_leave_primary_attendance_mark(p_req.leave_type_code);

  FOR v_date IN
    SELECT * FROM indus_one.admin_leave_working_dates(p_req.from_date, p_req.to_date, v_reg_code)
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

-- Balance deduction only when fully approved and employee_code is valid.
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
  IF NOT indus_one.admin_leave_is_fully_approved(p_req) THEN
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
    'Approved leave — balance deducted (excludes punch-present days)'
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Status trigger: side effects only on transition to/from fully approved
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION indus_one.admin_leave_request_status_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = indus_one, public
AS $$
DECLARE
  v_old_effective text;
  v_new_effective text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF indus_one.admin_leave_effective_status(NEW.status, NEW.overall_status) = 'approved' THEN
      NEW.decided_at := coalesce(NEW.decided_at, now());
      PERFORM indus_one.admin_leave_apply_attendance(NEW);
      PERFORM indus_one.admin_leave_apply_balance_deduction(NEW);
    END IF;
    RETURN NEW;
  END IF;

  v_old_effective := indus_one.admin_leave_effective_status(OLD.status, OLD.overall_status);
  v_new_effective := indus_one.admin_leave_effective_status(NEW.status, NEW.overall_status);

  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF v_new_effective IS NOT DISTINCT FROM v_old_effective
     AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.overall_status IS NOT DISTINCT FROM OLD.overall_status
  THEN
    RETURN NEW;
  END IF;

  NEW.updated_at := now();

  IF v_new_effective = 'approved' AND v_old_effective IS DISTINCT FROM 'approved' THEN
    NEW.decided_at := coalesce(NEW.decided_at, now());
    PERFORM indus_one.admin_leave_apply_attendance(NEW);
    PERFORM indus_one.admin_leave_apply_balance_deduction(NEW);
  ELSIF v_new_effective IN ('rejected', 'cancelled', 'withdrawn')
    AND v_old_effective = 'approved'
  THEN
    NEW.decided_at := coalesce(NEW.decided_at, now());
    PERFORM indus_one.admin_leave_revert_attendance(NEW);
    PERFORM indus_one.admin_leave_restore_balance(NEW);
  ELSIF v_new_effective IN ('rejected', 'cancelled', 'withdrawn')
    AND v_old_effective = 'pending'
  THEN
    NEW.decided_at := coalesce(NEW.decided_at, now());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_leave_request_status ON indus_one.admin_leave_requests;
CREATE TRIGGER trg_admin_leave_request_status
  BEFORE INSERT OR UPDATE OF status, overall_status ON indus_one.admin_leave_requests
  FOR EACH ROW EXECUTE FUNCTION indus_one.admin_leave_request_status_changed();

-- ---------------------------------------------------------------------------
-- LMS mirror: pending on apply; map withdrawn; sync overall_status when present
-- ---------------------------------------------------------------------------
ALTER TABLE indus_one.leave_requests
  ADD COLUMN IF NOT EXISTS overall_status text;

CREATE OR REPLACE FUNCTION indus_one.mirror_lms_leave_request_to_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = indus_one, public
AS $$
DECLARE
  v_emp record;
  v_admin_status text;
  v_overall_status text;
  v_leave_type text;
  v_lms_overall text;
BEGIN
  IF TG_OP NOT IN ('INSERT', 'UPDATE') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.overall_status IS NOT DISTINCT FROM OLD.overall_status
  THEN
    RETURN NEW;
  END IF;

  v_admin_status := CASE lower(btrim(coalesce(NEW.status, '')))
    WHEN 'draft' THEN 'pending'
    WHEN 'submitted' THEN 'pending'
    WHEN 'pending_approval' THEN 'pending'
    WHEN 'pending' THEN 'pending'
    WHEN 'approved' THEN 'approved'
    WHEN 'rejected' THEN 'rejected'
    WHEN 'cancelled' THEN 'cancelled'
    WHEN 'canceled' THEN 'cancelled'
    WHEN 'withdrawn' THEN 'withdrawn'
    WHEN 'withdraw' THEN 'withdrawn'
    ELSE NULL
  END;

  IF v_admin_status IS NULL THEN
    RETURN NEW;
  END IF;

  v_lms_overall := NEW.overall_status;

  v_overall_status := CASE lower(btrim(coalesce(v_lms_overall, NEW.status, '')))
    WHEN 'draft' THEN 'pending'
    WHEN 'submitted' THEN 'pending'
    WHEN 'pending_approval' THEN 'pending'
    WHEN 'pending' THEN 'pending'
    WHEN 'approved' THEN 'approved'
    WHEN 'rejected' THEN 'rejected'
    WHEN 'cancelled' THEN 'cancelled'
    WHEN 'canceled' THEN 'cancelled'
    WHEN 'withdrawn' THEN 'withdrawn'
    WHEN 'withdraw' THEN 'withdrawn'
    ELSE v_admin_status
  END;

  SELECT m.id, m.employee_code
  INTO v_emp
  FROM public.admin_ifsp_employee_master m
  WHERE m.user_id = NEW.user_id
  ORDER BY m.updated_at DESC NULLS LAST
  LIMIT 1;

  IF v_emp.id IS NULL OR v_emp.employee_code IS NULL OR btrim(v_emp.employee_code) = '' THEN
    RETURN NEW;
  END IF;

  v_leave_type := coalesce(
    NULLIF(btrim(NEW.leave_type_code), ''),
    NULLIF(btrim(NEW.leave_type), ''),
    'L'
  );

  INSERT INTO indus_one.admin_leave_requests (
    id, employee_master_id, employee_code, user_id, leave_type_code,
    from_date, to_date, days, reason, status, overall_status,
    approver_user_id, approver_name, remarks, submitted_at, decided_at
  ) VALUES (
    NEW.id,
    v_emp.id,
    v_emp.employee_code,
    NEW.user_id,
    v_leave_type,
    NEW.from_date,
    NEW.to_date,
    coalesce(NEW.days, 1),
    coalesce(NEW.reason, ''),
    v_admin_status,
    v_overall_status,
    NEW.approver_user_id,
    NEW.approver_name,
    NEW.remarks,
    coalesce(NEW.submitted_at, NEW.created_at, now()),
    NEW.decided_at
  )
  ON CONFLICT (id) DO UPDATE SET
    leave_type_code = EXCLUDED.leave_type_code,
    employee_code = EXCLUDED.employee_code,
    employee_master_id = EXCLUDED.employee_master_id,
    from_date = EXCLUDED.from_date,
    to_date = EXCLUDED.to_date,
    days = EXCLUDED.days,
    reason = EXCLUDED.reason,
    approver_user_id = EXCLUDED.approver_user_id,
    approver_name = EXCLUDED.approver_name,
    remarks = EXCLUDED.remarks,
    decided_at = EXCLUDED.decided_at,
    status = EXCLUDED.status,
    overall_status = EXCLUDED.overall_status,
    updated_at = now()
  WHERE indus_one.admin_leave_requests.status IS DISTINCT FROM EXCLUDED.status
     OR indus_one.admin_leave_requests.overall_status IS DISTINCT FROM EXCLUDED.overall_status
     OR indus_one.admin_leave_requests.status = 'pending';

  RETURN NEW;
END;
$$;

DO $mirror$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'indus_one' AND table_name = 'leave_requests'
  ) THEN
    DROP TRIGGER IF EXISTS trg_mirror_lms_leave_to_admin ON indus_one.leave_requests;
    CREATE TRIGGER trg_mirror_lms_leave_to_admin
      AFTER INSERT OR UPDATE OF status, overall_status ON indus_one.leave_requests
      FOR EACH ROW EXECUTE FUNCTION indus_one.mirror_lms_leave_request_to_admin();
  END IF;
END $mirror$;

-- Revert attendance marks that belong to non-approved requests (legacy data cleanup).
DO $cleanup$
DECLARE
  v_req indus_one.admin_leave_requests%ROWTYPE;
BEGIN
  FOR v_req IN
    SELECT *
    FROM indus_one.admin_leave_requests r
    WHERE NOT indus_one.admin_leave_is_fully_approved(r)
      AND EXISTS (
        SELECT 1
        FROM indus_one.admin_leave_attendance_marks m
        WHERE m.leave_request_id = r.id AND m.reverted = false
      )
  LOOP
    PERFORM indus_one.admin_leave_revert_attendance(v_req);
  END LOOP;
END $cleanup$;

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
    FROM indus_one.admin_leave_requests r
    WHERE indus_one.admin_leave_is_fully_approved(r)
      AND r.from_date <= p_to
      AND r.to_date >= p_from
    ORDER BY r.decided_at NULLS LAST, r.updated_at
  LOOP
    PERFORM indus_one.admin_leave_apply_attendance(v_req);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

NOTIFY pgrst, 'reload schema';
