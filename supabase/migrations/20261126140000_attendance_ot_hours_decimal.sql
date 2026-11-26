-- Allow fractional OT hours for Custom OT sites (e.g. 3.78).
-- Grid / import previously truncated via integer parsing; storage must keep 2 dp.

DO $$
BEGIN
  IF to_regclass('public.attendance') IS NOT NULL THEN
    ALTER TABLE public.attendance
      ALTER COLUMN ot_hours TYPE numeric(5,2)
      USING ROUND(COALESCE(ot_hours, 0)::numeric, 2);

    ALTER TABLE public.attendance
      ALTER COLUMN ot_hours SET DEFAULT 0;

    COMMENT ON COLUMN public.attendance.ot_hours IS
      'Overtime hours for the day. Custom OT sites may store fractions (2 dp); capped at 16 in the app.';
  ELSE
    RAISE NOTICE 'Skipping attendance.ot_hours type change — public.attendance does not exist.';
  END IF;

  IF to_regclass('public.site_attendance_import_cells') IS NOT NULL THEN
    ALTER TABLE public.site_attendance_import_cells
      DROP CONSTRAINT IF EXISTS site_attendance_import_cells_proposed_ot_check;

    ALTER TABLE public.site_attendance_import_cells
      ALTER COLUMN proposed_ot TYPE numeric(5,2)
      USING ROUND(COALESCE(proposed_ot, 0)::numeric, 2);

    ALTER TABLE public.site_attendance_import_cells
      ALTER COLUMN expected_ot TYPE numeric(5,2)
      USING CASE
        WHEN expected_ot IS NULL THEN NULL
        ELSE ROUND(expected_ot::numeric, 2)
      END;

    ALTER TABLE public.site_attendance_import_cells
      ADD CONSTRAINT site_attendance_import_cells_proposed_ot_check
      CHECK (proposed_ot >= 0 AND proposed_ot <= 16);
  ELSE
    RAISE NOTICE 'Skipping import OT column type change — public.site_attendance_import_cells does not exist.';
  END IF;
END $$;

-- Re-create commit function with numeric OT so decimal imports are not truncated.
CREATE OR REPLACE FUNCTION public.site_att_import_commit(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_batch public.site_attendance_import_batches%ROWTYPE;
  v_site public.sites%ROWTYPE;
  v_multi boolean;
  v_codes text[];
  v_start date;
  v_end date;
  v_s int;
  v_e int;
  v_sm int;
  v_sy int;
  v_cell record;
  v_person public.people%ROWTYPE;
  v_existing public.attendance%ROWTYPE;
  v_found boolean;
  v_code text;
  v_ot numeric(5,2);
  v_other_duty boolean;
  v_saved public.attendance%ROWTYPE;
  v_errors jsonb := '[]'::jsonb;
  v_counts jsonb := '{}'::jsonb;
  v_n int := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in required.';
  END IF;

  SELECT * INTO v_batch FROM public.site_attendance_import_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Import batch not found.';
  END IF;
  IF v_batch.status = 'committed' THEN
    RETURN jsonb_build_object('ok', true, 'already_committed', true, 'summary', v_batch.summary);
  END IF;
  IF v_batch.status <> 'draft' THEN
    RAISE EXCEPTION 'Import batch is %; only drafts can be saved.', v_batch.status;
  END IF;
  IF v_batch.created_by <> auth.uid() THEN
    RAISE EXCEPTION 'Only the user who prepared this import can save it.';
  END IF;
  IF NOT public.current_user_can_access_site_attendance_site(v_batch.site_id) THEN
    RAISE EXCEPTION 'You do not have Site Attendance access for this site.';
  END IF;

  SELECT * INTO v_site FROM public.sites WHERE id = v_batch.site_id;
  v_multi := COALESCE(v_site.one_person_multiple_designations, false);
  v_codes := CASE WHEN v_site.shift_type = 'ABCG'
    THEN ARRAY['A', 'B', 'C', 'G', 'HD', 'WO', 'L', 'CO']
    ELSE ARRAY['P', 'HD', 'WO', 'L', 'NH-PH', 'CO'] END;

  -- Salary cycle range (mirrors src/lib/siteAttendance/salaryCycle.js getRange).
  v_s := COALESCE(v_site.salary_cycle_start_day, 1);
  v_e := COALESCE(v_site.salary_cycle_end_day, 31);
  IF v_s <= v_e THEN
    v_sm := v_batch.cycle_month; v_sy := v_batch.cycle_year;
  ELSE
    v_sm := v_batch.cycle_month - 1; v_sy := v_batch.cycle_year;
    IF v_sm < 1 THEN v_sm := 12; v_sy := v_sy - 1; END IF;
  END IF;
  v_start := make_date(v_sy, v_sm, LEAST(GREATEST(v_s, 1),
    EXTRACT(DAY FROM (make_date(v_sy, v_sm, 1) + interval '1 month - 1 day'))::int));
  v_end := make_date(v_batch.cycle_year, v_batch.cycle_month, LEAST(GREATEST(v_e, 1),
    EXTRACT(DAY FROM (make_date(v_batch.cycle_year, v_batch.cycle_month, 1) + interval '1 month - 1 day'))::int));

  IF EXISTS (
    SELECT 1 FROM public.attendance a
    WHERE a.site_id = v_batch.site_id AND a.month = v_batch.cycle_month
      AND a.year = v_batch.cycle_year AND COALESCE(a.is_locked, false)
  ) THEN
    RAISE EXCEPTION 'This month is locked for the site. Import was not saved.';
  END IF;

  PERFORM set_config('site_att_import.internal', 'on', true);

  FOR v_cell IN
    SELECT * FROM public.site_attendance_import_cells
    WHERE batch_id = p_batch_id
    ORDER BY att_date, person_id, designation
  LOOP
    v_code := upper(btrim(COALESCE(v_cell.proposed_code, '')));
    v_ot := ROUND(COALESCE(v_cell.proposed_ot, 0)::numeric, 2);

    IF v_cell.action = 'overwrite' AND NOT v_cell.approved THEN
      CONTINUE; -- conflicts are skipped unless explicitly approved
    END IF;

    IF v_cell.att_date < v_start OR v_cell.att_date > v_end THEN
      v_errors := v_errors || jsonb_build_object('person_id', v_cell.person_id, 'date', v_cell.att_date, 'designation', v_cell.designation, 'error', 'Date outside salary cycle');
      CONTINUE;
    END IF;
    IF v_code <> '' AND NOT (v_code = ANY (v_codes)) THEN
      v_errors := v_errors || jsonb_build_object('person_id', v_cell.person_id, 'date', v_cell.att_date, 'designation', v_cell.designation, 'error', 'Code not allowed for shift type: ' || v_code);
      CONTINUE;
    END IF;
    IF v_code = '' AND v_ot = 0 THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_person FROM public.people WHERE id = v_cell.person_id;
    IF NOT FOUND
       OR (v_person.is_active = false AND v_person.leaving_date IS NULL)
       OR (v_person.joining_date IS NOT NULL AND v_cell.att_date < v_person.joining_date)
       OR (v_person.leaving_date IS NOT NULL AND v_cell.att_date > v_person.leaving_date) THEN
      v_errors := v_errors || jsonb_build_object('person_id', v_cell.person_id, 'date', v_cell.att_date, 'designation', v_cell.designation, 'error', 'Outside joining/leaving dates');
      CONTINUE;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.site_assignments sa
      WHERE sa.person_id = v_cell.person_id AND sa.site_id = v_batch.site_id
        AND (sa.from_date IS NULL OR sa.from_date <= v_cell.att_date)
        AND (sa.to_date IS NULL OR sa.to_date >= v_cell.att_date)
    ) THEN
      v_errors := v_errors || jsonb_build_object('person_id', v_cell.person_id, 'date', v_cell.att_date, 'designation', v_cell.designation, 'error', 'Not assigned to site on this date');
      CONTINUE;
    END IF;

    -- Locate the row this cell targets (same keying as the attendance grid).
    v_found := false;
    IF v_cell.expected_attendance_id IS NOT NULL THEN
      SELECT * INTO v_existing FROM public.attendance
      WHERE id = v_cell.expected_attendance_id FOR UPDATE;
      v_found := FOUND;
      IF NOT v_found OR v_existing.person_id <> v_cell.person_id
         OR v_existing.site_id <> v_batch.site_id OR v_existing.att_date <> v_cell.att_date THEN
        v_errors := v_errors || jsonb_build_object('person_id', v_cell.person_id, 'date', v_cell.att_date, 'designation', v_cell.designation, 'error', 'Attendance changed since preview');
        CONTINUE;
      END IF;
    ELSE
      SELECT * INTO v_existing FROM public.attendance a
      WHERE a.person_id = v_cell.person_id AND a.site_id = v_batch.site_id AND a.att_date = v_cell.att_date
        AND (NOT v_multi OR COALESCE(a.designation, '') = v_cell.designation)
      LIMIT 1 FOR UPDATE;
      IF FOUND THEN
        v_errors := v_errors || jsonb_build_object('person_id', v_cell.person_id, 'date', v_cell.att_date, 'designation', v_cell.designation, 'error', 'Attendance changed since preview');
        CONTINUE;
      END IF;
    END IF;

    -- Optimistic concurrency: the row must still look like it did in preview.
    IF v_found AND (
         upper(btrim(COALESCE(v_existing.att_code, ''))) <> upper(btrim(COALESCE(v_cell.expected_code, '')))
         OR COALESCE(v_existing.ot_hours, 0) <> COALESCE(v_cell.expected_ot, 0)) THEN
      v_errors := v_errors || jsonb_build_object('person_id', v_cell.person_id, 'date', v_cell.att_date, 'designation', v_cell.designation, 'error', 'Attendance changed since preview');
      CONTINUE;
    END IF;

    -- Fill-empty never replaces a value that is already there.
    IF v_cell.action = 'fill' THEN
      IF v_found AND btrim(COALESCE(v_existing.att_code, '')) <> '' THEN
        v_code := upper(btrim(v_existing.att_code));
      END IF;
      IF v_found AND COALESCE(v_existing.ot_hours, 0) > 0 THEN
        v_ot := v_existing.ot_hours;
      END IF;
    ELSIF v_cell.action = 'sandwich' THEN
      IF NOT v_found OR upper(btrim(COALESCE(v_existing.att_code, ''))) NOT IN ('WO', 'NH-PH') OR v_code <> 'L' THEN
        v_errors := v_errors || jsonb_build_object('person_id', v_cell.person_id, 'date', v_cell.att_date, 'designation', v_cell.designation, 'error', 'Invalid sandwich conversion');
        CONTINUE;
      END IF;
      v_ot := COALESCE(v_existing.ot_hours, 0);
    END IF;

    -- OT rules from the grid: never on L / CO, and OT-only only beside a duty in another designation.
    v_other_duty := v_multi AND EXISTS (
      SELECT 1 FROM public.attendance a
      WHERE a.person_id = v_cell.person_id AND a.site_id = v_batch.site_id AND a.att_date = v_cell.att_date
        AND COALESCE(a.designation, '') <> v_cell.designation
        AND upper(btrim(COALESCE(a.att_code, ''))) IN ('P', 'A', 'B', 'C', 'G', 'HD')
    );
    IF v_ot > 0 AND (v_code IN ('L', 'CO') OR (v_code = '' AND NOT v_other_duty)) THEN
      v_errors := v_errors || jsonb_build_object('person_id', v_cell.person_id, 'date', v_cell.att_date, 'designation', v_cell.designation, 'error', 'OT not allowed on leave/absent/blank day');
      CONTINUE;
    END IF;
    IF v_multi AND v_code <> '' AND EXISTS (
      SELECT 1 FROM public.attendance a
      WHERE a.person_id = v_cell.person_id AND a.site_id = v_batch.site_id AND a.att_date = v_cell.att_date
        AND COALESCE(a.designation, '') <> v_cell.designation
        AND btrim(COALESCE(a.att_code, '')) <> ''
        AND (NOT v_found OR a.id <> v_existing.id)
    ) THEN
      v_errors := v_errors || jsonb_build_object('person_id', v_cell.person_id, 'date', v_cell.att_date, 'designation', v_cell.designation, 'error', 'Same-day entry exists under another designation');
      CONTINUE;
    END IF;

    IF v_found THEN
      UPDATE public.attendance
      SET att_code = v_code,
          ot_hours = v_ot,
          import_batch_id = p_batch_id
      WHERE id = v_existing.id
      RETURNING * INTO v_saved;
    ELSE
      INSERT INTO public.attendance (person_id, site_id, att_date, att_code, month, year, ot_hours, designation, import_batch_id)
      VALUES (v_cell.person_id, v_batch.site_id, v_cell.att_date, v_code, v_batch.cycle_month, v_batch.cycle_year,
              v_ot, CASE WHEN v_multi THEN NULLIF(v_cell.designation, '') ELSE NULL END, p_batch_id)
      RETURNING * INTO v_saved;
    END IF;

    UPDATE public.site_attendance_import_cells
    SET attendance_id = v_saved.id,
        prev_record = CASE WHEN v_found THEN to_jsonb(v_existing) ELSE NULL END,
        applied_record = to_jsonb(v_saved),
        outcome = 'applied'
    WHERE id = v_cell.id;

    v_n := v_n + 1;
    v_counts := jsonb_set(v_counts, ARRAY[v_cell.action],
      to_jsonb(COALESCE((v_counts ->> v_cell.action)::int, 0) + 1));
  END LOOP;

  IF jsonb_array_length(v_errors) > 0 THEN
    RAISE EXCEPTION USING
      MESSAGE = format('Import not saved: %s cell(s) failed server validation.', jsonb_array_length(v_errors)),
      DETAIL = left(v_errors::text, 4000),
      ERRCODE = 'P0001';
  END IF;

  UPDATE public.site_attendance_import_batches
  SET status = 'committed',
      committed_by = auth.uid(),
      committed_at = now(),
      summary = summary || jsonb_build_object('applied', v_n, 'applied_by_action', v_counts)
  WHERE id = p_batch_id;

  RETURN jsonb_build_object('ok', true, 'applied', v_n, 'by_action', v_counts);
END;
$$;

REVOKE ALL ON FUNCTION public.site_att_import_commit(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.site_att_import_commit(uuid) TO authenticated;

COMMENT ON FUNCTION public.site_att_import_commit(uuid) IS
  'Site Attendance import: server-side revalidation + atomic write of a draft batch (RLS applies). Supports fractional OT hours.';
