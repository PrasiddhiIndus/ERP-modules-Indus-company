-- Persist / resolve L1 approver name on Admin requisitions (PDF status line).

-- ---------------------------------------------------------------------------
-- 1) Import: copy L1 approver onto decided_by_name
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_recruitment_import_intake(p_intake_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_row record;
  v_no text;
  v_status text;
  v_id uuid;
  v_levels integer;
  v_hiring text;
  v_approver text;
  v_decided_at timestamptz;
BEGIN
  SELECT id INTO v_id FROM public.admin_recruitment_requisitions WHERE source_ref = p_intake_id;
  IF FOUND THEN
    RETURN v_id;
  END IF;

  SELECT r.*, m.full_name AS raiser_name, m.department AS raiser_department
    INTO v_row
  FROM public.hr_candidate_requisitions r
  LEFT JOIN public.admin_ifsp_employee_master m ON m.id = r.employee_master_id
  WHERE r.id = p_intake_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT nullif(btrim(req.l1_decided_by_name), ''), req.l1_decided_at
  INTO v_approver, v_decided_at
  FROM indus_one.candidate_requisition_requests req
  WHERE req.hr_requisition_id = p_intake_id
  LIMIT 1;

  v_no := public.admin_recruitment_clean(v_row.requisition_no);
  IF v_no IS NULL OR EXISTS (SELECT 1 FROM public.admin_recruitment_requisitions WHERE requisition_no = v_no) THEN
    v_no := public.admin_recruitment_next_ref('REQ');
  END IF;

  v_status := CASE v_row.status
    WHEN 'approved' THEN CASE WHEN v_row.calling_started_at IS NOT NULL THEN 'open' ELSE 'approved' END
    WHEN 'rejected' THEN 'rejected'
    WHEN 'filled' THEN 'filled'
    WHEN 'cancelled' THEN 'cancelled'
    WHEN 'pending' THEN 'approved'
    ELSE 'approved'
  END;

  SELECT approval_levels INTO v_levels FROM public.admin_recruitment_settings WHERE id;

  v_hiring := lower(btrim(coalesce(v_row.recruitment_type, '')));
  IF v_hiring IN ('new', 'new recruitment', 'new_recruitment') THEN
    v_hiring := 'new_recruitment';
  ELSIF v_hiring IN ('replacement') THEN
    v_hiring := 'replacement';
  ELSE
    v_hiring := NULL;
  END IF;

  INSERT INTO public.admin_recruitment_requisitions (
    requisition_no, source, source_ref, designation, department, openings, location, employment_type,
    experience_min, skills, qualification, work_experience, required_by, reason, status, status_reason,
    hiring_type, replacement_of, candidate_gender, age_limit,
    approval_levels_required, approval_level_done,
    raised_by, raised_by_name, submitted_at, decided_at, decided_by_name, opened_at, closed_at, created_at
  ) VALUES (
    v_no, 'indus_one', v_row.id,
    coalesce(
      public.admin_recruitment_clean(v_row.position_title),
      public.admin_recruitment_clean(v_row.designation_requested),
      'Not specified'
    ),
    coalesce(public.admin_recruitment_clean(v_row.department), v_row.raiser_department),
    greatest(1, coalesce(v_row.positions_count, 1)),
    v_row.location,
    coalesce(public.admin_recruitment_clean(v_row.employment_type), 'Full Time'),
    v_row.experience_min_years,
    coalesce(v_row.skills_required, v_row.justification),
    coalesce(v_row.education_qualification, v_row.skills_required),
    v_row.work_experience_required,
    v_row.required_by_date,
    v_row.justification,
    v_status,
    CASE WHEN v_status IN ('rejected', 'cancelled') THEN v_row.hr_remarks END,
    v_hiring,
    v_row.replacement_of_person,
    v_row.candidate_gender,
    v_row.age_limit,
    coalesce(v_levels, 1),
    CASE WHEN v_status IN ('approved', 'open', 'filled') THEN coalesce(v_levels, 1) ELSE 0 END,
    v_row.raised_by_user_id,
    v_row.raiser_name,
    v_row.created_at,
    CASE WHEN v_status IN ('approved', 'open', 'filled', 'rejected')
      THEN coalesce(v_decided_at, v_row.reviewed_at, v_row.updated_at, now()) END,
    CASE WHEN v_status IN ('approved', 'open', 'filled', 'rejected') THEN v_approver END,
    CASE WHEN v_status IN ('open', 'filled') THEN coalesce(v_row.calling_started_at, v_row.reviewed_at) END,
    CASE WHEN v_status IN ('filled', 'cancelled') THEN v_row.updated_at END,
    coalesce(v_row.created_at, now())
  )
  RETURNING id INTO v_id;

  PERFORM public.admin_recruitment_log(
    NULL, v_id, 'requisition', v_id,
    'imported',
    NULL, v_status,
    CASE
      WHEN v_approver IS NOT NULL THEN 'L1-approved by ' || v_approver || ' — ready for recruitment'
      ELSE 'L1-approved from Indus One — ready for recruitment (no HR approval)'
    END,
    jsonb_build_object('source', 'indus_one', 'hr_gate', 'skipped', 'approver', v_approver),
    'user',
    coalesce(v_approver, v_row.raiser_name, 'Manager')
  );

  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2) Resolver for PDF / UI
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_recruitment_requisition_approver_name(p_requisition_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, indus_one
SET row_security = off
AS $$
DECLARE
  v_name text;
  v_ref uuid;
BEGIN
  IF p_requisition_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT nullif(btrim(decided_by_name), ''), source_ref
  INTO v_name, v_ref
  FROM public.admin_recruitment_requisitions
  WHERE id = p_requisition_id;

  IF v_name IS NOT NULL THEN
    RETURN v_name;
  END IF;

  IF v_ref IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT nullif(btrim(r.l1_decided_by_name), '')
  INTO v_name
  FROM indus_one.candidate_requisition_requests r
  WHERE r.hr_requisition_id = v_ref
  LIMIT 1;

  RETURN v_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_recruitment_requisition_approver_name(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) Backfill decided_by_name from L1
-- ---------------------------------------------------------------------------
UPDATE public.admin_recruitment_requisitions a
SET
  decided_by_name = nullif(btrim(r.l1_decided_by_name), ''),
  decided_at = coalesce(a.decided_at, r.l1_decided_at, a.decided_at),
  updated_at = now()
FROM indus_one.candidate_requisition_requests r
WHERE a.source = 'indus_one'
  AND a.source_ref = r.hr_requisition_id
  AND r.l1_status = 'approved'
  AND nullif(btrim(r.l1_decided_by_name), '') IS NOT NULL
  AND coalesce(nullif(btrim(a.decided_by_name), ''), '') = '';

-- ---------------------------------------------------------------------------
-- 4) Backfill form fields from HR intake (hiring type, JD, employment)
-- ---------------------------------------------------------------------------
UPDATE public.admin_recruitment_requisitions a
SET
  hiring_type = coalesce(
    a.hiring_type,
    CASE
      WHEN lower(btrim(coalesce(h.recruitment_type, ''))) IN ('new', 'new recruitment', 'new_recruitment')
        THEN 'new_recruitment'
      WHEN lower(btrim(coalesce(h.recruitment_type, ''))) IN ('replacement')
        THEN 'replacement'
      ELSE NULL
    END
  ),
  replacement_of = coalesce(nullif(btrim(a.replacement_of), ''), nullif(btrim(h.replacement_of_person), '')),
  candidate_gender = coalesce(nullif(btrim(a.candidate_gender), ''), nullif(btrim(h.candidate_gender), '')),
  age_limit = coalesce(nullif(btrim(a.age_limit), ''), nullif(btrim(h.age_limit), '')),
  work_experience = coalesce(nullif(btrim(a.work_experience), ''), nullif(btrim(h.work_experience_required), '')),
  qualification = coalesce(
    nullif(btrim(a.qualification), ''),
    nullif(btrim(h.education_qualification), '')
  ),
  skills = coalesce(
    nullif(btrim(a.skills), ''),
    nullif(btrim(h.skills_required), ''),
    nullif(btrim(h.justification), '')
  ),
  reason = coalesce(nullif(btrim(a.reason), ''), nullif(btrim(h.justification), '')),
  employment_type = coalesce(
    nullif(btrim(a.employment_type), ''),
    public.admin_recruitment_clean(h.employment_type),
    'Full Time'
  ),
  updated_at = now()
FROM public.hr_candidate_requisitions h
WHERE a.source = 'indus_one'
  AND a.source_ref = h.id;

NOTIFY pgrst, 'reload schema';
