-- Remove specific IT Support tickets IT-2026-00001 and IT-2026-00002 (and related rows).

DO $$
DECLARE
  v_ids uuid[];
BEGIN
  SELECT coalesce(array_agg(id), '{}'::uuid[])
    INTO v_ids
  FROM public.it_tickets
  WHERE ticket_no IN ('IT-2026-00001', 'IT-2026-00002');

  IF cardinality(v_ids) = 0 THEN
    RAISE NOTICE 'No tickets found for IT-2026-00001 / IT-2026-00002';
    RETURN;
  END IF;

  DELETE FROM public.it_notifications
  WHERE ticket_id = ANY (v_ids);

  DELETE FROM public.it_notify_log
  WHERE ticket_id = ANY (v_ids);

  DELETE FROM public.it_ticket_attachments
  WHERE ticket_id = ANY (v_ids);

  DELETE FROM public.it_ticket_comments
  WHERE ticket_id = ANY (v_ids);

  DELETE FROM public.it_ticket_history
  WHERE ticket_id = ANY (v_ids);

  IF to_regclass('public.it_ticket_cc') IS NOT NULL THEN
    DELETE FROM public.it_ticket_cc
    WHERE ticket_id = ANY (v_ids);
  END IF;

  DELETE FROM public.it_tickets
  WHERE id = ANY (v_ids);
END;
$$;
