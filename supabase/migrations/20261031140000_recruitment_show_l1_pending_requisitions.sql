-- Show Indus One requisitions that are still waiting on L1 approval in Admin
-- Requisitions (status = pending_approval). Promote them to approved when L1
-- forwards to HR / intake is imported.

ALTER TABLE public.admin_recruitment_requisitions
  ADD COLUMN IF NOT EXISTS indus_one_request_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS admin_recruitment_requisitions_indus_one_request_uidx
  ON public.admin_recruitment_requisitions (indus_one_request_id)
  WHERE indus_one_request_id IS NOT NULL;

COMMENT ON COLUMN public.admin_recruitment_requisitions.indus_one_request_id IS
  'Indus One candidate_requisition_requests.id — used for L1-pending rows before HR intake exists.';

-- ---------------------------------------------------------------------------
-- Upsert Admin row from an Indus One L1 request (pending or decided)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_recruitment_sync_indus_one_request(p_request_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, indus_one
SET row_security = off
AS $$
DECLARE
  r indus_one.candidate_requisition_requests%ROWTYPE;
  v_id uuid;
  v_no text;
  v_status text;
  v_levels integer;
  v_hiring text;
  v_designation text;
  v_l1 text;
BEGIN
  IF p_request_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO r FROM indus_one.candidate_requisition_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_l1 := lower(btrim(coalesce(r.l1_status, 'pending')));

  -- Already linked to HR intake → use intake import (approved path).
  IF r.hr_requisition_id IS NOT NULL THEN
    RETURN public.admin_recruitment_import_intake(r.hr_requisition_id);
  END IF;

  IF v_l1 = 'rejected' THEN
    v_status := 'rejected';
  ELSIF v_l1 = 'cancelled' THEN
    v_status := 'cancelled';
  ELSIF v_l1 = 'approved' THEN
    -- Approved but not yet forwarded — still not ready for recruitment calling.
    v_status := 'pending_approval';
  ELSE
    v_status := 'pending_approval';
  END IF;

  SELECT id INTO v_id
  FROM public.admin_recruitment_requisitions
  WHERE indus_one_request_id = r.id
  FOR UPDATE;

  SELECT approval_levels INTO v_levels FROM public.admin_recruitment_settings WHERE id;

  v_hiring := lower(btrim(coalesce(r.recruitment_type, '')));
  IF v_hiring IN ('new', 'new recruitment', 'new_recruitment') THEN
    v_hiring := 'new_recruitment';
  ELSIF v_hiring IN ('replacement') THEN
    v_hiring := 'replacement';
  ELSE
    v_hiring := NULL;
  END IF;

  v_designation := coalesce(
    public.admin_recruitment_clean(r.position_title),
    public.admin_recruitment_clean(r.designation_requested),
    'Not specified'
  );

  IF v_id IS NOT NULL THEN
    UPDATE public.admin_recruitment_requisitions SET
      designation = v_designation,
      department = public.admin_recruitment_clean(r.department),
      openings = greatest(1, coalesce(r.positions_count, openings, 1)),
      location = r.location,
      employment_type = coalesce(public.admin_recruitment_clean(r.employment_type), employment_type, 'Full Time'),
      experience_min = r.experience_min_years,
      skills = coalesce(r.skills_required, r.justification, skills),
      qualification = coalesce(r.education_qualification, qualification),
      work_experience = coalesce(r.work_experience_required, work_experience),
      required_by = r.required_by_date,
      reason = r.justification,
      hiring_type = coalesce(v_hiring, hiring_type),
      replacement_of = coalesce(r.replacement_of_person, replacement_of),
      candidate_gender = coalesce(r.candidate_gender, candidate_gender),
      age_limit = coalesce(r.age_limit, age_limit),
      status = CASE
        WHEN status IN ('approved', 'open', 'filled') THEN status
        ELSE v_status
      END,
      status_reason = CASE
        WHEN v_status = 'pending_approval' THEN 'Awaiting L1 approval in Indus One'
        WHEN v_status = 'rejected' THEN coalesce(public.admin_recruitment_clean(r.l1_remarks), status_reason)
        ELSE status_reason
      END,
      decided_by_name = CASE
        WHEN v_status IN ('rejected') THEN coalesce(nullif(btrim(r.l1_decided_by_name), ''), decided_by_name)
        ELSE decided_by_name
      END,
      decided_at = CASE
        WHEN v_status IN ('rejected') THEN coalesce(r.l1_decided_at, decided_at)
        ELSE decided_at
      END,
      raised_by_name = coalesce(nullif(btrim(r.employee_name), ''), raised_by_name),
      updated_at = now()
    WHERE id = v_id;
    RETURN v_id;
  END IF;

  v_no := 'L1/' || to_char(timezone('Asia/Kolkata', coalesce(r.created_at, now())), 'YYYY')
    || '/' || upper(substr(replace(r.id::text, '-', ''), 1, 8));
  IF EXISTS (SELECT 1 FROM public.admin_recruitment_requisitions WHERE requisition_no = v_no) THEN
    v_no := v_no || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 4);
  END IF;

  INSERT INTO public.admin_recruitment_requisitions (
    requisition_no, source, source_ref, indus_one_request_id,
    designation, department, openings, location, employment_type,
    experience_min, skills, qualification, work_experience, required_by, reason, status, status_reason,
    hiring_type, replacement_of, candidate_gender, age_limit,
    approval_levels_required, approval_level_done,
    raised_by, raised_by_name, submitted_at, decided_at, decided_by_name, created_at
  ) VALUES (
    v_no, 'indus_one', NULL, r.id,
    v_designation,
    public.admin_recruitment_clean(r.department),
    greatest(1, coalesce(r.positions_count, 1)),
    r.location,
    coalesce(public.admin_recruitment_clean(r.employment_type), 'Full Time'),
    r.experience_min_years,
    coalesce(r.skills_required, r.justification),
    r.education_qualification,
    r.work_experience_required,
    r.required_by_date,
    r.justification,
    v_status,
    CASE
      WHEN v_status = 'pending_approval' THEN 'Awaiting L1 approval in Indus One'
      WHEN v_status = 'rejected' THEN public.admin_recruitment_clean(r.l1_remarks)
      ELSE NULL
    END,
    v_hiring,
    r.replacement_of_person,
    r.candidate_gender,
    r.age_limit,
    coalesce(v_levels, 1),
    0,
    r.raised_by_user_id,
    nullif(btrim(r.employee_name), ''),
    r.created_at,
    CASE WHEN v_status = 'rejected' THEN r.l1_decided_at END,
    CASE WHEN v_status = 'rejected' THEN nullif(btrim(r.l1_decided_by_name), '') END,
    coalesce(r.created_at, now())
  )
  RETURNING id INTO v_id;

  PERFORM public.admin_recruitment_log(
    NULL, v_id, 'requisition', v_id,
    'imported',
    NULL, v_status,
    CASE
      WHEN v_status = 'pending_approval' THEN
        'Raised in Indus One by ' || coalesce(nullif(btrim(r.employee_name), ''), 'manager') || ' — awaiting L1 approval'
      WHEN v_status = 'rejected' THEN
        'Rejected by L1 in Indus One'
      ELSE 'Synced from Indus One'
    END,
    jsonb_build_object('source', 'indus_one', 'l1_status', r.l1_status),
    'user',
    coalesce(nullif(btrim(r.employee_name), ''), 'Manager')
  );

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_recruitment_sync_indus_one_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_recruitment_sync_indus_one_request(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Intake import: promote existing L1-pending Admin row when HR intake arrives
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
  v_indus_id uuid;
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

  SELECT req.id, nullif(btrim(req.l1_decided_by_name), ''), req.l1_decided_at
  INTO v_indus_id, v_approver, v_decided_at
  FROM indus_one.candidate_requisition_requests req
  WHERE req.hr_requisition_id = p_intake_id
  LIMIT 1;

  -- Prefer promoting the L1-pending Admin row for this Indus One request.
  IF v_indus_id IS NOT NULL THEN
    SELECT id INTO v_id
    FROM public.admin_recruitment_requisitions
    WHERE indus_one_request_id = v_indus_id
    FOR UPDATE;
  END IF;

  v_no := public.admin_recruitment_clean(v_row.requisition_no);
  IF v_no IS NULL OR (
    EXISTS (
      SELECT 1 FROM public.admin_recruitment_requisitions
      WHERE requisition_no = v_no AND (v_id IS NULL OR id <> v_id)
    )
  ) THEN
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

  IF v_id IS NOT NULL THEN
    UPDATE public.admin_recruitment_requisitions SET
      requisition_no = v_no,
      source = 'indus_one',
      source_ref = v_row.id,
      indus_one_request_id = coalesce(indus_one_request_id, v_indus_id),
      designation = coalesce(
        public.admin_recruitment_clean(v_row.position_title),
        public.admin_recruitment_clean(v_row.designation_requested),
        designation
      ),
      department = coalesce(public.admin_recruitment_clean(v_row.department), department, v_row.raiser_department),
      openings = greatest(1, coalesce(v_row.positions_count, openings, 1)),
      location = coalesce(v_row.location, location),
      employment_type = coalesce(public.admin_recruitment_clean(v_row.employment_type), employment_type, 'Full Time'),
      experience_min = coalesce(v_row.experience_min_years, experience_min),
      skills = coalesce(v_row.skills_required, v_row.justification, skills),
      qualification = coalesce(v_row.education_qualification, v_row.skills_required, qualification),
      work_experience = coalesce(v_row.work_experience_required, work_experience),
      required_by = coalesce(v_row.required_by_date, required_by),
      reason = coalesce(v_row.justification, reason),
      hiring_type = coalesce(v_hiring, hiring_type),
      replacement_of = coalesce(v_row.replacement_of_person, replacement_of),
      candidate_gender = coalesce(v_row.candidate_gender, candidate_gender),
      age_limit = coalesce(v_row.age_limit, age_limit),
      status = v_status,
      status_reason = CASE WHEN v_status IN ('rejected', 'cancelled') THEN v_row.hr_remarks ELSE NULL END,
      approval_levels_required = coalesce(NULLIF(approval_levels_required, 0), v_levels, 1),
      approval_level_done = CASE WHEN v_status IN ('approved', 'open', 'filled') THEN coalesce(NULLIF(approval_levels_required, 0), v_levels, 1) ELSE approval_level_done END,
      decided_at = CASE WHEN v_status IN ('approved', 'open', 'filled', 'rejected')
        THEN coalesce(v_decided_at, v_row.reviewed_at, v_row.updated_at, now()) END,
      decided_by_name = CASE WHEN v_status IN ('approved', 'open', 'filled', 'rejected') THEN v_approver END,
      opened_at = CASE WHEN v_status IN ('open', 'filled') THEN coalesce(v_row.calling_started_at, v_row.reviewed_at) END,
      closed_at = CASE WHEN v_status IN ('filled', 'cancelled') THEN v_row.updated_at END,
      version = version + 1,
      updated_at = now()
    WHERE id = v_id;

    PERFORM public.admin_recruitment_log(
      NULL, v_id, 'requisition', v_id,
      'approved', 'pending_approval', v_status,
      CASE
        WHEN v_approver IS NOT NULL THEN 'L1-approved by ' || v_approver || ' — ready for recruitment'
        ELSE 'L1-approved from Indus One — ready for recruitment (no HR approval)'
      END,
      jsonb_build_object('source', 'indus_one', 'hr_gate', 'skipped', 'approver', v_approver),
      'user',
      coalesce(v_approver, v_row.raiser_name, 'Manager')
    );
    RETURN v_id;
  END IF;

  INSERT INTO public.admin_recruitment_requisitions (
    requisition_no, source, source_ref, indus_one_request_id, designation, department, openings, location, employment_type,
    experience_min, skills, qualification, work_experience, required_by, reason, status, status_reason,
    hiring_type, replacement_of, candidate_gender, age_limit,
    approval_levels_required, approval_level_done,
    raised_by, raised_by_name, submitted_at, decided_at, decided_by_name, opened_at, closed_at, created_at
  ) VALUES (
    v_no, 'indus_one', v_row.id, v_indus_id,
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
-- Forward to HR: keep existing behaviour, then sync/promote Admin row
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
    UPDATE public.hr_candidate_requisitions
    SET status = 'approved',
        reviewed_at = coalesce(reviewed_at, now()),
        updated_at = now()
    WHERE id = r.hr_requisition_id
      AND status = 'pending';
    PERFORM public.admin_recruitment_import_intake(r.hr_requisition_id);
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

  -- Intake bridge also imports; call explicitly so L1-pending Admin row is promoted.
  PERFORM public.admin_recruitment_import_intake(v_hr_id);

  RETURN v_hr_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Keep Admin in sync as Indus One L1 requests are raised / updated
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_recruitment_indus_one_request_bridge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  BEGIN
    PERFORM public.admin_recruitment_sync_indus_one_request(NEW.id);
  EXCEPTION WHEN others THEN
    RAISE WARNING 'admin recruitment indus one bridge: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_recruitment_indus_one_request_bridge
  ON indus_one.candidate_requisition_requests;
CREATE TRIGGER trg_admin_recruitment_indus_one_request_bridge
  AFTER INSERT OR UPDATE ON indus_one.candidate_requisition_requests
  FOR EACH ROW EXECUTE FUNCTION public.admin_recruitment_indus_one_request_bridge();

-- Backfill current L1-pending (and any unlinked) Indus One requests
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT id
    FROM indus_one.candidate_requisition_requests
    ORDER BY created_at
  LOOP
    PERFORM public.admin_recruitment_sync_indus_one_request(r.id);
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
