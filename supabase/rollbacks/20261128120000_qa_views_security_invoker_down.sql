alter view if exists qa.v_latest_results set (security_invoker = false);
alter view if exists qa.v_coverage set (security_invoker = false);
alter view if exists qa.v_release_gate set (security_invoker = false);

notify pgrst, 'reload schema';
