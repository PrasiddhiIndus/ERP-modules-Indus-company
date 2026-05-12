-- Adds invoice file attachments for Software subscriptions/reminders.
-- Safe to run after 20260512100600_software_subscriptions.sql.

alter table public.software_subscriptions
  add column if not exists invoice_attachments jsonb not null default '[]'::jsonb;

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
