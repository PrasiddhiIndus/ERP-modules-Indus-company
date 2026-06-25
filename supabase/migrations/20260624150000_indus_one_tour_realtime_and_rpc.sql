-- Realtime + SECURITY DEFINER read for approved tours on Daily Attendance Register.

GRANT USAGE ON SCHEMA indus_one TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fetch_approved_tour_marks_for_register(
  p_from_date date,
  p_to_date date
)
RETURNS TABLE (
  employee_code text,
  register_date date,
  location text,
  reason text,
  tour_request_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = indus_one, public
AS $$
BEGIN
  IF NOT (
    public.current_user_can_access_module('admin')
    OR (SELECT coalesce(indus_one.current_user_is_manager(), false))
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH approved AS (
    SELECT id, employee_code, from_date, to_date, location, reason
    FROM indus_one.admin_tour_requests
    WHERE lower(btrim(coalesce(status, ''))) = 'approved'
      AND from_date <= p_to_date
      AND to_date >= p_from_date
    UNION ALL
    SELECT tr.id, tr.employee_code, tr.from_date, tr.to_date, tr.location, tr.reason
    FROM indus_one.tour_requests tr
    WHERE lower(btrim(coalesce(tr.status, ''))) = 'approved'
      AND tr.from_date <= p_to_date
      AND tr.to_date >= p_from_date
      AND NOT EXISTS (
        SELECT 1 FROM indus_one.admin_tour_requests ar WHERE ar.id = tr.id
      )
  ),
  mark_rows AS (
    SELECT
      m.employee_code,
      m.register_date,
      coalesce(ar.location, '') AS location,
      coalesce(ar.reason, '') AS reason,
      m.tour_request_id
    FROM indus_one.admin_tour_attendance_marks m
    LEFT JOIN indus_one.admin_tour_requests ar ON ar.id = m.tour_request_id
    WHERE coalesce(m.reverted, false) = false
      AND m.register_date >= p_from_date
      AND m.register_date <= p_to_date
  ),
  expanded AS (
    SELECT
      a.employee_code,
      gs.d::date AS register_date,
      coalesce(a.location, '') AS location,
      coalesce(a.reason, '') AS reason,
      a.id AS tour_request_id
    FROM approved a
    CROSS JOIN LATERAL generate_series(
      greatest(a.from_date, p_from_date),
      least(a.to_date, p_to_date),
      interval '1 day'
    ) AS gs(d)
  )
  SELECT mr.employee_code, mr.register_date, mr.location, mr.reason, mr.tour_request_id
  FROM mark_rows mr
  UNION ALL
  SELECT e.employee_code, e.register_date, e.location, e.reason, e.tour_request_id
  FROM expanded e
  WHERE NOT EXISTS (
    SELECT 1
    FROM mark_rows mr
  WHERE btrim(coalesce(mr.employee_code, '')) = btrim(coalesce(e.employee_code, ''))
      AND mr.register_date = e.register_date
  );
END;
$$;

COMMENT ON FUNCTION public.fetch_approved_tour_marks_for_register(date, date) IS
  'Approved tour days for Daily Attendance Register (T + location/reason). Admin / manager only.';

GRANT EXECUTE ON FUNCTION public.fetch_approved_tour_marks_for_register(date, date) TO authenticated;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'indus_one.tour_requests',
    'indus_one.admin_tour_requests',
    'indus_one.admin_tour_attendance_marks',
    'public.admin_attendance_register'
  ];
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    IF to_regclass(t) IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = split_part(t, '.', 1)
          AND tablename = split_part(t, '.', 2)
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %s', t);
      END IF;
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
