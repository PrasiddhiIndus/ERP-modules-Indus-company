-- Enable Supabase Realtime for Indus One leave workflow + balance tables (ERP Leave Approvals / Management).

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'indus_one.leave_requests',
    'indus_one.admin_leave_requests',
    'indus_one.employee_leave_balances_yearly',
    'indus_one.admin_leave_balance_ledger',
    'indus_one.leave_carry_forward_rules',
    'indus_one.employee_pl_encash_pref'
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
