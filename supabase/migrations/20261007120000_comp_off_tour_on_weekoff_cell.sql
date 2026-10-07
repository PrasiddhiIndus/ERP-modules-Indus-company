-- =============================================================================
-- C/O: approved tour on a WO / NH-PH register cell earns like P(OD).
--
-- Some weekoff / holiday cells keep mark = WO (or NH/PH) while carrying the
-- approved tour link + remark. The Daily Register shows these as P(OD), but the
-- C/O ledger only reads the stored mark, so the day never earned C/O.
--
-- This credits such cells through indus_one.comp_off_try_earn_credit with mark
-- P(OD), so every department rule (Production* / R&M Sunday P(OD), 3rd Saturday
-- exclusions, cutoff, expiry) applies unchanged.
--
-- Only fills days with no credit row at all (max +1 per day). Existing credits,
-- deductions, manual adjustments and expiries are never modified, and the full
-- ledger reconcile is NOT run.
--
-- Writes only indus_one.comp_off_credits. No register / punch / tour / master
-- row changes; no existing C/O function is redefined.
-- =============================================================================

CREATE OR REPLACE FUNCTION indus_one.comp_off_tour_approved_for_day(
  p_tour_request_id uuid,
  p_date date
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, indus_one
AS $$
  SELECT p_tour_request_id IS NOT NULL
    AND p_date IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM indus_one.admin_tour_attendance_marks m
        WHERE m.tour_request_id = p_tour_request_id
          AND m.register_date = p_date
          AND coalesce(m.reverted, false) = false
      )
      OR EXISTS (
        SELECT 1
        FROM indus_one.admin_tour_requests t
        WHERE t.id = p_tour_request_id
          AND lower(btrim(coalesce(t.status, ''))) = 'approved'
          AND p_date BETWEEN t.from_date AND t.to_date
      )
      OR EXISTS (
        SELECT 1
        FROM indus_one.tour_requests t
        WHERE t.id = p_tour_request_id
          AND lower(btrim(coalesce(t.status, ''))) = 'approved'
          AND p_date BETWEEN t.from_date AND t.to_date
      )
    );
$$;

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

  -- Only fill a missing day: never re-activate, relabel, or top up an existing credit row.
  IF EXISTS (
    SELECT 1
    FROM indus_one.comp_off_credits c
    WHERE c.employee_code = v_code
      AND c.earned_date = p_register_date
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
  );
END;
$$;

CREATE OR REPLACE FUNCTION indus_one.trg_comp_off_tour_weekoff_cell()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, indus_one
AS $$
DECLARE
  v_code text;
  v_new_mark text;
BEGIN
  BEGIN
    v_code := indus_one.comp_off_norm_emp(NEW.employee_code);
    v_new_mark := indus_one.comp_off_normalize_mark(NEW.mark);

    IF NEW.tour_request_id IS NOT NULL THEN
      PERFORM indus_one.comp_off_earn_for_tour_weekoff_cell(
        NEW.id, NEW.employee_code, NEW.register_date, NEW.mark, NEW.tour_request_id
      );
    ELSIF TG_OP = 'UPDATE'
      AND OLD.tour_request_id IS NOT NULL
      AND v_new_mark IN ('WO', 'NH/PH', 'NHPH')
      AND EXISTS (
        SELECT 1
        FROM indus_one.comp_off_credits c
        WHERE c.employee_code = v_code
          AND c.earned_date = NEW.register_date
          AND c.source_type = 'register_pod'
          AND c.source_register_id = NEW.id
      ) THEN
      -- Tour removed from a weekoff cell: drop the tour credit, keep punch-based earn.
      PERFORM indus_one.comp_off_try_revoke_credit(v_code, NEW.register_date);
      PERFORM indus_one.comp_off_earn_for_punch_day(v_code, NEW.register_date);
    END IF;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'C/O tour-on-weekoff earn failed for % on %: %',
      NEW.employee_code, NEW.register_date, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comp_off_tour_weekoff_cell_trg ON public.admin_attendance_register;
CREATE TRIGGER comp_off_tour_weekoff_cell_trg
  AFTER INSERT OR UPDATE OF mark, tour_request_id
  ON public.admin_attendance_register
  FOR EACH ROW
  EXECUTE FUNCTION indus_one.trg_comp_off_tour_weekoff_cell();

-- One-time catch-up: approved tour cells stored as WO / NH-PH since the C/O start date.
-- Employees with a manual C/O adjustment are skipped (HR may already have
-- compensated these days by hand) and listed in the notices for review.
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
      RAISE NOTICE 'C/O added: % on %', v_row.employee_code, v_row.register_date;
    END IF;
  END LOOP;
  RAISE NOTICE 'C/O tour-on-weekoff catch-up: % credits added, % skipped (manual adjustment)',
    v_added, v_skipped_manual;
END;
$$;

COMMENT ON FUNCTION indus_one.comp_off_earn_for_tour_weekoff_cell(uuid, text, date, text, uuid) IS
  'Approved tour on a WO / NH-PH register cell earns C/O as P(OD) via comp_off_try_earn_credit (department rules unchanged).';

NOTIFY pgrst, 'reload schema';
