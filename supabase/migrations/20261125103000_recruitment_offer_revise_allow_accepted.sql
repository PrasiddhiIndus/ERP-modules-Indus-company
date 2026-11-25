-- Allow revising accepted offers too (temporary re-edit / regenerate letter flow).

CREATE OR REPLACE FUNCTION public.admin_recruitment_offer_revise(
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
  v_o public.admin_recruitment_offers%rowtype;
  v_c public.admin_recruitment_candidates%rowtype;
  v_gross numeric;
  v_join date := public.admin_recruitment_date(p_payload ->> 'joiningDate');
BEGIN
  PERFORM public.admin_recruitment_require('offers');

  SELECT * INTO v_o FROM public.admin_recruitment_offers WHERE id = p_offer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Offer not found.';
  END IF;
  PERFORM public.admin_recruitment_check_version(p_expected_version, v_o.version);

  IF v_o.status NOT IN ('generated', 'sent', 'viewed', 'accepted') THEN
    RAISE EXCEPTION 'Only generated, sent, viewed or accepted offers can be revised here (current: %).',
      replace(v_o.status, '_', ' ');
  END IF;

  SELECT * INTO v_c FROM public.admin_recruitment_candidates WHERE id = v_o.candidate_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidate not found.';
  END IF;
  PERFORM public.admin_recruitment_assert_live(v_c);

  v_gross := v_c.expected_ctc;
  IF v_gross IS NULL OR v_gross <= 0 THEN
    RAISE EXCEPTION 'Save this candidate''s CTC (CTC calculator) before revising the offer.';
  END IF;

  UPDATE public.admin_recruitment_offers SET
    designation = coalesce(public.admin_recruitment_clean(p_payload ->> 'designation'), designation),
    department = CASE
      WHEN p_payload ? 'department' THEN public.admin_recruitment_clean(p_payload ->> 'department')
      ELSE department
    END,
    location = CASE
      WHEN p_payload ? 'location' THEN public.admin_recruitment_clean(p_payload ->> 'location')
      ELSE location
    END,
    employment_type = coalesce(
      public.admin_recruitment_clean(p_payload ->> 'employmentType'),
      employment_type
    ),
    monthly_gross = v_gross,
    annual_ctc = v_gross * 12,
    joining_date = CASE WHEN p_payload ? 'joiningDate' THEN v_join ELSE joining_date END,
    terms = CASE
      WHEN p_payload ? 'terms' THEN public.admin_recruitment_clean(p_payload ->> 'terms')
      ELSE terms
    END,
    generated_doc = NULL,
    version = version + 1
  WHERE id = p_offer_id
  RETURNING * INTO v_o;

  PERFORM public.admin_recruitment_log(
    v_o.candidate_id,
    v_c.requisition_id,
    'offer',
    v_o.id,
    'offer_revised',
    v_o.status,
    v_o.status,
    'Offer letter details revised — regenerate and resend the letter',
    jsonb_build_object('offer_ref', v_o.offer_ref)
  );

  RETURN to_jsonb(v_o);
END;
$$;

COMMENT ON FUNCTION public.admin_recruitment_offer_revise(uuid, jsonb, integer) IS
  'Revise letter fields on a generated/sent/viewed/accepted offer without withdrawing. Clears generated_doc so the letter can be rebuilt.';

NOTIFY pgrst, 'reload schema';
