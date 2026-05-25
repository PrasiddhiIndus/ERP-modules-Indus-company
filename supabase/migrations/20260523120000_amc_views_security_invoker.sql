-- AMC dashboard views: run as the querying user so underlying RLS applies.
-- Without security_invoker, views use the owner role and show as UNRESTRICTED in Supabase.

ALTER VIEW public.vw_amc_dashboard_summary SET (security_invoker = on);
ALTER VIEW public.vw_amc_contract_expiry SET (security_invoker = on);
ALTER VIEW public.vw_amc_pm_due_overdue SET (security_invoker = on);
ALTER VIEW public.vw_amc_complaint_sla SET (security_invoker = on);
ALTER VIEW public.vw_amc_engineer_workload SET (security_invoker = on);
