-- Live IT Support: publish ticket + notification tables for Supabase Realtime.
-- UI counts (navbar, dashboard, queue) subscribe to these changes — no mock/static numbers.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'public.it_tickets',
    'public.it_notifications',
    'public.it_ticket_comments',
    'public.it_ticket_history'
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
