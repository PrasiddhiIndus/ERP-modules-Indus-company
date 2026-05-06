-- Convenience view: see all app users (from profiles) in one place.
-- Run in Supabase SQL Editor.

create or replace view public.erp_app_users as
select
  p.id,
  p.created_at,
  p.email,
  p.username,
  p.team,
  p.role,
  p.allowed_modules
from public.profiles p
order by p.created_at desc;

