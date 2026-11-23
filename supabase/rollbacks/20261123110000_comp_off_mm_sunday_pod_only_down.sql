-- Rollback: clear M&M co.sunday_pod_only = true (append NULL inherit row).
-- Does not un-revoke ledger credits (manual restore if needed).

INSERT INTO public.admin_attendance_rule_values
  (rule_key, scope_type, scope_id, scope_label, value, effective_from, reason, created_by_name, status)
VALUES (
  'co.sunday_pod_only',
  'department',
  public.admin_rule_norm_department('M&M'),
  'M&M',
  NULL,
  current_date,
  'Rollback 20261123110000 — M&M inherits company co.sunday_pod_only',
  'System',
  'active'
);

COMMENT ON FUNCTION indus_one.comp_off_sunday_pod_only_employee(text) IS
  'Week-off / holiday C/O only for P(OD) — departments with co.sunday_pod_only = Yes (Production*, R&M, Projects-FTC, Administration-FTC). Machine punch does not earn.';

NOTIFY pgrst, 'reload schema';
