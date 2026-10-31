-- Admin ERP requisitions skip in-app approval. Approval already happens in Indus One;
-- ERP only records openings that are ready for recruitment (or edits them).

CREATE OR REPLACE FUNCTION public.admin_recruitment_requisition_save(
  p_id uuid,
  p_payload jsonb,
  p_expected_version integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.admin_recruitment_requisitions%rowtype;
  v_designation text := public.admin_recruitment_clean(p_payload ->> 'designation');
  v_openings integer;
  v_priority text := coalesce(public.admin_recruitment_clean(p_payload ->> 'priority'), 'normal');
  v_hiring text := public.admin_recruitment_clean(p_payload ->> 'hiringType');
  v_from text;
  v_actor text := public.admin_recruitment_actor_name(auth.uid());
  v_levels integer;
BEGIN
  PERFORM public.admin_recruitment_require('requisitions');

  IF v_designation IS NULL THEN
    RAISE EXCEPTION 'Job title is required.';
  END IF;
  v_openings := coalesce(public.admin_recruitment_num(p_payload ->> 'openings'), 1)::integer;
  IF v_openings < 1 OR v_openings > 999 THEN
    RAISE EXCEPTION 'Number of openings must be between 1 and 999.';
  END IF;
  IF v_priority NOT IN ('low', 'normal', 'high', 'urgent') THEN
    v_priority := 'normal';
  END IF;
  IF v_hiring IS NOT NULL AND v_hiring NOT IN ('new_recruitment', 'replacement') THEN
    v_hiring := NULL;
  END IF;

  SELECT approval_levels INTO v_levels FROM public.admin_recruitment_settings WHERE id;
  v_levels := coalesce(v_levels, 1);

  IF p_id IS NULL THEN
    INSERT INTO public.admin_recruitment_requisitions (
      requisition_no, source, designation, department, openings, location, employment_type,
      experience_min, experience_max, skills, qualification, required_by, reason, other_requirements,
      priority, hiring_type, replacement_of, candidate_gender, age_limit, work_experience,
      status, raised_by, raised_by_name,
      submitted_at, approval_levels_required, approval_level_done,
      decided_at, decided_by, decided_by_name, status_reason
    ) VALUES (
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
      'approved', auth.uid(), v_actor,
      now(), v_levels, v_levels,
      now(), auth.uid(), v_actor,
      'Ready for recruitment (no ERP approval — Indus One approval engine)'
    )
    RETURNING * INTO v_req;

    PERFORM public.admin_recruitment_log(
      NULL, v_req.id, 'requisition', v_req.id, 'created', NULL, 'approved',
      'Requisition added — ready for recruitment (ERP approval not used)', '{}'::jsonb
    );
    RETURN to_jsonb(v_req);
  END IF;

  SELECT * INTO v_req FROM public.admin_recruitment_requisitions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Requisition not found.';
  END IF;
  PERFORM public.admin_recruitment_check_version(p_expected_version, v_req.version);
  IF v_req.source = 'indus_one' THEN
    RAISE EXCEPTION 'This requisition was raised by a manager and can only be changed by them.';
  END IF;
  IF v_req.status NOT IN ('draft', 'rejected', 'submitted', 'pending_approval', 'approved') THEN
    RAISE EXCEPTION 'Only requisitions that are not yet open can be edited.';
  END IF;
  v_from := v_req.status;

  UPDATE public.admin_recruitment_requisitions
  SET designation = v_designation,
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
      status = 'approved',
      approval_levels_required = coalesce(NULLIF(approval_levels_required, 0), v_levels),
      approval_level_done = coalesce(NULLIF(approval_levels_required, 0), v_levels),
      submitted_at = coalesce(submitted_at, now()),
      decided_at = coalesce(decided_at, now()),
      decided_by = coalesce(decided_by, auth.uid()),
      decided_by_name = coalesce(decided_by_name, v_actor),
      status_reason = 'Ready for recruitment (no ERP approval — Indus One approval engine)',
      version = version + 1
  WHERE id = p_id
  RETURNING * INTO v_req;

  PERFORM public.admin_recruitment_log(
    NULL, v_req.id, 'requisition', v_req.id, 'updated',
    v_from, 'approved',
    'Requisition updated — ready for recruitment (ERP approval not used)',
    '{}'::jsonb
  );
  RETURN to_jsonb(v_req);
END;
$$;

-- Legacy ERP rows still waiting on the removed in-app approval path.
UPDATE public.admin_recruitment_requisitions
SET status = 'approved',
    approval_levels_required = coalesce(NULLIF(approval_levels_required, 0), 1),
    approval_level_done = coalesce(NULLIF(approval_levels_required, 0), 1),
    submitted_at = coalesce(submitted_at, now()),
    decided_at = coalesce(decided_at, now()),
    decided_by_name = coalesce(decided_by_name, raised_by_name, 'Admin'),
    status_reason = coalesce(
      nullif(btrim(status_reason), ''),
      'Ready for recruitment (no ERP approval — Indus One approval engine)'
    ),
    version = version + 1
WHERE source = 'erp'
  AND status IN ('draft', 'submitted', 'pending_approval');

CREATE OR REPLACE FUNCTION public.admin_recruitment_requisition_submit(
  p_id uuid,
  p_expected_version integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'ERP requisitions do not use Submit for approval. Approval is done in Indus One; save the requisition here when it is ready for recruitment.';
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_recruitment_requisition_decide(
  p_id uuid,
  p_decision text,
  p_remarks text DEFAULT NULL,
  p_expected_version integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'ERP requisition approval is not used here. Indus One already provides the approved requisition.';
END;
$$;

NOTIFY pgrst, 'reload schema';
