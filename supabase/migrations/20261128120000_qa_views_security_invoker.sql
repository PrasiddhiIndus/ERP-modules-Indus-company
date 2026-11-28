-- Security Advisor: "Security Definer View" on qa.v_latest_results,
-- qa.v_coverage, and qa.v_release_gate.
--
-- Postgres creates views as security definer. They then run as the view owner
-- and skip row-level security, so any signed-in user who can select the view
-- sees every QA result, coverage row, and release-gate row.
-- security_invoker makes the view use the caller's privileges and the same
-- QA read policies as the underlying tables (qa.my_role() is not null).

alter view if exists qa.v_latest_results set (security_invoker = true);
alter view if exists qa.v_coverage set (security_invoker = true);
alter view if exists qa.v_release_gate set (security_invoker = true);

notify pgrst, 'reload schema';
