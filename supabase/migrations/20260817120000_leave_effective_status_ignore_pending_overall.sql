-- Leave inbox / attendance: leftover overall_status = 'pending' must not hide
-- a decided status (approved / rejected / cancelled / withdrawn).
-- Indus One often sets leave_requests.status = 'approved' while overall_status
-- stays at the column default 'pending'. coalesce(overall, status) then treated
-- those rows as still pending.

CREATE OR REPLACE FUNCTION indus_one.admin_leave_effective_status(
  p_status text,
  p_overall_status text DEFAULT NULL
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN lower(btrim(coalesce(p_overall_status, ''))) IN (
      'approved', 'rejected', 'cancelled', 'withdrawn'
    )
      THEN lower(btrim(p_overall_status))
    ELSE lower(btrim(coalesce(
      nullif(btrim(p_status), ''),
      nullif(btrim(p_overall_status), '')
    )))
  END;
$$;

GRANT EXECUTE ON FUNCTION indus_one.admin_leave_effective_status(text, text) TO authenticated;

-- Mirror: do not copy a leftover LMS overall_status of 'pending' over a decided status.
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

  v_lms_overall := CASE lower(btrim(coalesce(NEW.overall_status, '')))
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

  -- Decided overall wins; leftover pending does not hide LMS status.
  IF v_lms_overall IN ('approved', 'rejected', 'cancelled', 'withdrawn') THEN
    v_overall_status := v_lms_overall;
  ELSE
    v_overall_status := v_admin_status;
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

-- Align leftover pending rollups. Function is replaced first so the status
-- trigger sees no pending→approved transition (effective status was already approved).
UPDATE indus_one.admin_leave_requests
SET overall_status = status
WHERE lower(btrim(coalesce(status, ''))) IN ('approved', 'rejected', 'cancelled', 'withdrawn')
  AND lower(btrim(coalesce(overall_status, 'pending'))) = 'pending';

DO $lms_overall$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'indus_one'
      AND table_name = 'leave_requests'
      AND column_name = 'overall_status'
  ) THEN
    UPDATE indus_one.leave_requests
    SET overall_status = status
    WHERE lower(btrim(coalesce(status, ''))) IN ('approved', 'rejected', 'cancelled', 'withdrawn')
      AND lower(btrim(coalesce(overall_status, 'pending'))) = 'pending';
  END IF;
END $lms_overall$;
