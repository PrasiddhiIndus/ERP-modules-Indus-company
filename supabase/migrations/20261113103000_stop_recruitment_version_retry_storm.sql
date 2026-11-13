-- The recruitment "someone else updated this" lock used SQLSTATE 40001.
-- That code means "retry the transaction", so a screen that already saved
-- kept calling admin_recruitment_candidate_update about once a second.
-- Each retry failed again and filled the Postgres error log.
--
-- This does not delete rows, candidates, or modules.
-- A repeated save of the same details now returns the stored candidate.
-- A real clash still keeps the first save and asks the second person to refresh.
-- The leave/tour read that still asks for emp_code gets that column back
-- as a copy of employee_code. employee_code stays the source of truth.

CREATE OR REPLACE FUNCTION public.admin_recruitment_check_version(p_expected integer, p_actual integer)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_expected IS NOT NULL AND p_expected <> p_actual THEN
    RAISE EXCEPTION 'This record was updated by someone else. Refresh and try again.'
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_employee_document_check_version(p_expected integer, p_actual integer)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_expected IS NOT NULL AND p_expected <> p_actual THEN
    RAISE EXCEPTION 'This document was updated by someone else. Refresh and try again.'
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_recruitment_candidate_save_is_noop(
  p_row public.admin_recruitment_candidates,
  p_payload jsonb
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_phone text;
  v_email text;
  v_req uuid;
  v_recruiter uuid;
  v_breakup jsonb;
BEGIN
  IF p_payload IS NULL OR p_payload = '{}'::jsonb THEN
    RETURN true;
  END IF;

  v_phone := CASE WHEN p_payload ? 'phone' THEN public.admin_recruitment_clean(p_payload ->> 'phone') ELSE p_row.phone END;
  v_email := CASE WHEN p_payload ? 'email' THEN public.admin_recruitment_clean(p_payload ->> 'email') ELSE p_row.email END;
  v_req := CASE
    WHEN p_payload ? 'requisitionId' THEN nullif(p_payload ->> 'requisitionId', '')::uuid
    ELSE p_row.requisition_id
  END;
  v_recruiter := CASE
    WHEN p_payload ? 'recruiterId' THEN nullif(p_payload ->> 'recruiterId', '')::uuid
    ELSE p_row.recruiter_id
  END;

  IF p_payload ? 'expectedCtcBreakup' THEN
    v_breakup := p_payload -> 'expectedCtcBreakup';
    IF v_breakup IS NULL OR jsonb_typeof(v_breakup) <> 'object' THEN
      v_breakup := NULL;
    END IF;
  ELSIF p_payload ? 'expectedCtc' THEN
    v_breakup := NULL;
  ELSE
    v_breakup := p_row.expected_ctc_breakup;
  END IF;

  RETURN
    coalesce(public.admin_recruitment_clean(p_payload ->> 'fullName'), p_row.full_name) IS NOT DISTINCT FROM p_row.full_name
    AND v_phone IS NOT DISTINCT FROM p_row.phone
    AND v_email IS NOT DISTINCT FROM p_row.email
    AND (CASE WHEN p_payload ? 'alternatePhone' THEN public.admin_recruitment_clean(p_payload ->> 'alternatePhone') ELSE p_row.alternate_phone END)
        IS NOT DISTINCT FROM p_row.alternate_phone
    AND (CASE WHEN p_payload ? 'gender' THEN public.admin_recruitment_clean(p_payload ->> 'gender') ELSE p_row.gender END)
        IS NOT DISTINCT FROM p_row.gender
    AND (CASE WHEN p_payload ? 'dateOfBirth' THEN public.admin_recruitment_date(p_payload ->> 'dateOfBirth') ELSE p_row.date_of_birth END)
        IS NOT DISTINCT FROM p_row.date_of_birth
    AND (CASE WHEN p_payload ? 'currentLocation' THEN public.admin_recruitment_clean(p_payload ->> 'currentLocation') ELSE p_row.current_location END)
        IS NOT DISTINCT FROM p_row.current_location
    AND (CASE WHEN p_payload ? 'homeTown' THEN public.admin_recruitment_clean(p_payload ->> 'homeTown') ELSE p_row.home_town END)
        IS NOT DISTINCT FROM p_row.home_town
    AND (CASE WHEN p_payload ? 'qualification' THEN public.admin_recruitment_clean(p_payload ->> 'qualification') ELSE p_row.qualification END)
        IS NOT DISTINCT FROM p_row.qualification
    AND (CASE WHEN p_payload ? 'experienceYears' THEN public.admin_recruitment_num(p_payload ->> 'experienceYears') ELSE p_row.experience_years END)
        IS NOT DISTINCT FROM p_row.experience_years
    AND (CASE WHEN p_payload ? 'currentCompany' THEN public.admin_recruitment_clean(p_payload ->> 'currentCompany') ELSE p_row.current_company END)
        IS NOT DISTINCT FROM p_row.current_company
    AND (CASE WHEN p_payload ? 'currentDesignation' THEN public.admin_recruitment_clean(p_payload ->> 'currentDesignation') ELSE p_row.current_designation END)
        IS NOT DISTINCT FROM p_row.current_designation
    AND (CASE WHEN p_payload ? 'currentCtc' THEN public.admin_recruitment_num(p_payload ->> 'currentCtc') ELSE p_row.current_ctc END)
        IS NOT DISTINCT FROM p_row.current_ctc
    AND (CASE WHEN p_payload ? 'expectedCtc' THEN public.admin_recruitment_num(p_payload ->> 'expectedCtc') ELSE p_row.expected_ctc END)
        IS NOT DISTINCT FROM p_row.expected_ctc
    AND v_breakup IS NOT DISTINCT FROM p_row.expected_ctc_breakup
    AND (CASE WHEN p_payload ? 'noticePeriodDays' THEN public.admin_recruitment_num(p_payload ->> 'noticePeriodDays')::integer ELSE p_row.notice_period_days END)
        IS NOT DISTINCT FROM p_row.notice_period_days
    AND (CASE WHEN p_payload ? 'skills' THEN public.admin_recruitment_clean(p_payload ->> 'skills') ELSE p_row.skills END)
        IS NOT DISTINCT FROM p_row.skills
    AND v_req IS NOT DISTINCT FROM p_row.requisition_id
    AND v_recruiter IS NOT DISTINCT FROM p_row.recruiter_id;
END;
$$;

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
  v_breakup jsonb;
BEGIN
  PERFORM public.admin_recruitment_require('candidates');

  SELECT * INTO v_c FROM public.admin_recruitment_candidates WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidate not found.';
  END IF;

  -- Same details again: keep the stored row. Do not raise, and do not bump the version.
  IF public.admin_recruitment_candidate_save_is_noop(v_c, p_payload) THEN
    RETURN to_jsonb(v_c);
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

  IF p_payload ? 'expectedCtcBreakup' THEN
    v_breakup := p_payload -> 'expectedCtcBreakup';
    IF v_breakup IS NULL OR jsonb_typeof(v_breakup) <> 'object' THEN
      v_breakup := NULL;
    END IF;
  ELSIF p_payload ? 'expectedCtc' THEN
    v_breakup := NULL;
  ELSE
    v_breakup := v_c.expected_ctc_breakup;
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
      expected_ctc_breakup = v_breakup,
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
REVOKE ALL ON FUNCTION public.admin_recruitment_candidate_save_is_noop(public.admin_recruitment_candidates, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_recruitment_candidate_save_is_noop(public.admin_recruitment_candidates, jsonb) TO authenticated;

-- Old leave/tour reads still select emp_code. The live column is employee_code.
-- Add emp_code as a mirror. Do not drop employee_code and do not delete tour rows.
CREATE OR REPLACE FUNCTION public.sync_admin_tour_request_emp_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.emp_code IS DISTINCT FROM OLD.emp_code AND NEW.employee_code IS NOT DISTINCT FROM OLD.employee_code THEN
      NEW.employee_code := NEW.emp_code;
    ELSIF NEW.employee_code IS NOT NULL THEN
      NEW.emp_code := NEW.employee_code;
    ELSIF NEW.emp_code IS NOT NULL THEN
      NEW.employee_code := NEW.emp_code;
    END IF;
  ELSE
    IF NEW.employee_code IS NULL THEN
      NEW.employee_code := NEW.emp_code;
    ELSE
      NEW.emp_code := NEW.employee_code;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('indus_one.admin_tour_requests') IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'indus_one' AND table_name = 'admin_tour_requests' AND column_name = 'employee_code'
  ) THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'indus_one' AND table_name = 'admin_tour_requests' AND column_name = 'emp_code'
  ) THEN
    ALTER TABLE indus_one.admin_tour_requests ADD COLUMN emp_code text;
  END IF;

  UPDATE indus_one.admin_tour_requests
  SET emp_code = employee_code
  WHERE employee_code IS NOT NULL
    AND emp_code IS DISTINCT FROM employee_code;

  DROP TRIGGER IF EXISTS trg_admin_tour_requests_sync_emp_code ON indus_one.admin_tour_requests;
  CREATE TRIGGER trg_admin_tour_requests_sync_emp_code
    BEFORE INSERT OR UPDATE ON indus_one.admin_tour_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_admin_tour_request_emp_code();
END;
$$;

NOTIFY pgrst, 'reload schema';
