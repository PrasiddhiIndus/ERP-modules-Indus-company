-- Idempotent: Super Admin / Super Admin Pro can delete quotations without L1.
-- Safe if 20261113190000 already included the same function.

create or replace function projects.delete_quotation_as_super_admin(p_quotation_id uuid)
returns text
language plpgsql
security definer
set search_path = projects, public, pg_temp
set row_security = off
as $$
declare
  v_role text;
begin
  if auth.uid() is null or not public.current_user_can_access_module('projects') then
    raise exception 'You do not have access to Quotation Master.' using errcode = '42501';
  end if;

  select public.normalize_erp_role(p.role) into v_role
  from public.profiles p
  where p.id = auth.uid();

  if v_role is distinct from 'super_admin' and v_role is distinct from 'super_admin_pro' then
    raise exception 'Only a Super Admin can delete a quotation without L1 approval.'
      using errcode = '42501';
  end if;

  if not exists (select 1 from projects.quotations where id = p_quotation_id) then
    raise exception 'This quotation no longer exists.';
  end if;

  if to_regclass('projects.quotation_followups') is not null then
    execute 'delete from projects.quotation_followups where quotation_id = $1' using p_quotation_id;
  end if;
  if to_regclass('projects.quotation_attachments') is not null then
    execute 'delete from projects.quotation_attachments where quotation_id = $1' using p_quotation_id;
  end if;
  if to_regclass('projects.quotation_line_items') is not null then
    execute 'delete from projects.quotation_line_items where quotation_id = $1' using p_quotation_id;
  end if;
  if to_regclass('projects.quotation_maker_audit') is not null then
    execute 'delete from projects.quotation_maker_audit where quotation_id = $1' using p_quotation_id;
  end if;
  if to_regclass('projects.quotation_rows') is not null then
    execute 'delete from projects.quotation_rows where quotation_id = $1' using p_quotation_id;
  end if;

  delete from projects.quotations where id = p_quotation_id;
  return 'deleted';
end;
$$;

revoke all on function projects.delete_quotation_as_super_admin(uuid) from public;
grant execute on function projects.delete_quotation_as_super_admin(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
