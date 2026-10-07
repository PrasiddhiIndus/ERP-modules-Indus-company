-- =============================================================================
-- Admin In-house Recruitment — candidate lifecycle, screening and interviews.
--
-- Candidate stages: New → Screening → Shortlisted → Interview → Selected → Offer →
-- Offer Accepted → Appointment → Documents → Ready to Join → Joined → Employee Created.
-- Closed outcomes: rejected, withdrawn, no_show, offer_declined, offer_expired, cancelled.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Duplicate detection
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_recruitment_find_duplicates(
  p_phone text,
  p_email text,
  p_exclude_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone text := public.admin_recruitment_phone_key(p_phone);
  v_email text := public.admin_recruitment_email_key(p_email);
  v_result jsonb;
BEGIN
  PERFORM public.admin_recruitment_require('view');
  IF v_phone IS NULL AND v_email IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id,
           'candidateNo', c.candidate_no,
           'name', c.full_name,
           'phone', c.phone,
           'email', c.email,
           'stage', c.stage,
           'outcome', c.outcome,
           'live', c.outcome IS NULL AND c.stage <> 'employee_created',
           'matchedOn', CASE
             WHEN v_phone IS NOT NULL AND c.phone_key = v_phone AND v_email IS NOT NULL AND c.email_key = v_email THEN 'phone and email'
             WHEN v_phone IS NOT NULL AND c.phone_key = v_phone THEN 'phone'
             ELSE 'email'
           END,
           'createdAt', c.created_at
         ) ORDER BY c.created_at DESC), '[]'::jsonb)
    INTO v_result
  FROM public.admin_recruitment_candidates c
  WHERE (p_exclude_id IS NULL OR c.id <> p_exclude_id)
    AND ((v_phone IS NOT NULL AND c.phone_key = v_phone) OR (v_email IS NOT NULL AND c.email_key = v_email));

  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- Candidate create (with duplicate check and idempotency)
-- Returns { status: 'created', candidate } or { status: 'duplicate', matches }.
-- ---------------------------------------------------------------------------
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
    PERFORM 1 FROM public.admin_recruitment_requisitions
    WHERE id = v_req_id AND status IN ('approved', 'open');
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Candidates can only be added to approved requisitions.';
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
      v_source, v_ref_emp, v_ref_name,
      public.admin_recruitment_clean(p_payload ->> 'referralNotes'),
      v_recruiter, public.admin_recruitment_actor_name(v_recruiter),
      'new', v_resume, auth.uid(), public.admin_recruitment_actor_name(auth.uid())
    )
    RETURNING * INTO v_c;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'This person is already in an active recruitment pipeline (same mobile number or email).';
  END;

  PERFORM public.admin_recruitment_log(
    v_c.id, v_c.requisition_id, 'candidate', v_c.id, 'candidate_added', NULL, 'new',
    CASE WHEN v_ref_emp IS NOT NULL THEN 'Referred by ' || v_ref_name ELSE 'Added via ' || v_source END,
    jsonb_build_object('source', v_source, 'duplicateConfirmed', jsonb_array_length(v_matches) > 0)
  );
  IF v_resume IS NOT NULL THEN
    PERFORM public.admin_recruitment_log(
      v_c.id, v_c.requisition_id, 'candidate', v_c.id, 'resume_uploaded', NULL, NULL,
      'Resume attached', jsonb_build_object('fileName', v_resume ->> 'fileName')
    );
  END IF;

  RETURN public.admin_recruitment_request_end(
    p_request_key, 'candidate_create',
    jsonb_build_object('status', 'created', 'candidate', to_jsonb(v_c))
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Candidate profile update (not stage)
-- ---------------------------------------------------------------------------
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
      v_changes := v_changes || 'requisition';
    END IF;
  ELSE
    v_new_req := v_c.requisition_id;
  END IF;

  IF p_payload ? 'recruiterId' THEN
    v_recruiter := nullif(p_payload ->> 'recruiterId', '')::uuid;
    IF v_recruiter IS DISTINCT FROM v_c.recruiter_id THEN
      v_changes := v_changes || 'recruiter';
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

CREATE OR REPLACE FUNCTION public.admin_recruitment_candidate_set_resume(p_id uuid, p_file jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c public.admin_recruitment_candidates%rowtype;
BEGIN
  PERFORM public.admin_recruitment_require('candidates');
  IF p_file IS NULL OR public.admin_recruitment_clean(p_file ->> 'objectKey') IS NULL THEN
    RAISE EXCEPTION 'Resume file is missing.';
  END IF;
  IF (p_file ->> 'objectKey') NOT LIKE 'admin-recruitment/' || p_id::text || '/%' THEN
    RAISE EXCEPTION 'Invalid resume file.';
  END IF;
  UPDATE public.admin_recruitment_candidates
  SET resume = p_file || jsonb_build_object('uploadedAt', now()), version = version + 1
  WHERE id = p_id
  RETURNING * INTO v_c;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidate not found.';
  END IF;
  PERFORM public.admin_recruitment_log(
    v_c.id, v_c.requisition_id, 'candidate', v_c.id, 'resume_uploaded', NULL, NULL,
    'Resume attached', jsonb_build_object('fileName', p_file ->> 'fileName')
  );
  RETURN to_jsonb(v_c);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_recruitment_candidate_note(p_id uuid, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req uuid;
  v_note text := public.admin_recruitment_clean(p_note);
BEGIN
  PERFORM public.admin_recruitment_require('view');
  IF v_note IS NULL THEN
    RAISE EXCEPTION 'Write a note first.';
  END IF;
  SELECT requisition_id INTO v_req FROM public.admin_recruitment_candidates WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidate not found.';
  END IF;
  PERFORM public.admin_recruitment_log(p_id, v_req, 'candidate', p_id, 'note', NULL, NULL, left(v_note, 2000), '{}'::jsonb);
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- Screening & calling log (first entry moves New → Screening)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_recruitment_screening_log(p_candidate_id uuid, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c public.admin_recruitment_candidates%rowtype;
  v_kind text := coalesce(public.admin_recruitment_clean(p_payload ->> 'kind'), 'call');
  v_outcome text := public.admin_recruitment_clean(p_payload ->> 'callOutcome');
  v_result text := public.admin_recruitment_clean(p_payload ->> 'result');
  v_notes text := public.admin_recruitment_clean(p_payload ->> 'notes');
  v_row public.admin_recruitment_screenings%rowtype;
BEGIN
  PERFORM public.admin_recruitment_require('candidates');

  SELECT * INTO v_c FROM public.admin_recruitment_candidates WHERE id = p_candidate_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidate not found.';
  END IF;
  PERFORM public.admin_recruitment_assert_live(v_c);
  IF v_kind NOT IN ('call', 'screening') THEN
    RAISE EXCEPTION 'Unknown entry type.';
  END IF;
  IF v_kind = 'call' AND v_outcome IS NULL THEN
    RAISE EXCEPTION 'Select the call outcome.';
  END IF;
  IF v_kind = 'screening' AND v_result IS NULL THEN
    RAISE EXCEPTION 'Select the screening result.';
  END IF;
  IF v_kind = 'screening' AND v_notes IS NULL THEN
    RAISE EXCEPTION 'Add screening notes.';
  END IF;

  INSERT INTO public.admin_recruitment_screenings (
    candidate_id, kind, call_outcome, result, notes, follow_up_at, created_by, created_by_name
  ) VALUES (
    p_candidate_id, v_kind,
    CASE WHEN v_kind = 'call' THEN v_outcome END,
    CASE WHEN v_kind = 'screening' THEN v_result END,
    v_notes,
    nullif(p_payload ->> 'followUpAt', '')::timestamptz,
    auth.uid(), public.admin_recruitment_actor_name(auth.uid())
  )
  RETURNING * INTO v_row;

  PERFORM public.admin_recruitment_log(
    p_candidate_id, v_c.requisition_id, 'screening', v_row.id,
    CASE WHEN v_kind = 'call' THEN 'called' ELSE 'screened' END,
    NULL, coalesce(v_result, v_outcome),
    CASE WHEN v_kind = 'call' THEN 'Call: ' || replace(v_outcome, '_', ' ')
         ELSE 'Screening result: ' || v_result END
      || CASE WHEN v_notes IS NOT NULL THEN ' — ' || left(v_notes, 300) ELSE '' END,
    jsonb_build_object('kind', v_kind)
  );

  IF v_c.stage = 'new' THEN
    PERFORM public.admin_recruitment_set_stage(p_candidate_id, 'screening', 'Screening started', '{}'::jsonb);
  END IF;

  RETURN to_jsonb(v_row);
END;
$$;

-- ---------------------------------------------------------------------------
-- Manual stage moves (only the decision points; the rest happen automatically)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_recruitment_candidate_move(
  p_id uuid,
  p_to text,
  p_note text DEFAULT NULL,
  p_expected_version integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c public.admin_recruitment_candidates%rowtype;
  v_from_rank integer;
  v_to_rank integer;
  v_last_eval record;
  v_note text := public.admin_recruitment_clean(p_note);
BEGIN
  PERFORM public.admin_recruitment_require('candidates');

  SELECT * INTO v_c FROM public.admin_recruitment_candidates WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidate not found.';
  END IF;
  PERFORM public.admin_recruitment_check_version(p_expected_version, v_c.version);
  PERFORM public.admin_recruitment_assert_live(v_c);

  v_from_rank := public.admin_recruitment_stage_rank(v_c.stage);
  v_to_rank := public.admin_recruitment_stage_rank(p_to);
  IF v_to_rank IS NULL THEN
    RAISE EXCEPTION 'Unknown stage.';
  END IF;
  IF p_to = v_c.stage THEN
    RETURN to_jsonb(v_c);
  END IF;

  IF p_to NOT IN ('screening', 'shortlisted', 'interview', 'selected') THEN
    RAISE EXCEPTION '%', CASE p_to
      WHEN 'new' THEN 'Candidates cannot be moved back to New.'
      WHEN 'offer' THEN 'Generate an offer letter to move the candidate to Offer.'
      WHEN 'offer_accepted' THEN 'Record the candidate''s offer response to move to Offer Accepted.'
      WHEN 'appointment' THEN 'Generate the appointment letter to move to Appointment.'
      WHEN 'documents' THEN 'The signed appointment letter moves the candidate to Documents.'
      WHEN 'ready_to_join' THEN 'The candidate becomes Ready to Join once all mandatory documents are verified.'
      WHEN 'joined' THEN 'Use Mark joined on the Joining page.'
      ELSE 'Use Convert to employee on the Employee Conversion page.'
    END;
  END IF;

  IF v_from_rank >= public.admin_recruitment_stage_rank('offer') THEN
    RAISE EXCEPTION 'This candidate already has an offer. Withdraw the offer before moving back.';
  END IF;

  IF v_to_rank < v_from_rank THEN
    IF EXISTS (SELECT 1 FROM public.admin_recruitment_interviews WHERE candidate_id = p_id AND status = 'scheduled')
       AND p_to IN ('screening', 'shortlisted') THEN
      RAISE EXCEPTION 'Cancel the scheduled interview before moving the candidate back.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.admin_recruitment_offers WHERE candidate_id = p_id AND status = 'draft') THEN
      RAISE EXCEPTION 'Discard the draft offer before moving the candidate back.';
    END IF;
    IF v_note IS NULL THEN
      RAISE EXCEPTION 'Add a short reason for moving the candidate back.';
    END IF;
  ELSE
    CASE p_to
      WHEN 'screening' THEN
        NULL;
      WHEN 'shortlisted' THEN
        IF NOT EXISTS (
          SELECT 1 FROM public.admin_recruitment_screenings
          WHERE candidate_id = p_id AND kind = 'screening' AND result = 'pass'
        ) THEN
          RAISE EXCEPTION 'Record a passed screening before shortlisting.';
        END IF;
      WHEN 'interview' THEN
        RAISE EXCEPTION 'Schedule an interview to move the candidate to Interview.';
      WHEN 'selected' THEN
        IF v_c.stage <> 'interview' THEN
          RAISE EXCEPTION 'Only candidates in Interview can be selected.';
        END IF;
        IF EXISTS (
          SELECT 1 FROM public.admin_recruitment_interviews
          WHERE candidate_id = p_id AND status IN ('scheduled', 'attended')
        ) THEN
          RAISE EXCEPTION 'Complete and evaluate every interview round before selecting the candidate.';
        END IF;
        SELECT recommendation, round_name INTO v_last_eval
        FROM public.admin_recruitment_interviews
        WHERE candidate_id = p_id AND status = 'evaluated'
        ORDER BY evaluated_at DESC NULLS LAST
        LIMIT 1;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'An evaluated interview is required before selection.';
        END IF;
        IF v_last_eval.recommendation NOT IN ('strong_hire', 'hire') THEN
          RAISE EXCEPTION 'The latest interview recommendation is "%". Selection needs a Hire or Strong hire recommendation.',
            replace(v_last_eval.recommendation, '_', ' ');
        END IF;
        PERFORM public.admin_recruitment_use_requisition(v_c.requisition_id, p_id);
      ELSE
        NULL;
    END CASE;
  END IF;

  PERFORM public.admin_recruitment_set_stage(
    p_id, p_to,
    CASE p_to
      WHEN 'screening' THEN 'Moved to Screening'
      WHEN 'shortlisted' THEN 'Shortlisted'
      WHEN 'interview' THEN 'Moved back to Interview'
      ELSE 'Selected after interview'
    END || CASE WHEN v_note IS NOT NULL THEN ' — ' || v_note ELSE '' END,
    jsonb_build_object('note', v_note)
  );

  SELECT * INTO v_c FROM public.admin_recruitment_candidates WHERE id = p_id;
  RETURN to_jsonb(v_c);
END;
$$;

-- Internal: side effects of closing a candidate (cancel interviews, withdraw open offers / letters).
CREATE OR REPLACE FUNCTION public.admin_recruitment_close_side_effects(p_candidate_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_req uuid;
BEGIN
  SELECT requisition_id INTO v_req FROM public.admin_recruitment_candidates WHERE id = p_candidate_id;

  FOR r IN
    UPDATE public.admin_recruitment_interviews
    SET status = 'cancelled', status_reason = p_reason, version = version + 1
    WHERE candidate_id = p_candidate_id AND status = 'scheduled'
    RETURNING id
  LOOP
    PERFORM public.admin_recruitment_log(p_candidate_id, v_req, 'interview', r.id, 'interview_cancelled', 'scheduled', 'cancelled', 'Interview cancelled — candidate closed', '{}'::jsonb);
  END LOOP;

  FOR r IN
    UPDATE public.admin_recruitment_offers
    SET status = 'withdrawn', closed_reason = p_reason, version = version + 1
    WHERE candidate_id = p_candidate_id AND status IN ('draft', 'generated', 'sent', 'viewed')
    RETURNING id, offer_ref
  LOOP
    PERFORM public.admin_recruitment_log(p_candidate_id, v_req, 'offer', r.id, 'offer_withdrawn', NULL, 'withdrawn', 'Offer withdrawn — candidate closed', jsonb_build_object('offerRef', r.offer_ref));
  END LOOP;

  FOR r IN
    UPDATE public.admin_recruitment_appointments
    SET status = 'cancelled', closed_reason = p_reason, version = version + 1
    WHERE candidate_id = p_candidate_id AND status IN ('generated', 'sent', 'viewed')
    RETURNING id, appointment_ref
  LOOP
    PERFORM public.admin_recruitment_log(p_candidate_id, v_req, 'appointment', r.id, 'appointment_cancelled', NULL, 'cancelled', 'Appointment letter cancelled — candidate closed', jsonb_build_object('appointmentRef', r.appointment_ref));
  END LOOP;

  UPDATE public.admin_recruitment_portal_tokens
  SET revoked_at = now()
  WHERE candidate_id = p_candidate_id AND revoked_at IS NULL;
END;
$$;

-- Close a candidate: rejected / withdrawn / cancelled (other outcomes are set by their workflow step).
CREATE OR REPLACE FUNCTION public.admin_recruitment_candidate_close(
  p_id uuid,
  p_outcome text,
  p_reason text,
  p_expected_version integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c public.admin_recruitment_candidates%rowtype;
  v_reason text := public.admin_recruitment_clean(p_reason);
BEGIN
  PERFORM public.admin_recruitment_require('candidates');
  IF p_outcome NOT IN ('rejected', 'withdrawn', 'cancelled') THEN
    RAISE EXCEPTION 'Choose Rejected, Withdrawn or Cancelled.';
  END IF;
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Enter a reason.';
  END IF;

  SELECT * INTO v_c FROM public.admin_recruitment_candidates WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidate not found.';
  END IF;
  PERFORM public.admin_recruitment_check_version(p_expected_version, v_c.version);
  PERFORM public.admin_recruitment_assert_live(v_c);
  IF public.admin_recruitment_stage_rank(v_c.stage) >= public.admin_recruitment_stage_rank('joined') THEN
    RAISE EXCEPTION 'Joined candidates cannot be closed here.';
  END IF;

  PERFORM public.admin_recruitment_close_side_effects(p_id, v_reason);

  UPDATE public.admin_recruitment_candidates
  SET outcome = p_outcome, outcome_reason = v_reason, outcome_at = now(), version = version + 1
  WHERE id = p_id
  RETURNING * INTO v_c;

  PERFORM public.admin_recruitment_log(
    p_id, v_c.requisition_id, 'candidate', p_id, 'closed', v_c.stage, p_outcome,
    initcap(p_outcome) || ' — ' || v_reason, jsonb_build_object('reason', v_reason)
  );
  RETURN to_jsonb(v_c);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_recruitment_candidate_reopen(
  p_id uuid,
  p_reason text,
  p_expected_version integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c public.admin_recruitment_candidates%rowtype;
  v_reason text := public.admin_recruitment_clean(p_reason);
  v_prev text;
  v_stage text;
BEGIN
  PERFORM public.admin_recruitment_require('candidates');
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Enter a reason for reopening.';
  END IF;

  SELECT * INTO v_c FROM public.admin_recruitment_candidates WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidate not found.';
  END IF;
  PERFORM public.admin_recruitment_check_version(p_expected_version, v_c.version);
  IF v_c.outcome IS NULL THEN
    RAISE EXCEPTION 'This candidate is not closed.';
  END IF;
  v_prev := v_c.outcome;

  -- Offers that ended need a fresh offer; pre-offer pipeline positions stay where they were.
  v_stage := CASE
    WHEN v_c.stage IN ('offer', 'offer_accepted', 'appointment', 'documents', 'ready_to_join')
         AND v_prev IN ('offer_declined', 'offer_expired', 'rejected', 'withdrawn', 'cancelled')
         AND NOT EXISTS (SELECT 1 FROM public.admin_recruitment_offers WHERE candidate_id = p_id AND status = 'accepted')
      THEN 'selected'
    ELSE v_c.stage
  END;

  BEGIN
    UPDATE public.admin_recruitment_candidates
    SET outcome = NULL, outcome_reason = NULL, outcome_at = NULL, stage = v_stage, version = version + 1
    WHERE id = p_id
    RETURNING * INTO v_c;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'This person already has another active recruitment record. Continue with that record instead.';
  END;

  PERFORM public.admin_recruitment_log(
    p_id, v_c.requisition_id, 'candidate', p_id, 'reopened', v_prev, v_stage,
    'Reopened — ' || v_reason, jsonb_build_object('reason', v_reason)
  );
  RETURN to_jsonb(v_c);
END;
$$;

-- ---------------------------------------------------------------------------
-- Interviews
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_recruitment_interview_schedule(
  p_candidate_id uuid,
  p_payload jsonb,
  p_request_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev jsonb;
  v_c public.admin_recruitment_candidates%rowtype;
  v_at timestamptz := nullif(p_payload ->> 'scheduledAt', '')::timestamptz;
  v_mode text := lower(coalesce(public.admin_recruitment_clean(p_payload ->> 'mode'), 'office'));
  v_interviewers jsonb := CASE WHEN jsonb_typeof(p_payload -> 'interviewers') = 'array' THEN p_payload -> 'interviewers' ELSE '[]'::jsonb END;
  v_round integer;
  v_row public.admin_recruitment_interviews%rowtype;
BEGIN
  PERFORM public.admin_recruitment_require('interviews');

  v_prev := public.admin_recruitment_request_begin(p_request_key, 'interview_schedule');
  IF v_prev IS NOT NULL THEN
    RETURN v_prev;
  END IF;

  SELECT * INTO v_c FROM public.admin_recruitment_candidates WHERE id = p_candidate_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidate not found.';
  END IF;
  PERFORM public.admin_recruitment_assert_live(v_c);
  IF v_c.stage NOT IN ('shortlisted', 'interview') THEN
    RAISE EXCEPTION 'Interviews can be scheduled for shortlisted candidates (current stage: %).', replace(v_c.stage, '_', ' ');
  END IF;
  IF v_at IS NULL THEN
    RAISE EXCEPTION 'Interview date and time are required.';
  END IF;
  IF v_at < now() - interval '5 minutes' THEN
    RAISE EXCEPTION 'The interview time is in the past.';
  END IF;
  IF v_mode NOT IN ('office', 'online', 'phone') THEN
    RAISE EXCEPTION 'Choose Office, Online or Phone.';
  END IF;
  IF jsonb_array_length(v_interviewers) = 0
     OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_interviewers) i WHERE public.admin_recruitment_clean(i ->> 'name') IS NOT NULL) THEN
    RAISE EXCEPTION 'Assign at least one interviewer.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.admin_recruitment_interviews WHERE candidate_id = p_candidate_id AND status = 'scheduled') THEN
    RAISE EXCEPTION 'This candidate already has a scheduled interview. Reschedule or complete it first.';
  END IF;

  PERFORM public.admin_recruitment_use_requisition(v_c.requisition_id, p_candidate_id);

  SELECT coalesce(max(round_no), 0) + 1 INTO v_round
  FROM public.admin_recruitment_interviews
  WHERE candidate_id = p_candidate_id AND status IN ('attended', 'evaluated');

  INSERT INTO public.admin_recruitment_interviews (
    candidate_id, round_no, round_name, scheduled_at, duration_mins, mode, location, interviewers,
    status, created_by, created_by_name
  ) VALUES (
    p_candidate_id, v_round,
    coalesce(public.admin_recruitment_clean(p_payload ->> 'roundName'), 'Round ' || v_round),
    v_at,
    coalesce(public.admin_recruitment_num(p_payload ->> 'durationMins')::integer, 45),
    v_mode,
    public.admin_recruitment_clean(p_payload ->> 'location'),
    v_interviewers,
    'scheduled', auth.uid(), public.admin_recruitment_actor_name(auth.uid())
  )
  RETURNING * INTO v_row;

  PERFORM public.admin_recruitment_log(
    p_candidate_id, v_c.requisition_id, 'interview', v_row.id, 'interview_scheduled', NULL, 'scheduled',
    format('%s scheduled (%s) with %s', v_row.round_name, v_mode,
           (SELECT string_agg(i ->> 'name', ', ') FROM jsonb_array_elements(v_interviewers) i)),
    jsonb_build_object('scheduledAt', v_at)
  );

  IF v_c.stage = 'shortlisted' THEN
    PERFORM public.admin_recruitment_set_stage(p_candidate_id, 'interview', 'Moved to Interview', '{}'::jsonb);
  END IF;

  RETURN public.admin_recruitment_request_end(p_request_key, 'interview_schedule', to_jsonb(v_row));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_recruitment_interview_set_status(
  p_id uuid,
  p_status text,
  p_reason text DEFAULT NULL,
  p_close_candidate boolean DEFAULT false,
  p_expected_version integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_i public.admin_recruitment_interviews%rowtype;
  v_c public.admin_recruitment_candidates%rowtype;
  v_reason text := public.admin_recruitment_clean(p_reason);
BEGIN
  PERFORM public.admin_recruitment_require('interviews');
  IF p_status NOT IN ('attended', 'no_show', 'cancelled') THEN
    RAISE EXCEPTION 'Choose Attended, No-show or Cancelled.';
  END IF;

  SELECT * INTO v_i FROM public.admin_recruitment_interviews WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Interview not found.';
  END IF;
  PERFORM public.admin_recruitment_check_version(p_expected_version, v_i.version);
  SELECT * INTO v_c FROM public.admin_recruitment_candidates WHERE id = v_i.candidate_id FOR UPDATE;
  PERFORM public.admin_recruitment_assert_live(v_c);

  IF v_i.status <> 'scheduled' THEN
    RAISE EXCEPTION 'Only scheduled interviews can be updated (current status: %).', replace(v_i.status, '_', ' ');
  END IF;
  IF p_status IN ('attended', 'no_show') AND v_i.scheduled_at > now() + interval '30 minutes' THEN
    RAISE EXCEPTION 'Attendance can be recorded once the interview time arrives.';
  END IF;
  IF p_status = 'cancelled' AND v_reason IS NULL THEN
    RAISE EXCEPTION 'Enter a reason for cancelling the interview.';
  END IF;

  UPDATE public.admin_recruitment_interviews
  SET status = p_status,
      status_reason = v_reason,
      attended_at = CASE WHEN p_status = 'attended' THEN now() ELSE attended_at END,
      version = version + 1
  WHERE id = p_id
  RETURNING * INTO v_i;

  PERFORM public.admin_recruitment_log(
    v_i.candidate_id, v_c.requisition_id, 'interview', v_i.id,
    CASE p_status WHEN 'attended' THEN 'interview_attended' WHEN 'no_show' THEN 'interview_no_show' ELSE 'interview_cancelled' END,
    'scheduled', p_status,
    v_i.round_name || ' — ' || CASE p_status WHEN 'attended' THEN 'attended' WHEN 'no_show' THEN 'candidate did not attend' ELSE 'cancelled' END
      || CASE WHEN v_reason IS NOT NULL THEN ' (' || v_reason || ')' ELSE '' END,
    '{}'::jsonb
  );

  IF p_status = 'no_show' AND coalesce(p_close_candidate, false) THEN
    PERFORM public.admin_recruitment_close_side_effects(v_c.id, coalesce(v_reason, 'Interview no-show'));
    UPDATE public.admin_recruitment_candidates
    SET outcome = 'no_show', outcome_reason = coalesce(v_reason, 'Did not attend the interview'), outcome_at = now(), version = version + 1
    WHERE id = v_c.id;
    PERFORM public.admin_recruitment_log(
      v_c.id, v_c.requisition_id, 'candidate', v_c.id, 'closed', v_c.stage, 'no_show',
      'Closed as no-show', jsonb_build_object('reason', v_reason)
    );
  END IF;

  RETURN to_jsonb(v_i);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_recruitment_interview_reschedule(
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
  v_old public.admin_recruitment_interviews%rowtype;
  v_new public.admin_recruitment_interviews%rowtype;
  v_c public.admin_recruitment_candidates%rowtype;
  v_at timestamptz := nullif(p_payload ->> 'scheduledAt', '')::timestamptz;
  v_reason text := public.admin_recruitment_clean(p_payload ->> 'reason');
  v_mode text;
BEGIN
  PERFORM public.admin_recruitment_require('interviews');

  SELECT * INTO v_old FROM public.admin_recruitment_interviews WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Interview not found.';
  END IF;
  PERFORM public.admin_recruitment_check_version(p_expected_version, v_old.version);
  SELECT * INTO v_c FROM public.admin_recruitment_candidates WHERE id = v_old.candidate_id FOR UPDATE;
  PERFORM public.admin_recruitment_assert_live(v_c);

  IF v_old.status NOT IN ('scheduled', 'no_show') THEN
    RAISE EXCEPTION 'Only scheduled or no-show interviews can be rescheduled.';
  END IF;
  IF v_at IS NULL OR v_at < now() THEN
    RAISE EXCEPTION 'Choose a new interview time in the future.';
  END IF;
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Enter a reason for rescheduling.';
  END IF;
  v_mode := lower(coalesce(public.admin_recruitment_clean(p_payload ->> 'mode'), v_old.mode));
  IF v_mode NOT IN ('office', 'online', 'phone') THEN
    RAISE EXCEPTION 'Choose Office, Online or Phone.';
  END IF;

  UPDATE public.admin_recruitment_interviews
  SET status = 'rescheduled', status_reason = v_reason, version = version + 1
  WHERE id = p_id;

  INSERT INTO public.admin_recruitment_interviews (
    candidate_id, round_no, round_name, scheduled_at, duration_mins, mode, location, interviewers,
    status, rescheduled_from, created_by, created_by_name
  ) VALUES (
    v_old.candidate_id, v_old.round_no, v_old.round_name, v_at, v_old.duration_mins, v_mode,
    coalesce(public.admin_recruitment_clean(p_payload ->> 'location'), v_old.location),
    CASE WHEN jsonb_typeof(p_payload -> 'interviewers') = 'array' AND jsonb_array_length(p_payload -> 'interviewers') > 0
         THEN p_payload -> 'interviewers' ELSE v_old.interviewers END,
    'scheduled', v_old.id, auth.uid(), public.admin_recruitment_actor_name(auth.uid())
  )
  RETURNING * INTO v_new;

  PERFORM public.admin_recruitment_log(
    v_old.candidate_id, v_c.requisition_id, 'interview', v_new.id, 'interview_rescheduled', v_old.status, 'scheduled',
    v_old.round_name || ' rescheduled — ' || v_reason,
    jsonb_build_object('previousAt', v_old.scheduled_at, 'newAt', v_at, 'previousInterviewId', v_old.id)
  );
  RETURN to_jsonb(v_new);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_recruitment_interview_evaluate(
  p_id uuid,
  p_ratings jsonb,
  p_recommendation text,
  p_remarks text,
  p_expected_version integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_i public.admin_recruitment_interviews%rowtype;
  v_c public.admin_recruitment_candidates%rowtype;
  v_avg numeric;
  v_bad integer;
  v_remarks text := public.admin_recruitment_clean(p_remarks);
  v_first boolean;
BEGIN
  PERFORM public.admin_recruitment_require('interviews');
  IF p_recommendation NOT IN ('strong_hire', 'hire', 'hold', 'reject') THEN
    RAISE EXCEPTION 'Choose a final recommendation.';
  END IF;
  IF jsonb_typeof(p_ratings) <> 'object' OR p_ratings = '{}'::jsonb THEN
    RAISE EXCEPTION 'Rate the candidate on the evaluation criteria.';
  END IF;
  SELECT count(*) INTO v_bad
  FROM jsonb_each_text(p_ratings) r
  WHERE r.value !~ '^[1-5]$';
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'Each rating must be between 1 and 5.';
  END IF;
  IF p_recommendation IN ('hold', 'reject') AND v_remarks IS NULL THEN
    RAISE EXCEPTION 'Add remarks explaining the % recommendation.', p_recommendation;
  END IF;

  SELECT * INTO v_i FROM public.admin_recruitment_interviews WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Interview not found.';
  END IF;
  PERFORM public.admin_recruitment_check_version(p_expected_version, v_i.version);
  SELECT * INTO v_c FROM public.admin_recruitment_candidates WHERE id = v_i.candidate_id FOR UPDATE;

  IF v_i.status NOT IN ('attended', 'evaluated') THEN
    RAISE EXCEPTION 'Mark the interview as attended before recording the evaluation.';
  END IF;
  IF v_i.status = 'evaluated' AND public.admin_recruitment_stage_rank(v_c.stage) > public.admin_recruitment_stage_rank('interview') THEN
    RAISE EXCEPTION 'The evaluation is locked because the candidate has moved past the interview stage.';
  END IF;
  v_first := v_i.status = 'attended';

  SELECT round(avg(r.value::numeric), 1) INTO v_avg FROM jsonb_each_text(p_ratings) r;

  UPDATE public.admin_recruitment_interviews
  SET status = 'evaluated',
      ratings = p_ratings,
      overall_rating = v_avg,
      recommendation = p_recommendation,
      remarks = v_remarks,
      evaluated_by = auth.uid(),
      evaluated_by_name = public.admin_recruitment_actor_name(auth.uid()),
      evaluated_at = now(),
      version = version + 1
  WHERE id = p_id
  RETURNING * INTO v_i;

  PERFORM public.admin_recruitment_log(
    v_i.candidate_id, v_c.requisition_id, 'interview', v_i.id,
    CASE WHEN v_first THEN 'interview_evaluated' ELSE 'interview_evaluation_updated' END,
    CASE WHEN v_first THEN 'attended' ELSE 'evaluated' END, 'evaluated',
    format('%s evaluated — %s/5, %s', v_i.round_name, v_avg, replace(p_recommendation, '_', ' ')),
    jsonb_build_object('rating', v_avg, 'recommendation', p_recommendation)
  );
  RETURN to_jsonb(v_i);
END;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.admin_recruitment_close_side_effects(uuid, text) FROM PUBLIC;

DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.admin_recruitment_find_duplicates(text, text, uuid)',
    'public.admin_recruitment_candidate_create(jsonb, boolean, text)',
    'public.admin_recruitment_candidate_update(uuid, jsonb, integer)',
    'public.admin_recruitment_candidate_set_resume(uuid, jsonb)',
    'public.admin_recruitment_candidate_note(uuid, text)',
    'public.admin_recruitment_screening_log(uuid, jsonb)',
    'public.admin_recruitment_candidate_move(uuid, text, text, integer)',
    'public.admin_recruitment_candidate_close(uuid, text, text, integer)',
    'public.admin_recruitment_candidate_reopen(uuid, text, integer)',
    'public.admin_recruitment_interview_schedule(uuid, jsonb, text)',
    'public.admin_recruitment_interview_set_status(uuid, text, text, boolean, integer)',
    'public.admin_recruitment_interview_reschedule(uuid, jsonb, integer)',
    'public.admin_recruitment_interview_evaluate(uuid, jsonb, text, text, integer)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END;
$$;
