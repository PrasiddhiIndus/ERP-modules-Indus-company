-- Allow candidates to be linked to any active requisition (submitted / pending L1 /
-- approved / open), matching the candidate profile & add-candidate dropdowns.

CREATE OR REPLACE FUNCTION public.admin_recruitment_requisition_is_linkable(p_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_recruitment_requisitions
    WHERE id = p_id
      AND status IN ('submitted', 'pending_approval', 'approved', 'open')
  );
$$;

REVOKE ALL ON FUNCTION public.admin_recruitment_requisition_is_linkable(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_recruitment_requisition_is_linkable(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_recruitment_candidate_update(
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
  v_c public.admin_recruitment_candidates%rowtype;
  v_new_req uuid;
  v_phone text;
  v_email text;
  v_recruiter uuid;
  v_changes text[] := '{}';
BEGIN
  PERFORM public.admin_recruitment_require('candidates');

  SELECT * INTO v_c FROM public.admin_recruitment_candidates WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidate not found.';
  END IF;
  PERFORM public.admin_recruitment_check_version(p_expected_version, v_c.version);
  IF v_c.stage = 'employee_created' THEN
    RAISE EXCEPTION 'Converted candidates are maintained in Employee Master.';
  END IF;

  v_phone := CASE WHEN p_payload ? 'phone' THEN public.admin_recruitment_clean(p_payload ->> 'phone') ELSE v_c.phone END;
  v_email := CASE WHEN p_payload ? 'email' THEN public.admin_recruitment_clean(p_payload ->> 'email') ELSE v_c.email END;
  IF v_phone IS NULL AND v_email IS NULL THEN
    RAISE EXCEPTION 'Keep at least a mobile number or an email address.';
  END IF;
  IF v_phone IS NOT NULL AND public.admin_recruitment_phone_key(v_phone) IS NULL THEN
    RAISE EXCEPTION 'Enter a valid 10-digit mobile number.';
  END IF;
  IF v_email IS NOT NULL AND v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Enter a valid email address.';
  END IF;

  IF p_payload ? 'requisitionId' THEN
    v_new_req := nullif(p_payload ->> 'requisitionId', '')::uuid;
    IF v_new_req IS DISTINCT FROM v_c.requisition_id THEN
      IF public.admin_recruitment_stage_rank(v_c.stage) >= public.admin_recruitment_stage_rank('offer') THEN
        RAISE EXCEPTION 'The requisition cannot be changed after an offer has been issued.';
      END IF;
      IF v_new_req IS NOT NULL THEN
        IF NOT public.admin_recruitment_requisition_is_linkable(v_new_req) THEN
          RAISE EXCEPTION 'Candidates can only be linked to active requisitions.';
        END IF;
      ELSIF public.admin_recruitment_stage_rank(v_c.stage) >= public.admin_recruitment_stage_rank('interview') THEN
        RAISE EXCEPTION 'Candidates in interview or later must stay linked to a requisition.';
      END IF;
      v_changes := array_append(v_changes, 'requisition');
    END IF;
  ELSE
    v_new_req := v_c.requisition_id;
  END IF;

  IF p_payload ? 'recruiterId' THEN
    v_recruiter := nullif(p_payload ->> 'recruiterId', '')::uuid;
    IF v_recruiter IS DISTINCT FROM v_c.recruiter_id THEN
      v_changes := array_append(v_changes, 'recruiter');
    END IF;
  ELSE
    v_recruiter := v_c.recruiter_id;
  END IF;

  BEGIN
    UPDATE public.admin_recruitment_candidates SET
      full_name = coalesce(public.admin_recruitment_clean(p_payload ->> 'fullName'), full_name),
      phone = v_phone,
      email = v_email,
      phone_key = public.admin_recruitment_phone_key(v_phone),
      email_key = public.admin_recruitment_email_key(v_email),
      alternate_phone = CASE WHEN p_payload ? 'alternatePhone' THEN public.admin_recruitment_clean(p_payload ->> 'alternatePhone') ELSE alternate_phone END,
      gender = CASE WHEN p_payload ? 'gender' THEN public.admin_recruitment_clean(p_payload ->> 'gender') ELSE gender END,
      date_of_birth = CASE WHEN p_payload ? 'dateOfBirth' THEN public.admin_recruitment_date(p_payload ->> 'dateOfBirth') ELSE date_of_birth END,
      current_location = CASE WHEN p_payload ? 'currentLocation' THEN public.admin_recruitment_clean(p_payload ->> 'currentLocation') ELSE current_location END,
      home_town = CASE WHEN p_payload ? 'homeTown' THEN public.admin_recruitment_clean(p_payload ->> 'homeTown') ELSE home_town END,
      qualification = CASE WHEN p_payload ? 'qualification' THEN public.admin_recruitment_clean(p_payload ->> 'qualification') ELSE qualification END,
      experience_years = CASE WHEN p_payload ? 'experienceYears' THEN public.admin_recruitment_num(p_payload ->> 'experienceYears') ELSE experience_years END,
      current_company = CASE WHEN p_payload ? 'currentCompany' THEN public.admin_recruitment_clean(p_payload ->> 'currentCompany') ELSE current_company END,
      current_designation = CASE WHEN p_payload ? 'currentDesignation' THEN public.admin_recruitment_clean(p_payload ->> 'currentDesignation') ELSE current_designation END,
      current_ctc = CASE WHEN p_payload ? 'currentCtc' THEN public.admin_recruitment_num(p_payload ->> 'currentCtc') ELSE current_ctc END,
      expected_ctc = CASE WHEN p_payload ? 'expectedCtc' THEN public.admin_recruitment_num(p_payload ->> 'expectedCtc') ELSE expected_ctc END,
      notice_period_days = CASE WHEN p_payload ? 'noticePeriodDays' THEN public.admin_recruitment_num(p_payload ->> 'noticePeriodDays')::integer ELSE notice_period_days END,
      skills = CASE WHEN p_payload ? 'skills' THEN public.admin_recruitment_clean(p_payload ->> 'skills') ELSE skills END,
      requisition_id = v_new_req,
      recruiter_id = v_recruiter,
      recruiter_name = CASE WHEN v_recruiter IS DISTINCT FROM recruiter_id THEN public.admin_recruitment_actor_name(v_recruiter) ELSE recruiter_name END,
      version = version + 1
    WHERE id = p_id
    RETURNING * INTO v_c;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Another active candidate already uses this mobile number or email.';
  END;

  PERFORM public.admin_recruitment_log(
    v_c.id, v_c.requisition_id, 'candidate', v_c.id, 'profile_updated', NULL, NULL,
    CASE WHEN 'recruiter' = ANY (v_changes) THEN 'Profile updated · recruiter: ' || coalesce(v_c.recruiter_name, 'unassigned')
         WHEN 'requisition' = ANY (v_changes) THEN 'Profile updated · requisition changed'
         ELSE 'Profile updated' END,
    jsonb_build_object('changed', to_jsonb(v_changes))
  );
  RETURN to_jsonb(v_c);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_recruitment_candidate_update(uuid, jsonb, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_recruitment_candidate_update(uuid, jsonb, integer) TO authenticated;

-- Patch create: replace the approved/open-only check with the shared helper.
CREATE OR REPLACE FUNCTION public.admin_recruitment_candidate_create(
  p_payload jsonb,
  p_confirm_duplicate boolean DEFAULT false,
  p_request_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev jsonb;
  v_name text := public.admin_recruitment_clean(p_payload ->> 'fullName');
  v_phone text := public.admin_recruitment_clean(p_payload ->> 'phone');
  v_email text := public.admin_recruitment_clean(p_payload ->> 'email');
  v_source text := coalesce(public.admin_recruitment_clean(p_payload ->> 'source'), 'Direct application');
  v_req_id uuid := nullif(p_payload ->> 'requisitionId', '')::uuid;
  v_ref_emp bigint := nullif(p_payload ->> 'referredByEmployeeId', '')::bigint;
  v_ref_name text;
  v_recruiter uuid := coalesce(nullif(p_payload ->> 'recruiterId', '')::uuid, auth.uid());
  v_matches jsonb;
  v_c public.admin_recruitment_candidates%rowtype;
  v_resume jsonb := CASE WHEN jsonb_typeof(p_payload -> 'resume') = 'object' THEN p_payload -> 'resume' END;
BEGIN
  PERFORM public.admin_recruitment_require('candidates');

  v_prev := public.admin_recruitment_request_begin(p_request_key, 'candidate_create');
  IF v_prev IS NOT NULL THEN
    RETURN v_prev;
  END IF;

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Candidate name is required.';
  END IF;
  IF v_phone IS NULL AND v_email IS NULL THEN
    RAISE EXCEPTION 'Enter a mobile number or an email address.';
  END IF;
  IF v_phone IS NOT NULL AND public.admin_recruitment_phone_key(v_phone) IS NULL THEN
    RAISE EXCEPTION 'Enter a valid 10-digit mobile number.';
  END IF;
  IF v_email IS NOT NULL AND v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Enter a valid email address.';
  END IF;

  IF lower(v_source) = 'referral' THEN
    IF v_ref_emp IS NULL THEN
      RAISE EXCEPTION 'Select the employee who referred this candidate.';
    END IF;
    SELECT full_name INTO v_ref_name FROM public.admin_ifsp_employee_master WHERE id = v_ref_emp;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The referring employee was not found in Employee Master.';
    END IF;
  ELSE
    v_ref_emp := NULL;
  END IF;

  v_matches := public.admin_recruitment_find_duplicates(v_phone, v_email, NULL);
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_matches) m WHERE (m ->> 'live')::boolean) THEN
    RETURN jsonb_build_object('status', 'duplicate', 'blocking', true, 'matches', v_matches);
  END IF;
  IF jsonb_array_length(v_matches) > 0 AND NOT coalesce(p_confirm_duplicate, false) THEN
    RETURN jsonb_build_object('status', 'duplicate', 'blocking', false, 'matches', v_matches);
  END IF;

  IF v_req_id IS NOT NULL THEN
    IF NOT public.admin_recruitment_requisition_is_linkable(v_req_id) THEN
      RAISE EXCEPTION 'Candidates can only be added to active requisitions.';
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.admin_recruitment_candidates (
      candidate_no, requisition_id, full_name, email, phone, phone_key, email_key, alternate_phone,
      gender, date_of_birth, current_location, home_town, qualification, experience_years,
      current_company, current_designation, current_ctc, expected_ctc, notice_period_days, skills,
      source, referred_by_employee_id, referred_by_name, referral_notes,
      recruiter_id, recruiter_name, stage, resume, created_by, created_by_name
    ) VALUES (
      public.admin_recruitment_next_ref('CAN'), v_req_id, v_name, v_email, v_phone,
      public.admin_recruitment_phone_key(v_phone), public.admin_recruitment_email_key(v_email),
      public.admin_recruitment_clean(p_payload ->> 'alternatePhone'),
      public.admin_recruitment_clean(p_payload ->> 'gender'),
      public.admin_recruitment_date(p_payload ->> 'dateOfBirth'),
      public.admin_recruitment_clean(p_payload ->> 'currentLocation'),
      public.admin_recruitment_clean(p_payload ->> 'homeTown'),
      public.admin_recruitment_clean(p_payload ->> 'qualification'),
      public.admin_recruitment_num(p_payload ->> 'experienceYears'),
      public.admin_recruitment_clean(p_payload ->> 'currentCompany'),
      public.admin_recruitment_clean(p_payload ->> 'currentDesignation'),
      public.admin_recruitment_num(p_payload ->> 'currentCtc'),
      public.admin_recruitment_num(p_payload ->> 'expectedCtc'),
      public.admin_recruitment_num(p_payload ->> 'noticePeriodDays')::integer,
      public.admin_recruitment_clean(p_payload ->> 'skills'),
      v_source, v_ref_emp, v_ref_name, public.admin_recruitment_clean(p_payload ->> 'referralNotes'),
      v_recruiter, public.admin_recruitment_actor_name(v_recruiter), 'new', v_resume,
      auth.uid(), public.admin_recruitment_actor_name(auth.uid())
    )
    RETURNING * INTO v_c;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Another active candidate already uses this mobile number or email.';
  END;

  PERFORM public.admin_recruitment_log(
    v_c.id, v_c.requisition_id, 'candidate', v_c.id, 'created', NULL, 'new',
    'Candidate added' || CASE WHEN v_req_id IS NOT NULL THEN ' · linked to requisition' ELSE '' END,
    jsonb_build_object('source', v_source, 'confirmDuplicate', coalesce(p_confirm_duplicate, false))
  );

  RETURN public.admin_recruitment_request_end(
    p_request_key, 'candidate_create',
    jsonb_build_object('status', 'created', 'candidate', to_jsonb(v_c))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_recruitment_candidate_create(jsonb, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_recruitment_candidate_create(jsonb, boolean, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
