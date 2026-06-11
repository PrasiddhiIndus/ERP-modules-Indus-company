-- Leave workflow: punch (P) beats leave marks; balance deducts only non-punch days;
-- LMS leave_requests approval mirrors to admin_leave_requests (L1/L2 / Indus One).

-- ---------------------------------------------------------------------------
-- Punch detection (raw machine data + register)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION indus_one.admin_leave_date_has_punch(
  p_employee_code text,
  p_date date
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.erp_attendance_punches p
    WHERE public.normalize_attendance_employee_code(p.employee_code)
        = public.normalize_attendance_employee_code(p_employee_code)
      AND p.punch_date = p_date
  );
$$;

CREATE OR REPLACE FUNCTION indus_one.admin_leave_register_has_punch(
  p_employee_code text,
  p_date date
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_attendance_register r
    WHERE r.employee_code = p_employee_code
      AND r.register_date = p_date
      AND indus_one.admin_leave_mark_is_punch(r.mark, r.mark_source)
  );
$$;

CREATE OR REPLACE FUNCTION indus_one.admin_leave_date_punch_priority(
  p_employee_code text,
  p_date date
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    indus_one.admin_leave_date_has_punch(p_employee_code, p_date)
    OR indus_one.admin_leave_register_has_punch(p_employee_code, p_date);
$$;

-- Working leave days that count for balance / register (exclude punch-present days).
CREATE OR REPLACE FUNCTION indus_one.admin_leave_deductible_days(p_req indus_one.admin_leave_requests)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = indus_one, public
SET row_security = off
AS $$
  SELECT count(*)::numeric
  FROM indus_one.admin_leave_working_dates(p_req.from_date, p_req.to_date) AS d
  WHERE NOT indus_one.admin_leave_date_punch_priority(p_req.employee_code, d);
$$;

-- ---------------------------------------------------------------------------
-- Balance deduction (only days without machine punch)
-- ---------------------------------------------------------------------------
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
    RETURN;
  END IF;

  IF v_code = 'PL' THEN
    UPDATE indus_one.employee_leave_balances_yearly
    SET
      used_pl = used_pl + v_days,
      unused_pl = greatest(coalesce(unused_pl, 0) - v_days, 0),
      processed_at = now()
    WHERE employee_code = p_req.employee_code AND year = v_year;
  ELSIF v_code = 'SL' THEN
    UPDATE indus_one.employee_leave_balances_yearly
    SET
      used_sl = used_sl + v_days,
      unused_sl = greatest(coalesce(unused_sl, 0) - v_days, 0),
      processed_at = now()
    WHERE employee_code = p_req.employee_code AND year = v_year;
  ELSIF v_code = 'CL' THEN
    UPDATE indus_one.employee_leave_balances_yearly
    SET
      used_cl = used_cl + v_days,
      unused_cl = greatest(coalesce(unused_cl, 0) - v_days, 0),
      processed_at = now()
    WHERE employee_code = p_req.employee_code AND year = v_year;
  END IF;

  INSERT INTO indus_one.admin_leave_balance_ledger (
    leave_request_id, employee_code, year, leave_type_code, delta_days, entry_type, note
  ) VALUES (
    p_req.id, p_req.employee_code, v_year, v_code, -v_days, 'deduct',
    'Approved leave — balance deducted (excludes punch-present days)'
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Attendance register marks (skip days with punch priority)
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
BEGIN
  v_mark := indus_one.admin_leave_primary_attendance_mark(p_req.leave_type_code);

  FOR v_date IN
    SELECT * FROM indus_one.admin_leave_working_dates(p_req.from_date, p_req.to_date)
  LOOP
    -- Machine / punch Present always wins over leave marks.
    IF indus_one.admin_leave_date_punch_priority(p_req.employee_code, v_date) THEN
      CONTINUE;
    END IF;

    v_month_key := to_char(v_date, 'YYYY-MM');

    SELECT r.mark, r.mark_source, r.leave_request_id
    INTO v_prev_mark, v_prev_source, v_prev_leave_id
    FROM public.admin_attendance_register r
    WHERE r.employee_code = p_req.employee_code
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
      p_req.id, p_req.employee_code, v_date, v_mark,
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
      WHERE employee_code = p_req.employee_code
        AND register_date = v_date;
    ELSE
      INSERT INTO public.admin_attendance_register (
        employee_code, register_date, month_key, mark, mark_source, leave_request_id, updated_at
      ) VALUES (
        p_req.employee_code, v_date, v_month_key, v_mark, 'leave', p_req.id, now()
      );
    END IF;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- L1/L2 approval metadata on admin mirror
-- ---------------------------------------------------------------------------
ALTER TABLE indus_one.admin_leave_requests
  ADD COLUMN IF NOT EXISTS approver_employee_code text,
  ADD COLUMN IF NOT EXISTS approved_by_tier text;

COMMENT ON COLUMN indus_one.admin_leave_requests.approver_employee_code IS
  'Employee code of approver (L1, L2, or admin).';
COMMENT ON COLUMN indus_one.admin_leave_requests.approved_by_tier IS
  'l1 | l2 | admin — which approval path finalized the request.';

-- ---------------------------------------------------------------------------
-- Mirror LMS leave_requests → admin_leave_requests (Indus One L1/L2 approvals)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION indus_one.mirror_lms_leave_request_to_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = indus_one, public
AS $$
DECLARE
  v_emp record;
  v_admin_status text;
  v_leave_type text;
BEGIN
  IF TG_OP NOT IN ('INSERT', 'UPDATE') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
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
    ELSE NULL
  END;

  IF v_admin_status IS NULL THEN
    RETURN NEW;
  END IF;

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
    from_date, to_date, days, reason, status,
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
    updated_at = now()
  WHERE indus_one.admin_leave_requests.status IS DISTINCT FROM EXCLUDED.status
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
      AFTER INSERT OR UPDATE OF status ON indus_one.leave_requests
      FOR EACH ROW EXECUTE FUNCTION indus_one.mirror_lms_leave_request_to_admin();
  END IF;
END $mirror$;

-- Fire attendance + balance on INSERT-as-approved (LMS mirror) as well as pending→approved UPDATE.
CREATE OR REPLACE FUNCTION indus_one.admin_leave_request_status_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = indus_one, public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'approved' THEN
      NEW.decided_at := coalesce(NEW.decided_at, now());
      PERFORM indus_one.admin_leave_apply_attendance(NEW);
      PERFORM indus_one.admin_leave_apply_balance_deduction(NEW);
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP <> 'UPDATE' OR NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  NEW.updated_at := now();

  IF NEW.status = 'approved' AND OLD.status = 'pending' THEN
    NEW.decided_at := coalesce(NEW.decided_at, now());
    PERFORM indus_one.admin_leave_apply_attendance(NEW);
    PERFORM indus_one.admin_leave_apply_balance_deduction(NEW);
  ELSIF NEW.status IN ('rejected', 'cancelled') AND OLD.status = 'approved' THEN
    NEW.decided_at := coalesce(NEW.decided_at, now());
    PERFORM indus_one.admin_leave_revert_attendance(NEW);
    PERFORM indus_one.admin_leave_restore_balance(NEW);
  ELSIF NEW.status = 'cancelled' AND OLD.status = 'pending' THEN
    NEW.decided_at := coalesce(NEW.decided_at, now());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_leave_request_status ON indus_one.admin_leave_requests;
CREATE TRIGGER trg_admin_leave_request_status
  BEFORE INSERT OR UPDATE OF status ON indus_one.admin_leave_requests
  FOR EACH ROW EXECUTE FUNCTION indus_one.admin_leave_request_status_changed();

-- On cancel/reject: if punch exists, keep Present instead of restoring leave mark.
CREATE OR REPLACE FUNCTION indus_one.admin_leave_revert_attendance(p_req indus_one.admin_leave_requests)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = indus_one, public
AS $$
DECLARE
  v_row record;
  v_cur record;
BEGIN
  FOR v_row IN
    SELECT *
    FROM indus_one.admin_leave_attendance_marks
    WHERE leave_request_id = p_req.id AND reverted = false
  LOOP
    IF indus_one.admin_leave_date_punch_priority(v_row.employee_code, v_row.register_date) THEN
      UPDATE public.admin_attendance_register
      SET mark = 'P', mark_source = 'punch', leave_request_id = NULL, updated_at = now()
      WHERE employee_code = v_row.employee_code AND register_date = v_row.register_date;
      UPDATE indus_one.admin_leave_attendance_marks SET reverted = true WHERE id = v_row.id;
      CONTINUE;
    END IF;

    SELECT r.mark, r.mark_source, r.leave_request_id
    INTO v_cur
    FROM public.admin_attendance_register r
    WHERE r.employee_code = v_row.employee_code
      AND r.register_date = v_row.register_date
    LIMIT 1;

    IF NOT FOUND THEN
      UPDATE indus_one.admin_leave_attendance_marks SET reverted = true WHERE id = v_row.id;
      CONTINUE;
    END IF;

    IF indus_one.admin_leave_mark_is_manual(v_cur.mark, v_cur.mark_source) THEN
      UPDATE indus_one.admin_leave_attendance_marks SET reverted = true WHERE id = v_row.id;
      CONTINUE;
    END IF;

    IF v_cur.leave_request_id IS DISTINCT FROM p_req.id THEN
      UPDATE indus_one.admin_leave_attendance_marks SET reverted = true WHERE id = v_row.id;
      CONTINUE;
    END IF;

    IF v_row.previous_mark IS NULL THEN
      DELETE FROM public.admin_attendance_register
      WHERE employee_code = v_row.employee_code AND register_date = v_row.register_date;
    ELSE
      UPDATE public.admin_attendance_register
      SET
        mark = v_row.previous_mark,
        mark_source = v_row.previous_mark_source,
        leave_request_id = NULL
      WHERE employee_code = v_row.employee_code AND register_date = v_row.register_date;
    END IF;

    UPDATE indus_one.admin_leave_attendance_marks SET reverted = true WHERE id = v_row.id;
  END LOOP;
END;
$$;
