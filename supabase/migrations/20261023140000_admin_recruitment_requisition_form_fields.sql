-- Candidate Requisition Form (IFSPL/Admin/Form02/R4) fields on ERP requisitions.
-- Workflow / approval logic unchanged; save only persists the extra columns.

alter table public.admin_recruitment_requisitions
  add column if not exists hiring_type text,
  add column if not exists replacement_of text,
  add column if not exists candidate_gender text,
  add column if not exists age_limit text,
  add column if not exists work_experience text;

alter table public.admin_recruitment_requisitions
  drop constraint if exists admin_recruitment_requisitions_hiring_type_check;
alter table public.admin_recruitment_requisitions
  add constraint admin_recruitment_requisitions_hiring_type_check
  check (hiring_type is null or hiring_type in ('new_recruitment', 'replacement'));

comment on column public.admin_recruitment_requisitions.hiring_type is 'New Recruitment or Replacement (paper form tick).';
comment on column public.admin_recruitment_requisitions.replacement_of is 'Name of person being replaced.';
comment on column public.admin_recruitment_requisitions.candidate_gender is 'Preferred candidate gender from requisition form.';
comment on column public.admin_recruitment_requisitions.age_limit is 'Age limit text from requisition form.';
comment on column public.admin_recruitment_requisitions.work_experience is 'Work experience required (free text).';

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
  v_hiring text := public.admin_recruitment_clean(p_payload ->> 'hiringType');
  v_from text;
begin
  perform public.admin_recruitment_require('requisitions');

  if v_designation is null then
    raise exception 'Job title is required.';
  end if;
  v_openings := coalesce(public.admin_recruitment_num(p_payload ->> 'openings'), 1)::integer;
  if v_openings < 1 or v_openings > 999 then
    raise exception 'Number of openings must be between 1 and 999.';
  end if;
  if v_priority not in ('low', 'normal', 'high', 'urgent') then
    v_priority := 'normal';
  end if;
  if v_hiring is not null and v_hiring not in ('new_recruitment', 'replacement') then
    v_hiring := null;
  end if;

  if p_id is null then
    insert into public.admin_recruitment_requisitions (
      requisition_no, source, designation, department, openings, location, employment_type,
      experience_min, experience_max, skills, qualification, required_by, reason, other_requirements,
      priority, hiring_type, replacement_of, candidate_gender, age_limit, work_experience,
      status, raised_by, raised_by_name
    ) values (
      public.admin_recruitment_next_ref('REQ'), 'erp', v_designation,
      public.admin_recruitment_clean(p_payload ->> 'department'),
      v_openings,
      public.admin_recruitment_clean(p_payload ->> 'location'),
      coalesce(public.admin_recruitment_clean(p_payload ->> 'employmentType'), 'Full Time'),
      public.admin_recruitment_num(p_payload ->> 'experienceMin'),
      public.admin_recruitment_num(p_payload ->> 'experienceMax'),
      public.admin_recruitment_clean(p_payload ->> 'skills'),
      public.admin_recruitment_clean(p_payload ->> 'qualification'),
      public.admin_recruitment_date(p_payload ->> 'requiredBy'),
      public.admin_recruitment_clean(p_payload ->> 'reason'),
      public.admin_recruitment_clean(p_payload ->> 'otherRequirements'),
      v_priority,
      v_hiring,
      public.admin_recruitment_clean(p_payload ->> 'replacementOf'),
      public.admin_recruitment_clean(p_payload ->> 'candidateGender'),
      public.admin_recruitment_clean(p_payload ->> 'ageLimit'),
      public.admin_recruitment_clean(p_payload ->> 'workExperience'),
      'draft', auth.uid(), public.admin_recruitment_actor_name(auth.uid())
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
      employment_type = coalesce(public.admin_recruitment_clean(p_payload ->> 'employmentType'), 'Full Time'),
      experience_min = public.admin_recruitment_num(p_payload ->> 'experienceMin'),
      experience_max = public.admin_recruitment_num(p_payload ->> 'experienceMax'),
      skills = public.admin_recruitment_clean(p_payload ->> 'skills'),
      qualification = public.admin_recruitment_clean(p_payload ->> 'qualification'),
      required_by = public.admin_recruitment_date(p_payload ->> 'requiredBy'),
      reason = public.admin_recruitment_clean(p_payload ->> 'reason'),
      other_requirements = public.admin_recruitment_clean(p_payload ->> 'otherRequirements'),
      priority = v_priority,
      hiring_type = v_hiring,
      replacement_of = public.admin_recruitment_clean(p_payload ->> 'replacementOf'),
      candidate_gender = public.admin_recruitment_clean(p_payload ->> 'candidateGender'),
      age_limit = public.admin_recruitment_clean(p_payload ->> 'ageLimit'),
      work_experience = public.admin_recruitment_clean(p_payload ->> 'workExperience'),
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

notify pgrst, 'reload schema';
