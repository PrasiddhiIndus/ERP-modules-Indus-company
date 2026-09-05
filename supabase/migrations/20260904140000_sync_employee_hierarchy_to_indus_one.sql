-- Sync Employee Master L1/L2 → public.profiles + open Indus One leave/tour requests.
-- Source of truth for ops: admin_ifsp_employee_master.l1_manager_code / l2_manager_code.
-- Does not rewrite finalized (approved/rejected) requests.

-- ---------------------------------------------------------------------------
-- Ensure columns exist (Indus One LMS may already have them)
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS l1_manager_code text,
  ADD COLUMN IF NOT EXISTS l2_manager_code text;

DO $$
BEGIN
  IF to_regclass('indus_one.admin_leave_requests') IS NOT NULL THEN
    ALTER TABLE indus_one.admin_leave_requests
      ADD COLUMN IF NOT EXISTS l1_manager_code text,
      ADD COLUMN IF NOT EXISTS l2_manager_code text,
      ADD COLUMN IF NOT EXISTS l1_status text,
      ADD COLUMN IF NOT EXISTS l2_status text,
      ADD COLUMN IF NOT EXISTS overall_status text,
      ADD COLUMN IF NOT EXISTS employee_code text;
  END IF;

  IF to_regclass('indus_one.admin_tour_requests') IS NOT NULL THEN
    ALTER TABLE indus_one.admin_tour_requests
      ADD COLUMN IF NOT EXISTS l1_manager_code text,
      ADD COLUMN IF NOT EXISTS l2_manager_code text,
      ADD COLUMN IF NOT EXISTS l1_status text,
      ADD COLUMN IF NOT EXISTS l2_status text,
      ADD COLUMN IF NOT EXISTS overall_status text,
      ADD COLUMN IF NOT EXISTS employee_code text;
  END IF;

  IF to_regclass('indus_one.leave_requests') IS NOT NULL THEN
    ALTER TABLE indus_one.leave_requests
      ADD COLUMN IF NOT EXISTS l1_manager_code text,
      ADD COLUMN IF NOT EXISTS l2_manager_code text,
      ADD COLUMN IF NOT EXISTS l1_status text,
      ADD COLUMN IF NOT EXISTS l2_status text,
      ADD COLUMN IF NOT EXISTS overall_status text,
      ADD COLUMN IF NOT EXISTS employee_code text;
  END IF;

  IF to_regclass('indus_one.tour_requests') IS NOT NULL THEN
    ALTER TABLE indus_one.tour_requests
      ADD COLUMN IF NOT EXISTS l1_manager_code text,
      ADD COLUMN IF NOT EXISTS l2_manager_code text,
      ADD COLUMN IF NOT EXISTS l1_status text,
      ADD COLUMN IF NOT EXISTS l2_status text,
      ADD COLUMN IF NOT EXISTS overall_status text,
      ADD COLUMN IF NOT EXISTS employee_code text;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.nullif_trim_text(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT nullif(btrim(coalesce(p, '')), '');
$$;

CREATE OR REPLACE FUNCTION public.hierarchy_request_awaiting_l1(
  p_overall_status text,
  p_status text,
  p_l1_status text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    -- Never touch finalized workflow rows
    upper(btrim(coalesce(p_status, ''))) NOT IN ('APPROVED', 'REJECTED', 'CANCELLED', 'WITHDRAWN')
    AND upper(btrim(coalesce(p_overall_status, ''))) NOT IN ('APPROVED', 'REJECTED', 'CANCELLED', 'WITHDRAWN')
    AND upper(btrim(coalesce(nullif(btrim(coalesce(p_overall_status, '')), ''), coalesce(p_status, ''))))
      IN ('PENDING', 'L1_APPROVED', 'L2_APPROVED')
    AND upper(btrim(coalesce(nullif(btrim(coalesce(p_l1_status, '')), ''), 'PENDING')))
      IN ('PENDING');
$$;

COMMENT ON FUNCTION public.hierarchy_request_awaiting_l1(text, text, text) IS
  'True when a leave/tour request is still waiting on L1. Does not match finalized rows.';

-- ---------------------------------------------------------------------------
-- Core sync (SECURITY DEFINER — bypasses RLS)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_employee_hierarchy_to_indus_one(
  p_employee_code text,
  p_l1_manager_code text,
  p_l2_manager_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, indus_one
SET row_security = off
AS $$
DECLARE
  v_code text := public.norm_emp_code(p_employee_code);
  v_l1 text := public.nullif_trim_text(p_l1_manager_code);
  v_l2 text := public.nullif_trim_text(p_l2_manager_code);
  v_profiles int := 0;
  v_leave int := 0;
  v_tour int := 0;
  v_lms_leave int := 0;
  v_lms_tour int := 0;
  v_has_employee_code boolean;
  v_has_emp_code boolean;
  v_sql text;
BEGIN
  IF v_code IS NULL OR v_code = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_employee_code');
  END IF;

  -- 1) Profiles mirror — manager codes only (no role/modules/status changes)
  UPDATE public.profiles p
  SET
    l1_manager_code = v_l1,
    l2_manager_code = v_l2
  WHERE public.norm_emp_code(p.employee_code) = v_code;
  GET DIAGNOSTICS v_profiles = ROW_COUNT;

  -- 2) Open admin leave requests still awaiting L1
  IF to_regclass('indus_one.admin_leave_requests') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'indus_one' AND table_name = 'admin_leave_requests' AND column_name = 'employee_code'
    ) INTO v_has_employee_code;
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'indus_one' AND table_name = 'admin_leave_requests' AND column_name = 'emp_code'
    ) INTO v_has_emp_code;

    BEGIN
      v_sql := $q$
        UPDATE indus_one.admin_leave_requests r
        SET l1_manager_code = $1, l2_manager_code = $2, updated_at = now()
        WHERE public.hierarchy_request_awaiting_l1(r.overall_status, r.status, r.l1_status)
          AND (
      $q$;
      IF v_has_employee_code AND v_has_emp_code THEN
        v_sql := v_sql || $q$ public.norm_emp_code(coalesce(r.employee_code, r.emp_code)) = $3 $q$;
      ELSIF v_has_employee_code THEN
        v_sql := v_sql || $q$ public.norm_emp_code(r.employee_code) = $3 $q$;
      ELSIF v_has_emp_code THEN
        v_sql := v_sql || $q$ public.norm_emp_code(r.emp_code) = $3 $q$;
      ELSE
        v_sql := v_sql || $q$ false $q$;
      END IF;
      v_sql := v_sql || $q$
            OR EXISTS (
              SELECT 1 FROM public.admin_ifsp_employee_master m
              WHERE m.id = r.employee_master_id
                AND public.norm_emp_code(m.employee_code) = $3
            )
          )
      $q$;
      EXECUTE v_sql USING v_l1, v_l2, v_code;
      GET DIAGNOSTICS v_leave = ROW_COUNT;
    EXCEPTION
      WHEN undefined_column THEN
        -- Retry without updated_at
        BEGIN
          v_sql := replace(v_sql, ', updated_at = now()', '');
          EXECUTE v_sql USING v_l1, v_l2, v_code;
          GET DIAGNOSTICS v_leave = ROW_COUNT;
        EXCEPTION
          WHEN OTHERS THEN
            RAISE NOTICE 'admin_leave_requests hierarchy sync skipped: %', SQLERRM;
        END;
      WHEN OTHERS THEN
        RAISE NOTICE 'admin_leave_requests hierarchy sync skipped: %', SQLERRM;
    END;
  END IF;

  -- 3) Open admin tour requests still awaiting L1
  IF to_regclass('indus_one.admin_tour_requests') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'indus_one' AND table_name = 'admin_tour_requests' AND column_name = 'employee_code'
    ) INTO v_has_employee_code;
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'indus_one' AND table_name = 'admin_tour_requests' AND column_name = 'emp_code'
    ) INTO v_has_emp_code;

    BEGIN
      v_sql := $q$
        UPDATE indus_one.admin_tour_requests r
        SET l1_manager_code = $1, l2_manager_code = $2
        WHERE public.hierarchy_request_awaiting_l1(r.overall_status, r.status, r.l1_status)
          AND 
      $q$;
      IF v_has_employee_code AND v_has_emp_code THEN
        v_sql := v_sql || $q$ public.norm_emp_code(coalesce(r.employee_code, r.emp_code)) = $3 $q$;
      ELSIF v_has_employee_code THEN
        v_sql := v_sql || $q$ public.norm_emp_code(r.employee_code) = $3 $q$;
      ELSIF v_has_emp_code THEN
        v_sql := v_sql || $q$ public.norm_emp_code(r.emp_code) = $3 $q$;
      ELSE
        v_sql := v_sql || $q$ false $q$;
      END IF;
      EXECUTE v_sql USING v_l1, v_l2, v_code;
      GET DIAGNOSTICS v_tour = ROW_COUNT;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE 'admin_tour_requests hierarchy sync skipped: %', SQLERRM;
    END;
  END IF;

  -- 4) LMS leave_requests (if present)
  IF to_regclass('indus_one.leave_requests') IS NOT NULL THEN
    BEGIN
      UPDATE indus_one.leave_requests r
      SET
        l1_manager_code = v_l1,
        l2_manager_code = v_l2
      WHERE public.hierarchy_request_awaiting_l1(r.overall_status, r.status, r.l1_status)
        AND public.norm_emp_code(r.employee_code) = v_code;
      GET DIAGNOSTICS v_lms_leave = ROW_COUNT;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE 'leave_requests hierarchy sync skipped: %', SQLERRM;
    END;
  END IF;

  -- 5) LMS tour_requests (if present)
  IF to_regclass('indus_one.tour_requests') IS NOT NULL THEN
    BEGIN
      UPDATE indus_one.tour_requests r
      SET
        l1_manager_code = v_l1,
        l2_manager_code = v_l2
      WHERE public.hierarchy_request_awaiting_l1(r.overall_status, r.status, r.l1_status)
        AND public.norm_emp_code(r.employee_code) = v_code;
      GET DIAGNOSTICS v_lms_tour = ROW_COUNT;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE 'tour_requests hierarchy sync skipped: %', SQLERRM;
    END;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'employee_code', v_code,
    'l1_manager_code', v_l1,
    'l2_manager_code', v_l2,
    'profiles_updated', v_profiles,
    'admin_leave_updated', v_leave,
    'admin_tour_updated', v_tour,
    'lms_leave_updated', v_lms_leave,
    'lms_tour_updated', v_lms_tour
  );
END;
$$;

COMMENT ON FUNCTION public.sync_employee_hierarchy_to_indus_one(text, text, text) IS
  'Push Employee Master L1/L2 onto profiles and open (awaiting L1) leave/tour requests.';

GRANT EXECUTE ON FUNCTION public.sync_employee_hierarchy_to_indus_one(text, text, text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Trigger on Employee Master
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_sync_employee_hierarchy_to_indus_one()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, indus_one
SET row_security = off
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.l1_manager_code IS NOT DISTINCT FROM OLD.l1_manager_code
       AND NEW.l2_manager_code IS NOT DISTINCT FROM OLD.l2_manager_code
       AND NEW.employee_code IS NOT DISTINCT FROM OLD.employee_code THEN
      RETURN NEW;
    END IF;
  END IF;

  IF btrim(coalesce(NEW.employee_code, '')) = '' THEN
    RETURN NEW;
  END IF;

  PERFORM public.sync_employee_hierarchy_to_indus_one(
    NEW.employee_code,
    NEW.l1_manager_code,
    NEW.l2_manager_code
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'sync_employee_hierarchy_to_indus_one failed for %: %', NEW.employee_code, SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_employee_master_sync_hierarchy_indus_one
  ON public.admin_ifsp_employee_master;

CREATE TRIGGER trg_employee_master_sync_hierarchy_indus_one
  AFTER INSERT OR UPDATE OF l1_manager_code, l2_manager_code, employee_code
  ON public.admin_ifsp_employee_master
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sync_employee_hierarchy_to_indus_one();

-- ---------------------------------------------------------------------------
-- One-time repair for known stale pending rows (8962 / V-00002 → master's L1)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT
      m.employee_code,
      m.l1_manager_code,
      m.l2_manager_code
    FROM public.admin_ifsp_employee_master m
    WHERE public.norm_emp_code(m.employee_code) IN (
      public.norm_emp_code('8962'),
      public.norm_emp_code('V-00002')
    )
  LOOP
    BEGIN
      PERFORM public.sync_employee_hierarchy_to_indus_one(
        r.employee_code,
        r.l1_manager_code,
        r.l2_manager_code
      );
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE 'One-time hierarchy repair skipped for %: %', r.employee_code, SQLERRM;
    END;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
