-- Fix candidate profile update when linking a requisition (or changing recruiter).
-- On current Postgres, `text[] || 'requisition'` casts the scalar as an array literal
-- and raises 22P02 → UI shows the generic "Could not update the candidate."

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
        PERFORM 1 FROM public.admin_recruitment_requisitions WHERE id = v_new_req AND status IN ('approved', 'open');
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Candidates can only be linked to approved requisitions.';
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

NOTIFY pgrst, 'reload schema';
