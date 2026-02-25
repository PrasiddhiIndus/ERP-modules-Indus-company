-- Profiles table: stores role, team, and allowed_modules for each user.
-- Used for listing users in Admin User Management and as source of truth for access.
-- Run this in Supabase SQL Editor if you use Supabase.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  username text,
  team text,
  role text,
  allowed_modules jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS
alter table public.profiles enable row level security;

-- Users can read their own profile
create policy "Users can read own profile"
  on public.profiles for select
  using (id = auth.uid());

-- Admins can read all profiles (admin = role in their own profile)
create policy "Admins can read all profiles"
  on public.profiles for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Users can insert their own profile (e.g. on signup)
create policy "Users can insert own profile"
  on public.profiles for insert
  with check (id = auth.uid());

-- Users can update their own profile (e.g. username only if you allow)
create policy "Users can update own profile"
  on public.profiles for update
  using (id = auth.uid());

-- Admins can update any profile (for User Management edit access)
create policy "Admins can update any profile"
  on public.profiles for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Optional: keep updated_at in sync
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Optional: comment for clarity
comment on table public.profiles is 'User profiles: role, team, allowed_modules. Source of truth for role-based access.';
