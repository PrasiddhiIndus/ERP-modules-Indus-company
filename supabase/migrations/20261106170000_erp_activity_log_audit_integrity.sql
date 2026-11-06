-- Activity log → tamper-resistant audit trail.
--
-- Why: the old insert policy was `with check (true)` and the browser supplied user_id,
-- user_email and (optionally) created_at. Any logged-in user could therefore write a row
-- attributed to someone else, or back-date it. This migration makes the database the only
-- source of "who" and "when":
--   1. BEFORE INSERT trigger stamps user_id = auth.uid(), user_email = JWT email,
--      created_at = now(), ignoring whatever the client sent.
--   2. Inserts from the API require an authenticated user (auth.uid() not null).
--   3. Rows can never be edited or deleted through the API (UPDATE/DELETE revoked).
--   4. Rows written without an end-user JWT (service role, cron, SQL editor) are kept but
--      flagged details.origin = 'server' so they are never mistaken for user actions.
--
-- Not changed: SELECT policy (who can read the log), table columns, indexes, realtime.

do $$
begin
  if to_regclass('public.erp_activity_log') is null then
    raise notice 'public.erp_activity_log does not exist — skipping audit integrity migration.';
    return;
  end if;

  -- 1. Server-side identity + timestamp ------------------------------------------------
  create or replace function public.erp_activity_log_stamp()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, auth
  as $fn$
  declare
    v_uid uuid := auth.uid();
    v_email text;
  begin
    new.created_at := now();

    if v_uid is not null then
      v_email := nullif(auth.jwt() ->> 'email', '');
      if v_email is null then
        select u.email into v_email from auth.users u where u.id = v_uid;
      end if;
      new.user_id := v_uid;
      new.user_email := v_email;
    else
      -- No end-user JWT: server-side / service process. Never attribute to a person.
      new.user_id := null;
      new.user_email := null;
      new.details := coalesce(new.details, '{}'::jsonb)
        || jsonb_build_object('origin', 'server', 'trigger', 'automatic');
    end if;

    return new;
  end
  $fn$;

  revoke all on function public.erp_activity_log_stamp() from public, anon, authenticated;

  drop trigger if exists erp_activity_log_stamp on public.erp_activity_log;
  create trigger erp_activity_log_stamp
    before insert on public.erp_activity_log
    for each row execute function public.erp_activity_log_stamp();

  -- 2. Insert only as an authenticated user -------------------------------------------
  drop policy if exists erp_activity_log_insert on public.erp_activity_log;
  create policy erp_activity_log_insert on public.erp_activity_log
    for insert to authenticated
    with check (auth.uid() is not null);

  -- 3. Append-only through the API ----------------------------------------------------
  revoke update, delete, truncate on public.erp_activity_log from anon, authenticated;
  revoke insert on public.erp_activity_log from anon;

  comment on table public.erp_activity_log is
    'Append-only ERP audit trail. user_id, user_email and created_at are stamped by trigger '
    'erp_activity_log_stamp from the request JWT; client-supplied values are ignored.';
end
$$;
