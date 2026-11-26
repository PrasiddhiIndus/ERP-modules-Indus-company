DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime DROP TABLE qa.requests;
    EXCEPTION WHEN undefined_object THEN NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime DROP TABLE qa.defects;
    EXCEPTION WHEN undefined_object THEN NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime DROP TABLE qa.executions;
    EXCEPTION WHEN undefined_object THEN NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime DROP TABLE qa.test_cases;
    EXCEPTION WHEN undefined_object THEN NULL;
    END;
  END IF;
END $$;
