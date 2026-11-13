-- PO At Glance: Execution Team (PLANNING) and Department Head (VERTICAL_HEAD)
-- must never create or change OC/PO details — remarks and signing only.

create or replace function public.pj_oc_user_is_remarks_only(p_created_by uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $body$
  -- Assignee role alone decides (p_created_by kept for call-site compatibility).
  select not public.oc_current_user_is_finance()
     and exists (
       select 1
         from public.pj_oc_signoff_assignees a
        where a.slot in ('PLANNING', 'VERTICAL_HEAD')
          and lower(btrim(a.employee_code)) = lower(btrim(coalesce(public.oc_current_employee_code(), '')))
          and btrim(coalesce(public.oc_current_employee_code(), '')) <> ''
     );
$body$;

create or replace function public.pj_oc_save(p jsonb)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_created uuid;
  v_oc_no text := public.oc_j_text(p, 'oc_no');
  v_po_date date := nullif(p ->> 'po_date', '')::date;
  v_delivery date := nullif(p ->> 'delivery_date', '')::date;
  v_value numeric := nullif(p ->> 'contract_value', '')::numeric;
  v_pen jsonb := coalesce(p -> 'penalty', '{}'::jsonb);
  v_cond jsonb;
  v_total numeric;
  v_count integer;
  v_found uuid;
begin
  if not public.pj_oc_current_user_has_access() then
    raise exception 'You do not have access to Projects PO At Glance.' using errcode = '42501';
  end if;

  -- Execution / Department Head: never create or rewrite PO details.
  if v_id is null then
    if public.pj_oc_user_is_remarks_only(null) then
      raise exception 'Execution Team and Department Head cannot create or change PO details. You can only add remarks and sign.'
        using errcode = 'P0001';
    end if;
  else
    select m.created_by into v_created from public.pj_oc_master m where m.id = v_id;
    if public.pj_oc_user_is_remarks_only(v_created) then
      raise exception 'Execution Team and Department Head cannot change PO details. Use Save remarks instead.'
        using errcode = 'P0001';
    end if;
  end if;

  if v_oc_no is not null and exists (
    select 1 from public.pj_oc_master where upper(oc_no) = upper(v_oc_no) and id is distinct from v_id
  ) then
    raise exception 'OC No. % is already used. Enter a different number.', v_oc_no;
  end if;
  if public.oc_j_text(p, 'po_wo_no') is null then raise exception 'PO/WO No. is required.'; end if;
  if v_po_date is null then raise exception 'PO/WO date is required.'; end if;
  if public.oc_j_text(p, 'client_name') is null then raise exception 'Client name is required.'; end if;
  if public.oc_j_text(p, 'project_description') is null then raise exception 'Project description is required.'; end if;
  if v_value is null then raise exception 'Contract value is required.'; end if;
  if v_delivery is null then raise exception 'Delivery date is required.'; end if;
  if v_delivery <= v_po_date then raise exception 'Delivery date must be after the PO/WO date.'; end if;

  if (v_pen ->> 'enabled')::boolean is true
     and (nullif(v_pen ->> 'rate', '') is null or public.oc_j_text(v_pen, 'period_unit') is null) then
    raise exception 'LD / Penalty details (rate and period) are required when LD / Penalty is Yes.';
  end if;

  for v_cond in select value from jsonb_array_elements(coalesce(p -> 'fixed_conditions', '[]'::jsonb)) loop
    if (v_cond ->> 'enabled')::boolean is true then
      if v_cond ->> 'key' = 'EMD' then
        if public.oc_j_text(v_cond, 'release_or_adjust') is null then
          raise exception 'EMD: choose a release date or adjust against SD.';
        end if;
        if v_cond ->> 'release_or_adjust' = 'RELEASE' and nullif(v_cond ->> 'release_date', '') is null then
          raise exception 'EMD: release date is required.';
        end if;
      elsif public.oc_j_text(v_cond, 'detail_text') is null then
        raise exception '% details are required when it is Yes.',
          case v_cond ->> 'key' when 'DLP' then 'Defect Liability Period' else 'Warranty' end;
      end if;
    end if;
  end loop;

  select count(*), coalesce(sum(nullif(m ->> 'percent', '')::numeric), 0)
    into v_count, v_total
    from jsonb_array_elements(coalesce(p -> 'payment_milestones', '[]'::jsonb)) m;
  if v_count > 0 and v_total <> 100 then
    raise exception 'Payment milestones must total 100%% (currently %).', v_total;
  end if;

  if v_id is null then
    insert into public.pj_oc_master (
      oc_no, oc_date, cost_center_tally, client_name, client_address, is_sez, po_wo_no, po_date,
      project_description, duration_of_job, delivery_date, contract_value, currency, gst_pct,
      payment_terms, rto_insurance, other_information, remarks, remarks_date
    ) values (
      v_oc_no, nullif(p ->> 'oc_date', '')::date, public.oc_j_text(p, 'cost_center_tally'),
      public.oc_j_text(p, 'client_name'), public.oc_j_text(p, 'client_address'), (p ->> 'is_sez')::boolean,
      public.oc_j_text(p, 'po_wo_no'), v_po_date, public.oc_j_text(p, 'project_description'),
      public.oc_j_text(p, 'duration_of_job'), v_delivery, v_value,
      coalesce(public.oc_j_text(p, 'currency'), 'INR'), nullif(p ->> 'gst_pct', '')::numeric,
      public.oc_j_text(p, 'payment_terms'), public.oc_j_text(p, 'rto_insurance'),
      public.oc_j_text(p, 'other_information'), public.oc_j_text(p, 'remarks'), nullif(p ->> 'remarks_date', '')::date
    )
    returning id, oc_no into v_id, v_oc_no;
  else
    update public.pj_oc_master set
      oc_no = v_oc_no,
      oc_date = nullif(p ->> 'oc_date', '')::date,
      cost_center_tally = public.oc_j_text(p, 'cost_center_tally'),
      client_name = public.oc_j_text(p, 'client_name'),
      client_address = public.oc_j_text(p, 'client_address'),
      is_sez = (p ->> 'is_sez')::boolean,
      po_wo_no = public.oc_j_text(p, 'po_wo_no'),
      po_date = v_po_date,
      project_description = public.oc_j_text(p, 'project_description'),
      duration_of_job = public.oc_j_text(p, 'duration_of_job'),
      delivery_date = v_delivery,
      contract_value = v_value,
      currency = coalesce(public.oc_j_text(p, 'currency'), 'INR'),
      gst_pct = nullif(p ->> 'gst_pct', '')::numeric,
      payment_terms = public.oc_j_text(p, 'payment_terms'),
      rto_insurance = public.oc_j_text(p, 'rto_insurance'),
      other_information = public.oc_j_text(p, 'other_information'),
      remarks = public.oc_j_text(p, 'remarks'),
      remarks_date = nullif(p ->> 'remarks_date', '')::date
    where id = v_id
    returning id, oc_no into v_found, v_oc_no;
    if v_found is null then raise exception 'This PO At Glance no longer exists.'; end if;
  end if;

  delete from public.pj_oc_security_items where oc_id = v_id;
  insert into public.pj_oc_security_items (oc_id, type, applicable, pct, due_days, validity_text, seq)
  select v_id, x ->> 'type',
         case when x ->> 'type' = 'SD' then (x ->> 'applicable')::boolean end,
         nullif(x ->> 'pct', '')::numeric, nullif(x ->> 'due_days', '')::integer,
         public.oc_j_text(x, 'validity_text'), t.ord::integer
  from jsonb_array_elements(coalesce(p -> 'security_items', '[]'::jsonb)) with ordinality as t(x, ord);

  delete from public.pj_oc_fixed_conditions where oc_id = v_id;
  insert into public.pj_oc_fixed_conditions (oc_id, key, enabled, detail_text, release_or_adjust, release_date)
  select v_id, x ->> 'key', (x ->> 'enabled')::boolean, public.oc_j_text(x, 'detail_text'),
         public.oc_j_text(x, 'release_or_adjust'), nullif(x ->> 'release_date', '')::date
  from jsonb_array_elements(coalesce(p -> 'fixed_conditions', '[]'::jsonb)) x;

  delete from public.pj_oc_penalty where oc_id = v_id;
  insert into public.pj_oc_penalty (oc_id, enabled, rate, period_unit, cap_percent, applicable_from_text)
  values (v_id, (v_pen ->> 'enabled')::boolean, nullif(v_pen ->> 'rate', '')::numeric,
          public.oc_j_text(v_pen, 'period_unit'), nullif(v_pen ->> 'cap_percent', '')::numeric,
          public.oc_j_text(v_pen, 'applicable_from_text'));

  delete from public.pj_oc_payment_milestones where oc_id = v_id;
  insert into public.pj_oc_payment_milestones (oc_id, seq, percent, trigger, due_days, notes)
  select v_id, t.ord::integer, nullif(x ->> 'percent', '')::numeric, public.oc_j_text(x, 'trigger'),
         nullif(x ->> 'due_days', '')::integer, public.oc_j_text(x, 'notes')
  from jsonb_array_elements(coalesce(p -> 'payment_milestones', '[]'::jsonb)) with ordinality as t(x, ord);

  delete from public.pj_oc_contacts where oc_id = v_id;
  insert into public.pj_oc_contacts (oc_id, seq, department, names, mobiles, emails)
  select v_id, t.ord::integer, public.oc_j_text(x, 'department'), public.oc_j_text(x, 'names'),
         coalesce(array(select jsonb_array_elements_text(coalesce(x -> 'mobiles', '[]'::jsonb))), '{}'),
         coalesce(array(select jsonb_array_elements_text(coalesce(x -> 'emails', '[]'::jsonb))), '{}')
  from jsonb_array_elements(coalesce(p -> 'contacts', '[]'::jsonb)) with ordinality as t(x, ord);

  delete from public.pj_oc_signoff o
  where o.oc_id = v_id
    and not exists (
      select 1 from jsonb_array_elements(coalesce(p -> 'signoff', '[]'::jsonb)) x
      where x ->> 'slot' = o.slot and public.oc_j_text(x, 'signed_by') is not null
    );
  update public.pj_oc_signoff o set signed_by = public.oc_j_text(x, 'signed_by')
  from jsonb_array_elements(coalesce(p -> 'signoff', '[]'::jsonb)) x
  where o.oc_id = v_id and o.slot = x ->> 'slot'
    and public.oc_j_text(x, 'signed_by') is not null
    and o.signed_by is distinct from public.oc_j_text(x, 'signed_by');
  insert into public.pj_oc_signoff (oc_id, slot, signed_by)
  select v_id, x ->> 'slot', public.oc_j_text(x, 'signed_by')
  from jsonb_array_elements(coalesce(p -> 'signoff', '[]'::jsonb)) x
  where public.oc_j_text(x, 'signed_by') is not null
    and not exists (select 1 from public.pj_oc_signoff o where o.oc_id = v_id and o.slot = x ->> 'slot');

  return jsonb_build_object('id', v_id, 'oc_no', v_oc_no);
end;
$$;

revoke all on function public.pj_oc_user_is_remarks_only(uuid) from public, anon;
grant execute on function public.pj_oc_user_is_remarks_only(uuid) to authenticated, service_role;
revoke all on function public.pj_oc_save(jsonb) from public, anon;
grant execute on function public.pj_oc_save(jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';
