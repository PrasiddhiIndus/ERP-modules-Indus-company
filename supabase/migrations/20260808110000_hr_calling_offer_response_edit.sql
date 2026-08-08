-- Allow correcting offer responses (e.g. Accepted ↔ Declined) and reclaim freed codes on Accept.

create or replace function public.hr_calling_set_offer_response(
  p_candidate_id uuid,
  p_response text
)
returns public.hr_calling_candidates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.hr_calling_candidates%rowtype;
  v_response text;
  v_emp text;
  v_ref text;
  v_site text;
  v_year integer;
begin
  if not public.current_user_can_access_module('hr') then
    raise exception 'Permission denied.';
  end if;

  v_response := initcap(lower(btrim(coalesce(p_response, ''))));
  if v_response = 'Noshow' then
    v_response := 'No-show';
  end if;
  if v_response not in ('Accepted', 'Declined', 'Expired') then
    raise exception 'Offer response must be Accepted, Declined, or Expired.';
  end if;

  select * into v_row
  from public.hr_calling_candidates
  where id = p_candidate_id
  for update;

  if not found then
    raise exception 'Candidate not found.';
  end if;

  if v_row.is_active is not true then
    raise exception 'Candidate is inactive.';
  end if;

  if coalesce(nullif(btrim(v_row.offer_status), ''), 'Not Generated') not in (
    'Generated', 'Accepted', 'Declined', 'Expired'
  ) and coalesce(nullif(btrim(v_row.offer_reference_no), ''), '') = '' then
    raise exception 'Generate the offer letter before recording a response.';
  end if;

  -- No-op if already on the requested status
  if btrim(coalesce(v_row.offer_status, '')) = v_response then
    return v_row;
  end if;

  -- Do not unwind after joining / IOM / conversion
  if btrim(coalesce(v_row.offer_status, '')) = 'Accepted'
     and v_response in ('Declined', 'Expired') then
    if btrim(coalesce(v_row.joining_status, '')) = 'Joined' then
      raise exception 'Cannot change response after the candidate has joined.';
    end if;
    if btrim(coalesce(v_row.iom_status, '')) = 'Issued' then
      raise exception 'Cannot change response after IOM is confirmed.';
    end if;
    if btrim(coalesce(v_row.conversion_status, '')) = 'Converted' then
      raise exception 'Cannot change response after Employee Master conversion.';
    end if;
  end if;

  if v_response = 'Accepted' then
    v_emp := nullif(btrim(coalesce(v_row.employee_code, '')), '');
    v_ref := nullif(btrim(coalesce(v_row.offer_reference_no, '')), '');

    -- After Declined/Expired, codes were freed — reclaim the ones released for this candidate when still available
    if v_emp is null then
      select r.employee_code
        into v_emp
      from public.hr_calling_reusable_employee_codes r
      where r.freed_from_candidate_id = p_candidate_id
        and not exists (
          select 1
          from public.hr_calling_candidates c
          where c.is_active = true
            and c.id <> p_candidate_id
            and lower(btrim(c.employee_code)) = lower(btrim(r.employee_code))
        )
      order by r.freed_at desc
      limit 1;

      if v_emp is not null then
        delete from public.hr_calling_reusable_employee_codes
        where lower(btrim(employee_code)) = lower(btrim(v_emp));
      end if;
    end if;

    if v_ref is null then
      select r.offer_reference_no, r.site_code, r.year_value
        into v_ref, v_site, v_year
      from public.hr_calling_reusable_offer_refs r
      where r.freed_from_candidate_id = p_candidate_id
        and not exists (
          select 1
          from public.hr_calling_candidates c
          where c.is_active = true
            and c.id <> p_candidate_id
            and lower(btrim(c.offer_reference_no)) = lower(btrim(r.offer_reference_no))
        )
      order by r.freed_at desc
      limit 1;

      if v_ref is not null then
        delete from public.hr_calling_reusable_offer_refs
        where lower(btrim(offer_reference_no)) = lower(btrim(v_ref));
      end if;
    end if;

    if v_emp is null or v_ref is null then
      raise exception
        'Employee code / offer reference is missing. Open Offer Generation and regenerate the letter, then mark Accepted.';
    end if;

    update public.hr_calling_candidates
    set
      employee_code = v_emp,
      offer_reference_no = v_ref,
      site_code = case
        when nullif(btrim(coalesce(site_code, '')), '') is null and v_site is not null then upper(btrim(v_site))
        else site_code
      end,
      offer_status = 'Accepted',
      offer_responded_at = now(),
      joining_status = case
        when joining_status in ('Joined', 'No-show') then joining_status
        else 'Pending'
      end,
      updated_at = now()
    where id = p_candidate_id
    returning * into v_row;
  else
    -- Declined / Expired: free codes for reuse
    perform public.hr_calling_release_offer_codes(p_candidate_id, v_response);

    update public.hr_calling_candidates
    set
      offer_status = v_response,
      offer_responded_at = now(),
      joining_status = '',
      joining_checklist = '{}'::jsonb,
      actual_joining_date = null,
      no_show_flagged_at = null,
      iom_status = '',
      iom_reference_no = '',
      iom_generated_at = null,
      conversion_status = '',
      employee_master_id = null,
      converted_at = null,
      updated_at = now()
    where id = p_candidate_id
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

comment on function public.hr_calling_set_offer_response(uuid, text) is
  'Records or corrects offer response (Accepted / Declined / Expired). Accept may reclaim codes freed for this candidate.';
