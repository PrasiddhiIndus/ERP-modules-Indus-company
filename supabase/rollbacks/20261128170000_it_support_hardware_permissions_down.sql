-- Rollback Hardware Support permission helpers and restore prior software raise semantics.
-- Re-apply prior ticket RLS / it_create_ticket from earlier IT Support migrations after drop.

DROP FUNCTION IF EXISTS public.current_user_has_hardware_support_key(text[]);
DROP FUNCTION IF EXISTS public.current_user_has_hardware_support_raise();
DROP FUNCTION IF EXISTS public.current_user_is_hardware_support_agent();
DROP FUNCTION IF EXISTS public.current_user_is_hardware_support_admin();
DROP FUNCTION IF EXISTS public.current_user_can_access_hardware_ticket_detail();
DROP FUNCTION IF EXISTS public.current_user_is_it_ticket_agent(uuid);
DROP FUNCTION IF EXISTS public.current_user_is_it_ticket_type_agent(text);

-- Restore "all active users can raise" only if intentionally rolling back this policy change.
-- Prefer re-running 20261120100000_it_support_raise_all_active.sql and
-- 20261119160000 agent/admin definitions instead of leaving stubs here.
