-- Allow recruiters to set / revise the offer acceptance deadline (valid_until)
-- used in the offer letter ("on or before …") and portal link expiry.

CREATE OR REPLACE FUNCTION public.admin_recruitment_offer_set_valid_until(
  p_offer_id uuid,
  p_valid_until date,
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
  v_prev date;
BEGIN
  PERFORM public.admin_recruitment_require('offers');

  IF p_offer_id IS NULL THEN
    RAISE EXCEPTION 'Offer is required.';
  END IF;
  IF p_valid_until IS NULL THEN
    RAISE EXCEPTION 'Choose the acceptance deadline.';
  END IF;
  IF p_valid_until < public.admin_recruitment_today() THEN
    RAISE EXCEPTION 'The acceptance deadline cannot be in the past.';
  END IF;

  SELECT * INTO v_o FROM public.admin_recruitment_offers WHERE id = p_offer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Offer not found.';
  END IF;
  PERFORM public.admin_recruitment_check_version(p_expected_version, v_o.version);
  SELECT * INTO v_c FROM public.admin_recruitment_candidates WHERE id = v_o.candidate_id FOR UPDATE;
  PERFORM public.admin_recruitment_assert_live(v_c);

  IF v_o.status NOT IN ('draft', 'generated', 'sent', 'viewed') THEN
    RAISE EXCEPTION 'The acceptance deadline can only be set while the offer is still open (current status: %).', replace(v_o.status, '_', ' ');
  END IF;

  IF v_o.joining_date IS NOT NULL AND p_valid_until > v_o.joining_date THEN
    RAISE EXCEPTION 'The acceptance deadline must be on or before the joining date (%).', to_char(v_o.joining_date, 'DD Mon YYYY');
  END IF;

  v_prev := v_o.valid_until;

  UPDATE public.admin_recruitment_offers SET
    valid_until = p_valid_until,
    version = version + 1,
    updated_at = now()
  WHERE id = p_offer_id
  RETURNING * INTO v_o;

  PERFORM public.admin_recruitment_log(
    v_o.candidate_id, v_c.requisition_id, 'offer', v_o.id, 'offer_valid_until_set',
    v_o.status, v_o.status,
    'Acceptance deadline set to ' || to_char(v_o.valid_until, 'DD Mon YYYY'),
    jsonb_build_object(
      'validUntil', v_o.valid_until,
      'previousValidUntil', v_prev
    )
  );

  RETURN to_jsonb(v_o);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_recruitment_offer_set_valid_until(uuid, date, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_recruitment_offer_set_valid_until(uuid, date, integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_recruitment_offer_set_valid_until(uuid, date, integer) IS
  'Sets offer valid_until (acceptance deadline shown in the letter and used for portal expiry).';

NOTIFY pgrst, 'reload schema';
