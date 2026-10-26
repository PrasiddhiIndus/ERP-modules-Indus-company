-- =============================================================================
-- C/O on weekoff for Production-style departments: P(OD) only (not machine punch).
--
-- Departments (co.sunday_pod_only = Yes):
--   Production, Production - Neotech, Production-FTC, R&M,
--   Projects-FTC, Administration-FTC
--
-- Rule:
--   * These depts: work on WO / NH/PH with machine punch (P / HD) → OT, no C/O.
--     Only P(OD) / tour-as-POD earns C/O.
--   * Other depts: punch or P(OD) on earning day earns C/O when co.earn is on
--     (unchanged).
--
-- Previously the engine only blocked non-POD on *Sunday*. This extends the same
-- block to every C/O earning day for those departments, adds the two FTC depts,
-- revokes incorrect non-POD credits, and re-reconciles so missing valid credits
-- (POD for these depts; punch/POD for others) are granted.
--
-- Does not change: register marks, punches, leave, sandwich, co.earn, 3rd-Sat
-- exclude list, or credits that already have consumed_amount > 0.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Catalogue copy: week-off / holiday, not Sunday-only
-- ---------------------------------------------------------------------------
UPDATE public.admin_attendance_rules
SET
  label = 'Week-off / holiday C/O only for P(OD)',
  description =
    'When Yes: for this department, a machine punch (P / HD) on a weekly off or NH/PH does not earn C/O (treated as OT). Only P(OD) / tour earns C/O. Other departments still earn on punch or P(OD) when Earns C/O is on.',
  engine_ref = 'indus_one.comp_off_sunday_pod_only_employee() ← indus_one.comp_off_try_earn_credit'
WHERE rule_key = 'co.sunday_pod_only';

-- ---------------------------------------------------------------------------
-- 2) Ensure department seeds (existing four + Projects-FTC + Administration-FTC)
-- ---------------------------------------------------------------------------
INSERT INTO public.admin_attendance_rule_values
  (rule_key, scope_type, scope_id, scope_label, value, effective_from, reason, created_by_name, status)
SELECT
  'co.sunday_pod_only',
  'department',
  public.admin_rule_norm_department(d.dept_label),
  d.dept_label,
  'true'::jsonb,
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.admin_attendance_rule_values v
      WHERE v.rule_key = 'co.sunday_pod_only'
        AND v.scope_type = 'department'
        AND v.scope_id = public.admin_rule_norm_department(d.dept_label)
        AND v.status = 'active'
    ) THEN current_date
    ELSE DATE '2000-01-01'
  END,
  'Week-off / holiday C/O only for P(OD) — Production-style departments',
  'System',
  'active'
FROM (
  VALUES
    ('Production'),
    ('Production - Neotech'),
    ('Production-FTC'),
    ('R&M'),
    ('Projects-FTC'),
    ('Administration-FTC')
) AS d(dept_label)
WHERE coalesce(
  (
    SELECT v.value
    FROM public.admin_attendance_rule_values v
    WHERE v.rule_key = 'co.sunday_pod_only'
      AND v.scope_type = 'department'
      AND v.scope_id = public.admin_rule_norm_department(d.dept_label)
      AND v.status = 'active'
      AND v.effective_from <= current_date
    ORDER BY v.effective_from DESC, v.id DESC
    LIMIT 1
  ),
  'false'::jsonb
) IS DISTINCT FROM 'true'::jsonb;

-- ---------------------------------------------------------------------------
-- 3) Engine: POD-only on every earning day for these departments (not Sunday-only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION indus_one.comp_off_try_earn_credit(
  p_employee_code text,
  p_earned_date date,
  p_register_id uuid,
  p_mark text,
  p_prior_mark text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, indus_one
AS $$
DECLARE
  v_code text := indus_one.comp_off_norm_emp(p_employee_code);
  v_mark text := indus_one.comp_off_normalize_mark(p_mark);
  v_source text;
BEGIN
  IF v_code = '' OR p_earned_date IS NULL THEN RETURN; END IF;
  IF p_earned_date < indus_one.comp_off_cutoff_date() THEN RETURN; END IF;
  IF NOT indus_one.comp_off_is_present_mark(v_mark) THEN RETURN; END IF;
  IF NOT public.admin_rule_earns_co(v_code, p_earned_date) THEN RETURN; END IF;
  IF NOT indus_one.comp_off_is_earning_day(p_earned_date, p_prior_mark, v_code) THEN RETURN; END IF;

  -- Production* / R&M / Projects-FTC / Administration-FTC (co.sunday_pod_only):
  -- any earning day (WO / NH/PH / configured weekoff): machine punch P/HD = OT, no C/O.
  -- Only P(OD) earns. Revoke leftover non-POD credit for the day.
  IF indus_one.comp_off_sunday_pod_only_employee(v_code)
     AND v_mark IS DISTINCT FROM 'P(OD)' THEN
    PERFORM indus_one.comp_off_try_revoke_credit(v_code, p_earned_date);
    RETURN;
  END IF;

  v_source := CASE
    WHEN v_mark = 'P(OD)' THEN 'register_pod'
    ELSE 'register_p'
  END;

  INSERT INTO indus_one.comp_off_credits (
    employee_code, earned_date, source_type, source_register_id, source_key,
    credit_amount, expiry_date, status
  )
  VALUES (
    v_code,
    p_earned_date,
    v_source,
    p_register_id,
    v_code || '|' || p_earned_date::text,
    1,
    indus_one.comp_off_expiry_for_earned(p_earned_date),
    'available'
  )
  ON CONFLICT (employee_code, earned_date) DO UPDATE
  SET
    source_register_id = coalesce(excluded.source_register_id, indus_one.comp_off_credits.source_register_id),
    source_type = excluded.source_type,
    source_key = excluded.source_key,
    status = CASE
      WHEN indus_one.comp_off_credits.status = 'revoked'
        AND indus_one.comp_off_credits.consumed_amount = 0
      THEN 'available'
      ELSE indus_one.comp_off_credits.status
    END,
    updated_at = now();
END;
$$;

COMMENT ON FUNCTION indus_one.comp_off_sunday_pod_only_employee(text) IS
  'Week-off / holiday C/O only for P(OD) — departments with co.sunday_pod_only = Yes (Production*, R&M, Projects-FTC, Administration-FTC). Machine punch does not earn.';

COMMENT ON FUNCTION indus_one.comp_off_try_earn_credit(text, date, uuid, text, text) IS
  'Earn C/O when co.earn is on and day qualifies. Pod-only departments: P(OD) only; others: present marks including machine punch.';

-- ---------------------------------------------------------------------------
-- 4) Data repair
-- ---------------------------------------------------------------------------
-- 4a) Revoke incorrect non-POD credits for pod-only departments (unconsumed only)
UPDATE indus_one.comp_off_credits c
SET
  status = 'revoked',
  updated_at = now()
WHERE c.earned_date >= indus_one.comp_off_cutoff_date()
  AND c.source_type IS DISTINCT FROM 'register_pod'
  AND coalesce(c.consumed_amount, 0) = 0
  AND c.status IN ('available', 'partial')
  AND indus_one.comp_off_sunday_pod_only_employee(c.employee_code);

-- 4b) Re-earn valid credits for everyone (POD for pod-only; punch/POD for others)
SELECT indus_one.reconcile_comp_off_credits_from_register();

NOTIFY pgrst, 'reload schema';
