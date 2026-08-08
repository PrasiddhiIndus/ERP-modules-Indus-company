-- Persistent Sr. No. allocator for manpower enquiries.
-- Continues the series even when rows are deleted (never reuses a consumed number).

CREATE SEQUENCE IF NOT EXISTS public.manpower_enquiries_sr_no_seq;

SELECT setval(
  'public.manpower_enquiries_sr_no_seq',
  COALESCE((SELECT MAX(sr_no) FROM public.manpower_enquiries), 0),
  true
);

CREATE OR REPLACE FUNCTION public.allocate_manpower_enquiry_sr_no()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_max integer;
  seq_last bigint;
BEGIN
  SELECT COALESCE(MAX(sr_no), 0) INTO current_max FROM public.manpower_enquiries;
  SELECT last_value INTO seq_last FROM public.manpower_enquiries_sr_no_seq;

  PERFORM setval(
    'public.manpower_enquiries_sr_no_seq',
    GREATEST(current_max, COALESCE(seq_last, 0)),
    true
  );

  RETURN nextval('public.manpower_enquiries_sr_no_seq')::integer;
END;
$$;

COMMENT ON FUNCTION public.allocate_manpower_enquiry_sr_no() IS
  'Returns the next manpower enquiry Sr. No. Monotonic even after deletes.';

GRANT USAGE, SELECT ON SEQUENCE public.manpower_enquiries_sr_no_seq TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.allocate_manpower_enquiry_sr_no() TO authenticated, service_role;
