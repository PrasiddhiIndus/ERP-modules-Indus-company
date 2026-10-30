-- Candidate acceptance portal must not expose salary / CTC values.
-- Offer and appointment letter PDFs still carry compensation; the secure link UI/API must not.

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
      'joiningDate', v_o.joining_date,
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

COMMENT ON FUNCTION public.admin_recruitment_portal_resolve(text) IS
  'Public candidate portal payload. Intentionally omits salary / CTC fields.';
