-- Repair open site_assignments whose from_date starts AFTER the person already
-- has attendance marked at that same site (data entry / year-typo corruption).
-- Pull from_date back to the earliest sensible start:
--   LEAST(current from_date, joining_date, first attendance date).
-- Does not create people, bypass roster filters, or change ended assignments.
-- Safe for other sites: only rows with att_date < from_date are touched.

DO $$
BEGIN
  IF to_regclass('public.site_assignments') IS NULL
     OR to_regclass('public.people') IS NULL
     OR to_regclass('public.attendance') IS NULL THEN
    RAISE NOTICE 'Skipping site assignment from_date repair — required tables missing.';
    RETURN;
  END IF;

  WITH first_att AS (
    SELECT
      a.person_id,
      a.site_id,
      MIN(a.att_date)::date AS first_att_date
    FROM public.attendance a
    GROUP BY a.person_id, a.site_id
  ),
  fixes AS (
    SELECT
      sa.id AS assignment_id,
      sa.from_date::date AS old_from,
      LEAST(
        sa.from_date::date,
        COALESCE(p.joining_date::date, sa.from_date::date),
        fa.first_att_date
      ) AS new_from
    FROM public.site_assignments sa
    JOIN public.people p ON p.id = sa.person_id
    JOIN first_att fa
      ON fa.person_id = sa.person_id
     AND fa.site_id = sa.site_id
    WHERE (sa.to_date IS NULL OR sa.to_date::text = '')
      AND fa.first_att_date < sa.from_date::date
  )
  UPDATE public.site_assignments sa
  SET from_date = fixes.new_from
  FROM fixes
  WHERE sa.id = fixes.assignment_id
    AND fixes.new_from < fixes.old_from;

  RAISE NOTICE 'Repaired open site_assignments whose from_date was after existing attendance.';
END $$;
