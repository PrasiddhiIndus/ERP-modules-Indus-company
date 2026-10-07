-- =============================================================================
-- Admin In-house Recruitment — offers, appointment letters, documents, joining and
-- hand-off to Employee Master.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Offers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_recruitment_offer_save_draft(
  p_candidate_id uuid,
  p_offer_id uuid,
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
  v_r public.admin_recruitment_requisitions%rowtype;
  v_o public.admin_recruitment_offers%rowtype;
  v_gross numeric := public.admin_recruitment_num(p_payload ->> 'monthlyGross');
  v_ctc numeric := public.admin_recruitment_num(p_payload ->> 'annualCtc');
  v_join date := public.admin_recruitment_date(p_payload ->> 'joiningDate');
BEGIN
  PERFORM public.admin_recruitment_require('offers');

  SELECT * INTO v_c FROM public.admin_recruitment_candidates WHERE id = p_candidate_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidate not found.';
  END IF;
  PERFORM public.admin_recruitment_assert_live(v_c);
  IF v_c.stage <> 'selected' THEN
    RAISE EXCEPTION 'Offers can be prepared only for selected candidates (current stage: %).', replace(v_c.stage, '_', ' ');
  END IF;
  SELECT * INTO v_r FROM public.admin_recruitment_requisitions WHERE id = v_c.requisition_id;
  IF v_gross IS NOT NULL AND v_gross <= 0 THEN
    RAISE EXCEPTION 'Monthly gross must be greater than zero.';
  END IF;
  IF v_join IS NOT NULL AND v_join < public.admin_recruitment_today() THEN
    RAISE EXCEPTION 'The joining date cannot be in the past.';
  END IF;

  IF p_offer_id IS NULL THEN
    BEGIN
      INSERT INTO public.admin_recruitment_offers (
        candidate_id, status, designation, department, location, employment_type,
        monthly_gross, annual_ctc, joining_date, terms, created_by, created_by_name
      ) VALUES (
        p_candidate_id, 'draft',
        coalesce(public.admin_recruitment_clean(p_payload ->> 'designation'), v_r.designation, 'Pending'),
        coalesce(public.admin_recruitment_clean(p_payload ->> 'department'), v_r.department),
        coalesce(public.admin_recruitment_clean(p_payload ->> 'location'), v_r.location),
        coalesce(public.admin_recruitment_clean(p_payload ->> 'employmentType'), v_r.employment_type, 'Permanent'),
        v_gross, coalesce(v_ctc, v_gross * 12), v_join,
        public.admin_recruitment_clean(p_payload ->> 'terms'),
        auth.uid(), public.admin_recruitment_actor_name(auth.uid())
      )
      RETURNING * INTO v_o;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'This candidate already has an active offer.';
    END;
    PERFORM public.admin_recruitment_log(p_candidate_id, v_c.requisition_id, 'offer', v_o.id, 'offer_drafted', NULL, 'draft', 'Offer draft prepared', '{}'::jsonb);
  ELSE
    SELECT * INTO v_o FROM public.admin_recruitment_offers WHERE id = p_offer_id AND candidate_id = p_candidate_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Offer not found.';
    END IF;
    PERFORM public.admin_recruitment_check_version(p_expected_version, v_o.version);
    IF v_o.status <> 'draft' THEN
      RAISE EXCEPTION 'Only draft offers can be edited. Withdraw the offer and prepare a new one.';
    END IF;
    UPDATE public.admin_recruitment_offers SET
      designation = coalesce(public.admin_recruitment_clean(p_payload ->> 'designation'), designation),
      department = CASE WHEN p_payload ? 'department' THEN public.admin_recruitment_clean(p_payload ->> 'department') ELSE department END,
      location = CASE WHEN p_payload ? 'location' THEN public.admin_recruitment_clean(p_payload ->> 'location') ELSE location END,
      employment_type = coalesce(public.admin_recruitment_clean(p_payload ->> 'employmentType'), employment_type),
      monthly_gross = CASE WHEN p_payload ? 'monthlyGross' THEN v_gross ELSE monthly_gross END,
      annual_ctc = CASE WHEN p_payload ? 'annualCtc' THEN v_ctc
                        WHEN p_payload ? 'monthlyGross' THEN v_gross * 12
                        ELSE annual_ctc END,
      joining_date = CASE WHEN p_payload ? 'joiningDate' THEN v_join ELSE joining_date END,
      terms = CASE WHEN p_payload ? 'terms' THEN public.admin_recruitment_clean(p_payload ->> 'terms') ELSE terms END,
      version = version + 1
    WHERE id = p_offer_id
    RETURNING * INTO v_o;
  END IF;

  RETURN to_jsonb(v_o);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_recruitment_offer_generate(
  p_offer_id uuid,
  p_expected_version integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_o public.admin_recruitment_offers%rowtype;
  v_c public.admin_recruitment_candidates%rowtype;
  v_days integer;
BEGIN
  PERFORM public.admin_recruitment_require('offers');

  SELECT * INTO v_o FROM public.admin_recruitment_offers WHERE id = p_offer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Offer not found.';
  END IF;
  PERFORM public.admin_recruitment_check_version(p_expected_version, v_o.version);
  SELECT * INTO v_c FROM public.admin_recruitment_candidates WHERE id = v_o.candidate_id FOR UPDATE;
  PERFORM public.admin_recruitment_assert_live(v_c);

  IF v_o.status <> 'draft' THEN
    RAISE EXCEPTION 'This offer has already been generated.';
  END IF;
  IF v_c.stage <> 'selected' THEN
    RAISE EXCEPTION 'The candidate must be in Selected to generate an offer.';
  END IF;
  IF v_o.monthly_gross IS NULL OR v_o.monthly_gross <= 0 THEN
    RAISE EXCEPTION 'Enter the monthly gross salary before generating the offer.';
  END IF;
  IF v_o.joining_date IS NULL THEN
    RAISE EXCEPTION 'Enter the proposed joining date before generating the offer.';
  END IF;
  IF v_o.joining_date < public.admin_recruitment_today() THEN
    RAISE EXCEPTION 'The proposed joining date is in the past.';
  END IF;
  IF v_c.email IS NULL THEN
    RAISE EXCEPTION 'Add the candidate''s email address before generating the offer.';
  END IF;
  PERFORM public.admin_recruitment_use_requisition(v_c.requisition_id, v_c.id);

  SELECT offer_validity_days INTO v_days FROM public.admin_recruitment_settings WHERE id;

  UPDATE public.admin_recruitment_offers SET
    status = 'generated',
    offer_ref = coalesce(offer_ref, public.admin_recruitment_next_ref('OFR')),
    valid_until = public.admin_recruitment_today() + coalesce(v_days, 7),
    generated_at = now(),
    generated_by = auth.uid(),
    generated_by_name = public.admin_recruitment_actor_name(auth.uid()),
    version = version + 1
  WHERE id = p_offer_id
  RETURNING * INTO v_o;

  PERFORM public.admin_recruitment_log(
    v_o.candidate_id, v_c.requisition_id, 'offer', v_o.id, 'offer_generated', 'draft', 'generated',
    'Offer ' || v_o.offer_ref || ' generated (valid until ' || to_char(v_o.valid_until, 'DD Mon YYYY') || ')',
    jsonb_build_object('offerRef', v_o.offer_ref, 'monthlyGross', v_o.monthly_gross)
  );
  PERFORM public.admin_recruitment_set_stage(v_o.candidate_id, 'offer', 'Moved to Offer', '{}'::jsonb);

  RETURN to_jsonb(v_o);
END;
$$;

-- Internal: apply a candidate's offer decision (staff-recorded or via the candidate link).
CREATE OR REPLACE FUNCTION public.admin_recruitment_apply_offer_response(
  p_offer_id uuid,
  p_response text,
  p_note text,
  p_joining_date date,
  p_channel text,
  p_ip text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_o public.admin_recruitment_offers%rowtype;
  v_c public.admin_recruitment_candidates%rowtype;
  v_kind text := CASE WHEN p_channel = 'candidate_link' THEN 'candidate' ELSE NULL END;
  v_actor text;
  v_join date;
  v_prev text;
BEGIN
  IF p_response NOT IN ('accepted', 'declined') THEN
    RAISE EXCEPTION 'Choose Accept or Decline.';
  END IF;

  SELECT * INTO v_o FROM public.admin_recruitment_offers WHERE id = p_offer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Offer not found.';
  END IF;
  SELECT * INTO v_c FROM public.admin_recruitment_candidates WHERE id = v_o.candidate_id FOR UPDATE;
  v_actor := CASE WHEN p_channel = 'candidate_link' THEN v_c.full_name ELSE NULL END;

  IF v_o.status = p_response THEN
    RETURN to_jsonb(v_o);
  END IF;
  IF v_o.status NOT IN ('generated', 'sent', 'viewed') THEN
    RAISE EXCEPTION 'This offer is % and can no longer be responded to.', v_o.status;
  END IF;
  IF v_o.valid_until IS NOT NULL AND v_o.valid_until < public.admin_recruitment_today() THEN
    RAISE EXCEPTION 'This offer expired on %.', to_char(v_o.valid_until, 'DD Mon YYYY');
  END IF;
  PERFORM public.admin_recruitment_assert_live(v_c);
  IF v_c.stage <> 'offer' THEN
    RAISE EXCEPTION 'The candidate is not at the offer stage.';
  END IF;

  v_prev := v_o.status;
  v_join := coalesce(p_joining_date, v_o.joining_date);
  IF p_response = 'accepted' AND v_join < public.admin_recruitment_today() THEN
    v_join := public.admin_recruitment_today();
  END IF;

  UPDATE public.admin_recruitment_offers SET
    status = p_response,
    responded_at = now(),
    response_note = p_note,
    response_channel = p_channel,
    response_recorded_by = CASE WHEN p_channel = 'recorded_by_staff' THEN auth.uid() END,
    response_recorded_by_name = CASE WHEN p_channel = 'recorded_by_staff' THEN public.admin_recruitment_actor_name(auth.uid()) END,
    response_ip = p_ip,
    response_user_agent = left(p_user_agent, 400),
    joining_date = CASE WHEN p_response = 'accepted' THEN v_join ELSE joining_date END,
    version = version + 1
  WHERE id = p_offer_id
  RETURNING * INTO v_o;

  PERFORM public.admin_recruitment_log(
    v_o.candidate_id, v_c.requisition_id, 'offer', v_o.id,
    'offer_' || p_response, v_prev, p_response,
    'Offer ' || v_o.offer_ref || ' ' || p_response
      || CASE WHEN p_channel = 'candidate_link' THEN ' by the candidate online' ELSE ' (recorded by staff)' END
      || CASE WHEN p_note IS NOT NULL THEN ' — ' || left(p_note, 300) ELSE '' END,
    jsonb_build_object('channel', p_channel, 'ip', p_ip, 'joiningDate', v_join),
    v_kind, v_actor
  );

  IF p_response = 'accepted' THEN
    UPDATE public.admin_recruitment_candidates
    SET expected_joining_date = v_join, joining_reminder_for = NULL
    WHERE id = v_c.id;
    PERFORM public.admin_recruitment_set_stage(v_c.id, 'offer_accepted', 'Offer accepted', '{}'::jsonb, v_kind, v_actor);
  ELSE
    PERFORM public.admin_recruitment_close_side_effects(v_c.id, coalesce(p_note, 'Offer declined'));
    UPDATE public.admin_recruitment_candidates
    SET outcome = 'offer_declined', outcome_reason = coalesce(p_note, 'Offer declined'), outcome_at = now(), version = version + 1
    WHERE id = v_c.id;
    PERFORM public.admin_recruitment_log(
      v_c.id, v_c.requisition_id, 'candidate', v_c.id, 'closed', 'offer', 'offer_declined',
      'Closed — offer declined', '{}'::jsonb, v_kind, v_actor
    );
  END IF;

  RETURN to_jsonb(v_o);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_recruitment_offer_record_response(
  p_offer_id uuid,
  p_response text,
  p_note text,
  p_joining_date date DEFAULT NULL,
  p_expected_version integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version integer;
  v_note text := public.admin_recruitment_clean(p_note);
BEGIN
  PERFORM public.admin_recruitment_require('offers');
  IF v_note IS NULL THEN
    RAISE EXCEPTION 'Note how the candidate responded (e.g. "Accepted by email on 12 Oct").';
  END IF;
  SELECT version INTO v_version FROM public.admin_recruitment_offers WHERE id = p_offer_id;
  PERFORM public.admin_recruitment_check_version(p_expected_version, v_version);
  RETURN public.admin_recruitment_apply_offer_response(p_offer_id, p_response, v_note, p_joining_date, 'recorded_by_staff');
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_recruitment_offer_withdraw(
  p_offer_id uuid,
  p_reason text,
  p_expected_version integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_o public.admin_recruitment_offers%rowtype;
  v_c public.admin_recruitment_candidates%rowtype;
  v_reason text := public.admin_recruitment_clean(p_reason);
  v_prev text;
BEGIN
  PERFORM public.admin_recruitment_require('offers');
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Enter a reason for withdrawing the offer.';
  END IF;

  SELECT * INTO v_o FROM public.admin_recruitment_offers WHERE id = p_offer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Offer not found.';
  END IF;
  PERFORM public.admin_recruitment_check_version(p_expected_version, v_o.version);
  SELECT * INTO v_c FROM public.admin_recruitment_candidates WHERE id = v_o.candidate_id FOR UPDATE;
  PERFORM public.admin_recruitment_assert_live(v_c);

  IF v_o.status NOT IN ('draft', 'generated', 'sent', 'viewed') THEN
    RAISE EXCEPTION 'Only offers awaiting a response can be withdrawn.';
  END IF;
  v_prev := v_o.status;

  UPDATE public.admin_recruitment_offers
  SET status = 'withdrawn', closed_reason = v_reason, version = version + 1
  WHERE id = p_offer_id
  RETURNING * INTO v_o;

  UPDATE public.admin_recruitment_portal_tokens
  SET revoked_at = now()
  WHERE candidate_id = v_c.id AND purpose = 'offer' AND ref_id = p_offer_id AND revoked_at IS NULL;

  PERFORM public.admin_recruitment_log(
    v_c.id, v_c.requisition_id, 'offer', v_o.id,
    CASE WHEN v_prev = 'draft' THEN 'offer_discarded' ELSE 'offer_withdrawn' END,
    v_prev, 'withdrawn',
    CASE WHEN v_prev = 'draft' THEN 'Offer draft discarded' ELSE 'Offer ' || coalesce(v_o.offer_ref, '') || ' withdrawn' END || ' — ' || v_reason,
    jsonb_build_object('reason', v_reason)
  );
  IF v_c.stage = 'offer' THEN
    PERFORM public.admin_recruitment_set_stage(v_c.id, 'selected', 'Back to Selected (offer withdrawn)', '{}'::jsonb);
  END IF;
  RETURN to_jsonb(v_o);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_recruitment_offer_attach_signed(p_offer_id uuid, p_file jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_o public.admin_recruitment_offers%rowtype;
  v_req uuid;
BEGIN
  PERFORM public.admin_recruitment_require('offers');
  SELECT * INTO v_o FROM public.admin_recruitment_offers WHERE id = p_offer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Offer not found.';
  END IF;
  IF v_o.status <> 'accepted' THEN
    RAISE EXCEPTION 'A signed copy can be stored only for an accepted offer.';
  END IF;
  IF public.admin_recruitment_clean(p_file ->> 'objectKey') IS NULL
     OR (p_file ->> 'objectKey') NOT LIKE 'admin-recruitment/' || v_o.candidate_id::text || '/%' THEN
    RAISE EXCEPTION 'Invalid file.';
  END IF;
  UPDATE public.admin_recruitment_offers
  SET signed_doc = p_file || jsonb_build_object('uploadedAt', now(), 'channel', 'recorded_by_staff'), version = version + 1
  WHERE id = p_offer_id
  RETURNING * INTO v_o;
  SELECT requisition_id INTO v_req FROM public.admin_recruitment_candidates WHERE id = v_o.candidate_id;
  PERFORM public.admin_recruitment_log(
    v_o.candidate_id, v_req, 'offer', v_o.id, 'offer_signed_copy', NULL, NULL,
    'Signed offer ' || v_o.offer_ref || ' stored', jsonb_build_object('fileName', p_file ->> 'fileName')
  );
  RETURN to_jsonb(v_o);
END;
$$;

-- Offer expiry (automation; idempotent and safe to run concurrently).
CREATE OR REPLACE FUNCTION public.admin_recruitment_expire_offers()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_count integer := 0;
  v_cid uuid;
  v_c public.admin_recruitment_candidates%rowtype;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    PERFORM public.admin_recruitment_require('offers');
  END IF;

  FOR r IN
    SELECT o.id
    FROM public.admin_recruitment_offers o
    WHERE o.status IN ('generated', 'sent', 'viewed')
      AND o.valid_until < public.admin_recruitment_today()
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.admin_recruitment_offers
    SET status = 'expired', expired_at = now(), closed_reason = 'No response before the validity date', version = version + 1
    WHERE id = r.id AND status IN ('generated', 'sent', 'viewed')
    RETURNING candidate_id INTO v_cid;
    IF NOT FOUND THEN
      CONTINUE;
    END IF;
    v_count := v_count + 1;

    SELECT * INTO v_c FROM public.admin_recruitment_candidates WHERE id = v_cid FOR UPDATE;
    PERFORM public.admin_recruitment_log(
      v_c.id, v_c.requisition_id, 'offer', r.id, 'offer_expired', NULL, 'expired',
      'Offer expired without a response', '{}'::jsonb, 'system', 'Automation'
    );
    UPDATE public.admin_recruitment_portal_tokens
    SET revoked_at = now()
    WHERE candidate_id = v_c.id AND purpose = 'offer' AND ref_id = r.id AND revoked_at IS NULL;

    IF v_c.outcome IS NULL AND v_c.stage = 'offer' THEN
      UPDATE public.admin_recruitment_candidates
      SET outcome = 'offer_expired', outcome_reason = 'Offer expired without a response', outcome_at = now(), version = version + 1
      WHERE id = v_c.id;
      PERFORM public.admin_recruitment_log(
        v_c.id, v_c.requisition_id, 'candidate', v_c.id, 'closed', 'offer', 'offer_expired',
        'Closed — offer expired', '{}'::jsonb, 'system', 'Automation'
      );
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- Appointment letters
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_recruitment_appointment_generate(
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
  v_o public.admin_recruitment_offers%rowtype;
  v_a public.admin_recruitment_appointments%rowtype;
  v_join date;
BEGIN
  PERFORM public.admin_recruitment_require('offers');

  v_prev := public.admin_recruitment_request_begin(p_request_key, 'appointment_generate');
  IF v_prev IS NOT NULL THEN
    RETURN v_prev;
  END IF;

  SELECT * INTO v_c FROM public.admin_recruitment_candidates WHERE id = p_candidate_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidate not found.';
  END IF;
  PERFORM public.admin_recruitment_assert_live(v_c);
  IF v_c.stage <> 'offer_accepted' THEN
    RAISE EXCEPTION 'The appointment letter is issued after the offer is accepted (current stage: %).', replace(v_c.stage, '_', ' ');
  END IF;
  SELECT * INTO v_o FROM public.admin_recruitment_offers
  WHERE candidate_id = p_candidate_id AND status = 'accepted'
  ORDER BY responded_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No accepted offer found for this candidate.';
  END IF;

  v_join := coalesce(public.admin_recruitment_date(p_payload ->> 'joiningDate'), v_c.expected_joining_date, v_o.joining_date);
  IF v_join IS NULL THEN
    RAISE EXCEPTION 'Enter the joining date.';
  END IF;
  IF v_join < public.admin_recruitment_today() THEN
    RAISE EXCEPTION 'The joining date cannot be in the past.';
  END IF;

  BEGIN
    INSERT INTO public.admin_recruitment_appointments (
      candidate_id, offer_id, appointment_ref, status, designation, department, location, employment_type,
      monthly_gross, joining_date, reporting_to, terms, generated_by, generated_by_name
    ) VALUES (
      p_candidate_id, v_o.id, public.admin_recruitment_next_ref('APT'), 'generated',
      v_o.designation, v_o.department, v_o.location, v_o.employment_type, v_o.monthly_gross, v_join,
      public.admin_recruitment_clean(p_payload ->> 'reportingTo'),
      coalesce(public.admin_recruitment_clean(p_payload ->> 'terms'), v_o.terms),
      auth.uid(), public.admin_recruitment_actor_name(auth.uid())
    )
    RETURNING * INTO v_a;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'An appointment letter is already active for this candidate.';
  END;

  UPDATE public.admin_recruitment_candidates
  SET expected_joining_date = v_join,
      joining_reminder_for = CASE WHEN expected_joining_date IS DISTINCT FROM v_join THEN NULL ELSE joining_reminder_for END
  WHERE id = p_candidate_id;

  PERFORM public.admin_recruitment_log(
    p_candidate_id, v_c.requisition_id, 'appointment', v_a.id, 'appointment_generated', NULL, 'generated',
    'Appointment letter ' || v_a.appointment_ref || ' generated (joining ' || to_char(v_join, 'DD Mon YYYY') || ')',
    jsonb_build_object('appointmentRef', v_a.appointment_ref)
  );
  PERFORM public.admin_recruitment_set_stage(p_candidate_id, 'appointment', 'Moved to Appointment', '{}'::jsonb);

  RETURN public.admin_recruitment_request_end(p_request_key, 'appointment_generate', to_jsonb(v_a));
END;
$$;

-- Internal: seed the configurable document checklist for a candidate.
CREATE OR REPLACE FUNCTION public.admin_recruitment_seed_documents(p_candidate_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.admin_recruitment_candidate_documents (candidate_id, document_key, label, required)
  SELECT p_candidate_id, t.key, t.label, t.required
  FROM public.admin_recruitment_document_types t
  WHERE t.active
  ON CONFLICT (candidate_id, document_key) DO NOTHING;
$$;

-- Internal: Documents → Ready to Join once every mandatory document is verified.
CREATE OR REPLACE FUNCTION public.admin_recruitment_refresh_readiness(
  p_candidate_id uuid,
  p_actor_kind text DEFAULT NULL,
  p_actor_name text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stage text;
  v_outcome text;
  v_ready boolean;
BEGIN
  SELECT stage, outcome INTO v_stage, v_outcome FROM public.admin_recruitment_candidates WHERE id = p_candidate_id;
  IF v_outcome IS NOT NULL OR v_stage NOT IN ('documents', 'ready_to_join') THEN
    RETURN false;
  END IF;

  SELECT NOT EXISTS (
    SELECT 1 FROM public.admin_recruitment_candidate_documents d
    WHERE d.candidate_id = p_candidate_id AND d.required AND d.status <> 'verified'
  ) INTO v_ready;

  IF v_ready AND v_stage = 'documents' THEN
    PERFORM public.admin_recruitment_set_stage(p_candidate_id, 'ready_to_join', 'All mandatory documents verified — ready to join', '{}'::jsonb, p_actor_kind, p_actor_name);
  ELSIF NOT v_ready AND v_stage = 'ready_to_join' THEN
    PERFORM public.admin_recruitment_set_stage(p_candidate_id, 'documents', 'Mandatory documents pending again', '{}'::jsonb, p_actor_kind, p_actor_name);
  END IF;
  RETURN v_ready;
END;
$$;

-- Internal: store the signed appointment letter (staff upload or candidate link).
CREATE OR REPLACE FUNCTION public.admin_recruitment_apply_appointment_signed(
  p_appointment_id uuid,
  p_file jsonb,
  p_channel text,
  p_ip text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a public.admin_recruitment_appointments%rowtype;
  v_c public.admin_recruitment_candidates%rowtype;
  v_kind text := CASE WHEN p_channel = 'candidate_link' THEN 'candidate' ELSE NULL END;
  v_actor text;
  v_prev text;
BEGIN
  SELECT * INTO v_a FROM public.admin_recruitment_appointments WHERE id = p_appointment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appointment letter not found.';
  END IF;
  SELECT * INTO v_c FROM public.admin_recruitment_candidates WHERE id = v_a.candidate_id FOR UPDATE;
  v_actor := CASE WHEN p_channel = 'candidate_link' THEN v_c.full_name ELSE NULL END;

  IF v_a.status = 'signed' THEN
    RETURN to_jsonb(v_a);
  END IF;
  IF v_a.status NOT IN ('generated', 'sent', 'viewed') THEN
    RAISE EXCEPTION 'This appointment letter is %.', v_a.status;
  END IF;
  PERFORM public.admin_recruitment_assert_live(v_c);
  IF public.admin_recruitment_clean(p_file ->> 'objectKey') IS NULL
     OR (p_file ->> 'objectKey') NOT LIKE 'admin-recruitment/' || v_c.id::text || '/%' THEN
    RAISE EXCEPTION 'Upload the signed appointment letter.';
  END IF;
  v_prev := v_a.status;

  UPDATE public.admin_recruitment_appointments SET
    status = 'signed',
    signed_doc = p_file || jsonb_build_object('uploadedAt', now(), 'channel', p_channel),
    signed_at = now(),
    signed_channel = p_channel,
    signed_recorded_by = CASE WHEN p_channel = 'recorded_by_staff' THEN auth.uid() END,
    signed_recorded_by_name = CASE WHEN p_channel = 'recorded_by_staff' THEN public.admin_recruitment_actor_name(auth.uid()) END,
    signed_ip = p_ip,
    version = version + 1
  WHERE id = p_appointment_id
  RETURNING * INTO v_a;

  PERFORM public.admin_recruitment_log(
    v_c.id, v_c.requisition_id, 'appointment', v_a.id, 'appointment_signed', v_prev, 'signed',
    'Signed appointment letter ' || v_a.appointment_ref || ' received'
      || CASE WHEN p_channel = 'candidate_link' THEN ' from the candidate' ELSE ' (uploaded by staff)' END,
    jsonb_build_object('fileName', p_file ->> 'fileName', 'channel', p_channel),
    v_kind, v_actor
  );

  IF v_c.stage = 'appointment' THEN
    PERFORM public.admin_recruitment_seed_documents(v_c.id);
    PERFORM public.admin_recruitment_set_stage(v_c.id, 'documents', 'Moved to Documents', '{}'::jsonb, v_kind, v_actor);
    PERFORM public.admin_recruitment_refresh_readiness(v_c.id, v_kind, v_actor);
  END IF;
  RETURN to_jsonb(v_a);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_recruitment_appointment_record_signed(
  p_appointment_id uuid,
  p_file jsonb,
  p_expected_version integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version integer;
BEGIN
  PERFORM public.admin_recruitment_require('offers');
  SELECT version INTO v_version FROM public.admin_recruitment_appointments WHERE id = p_appointment_id;
  PERFORM public.admin_recruitment_check_version(p_expected_version, v_version);
  RETURN public.admin_recruitment_apply_appointment_signed(p_appointment_id, p_file, 'recorded_by_staff');
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_recruitment_appointment_cancel(
  p_appointment_id uuid,
  p_reason text,
  p_expected_version integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a public.admin_recruitment_appointments%rowtype;
  v_c public.admin_recruitment_candidates%rowtype;
  v_reason text := public.admin_recruitment_clean(p_reason);
  v_prev text;
BEGIN
  PERFORM public.admin_recruitment_require('offers');
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Enter a reason for cancelling the appointment letter.';
  END IF;
  SELECT * INTO v_a FROM public.admin_recruitment_appointments WHERE id = p_appointment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appointment letter not found.';
  END IF;
  PERFORM public.admin_recruitment_check_version(p_expected_version, v_a.version);
  SELECT * INTO v_c FROM public.admin_recruitment_candidates WHERE id = v_a.candidate_id FOR UPDATE;
  PERFORM public.admin_recruitment_assert_live(v_c);
  IF v_a.status NOT IN ('generated', 'sent', 'viewed') THEN
    RAISE EXCEPTION 'Only unsigned appointment letters can be cancelled.';
  END IF;
  v_prev := v_a.status;

  UPDATE public.admin_recruitment_appointments
  SET status = 'cancelled', closed_reason = v_reason, version = version + 1
  WHERE id = p_appointment_id
  RETURNING * INTO v_a;
  UPDATE public.admin_recruitment_portal_tokens
  SET revoked_at = now()
  WHERE candidate_id = v_c.id AND purpose = 'appointment' AND ref_id = p_appointment_id AND revoked_at IS NULL;

  PERFORM public.admin_recruitment_log(
    v_c.id, v_c.requisition_id, 'appointment', v_a.id, 'appointment_cancelled', v_prev, 'cancelled',
    'Appointment letter ' || v_a.appointment_ref || ' cancelled — ' || v_reason, jsonb_build_object('reason', v_reason)
  );
  IF v_c.stage = 'appointment' THEN
    PERFORM public.admin_recruitment_set_stage(v_c.id, 'offer_accepted', 'Back to Offer Accepted (letter cancelled)', '{}'::jsonb);
  END IF;
  RETURN to_jsonb(v_a);
END;
$$;

-- ---------------------------------------------------------------------------
-- Candidate documents
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_recruitment_apply_document_submit(
  p_candidate_id uuid,
  p_document_key text,
  p_file jsonb,
  p_channel text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c public.admin_recruitment_candidates%rowtype;
  v_t public.admin_recruitment_document_types%rowtype;
  v_d public.admin_recruitment_candidate_documents%rowtype;
  v_kind text := CASE WHEN p_channel = 'candidate_link' THEN 'candidate' ELSE NULL END;
  v_actor text;
  v_prev text;
BEGIN
  SELECT * INTO v_c FROM public.admin_recruitment_candidates WHERE id = p_candidate_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidate not found.';
  END IF;
  PERFORM public.admin_recruitment_assert_live(v_c);
  v_actor := CASE WHEN p_channel = 'candidate_link' THEN v_c.full_name ELSE NULL END;
  IF v_c.stage NOT IN ('documents', 'ready_to_join') THEN
    RAISE EXCEPTION 'Documents are collected after the appointment letter is signed.';
  END IF;
  IF public.admin_recruitment_clean(p_file ->> 'objectKey') IS NULL
     OR (p_file ->> 'objectKey') NOT LIKE 'admin-recruitment/' || p_candidate_id::text || '/%' THEN
    RAISE EXCEPTION 'Upload a file first.';
  END IF;

  SELECT * INTO v_d FROM public.admin_recruitment_candidate_documents
  WHERE candidate_id = p_candidate_id AND document_key = p_document_key FOR UPDATE;
  IF NOT FOUND THEN
    SELECT * INTO v_t FROM public.admin_recruitment_document_types WHERE key = p_document_key AND active;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Unknown document type.';
    END IF;
    INSERT INTO public.admin_recruitment_candidate_documents (candidate_id, document_key, label, required)
    VALUES (p_candidate_id, v_t.key, v_t.label, v_t.required)
    RETURNING * INTO v_d;
  END IF;

  IF v_d.status IN ('under_review', 'verified') THEN
    RAISE EXCEPTION '% is % and cannot be replaced.', v_d.label, replace(v_d.status, '_', ' ');
  END IF;
  v_prev := v_d.status;

  UPDATE public.admin_recruitment_candidate_documents SET
    status = 'submitted',
    file = p_file || jsonb_build_object('uploadedAt', now()),
    submitted_at = now(),
    submitted_via = CASE WHEN p_channel = 'candidate_link' THEN 'candidate_link' ELSE 'staff' END,
    submission_count = submission_count + 1,
    rejection_reason = NULL,
    reviewed_by = NULL,
    reviewed_by_name = NULL,
    reviewed_at = NULL,
    version = version + 1
  WHERE id = v_d.id
  RETURNING * INTO v_d;

  PERFORM public.admin_recruitment_log(
    p_candidate_id, v_c.requisition_id, 'document', v_d.id,
    CASE WHEN v_prev = 'rejected' THEN 'document_resubmitted' ELSE 'document_submitted' END,
    v_prev, 'submitted',
    v_d.label || CASE WHEN v_prev = 'rejected' THEN ' resubmitted' ELSE ' submitted' END
      || CASE WHEN p_channel = 'candidate_link' THEN ' by the candidate' ELSE '' END,
    jsonb_build_object('fileName', p_file ->> 'fileName', 'documentKey', p_document_key),
    v_kind, v_actor
  );
  RETURN to_jsonb(v_d);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_recruitment_document_submit(
  p_candidate_id uuid,
  p_document_key text,
  p_file jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.admin_recruitment_require('documents');
  RETURN public.admin_recruitment_apply_document_submit(p_candidate_id, p_document_key, p_file, 'staff');
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_recruitment_document_review(
  p_document_id uuid,
  p_action text,
  p_reason text DEFAULT NULL,
  p_expected_version integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_d public.admin_recruitment_candidate_documents%rowtype;
  v_c public.admin_recruitment_candidates%rowtype;
  v_reason text := public.admin_recruitment_clean(p_reason);
  v_to text;
  v_prev text;
BEGIN
  PERFORM public.admin_recruitment_require('documents');
  v_to := CASE p_action WHEN 'start_review' THEN 'under_review' WHEN 'verify' THEN 'verified' WHEN 'reject' THEN 'rejected' END;
  IF v_to IS NULL THEN
    RAISE EXCEPTION 'Unknown review action.';
  END IF;
  IF p_action = 'reject' AND v_reason IS NULL THEN
    RAISE EXCEPTION 'Enter the reason for rejecting this document so the candidate can correct it.';
  END IF;

  SELECT * INTO v_d FROM public.admin_recruitment_candidate_documents WHERE id = p_document_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document not found.';
  END IF;
  PERFORM public.admin_recruitment_check_version(p_expected_version, v_d.version);
  SELECT * INTO v_c FROM public.admin_recruitment_candidates WHERE id = v_d.candidate_id FOR UPDATE;
  PERFORM public.admin_recruitment_assert_live(v_c);

  IF v_d.status = v_to THEN
    RETURN to_jsonb(v_d);
  END IF;
  IF p_action = 'start_review' AND v_d.status <> 'submitted' THEN
    RAISE EXCEPTION 'Only submitted documents can be taken up for review.';
  END IF;
  IF p_action IN ('verify', 'reject') AND v_d.status NOT IN ('submitted', 'under_review') THEN
    RAISE EXCEPTION 'Only submitted documents can be verified or rejected.';
  END IF;
  IF v_d.file IS NULL THEN
    RAISE EXCEPTION 'No file has been submitted for this document.';
  END IF;
  v_prev := v_d.status;

  UPDATE public.admin_recruitment_candidate_documents SET
    status = v_to,
    rejection_reason = CASE WHEN v_to = 'rejected' THEN v_reason ELSE NULL END,
    reviewed_by = auth.uid(),
    reviewed_by_name = public.admin_recruitment_actor_name(auth.uid()),
    reviewed_at = now(),
    version = version + 1
  WHERE id = p_document_id
  RETURNING * INTO v_d;

  PERFORM public.admin_recruitment_log(
    v_c.id, v_c.requisition_id, 'document', v_d.id,
    CASE v_to WHEN 'under_review' THEN 'document_review_started' WHEN 'verified' THEN 'document_verified' ELSE 'document_rejected' END,
    v_prev, v_to,
    v_d.label || CASE v_to WHEN 'under_review' THEN ' under review' WHEN 'verified' THEN ' verified' ELSE ' rejected — ' || v_reason END,
    jsonb_build_object('reason', v_reason)
  );

  IF v_to = 'verified' THEN
    PERFORM public.admin_recruitment_refresh_readiness(v_c.id);
  END IF;
  RETURN to_jsonb(v_d);
END;
$$;

-- ---------------------------------------------------------------------------
-- Joining
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_recruitment_joining_update(
  p_candidate_id uuid,
  p_expected_date date,
  p_remarks text DEFAULT NULL,
  p_expected_version integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c public.admin_recruitment_candidates%rowtype;
  v_old date;
  v_remarks text := public.admin_recruitment_clean(p_remarks);
BEGIN
  PERFORM public.admin_recruitment_require('joining');
  SELECT * INTO v_c FROM public.admin_recruitment_candidates WHERE id = p_candidate_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidate not found.';
  END IF;
  PERFORM public.admin_recruitment_check_version(p_expected_version, v_c.version);
  PERFORM public.admin_recruitment_assert_live(v_c);
  IF v_c.stage NOT IN ('offer_accepted', 'appointment', 'documents', 'ready_to_join') THEN
    RAISE EXCEPTION 'The joining date can be planned after the offer is accepted.';
  END IF;
  IF p_expected_date IS NULL THEN
    RAISE EXCEPTION 'Enter the expected joining date.';
  END IF;
  IF p_expected_date < public.admin_recruitment_today() THEN
    RAISE EXCEPTION 'The expected joining date cannot be in the past.';
  END IF;
  v_old := v_c.expected_joining_date;

  UPDATE public.admin_recruitment_candidates SET
    expected_joining_date = p_expected_date,
    joining_remarks = coalesce(v_remarks, joining_remarks),
    joining_reminder_for = CASE WHEN v_old IS DISTINCT FROM p_expected_date THEN NULL ELSE joining_reminder_for END,
    version = version + 1
  WHERE id = p_candidate_id
  RETURNING * INTO v_c;

  PERFORM public.admin_recruitment_log(
    v_c.id, v_c.requisition_id, 'joining', v_c.id, 'joining_planned', NULL, NULL,
    CASE WHEN v_old IS NULL THEN 'Expected joining set to ' ELSE 'Expected joining changed to ' END
      || to_char(p_expected_date, 'DD Mon YYYY') || CASE WHEN v_remarks IS NOT NULL THEN ' — ' || v_remarks ELSE '' END,
    jsonb_build_object('previous', v_old, 'expected', p_expected_date)
  );
  RETURN to_jsonb(v_c);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_recruitment_mark_joining_no_show(
  p_candidate_id uuid,
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
  PERFORM public.admin_recruitment_require('joining');
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Enter a reason.';
  END IF;
  SELECT * INTO v_c FROM public.admin_recruitment_candidates WHERE id = p_candidate_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidate not found.';
  END IF;
  PERFORM public.admin_recruitment_check_version(p_expected_version, v_c.version);
  PERFORM public.admin_recruitment_assert_live(v_c);
  IF v_c.stage NOT IN ('offer_accepted', 'appointment', 'documents', 'ready_to_join') THEN
    RAISE EXCEPTION 'Joining no-show applies only to candidates who accepted an offer.';
  END IF;

  PERFORM public.admin_recruitment_close_side_effects(p_candidate_id, v_reason);
  UPDATE public.admin_recruitment_candidates
  SET outcome = 'no_show', outcome_reason = v_reason, outcome_at = now(), joining_remarks = v_reason, version = version + 1
  WHERE id = p_candidate_id
  RETURNING * INTO v_c;

  PERFORM public.admin_recruitment_log(
    v_c.id, v_c.requisition_id, 'joining', v_c.id, 'joining_no_show', v_c.stage, 'no_show',
    'Did not join — ' || v_reason, jsonb_build_object('reason', v_reason)
  );
  RETURN to_jsonb(v_c);
END;
$$;

-- ---------------------------------------------------------------------------
-- Employee Master hand-off
-- Creates the employee with the same rules as the existing recruitment conversion
-- (shared employee-code allocator, 5-digit continuous system ID, Active status).
-- Never updates an existing employee record.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_recruitment_convert_to_employee(
  p_candidate_id uuid,
  p_employee_code text DEFAULT NULL,
  p_link_employee_id bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c public.admin_recruitment_candidates%rowtype;
  v_o public.admin_recruitment_offers%rowtype;
  v_r public.admin_recruitment_requisitions%rowtype;
  v_matches jsonb;
  v_emp record;
  v_code text;
  v_sys_id text;
  v_seq integer;
  v_new_id bigint;
  v_type text;
  v_email text;
BEGIN
  PERFORM public.admin_recruitment_require('conversion');

  SELECT * INTO v_c FROM public.admin_recruitment_candidates WHERE id = p_candidate_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidate not found.';
  END IF;

  IF v_c.stage = 'employee_created' AND v_c.employee_master_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'converted', 'alreadyConverted', true,
      'employeeMasterId', v_c.employee_master_id,
      'employeeId', v_c.employee_system_id,
      'employeeCode', v_c.employee_code
    );
  END IF;
  IF v_c.outcome IS NOT NULL THEN
    RAISE EXCEPTION 'This candidate is closed (%).', replace(v_c.outcome, '_', ' ');
  END IF;
  IF v_c.stage <> 'joined' THEN
    RAISE EXCEPTION 'Only candidates marked as Joined can be converted to employees.';
  END IF;

  SELECT * INTO v_o FROM public.admin_recruitment_offers
  WHERE candidate_id = p_candidate_id AND status = 'accepted'
  ORDER BY responded_at DESC LIMIT 1;
  SELECT * INTO v_r FROM public.admin_recruitment_requisitions WHERE id = v_c.requisition_id;

  -- Serialise employee creation so system IDs and duplicate checks stay consistent.
  PERFORM pg_advisory_xact_lock(hashtextextended('admin_recruitment:employee_conversion', 0));

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', e.id, 'employeeId', e.employee_id, 'employeeCode', e.employee_code,
           'name', e.full_name, 'designation', e.designation, 'status', e.status
         )), '[]'::jsonb)
    INTO v_matches
  FROM public.admin_ifsp_employee_master e
  WHERE coalesce(lower(btrim(e.status)), 'active') NOT IN ('inactive', 'left', 'resigned', 'terminated', 'exited', 'relieved')
    AND (
      (v_c.phone_key IS NOT NULL AND public.admin_recruitment_phone_key(e.personal_no) = v_c.phone_key)
      OR (v_c.email_key IS NOT NULL AND public.admin_recruitment_email_key(e.email_id) = v_c.email_key)
    );

  IF p_link_employee_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_matches) m WHERE (m ->> 'id')::bigint = p_link_employee_id) THEN
      RAISE EXCEPTION 'The selected employee does not match this candidate''s mobile number or email.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.admin_recruitment_candidates WHERE employee_master_id = p_link_employee_id AND id <> p_candidate_id) THEN
      RAISE EXCEPTION 'That employee is already linked to another recruitment record.';
    END IF;
    SELECT id, employee_id, employee_code INTO v_emp FROM public.admin_ifsp_employee_master WHERE id = p_link_employee_id;

    UPDATE public.admin_recruitment_candidates SET
      stage = 'employee_created',
      employee_master_id = v_emp.id,
      employee_system_id = v_emp.employee_id,
      employee_code = v_emp.employee_code,
      converted_at = now(),
      converted_by = auth.uid(),
      converted_by_name = public.admin_recruitment_actor_name(auth.uid()),
      version = version + 1
    WHERE id = p_candidate_id;
    PERFORM public.admin_recruitment_log(
      p_candidate_id, v_c.requisition_id, 'conversion', p_candidate_id, 'employee_linked', 'joined', 'employee_created',
      'Linked to existing employee ' || coalesce(v_emp.employee_code, v_emp.employee_id, v_emp.id::text) || ' (no employee data changed)',
      jsonb_build_object('employeeMasterId', v_emp.id)
    );
    RETURN jsonb_build_object(
      'status', 'converted', 'linked', true,
      'employeeMasterId', v_emp.id, 'employeeId', v_emp.employee_id, 'employeeCode', v_emp.employee_code
    );
  END IF;

  IF jsonb_array_length(v_matches) > 0 THEN
    RETURN jsonb_build_object('status', 'duplicate', 'matches', v_matches);
  END IF;

  BEGIN
    v_code := public.hr_allocate_shared_employee_code(public.admin_recruitment_clean(p_employee_code), NULL::uuid);
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM ILIKE '%permission denied%' THEN
      RAISE EXCEPTION 'You do not have permission to allocate employee codes.' USING ERRCODE = '42501';
    END IF;
    RAISE;
  END;
  IF v_code IS NULL OR btrim(v_code) = '' THEN
    RAISE EXCEPTION 'Could not allocate an employee code. Enter one manually.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.admin_ifsp_employee_master e
    WHERE lower(btrim(coalesce(e.employee_code, ''))) = lower(v_code)
  ) THEN
    RAISE EXCEPTION 'Employee code % already exists in Employee Master.', v_code;
  END IF;

  SELECT coalesce(max(
    CASE
      WHEN trim(coalesce(e.employee_id, '')) ~ '^\d+$' THEN trim(e.employee_id)::integer
      WHEN trim(coalesce(e.employee_id, '')) ~* '^IFSPL-EMP-(\d+)$' THEN substring(trim(e.employee_id) FROM '(?i)IFSPL-EMP-(\d+)')::integer
      ELSE 0
    END
  ), 0) + 1
    INTO v_seq
  FROM public.admin_ifsp_employee_master e;
  LOOP
    v_sys_id := lpad(v_seq::text, 5, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.admin_ifsp_employee_master e WHERE e.employee_id = v_sys_id);
    v_seq := v_seq + 1;
    IF v_seq > 99999 THEN
      RAISE EXCEPTION 'Employee ID limit reached.';
    END IF;
  END LOOP;

  v_type := replace(lower(btrim(coalesce(v_o.employment_type, v_r.employment_type, 'permanent'))), ' ', '_');
  IF v_type NOT IN ('permanent', 'consultant', 'voucher', 'probation', 'contract', 'pip', 'notice_period') THEN
    v_type := 'permanent';
  END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  INSERT INTO public.admin_ifsp_employee_master (
    user_id, employee_id, employment_type, employee_code, full_name, designation, date_of_joining,
    personal_no, email_id, gender, date_of_birth, location, qualification, educational_qualification,
    other_experience, years_of_experience, department, status, created_by, updated_by
  ) VALUES (
    auth.uid(), v_sys_id, v_type, v_code, v_c.full_name,
    coalesce(v_o.designation, v_r.designation, 'Pending'),
    coalesce(v_c.actual_joining_date, public.admin_recruitment_today()),
    v_c.phone, v_c.email, v_c.gender, v_c.date_of_birth,
    coalesce(v_o.location, v_r.location),
    v_c.qualification, v_c.qualification,
    v_c.experience_years, v_c.experience_years,
    coalesce(v_o.department, v_r.department, ''),
    'Active', coalesce(v_email, ''), coalesce(v_email, '')
  )
  RETURNING id INTO v_new_id;

  UPDATE public.admin_recruitment_candidates SET
    stage = 'employee_created',
    employee_master_id = v_new_id,
    employee_system_id = v_sys_id,
    employee_code = v_code,
    converted_at = now(),
    converted_by = auth.uid(),
    converted_by_name = public.admin_recruitment_actor_name(auth.uid()),
    version = version + 1
  WHERE id = p_candidate_id;

  PERFORM public.admin_recruitment_log(
    p_candidate_id, v_c.requisition_id, 'conversion', p_candidate_id, 'employee_created', 'joined', 'employee_created',
    'Employee created in Employee Master — code ' || v_code || ', ID ' || v_sys_id,
    jsonb_build_object('employeeMasterId', v_new_id, 'employeeCode', v_code, 'employeeId', v_sys_id)
  );

  RETURN jsonb_build_object(
    'status', 'converted', 'linked', false,
    'employeeMasterId', v_new_id, 'employeeId', v_sys_id, 'employeeCode', v_code
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_recruitment_mark_joined(
  p_candidate_id uuid,
  p_actual_date date,
  p_remarks text DEFAULT NULL,
  p_expected_version integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c public.admin_recruitment_candidates%rowtype;
  v_r public.admin_recruitment_requisitions%rowtype;
  v_remarks text := public.admin_recruitment_clean(p_remarks);
  v_pending text;
  v_accepted_on date;
  v_auto boolean;
  v_conv jsonb;
BEGIN
  PERFORM public.admin_recruitment_require('joining');

  SELECT * INTO v_c FROM public.admin_recruitment_candidates WHERE id = p_candidate_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidate not found.';
  END IF;
  IF v_c.stage IN ('joined', 'employee_created') THEN
    RETURN jsonb_build_object('candidate', to_jsonb(v_c), 'alreadyJoined', true);
  END IF;
  PERFORM public.admin_recruitment_check_version(p_expected_version, v_c.version);
  PERFORM public.admin_recruitment_assert_live(v_c);

  IF v_c.stage <> 'ready_to_join' THEN
    RAISE EXCEPTION 'The candidate is not ready to join yet (current stage: %).', replace(v_c.stage, '_', ' ');
  END IF;
  SELECT string_agg(d.label, ', ' ORDER BY d.label) INTO v_pending
  FROM public.admin_recruitment_candidate_documents d
  WHERE d.candidate_id = p_candidate_id AND d.required AND d.status <> 'verified';
  IF v_pending IS NOT NULL THEN
    RAISE EXCEPTION 'Mandatory documents are not verified: %.', v_pending;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.admin_recruitment_appointments WHERE candidate_id = p_candidate_id AND status = 'signed') THEN
    RAISE EXCEPTION 'The signed appointment letter has not been received.';
  END IF;
  IF p_actual_date IS NULL THEN
    RAISE EXCEPTION 'Enter the actual joining date.';
  END IF;
  IF p_actual_date > public.admin_recruitment_today() THEN
    RAISE EXCEPTION 'The joining date cannot be in the future.';
  END IF;
  SELECT (responded_at AT TIME ZONE 'Asia/Kolkata')::date INTO v_accepted_on
  FROM public.admin_recruitment_offers
  WHERE candidate_id = p_candidate_id AND status = 'accepted'
  ORDER BY responded_at DESC LIMIT 1;
  IF v_accepted_on IS NOT NULL AND p_actual_date < v_accepted_on THEN
    RAISE EXCEPTION 'The joining date cannot be before the offer was accepted (%).', to_char(v_accepted_on, 'DD Mon YYYY');
  END IF;

  UPDATE public.admin_recruitment_candidates SET
    actual_joining_date = p_actual_date,
    joining_remarks = coalesce(v_remarks, joining_remarks),
    version = version + 1
  WHERE id = p_candidate_id;
  PERFORM public.admin_recruitment_set_stage(
    p_candidate_id, 'joined',
    'Joined on ' || to_char(p_actual_date, 'DD Mon YYYY') || CASE WHEN v_remarks IS NOT NULL THEN ' — ' || v_remarks ELSE '' END,
    jsonb_build_object('actualJoiningDate', p_actual_date)
  );

  IF v_c.requisition_id IS NOT NULL THEN
    UPDATE public.admin_recruitment_requisitions
    SET filled_count = filled_count + 1, version = version + 1
    WHERE id = v_c.requisition_id
    RETURNING * INTO v_r;
    IF v_r.status = 'open' AND v_r.filled_count >= v_r.openings THEN
      UPDATE public.admin_recruitment_requisitions
      SET status = 'filled', closed_at = now(), version = version + 1
      WHERE id = v_r.id;
      PERFORM public.admin_recruitment_log(
        NULL, v_r.id, 'requisition', v_r.id, 'filled', 'open', 'filled',
        'All ' || v_r.openings || ' opening(s) filled', '{}'::jsonb
      );
      PERFORM public.admin_recruitment_sync_intake(v_r.id, NULL);
    END IF;
  END IF;

  SELECT auto_convert_on_join INTO v_auto FROM public.admin_recruitment_settings WHERE id;
  IF coalesce(v_auto, false) THEN
    BEGIN
      v_conv := public.admin_recruitment_convert_to_employee(p_candidate_id, NULL, NULL);
      IF v_conv ->> 'status' = 'duplicate' THEN
        PERFORM public.admin_recruitment_log(
          p_candidate_id, v_c.requisition_id, 'conversion', p_candidate_id, 'conversion_needs_review', NULL, NULL,
          'Automatic conversion paused — a matching employee already exists. Review on Employee Conversion.',
          jsonb_build_object('matches', v_conv -> 'matches')
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_conv := jsonb_build_object('status', 'failed', 'error', SQLERRM);
      PERFORM public.admin_recruitment_log(
        p_candidate_id, v_c.requisition_id, 'conversion', p_candidate_id, 'conversion_failed', NULL, NULL,
        'Automatic conversion did not complete — convert manually on Employee Conversion.',
        jsonb_build_object('error', SQLERRM)
      );
    END;
  END IF;

  SELECT * INTO v_c FROM public.admin_recruitment_candidates WHERE id = p_candidate_id;
  RETURN jsonb_build_object('candidate', to_jsonb(v_c), 'conversion', v_conv);
END;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.admin_recruitment_apply_offer_response(uuid, text, text, date, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_recruitment_seed_documents(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_recruitment_refresh_readiness(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_recruitment_apply_appointment_signed(uuid, jsonb, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_recruitment_apply_document_submit(uuid, text, jsonb, text) FROM PUBLIC;

DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.admin_recruitment_offer_save_draft(uuid, uuid, jsonb, integer)',
    'public.admin_recruitment_offer_generate(uuid, integer)',
    'public.admin_recruitment_offer_record_response(uuid, text, text, date, integer)',
    'public.admin_recruitment_offer_withdraw(uuid, text, integer)',
    'public.admin_recruitment_offer_attach_signed(uuid, jsonb)',
    'public.admin_recruitment_expire_offers()',
    'public.admin_recruitment_appointment_generate(uuid, jsonb, text)',
    'public.admin_recruitment_appointment_record_signed(uuid, jsonb, integer)',
    'public.admin_recruitment_appointment_cancel(uuid, text, integer)',
    'public.admin_recruitment_document_submit(uuid, text, jsonb)',
    'public.admin_recruitment_document_review(uuid, text, text, integer)',
    'public.admin_recruitment_joining_update(uuid, date, text, integer)',
    'public.admin_recruitment_mark_joining_no_show(uuid, text, integer)',
    'public.admin_recruitment_convert_to_employee(uuid, text, bigint)',
    'public.admin_recruitment_mark_joined(uuid, date, text, integer)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END;
$$;
