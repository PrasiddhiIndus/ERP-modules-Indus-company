-- =============================================================================
-- Salary Processing: lock a processed month (QA defect D-03).
--
-- A locked month cannot be reprocessed, edited, published or deleted until it
-- is unlocked with a reason. Viewing, exporting and printing stay allowed, and
-- processing a brand-new month is unaffected.
--
-- Additive only:
--   * six nullable columns on admin_salary_month_runs (existing months stay unlocked)
--   * guard triggers on admin_salary_month_runs and admin_salary_month_lines
--   * two functions: admin_salary_lock_month_run, admin_salary_unlock_month_run
-- Lock / unlock run as the signed-in user (SECURITY INVOKER) and additionally
-- require the existing Salary Admin allowlist (admin_salary_user_has_access()).
-- Every lock / unlock is also appended to summary_json.lock_history, which other
-- writes cannot change or remove.
--
-- Rollback (removes the lock feature; lock state and lock columns are lost):
--   DROP TRIGGER IF EXISTS trg_admin_salary_month_lines_lock_guard ON public.admin_salary_month_lines;
--   DROP TRIGGER IF EXISTS trg_admin_salary_month_runs_lock_guard ON public.admin_salary_month_runs;
--   DROP FUNCTION IF EXISTS public.admin_salary_unlock_month_run(uuid, text);
--   DROP FUNCTION IF EXISTS public.admin_salary_lock_month_run(uuid);
--   DROP FUNCTION IF EXISTS public.admin_salary_month_line_lock_guard();
--   DROP FUNCTION IF EXISTS public.admin_salary_month_run_lock_guard();
--   ALTER TABLE public.admin_salary_month_runs
--     DROP COLUMN IF EXISTS unlocked_at,
--     DROP COLUMN IF EXISTS unlocked_by,
--     DROP COLUMN IF EXISTS unlock_reason,
--     DROP COLUMN IF EXISTS locked_at,
--     DROP COLUMN IF EXISTS locked_by,
--     DROP COLUMN IF EXISTS is_locked;
--   NOTIFY pgrst, 'reload schema';
-- =============================================================================

ALTER TABLE public.admin_salary_month_runs
  ADD COLUMN IF NOT EXISTS is_locked boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS locked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS unlock_reason text,
  ADD COLUMN IF NOT EXISTS unlocked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unlocked_at timestamptz;

-- ---------------------------------------------------------------------------
-- Guard: month run
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_salary_month_run_lock_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_action text := COALESCE(current_setting('admin_salary.lock_action', true), '');
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF COALESCE(OLD.is_locked, false) THEN
      RAISE EXCEPTION 'This salary month is locked. Unlock it to make changes.'
        USING ERRCODE = 'P0001', HINT = 'salary_month_locked';
    END IF;
    RETURN OLD;
  END IF;

  IF v_action = '' AND (
       NEW.is_locked IS DISTINCT FROM OLD.is_locked
    OR NEW.locked_by IS DISTINCT FROM OLD.locked_by
    OR NEW.locked_at IS DISTINCT FROM OLD.locked_at
    OR NEW.unlock_reason IS DISTINCT FROM OLD.unlock_reason
    OR NEW.unlocked_by IS DISTINCT FROM OLD.unlocked_by
    OR NEW.unlocked_at IS DISTINCT FROM OLD.unlocked_at
  ) THEN
    RAISE EXCEPTION 'Use Lock month or Unlock month to change the lock.'
      USING ERRCODE = 'P0001', HINT = 'salary_month_lock_columns';
  END IF;

  IF COALESCE(OLD.is_locked, false) AND v_action <> 'unlock' THEN
    RAISE EXCEPTION 'This salary month is locked. Unlock it to make changes.'
      USING ERRCODE = 'P0001', HINT = 'salary_month_locked';
  END IF;

  -- The lock trail is written only by lock / unlock; other writes (e.g. a full
  -- reprocess that rebuilds summary_json) keep it unchanged.
  IF v_action = '' THEN
    IF COALESCE(OLD.summary_json, '{}'::jsonb) ? 'lock_history' THEN
      NEW.summary_json := jsonb_set(
        COALESCE(NEW.summary_json, '{}'::jsonb),
        '{lock_history}',
        OLD.summary_json->'lock_history'
      );
    ELSIF COALESCE(NEW.summary_json, '{}'::jsonb) ? 'lock_history' THEN
      NEW.summary_json := NEW.summary_json - 'lock_history';
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_admin_salary_month_runs_lock_guard ON public.admin_salary_month_runs;
CREATE TRIGGER trg_admin_salary_month_runs_lock_guard
  BEFORE UPDATE OR DELETE ON public.admin_salary_month_runs
  FOR EACH ROW EXECUTE FUNCTION public.admin_salary_month_run_lock_guard();

-- ---------------------------------------------------------------------------
-- Guard: month lines (reprocess, edits, slip publishing, deletes)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_salary_month_line_lock_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.admin_salary_month_runs r
    WHERE COALESCE(r.is_locked, false)
      AND (
        (TG_OP IN ('INSERT', 'UPDATE') AND r.id = NEW.run_id)
        OR (TG_OP IN ('UPDATE', 'DELETE') AND r.id = OLD.run_id)
      )
  ) THEN
    RAISE EXCEPTION 'This salary month is locked. Unlock it to make changes.'
      USING ERRCODE = 'P0001', HINT = 'salary_month_locked';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_admin_salary_month_lines_lock_guard ON public.admin_salary_month_lines;
CREATE TRIGGER trg_admin_salary_month_lines_lock_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.admin_salary_month_lines
  FOR EACH ROW EXECUTE FUNCTION public.admin_salary_month_line_lock_guard();

-- ---------------------------------------------------------------------------
-- Lock
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_salary_lock_month_run(p_run_id uuid)
RETURNS public.admin_salary_month_runs
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_run public.admin_salary_month_runs;
BEGIN
  IF NOT public.admin_salary_user_has_access() THEN
    RAISE EXCEPTION 'You do not have access to Salary Admin.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_run FROM public.admin_salary_month_runs WHERE id = p_run_id FOR UPDATE;
  IF v_run.id IS NULL THEN
    RAISE EXCEPTION 'Salary sheet not found.' USING ERRCODE = 'P0002';
  END IF;
  IF COALESCE(v_run.is_locked, false) THEN
    RETURN v_run;
  END IF;
  IF v_run.status <> 'processed' THEN
    RAISE EXCEPTION 'Only a processed salary month can be locked.' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('admin_salary.lock_action', 'lock', true);
  UPDATE public.admin_salary_month_runs
  SET is_locked = true,
      locked_by = auth.uid(),
      locked_at = now(),
      summary_json = jsonb_set(
        COALESCE(summary_json, '{}'::jsonb),
        '{lock_history}',
        COALESCE(summary_json->'lock_history', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
          'action', 'lock',
          'by', auth.uid(),
          'by_email', auth.jwt() ->> 'email',
          'at', now()
        ))
      )
  WHERE id = p_run_id
  RETURNING * INTO v_run;
  PERFORM set_config('admin_salary.lock_action', '', true);

  RETURN v_run;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- Unlock (reason mandatory)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_salary_unlock_month_run(p_run_id uuid, p_reason text)
RETURNS public.admin_salary_month_runs
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_run public.admin_salary_month_runs;
  v_reason text := btrim(COALESCE(p_reason, ''));
BEGIN
  IF NOT public.admin_salary_user_has_access() THEN
    RAISE EXCEPTION 'You do not have access to Salary Admin.' USING ERRCODE = '42501';
  END IF;
  IF length(v_reason) < 5 THEN
    RAISE EXCEPTION 'Enter a reason for unlocking (at least 5 characters).' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_run FROM public.admin_salary_month_runs WHERE id = p_run_id FOR UPDATE;
  IF v_run.id IS NULL THEN
    RAISE EXCEPTION 'Salary sheet not found.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT COALESCE(v_run.is_locked, false) THEN
    RAISE EXCEPTION 'This salary month is not locked.' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('admin_salary.lock_action', 'unlock', true);
  UPDATE public.admin_salary_month_runs
  SET is_locked = false,
      unlock_reason = v_reason,
      unlocked_by = auth.uid(),
      unlocked_at = now(),
      summary_json = jsonb_set(
        COALESCE(summary_json, '{}'::jsonb),
        '{lock_history}',
        COALESCE(summary_json->'lock_history', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
          'action', 'unlock',
          'by', auth.uid(),
          'by_email', auth.jwt() ->> 'email',
          'at', now(),
          'reason', v_reason
        ))
      )
  WHERE id = p_run_id
  RETURNING * INTO v_run;
  PERFORM set_config('admin_salary.lock_action', '', true);

  RETURN v_run;
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_salary_lock_month_run(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_salary_lock_month_run(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.admin_salary_unlock_month_run(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_salary_unlock_month_run(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_salary_lock_month_run(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_salary_unlock_month_run(uuid, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
