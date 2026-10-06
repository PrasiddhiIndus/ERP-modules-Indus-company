-- =============================================================================
-- Salary Processing: atomic full reprocess of a month sheet (QA defect D-02).
--
-- One call, one transaction: update the month run, replace its lines, log the
-- revision. Any error rolls back everything, so the previous sheet stays intact.
-- All salary calculation stays in the app; this function only stores the
-- already-computed rows.
--
-- SECURITY INVOKER: runs as the signed-in user, so the existing Salary Admin
-- RLS policies (admin_salary_user_has_access()) still apply to every statement.
--
-- Additive only: no table, column, policy or existing function is changed.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.admin_salary_reprocess_month_run(uuid, jsonb, jsonb, jsonb);
--   NOTIFY pgrst, 'reload schema';
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_salary_reprocess_month_run(
  p_run_id uuid,
  p_run_patch jsonb,
  p_lines jsonb,
  p_revision jsonb DEFAULT NULL
)
RETURNS public.admin_salary_month_runs
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_run public.admin_salary_month_runs;
  v_cols text;
  v_bad text;
BEGIN
  IF p_run_id IS NULL THEN
    RAISE EXCEPTION 'Salary sheet id is required.' USING ERRCODE = '22004';
  END IF;
  IF p_run_patch IS NULL OR jsonb_typeof(p_run_patch) <> 'object' THEN
    RAISE EXCEPTION 'Salary sheet changes are missing.' USING ERRCODE = '22023';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN
    RAISE EXCEPTION 'Salary sheet lines are missing.' USING ERRCODE = '22023';
  END IF;

  -- 1. Update the month run (same columns the app patched before).
  SELECT string_agg(k, ', ') INTO v_bad
  FROM jsonb_object_keys(p_run_patch) AS k
  WHERE k IN ('id', 'month_key', 'pay_year', 'pay_month', 'created_at', 'created_by')
     OR NOT EXISTS (
       SELECT 1 FROM information_schema.columns c
       WHERE c.table_schema = 'public'
         AND c.table_name = 'admin_salary_month_runs'
         AND c.column_name = k
     );
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Unexpected salary sheet field(s): %', v_bad USING ERRCODE = '42703';
  END IF;

  SELECT string_agg(quote_ident(k), ', ') INTO v_cols
  FROM jsonb_object_keys(p_run_patch) AS k;

  IF v_cols IS NULL THEN
    RAISE EXCEPTION 'Salary sheet changes are missing.' USING ERRCODE = '22023';
  END IF;

  EXECUTE format(
    'UPDATE public.admin_salary_month_runs SET (%1$s) = '
    '(SELECT %1$s FROM jsonb_populate_record(NULL::public.admin_salary_month_runs, $1)) '
    'WHERE id = $2 RETURNING *',
    v_cols
  ) INTO v_run USING p_run_patch, p_run_id;

  IF v_run.id IS NULL THEN
    RAISE EXCEPTION 'Salary sheet not found.' USING ERRCODE = 'P0002';
  END IF;

  -- 2. Remove the previous lines of this run.
  DELETE FROM public.admin_salary_month_lines WHERE run_id = p_run_id;

  -- 3. Insert the new lines with exactly the columns the app sends
  --    (columns not sent keep their table defaults, as with a REST insert).
  IF jsonb_array_length(p_lines) > 0 THEN
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_lines) AS e
      WHERE jsonb_typeof(e) <> 'object'
         OR (e->>'run_id') IS DISTINCT FROM p_run_id::text
    ) THEN
      RAISE EXCEPTION 'Every line must belong to this salary sheet.' USING ERRCODE = '22023';
    END IF;

    SELECT string_agg(DISTINCT k, ', ') INTO v_bad
    FROM jsonb_array_elements(p_lines) AS e, jsonb_object_keys(e) AS k
    WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'admin_salary_month_lines'
        AND c.column_name = k
    );
    IF v_bad IS NOT NULL THEN
      RAISE EXCEPTION 'Unexpected salary line field(s): %', v_bad USING ERRCODE = '42703';
    END IF;

    SELECT string_agg(DISTINCT quote_ident(k), ', ') INTO v_cols
    FROM jsonb_array_elements(p_lines) AS e, jsonb_object_keys(e) AS k;

    EXECUTE format(
      'INSERT INTO public.admin_salary_month_lines (%1$s) '
      'SELECT %1$s FROM jsonb_populate_recordset(NULL::public.admin_salary_month_lines, $1)',
      v_cols
    ) USING p_lines;
  END IF;

  -- 4. Revision log entry for this reprocess.
  IF p_revision IS NOT NULL THEN
    INSERT INTO public.admin_salary_run_revisions (run_id, revision_no, changed_by, change_summary_json)
    VALUES (
      p_run_id,
      (p_revision->>'revision_no')::integer,
      NULLIF(p_revision->>'changed_by', '')::uuid,
      COALESCE(p_revision->'change_summary_json', '{}'::jsonb)
    );
  END IF;

  RETURN v_run;
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_salary_reprocess_month_run(uuid, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_salary_reprocess_month_run(uuid, jsonb, jsonb, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_salary_reprocess_month_run(uuid, jsonb, jsonb, jsonb) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
