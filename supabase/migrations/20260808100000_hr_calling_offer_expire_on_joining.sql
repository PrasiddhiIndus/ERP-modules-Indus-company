-- Offer letters expire on the candidate's planned joining date (not N days after generation).

create or replace function public.hr_calling_auto_expire_offers()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_id uuid;
  v_today date := (timezone('Asia/Kolkata', now()))::date;
begin
  if not public.current_user_can_access_module('hr') then
    raise exception 'Permission denied.';
  end if;

  for v_id in
    select c.id
    from public.hr_calling_candidates c
    where c.is_active = true
      and btrim(coalesce(c.offer_status, '')) = 'Generated'
      and c.joining_date is not null
      and c.joining_date <= v_today
  loop
    perform public.hr_calling_set_offer_response(v_id, 'Expired');
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function public.hr_calling_auto_expire_offers() is
  'Marks Generated offers as Expired when planned joining_date is today or earlier (Asia/Kolkata).';
