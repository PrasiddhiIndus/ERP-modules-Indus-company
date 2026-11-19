-- Rollback for 20261119120000_dahej_hr_wo_pattern_none_oct_backdate.sql.
-- Removes only the backdated Oct-2026 rows this migration inserted.

DELETE FROM public.admin_attendance_rule_values v
WHERE v.rule_key = 'wo.pattern'
  AND v.scope_type = 'employee'
  AND v.status = 'active'
  AND v.value = '"none"'::jsonb
  AND v.effective_from = date '2026-10-01'
  AND v.reason = 'Backdate: Dahej-HR no weekly off from Oct 2026 (Total Present)'
  AND public.norm_emp_code(v.scope_id) IN (
    public.norm_emp_code('8962'),
    public.norm_emp_code('C-00010'),
    public.norm_emp_code('V-00002'),
    public.norm_emp_code('FTC-66')
  );

NOTIFY pgrst, 'reload schema';
