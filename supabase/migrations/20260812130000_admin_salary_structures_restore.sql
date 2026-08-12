-- =============================================================================
-- Restore Salary CTC structure tables (dropped during processing rewire).
-- Safe to re-run: CREATE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.admin_salary_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Keep allowlist in sync (includes vaisakh)
CREATE OR REPLACE FUNCTION public.admin_salary_user_has_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $salary_access$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND lower(btrim(coalesce(p.email, ''))) IN (
        'rahul.ifspl@gmail.com',
        'bency@indusfire.com',
        'latha@indusfire.com',
        'vaisakh@indusfire.com'
      )
  )
  OR lower(btrim(coalesce(auth.jwt() ->> 'email', ''))) IN (
    'rahul.ifspl@gmail.com',
    'bency@indusfire.com',
    'latha@indusfire.com',
    'vaisakh@indusfire.com'
  );
$salary_access$;

GRANT EXECUTE ON FUNCTION public.admin_salary_user_has_access() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_salary_set_updated_at() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Current CTC structure
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_salary_structures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_master_id bigint NOT NULL
    REFERENCES public.admin_ifsp_employee_master(id) ON DELETE CASCADE,

  employee_level text NOT NULL DEFAULT 'office'
    CHECK (employee_level IN ('office', 'helper')),
  basic_mode text NOT NULL DEFAULT 'auto'
    CHECK (basic_mode IN ('auto', 'custom')),
  hra_mode text NOT NULL DEFAULT 'percent_40'
    CHECK (hra_mode IN ('percent_40', 'custom', 'auto')),
  emp_esic_mode text NOT NULL DEFAULT 'auto'
    CHECK (emp_esic_mode IN ('auto', 'custom')),
  er_esic_mode text NOT NULL DEFAULT 'auto'
    CHECK (er_esic_mode IN ('auto', 'custom')),
  leave_encash_mode text NOT NULL DEFAULT 'auto'
    CHECK (leave_encash_mode IN ('auto', 'custom')),
  gratuity_mode text NOT NULL DEFAULT 'auto'
    CHECK (gratuity_mode IN ('auto', 'custom')),

  gross_monthly numeric(14,2),
  basic_monthly numeric(14,2),
  hra_monthly numeric(14,2),
  special_allowance_monthly numeric(14,2),

  emp_pf_monthly numeric(14,2),
  pt_monthly numeric(14,2),
  emp_esic_monthly numeric(14,2),
  emp_esic_applicable boolean NOT NULL DEFAULT false,
  take_home_monthly numeric(14,2),

  esic_enabled boolean NOT NULL DEFAULT true,
  esic_ceiling numeric(14,2) NOT NULL DEFAULT 41999,
  esic_emp_rate_pct numeric(8,4) NOT NULL DEFAULT 0.75,
  esic_er_rate_pct numeric(8,4) NOT NULL DEFAULT 3.25,
  esic_eligible boolean NOT NULL DEFAULT false,

  er_pf_monthly numeric(14,2),
  er_esic_monthly numeric(14,2),
  er_esic_applicable boolean NOT NULL DEFAULT false,
  gratuity_monthly numeric(14,2),
  leave_encash_monthly numeric(14,2),
  mediclaim_enabled boolean NOT NULL DEFAULT false,
  mediclaim_monthly numeric(14,2),
  lic_enabled boolean NOT NULL DEFAULT false,
  lic_monthly numeric(14,2),
  special_perf_bonus_enabled boolean NOT NULL DEFAULT false,
  special_perf_bonus_monthly numeric(14,2),
  bonus_monthly numeric(14,2),
  total_b_monthly numeric(14,2),

  ctc_monthly numeric(14,2),
  ctc_annual numeric(14,2),

  declared boolean NOT NULL DEFAULT false,
  wef_date date,
  revision_reason text,
  revision_count integer NOT NULL DEFAULT 0,

  date_of_birth date,
  date_of_joining date,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT admin_salary_structures_pub_employee_unique UNIQUE (employee_master_id)
);

-- Columns that may be missing if an older partial create already exists
ALTER TABLE public.admin_salary_structures
  ADD COLUMN IF NOT EXISTS gratuity_mode text NOT NULL DEFAULT 'auto';
ALTER TABLE public.admin_salary_structures
  ADD COLUMN IF NOT EXISTS special_perf_bonus_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.admin_salary_structures
  ADD COLUMN IF NOT EXISTS special_perf_bonus_monthly numeric(14,2);

CREATE INDEX IF NOT EXISTS idx_admin_salary_structures_pub_declared
  ON public.admin_salary_structures (declared)
  WHERE declared = true;

CREATE INDEX IF NOT EXISTS idx_admin_salary_structures_pub_wef
  ON public.admin_salary_structures (wef_date DESC NULLS LAST);

DROP TRIGGER IF EXISTS trg_admin_salary_structures_pub_updated_at ON public.admin_salary_structures;
CREATE TRIGGER trg_admin_salary_structures_pub_updated_at
  BEFORE UPDATE ON public.admin_salary_structures
  FOR EACH ROW EXECUTE FUNCTION public.admin_salary_set_updated_at();

COMMENT ON TABLE public.admin_salary_structures IS
  'Salary Master current CTC per employee (public API table).';

-- ---------------------------------------------------------------------------
-- Revisions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_salary_structure_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL
    REFERENCES public.admin_salary_structures(id) ON DELETE CASCADE,
  employee_master_id bigint NOT NULL
    REFERENCES public.admin_ifsp_employee_master(id) ON DELETE CASCADE,

  revision_no integer NOT NULL,
  revised_at timestamptz NOT NULL DEFAULT now(),
  wef_date date,
  revision_reason text,
  superseded_wef date,

  employee_level text,
  basic_mode text,
  hra_mode text,
  emp_esic_mode text,
  er_esic_mode text,
  leave_encash_mode text,
  gratuity_mode text,
  gross_monthly numeric(14,2),
  basic_monthly numeric(14,2),
  hra_monthly numeric(14,2),
  special_allowance_monthly numeric(14,2),
  emp_pf_monthly numeric(14,2),
  pt_monthly numeric(14,2),
  emp_esic_monthly numeric(14,2),
  emp_esic_applicable boolean,
  take_home_monthly numeric(14,2),
  esic_enabled boolean,
  esic_ceiling numeric(14,2),
  esic_emp_rate_pct numeric(8,4),
  esic_er_rate_pct numeric(8,4),
  esic_eligible boolean,
  er_pf_monthly numeric(14,2),
  er_esic_monthly numeric(14,2),
  er_esic_applicable boolean,
  gratuity_monthly numeric(14,2),
  leave_encash_monthly numeric(14,2),
  mediclaim_enabled boolean,
  mediclaim_monthly numeric(14,2),
  lic_enabled boolean,
  lic_monthly numeric(14,2),
  special_perf_bonus_enabled boolean,
  special_perf_bonus_monthly numeric(14,2),
  bonus_monthly numeric(14,2),
  total_b_monthly numeric(14,2),
  ctc_monthly numeric(14,2),
  ctc_annual numeric(14,2),
  declared boolean,
  date_of_birth date,
  date_of_joining date,
  snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT admin_salary_structure_revisions_pub_unique
    UNIQUE (employee_master_id, revision_no)
);

ALTER TABLE public.admin_salary_structure_revisions
  ADD COLUMN IF NOT EXISTS gratuity_mode text;
ALTER TABLE public.admin_salary_structure_revisions
  ADD COLUMN IF NOT EXISTS special_perf_bonus_enabled boolean;
ALTER TABLE public.admin_salary_structure_revisions
  ADD COLUMN IF NOT EXISTS special_perf_bonus_monthly numeric(14,2);

CREATE INDEX IF NOT EXISTS idx_admin_salary_revisions_pub_employee
  ON public.admin_salary_structure_revisions (employee_master_id, revised_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_salary_revisions_pub_structure
  ON public.admin_salary_structure_revisions (structure_id, revision_no DESC);

-- ---------------------------------------------------------------------------
-- Grants + RLS
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_salary_structures TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_salary_structure_revisions TO authenticated, service_role;

ALTER TABLE public.admin_salary_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_salary_structure_revisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_salary_structures_pub_all ON public.admin_salary_structures;
CREATE POLICY admin_salary_structures_pub_all ON public.admin_salary_structures
  FOR ALL TO authenticated
  USING (public.admin_salary_user_has_access())
  WITH CHECK (public.admin_salary_user_has_access());

DROP POLICY IF EXISTS admin_salary_structure_revisions_pub_all ON public.admin_salary_structure_revisions;
CREATE POLICY admin_salary_structure_revisions_pub_all ON public.admin_salary_structure_revisions
  FOR ALL TO authenticated
  USING (public.admin_salary_user_has_access())
  WITH CHECK (public.admin_salary_user_has_access());
