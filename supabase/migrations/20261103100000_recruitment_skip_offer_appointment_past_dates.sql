-- Skip offer-letter generation and issue the appointment letter directly from Selected.
-- Appointment joining dates may be in the past; the letter and the email keep that date.
-- A backdated joining date must not expire the secure link before the letter can be sent.

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
  v_r public.admin_recruitment_requisitions%rowtype;
  v_o public.admin_recruitment_offers%rowtype;
  v_a public.admin_recruitment_appointments%rowtype;
  v_requested_join date := public.admin_recruitment_date(p_payload ->> 'joiningDate');
  v_join date;
  v_gross numeric;
  v_designation text;
  v_department text;
  v_location text;
  v_employment text;
  v_skipped boolean := false;
  v_has_draft boolean := false;
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

  IF v_c.stage = 'offer_accepted' THEN
    SELECT * INTO v_o FROM public.admin_recruitment_offers
    WHERE candidate_id = p_candidate_id AND status = 'accepted'
    ORDER BY responded_at DESC LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'No accepted offer found for this candidate.';
    END IF;
    v_join := coalesce(v_requested_join, v_c.expected_joining_date, v_o.joining_date);
  ELSIF v_c.stage = 'selected' THEN
    IF EXISTS (
      SELECT 1 FROM public.admin_recruitment_offers
      WHERE candidate_id = p_candidate_id
        AND status IN ('generated', 'sent', 'viewed', 'accepted')
    ) THEN
      RAISE EXCEPTION 'This candidate already has an offer. Record the response or withdraw it before skipping the offer letter.';
    END IF;

    v_gross := v_c.expected_ctc;
    IF v_gross IS NULL OR v_gross <= 0 THEN
      RAISE EXCEPTION 'Save this candidate''s CTC (CTC calculator on the candidate page) before generating the appointment letter.';
    END IF;

    PERFORM public.admin_recruitment_use_requisition(v_c.requisition_id, v_c.id);
    SELECT * INTO v_r FROM public.admin_recruitment_requisitions WHERE id = v_c.requisition_id;

    SELECT * INTO v_o FROM public.admin_recruitment_offers
    WHERE candidate_id = p_candidate_id AND status = 'draft'
    FOR UPDATE;
    v_has_draft := FOUND;

    v_join := coalesce(v_requested_join, v_c.expected_joining_date);
    IF v_has_draft THEN
      v_join := coalesce(v_join, v_o.joining_date);
    END IF;
    IF v_join IS NULL THEN
      RAISE EXCEPTION 'Enter the joining date.';
    END IF;

    v_designation := coalesce(
      public.admin_recruitment_clean(p_payload ->> 'designation'),
      CASE WHEN v_has_draft THEN NULLIF(v_o.designation, '') END,
      v_r.designation,
      NULLIF(v_c.current_designation, ''),
      'Pending'
    );
    v_department := coalesce(
      public.admin_recruitment_clean(p_payload ->> 'department'),
      CASE WHEN v_has_draft THEN NULLIF(v_o.department, '') END,
      v_r.department
    );
    v_location := coalesce(
      public.admin_recruitment_clean(p_payload ->> 'location'),
      CASE WHEN v_has_draft THEN NULLIF(v_o.location, '') END,
      v_r.location
    );
    v_employment := coalesce(
      public.admin_recruitment_clean(p_payload ->> 'employmentType'),
      CASE WHEN v_has_draft THEN NULLIF(v_o.employment_type, '') END,
      v_r.employment_type,
      'Permanent'
    );

    IF v_has_draft THEN
      UPDATE public.admin_recruitment_offers SET
        status = 'accepted',
        offer_ref = coalesce(offer_ref, public.admin_recruitment_next_ref('OFR')),
        designation = v_designation,
        department = v_department,
        location = v_location,
        employment_type = v_employment,
        monthly_gross = v_gross,
        annual_ctc = v_gross * 12,
        joining_date = v_join,
        terms = CASE
          WHEN p_payload ? 'terms' THEN public.admin_recruitment_clean(p_payload ->> 'terms')
          ELSE terms
        END,
        responded_at = now(),
        response_note = 'Offer letter skipped — appointment letter issued directly.',
        response_channel = 'recorded_by_staff',
        response_recorded_by = auth.uid(),
        response_recorded_by_name = public.admin_recruitment_actor_name(auth.uid()),
        version = version + 1
      WHERE id = v_o.id
      RETURNING * INTO v_o;
    ELSE
      INSERT INTO public.admin_recruitment_offers (
        candidate_id, offer_ref, status, designation, department, location, employment_type,
        monthly_gross, annual_ctc, joining_date, terms,
        responded_at, response_note, response_channel, response_recorded_by, response_recorded_by_name,
        created_by, created_by_name
      ) VALUES (
        p_candidate_id, public.admin_recruitment_next_ref('OFR'), 'accepted',
        v_designation, v_department, v_location, v_employment,
        v_gross, v_gross * 12, v_join,
        public.admin_recruitment_clean(p_payload ->> 'terms'),
        now(), 'Offer letter skipped — appointment letter issued directly.', 'recorded_by_staff',
        auth.uid(), public.admin_recruitment_actor_name(auth.uid()),
        auth.uid(), public.admin_recruitment_actor_name(auth.uid())
      )
      RETURNING * INTO v_o;
    END IF;

    PERFORM public.admin_recruitment_log(
      p_candidate_id, v_c.requisition_id, 'offer', v_o.id, 'offer_accepted', NULL, 'accepted',
      'Offer letter skipped — appointment letter issued directly',
      jsonb_build_object('skipOfferLetter', true, 'joiningDate', v_join)
    );
    PERFORM public.admin_recruitment_set_stage(
      p_candidate_id, 'offer_accepted', 'Offer letter skipped',
      jsonb_build_object('skipOfferLetter', true)
    );
    v_skipped := true;
  ELSE
    RAISE EXCEPTION 'The appointment letter is issued after the offer is accepted (current stage: %).', replace(v_c.stage, '_', ' ');
  END IF;

  IF v_join IS NULL THEN
    RAISE EXCEPTION 'Enter the joining date.';
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
    'Appointment letter ' || v_a.appointment_ref || ' generated (joining ' || to_char(v_join, 'DD Mon YYYY') || ')'
      || CASE WHEN v_skipped THEN ' — offer letter skipped' ELSE '' END,
    jsonb_build_object('appointmentRef', v_a.appointment_ref, 'joiningDate', v_join, 'skipOfferLetter', v_skipped)
  );
  PERFORM public.admin_recruitment_set_stage(p_candidate_id, 'appointment', 'Moved to Appointment', '{}'::jsonb);

  RETURN public.admin_recruitment_request_end(p_request_key, 'appointment_generate', to_jsonb(v_a));
END;
$$;

COMMENT ON FUNCTION public.admin_recruitment_appointment_generate(uuid, jsonb, text) IS
  'Issues an appointment letter after an accepted offer, or directly from Selected when the offer letter is skipped. Joining date may be in the past.';

CREATE OR REPLACE FUNCTION public.admin_recruitment_portal_issue(
  p_candidate_id uuid,
  p_purpose text,
  p_ref_id uuid,
  p_token_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days integer;
  v_expires timestamptz;
  v_valid_until date;
  v_joining date;
BEGIN
  PERFORM public.admin_recruitment_require_service();
  IF p_purpose NOT IN ('offer', 'appointment', 'documents') THEN
    RAISE EXCEPTION 'Unknown link purpose.';
  END IF;
  IF p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid token.';
  END IF;

  SELECT portal_link_days INTO v_days FROM public.admin_recruitment_settings WHERE id;
  v_expires := now() + make_interval(days => coalesce(v_days, 14));

  IF p_purpose = 'offer' THEN
    SELECT valid_until INTO v_valid_until FROM public.admin_recruitment_offers WHERE id = p_ref_id;
    IF v_valid_until IS NULL THEN
      RAISE EXCEPTION 'Offer respond-by date is missing.';
    END IF;
    -- Valid through the whole Respond-by date (Asia/Kolkata).
    v_expires := ((v_valid_until + 1)::timestamp AT TIME ZONE 'Asia/Kolkata');
  ELSIF p_purpose = 'appointment' THEN
    SELECT joining_date INTO v_joining FROM public.admin_recruitment_appointments WHERE id = p_ref_id;
    IF v_joining IS NULL THEN
      RAISE EXCEPTION 'Appointment joining date is missing.';
    END IF;
    -- Valid through the whole joining date (Asia/Kolkata).
    v_expires := ((v_joining + 1)::timestamp AT TIME ZONE 'Asia/Kolkata');
    -- A past joining date would already be expired, so the letter could not be sent with a working link.
    IF v_expires <= now() THEN
      v_expires := now() + make_interval(days => coalesce(v_days, 14));
    END IF;
  END IF;

  UPDATE public.admin_recruitment_portal_tokens
  SET revoked_at = now()
  WHERE candidate_id = p_candidate_id AND purpose = p_purpose
    AND ref_id IS NOT DISTINCT FROM p_ref_id AND revoked_at IS NULL;

  INSERT INTO public.admin_recruitment_portal_tokens (candidate_id, purpose, ref_id, token_hash, expires_at)
  VALUES (p_candidate_id, p_purpose, p_ref_id, p_token_hash, v_expires);

  RETURN jsonb_build_object('expiresAt', v_expires);
END;
$$;

COMMENT ON FUNCTION public.admin_recruitment_portal_issue(uuid, text, uuid, text) IS
  'Issues a portal token. Offer links expire at end of valid_until (Respond by). Appointment links expire at end of joining_date (IST), or the normal portal window when that joining date is already past.';

NOTIFY pgrst, 'reload schema';
