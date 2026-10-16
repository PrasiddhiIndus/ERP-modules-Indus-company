-- Rollback for 20261016120000_admin_leave_sandwich_skip_half_day.sql.
-- Restores sandwich week-off behaviour from 20260731120000 (half-day no longer blocks sandwich).

DROP FUNCTION IF EXISTS indus_one.admin_leave_date_is_half_day_leave(text, date, uuid);

CREATE OR REPLACE FUNCTION indus_one.admin_leave_working_dates(
  p_from date,
  p_to date,
  p_employee_code text DEFAULT NULL
)
RETURNS SETOF date
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = indus_one, public
SET row_security = off
AS $$
DECLARE
  v_emp text := nullif(btrim(p_employee_code), '');
  v_d date;
  v_amin date;
  v_amax date;
  v_cursor date;
  v_dates date[] := ARRAY[]::date[];
  v_from_is_anchor boolean;
  v_to_is_anchor boolean;
  v_guard integer;
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN
    RETURN;
  END IF;

  SELECT min(x.d), max(x.d)
  INTO v_amin, v_amax
  FROM (
    SELECT g.d::date AS d
    FROM generate_series(p_from, p_to, interval '1 day') AS g(d)
    WHERE NOT indus_one.admin_leave_date_is_week_off(v_emp, g.d::date)
      AND NOT indus_one.admin_leave_date_is_nhph(v_emp, g.d::date)
  ) x;

  FOR v_d IN
    SELECT g.d::date
    FROM generate_series(p_from, p_to, interval '1 day') AS g(d)
  LOOP
    IF NOT indus_one.admin_leave_date_is_week_off(v_emp, v_d)
       AND NOT indus_one.admin_leave_date_is_nhph(v_emp, v_d) THEN
      v_dates := array_append(v_dates, v_d);
    ELSIF indus_one.admin_leave_date_is_week_off(v_emp, v_d)
          AND NOT indus_one.admin_leave_date_is_nhph(v_emp, v_d)
          AND v_amin IS NOT NULL
          AND v_d > v_amin
          AND v_d < v_amax THEN
      v_dates := array_append(v_dates, v_d);
    END IF;
  END LOOP;

  IF v_emp IS NULL THEN
    RETURN QUERY SELECT DISTINCT u FROM unnest(v_dates) AS u ORDER BY 1;
    RETURN;
  END IF;

  v_from_is_anchor :=
    NOT indus_one.admin_leave_date_is_week_off(v_emp, p_from)
    AND NOT indus_one.admin_leave_date_is_nhph(v_emp, p_from);
  v_to_is_anchor :=
    NOT indus_one.admin_leave_date_is_week_off(v_emp, p_to)
    AND NOT indus_one.admin_leave_date_is_nhph(v_emp, p_to);

  IF v_from_is_anchor THEN
    v_cursor := p_from - 1;
    v_guard := 0;
    WHILE v_guard < 14
      AND indus_one.admin_leave_date_is_week_off(v_emp, v_cursor)
      AND NOT indus_one.admin_leave_date_is_nhph(v_emp, v_cursor)
    LOOP
      v_cursor := v_cursor - 1;
      v_guard := v_guard + 1;
    END LOOP;
    IF v_guard > 0 AND v_guard < 14
       AND indus_one.admin_leave_date_has_adjacent_leave(v_emp, v_cursor)
    THEN
      v_d := v_cursor + 1;
      WHILE v_d < p_from LOOP
        IF indus_one.admin_leave_date_is_week_off(v_emp, v_d)
           AND NOT indus_one.admin_leave_date_is_nhph(v_emp, v_d) THEN
          v_dates := array_append(v_dates, v_d);
        END IF;
        v_d := v_d + 1;
      END LOOP;
    END IF;
  END IF;

  IF v_to_is_anchor THEN
    v_cursor := p_to + 1;
    v_guard := 0;
    WHILE v_guard < 14
      AND indus_one.admin_leave_date_is_week_off(v_emp, v_cursor)
      AND NOT indus_one.admin_leave_date_is_nhph(v_emp, v_cursor)
    LOOP
      v_cursor := v_cursor + 1;
      v_guard := v_guard + 1;
    END LOOP;
    IF v_guard > 0 AND v_guard < 14
       AND indus_one.admin_leave_date_has_adjacent_leave(v_emp, v_cursor)
    THEN
      v_d := p_to + 1;
      WHILE v_d < v_cursor LOOP
        IF indus_one.admin_leave_date_is_week_off(v_emp, v_d)
           AND NOT indus_one.admin_leave_date_is_nhph(v_emp, v_d) THEN
          v_dates := array_append(v_dates, v_d);
        END IF;
        v_d := v_d + 1;
      END LOOP;
    END IF;
  END IF;

  RETURN QUERY SELECT DISTINCT u FROM unnest(v_dates) AS u ORDER BY 1;
END;
$$;

GRANT EXECUTE ON FUNCTION indus_one.admin_leave_working_dates(date, date, text)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
