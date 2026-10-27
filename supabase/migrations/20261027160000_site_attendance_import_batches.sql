-- Site Attendance: automated import (Phase 2 — Excel/CSV, fill-empty save).
--
-- Preview is built entirely in the browser; nothing touches public.attendance
-- until the user clicks Save. Save inserts one draft batch + its cells, then
-- calls site_att_import_commit(), which re-validates every cell on the server
-- and writes attendance in one transaction. The function is SECURITY INVOKER
-- so the existing attendance RLS still applies to the caller.
--
-- Additions only: two new tables, one nullable column on attendance, helpers.

-- ---------------------------------------------------------------------------
-- Access helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_has_site_attendance_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_user_can_access_module('hr')
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND jsonb_typeof(COALESCE(p.allowed_sub_modules, '[]'::jsonb)) = 'array'
        AND p.allowed_sub_modules ? 'hr.site-attendance'
    )
$$;

GRANT EXECUTE ON FUNCTION public.current_user_has_site_attendance_access() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.current_user_can_access_site_attendance_site(p_site_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT public.current_user_has_site_attendance_access()
    AND EXISTS (
      SELECT 1 FROM public.sites s
      WHERE s.id = p_site_id
        AND public.current_user_can_access_calling_site_type(NULLIF(btrim(s.site_type), ''))
    )
$$;

GRANT EXECUTE ON FUNCTION public.current_user_can_access_site_attendance_site(bigint) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.site_attendance_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id bigint NOT NULL REFERENCES public.sites(id),
  cycle_month integer NOT NULL CHECK (cycle_month BETWEEN 1 AND 12),
  cycle_year integer NOT NULL CHECK (cycle_year BETWEEN 2000 AND 2100),
  site_type text,
  file_name text NOT NULL,
  file_sha256 text NOT NULL,
  file_size bigint,
  provider_id text NOT NULL,
  provider_version text,
  mark_dictionary_version text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'committed', 'partially_reverted', 'reverted', 'failed')),
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_message text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  committed_by uuid,
  committed_at timestamptz,
  reverted_by uuid,
  reverted_at timestamptz
);

-- Same file for the same site/cycle can be committed only once (idempotency).
CREATE UNIQUE INDEX IF NOT EXISTS uq_site_att_import_batch_committed_file
  ON public.site_attendance_import_batches (site_id, cycle_month, cycle_year, file_sha256)
  WHERE status IN ('committed', 'partially_reverted');

CREATE INDEX IF NOT EXISTS idx_site_att_import_batches_site_cycle
  ON public.site_attendance_import_batches (site_id, cycle_year DESC, cycle_month DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS public.site_attendance_import_cells (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  batch_id uuid NOT NULL REFERENCES public.site_attendance_import_batches(id) ON DELETE CASCADE,
  person_id bigint NOT NULL REFERENCES public.people(id),
  att_date date NOT NULL,
  designation text NOT NULL DEFAULT '',
  raw_mark text,
  raw_ot text,
  source_ref jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric(4, 3),
  proposed_code text NOT NULL DEFAULT '',
  proposed_ot integer NOT NULL DEFAULT 0 CHECK (proposed_ot BETWEEN 0 AND 16),
  action text NOT NULL CHECK (action IN ('insert', 'fill', 'overwrite', 'sandwich')),
  approved boolean NOT NULL DEFAULT false,
  expected_attendance_id bigint,
  expected_code text,
  expected_ot integer,
  attendance_id bigint,
  prev_record jsonb,
  applied_record jsonb,
  outcome text CHECK (outcome IN ('applied', 'reverted', 'revert_skipped')),
  UNIQUE (batch_id, person_id, att_date, designation)
);

CREATE INDEX IF NOT EXISTS idx_site_att_import_cells_batch ON public.site_attendance_import_cells (batch_id);

ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS import_batch_id uuid
  REFERENCES public.site_attendance_import_batches(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Bookkeeping fields only change inside the commit/revert functions.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_site_att_import_batch_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('site_att_import.internal', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.committed_by IS DISTINCT FROM OLD.committed_by
     OR NEW.committed_at IS DISTINCT FROM OLD.committed_at
     OR NEW.reverted_by IS DISTINCT FROM OLD.reverted_by
     OR NEW.reverted_at IS DISTINCT FROM OLD.reverted_at
     OR NEW.site_id IS DISTINCT FROM OLD.site_id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'Import batch status can only change through commit or revert.';
  END IF;
  IF OLD.status <> 'draft' THEN
    RAISE EXCEPTION 'Only draft import batches can be edited.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS site_att_import_batch_guard ON public.site_attendance_import_batches;
CREATE TRIGGER site_att_import_batch_guard
  BEFORE UPDATE ON public.site_attendance_import_batches
  FOR EACH ROW EXECUTE FUNCTION public.trg_site_att_import_batch_guard();

CREATE OR REPLACE FUNCTION public.trg_site_att_import_cell_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_status text;
BEGIN
  IF current_setting('site_att_import.internal', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  SELECT status INTO v_status FROM public.site_attendance_import_batches
  WHERE id = COALESCE(NEW.batch_id, OLD.batch_id);
  IF TG_OP = 'DELETE' AND v_status IS NULL THEN
    RETURN OLD; -- cascade from deleting a draft/failed batch
  END IF;
  IF v_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Cells of a committed import cannot be changed.';
  END IF;
  IF TG_OP <> 'DELETE' AND (NEW.attendance_id IS NOT NULL OR NEW.prev_record IS NOT NULL
      OR NEW.applied_record IS NOT NULL OR NEW.outcome IS NOT NULL) THEN
    RAISE EXCEPTION 'Import result fields are set by the server.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS site_att_import_cell_guard ON public.site_attendance_import_cells;
CREATE TRIGGER site_att_import_cell_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.site_attendance_import_cells
  FOR EACH ROW EXECUTE FUNCTION public.trg_site_att_import_cell_guard();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.site_attendance_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_attendance_import_cells ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS site_att_import_batches_select ON public.site_attendance_import_batches;
CREATE POLICY site_att_import_batches_select ON public.site_attendance_import_batches
  FOR SELECT TO authenticated
  USING (public.current_user_can_access_site_attendance_site(site_id));

DROP POLICY IF EXISTS site_att_import_batches_insert ON public.site_attendance_import_batches;
CREATE POLICY site_att_import_batches_insert ON public.site_attendance_import_batches
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND status = 'draft'
    AND public.current_user_can_access_site_attendance_site(site_id)
  );

DROP POLICY IF EXISTS site_att_import_batches_update ON public.site_attendance_import_batches;
CREATE POLICY site_att_import_batches_update ON public.site_attendance_import_batches
  FOR UPDATE TO authenticated
  USING (public.current_user_can_access_site_attendance_site(site_id))
  WITH CHECK (public.current_user_can_access_site_attendance_site(site_id));

DROP POLICY IF EXISTS site_att_import_batches_delete ON public.site_attendance_import_batches;
CREATE POLICY site_att_import_batches_delete ON public.site_attendance_import_batches
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() AND status IN ('draft', 'failed'));

DROP POLICY IF EXISTS site_att_import_cells_select ON public.site_attendance_import_cells;
CREATE POLICY site_att_import_cells_select ON public.site_attendance_import_cells
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.site_attendance_import_batches b
    WHERE b.id = batch_id AND public.current_user_can_access_site_attendance_site(b.site_id)
  ));

DROP POLICY IF EXISTS site_att_import_cells_write ON public.site_attendance_import_cells;
CREATE POLICY site_att_import_cells_write ON public.site_attendance_import_cells
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.site_attendance_import_batches b
    WHERE b.id = batch_id AND b.created_by = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.site_attendance_import_batches b
    WHERE b.id = batch_id AND b.created_by = auth.uid()
  ));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_attendance_import_batches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_attendance_import_cells TO authenticated;

-- ---------------------------------------------------------------------------
-- Commit: re-validate every cell and write attendance atomically.
-- Any failure aborts the whole import (nothing partial is written).
-- ---------------------------------------------------------------------------
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
  v_ot int;
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
    v_ot := COALESCE(v_cell.proposed_ot, 0);

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
  'Site Attendance import: server-side revalidation + atomic write of a draft batch (RLS applies).';
