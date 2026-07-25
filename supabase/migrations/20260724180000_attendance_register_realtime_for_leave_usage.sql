-- Enable Realtime on daily attendance register so Leave Management can
-- sync used/unused leave live when marks change (no table schema / RLS / business-logic change).

DO $$
BEGIN
  IF to_regclass('public.admin_attendance_register') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'admin_attendance_register'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_attendance_register;
    END IF;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
