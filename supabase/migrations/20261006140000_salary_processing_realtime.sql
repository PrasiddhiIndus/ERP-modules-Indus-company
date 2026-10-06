-- Realtime for Salary Processing so the sheet refreshes when Employee Master, CTC,
-- deductions or the month run change in another tab or by another user.
-- admin_attendance_register is already published (20260724180000).

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'public.admin_ifsp_employee_master',
    'public.admin_salary_structures',
    'public.admin_salary_structure_revisions',
    'public.admin_salary_month_runs',
    'public.admin_salary_month_lines',
    'public.admin_salary_loans',
    'public.admin_salary_salary_advances',
    'public.admin_salary_unpaid_paid'
  ];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RETURN;
  END IF;
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
