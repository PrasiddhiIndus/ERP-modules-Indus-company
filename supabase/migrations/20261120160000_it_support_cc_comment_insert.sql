-- Allow authorised CC watchers to post public comments on tickets they are CC'd on.
-- Same insert rules as the requester: author must be self; internal notes stay agent-only.

DROP POLICY IF EXISTS it_ticket_comments_insert ON public.it_ticket_comments;
CREATE POLICY it_ticket_comments_insert ON public.it_ticket_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.it_tickets t
      WHERE t.id = ticket_id
        AND t.deleted_at IS NULL
        AND (
          public.current_user_is_it_support_agent()
          OR (
            (
              t.requester_id = auth.uid()
              OR public.current_user_is_it_ticket_cc(t.id)
            )
            AND is_internal = false
          )
        )
    )
  );

COMMENT ON POLICY it_ticket_comments_insert ON public.it_ticket_comments IS
  'Agents may insert any comment; requester and ticket CC may insert non-internal comments only.';
