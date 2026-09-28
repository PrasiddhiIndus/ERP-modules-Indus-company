-- =============================================================================
-- C/O earn when a machine punch arrives on a weekoff / holiday day.
--
-- Since 20260921150000 the C/O Balances page no longer runs reconcile, so C/O is
-- earned only by the admin_attendance_register trigger. Punches whose register
-- cell is not rewritten (manual / remarked WO, leave cell, missing row, punch
-- synced after the cell was set) never earned C/O.
--
-- Adds an erp_attendance_punches trigger that applies the SAME earning rules
-- (indus_one.comp_off_try_earn_credit — department rules unchanged).
-- Also stops the punch pass of reconcile from revoking a Sunday P(OD) credit
-- (Production* / R&M) when that day also has a machine punch.
--
-- Writes only indus_one.comp_off_credits. No register / punch / master changes.
-- =============================================================================

CREATE OR REPLACE FUNCTION indus_one.comp_off_earn_for_punch_day(
  p_employee_code text,
  p_punch_date date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, indus_one
AS $$
DECLARE
  v_code text := indus_one.comp_off_norm_emp(p_employee_code);
  v_reg_id uuid;
  v_reg_mark text;
BEGIN
  IF v_code = '' OR p_punch_date IS NULL THEN RETURN; END IF;
  IF p_punch_date < indus_one.comp_off_cutoff_date() THEN RETURN; END IF;

  SELECT r.id, indus_one.comp_off_normalize_mark(r.mark)
  INTO v_reg_id, v_reg_mark
  FROM public.admin_attendance_register r
  WHERE r.employee_code IN (v_code, btrim(coalesce(p_employee_code, '')))
    AND r.register_date = p_punch_date
  ORDER BY r.id DESC
  LIMIT 1;

  IF v_reg_mark = 'P(OD)' THEN
    -- Register P(OD) keeps its own credit (Sunday P(OD) earns for all depts).
    PERFORM indus_one.comp_off_try_earn_credit(v_code, p_punch_date, v_reg_id, 'P(OD)', NULL);
  ELSIF v_reg_mark IN ('WO', 'NH/PH', 'NHPH') THEN
    PERFORM indus_one.comp_off_try_earn_credit(v_code, p_punch_date, v_reg_id, 'P', v_reg_mark);
  ELSIF indus_one.comp_off_is_earning_day(p_punch_date, NULL, v_code) THEN
    PERFORM indus_one.comp_off_try_earn_credit(v_code, p_punch_date, v_reg_id, 'P', NULL);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION indus_one.trg_comp_off_punch_earn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, indus_one
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.punch_date IS NOT DISTINCT FROM OLD.punch_date
     AND NEW.employee_code IS NOT DISTINCT FROM OLD.employee_code THEN
    RETURN NEW;
  END IF;

  -- Already credited for this day: nothing to add (avoids rewrite on re-sync).
  IF EXISTS (
    SELECT 1
    FROM indus_one.comp_off_credits c
    WHERE c.employee_code = indus_one.comp_off_norm_emp(NEW.employee_code)
      AND c.earned_date = NEW.punch_date
      AND c.status <> 'revoked'
  ) THEN
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM indus_one.comp_off_earn_for_punch_day(NEW.employee_code, NEW.punch_date);
  EXCEPTION WHEN others THEN
    -- Never block punch ingestion because of C/O.
    RAISE WARNING 'C/O earn on punch failed for % on %: %', NEW.employee_code, NEW.punch_date, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comp_off_punch_earn_trg ON public.erp_attendance_punches;
CREATE TRIGGER comp_off_punch_earn_trg
  AFTER INSERT OR UPDATE OF employee_code, punch_date
  ON public.erp_attendance_punches
  FOR EACH ROW
  EXECUTE FUNCTION indus_one.trg_comp_off_punch_earn();

-- Reconcile: pass 1 unchanged; pass 2 (punches) uses the register-aware helper.
CREATE OR REPLACE FUNCTION indus_one.reconcile_comp_off_credits_from_register()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, indus_one
AS $$
DECLARE
  v_cutoff date := indus_one.comp_off_cutoff_date();
  v_row record;
  v_count integer := 0;
  v_prior text;
  v_earn_mark text;
  v_code text;
BEGIN
  -- Pass 1: register rows (Present on weekoff/holiday, or WO/NH/PH with punch)
  FOR v_row IN
    SELECT
      r.id,
      r.employee_code,
      r.register_date,
      r.mark,
      indus_one.comp_off_normalize_mark(r.mark) AS mark_norm
    FROM public.admin_attendance_register r
    WHERE r.register_date >= v_cutoff
      AND coalesce(btrim(r.employee_code), '') <> ''
  LOOP
    v_code := indus_one.comp_off_norm_emp(v_row.employee_code);
    IF v_code = '' THEN CONTINUE; END IF;

    v_prior := NULL;
    v_earn_mark := NULL;

    IF indus_one.comp_off_is_present_mark(v_row.mark_norm)
       AND indus_one.comp_off_is_earning_day(v_row.register_date, NULL, v_code) THEN
      v_earn_mark := v_row.mark_norm;
      v_prior := NULL;
    ELSIF v_row.mark_norm IN ('WO', 'NH/PH', 'NHPH')
      AND indus_one.comp_off_employee_has_punch(v_code, v_row.register_date) THEN
      v_earn_mark := 'P';
      v_prior := v_row.mark_norm;
    END IF;

    IF v_earn_mark IS NULL THEN
      CONTINUE;
    END IF;

    PERFORM indus_one.comp_off_try_earn_credit(
      v_code,
      v_row.register_date,
      v_row.id,
      v_earn_mark,
      v_prior
    );
    v_count := v_count + 1;
  END LOOP;

  -- Pass 2: punches on weekoff / NH/PH days (covers missing or non-present register rows)
  FOR v_row IN
    SELECT DISTINCT
      indus_one.comp_off_norm_emp(p.employee_code) AS emp,
      p.punch_date AS punch_date
    FROM public.erp_attendance_punches p
    WHERE p.punch_date >= v_cutoff
      AND indus_one.comp_off_norm_emp(p.employee_code) <> ''
  LOOP
    PERFORM indus_one.comp_off_earn_for_punch_day(v_row.emp, v_row.punch_date);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION indus_one.reconcile_comp_off_credits_from_register() TO authenticated;

-- One-time catch-up for punches already synced this month.
SELECT indus_one.reconcile_comp_off_credits_from_register();

NOTIFY pgrst, 'reload schema';
