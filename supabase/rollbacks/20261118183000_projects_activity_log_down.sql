-- Rollback for 20261118183000_projects_activity_log.sql.
-- Stops logging and removes the activity log.
-- NOTE: dropping the table deletes the recorded history. To keep it, run only the
-- "drop trigger" lines for quotations / pj_oc_master and leave the table in place.

drop trigger if exists quotations_activity_log on projects.quotations;
do $$
begin
  if to_regclass('public.pj_oc_master') is not null then
    execute 'drop trigger if exists pj_oc_master_activity_log on public.pj_oc_master';
  end if;
end $$;

drop function if exists projects.log_row_activity();
drop function if exists projects.activity_log_value(jsonb);
drop table if exists projects.activity_log;
drop function if exists projects.activity_log_immutable();

notify pgrst, 'reload schema';
