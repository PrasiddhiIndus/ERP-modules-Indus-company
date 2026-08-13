-- Fix: RETURNS TABLE (employee_code, offer_reference_no) makes those names
-- PL/pgSQL OUT parameters. Unqualified column refs in DELETE then raise
-- "column reference employee_code is ambiguous" during offer generation.

create or replace function public.hr_calling_allocate_offer_codes(
  p_candidate_id uuid,
  p_site_code text,
  p_year integer default null,
  p_employee_code text default null
)
returns table (
  employee_code text,
  offer_reference_no text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_site text;
  v_year integer;
  v_emp text;
  v_ref text;
  v_emp_next bigint;
  v_ref_next bigint;
  v_ref_key text;
  v_manual text;
  v_manual_num bigint;
  v_free text;
  v_row public.hr_calling_candidates%rowtype;
begin
  if p_candidate_id is null then
    raise exception 'Candidate is required.';
  end if;

  if not public.current_user_can_access_module('hr') then
    raise exception 'Permission denied.';
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

  v_site := upper(nullif(btrim(coalesce(p_site_code, v_row.site_code, '')), ''));
  if v_site is null then
    raise exception 'Site code is required for the offer reference number.';
  end if;

  v_year := coalesce(
    p_year,
    extract(year from timezone('Asia/Kolkata', now()))::integer
  );

  v_emp := nullif(btrim(coalesce(v_row.employee_code, '')), '');
  v_ref := nullif(btrim(coalesce(v_row.offer_reference_no, '')), '');

  if v_emp is null then
    v_manual := nullif(btrim(coalesce(p_employee_code, '')), '');

    if v_manual is not null then
      if v_manual !~ '^[A-Za-z0-9]+$' then
        raise exception 'Employee code must contain only letters and numbers.';
      end if;

      if exists (
        select 1
        from public.hr_calling_candidates c
        where c.is_active = true
          and c.id <> p_candidate_id
          and lower(btrim(c.employee_code)) = lower(v_manual)
      ) then
        raise exception 'Employee code % is already taken. Please use a different one.', v_manual;
      end if;

      v_emp := v_manual;

      delete from public.hr_calling_reusable_employee_codes pool
      where lower(btrim(pool.employee_code)) = lower(v_manual);

      insert into public.hr_calling_offer_counters (counter_key, last_value)
      values ('employee_code', 0)
      on conflict (counter_key) do nothing;

      v_manual_num := nullif(regexp_replace(v_manual, '[^0-9]', '', 'g'), '')::bigint;

      if v_manual_num is not null then
        update public.hr_calling_offer_counters
        set last_value = greatest(last_value, v_manual_num),
            updated_at = now()
        where counter_key = 'employee_code';
      end if;
    else
      select r.employee_code
        into v_free
      from public.hr_calling_reusable_employee_codes r
      where not exists (
        select 1
        from public.hr_calling_candidates c
        where c.is_active = true
          and c.id <> p_candidate_id
          and lower(btrim(c.employee_code)) = lower(btrim(r.employee_code))
      )
      order by r.freed_at asc
      limit 1
      for update skip locked;

      if v_free is not null then
        v_emp := v_free;
        delete from public.hr_calling_reusable_employee_codes pool
        where pool.employee_code = v_free;
      else
        insert into public.hr_calling_offer_counters (counter_key, last_value)
        values ('employee_code', 0)
        on conflict (counter_key) do nothing;

        update public.hr_calling_offer_counters
        set last_value = last_value + 1,
            updated_at = now()
        where counter_key = 'employee_code'
        returning last_value into v_emp_next;

        v_emp := v_emp_next::text;
      end if;
    end if;
  end if;

  if v_ref is null then
    select r.offer_reference_no
      into v_ref
    from public.hr_calling_reusable_offer_refs r
    where upper(btrim(r.site_code)) = v_site
      and (r.year_value is null or r.year_value = v_year)
      and not exists (
        select 1
        from public.hr_calling_candidates c
        where c.is_active = true
          and c.id <> p_candidate_id
          and btrim(c.offer_reference_no) = btrim(r.offer_reference_no)
      )
    order by r.freed_at asc
    limit 1
    for update skip locked;

    if v_ref is not null then
      delete from public.hr_calling_reusable_offer_refs pool
      where pool.offer_reference_no = v_ref;
    else
      v_ref_key := 'ref:' || v_site || ':' || v_year::text;

      insert into public.hr_calling_offer_counters (counter_key, last_value)
      values (v_ref_key, 0)
      on conflict (counter_key) do nothing;

      update public.hr_calling_offer_counters
      set last_value = last_value + 1,
          updated_at = now()
      where counter_key = v_ref_key
      returning last_value into v_ref_next;

      v_ref := format(
        'IFSPL/HR/%s/OL/%s/%s',
        v_site,
        v_year::text,
        lpad(v_ref_next::text, 4, '0')
      );
    end if;
  end if;

  update public.hr_calling_candidates
  set
    employee_code = v_emp,
    offer_reference_no = v_ref,
    site_code = v_site,
    offer_status = case
      when nullif(btrim(coalesce(v_row.employee_code, '')), '') is null
        then 'Generated'
      when btrim(coalesce(v_row.offer_status, '')) = 'Accepted'
        then 'Accepted'
      when btrim(coalesce(v_row.offer_status, '')) in ('Declined', 'Expired')
        then 'Generated'
      else 'Generated'
    end,
    offer_generated_at = case
      when nullif(btrim(coalesce(v_row.employee_code, '')), '') is null
        then now()
      else coalesce(offer_generated_at, now())
    end,
    offer_responded_at = case
      when nullif(btrim(coalesce(v_row.employee_code, '')), '') is null then null
      when btrim(coalesce(v_row.offer_status, '')) = 'Accepted' then offer_responded_at
      else offer_responded_at
    end,
    joining_status = case
      when nullif(btrim(coalesce(v_row.employee_code, '')), '') is null then ''
      else joining_status
    end,
    joining_checklist = case
      when nullif(btrim(coalesce(v_row.employee_code, '')), '') is null then '{}'::jsonb
      else joining_checklist
    end,
    actual_joining_date = case
      when nullif(btrim(coalesce(v_row.employee_code, '')), '') is null then null
      else actual_joining_date
    end,
    no_show_flagged_at = case
      when nullif(btrim(coalesce(v_row.employee_code, '')), '') is null then null
      else no_show_flagged_at
    end,
    iom_status = case
      when nullif(btrim(coalesce(v_row.employee_code, '')), '') is null then ''
      else iom_status
    end,
    iom_reference_no = case
      when nullif(btrim(coalesce(v_row.employee_code, '')), '') is null then ''
      else iom_reference_no
    end,
    iom_generated_at = case
      when nullif(btrim(coalesce(v_row.employee_code, '')), '') is null then null
      else iom_generated_at
    end,
    conversion_status = case
      when nullif(btrim(coalesce(v_row.employee_code, '')), '') is null then ''
      else conversion_status
    end,
    employee_master_id = case
      when nullif(btrim(coalesce(v_row.employee_code, '')), '') is null then null
      else employee_master_id
    end,
    converted_at = case
      when nullif(btrim(coalesce(v_row.employee_code, '')), '') is null then null
      else converted_at
    end,
    updated_at = now()
  where id = p_candidate_id;

  employee_code := v_emp;
  offer_reference_no := v_ref;
  return next;
end;
$$;

comment on function public.hr_calling_allocate_offer_codes(uuid, text, integer, text) is
  'Assigns employee_code (HR-provided, reused, or sequential) and IFSPL/HR/<Site>/OL/<Year>/<Seq> reference on offer generation.';
