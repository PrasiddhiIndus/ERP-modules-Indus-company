-- =============================================================================
-- Unified leave workflow (LMS Indus One + ERP) — indus_one.admin_leave_*
-- Version control copy for shared Supabase project. Side effects are DB triggers only;
-- ERP/LMS apps UPDATE admin_leave_requests.status — never write attendance/balance in app code.
-- Prerequisites (from LMS): indus_one schema, hr_leave_types, notifications, current_user_is_manager
-- =============================================================================

-- Optional columns on ERP attendance register
ALTER TABLE public.admin_attendance_register
  ADD COLUMN IF NOT EXISTS mark_source text,
  ADD COLUMN IF NOT EXISTS leave_request_id uuid;

-- indus_one.updated_at helper (if LMS has not already created it)
CREATE OR REPLACE FUNCTION indus_one.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS indus_one.admin_leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_master_id bigint NOT NULL REFERENCES public.admin_ifsp_employee_master(id) ON DELETE CASCADE,
  emp_code text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  leave_type_code text NOT NULL,
  from_date date NOT NULL,
  to_date date NOT NULL,
  days numeric(8,2) NOT NULL DEFAULT 1,
  reason text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  approver_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approver_name text,
  remarks text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_leave_requests_dates CHECK (to_date >= from_date)
);

CREATE INDEX IF NOT EXISTS idx_admin_leave_requests_emp
  ON indus_one.admin_leave_requests (employee_master_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_leave_requests_status
  ON indus_one.admin_leave_requests (status);
CREATE INDEX IF NOT EXISTS idx_admin_leave_requests_user
  ON indus_one.admin_leave_requests (user_id, submitted_at DESC);

CREATE TABLE IF NOT EXISTS indus_one.admin_leave_balance_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_request_id uuid NOT NULL REFERENCES indus_one.admin_leave_requests(id) ON DELETE CASCADE,
  emp_code text NOT NULL,
  year integer NOT NULL,
  leave_type_code text NOT NULL,
  delta_days numeric(8,2) NOT NULL,
  entry_type text NOT NULL CHECK (entry_type IN ('deduct', 'restore')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_leave_balance_ledger_request
  ON indus_one.admin_leave_balance_ledger (leave_request_id);

CREATE TABLE IF NOT EXISTS indus_one.admin_leave_attendance_marks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_request_id uuid NOT NULL REFERENCES indus_one.admin_leave_requests(id) ON DELETE CASCADE,
  employee_code text NOT NULL,
  register_date date NOT NULL,
  applied_mark text NOT NULL,
  previous_mark text,
  previous_mark_source text,
  reverted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (leave_request_id, register_date)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'admin_attendance_register_leave_request_id_fkey'
  ) THEN
    ALTER TABLE public.admin_attendance_register
      ADD CONSTRAINT admin_attendance_register_leave_request_id_fkey
      FOREIGN KEY (leave_request_id)
      REFERENCES indus_one.admin_leave_requests(id)
      ON DELETE SET NULL;
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN others THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION indus_one.admin_leave_mark_is_manual(
  p_mark text,
  p_mark_source text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    coalesce(lower(btrim(p_mark_source)), '') IN (
      'manual', 'hr', 'admin', 'erp_manual', 'erp', 'm'
    )
    OR (
      p_mark_source IS NULL
      AND coalesce(btrim(p_mark), '') <> ''
      AND upper(btrim(p_mark)) NOT IN ('P', 'P(OD)')
    );
$$;

CREATE OR REPLACE FUNCTION indus_one.admin_leave_mark_is_punch(
  p_mark text,
  p_mark_source text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    coalesce(lower(btrim(p_mark_source)), '') IN (
      'punch', 'biometric', 'device', 'auto', 'machine'
    )
    OR (
      p_mark_source IS NULL
      AND upper(btrim(coalesce(p_mark, ''))) IN ('P', 'P(OD)')
    );
$$;

CREATE OR REPLACE FUNCTION indus_one.admin_leave_normalize_register_mark(p_mark text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_mark IS NULL OR btrim(p_mark) = '' THEN 'L'
    WHEN upper(btrim(p_mark)) IN ('NHPH', 'NH/PH') THEN 'NH/PH'
    WHEN upper(btrim(p_mark)) IN ('C/O', 'COMP OFF', 'COMPENSATORY OFF') THEN 'CO'
    WHEN upper(btrim(p_mark)) = 'P (OD)' THEN 'P(OD)'
    WHEN upper(btrim(p_mark)) IN (
      'P', 'P(OD)', 'T', 'L', 'WO', 'HD', 'WFH',
      'PL', 'CL', 'SL', 'SPLA', 'SPLB', 'SPLM', 'SBEL', 'CO', 'PTL', 'ML'
    ) THEN
      CASE upper(btrim(p_mark))
        WHEN 'P(OD)' THEN 'P(OD)'
        ELSE upper(btrim(p_mark))
      END
    WHEN upper(btrim(p_mark)) IN ('A', 'ABSENT', 'LEAVE') THEN 'L'
    WHEN upper(btrim(p_mark)) IN ('WEEK OFF', 'WEEKOFF') THEN 'WO'
    WHEN upper(btrim(p_mark)) IN ('HALF DAY', 'HALFDAY') THEN 'HD'
    WHEN upper(btrim(p_mark)) IN ('WORK FROM HOME', 'WFH') THEN 'WFH'
    ELSE 'L'
  END;
$$;

CREATE OR REPLACE FUNCTION indus_one.admin_leave_primary_attendance_mark(p_leave_type_code text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, indus_one
AS $$
  WITH resolved AS (
    SELECT lt.code, lt.label, (lt.attendance_marks)[1] AS attendance_mark
    FROM public.hr_leave_types lt
    WHERE upper(btrim(lt.code)) = upper(btrim(p_leave_type_code))
       OR upper(btrim(lt.label)) = upper(btrim(p_leave_type_code))
    ORDER BY CASE WHEN upper(btrim(lt.code)) = upper(btrim(p_leave_type_code)) THEN 0 ELSE 1 END
    LIMIT 1
  )
  SELECT indus_one.admin_leave_normalize_register_mark(
    coalesce(
      (SELECT r.code FROM resolved r),
      (
        SELECT indus_one.admin_leave_normalize_register_mark(r.attendance_mark)
        FROM resolved r
        WHERE upper(btrim(coalesce(r.attendance_mark, ''))) NOT IN ('L', 'LEAVE', 'A', '')
      ),
      indus_one.admin_leave_normalize_register_mark(p_leave_type_code)
    )
  );
$$;

CREATE OR REPLACE FUNCTION indus_one.admin_leave_working_dates(
  p_from date,
  p_to date
)
RETURNS SETOF date
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT d::date
  FROM generate_series(p_from, p_to, interval '1 day') AS g(d);
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
BEGIN
  v_code := upper(btrim(p_req.leave_type_code));
  IF v_code NOT IN ('PL', 'SL', 'CL') THEN
    RETURN;
  END IF;

  v_year := extract(year FROM p_req.from_date)::integer;
  v_days := p_req.days;

  IF NOT EXISTS (
    SELECT 1 FROM indus_one.employee_leave_balances_yearly y
    WHERE y.emp_code = p_req.emp_code AND y.year = v_year
  ) THEN
    RETURN;
  END IF;

  IF v_code = 'PL' THEN
    UPDATE indus_one.employee_leave_balances_yearly
    SET
      used_pl = used_pl + v_days,
      unused_pl = greatest(coalesce(unused_pl, 0) - v_days, 0),
      processed_at = now()
    WHERE emp_code = p_req.emp_code AND year = v_year;
  ELSIF v_code = 'SL' THEN
    UPDATE indus_one.employee_leave_balances_yearly
    SET
      used_sl = used_sl + v_days,
      unused_sl = greatest(coalesce(unused_sl, 0) - v_days, 0),
      processed_at = now()
    WHERE emp_code = p_req.emp_code AND year = v_year;
  ELSIF v_code = 'CL' THEN
    UPDATE indus_one.employee_leave_balances_yearly
    SET
      used_cl = used_cl + v_days,
      unused_cl = greatest(coalesce(unused_cl, 0) - v_days, 0),
      processed_at = now()
    WHERE emp_code = p_req.emp_code AND year = v_year;
  END IF;

  INSERT INTO indus_one.admin_leave_balance_ledger (
    leave_request_id, emp_code, year, leave_type_code, delta_days, entry_type, note
  ) VALUES (
    p_req.id, p_req.emp_code, v_year, v_code, -v_days, 'deduct',
    'Approved leave — balance deducted'
  );
END;
$$;

CREATE OR REPLACE FUNCTION indus_one.admin_leave_restore_balance(p_req indus_one.admin_leave_requests)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = indus_one, public
AS $$
DECLARE
  v_row record;
BEGIN
  FOR v_row IN
    SELECT * FROM indus_one.admin_leave_balance_ledger
    WHERE leave_request_id = p_req.id AND entry_type = 'deduct'
    ORDER BY created_at
  LOOP
    IF v_row.leave_type_code = 'PL' THEN
      UPDATE indus_one.employee_leave_balances_yearly
      SET
        used_pl = greatest(used_pl + v_row.delta_days, 0),
        unused_pl = unused_pl - v_row.delta_days,
        processed_at = now()
      WHERE emp_code = v_row.emp_code AND year = v_row.year;
    ELSIF v_row.leave_type_code = 'SL' THEN
      UPDATE indus_one.employee_leave_balances_yearly
      SET
        used_sl = greatest(used_sl + v_row.delta_days, 0),
        unused_sl = unused_sl - v_row.delta_days,
        processed_at = now()
      WHERE emp_code = v_row.emp_code AND year = v_row.year;
    ELSIF v_row.leave_type_code = 'CL' THEN
      UPDATE indus_one.employee_leave_balances_yearly
      SET
        used_cl = greatest(used_cl + v_row.delta_days, 0),
        unused_cl = unused_cl - v_row.delta_days,
        processed_at = now()
      WHERE emp_code = v_row.emp_code AND year = v_row.year;
    END IF;

    INSERT INTO indus_one.admin_leave_balance_ledger (
      leave_request_id, emp_code, year, leave_type_code, delta_days, entry_type, note
    ) VALUES (
      p_req.id, v_row.emp_code, v_row.year, v_row.leave_type_code,
      -v_row.delta_days, 'restore', 'Leave rejected/cancelled — balance restored'
    );
  END LOOP;
END;
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

CREATE OR REPLACE FUNCTION indus_one.admin_leave_request_status_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = indus_one, public
AS $$
BEGIN
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

DROP TRIGGER IF EXISTS trg_admin_leave_requests_updated ON indus_one.admin_leave_requests;
CREATE TRIGGER trg_admin_leave_requests_updated
  BEFORE UPDATE ON indus_one.admin_leave_requests
  FOR EACH ROW EXECUTE FUNCTION indus_one.set_updated_at();

DROP TRIGGER IF EXISTS trg_admin_leave_request_status ON indus_one.admin_leave_requests;
CREATE TRIGGER trg_admin_leave_request_status
  BEFORE UPDATE OF status ON indus_one.admin_leave_requests
  FOR EACH ROW EXECUTE FUNCTION indus_one.admin_leave_request_status_changed();

ALTER TABLE indus_one.admin_leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE indus_one.admin_leave_balance_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE indus_one.admin_leave_attendance_marks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_leave_requests_select_own ON indus_one.admin_leave_requests;
CREATE POLICY admin_leave_requests_select_own ON indus_one.admin_leave_requests
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.current_user_can_access_module('admin')
    OR (SELECT indus_one.current_user_is_manager())
  );

DROP POLICY IF EXISTS admin_leave_requests_insert_own ON indus_one.admin_leave_requests;
CREATE POLICY admin_leave_requests_insert_own ON indus_one.admin_leave_requests
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS admin_leave_requests_insert_erp ON indus_one.admin_leave_requests;
CREATE POLICY admin_leave_requests_insert_erp ON indus_one.admin_leave_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_can_access_module('admin')
    OR (SELECT coalesce(indus_one.current_user_is_manager(), false))
  );

DROP POLICY IF EXISTS admin_leave_requests_update ON indus_one.admin_leave_requests;
CREATE POLICY admin_leave_requests_update ON indus_one.admin_leave_requests
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.current_user_can_access_module('admin')
    OR (SELECT indus_one.current_user_is_manager())
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.current_user_can_access_module('admin')
    OR (SELECT indus_one.current_user_is_manager())
  );

DROP POLICY IF EXISTS admin_leave_balance_ledger_select ON indus_one.admin_leave_balance_ledger;
CREATE POLICY admin_leave_balance_ledger_select ON indus_one.admin_leave_balance_ledger
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM indus_one.admin_leave_requests r
      WHERE r.id = leave_request_id
        AND (
          r.user_id = auth.uid()
          OR public.current_user_can_access_module('admin')
          OR (SELECT indus_one.current_user_is_manager())
        )
    )
  );

DROP POLICY IF EXISTS admin_leave_attendance_marks_select ON indus_one.admin_leave_attendance_marks;
CREATE POLICY admin_leave_attendance_marks_select ON indus_one.admin_leave_attendance_marks
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM indus_one.admin_leave_requests r
      WHERE r.id = leave_request_id AND r.user_id = auth.uid()
    )
    OR public.current_user_can_access_module('admin')
    OR (SELECT indus_one.current_user_is_manager())
  );

GRANT SELECT, INSERT, UPDATE ON indus_one.admin_leave_requests TO authenticated;
GRANT SELECT ON indus_one.admin_leave_balance_ledger TO authenticated;
GRANT SELECT ON indus_one.admin_leave_attendance_marks TO authenticated;

GRANT EXECUTE ON FUNCTION indus_one.admin_leave_primary_attendance_mark(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
