-- Software subscriptions/reminders: Super Admin-only subscription tracker.
-- Run via Supabase migrations, or paste into Dashboard -> SQL Editor.

create table if not exists public.software_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tool_service text not null default '',
  description text,
  purchase_price_first_year numeric(18,2) not null default 0,
  monthly_cost_ongoing numeric(18,2) not null default 0,
  yearly_cost_ongoing numeric(18,2) not null default 0,
  currency text not null default 'INR',
  monthly_cost_inr numeric(18,2) not null default 0,
  yearly_cost_inr numeric(18,2) not null default 0,
  credit_card text,
  invoices text,
  invoice_attachments jsonb not null default '[]'::jsonb,
  billing_type text not null default 'prepaid',
  payment_type text not null default 'Recurring',
  next_payment_date date,
  payment_status text not null default 'pending',
  reminder_days_before integer not null default 7,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint software_subscriptions_payment_status_check
    check (payment_status in ('pending', 'paid', 'overdue', 'cancelled')),
  constraint software_subscriptions_billing_type_check
    check (billing_type in ('prepaid', 'postpaid')),
  constraint software_subscriptions_reminder_days_check
    check (reminder_days_before >= 0)
);

create index if not exists software_subscriptions_next_payment_date_idx
  on public.software_subscriptions (next_payment_date);

create index if not exists software_subscriptions_payment_status_idx
  on public.software_subscriptions (payment_status);

create index if not exists software_subscriptions_created_at_idx
  on public.software_subscriptions (created_at desc);

alter table public.software_subscriptions enable row level security;

drop policy if exists "software_subscriptions_select_super_admin" on public.software_subscriptions;
drop policy if exists "software_subscriptions_insert_super_admin" on public.software_subscriptions;
drop policy if exists "software_subscriptions_update_super_admin" on public.software_subscriptions;
drop policy if exists "software_subscriptions_delete_super_admin" on public.software_subscriptions;

create policy "software_subscriptions_select_super_admin"
  on public.software_subscriptions for select
  to authenticated
  using (public.is_current_user_admin());

create policy "software_subscriptions_insert_super_admin"
  on public.software_subscriptions for insert
  to authenticated
  with check (public.is_current_user_admin());

create policy "software_subscriptions_update_super_admin"
  on public.software_subscriptions for update
  to authenticated
  using (public.is_current_user_admin())
  with check (public.is_current_user_admin());

create policy "software_subscriptions_delete_super_admin"
  on public.software_subscriptions for delete
  to authenticated
  using (public.is_current_user_admin());

drop trigger if exists software_subscriptions_updated_at on public.software_subscriptions;
create trigger software_subscriptions_updated_at
  before update on public.software_subscriptions
  for each row execute function public.set_updated_at();

comment on table public.software_subscriptions is
  'Super Admin-only tracker for software subscription entries, costs, invoices, and payment reminders.';

insert into storage.buckets (id, name, public)
values ('software-subscription-invoices', 'software-subscription-invoices', false)
on conflict (id) do nothing;

drop policy if exists "software_subscription_invoices_select_super_admin" on storage.objects;
drop policy if exists "software_subscription_invoices_insert_super_admin" on storage.objects;
drop policy if exists "software_subscription_invoices_update_super_admin" on storage.objects;
drop policy if exists "software_subscription_invoices_delete_super_admin" on storage.objects;

create policy "software_subscription_invoices_select_super_admin"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'software-subscription-invoices' and public.is_current_user_admin());

create policy "software_subscription_invoices_insert_super_admin"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'software-subscription-invoices' and public.is_current_user_admin());

create policy "software_subscription_invoices_update_super_admin"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'software-subscription-invoices' and public.is_current_user_admin())
  with check (bucket_id = 'software-subscription-invoices' and public.is_current_user_admin());

create policy "software_subscription_invoices_delete_super_admin"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'software-subscription-invoices' and public.is_current_user_admin());
