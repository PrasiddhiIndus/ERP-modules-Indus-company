-- Offer acceptance window: within 24 hours from issuance (not 7 days).
-- Updates settings default, generate fallback, and offer email copy.

UPDATE public.admin_recruitment_settings
SET offer_validity_days = 1
WHERE id IS NOT NULL
  AND offer_validity_days = 7;

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
    -- 24 hours from issuance = next calendar day (IST business day boundary).
    valid_until = public.admin_recruitment_today() + coalesce(v_days, 1),
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

UPDATE public.admin_recruitment_templates
SET
  body = E'Dear {{candidate_name}},\n\nWe are pleased to offer you the position of {{position}} at {{company_name}}. Your offer letter ({{offer_ref}}) is attached.\n\nPlease review and respond within 24 hours from the date of issuance of this offer using the secure link below:\n{{portal_link}}\n\nRegards,\nRecruitment Team\n{{company_name}}',
  updated_at = now()
WHERE key = 'offer_letter';

UPDATE public.admin_recruitment_templates
SET
  body = E'Dear {{candidate_name}},\n\nYour offer for {{position}} ({{offer_ref}}) is awaiting your response. Please respond within 24 hours from the date of issuance of the offer.\n\nRespond here: {{portal_link}}\n\nRegards,\nRecruitment Team\n{{company_name}}',
  updated_at = now()
WHERE key = 'offer_reminder';

NOTIFY pgrst, 'reload schema';
