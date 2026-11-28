-- Rollback: remove software/hardware support_type split from IT Support.
-- Recreate prior it_create_ticket / it_list_raise_masters / it_list_my_tickets from earlier migrations if needed.

DROP FUNCTION IF EXISTS public.it_list_raise_masters(text);

ALTER TABLE public.it_tickets DROP CONSTRAINT IF EXISTS it_tickets_support_type_check;
ALTER TABLE public.it_ticket_categories DROP CONSTRAINT IF EXISTS it_ticket_categories_support_type_check;

DROP INDEX IF EXISTS public.idx_it_tickets_support_type_live;
DROP INDEX IF EXISTS public.idx_it_ticket_categories_support_type_live;

ALTER TABLE public.it_tickets DROP COLUMN IF EXISTS support_type;
ALTER TABLE public.it_ticket_categories DROP COLUMN IF EXISTS support_type;
