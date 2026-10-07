-- =============================================================================
-- C/O: tour-on-weekoff cells — re-activate an unused revoked credit for that day.
--
-- 20261007120000 skipped any day that already had a credit row. Some of these
-- days had a credit that was revoked when the cell went back to WO (e.g. 3748 on
-- 2026-09-27), so the tour day still showed 0 C/O.
--
-- Now: skip only when the day already has an active / used credit. A revoked
-- credit with nothing consumed is re-activated by comp_off_try_earn_credit
-- (existing ON CONFLICT rule) — still max 1 credit per employee per day.
-- Department rules, manual adjustments, deductions and expiries are untouched.
-- Writes only indus_one.comp_off_credits.
-- =============================================================================

CREATE OR REPLACE FUNCTION indus_one.comp_off_earn_for_tour_weekoff_cell(
  p_register_id uuid,
  p_employee_code text,
  p_register_date date,
  p_mark text,
  p_tour_request_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, indus_one
AS $$
DECLARE
  v_mark text := indus_one.comp_off_normalize_mark(p_mark);
  v_code text := indus_one.comp_off_norm_emp(p_employee_code);
BEGIN
  IF v_mark NOT IN ('WO', 'NH/PH', 'NHPH') THEN RETURN false; END IF;
  IF NOT indus_one.comp_off_tour_approved_for_day(p_tour_request_id, p_register_date) THEN
    RETURN false;
  END IF;

  -- Only fill a missing day or re-activate an unused revoked credit for it.
  IF EXISTS (
    SELECT 1
    FROM indus_one.comp_off_credits c
    WHERE c.employee_code = v_code
      AND c.earned_date = p_register_date
      AND (c.status <> 'revoked' OR c.consumed_amount <> 0 OR c.source_type = 'manual')
  ) THEN
    RETURN false;
  END IF;

  PERFORM indus_one.comp_off_try_earn_credit(
    p_employee_code,
    p_register_date,
    p_register_id,
    'P(OD)',
    v_mark
  );
  RETURN EXISTS (
    SELECT 1
    FROM indus_one.comp_off_credits c
    WHERE c.employee_code = v_code
      AND c.earned_date = p_register_date
      AND c.status <> 'revoked'
  );
END;
$$;

-- Catch-up again with the relaxed guard (same scope and manual-adjustment skip).
DO $$
DECLARE
  v_row record;
  v_added integer := 0;
  v_skipped_manual integer := 0;
BEGIN
  FOR v_row IN
    SELECT r.id, r.employee_code, r.register_date, r.mark, r.tour_request_id
    FROM public.admin_attendance_register r
    WHERE r.register_date >= indus_one.comp_off_cutoff_date()
      AND r.register_date <= (now() AT TIME ZONE 'Asia/Kolkata')::date
      AND r.tour_request_id IS NOT NULL
      AND indus_one.comp_off_normalize_mark(r.mark) IN ('WO', 'NH/PH', 'NHPH')
    ORDER BY r.employee_code, r.register_date
  LOOP
    IF EXISTS (
      SELECT 1
      FROM indus_one.comp_off_credits c
      WHERE c.employee_code = indus_one.comp_off_norm_emp(v_row.employee_code)
        AND c.source_type = 'manual'
    ) THEN
      v_skipped_manual := v_skipped_manual + 1;
      RAISE NOTICE 'Skipped (manual C/O adjustment exists): % on %',
        v_row.employee_code, v_row.register_date;
      CONTINUE;
    END IF;

    IF indus_one.comp_off_earn_for_tour_weekoff_cell(
      v_row.id, v_row.employee_code, v_row.register_date, v_row.mark, v_row.tour_request_id
    ) THEN
      v_added := v_added + 1;
      RAISE NOTICE 'C/O added / re-activated: % on %', v_row.employee_code, v_row.register_date;
    END IF;
  END LOOP;
  RAISE NOTICE 'C/O tour-on-weekoff catch-up: % credits added / re-activated, % skipped (manual adjustment)',
    v_added, v_skipped_manual;
END;
$$;

NOTIFY pgrst, 'reload schema';
