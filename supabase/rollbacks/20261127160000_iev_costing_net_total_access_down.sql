-- Rollback 20261127160000_iev_costing_net_total_access.sql

DO $$
BEGIN
  IF to_regclass('public.costing_summary') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS costing_summary_net_total_select ON public.costing_summary';
    EXECUTE 'DROP POLICY IF EXISTS costing_summary_net_total_insert ON public.costing_summary';
    EXECUTE 'DROP POLICY IF EXISTS costing_summary_net_total_update ON public.costing_summary';
    EXECUTE 'DROP POLICY IF EXISTS costing_summary_net_total_delete ON public.costing_summary';
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.costing_summary_row_is_net_total_exempt(text);
DROP FUNCTION IF EXISTS public.current_user_can_view_iev_costing_net_total();
