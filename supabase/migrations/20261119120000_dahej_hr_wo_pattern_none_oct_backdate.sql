-- =============================================================================
-- Dahej-HR staff: backdate wo.pattern = none so October Total Present counts
-- Sunday / 3rd-Saturday P and P(OD) (from OFF_DAY_WORK_EXCLUDED_FROM_PRESENT_START_MONTH).
--
-- Live symptom: employees already unticked Sunday off / 3rd Saturday off in Employee
-- Master (effective 2026-11-18/19), but October still resolved sun_3rd_sat → Total
-- Present 27 instead of 31 (4 Sundays excluded).
--
-- Scope ONLY these Dahej-HR employee codes (no department-wide rule, no register rows,
-- no other departments, no C/O ledger changes):
--   8962, C-00010, V-00002, FTC-66
-- (Code "208" is not in employee master; skipped.)
--
-- Rollback: supabase/rollbacks/20261119120000_dahej_hr_wo_pattern_none_oct_backdate_down.sql
-- =============================================================================

INSERT INTO public.admin_attendance_rule_values (
  rule_key,
  scope_type,
  scope_id,
  scope_label,
  value,
  old_value,
  effective_from,
  reason,
  status
)
SELECT
  'wo.pattern',
  'employee',
  public.admin_rule_norm_employee(m.employee_code),
  coalesce(nullif(btrim(m.full_name), ''), public.admin_rule_norm_employee(m.employee_code))
    || ' (' || public.admin_rule_norm_employee(m.employee_code) || ')',
  '"none"'::jsonb,
  NULL,
  date '2026-10-01',
  'Backdate: Dahej-HR no weekly off from Oct 2026 (Total Present)',
  'active'
FROM public.admin_ifsp_employee_master m
WHERE public.norm_emp_code(m.employee_code) IN (
    public.norm_emp_code('8962'),
    public.norm_emp_code('C-00010'),
    public.norm_emp_code('V-00002'),
    public.norm_emp_code('FTC-66')
  )
  AND public.admin_rule_norm_department(m.department)
      = public.admin_rule_norm_department('Dahej-HR')
  AND NOT EXISTS (
    SELECT 1
    FROM public.admin_attendance_rule_values v
    WHERE v.rule_key = 'wo.pattern'
      AND v.scope_type = 'employee'
      AND public.norm_emp_code(v.scope_id) = public.norm_emp_code(m.employee_code)
      AND v.status = 'active'
      AND v.value = '"none"'::jsonb
      AND v.effective_from <= date '2026-10-01'
      AND v.reason = 'Backdate: Dahej-HR no weekly off from Oct 2026 (Total Present)'
  );

NOTIFY pgrst, 'reload schema';
