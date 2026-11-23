-- =============================================================================
-- M&M Comp-Off: week-off / holiday C/O only for P(OD) (machine punch does not earn).
--
-- Scope (nothing else):
--   * Rules Console: co.sunday_pod_only = true for department M&M only
--   * Revoke unconsumed non-POD credits for M&M employees (ledger only)
--
-- Engine already enforces co.sunday_pod_only in indus_one.comp_off_try_earn_credit
-- (20261026160000) — no function rewrite required.
--
-- Does not change: other departments, consumed credits, punches, register marks,
-- leave deductions, or global C/O earning-day rules.
-- Rollback: supabase/rollbacks/20261123110000_comp_off_mm_sunday_pod_only_down.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Rules Console — M&M department only
-- ---------------------------------------------------------------------------
INSERT INTO public.admin_attendance_rule_values
  (rule_key, scope_type, scope_id, scope_label, value, effective_from, reason, created_by_name, status)
SELECT
  'co.sunday_pod_only',
  'department',
  public.admin_rule_norm_department('M&M'),
  'M&M',
  'true'::jsonb,
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.admin_attendance_rule_values v
      WHERE v.rule_key = 'co.sunday_pod_only'
        AND v.scope_type = 'department'
        AND v.scope_id = public.admin_rule_norm_department('M&M')
        AND v.status = 'active'
    ) THEN current_date
    ELSE DATE '2000-01-01'
  END,
  'M&M: week-off / holiday C/O only for P(OD); machine punch (P/HD) does not earn',
  'System',
  'active'
WHERE coalesce(
  (
    SELECT v.value
    FROM public.admin_attendance_rule_values v
    WHERE v.rule_key = 'co.sunday_pod_only'
      AND v.scope_type = 'department'
      AND v.scope_id = public.admin_rule_norm_department('M&M')
      AND v.status = 'active'
      AND v.effective_from <= current_date
    ORDER BY v.effective_from DESC, v.id DESC
    LIMIT 1
  ),
  'false'::jsonb
) IS DISTINCT FROM 'true'::jsonb;

COMMENT ON FUNCTION indus_one.comp_off_sunday_pod_only_employee(text) IS
  'Week-off / holiday C/O only for P(OD) — departments with co.sunday_pod_only = Yes (Production*, R&M, Projects-FTC, Administration-FTC, M&M). Machine punch does not earn.';

-- ---------------------------------------------------------------------------
-- 2) Revoke invalid unconsumed non-POD credits for M&M only
-- ---------------------------------------------------------------------------
UPDATE indus_one.comp_off_credits c
SET
  status = 'revoked',
  updated_at = now()
FROM public.admin_ifsp_employee_master m
WHERE public.normalize_attendance_employee_code(m.employee_code)
    = public.normalize_attendance_employee_code(c.employee_code)
  AND public.admin_rule_norm_department(m.department)
      = public.admin_rule_norm_department('M&M')
  AND c.earned_date >= indus_one.comp_off_cutoff_date()
  AND c.source_type IS DISTINCT FROM 'register_pod'
  AND coalesce(c.consumed_amount, 0) = 0
  AND c.status IN ('available', 'partial');

NOTIFY pgrst, 'reload schema';
