-- One row per R2 (or future) invoice file for software subscriptions; path is the object key in R2.
-- Run after software_subscriptions exists. Does not replace invoice_attachments JSON (UI still uses it).

create table if not exists public.software_subscription_invoice_files (
  id uuid primary key default gen_random_uuid(),
  software_subscription_id uuid not null references public.software_subscriptions (id) on delete cascade,
  file_path text not null,
  file_name text,
  file_type text,
  file_size bigint,
  storage text not null default 'r2',
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint software_subscription_invoice_files_storage_check
    check (storage in ('r2', 'supabase'))
);

create index if not exists software_subscription_invoice_files_subscription_id_idx
  on public.software_subscription_invoice_files (software_subscription_id);

create unique index if not exists software_subscription_invoice_files_path_uniq
  on public.software_subscription_invoice_files (file_path);

comment on table public.software_subscription_invoice_files is
  'Invoice file metadata: R2 object key in file_path, linked to software_subscriptions.';

alter table public.software_subscription_invoice_files enable row level security;

drop policy if exists "software_subscription_invoice_files_select_admin" on public.software_subscription_invoice_files;
drop policy if exists "software_subscription_invoice_files_insert_admin" on public.software_subscription_invoice_files;
drop policy if exists "software_subscription_invoice_files_delete_admin" on public.software_subscription_invoice_files;

create policy "software_subscription_invoice_files_select_admin"
  on public.software_subscription_invoice_files for select
  to authenticated
  using (public.is_current_user_admin());

create policy "software_subscription_invoice_files_insert_admin"
  on public.software_subscription_invoice_files for insert
  to authenticated
  with check (public.is_current_user_admin());

create policy "software_subscription_invoice_files_delete_admin"
  on public.software_subscription_invoice_files for delete
  to authenticated
  using (public.is_current_user_admin());
