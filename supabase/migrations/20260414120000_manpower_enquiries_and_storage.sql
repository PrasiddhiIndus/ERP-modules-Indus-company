-- Manpower commercial enquiries: table + RLS + storage bucket used by ManpowerManagement / ManpowerEnquiryFormPanel.
-- Run via `supabase db push` or paste into Dashboard → SQL Editor if the app errors with
-- "Could not find the table public.manpower_enquiries" (PGRST205).

create table if not exists public.manpower_enquiries (
  id uuid primary key default gen_random_uuid(),
  client text not null default '',
  phone text,
  email text,
  street text,
  street2 text,
  city text,
  state text,
  zip text,
  country text,
  priority integer not null default 1,
  source text,
  due_date date,
  rfq_available boolean not null default false,
  project_estimation text,
  duration jsonb not null default '{"days": 0, "months": 0, "years": 0}'::jsonb,
  documents text,
  manpower_required text,
  fire_tender_required boolean not null default false,
  contacts jsonb not null default '[]'::jsonb,
  handled_by text,
  authorization_to text,
  enquiry_number text,
  status text not null default 'Pending',
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists manpower_enquiries_enquiry_number_unique
  on public.manpower_enquiries (enquiry_number)
  where enquiry_number is not null;

create index if not exists manpower_enquiries_created_at_idx
  on public.manpower_enquiries (created_at desc);

alter table public.manpower_enquiries enable row level security;

drop policy if exists "manpower_enquiries_select_authenticated" on public.manpower_enquiries;
drop policy if exists "manpower_enquiries_insert_authenticated" on public.manpower_enquiries;
drop policy if exists "manpower_enquiries_update_authenticated" on public.manpower_enquiries;
drop policy if exists "manpower_enquiries_delete_authenticated" on public.manpower_enquiries;

create policy "manpower_enquiries_select_authenticated"
  on public.manpower_enquiries for select
  to authenticated
  using (true);

create policy "manpower_enquiries_insert_authenticated"
  on public.manpower_enquiries for insert
  to authenticated
  with check (true);

create policy "manpower_enquiries_update_authenticated"
  on public.manpower_enquiries for update
  to authenticated
  using (true)
  with check (true);

create policy "manpower_enquiries_delete_authenticated"
  on public.manpower_enquiries for delete
  to authenticated
  using (true);

drop trigger if exists manpower_enquiries_updated_at on public.manpower_enquiries;
create trigger manpower_enquiries_updated_at
  before update on public.manpower_enquiries
  for each row execute function public.set_updated_at();

-- Private bucket for enquiry file uploads (ManpowerEnquiryFormPanel → manpower-docs).
insert into storage.buckets (id, name, public)
values ('manpower-docs', 'manpower-docs', false)
on conflict (id) do nothing;

drop policy if exists "manpower_docs_insert_authenticated" on storage.objects;
drop policy if exists "manpower_docs_select_authenticated" on storage.objects;
drop policy if exists "manpower_docs_update_authenticated" on storage.objects;
drop policy if exists "manpower_docs_delete_authenticated" on storage.objects;

create policy "manpower_docs_insert_authenticated"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'manpower-docs');

create policy "manpower_docs_select_authenticated"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'manpower-docs');

create policy "manpower_docs_update_authenticated"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'manpower-docs');

create policy "manpower_docs_delete_authenticated"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'manpower-docs');
