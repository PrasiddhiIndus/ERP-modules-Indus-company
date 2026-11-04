-- C/O earned-date ledger (read-only): one row per earned credit with status.
-- Earn/consume/expire paths already set earned_date on indus_one.comp_off_credits;
-- this RPC exposes that ledger for Employee Master / leave screens.
-- Does not change calculation, approval, attendance triggers, or balance RPCs.

CREATE OR REPLACE FUNCTION indus_one.fetch_comp_off_credit_ledger(
  p_employee_code text,
  p_year integer DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  employee_code text,
  earned_date date,
  credit_amount numeric,
  consumed_amount numeric,
  remaining_amount numeric,
  expiry_date date,
  status text,
  display_status text,
  source_type text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, indus_one
AS $$
DECLARE
  v_code text := upper(btrim(coalesce(p_employee_code, '')));
  v_as_of date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_cutoff date := indus_one.comp_off_cutoff_date();
BEGIN
  IF v_code = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.employee_code::text,
    c.earned_date,
    c.credit_amount::numeric,
    c.consumed_amount::numeric,
    c.remaining_amount::numeric,
    c.expiry_date,
    c.status::text,
    CASE
      WHEN c.status = 'revoked' THEN 'Revoked'
      WHEN c.status = 'expired'
        OR (
          c.remaining_amount > 0
          AND c.expiry_date < v_as_of
          AND c.status IS DISTINCT FROM 'consumed'
        )
        THEN 'Expired'
      WHEN c.status = 'consumed' OR c.remaining_amount <= 0 THEN 'Used'
      ELSE 'Available'
    END::text AS display_status,
    c.source_type::text
  FROM indus_one.comp_off_credits c
  WHERE upper(btrim(c.employee_code)) = v_code
    AND c.earned_date >= v_cutoff
    AND (p_year IS NULL OR extract(year FROM c.earned_date)::integer = p_year)
  ORDER BY c.earned_date DESC, c.created_at DESC;
END;
$$;

COMMENT ON FUNCTION indus_one.fetch_comp_off_credit_ledger(text, integer) IS
  'Read-only C/O credits for one employee: earned_date + Available/Used/Expired. Does not write.';

GRANT EXECUTE ON FUNCTION indus_one.fetch_comp_off_credit_ledger(text, integer)
  TO authenticated, service_role;
