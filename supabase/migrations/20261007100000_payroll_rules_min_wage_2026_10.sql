-- Minimum wage revision from 1 Oct 2026: Basic benchmark Skilled 13,897 / Semi-skilled 13,637.
-- New rule version per scheme, copied from the version in force before 1 Oct 2026 with only the two
-- benchmarks changed (percentages, bands, Medical amounts and Part B rules unchanged).
-- Months before 1 Oct 2026 keep the earlier version.

INSERT INTO public.admin_payroll_rule_versions
  (scheme, effective_from, rules_json, annexure_title, annexure_note, signatory_company, signatory_title, remarks)
SELECT DISTINCT ON (v.scheme)
  v.scheme,
  DATE '2026-10-01',
  v.rules_json || '{"BENCH_SKILLED": 13897, "BENCH_SEMI": 13637}'::jsonb,
  v.annexure_title,
  v.annexure_note,
  v.signatory_company,
  v.signatory_title,
  'Minimum wage revision from 01-10-2026 (Skilled 13,897 / Semi-skilled 13,637)'
FROM public.admin_payroll_rule_versions v
WHERE v.effective_from < DATE '2026-10-01'
ORDER BY v.scheme, v.effective_from DESC
ON CONFLICT (scheme, effective_from) DO UPDATE
  SET rules_json = public.admin_payroll_rule_versions.rules_json
                   || '{"BENCH_SKILLED": 13897, "BENCH_SEMI": 13637}'::jsonb,
      remarks = EXCLUDED.remarks
  WHERE public.admin_payroll_rule_versions.locked = false;

NOTIFY pgrst, 'reload schema';
