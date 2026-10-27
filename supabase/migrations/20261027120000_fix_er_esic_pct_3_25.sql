-- Correct Part-B Employer ESIC rate typo: 3.75% → 3.25% (statutory ER ESIC since Jul 2019).
-- App defaults (ctcEngine / salaryData) already use 3.25%; the Payroll Rule Master seed had 3.75.
-- Locked versions are updated too — 3.75 was never a valid rate.

ALTER TABLE public.admin_payroll_rule_versions
  DISABLE TRIGGER trg_admin_payroll_rule_versions_guard;

UPDATE public.admin_payroll_rule_versions
SET
  rules_json = jsonb_set(COALESCE(rules_json, '{}'::jsonb), '{ER_ESIC_PCT}', '3.25'::jsonb, true),
  updated_at = now()
WHERE (rules_json->>'ER_ESIC_PCT') IS NULL
   OR (rules_json->>'ER_ESIC_PCT')::numeric = 3.75;

ALTER TABLE public.admin_payroll_rule_versions
  ENABLE TRIGGER trg_admin_payroll_rule_versions_guard;

NOTIFY pgrst, 'reload schema';
