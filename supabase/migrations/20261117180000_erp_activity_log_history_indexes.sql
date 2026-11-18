-- Speed up Activity history filters / pagination (Super Admin Internal Utilities page).
-- Safe no-op when the table is not present yet.

do $$
begin
  if to_regclass('public.erp_activity_log') is null then
    raise notice 'public.erp_activity_log does not exist — skipping history indexes.';
    return;
  end if;

  create index if not exists erp_activity_log_created_success_idx
    on public.erp_activity_log (created_at desc, success);

  create index if not exists erp_activity_log_action_created_idx
    on public.erp_activity_log (action, created_at desc);

  create index if not exists erp_activity_log_user_email_created_idx
    on public.erp_activity_log (user_email, created_at desc);

  create index if not exists erp_activity_log_success_created_idx
    on public.erp_activity_log (success, created_at desc);
end$$;
