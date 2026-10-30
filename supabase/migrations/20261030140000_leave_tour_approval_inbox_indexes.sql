-- Leave Approvals + Tour Approvals inbox load performance.
--
-- DATA / LOGIC SAFETY:
--   * Indexes only — no UPDATE / DELETE / INSERT of leave, tour, or employee rows.
--   * No function / trigger / RLS / API / UI changes.
--   * Speeds the existing ORDER BY submitted_at DESC scans used by:
--       GET /api/admin/leave-requests  (leave_requests + admin_leave_requests)
--       GET /api/admin/tour-requests   (tour_requests + admin_tour_requests)
--     plus employee-master lookups used after the page slice.
--
-- Self-contained: defines the helper here so it works even when
-- 20260626130000 was never applied on this database.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION public._create_perf_index_if_exists(
  p_schema text,
  p_table text,
  p_index_name text,
  p_index_ddl text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF to_regclass(format('%I.%I', p_schema, p_table)) IS NULL THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = p_schema AND indexname = p_index_name
  ) THEN
    RETURN;
  END IF;
  BEGIN
    EXECUTE p_index_ddl;
  EXCEPTION
    WHEN undefined_column OR undefined_table THEN
      NULL;
  END;
END;
$$;

-- ---------------------------------------------------------------------------
-- Leave inbox: unfiltered ORDER BY submitted_at DESC (full history dump)
-- Existing status / pending / approved partials do not cover "all statuses".
-- ---------------------------------------------------------------------------
SELECT public._create_perf_index_if_exists(
  'indus_one'::text, 'admin_leave_requests'::text, 'idx_admin_leave_requests_submitted_at'::text,
  $ddl$CREATE INDEX idx_admin_leave_requests_submitted_at
     ON indus_one.admin_leave_requests (submitted_at DESC NULLS LAST)$ddl$::text
);

SELECT public._create_perf_index_if_exists(
  'indus_one'::text, 'leave_requests'::text, 'idx_leave_requests_submitted_at'::text,
  $ddl$CREATE INDEX idx_leave_requests_submitted_at
     ON indus_one.leave_requests (submitted_at DESC NULLS LAST)$ddl$::text
);

-- Enrichment / merge keys used after paging
SELECT public._create_perf_index_if_exists(
  'indus_one'::text, 'leave_requests'::text, 'idx_leave_requests_user_id'::text,
  $ddl$CREATE INDEX idx_leave_requests_user_id
     ON indus_one.leave_requests (user_id)
     WHERE user_id IS NOT NULL$ddl$::text
);

SELECT public._create_perf_index_if_exists(
  'indus_one'::text, 'leave_requests'::text, 'idx_leave_requests_employee_code'::text,
  $ddl$CREATE INDEX idx_leave_requests_employee_code
     ON indus_one.leave_requests (employee_code)
     WHERE employee_code IS NOT NULL AND btrim(employee_code) <> ''$ddl$::text
);

SELECT public._create_perf_index_if_exists(
  'indus_one'::text, 'admin_leave_requests'::text, 'idx_admin_leave_requests_employee_code'::text,
  $ddl$CREATE INDEX idx_admin_leave_requests_employee_code
     ON indus_one.admin_leave_requests (employee_code)
     WHERE employee_code IS NOT NULL AND btrim(employee_code) <> ''$ddl$::text
);

-- ---------------------------------------------------------------------------
-- Tour inbox: same ORDER BY submitted_at DESC pattern (no prior submitted_at index)
-- ---------------------------------------------------------------------------
SELECT public._create_perf_index_if_exists(
  'indus_one'::text, 'admin_tour_requests'::text, 'idx_admin_tour_requests_submitted_at'::text,
  $ddl$CREATE INDEX idx_admin_tour_requests_submitted_at
     ON indus_one.admin_tour_requests (submitted_at DESC NULLS LAST)$ddl$::text
);

SELECT public._create_perf_index_if_exists(
  'indus_one'::text, 'tour_requests'::text, 'idx_tour_requests_submitted_at'::text,
  $ddl$CREATE INDEX idx_tour_requests_submitted_at
     ON indus_one.tour_requests (submitted_at DESC NULLS LAST)$ddl$::text
);

-- Mirror leave status+submitted indexes for tour (inbox + future status filters)
SELECT public._create_perf_index_if_exists(
  'indus_one'::text, 'admin_tour_requests'::text, 'idx_admin_tour_requests_status_submitted'::text,
  $ddl$CREATE INDEX idx_admin_tour_requests_status_submitted
     ON indus_one.admin_tour_requests (status, submitted_at DESC)$ddl$::text
);

SELECT public._create_perf_index_if_exists(
  'indus_one'::text, 'tour_requests'::text, 'idx_tour_requests_status_submitted'::text,
  $ddl$CREATE INDEX idx_tour_requests_status_submitted
     ON indus_one.tour_requests (status, submitted_at DESC)$ddl$::text
);

SELECT public._create_perf_index_if_exists(
  'indus_one'::text, 'admin_tour_requests'::text, 'idx_admin_tour_requests_pending'::text,
  $ddl$CREATE INDEX idx_admin_tour_requests_pending
     ON indus_one.admin_tour_requests (submitted_at DESC)
     WHERE lower(btrim(coalesce(status, ''))) = 'pending'$ddl$::text
);

SELECT public._create_perf_index_if_exists(
  'indus_one'::text, 'tour_requests'::text, 'idx_tour_requests_pending'::text,
  $ddl$CREATE INDEX idx_tour_requests_pending
     ON indus_one.tour_requests (submitted_at DESC)
     WHERE lower(btrim(coalesce(status, ''))) IN ('pending', 'draft', 'submitted', 'pending_approval')$ddl$::text
);

-- Tour enrichment keys
SELECT public._create_perf_index_if_exists(
  'indus_one'::text, 'admin_tour_requests'::text, 'idx_admin_tour_requests_emp_submitted'::text,
  $ddl$CREATE INDEX idx_admin_tour_requests_emp_submitted
     ON indus_one.admin_tour_requests (employee_master_id, submitted_at DESC)$ddl$::text
);

SELECT public._create_perf_index_if_exists(
  'indus_one'::text, 'admin_tour_requests'::text, 'idx_admin_tour_requests_user_submitted'::text,
  $ddl$CREATE INDEX idx_admin_tour_requests_user_submitted
     ON indus_one.admin_tour_requests (user_id, submitted_at DESC)
     WHERE user_id IS NOT NULL$ddl$::text
);

SELECT public._create_perf_index_if_exists(
  'indus_one'::text, 'tour_requests'::text, 'idx_tour_requests_user_id'::text,
  $ddl$CREATE INDEX idx_tour_requests_user_id
     ON indus_one.tour_requests (user_id)
     WHERE user_id IS NOT NULL$ddl$::text
);

SELECT public._create_perf_index_if_exists(
  'indus_one'::text, 'tour_requests'::text, 'idx_tour_requests_employee_code'::text,
  $ddl$CREATE INDEX idx_tour_requests_employee_code
     ON indus_one.tour_requests (employee_code)
     WHERE employee_code IS NOT NULL AND btrim(employee_code) <> ''$ddl$::text
);

SELECT public._create_perf_index_if_exists(
  'indus_one'::text, 'admin_tour_requests'::text, 'idx_admin_tour_requests_employee_code'::text,
  $ddl$CREATE INDEX idx_admin_tour_requests_employee_code
     ON indus_one.admin_tour_requests (employee_code)
     WHERE employee_code IS NOT NULL AND btrim(employee_code) <> ''$ddl$::text
);

-- ---------------------------------------------------------------------------
-- Employee master — dept filter options + name/code/id search on both pages
-- ---------------------------------------------------------------------------
SELECT public._create_perf_index_if_exists(
  'public'::text, 'admin_ifsp_employee_master'::text, 'idx_employee_master_department'::text,
  $ddl$CREATE INDEX idx_employee_master_department
     ON public.admin_ifsp_employee_master (department)
     WHERE department IS NOT NULL AND btrim(department) <> ''$ddl$::text
);

SELECT public._create_perf_index_if_exists(
  'public'::text, 'admin_ifsp_employee_master'::text, 'idx_employee_master_employee_id_trgm'::text,
  $ddl$CREATE INDEX idx_employee_master_employee_id_trgm
     ON public.admin_ifsp_employee_master USING gin ((employee_id::text) gin_trgm_ops)$ddl$::text
);

-- Refresh planner stats for the hot tables (no row changes).
DO $$
BEGIN
  IF to_regclass('indus_one.admin_leave_requests') IS NOT NULL THEN
    EXECUTE 'ANALYZE indus_one.admin_leave_requests';
  END IF;
  IF to_regclass('indus_one.leave_requests') IS NOT NULL THEN
    EXECUTE 'ANALYZE indus_one.leave_requests';
  END IF;
  IF to_regclass('indus_one.admin_tour_requests') IS NOT NULL THEN
    EXECUTE 'ANALYZE indus_one.admin_tour_requests';
  END IF;
  IF to_regclass('indus_one.tour_requests') IS NOT NULL THEN
    EXECUTE 'ANALYZE indus_one.tour_requests';
  END IF;
  IF to_regclass('public.admin_ifsp_employee_master') IS NOT NULL THEN
    EXECUTE 'ANALYZE public.admin_ifsp_employee_master';
  END IF;
END;
$$;
