-- Restores the previous admin_recruitment_requisition_save body from
-- 20261007140100_admin_recruitment_workflow_core.sql, then drops new columns.

-- Re-apply the prior save function by re-running that migration's function definition
-- is left to operators; this rollback only drops the extra columns safely after
-- replacing save with a version that does not reference them.

create or replace function public.admin_recruitment_requisition_save(
  p_id uuid,
  p_payload jsonb,
  p_expected_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.admin_recruitment_requisitions%rowtype;
  v_designation text := public.admin_recruitment_clean(p_payload ->> 'designation');
  v_openings integer;
  v_priority text := coalesce(public.admin_recruitment_clean(p_payload ->> 'priority'), 'normal');
  v_from text;
begin
  perform public.admin_recruitment_require('requisitions');

  if v_designation is null then
    raise exception 'Position / designation is required.';
  end if;
  v_openings := coalesce(public.admin_recruitment_num(p_payload ->> 'openings'), 1)::integer;
  if v_openings < 1 or v_openings > 999 then
    raise exception 'Number of openings must be between 1 and 999.';
  end if;
  if v_priority not in ('low', 'normal', 'high', 'urgent') then
    v_priority := 'normal';
  end if;

  if p_id is null then
    insert into public.admin_recruitment_requisitions (
      requisition_no, source, designation, department, openings, location, employment_type,
      experience_min, experience_max, skills, qualification, required_by, reason, other_requirements,
      priority, status, raised_by, raised_by_name
    ) values (
      public.admin_recruitment_next_ref('REQ'), 'erp', v_designation,
      public.admin_recruitment_clean(p_payload ->> 'department'),
      v_openings,
      public.admin_recruitment_clean(p_payload ->> 'location'),
      coalesce(public.admin_recruitment_clean(p_payload ->> 'employmentType'), 'Permanent'),
      public.admin_recruitment_num(p_payload ->> 'experienceMin'),
      public.admin_recruitment_num(p_payload ->> 'experienceMax'),
      public.admin_recruitment_clean(p_payload ->> 'skills'),
      public.admin_recruitment_clean(p_payload ->> 'qualification'),
      public.admin_recruitment_date(p_payload ->> 'requiredBy'),
      public.admin_recruitment_clean(p_payload ->> 'reason'),
      public.admin_recruitment_clean(p_payload ->> 'otherRequirements'),
      v_priority, 'draft', auth.uid(), public.admin_recruitment_actor_name(auth.uid())
    )
    returning * into v_req;

    perform public.admin_recruitment_log(
      null, v_req.id, 'requisition', v_req.id, 'created', null, 'draft',
      'Requisition drafted', '{}'::jsonb
    );
    return to_jsonb(v_req);
  end if;

  select * into v_req from public.admin_recruitment_requisitions where id = p_id for update;
  if not found then
    raise exception 'Requisition not found.';
  end if;
  perform public.admin_recruitment_check_version(p_expected_version, v_req.version);
  if v_req.status not in ('draft', 'rejected') then
    raise exception 'Only draft or rejected requisitions can be edited.';
  end if;
  if v_req.source = 'indus_one' then
    raise exception 'This requisition was raised by a manager and can only be changed by them.';
  end if;
  v_from := v_req.status;

  update public.admin_recruitment_requisitions
  set designation = v_designation,
      department = public.admin_recruitment_clean(p_payload ->> 'department'),
      openings = v_openings,
      location = public.admin_recruitment_clean(p_payload ->> 'location'),
      employment_type = coalesce(public.admin_recruitment_clean(p_payload ->> 'employmentType'), 'Permanent'),
      experience_min = public.admin_recruitment_num(p_payload ->> 'experienceMin'),
      experience_max = public.admin_recruitment_num(p_payload ->> 'experienceMax'),
      skills = public.admin_recruitment_clean(p_payload ->> 'skills'),
      qualification = public.admin_recruitment_clean(p_payload ->> 'qualification'),
      required_by = public.admin_recruitment_date(p_payload ->> 'requiredBy'),
      reason = public.admin_recruitment_clean(p_payload ->> 'reason'),
      other_requirements = public.admin_recruitment_clean(p_payload ->> 'otherRequirements'),
      priority = v_priority,
      status = 'draft',
      approval_level_done = 0,
      version = version + 1
  where id = p_id
  returning * into v_req;

  perform public.admin_recruitment_log(
    null, v_req.id, 'requisition', v_req.id,
    case when v_from = 'rejected' then 'returned_to_draft' else 'updated' end,
    v_from, 'draft',
    case when v_from = 'rejected' then 'Revised after rejection' else 'Draft updated' end,
    '{}'::jsonb
  );
  return to_jsonb(v_req);
end;
$$;

alter table public.admin_recruitment_requisitions
  drop constraint if exists admin_recruitment_requisitions_hiring_type_check;

alter table public.admin_recruitment_requisitions
  drop column if exists hiring_type,
  drop column if exists replacement_of,
  drop column if exists candidate_gender,
  drop column if exists age_limit,
  drop column if exists work_experience;

notify pgrst, 'reload schema';
