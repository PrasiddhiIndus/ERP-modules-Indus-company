-- Move half-day leave 14-Sep-2026 from old code 10919 → V-00007
-- (employee_code changed after approval; leave still tagged to 10919)
--
-- Run in Supabase SQL editor as a privileged role.
-- 1) Run the SELECT / inspect block first and confirm the rows.
-- 2) Then run the UPDATE transaction.

-- =============================================================================
-- 0) Confirm current employee master for the new code
-- =============================================================================
SELECT id, employee_code, employee_id, full_name, status
FROM public.admin_ifsp_employee_master
WHERE public.norm_emp_code(employee_code) IN (
  public.norm_emp_code('10919'),
  public.norm_emp_code('V-00007')
)
   OR public.norm_emp_code(employee_id) IN (
  public.norm_emp_code('10919'),
  public.norm_emp_code('V-00007')
);

-- =============================================================================
-- 1) Inspect leave requests (LMS + admin mirror)
-- =============================================================================
SELECT 'leave_requests' AS src, id, employee_code, leave_type_code,
       from_date, to_date, days, status, overall_status
FROM indus_one.leave_requests
WHERE public.norm_emp_code(employee_code) = public.norm_emp_code('10919')
  AND from_date <= DATE '2026-09-14'
  AND to_date   >= DATE '2026-09-14';

SELECT 'admin_leave_requests' AS src, id, employee_code, employee_master_id, leave_type_code,
       from_date, to_date, days, status, overall_status
FROM indus_one.admin_leave_requests
WHERE public.norm_emp_code(employee_code) = public.norm_emp_code('10919')
  AND from_date <= DATE '2026-09-14'
  AND to_date   >= DATE '2026-09-14';

-- =============================================================================
-- 2) Inspect applied leave marks + daily register for that day
-- =============================================================================
SELECT *
FROM indus_one.admin_leave_attendance_marks
WHERE public.norm_emp_code(employee_code) = public.norm_emp_code('10919')
  AND register_date = DATE '2026-09-14'
  AND COALESCE(reverted, false) = false;

SELECT employee_code, register_date, mark, mark_source, leave_request_id, month_key
FROM public.admin_attendance_register
WHERE public.norm_emp_code(employee_code) IN (
        public.norm_emp_code('10919'),
        public.norm_emp_code('V-00007')
      )
  AND register_date = DATE '2026-09-14';

-- Optional: ledger rows tied to those leave requests
SELECT l.*
FROM indus_one.admin_leave_balance_ledger l
JOIN indus_one.admin_leave_requests r ON r.id = l.leave_request_id
WHERE public.norm_emp_code(r.employee_code) = public.norm_emp_code('10919')
  AND r.from_date <= DATE '2026-09-14'
  AND r.to_date   >= DATE '2026-09-14';

-- =============================================================================
-- 3) APPLY FIX (run after inspecting)
-- =============================================================================
BEGIN;

-- LMS leave_requests: employee_code only (no employee_master_id on this table)
WITH target AS (
  SELECT employee_code
  FROM public.admin_ifsp_employee_master
  WHERE public.norm_emp_code(employee_code) = public.norm_emp_code('V-00007')
  LIMIT 1
)
UPDATE indus_one.leave_requests lr
SET
  employee_code = target.employee_code,
  updated_at = now()
FROM target
WHERE public.norm_emp_code(lr.employee_code) = public.norm_emp_code('10919')
  AND lr.from_date <= DATE '2026-09-14'
  AND lr.to_date   >= DATE '2026-09-14';

-- Admin mirror: employee_code + employee_master_id
WITH target AS (
  SELECT id AS employee_master_id, employee_code
  FROM public.admin_ifsp_employee_master
  WHERE public.norm_emp_code(employee_code) = public.norm_emp_code('V-00007')
  LIMIT 1
)
UPDATE indus_one.admin_leave_requests ar
SET
  employee_code = target.employee_code,
  employee_master_id = COALESCE(target.employee_master_id, ar.employee_master_id),
  updated_at = now()
FROM target
WHERE public.norm_emp_code(ar.employee_code) = public.norm_emp_code('10919')
  AND ar.from_date <= DATE '2026-09-14'
  AND ar.to_date   >= DATE '2026-09-14';

-- Leave applied-marks history
WITH target AS (
  SELECT employee_code
  FROM public.admin_ifsp_employee_master
  WHERE public.norm_emp_code(employee_code) = public.norm_emp_code('V-00007')
  LIMIT 1
)
UPDATE indus_one.admin_leave_attendance_marks m
SET employee_code = target.employee_code
FROM target
WHERE public.norm_emp_code(m.employee_code) = public.norm_emp_code('10919')
  AND m.register_date = DATE '2026-09-14'
  AND COALESCE(m.reverted, false) = false;

-- Balance ledger (column is employee_code in current schema; older DBs used emp_code)
DO $$
DECLARE
  v_col text;
  v_new text;
BEGIN
  SELECT employee_code INTO v_new
  FROM public.admin_ifsp_employee_master
  WHERE public.norm_emp_code(employee_code) = public.norm_emp_code('V-00007')
  LIMIT 1;

  IF v_new IS NULL THEN
    RAISE EXCEPTION 'Employee master row for V-00007 not found';
  END IF;

  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'indus_one'
        AND table_name = 'admin_leave_balance_ledger'
        AND column_name = 'employee_code'
    ) THEN 'employee_code'
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'indus_one'
        AND table_name = 'admin_leave_balance_ledger'
        AND column_name = 'emp_code'
    ) THEN 'emp_code'
    ELSE NULL
  END INTO v_col;

  IF v_col IS NULL THEN
    RAISE NOTICE 'admin_leave_balance_ledger code column not found; skipped';
    RETURN;
  END IF;

  EXECUTE format(
    $sql$
      UPDATE indus_one.admin_leave_balance_ledger l
      SET %I = $1
      FROM indus_one.admin_leave_requests r
      WHERE l.leave_request_id = r.id
        AND public.norm_emp_code(r.employee_code) = public.norm_emp_code($1)
        AND r.from_date <= DATE '2026-09-14'
        AND r.to_date   >= DATE '2026-09-14'
        AND public.norm_emp_code(l.%I) = public.norm_emp_code('10919')
    $sql$,
    v_col,
    v_col
  )
  USING v_new;
END $$;

-- Daily attendance register:
-- If V-00007 already has a row for 2026-09-14, merge leave onto it and delete 10919's leave row.
-- Otherwise rename 10919's register row to V-00007.
DO $$
DECLARE
  v_new text;
  v_old_id bigint;
  v_new_id bigint;
  v_leave_id uuid;
  v_mark text;
  v_source text;
BEGIN
  SELECT employee_code INTO v_new
  FROM public.admin_ifsp_employee_master
  WHERE public.norm_emp_code(employee_code) = public.norm_emp_code('V-00007')
  LIMIT 1;

  IF v_new IS NULL THEN
    RAISE EXCEPTION 'Employee master row for V-00007 not found';
  END IF;

  SELECT id, leave_request_id, mark, mark_source
  INTO v_old_id, v_leave_id, v_mark, v_source
  FROM public.admin_attendance_register
  WHERE public.norm_emp_code(employee_code) = public.norm_emp_code('10919')
    AND register_date = DATE '2026-09-14'
  LIMIT 1;

  IF v_old_id IS NULL THEN
    RAISE NOTICE 'No admin_attendance_register row for 10919 on 2026-09-14';
    RETURN;
  END IF;

  SELECT id INTO v_new_id
  FROM public.admin_attendance_register
  WHERE public.norm_emp_code(employee_code) = public.norm_emp_code(v_new)
    AND register_date = DATE '2026-09-14'
  LIMIT 1;

  IF v_new_id IS NULL THEN
    UPDATE public.admin_attendance_register
    SET employee_code = v_new,
        updated_at = now()
    WHERE id = v_old_id;
  ELSE
    -- Prefer moving the leave mark onto V-00007; drop the orphan 10919 cell.
    UPDATE public.admin_attendance_register
    SET mark = COALESCE(NULLIF(btrim(v_mark), ''), mark),
        mark_source = COALESCE(NULLIF(btrim(v_source), ''), mark_source, 'leave'),
        leave_request_id = COALESCE(v_leave_id, leave_request_id),
        updated_at = now()
    WHERE id = v_new_id;

    DELETE FROM public.admin_attendance_register
    WHERE id = v_old_id;
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- 4) Verify — leave should appear only under V-00007
-- =============================================================================
SELECT 'leave_requests' AS src, id, employee_code, from_date, to_date, status, overall_status
FROM indus_one.leave_requests
WHERE from_date <= DATE '2026-09-14'
  AND to_date   >= DATE '2026-09-14'
  AND public.norm_emp_code(employee_code) IN (
    public.norm_emp_code('10919'),
    public.norm_emp_code('V-00007')
  );

SELECT 'admin_leave_requests' AS src, id, employee_code, from_date, to_date, status, overall_status
FROM indus_one.admin_leave_requests
WHERE from_date <= DATE '2026-09-14'
  AND to_date   >= DATE '2026-09-14'
  AND public.norm_emp_code(employee_code) IN (
    public.norm_emp_code('10919'),
    public.norm_emp_code('V-00007')
  );

SELECT employee_code, register_date, mark, mark_source, leave_request_id
FROM public.admin_attendance_register
WHERE register_date = DATE '2026-09-14'
  AND public.norm_emp_code(employee_code) IN (
    public.norm_emp_code('10919'),
    public.norm_emp_code('V-00007')
  );

SELECT employee_code, register_date, applied_mark, leave_request_id, reverted
FROM indus_one.admin_leave_attendance_marks
WHERE register_date = DATE '2026-09-14'
  AND public.norm_emp_code(employee_code) IN (
    public.norm_emp_code('10919'),
    public.norm_emp_code('V-00007')
  );
