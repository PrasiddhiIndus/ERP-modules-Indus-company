-- Daily DB write proxy for Supabase Realtime quota early warning (API Health panel).
-- pg_stat_user_tables n_tup_* are cumulative since stats reset — we store the cumulative
-- each day and compute total_daily_writes as the delta vs the previous snapshot.

CREATE TABLE IF NOT EXISTS public.db_usage_tracker (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  logged_at timestamptz NOT NULL DEFAULT now(),
  usage_date date NOT NULL DEFAULT ((timezone('utc', now()))::date),
  cumulative_writes bigint NOT NULL DEFAULT 0,
  total_daily_writes bigint NOT NULL DEFAULT 0,
  estimated_realtime_messages bigint NOT NULL DEFAULT 0,
  alert_triggered boolean NOT NULL DEFAULT false,
  subscriber_multiplier numeric(8, 2) NOT NULL DEFAULT 3,
  daily_write_threshold bigint NOT NULL DEFAULT 150000,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT db_usage_tracker_usage_date_unique UNIQUE (usage_date)
);

COMMENT ON TABLE public.db_usage_tracker IS
  'Daily DB write deltas (from pg_stat_user_tables) used as an early-warning proxy for Realtime message pressure.';

CREATE INDEX IF NOT EXISTS db_usage_tracker_logged_at_idx
  ON public.db_usage_tracker (logged_at DESC);

CREATE INDEX IF NOT EXISTS db_usage_tracker_usage_date_idx
  ON public.db_usage_tracker (usage_date DESC);

ALTER TABLE public.db_usage_tracker ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_current_user_db_usage_viewer()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role IN ('super_admin', 'super_admin_pro', 'admin')
        OR p.team = 'itIs'
        OR COALESCE(p.allowed_modules, '[]'::jsonb) ? 'itIs'
      )
  );
$$;

COMMENT ON FUNCTION public.is_current_user_db_usage_viewer() IS
  'Admins and IT/IS may read db_usage_tracker and run snapshots.';

DROP POLICY IF EXISTS "db_usage_tracker_select_viewer" ON public.db_usage_tracker;
CREATE POLICY "db_usage_tracker_select_viewer"
  ON public.db_usage_tracker
  FOR SELECT
  TO authenticated
  USING (public.is_current_user_db_usage_viewer());

-- No direct INSERT/UPDATE/DELETE for clients — only via snapshot RPC.

CREATE OR REPLACE FUNCTION public.snapshot_db_usage(
  p_subscriber_multiplier numeric DEFAULT 3,
  p_daily_write_threshold bigint DEFAULT 150000
)
RETURNS public.db_usage_tracker
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (timezone('utc', now()))::date;
  v_cumulative bigint := 0;
  v_prev_cumulative bigint := 0;
  v_daily bigint := 0;
  v_mult numeric(8, 2) := GREATEST(COALESCE(p_subscriber_multiplier, 3), 0.1);
  v_threshold bigint := GREATEST(COALESCE(p_daily_write_threshold, 150000), 1);
  v_notes text := NULL;
  v_row public.db_usage_tracker;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_current_user_db_usage_viewer() THEN
    RAISE EXCEPTION 'Not authorized to snapshot DB usage';
  END IF;

  SELECT COALESCE(SUM(s.n_tup_ins + s.n_tup_upd + s.n_tup_del), 0)::bigint
    INTO v_cumulative
  FROM pg_stat_user_tables s;

  SELECT t.cumulative_writes
    INTO v_prev_cumulative
  FROM public.db_usage_tracker t
  WHERE t.usage_date < v_today
  ORDER BY t.usage_date DESC
  LIMIT 1;

  IF v_prev_cumulative IS NULL THEN
    v_daily := 0;
    v_notes := 'Baseline snapshot — daily delta starts from the next day.';
  ELSIF v_cumulative < v_prev_cumulative THEN
    -- Stats reset (restart / pg_stat_reset) — treat current cumulative as incomplete day.
    v_daily := v_cumulative;
    v_notes := 'pg_stat counters reset detected; daily writes use post-reset cumulative.';
  ELSE
    v_daily := v_cumulative - v_prev_cumulative;
  END IF;

  INSERT INTO public.db_usage_tracker AS t (
    usage_date,
    logged_at,
    cumulative_writes,
    total_daily_writes,
    estimated_realtime_messages,
    alert_triggered,
    subscriber_multiplier,
    daily_write_threshold,
    notes
  )
  VALUES (
    v_today,
    now(),
    v_cumulative,
    v_daily,
    ROUND(v_daily * v_mult)::bigint,
    v_daily > v_threshold,
    v_mult,
    v_threshold,
    v_notes
  )
  ON CONFLICT (usage_date) DO UPDATE
  SET
    logged_at = excluded.logged_at,
    cumulative_writes = excluded.cumulative_writes,
    total_daily_writes = excluded.total_daily_writes,
    estimated_realtime_messages = excluded.estimated_realtime_messages,
    alert_triggered = excluded.alert_triggered,
    subscriber_multiplier = excluded.subscriber_multiplier,
    daily_write_threshold = excluded.daily_write_threshold,
    notes = excluded.notes
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.snapshot_db_usage(numeric, bigint) IS
  'Records today''s cumulative pg_stat write counters and daily delta; sets alert_triggered when daily writes exceed threshold.';

GRANT EXECUTE ON FUNCTION public.is_current_user_db_usage_viewer() TO authenticated;
GRANT EXECUTE ON FUNCTION public.snapshot_db_usage(numeric, bigint) TO authenticated;
GRANT SELECT ON public.db_usage_tracker TO authenticated;

-- Optional nightly job when pg_cron is available (Supabase Pro). Safe no-op otherwise.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('daily-db-usage-check');
    EXCEPTION
      WHEN OTHERS THEN
        NULL;
    END;

    PERFORM cron.schedule(
      'daily-db-usage-check',
      '0 23 * * *',
      $cron$SELECT public.snapshot_db_usage(3, 150000);$cron$
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'db_usage_tracker: pg_cron schedule skipped (%). Use API Health → Record snapshot, or enable pg_cron.',
      SQLERRM;
END;
$$;
