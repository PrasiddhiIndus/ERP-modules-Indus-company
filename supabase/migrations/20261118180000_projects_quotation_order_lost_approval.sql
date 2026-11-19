-- Quotation Master: "Order Lost" needs L1 approval.
--   * The user picks Order Lost and must give a reason → a request goes to their L1
--     (Employee Master reporting manager, same rule as quotation deletion / enquiry edits).
--   * offer_status becomes Order Lost only when the L1 approves.
--   * Rejected → the quotation keeps its previous status; the rejection is recorded.
--   * If the quotation was converted / superseded / deleted before the decision, the
--     approval is recorded as 'failed' and nothing changes.
--   * Super Admin / Super Admin Pro may still set Order Lost directly (same exception as
--     quotation deletion, 20261113191000).
--   * A database guard blocks any other path (API, Board, import update) from setting
--     Order Lost on an existing quotation without approval.
-- Rollback: supabase/rollbacks/20261118180000_projects_quotation_order_lost_approval_down.sql

create table if not exists projects.quotation_status_change_requests (
  id bigint generated always as identity primary key,
  quotation_id uuid references projects.quotations (id) on delete set null,
  offer_no text,
  client_name text,
  previous_status text,
  requested_status text not null default 'Order Lost',
  reason text not null,
  status text not null default 'pending',
  requested_by uuid not null,
  requested_by_name text,
  requested_at timestamptz not null default now(),
  l1_manager_code text,
  l2_manager_code text,
  decided_by uuid,
  decided_by_name text,
  decided_at timestamptz,
  decision_note text,
  constraint quotation_status_change_requests_status_check
    check (status in ('pending', 'approved', 'rejected', 'failed')),
  constraint quotation_status_change_requests_requested_check
    check (requested_status in ('Order Lost')),
  constraint quotation_status_change_requests_reason_check
    check (length(btrim(reason)) > 0)
);

comment on table projects.quotation_status_change_requests is
  'Offer status changes that need L1 approval (Order Lost). History is kept after a decision.';

create unique index if not exists quotation_status_change_requests_one_pending
  on projects.quotation_status_change_requests (quotation_id)
  where status = 'pending';

create index if not exists quotation_status_change_requests_quotation_idx
  on projects.quotation_status_change_requests (quotation_id, requested_at desc);

create index if not exists quotation_status_change_requests_l1_idx
  on projects.quotation_status_change_requests (l1_manager_code, requested_at)
  where status = 'pending';

alter table projects.quotation_status_change_requests enable row level security;

drop policy if exists "quotation_status_change_requests_select" on projects.quotation_status_change_requests;
create policy "quotation_status_change_requests_select" on projects.quotation_status_change_requests
  for select to authenticated
  using (
    requested_by = auth.uid()
    or projects.current_user_is_enquiry_edit_decider(requested_by, l1_manager_code)
  );

-- Read-only for app users: rows are written only by the functions below.
revoke all on projects.quotation_status_change_requests from anon, authenticated;
grant select on projects.quotation_status_change_requests to authenticated;
grant all on projects.quotation_status_change_requests to service_role;

-- ---------------------------------------------------------------------------
-- Helper: Super Admin / Super Admin Pro
-- ---------------------------------------------------------------------------
create or replace function projects.current_user_is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
  select auth.uid() is not null
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and public.normalize_erp_role(p.role) in ('super_admin', 'super_admin_pro')
    );
$$;

revoke all on function projects.current_user_is_super_admin() from public;
grant execute on function projects.current_user_is_super_admin() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Request Order Lost
-- ---------------------------------------------------------------------------
create or replace function projects.request_quotation_order_lost(
  p_quotation_id uuid,
  p_reason text
)
returns bigint
language plpgsql
security definer
set search_path = projects, public, pg_temp
set row_security = off
as $$
declare
  v_q projects.quotations%rowtype;
  v_id bigint;
  v_l1 text;
  v_l2 text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if auth.uid() is null or not public.current_user_can_access_module('projects') then
    raise exception 'You do not have access to Quotation Master.' using errcode = '42501';
  end if;

  if v_reason is null then
    raise exception 'Enter the reason for Order Lost.' using errcode = 'P0001';
  end if;

  select * into v_q from projects.quotations where id = p_quotation_id for update;
  if not found then
    raise exception 'This quotation no longer exists.' using errcode = 'P0001';
  end if;

  if v_q.offer_status = 'Order Lost' then
    raise exception 'This quotation is already marked Order Lost.' using errcode = 'P0001';
  end if;
  if v_q.offer_status in ('Order Converted', 'Order Converted on Revised Value', 'Superseded') then
    raise exception 'A % quotation cannot be marked Order Lost.', v_q.offer_status using errcode = 'P0001';
  end if;

  if exists (
    select 1 from projects.quotation_status_change_requests
    where quotation_id = p_quotation_id and status = 'pending'
  ) then
    raise exception 'An Order Lost request for this quotation is already waiting for L1 approval.'
      using errcode = 'P0001';
  end if;

  select m.l1_manager_code, m.l2_manager_code
    into v_l1, v_l2
  from projects.enquiry_employee_manager_codes(auth.uid()) m;

  if nullif(btrim(coalesce(v_l1, '')), '') is null then
    raise exception
      'Your reporting manager is not set in Employee Master. Ask HR to set your L1 manager before requesting Order Lost.'
      using errcode = 'P0001';
  end if;

  insert into projects.quotation_status_change_requests (
    quotation_id, offer_no, client_name, previous_status, requested_status, reason,
    requested_by, requested_by_name, l1_manager_code, l2_manager_code
  ) values (
    p_quotation_id,
    nullif(btrim(v_q.offer_no), ''),
    nullif(btrim(v_q.client_name), ''),
    v_q.offer_status,
    'Order Lost',
    v_reason,
    auth.uid(),
    projects.current_user_display_name(),
    v_l1,
    v_l2
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function projects.request_quotation_order_lost(uuid, text) from public;
grant execute on function projects.request_quotation_order_lost(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Decide (L1 / admin override — same decider rule as quotation deletion)
-- Returns 'approved' | 'rejected' | 'failed'.
-- ---------------------------------------------------------------------------
create or replace function projects.decide_quotation_order_lost(
  p_request_id bigint,
  p_approve boolean,
  p_note text default null
)
returns text
language plpgsql
security definer
set search_path = projects, public, pg_temp
set row_security = off
as $$
declare
  v_req projects.quotation_status_change_requests%rowtype;
  v_q projects.quotations%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_fail text;
begin
  select * into v_req
  from projects.quotation_status_change_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'This Order Lost request no longer exists.' using errcode = 'P0001';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'This Order Lost request was already %.', v_req.status using errcode = 'P0001';
  end if;

  if not projects.current_user_is_enquiry_edit_decider(v_req.requested_by, v_req.l1_manager_code) then
    raise exception 'Only this employee''s L1 manager can approve or reject Order Lost.'
      using errcode = '42501';
  end if;

  if not p_approve then
    update projects.quotation_status_change_requests
       set status = 'rejected',
           decided_by = auth.uid(),
           decided_by_name = projects.current_user_display_name(),
           decided_at = now(),
           decision_note = v_note
     where id = p_request_id;
    return 'rejected';
  end if;

  if v_req.quotation_id is not null then
    select * into v_q from projects.quotations where id = v_req.quotation_id for update;
  end if;

  if v_req.quotation_id is null or v_q.id is null then
    v_fail := 'The quotation was deleted before approval.';
  elsif v_q.offer_status in ('Order Converted', 'Order Converted on Revised Value', 'Superseded') then
    v_fail := format('The quotation is now %s, so it was not marked Order Lost.', v_q.offer_status);
  end if;

  if v_fail is not null then
    update projects.quotation_status_change_requests
       set status = 'failed',
           decided_by = auth.uid(),
           decided_by_name = projects.current_user_display_name(),
           decided_at = now(),
           decision_note = concat_ws(' ', v_fail, v_note)
     where id = p_request_id;
    return 'failed';
  end if;

  update projects.quotation_status_change_requests
     set status = 'approved',
         decided_by = auth.uid(),
         decided_by_name = projects.current_user_display_name(),
         decided_at = now(),
         decision_note = v_note
   where id = p_request_id;

  if v_q.offer_status is distinct from 'Order Lost' then
    perform set_config('projects.quotation_status_source', 'approved_order_lost', true);
    update projects.quotations
       set offer_status = 'Order Lost',
           status_changed_at = now(),
           remark = concat_ws(E'\n', nullif(btrim(coalesce(remark, '')), ''), '[Status → Order Lost] ' || v_req.reason),
           updated_at = now()
     where id = v_q.id;
    perform set_config('projects.quotation_status_source', '', true);
  end if;

  return 'approved';
end;
$$;

revoke all on function projects.decide_quotation_order_lost(bigint, boolean, text) from public;
grant execute on function projects.decide_quotation_order_lost(bigint, boolean, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Guard: Order Lost on an existing quotation only through an approved request
-- (or a Super Admin). Service-role / backend jobs (no auth.uid()) are not affected.
-- New rows (imports of historical offers) are not affected.
-- ---------------------------------------------------------------------------
create or replace function projects.quotations_guard_order_lost()
returns trigger
language plpgsql
security definer
set search_path = projects, public, pg_temp
set row_security = off
as $$
begin
  if new.offer_status is not distinct from old.offer_status
     or new.offer_status is distinct from 'Order Lost' then
    return new;
  end if;
  if auth.uid() is null then
    return new;
  end if;
  if coalesce(current_setting('projects.quotation_status_source', true), '') = 'approved_order_lost' then
    return new;
  end if;
  if projects.current_user_is_super_admin() then
    return new;
  end if;
  raise exception 'Order Lost needs L1 approval. Choose Order Lost with a reason to send it to your L1 manager.'
    using errcode = 'P0001';
end;
$$;

revoke all on function projects.quotations_guard_order_lost() from public;

drop trigger if exists quotations_guard_order_lost on projects.quotations;
create trigger quotations_guard_order_lost
  before update of offer_status on projects.quotations
  for each row
  execute function projects.quotations_guard_order_lost();

-- A quotation that is marked Order Lost / converted / deleted by another path settles
-- its pending request so the L1 queue never shows stale items.
create or replace function projects.quotations_settle_status_requests()
returns trigger
language plpgsql
security definer
set search_path = projects, public, pg_temp
set row_security = off
as $$
begin
  if tg_op = 'DELETE' then
    update projects.quotation_status_change_requests
       set status = 'failed',
           decided_by = auth.uid(),
           decided_by_name = projects.current_user_display_name(),
           decided_at = now(),
           decision_note = 'The quotation was deleted before approval.'
     where quotation_id = old.id and status = 'pending';
    return old;
  end if;

  if new.offer_status is distinct from old.offer_status
     and new.offer_status in ('Order Lost', 'Order Converted', 'Order Converted on Revised Value', 'Superseded')
     and coalesce(current_setting('projects.quotation_status_source', true), '') <> 'approved_order_lost' then
    update projects.quotation_status_change_requests
       set status = case when new.offer_status = 'Order Lost' then 'approved' else 'failed' end,
           decided_by = auth.uid(),
           decided_by_name = projects.current_user_display_name(),
           decided_at = now(),
           decision_note = format('Status changed to %s directly.', new.offer_status)
     where quotation_id = new.id and status = 'pending';
  end if;
  return new;
end;
$$;

revoke all on function projects.quotations_settle_status_requests() from public;

drop trigger if exists quotations_settle_status_requests_upd on projects.quotations;
create trigger quotations_settle_status_requests_upd
  after update of offer_status on projects.quotations
  for each row
  execute function projects.quotations_settle_status_requests();

drop trigger if exists quotations_settle_status_requests_del on projects.quotations;
create trigger quotations_settle_status_requests_del
  before delete on projects.quotations
  for each row
  execute function projects.quotations_settle_status_requests();

notify pgrst, 'reload schema';
