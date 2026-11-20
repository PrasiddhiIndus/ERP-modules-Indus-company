-- IT Support: clear transactional / test ticket data only.
-- Retains masters & config: categories, subcategories, SLA rules, assignees master,
-- ticket number sequence table (value reset), permissions, RLS, schema.

DO $$
DECLARE
  v_ticket_count       bigint;
  v_cc_count           bigint := 0;
  v_comment_count      bigint;
  v_history_count      bigint;
  v_attachment_count   bigint;
  v_notif_ticket_count bigint;
  v_notif_orphan_count bigint;
  v_notify_log_count   bigint;
  v_ids                uuid[];
  v_cat_count          bigint;
  v_sub_count          bigint;
  v_sla_count          bigint;
  v_assignee_count     bigint := 0;
BEGIN
  -- ── Identify transactional ticket rows ─────────────────────
  SELECT coalesce(array_agg(id), '{}'::uuid[])
    INTO v_ids
  FROM public.it_tickets;

  SELECT count(*) INTO v_ticket_count FROM public.it_tickets;
  SELECT count(*) INTO v_comment_count FROM public.it_ticket_comments;
  SELECT count(*) INTO v_history_count FROM public.it_ticket_history;
  SELECT count(*) INTO v_attachment_count FROM public.it_ticket_attachments;
  SELECT count(*) INTO v_notif_ticket_count
    FROM public.it_notifications
   WHERE ticket_id IS NOT NULL
      OR ticket_id = ANY (v_ids);
  SELECT count(*) INTO v_notif_orphan_count
    FROM public.it_notifications
   WHERE ticket_id IS NULL
     AND type IN (
       'created', 'assigned', 'status', 'comment', 'cc',
       'sla_breach', 'sla_warning', 'resolved', 'closed'
     );
  SELECT count(*) INTO v_notify_log_count
    FROM public.it_notify_log
   WHERE ticket_id IS NOT NULL OR ticket_id = ANY (v_ids);

  IF to_regclass('public.it_ticket_cc') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.it_ticket_cc' INTO v_cc_count;
  END IF;

  -- Masters retained (verify before delete)
  SELECT count(*) INTO v_cat_count
    FROM public.it_ticket_categories WHERE deleted_at IS NULL;
  SELECT count(*) INTO v_sub_count
    FROM public.it_ticket_subcategories WHERE deleted_at IS NULL;
  SELECT count(*) INTO v_sla_count
    FROM public.it_sla_rules WHERE deleted_at IS NULL;
  IF to_regclass('public.it_support_assignees') IS NOT NULL THEN
    EXECUTE
      'SELECT count(*) FROM public.it_support_assignees WHERE deleted_at IS NULL'
      INTO v_assignee_count;
  END IF;

  RAISE NOTICE 'IT Support cleanup — will DELETE transactional rows:';
  RAISE NOTICE '  tickets=%  comments=%  history=%  attachments=%  cc=%',
    v_ticket_count, v_comment_count, v_history_count, v_attachment_count, v_cc_count;
  RAISE NOTICE '  notifications(ticket-linked)=%  notifications(orphan IT types)=%  notify_log=%',
    v_notif_ticket_count, v_notif_orphan_count, v_notify_log_count;
  RAISE NOTICE 'IT Support cleanup — RETAINED masters (unchanged):';
  RAISE NOTICE '  categories=%  subcategories=%  sla_rules=%  assignees=%',
    v_cat_count, v_sub_count, v_sla_count, v_assignee_count;

  IF v_ticket_count = 0
     AND v_comment_count = 0
     AND v_history_count = 0
     AND v_attachment_count = 0
     AND v_cc_count = 0
     AND v_notif_ticket_count = 0
     AND v_notif_orphan_count = 0
     AND v_notify_log_count = 0
  THEN
    RAISE NOTICE 'Nothing to delete — IT Support transactional tables already empty.';
    RETURN;
  END IF;

  -- ── FK-safe delete order (children → parents) ──────────────
  DELETE FROM public.it_notifications
  WHERE ticket_id = ANY (v_ids)
     OR (
       ticket_id IS NULL
       AND type IN (
         'created', 'assigned', 'status', 'comment', 'cc',
         'sla_breach', 'sla_warning', 'resolved', 'closed'
       )
     );

  DELETE FROM public.it_notify_log
  WHERE ticket_id = ANY (v_ids)
     OR ticket_id IS NULL;

  -- Attachments before comments (comment_id FK)
  DELETE FROM public.it_ticket_attachments;

  DELETE FROM public.it_ticket_comments;

  DELETE FROM public.it_ticket_history;

  IF to_regclass('public.it_ticket_cc') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.it_ticket_cc';
  END IF;

  DELETE FROM public.it_tickets;

  -- Reset numbering so the next raise is IT-YYYY-00001
  INSERT INTO public.it_ticket_number_seq (year, last_value)
  VALUES (EXTRACT(YEAR FROM now())::int, 0)
  ON CONFLICT (year) DO UPDATE
  SET last_value = 0;

  RAISE NOTICE 'IT Support cleanup complete. Ticket sequence reset for year %.',
    EXTRACT(YEAR FROM now())::int;
END;
$$;
