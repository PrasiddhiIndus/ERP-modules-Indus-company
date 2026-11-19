-- Wipe IT Support sample / scratch-reset ticket data so the module starts empty.
-- Keeps categories and SLA rules. Resets ticket number sequence for the current year.

DELETE FROM public.it_notifications
WHERE ticket_id IN (SELECT id FROM public.it_tickets);

DELETE FROM public.it_notify_log
WHERE ticket_id IN (SELECT id FROM public.it_tickets);

DELETE FROM public.it_ticket_attachments;

DELETE FROM public.it_ticket_comments;

DELETE FROM public.it_ticket_history;

DELETE FROM public.it_tickets;

-- Also clear any orphan notifications left without a ticket
DELETE FROM public.it_notifications
WHERE ticket_id IS NULL
  AND type IN ('created', 'assigned', 'status', 'comment', 'sla_breach', 'sla_warning', 'resolved', 'closed');

-- Next ticket will be IT-YYYY-00001 again
INSERT INTO public.it_ticket_number_seq (year, last_value)
VALUES (EXTRACT(YEAR FROM now())::int, 0)
ON CONFLICT (year) DO UPDATE
SET last_value = 0;

COMMENT ON TABLE public.it_tickets IS
  'IT Support tickets — start from a clean queue (no seed/mock rows).';
