-- Expand billing access checks to include new role hierarchy + Commercial modules.
-- Run via Supabase migrations, or paste into SQL Editor.

create or replace function billing.current_user_has_billing_access()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  has_access boolean;
begin
  -- Super admins always have access.
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('super_admin', 'super_admin_pro')
  ) into has_access;
  if has_access then return true; end if;

  -- Allow if role/team or module assignment indicates access.
  -- NOTE: billing.po_wo is the master PO store used by both Commercial verticals + Billing.
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        p.role in ('admin', 'manager', 'executive', 'billing')
        or p.team in ('billing', 'commercial', 'commercialMt', 'commercialRm')
        or (
          p.allowed_modules is not null
          and (
            p.allowed_modules @> '"billing"'::jsonb
            or p.allowed_modules @> '"commercialMt"'::jsonb
            or p.allowed_modules @> '"commercialRm"'::jsonb
            or p.allowed_modules @> '"commercial"'::jsonb
          )
        )
      )
  ) into has_access;
  if has_access then return true; end if;

  -- Allow when profile isn't set up yet (bootstrap environments).
  if not exists (select 1 from public.profiles p where p.id = auth.uid()) then
    return true;
  end if;

  -- Legacy allow: profile exists but role/team unset and no modules.
  if exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role is null
      and p.team is null
      and (p.allowed_modules is null or p.allowed_modules = '[]'::jsonb)
  ) then
    return true;
  end if;

  return false;
end;
$$;

