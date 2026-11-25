-- =============================================================================
-- Restore Weekly Off (and thus C/O + POD-on-WO) for Dahej-HR only.
--
-- Root cause: employee- and/or department-scoped wo.pattern = "none" made Sundays
-- ordinary working days. P / P(OD) on those days no longer hit an earning day,
-- auto WO was cleared, and POD-on-WO no longer appeared as work-on-weekoff.
--
-- Scope (nothing else):
--   * Employee Master department spelling → Dahej-HR (Dahej HR variants only)
--   * Clear wo.pattern = none for Dahej-HR department + Dahej-HR employees only
--   * admin_rule_norm_department alias: "dahej hr" → "dahej-hr" only
--   * Catch up missing C/O credits for Dahej-HR register days only
--
-- C/O safety:
--   * Never inserts a credit when any ledger row already exists for that
--     employee + earned_date (available / partial / consumed / expired / revoked)
--   * Never updates consumed_amount, remaining, or status on existing credits
--   * Does not call global reconcile_comp_off_credits_from_register()
--   * Does not replace C/O engine functions used by other departments
--
-- Does not change Production POD-only rules, sandwich leave, punches, register
-- marks, or any non–Dahej-HR employee / department.
-- Rollback: supabase/rollbacks/20261120190000_dahej_hr_restore_weekly_off_co_pod_down.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Department spelling on Employee Master (Dahej HR variants only)
-- ---------------------------------------------------------------------------
UPDATE public.admin_ifsp_employee_master m
SET department = 'Dahej-HR'
WHERE btrim(coalesce(m.department, '')) IS DISTINCT FROM 'Dahej-HR'
  AND (
    lower(btrim(m.department)) = 'dahej hr'
    OR lower(btrim(m.department)) = 'dahej - hr'
    OR lower(btrim(m.department)) = 'dahej-hr'
  );

-- ---------------------------------------------------------------------------
-- 2) Norm: "Dahej HR" resolves to the same key as "Dahej-HR" (alias only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_rule_norm_department(p_dept text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN n = 'dahej hr' THEN 'dahej-hr'
    ELSE n
  END
  FROM (
    SELECT nullif(
      regexp_replace(
        regexp_replace(lower(btrim(coalesce(p_dept, ''))), '\s+', ' ', 'g'),
        '\s*-\s*', '-', 'g'
      ),
      ''
    ) AS n
  ) s;
$$;

GRANT EXECUTE ON FUNCTION public.admin_rule_norm_department(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) Clear department-scoped "no weekly off" for Dahej-HR only (NULL = inherit)
-- ---------------------------------------------------------------------------
INSERT INTO public.admin_attendance_rule_values (
  rule_key, scope_type, scope_id, scope_label, value, old_value,
  effective_from, reason, status, created_by_name
)
SELECT
  'wo.pattern',
  'department',
  public.admin_rule_norm_department('Dahej-HR'),
  'Dahej-HR',
  NULL,
  v.value,
  date '2026-10-01',
  'Restore Dahej-HR weekly offs (C/O + POD on WO)',
  'active',
  'System'
FROM public.admin_attendance_rule_values v
WHERE v.rule_key = 'wo.pattern'
  AND v.scope_type = 'department'
  AND v.scope_id = public.admin_rule_norm_department('Dahej-HR')
  AND v.status = 'active'
  AND v.value = '"none"'::jsonb
  AND v.effective_from <= date '2026-10-01'
  AND NOT EXISTS (
    SELECT 1
    FROM public.admin_attendance_rule_values x
    WHERE x.rule_key = 'wo.pattern'
      AND x.scope_type = 'department'
      AND x.scope_id = public.admin_rule_norm_department('Dahej-HR')
      AND x.status = 'active'
      AND x.value IS NULL
      AND x.effective_from >= date '2026-10-01'
      AND x.reason = 'Restore Dahej-HR weekly offs (C/O + POD on WO)'
  )
ORDER BY v.effective_from DESC, v.id DESC
LIMIT 1;

INSERT INTO public.admin_attendance_rule_values (
  rule_key, scope_type, scope_id, scope_label, value, old_value,
  effective_from, reason, status, created_by_name
)
SELECT
  'wo.pattern',
  'department',
  public.admin_rule_norm_department('Dahej-HR'),
  'Dahej-HR',
  NULL,
  v.value,
  v.effective_from,
  'Restore Dahej-HR weekly offs (C/O + POD on WO)',
  'active',
  'System'
FROM public.admin_attendance_rule_values v
WHERE v.rule_key = 'wo.pattern'
  AND v.scope_type = 'department'
  AND v.scope_id = public.admin_rule_norm_department('Dahej-HR')
  AND v.status = 'active'
  AND v.value = '"none"'::jsonb
  AND v.effective_from > date '2026-10-01'
  AND NOT EXISTS (
    SELECT 1
    FROM public.admin_attendance_rule_values x
    WHERE x.rule_key = 'wo.pattern'
      AND x.scope_type = 'department'
      AND x.scope_id = v.scope_id
      AND x.status = 'active'
      AND x.value IS NULL
      AND x.effective_from >= v.effective_from
      AND x.reason = 'Restore Dahej-HR weekly offs (C/O + POD on WO)'
  )
ORDER BY v.effective_from DESC, v.id DESC
LIMIT 1;

-- ---------------------------------------------------------------------------
-- 4) Clear employee-scoped none for current Dahej-HR staff only
-- ---------------------------------------------------------------------------
INSERT INTO public.admin_attendance_rule_values (
  rule_key, scope_type, scope_id, scope_label, value, old_value,
  effective_from, reason, status, created_by_name
)
SELECT DISTINCT ON (public.admin_rule_norm_employee(m.employee_code))
  'wo.pattern',
  'employee',
  public.admin_rule_norm_employee(m.employee_code),
  coalesce(nullif(btrim(m.full_name), ''), public.admin_rule_norm_employee(m.employee_code))
    || ' (' || public.admin_rule_norm_employee(m.employee_code) || ')',
  NULL,
  v.value,
  date '2026-10-01',
  'Restore Dahej-HR weekly offs (C/O + POD on WO)',
  'active',
  'System'
FROM public.admin_ifsp_employee_master m
JOIN public.admin_attendance_rule_values v
  ON v.rule_key = 'wo.pattern'
 AND v.scope_type = 'employee'
 AND v.status = 'active'
 AND v.value = '"none"'::jsonb
 AND public.norm_emp_code(v.scope_id) = public.norm_emp_code(m.employee_code)
WHERE public.admin_rule_norm_department(m.department)
    = public.admin_rule_norm_department('Dahej-HR')
  AND NOT EXISTS (
    SELECT 1
    FROM public.admin_attendance_rule_values x
    WHERE x.rule_key = 'wo.pattern'
      AND x.scope_type = 'employee'
      AND public.norm_emp_code(x.scope_id) = public.norm_emp_code(m.employee_code)
      AND x.status = 'active'
      AND x.value IS NULL
      AND x.effective_from >= date '2026-10-01'
      AND x.reason = 'Restore Dahej-HR weekly offs (C/O + POD on WO)'
  )
ORDER BY public.admin_rule_norm_employee(m.employee_code), v.effective_from DESC, v.id DESC;

-- ---------------------------------------------------------------------------
-- 5) Dahej-HR only: insert missing C/O credits for eligible register days.
--    Skip any employee+date that already has a credit row (used or unused).
-- ---------------------------------------------------------------------------
WITH dahej AS (
  SELECT DISTINCT
    public.admin_rule_norm_employee(m.employee_code) AS emp,
    m.employee_code AS raw_code
  FROM public.admin_ifsp_employee_master m
  WHERE public.admin_rule_norm_department(m.department)
      = public.admin_rule_norm_department('Dahej-HR')
    AND public.admin_rule_norm_employee(m.employee_code) IS NOT NULL
),
candidates AS (
  SELECT
    d.emp AS employee_code,
    r.register_date AS earned_date,
    r.id AS source_register_id,
    CASE
      WHEN indus_one.comp_off_normalize_mark(r.mark) = 'P(OD)' THEN 'register_pod'
      ELSE 'register_p'
    END AS source_type,
    CASE
      WHEN indus_one.comp_off_is_present_mark(indus_one.comp_off_normalize_mark(r.mark))
           AND indus_one.comp_off_is_earning_day(r.register_date, NULL, d.emp)
        THEN indus_one.comp_off_normalize_mark(r.mark)
      WHEN indus_one.comp_off_normalize_mark(r.mark) IN ('WO', 'NH/PH', 'NHPH')
           AND indus_one.comp_off_employee_has_punch(d.emp, r.register_date)
        THEN 'P'
      ELSE NULL
    END AS earn_mark
  FROM dahej d
  JOIN public.admin_attendance_register r
    ON public.norm_emp_code(r.employee_code) = public.norm_emp_code(d.raw_code)
   AND r.register_date >= greatest(indus_one.comp_off_cutoff_date(), date '2026-10-01')
)
INSERT INTO indus_one.comp_off_credits (
  employee_code,
  earned_date,
  source_type,
  source_register_id,
  source_key,
  credit_amount,
  consumed_amount,
  expiry_date,
  status
)
SELECT
  c.employee_code,
  c.earned_date,
  c.source_type,
  c.source_register_id,
  c.employee_code || '|' || c.earned_date::text,
  1,
  0,
  indus_one.comp_off_expiry_for_earned(c.earned_date),
  'available'
FROM candidates c
WHERE c.earn_mark IS NOT NULL
  AND public.admin_rule_earns_co(c.employee_code, c.earned_date)
  -- Any existing ledger row for that day (available / partial / consumed /
  -- expired / revoked, any consumed_amount) → leave balance untouched.
  AND NOT EXISTS (
    SELECT 1
    FROM indus_one.comp_off_credits x
    WHERE indus_one.comp_off_norm_emp(x.employee_code) = c.employee_code
      AND x.earned_date = c.earned_date
  )
ON CONFLICT (employee_code, earned_date) DO NOTHING;

NOTIFY pgrst, 'reload schema';
