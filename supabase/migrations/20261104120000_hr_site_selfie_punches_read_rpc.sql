-- Read-only RPC so ERP HR Site Attendance can show P marks from Indus One selfie punches.
-- Does NOT alter indus_one.site_attendance_punches, its grants, or punch capture logic.
create or replace function public.hr_list_site_selfie_punches(p_from date, p_to date, p_codes text[])
returns table (
  employee_code text,
  person_id text,
  att_date date,
  punch_kind text,
  punched_at timestamptz,
  address text,
  approval_status text
)
language sql
stable
security definer
set search_path = indus_one, public
as $$
  select p.employee_code::text,
         p.person_id::text,
         p.att_date::date,
         p.punch_kind::text,
         p.punched_at::timestamptz,
         p.address::text,
         (to_jsonb(p) ->> 'approval_status')
  from indus_one.site_attendance_punches p
  where p.status = 'uploaded'
    and p.att_date between p_from and p_to
    and upper(trim(p.employee_code::text)) = any (
      select upper(trim(c)) from unnest(coalesce(p_codes, '{}'::text[])) c
    )
  order by p.punched_at;
$$;

revoke all on function public.hr_list_site_selfie_punches(date, date, text[]) from public, anon;
grant execute on function public.hr_list_site_selfie_punches(date, date, text[]) to authenticated, service_role;
