-- Realtime for billing invoices so Manage Invoices updates after Create Invoice saves.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'billing.invoice',
    'billing.invoice_line_item',
    'billing.invoice_attachment'
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
