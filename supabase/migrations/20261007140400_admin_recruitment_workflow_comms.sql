-- =============================================================================
-- Admin In-house Recruitment — files, letters, email log, candidate secure links,
-- reminders/automation and configuration.
-- Email delivery itself is done by the API server (existing mail infrastructure);
-- these functions record intent, status and workflow side effects.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- File access (checked by the API server before upload / download)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_recruitment_can_access_files(
  p_candidate_id uuid,
  p_category text,
  p_write boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admin_recruitment_candidates WHERE id = p_candidate_id) THEN
    RETURN false;
  END IF;
  RETURN CASE p_category
    WHEN 'resume' THEN public.admin_recruitment_can(CASE WHEN p_write THEN 'candidates' ELSE 'view' END)
    WHEN 'offer' THEN public.admin_recruitment_can('offers')
    WHEN 'appointment' THEN public.admin_recruitment_can('offers')
    WHEN 'document' THEN public.admin_recruitment_can('documents')
      OR (NOT p_write AND public.admin_recruitment_can('joining'))
    ELSE false
  END;
END;
$$;

-- Generated letter PDF stored by the API server after the user generated the letter.
CREATE OR REPLACE FUNCTION public.admin_recruitment_letter_attach_generated(
  p_kind text,
  p_id uuid,
  p_file jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cid uuid;
  v_ref text;
  v_req uuid;
BEGIN
  PERFORM public.admin_recruitment_require_service();
  IF public.admin_recruitment_clean(p_file ->> 'objectKey') IS NULL THEN
    RAISE EXCEPTION 'Letter file is missing.';
  END IF;

  IF p_kind = 'offer' THEN
    UPDATE public.admin_recruitment_offers
    SET generated_doc = p_file || jsonb_build_object('generatedAt', now())
    WHERE id = p_id AND status IN ('generated', 'sent', 'viewed', 'accepted')
    RETURNING candidate_id, offer_ref INTO v_cid, v_ref;
  ELSIF p_kind = 'appointment' THEN
    UPDATE public.admin_recruitment_appointments
    SET generated_doc = p_file || jsonb_build_object('generatedAt', now())
    WHERE id = p_id AND status IN ('generated', 'sent', 'viewed', 'signed')
    RETURNING candidate_id, appointment_ref INTO v_cid, v_ref;
  ELSE
    RAISE EXCEPTION 'Unknown letter type.';
  END IF;

  IF v_cid IS NULL THEN
    RAISE EXCEPTION 'The letter is no longer active.';
  END IF;
  IF (p_file ->> 'objectKey') NOT LIKE 'admin-recruitment/' || v_cid::text || '/%' THEN
    RAISE EXCEPTION 'Invalid letter file.';
  END IF;
  SELECT requisition_id INTO v_req FROM public.admin_recruitment_candidates WHERE id = v_cid;
  PERFORM public.admin_recruitment_log(
    v_cid, v_req, p_kind, p_id, p_kind || '_letter_created', NULL, NULL,
    initcap(p_kind) || ' letter ' || v_ref || ' prepared',
    jsonb_build_object('fileName', p_file ->> 'fileName'),
    'system', 'Recruitment'
  );
  RETURN jsonb_build_object('candidateId', v_cid, 'ref', v_ref);
END;
$$;

-- ---------------------------------------------------------------------------
-- Communications
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_recruitment_template_cap(p_category text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_category
    WHEN 'interview' THEN 'interviews'
    WHEN 'offer' THEN 'offers'
    WHEN 'appointment' THEN 'offers'
    WHEN 'documents' THEN 'documents'
    WHEN 'joining' THEN 'joining'
    ELSE 'communication'
  END
$$;

-- Validates a send request and records it as queued.
-- Returns { communication, context, alreadyHandled, portalPurpose, portalRefId, letter }.
CREATE OR REPLACE FUNCTION public.admin_recruitment_comm_prepare(
  p_candidate_id uuid,
  p_template_key text,
  p_related_type text,
  p_related_id uuid,
  p_subject text,
  p_body text,
  p_idempotency_key text,
  p_trigger text DEFAULT 'manual'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_t public.admin_recruitment_templates%rowtype;
  v_c public.admin_recruitment_candidates%rowtype;
  v_r public.admin_recruitment_requisitions%rowtype;
  v_s public.admin_recruitment_settings%rowtype;
  v_i public.admin_recruitment_interviews%rowtype;
  v_o public.admin_recruitment_offers%rowtype;
  v_a public.admin_recruitment_appointments%rowtype;
  v_comm public.admin_recruitment_communications%rowtype;
  v_ctx jsonb;
  v_pending text;
  v_portal text;
  v_portal_ref uuid;
  v_letter jsonb;
  v_related text := nullif(btrim(coalesce(p_related_type, '')), '');
  v_trigger text := coalesce(nullif(p_trigger, ''), 'manual');
BEGIN
  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'Missing request key.';
  END IF;
  IF v_trigger NOT IN ('manual', 'workflow', 'automation') THEN
    RAISE EXCEPTION 'Unknown trigger.';
  END IF;

  SELECT * INTO v_t FROM public.admin_recruitment_templates WHERE key = p_template_key;
  IF NOT FOUND OR NOT v_t.active THEN
    RAISE EXCEPTION 'Email template not found or inactive.';
  END IF;
  IF NOT (public.admin_recruitment_can(public.admin_recruitment_template_cap(v_t.category))
          OR public.admin_recruitment_can('communication')) THEN
    RAISE EXCEPTION 'You do not have permission to send this email.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_comm FROM public.admin_recruitment_communications WHERE idempotency_key = p_idempotency_key;
  IF FOUND AND v_comm.status IN ('sent', 'sending', 'skipped') THEN
    RETURN jsonb_build_object('communication', to_jsonb(v_comm), 'alreadyHandled', true);
  END IF;

  SELECT * INTO v_c FROM public.admin_recruitment_candidates WHERE id = p_candidate_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidate not found.';
  END IF;
  IF v_c.email IS NULL THEN
    RAISE EXCEPTION 'This candidate has no email address.';
  END IF;
  SELECT * INTO v_r FROM public.admin_recruitment_requisitions WHERE id = v_c.requisition_id;
  SELECT * INTO v_s FROM public.admin_recruitment_settings WHERE id;

  -- Default related record by template.
  IF v_related IS NULL THEN
    v_related := CASE p_template_key
      WHEN 'interview_invite' THEN 'interview' WHEN 'interview_reminder' THEN 'interview'
      WHEN 'offer_letter' THEN 'offer' WHEN 'offer_reminder' THEN 'offer'
      WHEN 'appointment_letter' THEN 'appointment'
      WHEN 'document_request' THEN 'documents' WHEN 'document_reminder' THEN 'documents'
      WHEN 'joining_reminder' THEN 'joining'
    END;
  END IF;

  v_ctx := jsonb_build_object(
    'candidate_name', v_c.full_name,
    'company_name', v_s.company_name,
    'position', coalesce(v_r.designation, v_c.current_designation, ''),
    'location', coalesce(v_r.location, ''),
    'joining_date', coalesce(to_char(v_c.expected_joining_date, 'DD Mon YYYY'), '')
  );

  IF v_related = 'interview' THEN
    SELECT * INTO v_i FROM public.admin_recruitment_interviews
    WHERE candidate_id = p_candidate_id
      AND (id = p_related_id OR (p_related_id IS NULL AND status = 'scheduled'))
    ORDER BY scheduled_at DESC LIMIT 1;
    IF NOT FOUND OR v_i.status <> 'scheduled' THEN
      RAISE EXCEPTION 'There is no scheduled interview to send this email for.';
    END IF;
    v_ctx := v_ctx || jsonb_build_object(
      'interview_date', to_char(v_i.scheduled_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY'),
      'interview_time', to_char(v_i.scheduled_at AT TIME ZONE 'Asia/Kolkata', 'HH12:MI AM'),
      'interview_mode', initcap(v_i.mode),
      'interview_location', coalesce(v_i.location, CASE v_i.mode WHEN 'phone' THEN 'We will call you on your registered number' ELSE 'Will be shared separately' END)
    );
    p_related_id := v_i.id;
  ELSIF v_related = 'offer' THEN
    SELECT * INTO v_o FROM public.admin_recruitment_offers
    WHERE candidate_id = p_candidate_id
      AND (id = p_related_id OR (p_related_id IS NULL AND status IN ('generated', 'sent', 'viewed')))
    ORDER BY created_at DESC LIMIT 1;
    IF NOT FOUND OR v_o.status NOT IN ('generated', 'sent', 'viewed') THEN
      RAISE EXCEPTION 'There is no open offer to send.';
    END IF;
    IF v_o.valid_until < public.admin_recruitment_today() THEN
      RAISE EXCEPTION 'This offer has expired.';
    END IF;
    IF p_template_key = 'offer_letter' AND v_o.generated_doc IS NULL THEN
      RAISE EXCEPTION 'The offer letter document is not ready yet. Try again in a moment.';
    END IF;
    v_ctx := v_ctx || jsonb_build_object(
      'offer_ref', v_o.offer_ref,
      'expiry_date', to_char(v_o.valid_until, 'DD Mon YYYY'),
      'position', v_o.designation,
      'location', coalesce(v_o.location, ''),
      'joining_date', coalesce(to_char(v_o.joining_date, 'DD Mon YYYY'), '')
    );
    v_portal := 'offer';
    v_portal_ref := v_o.id;
    v_letter := CASE WHEN p_template_key = 'offer_letter' THEN v_o.generated_doc END;
    p_related_id := v_o.id;
  ELSIF v_related = 'appointment' THEN
    SELECT * INTO v_a FROM public.admin_recruitment_appointments
    WHERE candidate_id = p_candidate_id
      AND (id = p_related_id OR (p_related_id IS NULL AND status IN ('generated', 'sent', 'viewed')))
    ORDER BY created_at DESC LIMIT 1;
    IF NOT FOUND OR v_a.status NOT IN ('generated', 'sent', 'viewed') THEN
      RAISE EXCEPTION 'There is no unsigned appointment letter to send.';
    END IF;
    IF v_a.generated_doc IS NULL THEN
      RAISE EXCEPTION 'The appointment letter document is not ready yet. Try again in a moment.';
    END IF;
    v_ctx := v_ctx || jsonb_build_object(
      'appointment_ref', v_a.appointment_ref,
      'position', v_a.designation,
      'location', coalesce(v_a.location, ''),
      'joining_date', coalesce(to_char(v_a.joining_date, 'DD Mon YYYY'), '')
    );
    v_portal := 'appointment';
    v_portal_ref := v_a.id;
    v_letter := v_a.generated_doc;
    p_related_id := v_a.id;
  ELSIF v_related = 'documents' THEN
    IF v_c.outcome IS NOT NULL OR v_c.stage NOT IN ('documents', 'ready_to_join') THEN
      RAISE EXCEPTION 'Documents are requested after the appointment letter is signed.';
    END IF;
    SELECT string_agg('• ' || d.label || CASE WHEN d.status = 'rejected' THEN ' (please resubmit: ' || coalesce(d.rejection_reason, 'rejected') || ')' ELSE '' END, E'\n' ORDER BY t.sort_order)
      INTO v_pending
    FROM public.admin_recruitment_candidate_documents d
    LEFT JOIN public.admin_recruitment_document_types t ON t.key = d.document_key
    WHERE d.candidate_id = p_candidate_id AND d.status IN ('pending', 'rejected');
    IF v_pending IS NULL AND p_template_key IN ('document_request', 'document_reminder') THEN
      RAISE EXCEPTION 'No documents are pending for this candidate.';
    END IF;
    v_ctx := v_ctx || jsonb_build_object('pending_documents', coalesce(v_pending, ''));
    v_portal := 'documents';
    v_portal_ref := NULL;
    p_related_id := NULL;
  ELSIF v_related = 'joining' THEN
    IF v_c.outcome IS NOT NULL OR v_c.stage NOT IN ('offer_accepted', 'appointment', 'documents', 'ready_to_join') THEN
      RAISE EXCEPTION 'Joining reminders apply to candidates who accepted an offer and have not joined.';
    END IF;
    IF v_c.expected_joining_date IS NULL THEN
      RAISE EXCEPTION 'Set the expected joining date first.';
    END IF;
    p_related_id := NULL;
  ELSIF v_related IS NOT NULL THEN
    RAISE EXCEPTION 'Unknown related record type.';
  END IF;

  IF v_comm.id IS NULL THEN
    INSERT INTO public.admin_recruitment_communications (
      candidate_id, template_key, recipient, subject, body, status, idempotency_key,
      related_type, related_id, trigger, created_by, created_by_name
    ) VALUES (
      p_candidate_id, p_template_key, v_c.email,
      coalesce(nullif(btrim(coalesce(p_subject, '')), ''), v_t.subject),
      coalesce(nullif(btrim(coalesce(p_body, '')), ''), v_t.body),
      'queued', p_idempotency_key, v_related, p_related_id, v_trigger,
      auth.uid(),
      CASE WHEN v_trigger = 'automation' THEN 'Automation' ELSE public.admin_recruitment_actor_name(auth.uid()) END
    )
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING * INTO v_comm;
    IF v_comm.id IS NULL THEN
      SELECT * INTO v_comm FROM public.admin_recruitment_communications WHERE idempotency_key = p_idempotency_key;
      RETURN jsonb_build_object('communication', to_jsonb(v_comm), 'alreadyHandled', true);
    END IF;
  ELSE
    -- Retry of a failed/queued message: refresh content from the latest request.
    UPDATE public.admin_recruitment_communications SET
      recipient = v_c.email,
      subject = coalesce(nullif(btrim(coalesce(p_subject, '')), ''), subject),
      body = coalesce(nullif(btrim(coalesce(p_body, '')), ''), body)
    WHERE id = v_comm.id
    RETURNING * INTO v_comm;
  END IF;

  RETURN jsonb_build_object(
    'communication', to_jsonb(v_comm),
    'context', v_ctx,
    'alreadyHandled', false,
    'portalPurpose', v_portal,
    'portalRefId', v_portal_ref,
    'letter', v_letter
  );
END;
$$;

-- Server: lock a queued/failed message for sending. Returns NULL when nothing to do.
CREATE OR REPLACE FUNCTION public.admin_recruitment_comm_claim(
  p_id uuid,
  p_subject text,
  p_body text,
  p_attachments jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_comm public.admin_recruitment_communications%rowtype;
BEGIN
  PERFORM public.admin_recruitment_require_service();
  UPDATE public.admin_recruitment_communications SET
    status = 'sending',
    attempts = attempts + 1,
    locked_at = now(),
    subject = coalesce(p_subject, subject),
    body = coalesce(p_body, body),
    attachments = coalesce(p_attachments, '[]'::jsonb),
    error = NULL
  WHERE id = p_id
    AND (status IN ('queued', 'failed') OR (status = 'sending' AND locked_at < now() - interval '10 minutes'))
  RETURNING * INTO v_comm;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN to_jsonb(v_comm);
END;
$$;

-- Server: record delivery outcome and apply workflow side effects (only on success).
CREATE OR REPLACE FUNCTION public.admin_recruitment_comm_complete(
  p_id uuid,
  p_success boolean,
  p_error text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_comm public.admin_recruitment_communications%rowtype;
  v_c public.admin_recruitment_candidates%rowtype;
  v_kind text;
  v_actor text;
  v_prev text;
  v_ref text;
BEGIN
  PERFORM public.admin_recruitment_require_service();

  SELECT * INTO v_comm FROM public.admin_recruitment_communications WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Communication not found.';
  END IF;
  IF v_comm.status = 'sent' THEN
    RETURN to_jsonb(v_comm);
  END IF;
  SELECT * INTO v_c FROM public.admin_recruitment_candidates WHERE id = v_comm.candidate_id;
  v_kind := CASE WHEN v_comm.trigger = 'automation' THEN 'system' ELSE 'user' END;
  v_actor := coalesce(v_comm.created_by_name, 'Recruitment');

  IF NOT coalesce(p_success, false) THEN
    UPDATE public.admin_recruitment_communications
    SET status = 'failed', error = left(coalesce(p_error, 'Delivery failed'), 1000), locked_at = NULL
    WHERE id = p_id
    RETURNING * INTO v_comm;
    PERFORM public.admin_recruitment_log(
      v_c.id, v_c.requisition_id, 'communication', v_comm.id, 'email_failed', NULL, 'failed',
      'Email not delivered: ' || v_comm.subject,
      jsonb_build_object('error', v_comm.error, 'templateKey', v_comm.template_key, 'attempts', v_comm.attempts),
      v_kind, v_actor
    );
    RETURN to_jsonb(v_comm);
  END IF;

  UPDATE public.admin_recruitment_communications
  SET status = 'sent', sent_at = now(), error = NULL, locked_at = NULL
  WHERE id = p_id
  RETURNING * INTO v_comm;

  PERFORM public.admin_recruitment_log(
    v_c.id, v_c.requisition_id, 'communication', v_comm.id, 'email_sent', NULL, 'sent',
    'Email sent: ' || v_comm.subject,
    jsonb_build_object('templateKey', v_comm.template_key, 'recipient', v_comm.recipient, 'trigger', v_comm.trigger),
    v_kind, v_actor
  );

  CASE v_comm.template_key
    WHEN 'interview_invite' THEN
      UPDATE public.admin_recruitment_interviews SET invite_sent_at = now() WHERE id = v_comm.related_id;
    WHEN 'interview_reminder' THEN
      UPDATE public.admin_recruitment_interviews SET reminder_sent_at = now() WHERE id = v_comm.related_id;
    WHEN 'offer_letter' THEN
      SELECT status, offer_ref INTO v_prev, v_ref FROM public.admin_recruitment_offers WHERE id = v_comm.related_id FOR UPDATE;
      UPDATE public.admin_recruitment_offers SET
        status = CASE WHEN status = 'generated' THEN 'sent' ELSE status END,
        sent_at = now(),
        send_count = send_count + 1,
        version = version + 1
      WHERE id = v_comm.related_id AND status IN ('generated', 'sent', 'viewed');
      IF v_prev = 'generated' THEN
        PERFORM public.admin_recruitment_log(
          v_c.id, v_c.requisition_id, 'offer', v_comm.related_id, 'offer_sent', 'generated', 'sent',
          'Offer ' || v_ref || ' sent to ' || v_comm.recipient, '{}'::jsonb, v_kind, v_actor
        );
      END IF;
    WHEN 'offer_reminder' THEN
      UPDATE public.admin_recruitment_offers
      SET reminder_count = reminder_count + 1, last_reminder_at = now()
      WHERE id = v_comm.related_id;
    WHEN 'appointment_letter' THEN
      SELECT status, appointment_ref INTO v_prev, v_ref FROM public.admin_recruitment_appointments WHERE id = v_comm.related_id FOR UPDATE;
      UPDATE public.admin_recruitment_appointments SET
        status = CASE WHEN status = 'generated' THEN 'sent' ELSE status END,
        sent_at = now(),
        send_count = send_count + 1,
        version = version + 1
      WHERE id = v_comm.related_id AND status IN ('generated', 'sent', 'viewed');
      IF v_prev = 'generated' THEN
        PERFORM public.admin_recruitment_log(
          v_c.id, v_c.requisition_id, 'appointment', v_comm.related_id, 'appointment_sent', 'generated', 'sent',
          'Appointment letter ' || v_ref || ' sent to ' || v_comm.recipient, '{}'::jsonb, v_kind, v_actor
        );
      END IF;
    WHEN 'document_request' THEN
      UPDATE public.admin_recruitment_candidates SET doc_last_reminder_at = now() WHERE id = v_c.id;
    WHEN 'document_reminder' THEN
      UPDATE public.admin_recruitment_candidates
      SET doc_last_reminder_at = now(), doc_reminder_count = doc_reminder_count + 1
      WHERE id = v_c.id;
    WHEN 'joining_reminder' THEN
      UPDATE public.admin_recruitment_candidates SET joining_reminder_for = expected_joining_date WHERE id = v_c.id;
    ELSE
      NULL;
  END CASE;

  RETURN to_jsonb(v_comm);
END;
$$;

-- ---------------------------------------------------------------------------
-- Candidate secure links (API server only; tokens are stored as SHA-256 hashes)
-- ---------------------------------------------------------------------------
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
    IF v_valid_until IS NOT NULL THEN
      v_expires := least(v_expires, ((v_valid_until + 1)::timestamp AT TIME ZONE 'Asia/Kolkata') + interval '7 days');
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

-- Internal: resolve a token row; raises when expired / revoked.
CREATE OR REPLACE FUNCTION public.admin_recruitment_portal_token(p_token_hash text)
RETURNS public.admin_recruitment_portal_tokens
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_t public.admin_recruitment_portal_tokens%rowtype;
BEGIN
  SELECT * INTO v_t FROM public.admin_recruitment_portal_tokens WHERE token_hash = p_token_hash FOR UPDATE;
  IF NOT FOUND OR v_t.revoked_at IS NOT NULL OR v_t.expires_at < now() THEN
    RAISE EXCEPTION 'This link has expired or is no longer valid. Please contact the recruitment team.';
  END IF;
  UPDATE public.admin_recruitment_portal_tokens
  SET last_used_at = now(), use_count = use_count + 1
  WHERE id = v_t.id;
  RETURN v_t;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_recruitment_portal_resolve(p_token_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_t public.admin_recruitment_portal_tokens%rowtype;
  v_c public.admin_recruitment_candidates%rowtype;
  v_s public.admin_recruitment_settings%rowtype;
  v_o public.admin_recruitment_offers%rowtype;
  v_a public.admin_recruitment_appointments%rowtype;
  v_out jsonb;
  v_docs jsonb;
BEGIN
  PERFORM public.admin_recruitment_require_service();
  v_t := public.admin_recruitment_portal_token(p_token_hash);
  SELECT * INTO v_c FROM public.admin_recruitment_candidates WHERE id = v_t.candidate_id;
  SELECT * INTO v_s FROM public.admin_recruitment_settings WHERE id;

  v_out := jsonb_build_object(
    'purpose', v_t.purpose,
    'candidateId', v_c.id,
    'candidateName', v_c.full_name,
    'companyName', v_s.company_name,
    'closed', v_c.outcome IS NOT NULL,
    'expiresAt', v_t.expires_at
  );

  IF v_t.purpose = 'offer' THEN
    SELECT * INTO v_o FROM public.admin_recruitment_offers WHERE id = v_t.ref_id;
    v_out := v_out || jsonb_build_object('offer', jsonb_build_object(
      'id', v_o.id, 'ref', v_o.offer_ref, 'status', v_o.status, 'designation', v_o.designation,
      'department', v_o.department, 'location', v_o.location, 'employmentType', v_o.employment_type,
      'monthlyGross', v_o.monthly_gross, 'annualCtc', v_o.annual_ctc, 'joiningDate', v_o.joining_date,
      'validUntil', v_o.valid_until, 'respondedAt', v_o.responded_at,
      'hasLetter', v_o.generated_doc IS NOT NULL, 'hasSignedCopy', v_o.signed_doc IS NOT NULL
    ));
  ELSIF v_t.purpose = 'appointment' THEN
    SELECT * INTO v_a FROM public.admin_recruitment_appointments WHERE id = v_t.ref_id;
    v_out := v_out || jsonb_build_object('appointment', jsonb_build_object(
      'id', v_a.id, 'ref', v_a.appointment_ref, 'status', v_a.status, 'designation', v_a.designation,
      'location', v_a.location, 'joiningDate', v_a.joining_date, 'signedAt', v_a.signed_at,
      'hasLetter', v_a.generated_doc IS NOT NULL
    ));
  END IF;

  IF v_t.purpose IN ('documents', 'appointment') THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'key', d.document_key, 'label', d.label, 'required', d.required, 'status', d.status,
             'rejectionReason', d.rejection_reason, 'submittedAt', d.submitted_at,
             'description', t.description
           ) ORDER BY coalesce(t.sort_order, 999), d.label), '[]'::jsonb)
      INTO v_docs
    FROM public.admin_recruitment_candidate_documents d
    LEFT JOIN public.admin_recruitment_document_types t ON t.key = d.document_key
    WHERE d.candidate_id = v_c.id;
    v_out := v_out || jsonb_build_object(
      'documents', v_docs,
      'documentsOpen', v_c.outcome IS NULL AND v_c.stage IN ('documents', 'ready_to_join')
    );
  END IF;

  RETURN v_out;
END;
$$;

-- Marks the letter as viewed the first time the candidate opens the link.
CREATE OR REPLACE FUNCTION public.admin_recruitment_portal_view(p_token_hash text, p_ip text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_t public.admin_recruitment_portal_tokens%rowtype;
  v_c public.admin_recruitment_candidates%rowtype;
  v_ref text;
BEGIN
  PERFORM public.admin_recruitment_require_service();
  v_t := public.admin_recruitment_portal_token(p_token_hash);
  SELECT * INTO v_c FROM public.admin_recruitment_candidates WHERE id = v_t.candidate_id;

  IF v_t.purpose = 'offer' THEN
    UPDATE public.admin_recruitment_offers
    SET status = 'viewed', viewed_at = now(), version = version + 1
    WHERE id = v_t.ref_id AND status IN ('generated', 'sent')
    RETURNING offer_ref INTO v_ref;
    IF v_ref IS NOT NULL THEN
      PERFORM public.admin_recruitment_log(
        v_c.id, v_c.requisition_id, 'offer', v_t.ref_id, 'offer_viewed', 'sent', 'viewed',
        'Candidate opened offer ' || v_ref, jsonb_build_object('ip', p_ip), 'candidate', v_c.full_name
      );
    END IF;
  ELSIF v_t.purpose = 'appointment' THEN
    UPDATE public.admin_recruitment_appointments
    SET status = 'viewed', viewed_at = now(), version = version + 1
    WHERE id = v_t.ref_id AND status IN ('generated', 'sent')
    RETURNING appointment_ref INTO v_ref;
    IF v_ref IS NOT NULL THEN
      PERFORM public.admin_recruitment_log(
        v_c.id, v_c.requisition_id, 'appointment', v_t.ref_id, 'appointment_viewed', 'sent', 'viewed',
        'Candidate opened appointment letter ' || v_ref, jsonb_build_object('ip', p_ip), 'candidate', v_c.full_name
      );
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_recruitment_portal_offer_respond(
  p_token_hash text,
  p_response text,
  p_note text,
  p_ip text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_t public.admin_recruitment_portal_tokens%rowtype;
BEGIN
  PERFORM public.admin_recruitment_require_service();
  v_t := public.admin_recruitment_portal_token(p_token_hash);
  IF v_t.purpose <> 'offer' THEN
    RAISE EXCEPTION 'This link cannot be used to respond to an offer.';
  END IF;
  RETURN public.admin_recruitment_apply_offer_response(
    v_t.ref_id, p_response, public.admin_recruitment_clean(left(p_note, 1000)), NULL,
    'candidate_link', p_ip, p_user_agent
  );
END;
$$;

-- Candidate uploads: signed offer, signed appointment letter, or a joining document.
CREATE OR REPLACE FUNCTION public.admin_recruitment_portal_attach(
  p_token_hash text,
  p_kind text,
  p_document_key text,
  p_file jsonb,
  p_ip text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_t public.admin_recruitment_portal_tokens%rowtype;
  v_o public.admin_recruitment_offers%rowtype;
  v_req uuid;
BEGIN
  PERFORM public.admin_recruitment_require_service();
  v_t := public.admin_recruitment_portal_token(p_token_hash);

  IF p_kind = 'appointment_signed' THEN
    IF v_t.purpose <> 'appointment' THEN
      RAISE EXCEPTION 'This link cannot be used to upload an appointment letter.';
    END IF;
    RETURN public.admin_recruitment_apply_appointment_signed(v_t.ref_id, p_file, 'candidate_link', p_ip);
  ELSIF p_kind = 'document' THEN
    IF v_t.purpose NOT IN ('documents', 'appointment') THEN
      RAISE EXCEPTION 'This link cannot be used to upload documents.';
    END IF;
    RETURN public.admin_recruitment_apply_document_submit(v_t.candidate_id, p_document_key, p_file, 'candidate_link');
  ELSIF p_kind = 'offer_signed' THEN
    IF v_t.purpose <> 'offer' THEN
      RAISE EXCEPTION 'This link cannot be used to upload a signed offer.';
    END IF;
    SELECT * INTO v_o FROM public.admin_recruitment_offers WHERE id = v_t.ref_id FOR UPDATE;
    IF v_o.status <> 'accepted' THEN
      RAISE EXCEPTION 'Accept the offer before uploading the signed copy.';
    END IF;
    IF public.admin_recruitment_clean(p_file ->> 'objectKey') IS NULL
       OR (p_file ->> 'objectKey') NOT LIKE 'admin-recruitment/' || v_t.candidate_id::text || '/%' THEN
      RAISE EXCEPTION 'Upload a file first.';
    END IF;
    UPDATE public.admin_recruitment_offers
    SET signed_doc = p_file || jsonb_build_object('uploadedAt', now(), 'channel', 'candidate_link', 'ip', p_ip),
        version = version + 1
    WHERE id = v_o.id
    RETURNING * INTO v_o;
    SELECT requisition_id INTO v_req FROM public.admin_recruitment_candidates WHERE id = v_t.candidate_id;
    PERFORM public.admin_recruitment_log(
      v_t.candidate_id, v_req, 'offer', v_o.id, 'offer_signed_copy', NULL, NULL,
      'Candidate uploaded the signed offer ' || v_o.offer_ref,
      jsonb_build_object('fileName', p_file ->> 'fileName', 'ip', p_ip),
      'candidate', (SELECT full_name FROM public.admin_recruitment_candidates WHERE id = v_t.candidate_id)
    );
    RETURN to_jsonb(v_o);
  END IF;
  RAISE EXCEPTION 'Unknown upload type.';
END;
$$;

-- File keys the candidate may download through their link (their own letters only).
CREATE OR REPLACE FUNCTION public.admin_recruitment_portal_file(p_token_hash text, p_which text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_t public.admin_recruitment_portal_tokens%rowtype;
  v_doc jsonb;
BEGIN
  PERFORM public.admin_recruitment_require_service();
  v_t := public.admin_recruitment_portal_token(p_token_hash);
  IF p_which = 'letter' AND v_t.purpose = 'offer' THEN
    SELECT generated_doc INTO v_doc FROM public.admin_recruitment_offers WHERE id = v_t.ref_id;
  ELSIF p_which = 'letter' AND v_t.purpose = 'appointment' THEN
    SELECT generated_doc INTO v_doc FROM public.admin_recruitment_appointments WHERE id = v_t.ref_id;
  END IF;
  IF v_doc IS NULL THEN
    RAISE EXCEPTION 'File not available.';
  END IF;
  RETURN v_doc;
END;
$$;

-- ---------------------------------------------------------------------------
-- Automation: work that is due (reminders). Offer expiry runs separately.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_recruitment_automation_due()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_s public.admin_recruitment_settings%rowtype;
  v_out jsonb := '{}'::jsonb;
  v_list jsonb;
BEGIN
  PERFORM public.admin_recruitment_require_service();
  SELECT * INTO v_s FROM public.admin_recruitment_settings WHERE id;

  IF coalesce((v_s.auto_reminders ->> 'interview')::boolean, false) THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('candidateId', i.candidate_id, 'interviewId', i.id)), '[]'::jsonb)
      INTO v_list
    FROM public.admin_recruitment_interviews i
    JOIN public.admin_recruitment_candidates c ON c.id = i.candidate_id
    WHERE i.status = 'scheduled'
      AND i.reminder_sent_at IS NULL
      AND i.scheduled_at > now()
      AND i.scheduled_at <= now() + make_interval(hours => v_s.interview_reminder_hours)
      AND i.created_at < now() - interval '30 minutes'
      AND c.outcome IS NULL AND c.email IS NOT NULL;
    v_out := v_out || jsonb_build_object('interviewReminders', v_list);
  END IF;

  IF coalesce((v_s.auto_reminders ->> 'offer')::boolean, false) AND v_s.max_reminders > 0 THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('candidateId', o.candidate_id, 'offerId', o.id, 'seq', o.reminder_count + 1)), '[]'::jsonb)
      INTO v_list
    FROM public.admin_recruitment_offers o
    JOIN public.admin_recruitment_candidates c ON c.id = o.candidate_id
    WHERE o.status IN ('sent', 'viewed')
      AND o.valid_until >= public.admin_recruitment_today()
      AND o.reminder_count < v_s.max_reminders
      AND coalesce(o.last_reminder_at, o.sent_at) < now() - make_interval(days => v_s.offer_reminder_days)
      AND c.outcome IS NULL AND c.email IS NOT NULL;
    v_out := v_out || jsonb_build_object('offerReminders', v_list);
  END IF;

  IF coalesce((v_s.auto_reminders ->> 'documents')::boolean, false) AND v_s.max_reminders > 0 THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('candidateId', c.id, 'seq', c.doc_reminder_count + 1)), '[]'::jsonb)
      INTO v_list
    FROM public.admin_recruitment_candidates c
    WHERE c.outcome IS NULL AND c.stage = 'documents' AND c.email IS NOT NULL
      AND c.doc_reminder_count < v_s.max_reminders
      AND coalesce(
            c.doc_last_reminder_at,
            (SELECT max(a.signed_at) FROM public.admin_recruitment_appointments a WHERE a.candidate_id = c.id AND a.status = 'signed')
          ) < now() - make_interval(days => v_s.document_reminder_days)
      AND EXISTS (
        SELECT 1 FROM public.admin_recruitment_candidate_documents d
        WHERE d.candidate_id = c.id AND d.required AND d.status IN ('pending', 'rejected')
      );
    v_out := v_out || jsonb_build_object('documentReminders', v_list);
  END IF;

  IF coalesce((v_s.auto_reminders ->> 'joining')::boolean, false) THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('candidateId', c.id, 'joiningDate', c.expected_joining_date)), '[]'::jsonb)
      INTO v_list
    FROM public.admin_recruitment_candidates c
    WHERE c.outcome IS NULL
      AND c.stage IN ('appointment', 'documents', 'ready_to_join')
      AND c.email IS NOT NULL
      AND c.expected_joining_date IS NOT NULL
      AND c.expected_joining_date >= public.admin_recruitment_today()
      AND c.expected_joining_date - v_s.joining_reminder_days <= public.admin_recruitment_today()
      AND c.joining_reminder_for IS DISTINCT FROM c.expected_joining_date;
    v_out := v_out || jsonb_build_object('joiningReminders', v_list);
  END IF;

  RETURN v_out;
END;
$$;

-- ---------------------------------------------------------------------------
-- Configuration
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_recruitment_settings_save(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_s public.admin_recruitment_settings%rowtype;
BEGIN
  PERFORM public.admin_recruitment_require('settings');
  IF p_payload ? 'sources' AND jsonb_typeof(p_payload -> 'sources') <> 'array' THEN
    RAISE EXCEPTION 'Sources must be a list.';
  END IF;
  IF p_payload ? 'interviewers' AND jsonb_typeof(p_payload -> 'interviewers') <> 'array' THEN
    RAISE EXCEPTION 'Interviewers must be a list.';
  END IF;
  IF p_payload ? 'evaluationCriteria' AND (jsonb_typeof(p_payload -> 'evaluationCriteria') <> 'array'
     OR jsonb_array_length(p_payload -> 'evaluationCriteria') = 0) THEN
    RAISE EXCEPTION 'Keep at least one evaluation criterion.';
  END IF;

  BEGIN
    UPDATE public.admin_recruitment_settings SET
      company_name = coalesce(public.admin_recruitment_clean(p_payload ->> 'companyName'), company_name),
      offer_validity_days = coalesce(public.admin_recruitment_num(p_payload ->> 'offerValidityDays')::integer, offer_validity_days),
      approval_levels = coalesce(public.admin_recruitment_num(p_payload ->> 'approvalLevels')::integer, approval_levels),
      portal_link_days = coalesce(public.admin_recruitment_num(p_payload ->> 'portalLinkDays')::integer, portal_link_days),
      auto_reminders = CASE WHEN jsonb_typeof(p_payload -> 'autoReminders') = 'object' THEN auto_reminders || (p_payload -> 'autoReminders') ELSE auto_reminders END,
      interview_reminder_hours = coalesce(public.admin_recruitment_num(p_payload ->> 'interviewReminderHours')::integer, interview_reminder_hours),
      offer_reminder_days = coalesce(public.admin_recruitment_num(p_payload ->> 'offerReminderDays')::integer, offer_reminder_days),
      document_reminder_days = coalesce(public.admin_recruitment_num(p_payload ->> 'documentReminderDays')::integer, document_reminder_days),
      joining_reminder_days = coalesce(public.admin_recruitment_num(p_payload ->> 'joiningReminderDays')::integer, joining_reminder_days),
      max_reminders = coalesce(public.admin_recruitment_num(p_payload ->> 'maxReminders')::integer, max_reminders),
      auto_convert_on_join = coalesce((p_payload ->> 'autoConvertOnJoin')::boolean, auto_convert_on_join),
      sources = coalesce(p_payload -> 'sources', sources),
      interviewers = coalesce(p_payload -> 'interviewers', interviewers),
      evaluation_criteria = coalesce(p_payload -> 'evaluationCriteria', evaluation_criteria),
      updated_by = auth.uid(),
      updated_by_name = public.admin_recruitment_actor_name(auth.uid()),
      updated_at = now()
    WHERE id
    RETURNING * INTO v_s;
  EXCEPTION WHEN check_violation THEN
    RAISE EXCEPTION 'One of the values is outside the allowed range.';
  END;

  PERFORM public.admin_recruitment_log(NULL, NULL, 'settings', NULL, 'settings_updated', NULL, NULL, 'Recruitment settings updated', '{}'::jsonb);
  RETURN to_jsonb(v_s);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_recruitment_document_type_save(
  p_key text,
  p_label text,
  p_description text,
  p_required boolean,
  p_active boolean,
  p_sort_order integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_label text := public.admin_recruitment_clean(p_label);
  v_key text := public.admin_recruitment_clean(p_key);
  v_row public.admin_recruitment_document_types%rowtype;
BEGIN
  PERFORM public.admin_recruitment_require('settings');
  IF v_label IS NULL THEN
    RAISE EXCEPTION 'Document name is required.';
  END IF;
  IF v_key IS NULL THEN
    v_key := left(trim(BOTH '_' FROM regexp_replace(lower(v_label), '[^a-z0-9]+', '_', 'g')), 40);
    IF length(v_key) < 2 THEN
      v_key := 'doc_' || substr(md5(v_label), 1, 6);
    END IF;
    IF EXISTS (SELECT 1 FROM public.admin_recruitment_document_types WHERE key = v_key) THEN
      v_key := left(v_key, 33) || '_' || substr(md5(v_label || clock_timestamp()::text), 1, 6);
    END IF;
  END IF;

  INSERT INTO public.admin_recruitment_document_types (key, label, description, required, active, sort_order)
  VALUES (
    v_key, v_label, public.admin_recruitment_clean(p_description),
    coalesce(p_required, true), coalesce(p_active, true),
    coalesce(p_sort_order, (SELECT coalesce(max(sort_order), 0) + 10 FROM public.admin_recruitment_document_types))
  )
  ON CONFLICT (key) DO UPDATE SET
    label = excluded.label,
    description = excluded.description,
    required = excluded.required,
    active = excluded.active,
    sort_order = coalesce(p_sort_order, public.admin_recruitment_document_types.sort_order)
  RETURNING * INTO v_row;

  -- Candidates still collecting documents pick up the latest checklist.
  UPDATE public.admin_recruitment_candidate_documents d
  SET label = v_row.label, required = v_row.required
  WHERE d.document_key = v_row.key AND d.status <> 'verified'
    AND EXISTS (SELECT 1 FROM public.admin_recruitment_candidates c WHERE c.id = d.candidate_id AND c.stage = 'documents' AND c.outcome IS NULL);
  IF v_row.active THEN
    INSERT INTO public.admin_recruitment_candidate_documents (candidate_id, document_key, label, required)
    SELECT c.id, v_row.key, v_row.label, v_row.required
    FROM public.admin_recruitment_candidates c
    WHERE c.stage = 'documents' AND c.outcome IS NULL
    ON CONFLICT (candidate_id, document_key) DO NOTHING;
  END IF;

  PERFORM public.admin_recruitment_log(NULL, NULL, 'settings', NULL, 'document_type_saved', NULL, NULL,
    'Document checklist updated: ' || v_row.label, jsonb_build_object('key', v_row.key, 'required', v_row.required, 'active', v_row.active));
  RETURN to_jsonb(v_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_recruitment_template_save(
  p_key text,
  p_name text,
  p_category text,
  p_subject text,
  p_body text,
  p_active boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text := public.admin_recruitment_clean(p_key);
  v_name text := public.admin_recruitment_clean(p_name);
  v_row public.admin_recruitment_templates%rowtype;
  v_existing public.admin_recruitment_templates%rowtype;
BEGIN
  IF NOT (public.admin_recruitment_can('communication') OR public.admin_recruitment_can('settings')) THEN
    RAISE EXCEPTION 'You do not have permission to edit email templates.' USING ERRCODE = '42501';
  END IF;
  IF v_name IS NULL OR public.admin_recruitment_clean(p_subject) IS NULL OR public.admin_recruitment_clean(p_body) IS NULL THEN
    RAISE EXCEPTION 'Template name, subject and message are required.';
  END IF;
  IF coalesce(p_category, 'general') NOT IN ('interview', 'offer', 'appointment', 'documents', 'joining', 'general') THEN
    RAISE EXCEPTION 'Unknown template category.';
  END IF;
  IF v_key IS NULL THEN
    v_key := left(trim(BOTH '_' FROM regexp_replace(lower(v_name), '[^a-z0-9]+', '_', 'g')), 50);
    IF length(v_key) < 2 OR EXISTS (SELECT 1 FROM public.admin_recruitment_templates WHERE key = v_key) THEN
      v_key := left(coalesce(nullif(v_key, ''), 'template'), 50) || '_' || substr(md5(v_name || clock_timestamp()::text), 1, 6);
    END IF;
  END IF;

  SELECT * INTO v_existing FROM public.admin_recruitment_templates WHERE key = v_key;
  IF FOUND AND v_existing.is_system AND NOT coalesce(p_active, true) THEN
    RAISE EXCEPTION 'Workflow templates cannot be deactivated; edit the wording instead.';
  END IF;

  INSERT INTO public.admin_recruitment_templates (key, name, category, subject, body, active, is_system, updated_by, updated_by_name)
  VALUES (
    v_key, v_name, coalesce(p_category, 'general'), btrim(p_subject), p_body, coalesce(p_active, true), false,
    auth.uid(), public.admin_recruitment_actor_name(auth.uid())
  )
  ON CONFLICT (key) DO UPDATE SET
    name = excluded.name,
    category = CASE WHEN public.admin_recruitment_templates.is_system THEN public.admin_recruitment_templates.category ELSE excluded.category END,
    subject = excluded.subject,
    body = excluded.body,
    active = excluded.active,
    updated_by = excluded.updated_by,
    updated_by_name = excluded.updated_by_name
  RETURNING * INTO v_row;

  PERFORM public.admin_recruitment_log(NULL, NULL, 'template', NULL, 'template_saved', NULL, NULL,
    'Email template saved: ' || v_row.name, jsonb_build_object('key', v_row.key));
  RETURN to_jsonb(v_row);
END;
$$;

-- Capabilities of the signed-in user (drives which actions the UI offers; enforcement stays server-side).
CREATE OR REPLACE FUNCTION public.admin_recruitment_my_capabilities()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_object_agg(cap, public.admin_recruitment_can(cap))
  FROM unnest(ARRAY[
    'view', 'requisitions', 'approve', 'candidates', 'interviews', 'offers', 'documents',
    'joining', 'conversion', 'communication', 'reports', 'settings'
  ]) AS cap
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.admin_recruitment_portal_token(text) FROM PUBLIC;

DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.admin_recruitment_can_access_files(uuid, text, boolean)',
    'public.admin_recruitment_comm_prepare(uuid, text, text, uuid, text, text, text, text)',
    'public.admin_recruitment_settings_save(jsonb)',
    'public.admin_recruitment_document_type_save(text, text, text, boolean, boolean, integer)',
    'public.admin_recruitment_template_save(text, text, text, text, text, boolean)',
    'public.admin_recruitment_my_capabilities()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;

  FOREACH f IN ARRAY ARRAY[
    'public.admin_recruitment_letter_attach_generated(text, uuid, jsonb)',
    'public.admin_recruitment_comm_claim(uuid, text, text, jsonb)',
    'public.admin_recruitment_comm_complete(uuid, boolean, text)',
    'public.admin_recruitment_portal_issue(uuid, text, uuid, text)',
    'public.admin_recruitment_portal_resolve(text)',
    'public.admin_recruitment_portal_view(text, text)',
    'public.admin_recruitment_portal_offer_respond(text, text, text, text, text)',
    'public.admin_recruitment_portal_attach(text, text, text, jsonb, text)',
    'public.admin_recruitment_portal_file(text, text)',
    'public.admin_recruitment_automation_due()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END;
$$;
