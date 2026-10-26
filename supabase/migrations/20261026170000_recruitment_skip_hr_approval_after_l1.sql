-- L1-approved Indus One requisitions appear in Admin as approved (no HR approve step).
-- When L1 forwards to HR, hr_candidate_requisitions.status = approved and intake
-- imports admin_recruitment_requisitions as approved / open-ready.
-- Existing pending_approval rows from Indus One are backfilled to approved.

-- ---------------------------------------------------------------------------
-- 1) Forward to HR: create intake row already approved (L1 done)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION indus_one.requisition_forward_to_hr(p_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, indus_one
SET row_security = off
AS $$
DECLARE
  r indus_one.candidate_requisition_requests%ROWTYPE;
  v_hr_id uuid;
BEGIN
  SELECT * INTO r FROM indus_one.candidate_requisition_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Requisition not found';
  END IF;
  IF r.hr_requisition_id IS NOT NULL THEN
    -- Ensure already-forwarded rows are approved (no second HR gate).
    UPDATE public.hr_candidate_requisitions
    SET status = 'approved',
        reviewed_at = coalesce(reviewed_at, now()),
        updated_at = now()
    WHERE id = r.hr_requisition_id
      AND status = 'pending';
    RETURN r.hr_requisition_id;
  END IF;

  INSERT INTO public.hr_candidate_requisitions (
    requisition_no,
    raised_by_user_id,
    employee_master_id,
    department,
    designation_requested,
    positions_count,
    employment_type,
    location,
    required_by_date,
    experience_min_years,
    skills_required,
    justification,
    recruitment_type,
    replacement_of_person,
    candidate_gender,
    position_title,
    age_limit,
    education_qualification,
    work_experience_required,
    status,
    reviewed_at
  ) VALUES (
    public.hr_candidate_requisition_next_no(),
    r.raised_by_user_id,
    r.employee_master_id,
    r.department,
    r.designation_requested,
    r.positions_count,
    r.employment_type,
    r.location,
    r.required_by_date,
    r.experience_min_years,
    r.skills_required,
    r.justification,
    r.recruitment_type,
    r.replacement_of_person,
    r.candidate_gender,
    r.position_title,
    r.age_limit,
    r.education_qualification,
    r.work_experience_required,
    'approved',
    now()
  )
  RETURNING id INTO v_hr_id;

  UPDATE indus_one.candidate_requisition_requests
  SET hr_requisition_id = v_hr_id, updated_at = now()
  WHERE id = p_id;

  RETURN v_hr_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2) Intake import: L1-forwarded rows land as approved (+ form field mapping)
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

  v_no := public.admin_recruitment_clean(v_row.requisition_no);
  IF v_no IS NULL OR EXISTS (SELECT 1 FROM public.admin_recruitment_requisitions WHERE requisition_no = v_no) THEN
    v_no := public.admin_recruitment_next_ref('REQ');
  END IF;

  -- After L1, intake is already approved (or filled/rejected/cancelled).
  -- Legacy pending rows are treated as approved (HR gate removed).
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
    raised_by, raised_by_name, submitted_at, decided_at, opened_at, closed_at, created_at
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
      THEN coalesce(v_row.reviewed_at, v_row.updated_at, now()) END,
    CASE WHEN v_status IN ('open', 'filled') THEN coalesce(v_row.calling_started_at, v_row.reviewed_at) END,
    CASE WHEN v_status IN ('filled', 'cancelled') THEN v_row.updated_at END,
    coalesce(v_row.created_at, now())
  )
  RETURNING id INTO v_id;

  PERFORM public.admin_recruitment_log(
    NULL, v_id, 'requisition', v_id,
    'imported',
    NULL, v_status,
    'L1-approved from Indus One — ready for recruitment (no HR approval)',
    jsonb_build_object('source', 'indus_one', 'hr_gate', 'skipped'),
    'user',
    coalesce(v_row.raiser_name, 'Manager')
  );

  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3) Bridge: when intake becomes approved, promote admin pending rows
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_recruitment_intake_bridge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_req public.admin_recruitment_requisitions%rowtype;
  v_levels integer;
BEGIN
  IF coalesce(current_setting('admin_recruitment.syncing_intake', true), 'off') = 'on' THEN
    RETURN NEW;
  END IF;

  BEGIN
    IF TG_OP = 'INSERT' THEN
      PERFORM public.admin_recruitment_import_intake(NEW.id);
    ELSIF TG_OP = 'UPDATE' THEN
      SELECT * INTO v_req FROM public.admin_recruitment_requisitions WHERE source_ref = NEW.id FOR UPDATE;
      IF NOT FOUND THEN
        PERFORM public.admin_recruitment_import_intake(NEW.id);
      ELSIF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled'
            AND v_req.status NOT IN ('cancelled', 'filled', 'rejected') THEN
        UPDATE public.admin_recruitment_requisitions
        SET status = 'cancelled', closed_at = now(), version = version + 1,
            status_reason = coalesce(public.admin_recruitment_clean(NEW.hr_remarks), 'Withdrawn by the requesting manager')
        WHERE id = v_req.id;
        PERFORM public.admin_recruitment_log(
          NULL, v_req.id, 'requisition', v_req.id, 'cancelled', v_req.status, 'cancelled',
          'Withdrawn by the requesting manager', '{}'::jsonb, 'user', coalesce(v_req.raised_by_name, 'Manager')
        );
      ELSIF NEW.status IN ('approved', 'filled')
            AND v_req.status IN ('submitted', 'pending_approval') THEN
        SELECT approval_levels INTO v_levels FROM public.admin_recruitment_settings WHERE id;
        UPDATE public.admin_recruitment_requisitions
        SET status = CASE WHEN NEW.status = 'filled' THEN 'filled' ELSE 'approved' END,
            approval_level_done = coalesce(approval_levels_required, v_levels, 1),
            decided_at = coalesce(NEW.reviewed_at, now()),
            version = version + 1,
            designation = coalesce(public.admin_recruitment_clean(NEW.designation_requested), designation),
            department = coalesce(public.admin_recruitment_clean(NEW.department), department),
            openings = greatest(1, coalesce(NEW.positions_count, openings)),
            location = NEW.location,
            employment_type = coalesce(public.admin_recruitment_clean(NEW.employment_type), employment_type),
            experience_min = NEW.experience_min_years,
            skills = coalesce(NEW.skills_required, skills),
            qualification = coalesce(NEW.education_qualification, qualification),
            work_experience = coalesce(NEW.work_experience_required, work_experience),
            required_by = NEW.required_by_date,
            reason = NEW.justification,
            replacement_of = coalesce(NEW.replacement_of_person, replacement_of),
            candidate_gender = coalesce(NEW.candidate_gender, candidate_gender),
            age_limit = coalesce(NEW.age_limit, age_limit)
        WHERE id = v_req.id;
        PERFORM public.admin_recruitment_log(
          NULL, v_req.id, 'requisition', v_req.id, 'approved', v_req.status,
          CASE WHEN NEW.status = 'filled' THEN 'filled' ELSE 'approved' END,
          'L1-approved — HR approval skipped',
          jsonb_build_object('hr_gate', 'skipped'),
          'system', 'System'
        );
      ELSIF v_req.status IN ('submitted', 'pending_approval') THEN
        UPDATE public.admin_recruitment_requisitions
        SET designation = coalesce(public.admin_recruitment_clean(NEW.designation_requested), designation),
            department = coalesce(public.admin_recruitment_clean(NEW.department), department),
            openings = greatest(1, coalesce(NEW.positions_count, openings)),
            location = NEW.location,
            employment_type = coalesce(public.admin_recruitment_clean(NEW.employment_type), employment_type),
            experience_min = NEW.experience_min_years,
            skills = NEW.skills_required,
            required_by = NEW.required_by_date,
            reason = NEW.justification
        WHERE id = v_req.id;
      END IF;
    END IF;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'admin recruitment intake bridge: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4) Backfill current data
-- ---------------------------------------------------------------------------
UPDATE public.hr_candidate_requisitions h
SET status = 'approved',
    reviewed_at = coalesce(h.reviewed_at, now()),
    updated_at = now()
WHERE h.status = 'pending'
  AND EXISTS (
    SELECT 1
    FROM indus_one.candidate_requisition_requests r
    WHERE r.hr_requisition_id = h.id
      AND r.l1_status = 'approved'
  );

UPDATE public.admin_recruitment_requisitions a
SET
  status = 'approved',
  approval_level_done = greatest(coalesce(a.approval_levels_required, 1), coalesce(a.approval_level_done, 0)),
  decided_at = coalesce(a.decided_at, now()),
  version = a.version + 1,
  updated_at = now()
WHERE a.source = 'indus_one'
  AND a.status IN ('pending_approval', 'submitted');

-- Import any L1-forwarded intake rows not yet in admin
DO $$
DECLARE
  r record;
BEGIN
  IF to_regclass('public.hr_candidate_requisitions') IS NULL THEN
    RETURN;
  END IF;
  FOR r IN
    SELECT h.id
    FROM public.hr_candidate_requisitions h
    WHERE NOT EXISTS (
      SELECT 1 FROM public.admin_recruitment_requisitions a WHERE a.source_ref = h.id
    )
    ORDER BY h.created_at
  LOOP
    PERFORM public.admin_recruitment_import_intake(r.id);
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
