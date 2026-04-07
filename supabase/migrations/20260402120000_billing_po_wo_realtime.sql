-- Expose billing.po_wo to Supabase Realtime so clients can subscribe to postgres_changes
-- (e.g. Commercial Manager approval → Create Invoice list updates without refresh).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'billing'
      AND tablename = 'po_wo'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE billing.po_wo;
  END IF;
END $$;
