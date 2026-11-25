-- IT Support: refresh issue types + CC watchers on raise / My Tickets.

-- ── Issue types ──────────────────────────────────────────────
-- Soft-hide Hardware / Software; rename ERP → Indus ERP; add Indus One & NFPA LMS.

UPDATE public.it_ticket_categories
SET is_active = false, updated_at = now()
WHERE deleted_at IS NULL
  AND lower(btrim(name)) IN ('hardware', 'software');

UPDATE public.it_ticket_categories
SET
  name = 'Indus ERP',
  description = 'Indus ERP modules and screens',
  sort_order = 5,
  is_active = true,
  updated_at = now()
WHERE deleted_at IS NULL
  AND lower(btrim(name)) = 'erp';

INSERT INTO public.it_ticket_categories (name, description, sort_order, is_active)
SELECT v.name, v.description, v.sort_order, true
FROM (VALUES
  ('Indus One', 'Indus One platform / navigation', 6),
  ('NFPA LMS', 'NFPA LMS training platform', 7)
) AS v(name, description, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.it_ticket_categories c
  WHERE lower(btrim(c.name)) = lower(v.name) AND c.deleted_at IS NULL
);

UPDATE public.it_ticket_categories
SET sort_order = CASE lower(btrim(name))
  WHEN 'network/internet' THEN 1
  WHEN 'email' THEN 2
  WHEN 'access/password' THEN 3
  WHEN 'printer' THEN 4
  WHEN 'indus erp' THEN 5
  WHEN 'indus one' THEN 6
  WHEN 'nfpa lms' THEN 7
  WHEN 'other' THEN 8
  ELSE sort_order
END,
updated_at = now()
WHERE deleted_at IS NULL
  AND lower(btrim(name)) IN (
    'network/internet', 'email', 'access/password', 'printer',
    'indus erp', 'indus one', 'nfpa lms', 'other'
  );

-- ── CC watchers ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.it_ticket_cc (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id       uuid NOT NULL REFERENCES public.it_tickets(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES public.profiles(id),
  employee_code   text,
  display_name    text,
  added_by        uuid REFERENCES public.profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_it_ticket_cc_ticket_user UNIQUE (ticket_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_it_ticket_cc_user
  ON public.it_ticket_cc (user_id);

CREATE INDEX IF NOT EXISTS idx_it_ticket_cc_ticket
  ON public.it_ticket_cc (ticket_id);

COMMENT ON TABLE public.it_ticket_cc IS
  'Users kept in CC on an IT Support ticket; they can open it from My Tickets (read status).';

ALTER TABLE public.it_ticket_cc ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.current_user_is_it_ticket_cc(p_ticket_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.it_ticket_cc c
    WHERE c.ticket_id = p_ticket_id
      AND c.user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.current_user_is_it_ticket_cc(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS it_ticket_cc_select ON public.it_ticket_cc;
CREATE POLICY it_ticket_cc_select ON public.it_ticket_cc
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.current_user_is_it_support_agent()
    OR EXISTS (
      SELECT 1 FROM public.it_tickets t
      WHERE t.id = ticket_id
        AND t.deleted_at IS NULL
        AND t.requester_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS it_ticket_cc_insert ON public.it_ticket_cc;
CREATE POLICY it_ticket_cc_insert ON public.it_ticket_cc
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_is_it_support_agent()
    OR EXISTS (
      SELECT 1 FROM public.it_tickets t
      WHERE t.id = ticket_id
        AND t.deleted_at IS NULL
        AND t.requester_id = auth.uid()
    )
  );

GRANT SELECT, INSERT ON public.it_ticket_cc TO authenticated;

-- Tickets / activity: CC users may read (not act as owner).
DROP POLICY IF EXISTS it_tickets_select ON public.it_tickets;
CREATE POLICY it_tickets_select ON public.it_tickets
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      public.current_user_is_it_support_agent()
      OR requester_id = auth.uid()
      OR public.current_user_is_it_ticket_cc(id)
    )
  );

DROP POLICY IF EXISTS it_ticket_history_select ON public.it_ticket_history;
CREATE POLICY it_ticket_history_select ON public.it_ticket_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.it_tickets t
      WHERE t.id = ticket_id
        AND t.deleted_at IS NULL
        AND (
          public.current_user_is_it_support_agent()
          OR t.requester_id = auth.uid()
          OR public.current_user_is_it_ticket_cc(t.id)
        )
    )
    AND (is_internal = false OR public.current_user_is_it_support_agent())
  );

DROP POLICY IF EXISTS it_ticket_comments_select ON public.it_ticket_comments;
CREATE POLICY it_ticket_comments_select ON public.it_ticket_comments
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.it_tickets t
      WHERE t.id = ticket_id
        AND t.deleted_at IS NULL
        AND (
          public.current_user_is_it_support_agent()
          OR t.requester_id = auth.uid()
          OR public.current_user_is_it_ticket_cc(t.id)
        )
    )
    AND (is_internal = false OR public.current_user_is_it_support_agent())
  );

DROP POLICY IF EXISTS it_ticket_attachments_select ON public.it_ticket_attachments;
CREATE POLICY it_ticket_attachments_select ON public.it_ticket_attachments
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.it_tickets t
      WHERE t.id = ticket_id
        AND t.deleted_at IS NULL
        AND (
          public.current_user_is_it_support_agent()
          OR t.requester_id = auth.uid()
          OR public.current_user_is_it_ticket_cc(t.id)
        )
    )
  );

-- ── Employee typeahead for CC (any active raiser) ────────────

CREATE OR REPLACE FUNCTION public.it_support_search_employees(p_term text)
RETURNS TABLE (
  profile_id uuid,
  employee_code text,
  full_name text,
  designation text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_term text := btrim(coalesce(p_term, ''));
  v_like text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.current_user_has_it_support_raise() THEN
    RAISE EXCEPTION 'You do not have permission to search employees for IT Support';
  END IF;
  IF char_length(v_term) < 2 THEN
    RETURN;
  END IF;

  v_like := '%' || replace(replace(replace(v_term, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  RETURN QUERY
  SELECT
    p.id AS profile_id,
    btrim(coalesce(em.employee_code, p.employee_code, '')) AS employee_code,
    coalesce(
      nullif(btrim(coalesce(em.full_name, '')), ''),
      nullif(btrim(coalesce(p.username, '')), ''),
      nullif(split_part(coalesce(p.email, ''), '@', 1), ''),
      'Employee'
    ) AS full_name,
    btrim(coalesce(em.designation, '')) AS designation
  FROM public.profiles p
  LEFT JOIN public.admin_ifsp_employee_master em
    ON p.employee_code IS NOT NULL
   AND lower(btrim(em.employee_code)) = lower(btrim(p.employee_code))
  WHERE coalesce(p.is_active, true) = true
    AND p.id IS DISTINCT FROM auth.uid()
    AND (
      em.full_name ILIKE v_like ESCAPE '\'
      OR em.employee_code ILIKE v_like ESCAPE '\'
      OR p.username ILIKE v_like ESCAPE '\'
      OR p.employee_code ILIKE v_like ESCAPE '\'
      OR p.email ILIKE v_like ESCAPE '\'
    )
    AND (
      em.id IS NULL
      OR em.status = 'Active'
    )
  ORDER BY full_name ASC NULLS LAST
  LIMIT 15;
END;
$$;

COMMENT ON FUNCTION public.it_support_search_employees(text) IS
  'IT Support Raise Ticket CC typeahead — Employee Master + login profiles (SECURITY DEFINER).';

REVOKE ALL ON FUNCTION public.it_support_search_employees(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.it_support_search_employees(text) TO authenticated, service_role;

-- ── My tickets (raised by me OR I am on CC) ──────────────────

CREATE OR REPLACE FUNCTION public.it_list_my_tickets(
  p_search text DEFAULT NULL,
  p_status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_like text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NULLIF(btrim(coalesce(p_search, '')), '') IS NOT NULL THEN
    v_like := '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  END IF;

  RETURN COALESCE(
    (
      SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x.created_at DESC)
      FROM (
        SELECT
          t.id,
          t.ticket_no,
          t.title,
          t.description,
          t.category_id,
          t.subcategory_id,
          t.requester_id,
          t.requester_employee_code,
          t.requester_department,
          t.requester_display_name,
          t.assignee_display_name,
          t.erp_module_key,
          t.erp_module_label,
          t.erp_submodule_key,
          t.erp_submodule_label,
          t.impact,
          t.priority,
          t.status,
          t.assignee_id,
          t.created_at,
          t.updated_at,
          t.resolved_at,
          t.closed_at,
          CASE
            WHEN t.requester_id = v_uid THEN 'requester'
            ELSE 'cc'
          END AS viewer_role,
          (
            SELECT jsonb_build_object('id', c.id, 'name', c.name)
            FROM public.it_ticket_categories c
            WHERE c.id = t.category_id
          ) AS category
        FROM public.it_tickets t
        WHERE t.deleted_at IS NULL
          AND (
            t.requester_id = v_uid
            OR EXISTS (
              SELECT 1 FROM public.it_ticket_cc cc
              WHERE cc.ticket_id = t.id AND cc.user_id = v_uid
            )
          )
          AND (
            NULLIF(btrim(coalesce(p_status, '')), '') IS NULL
            OR t.status = btrim(p_status)
          )
          AND (
            v_like IS NULL
            OR t.title ILIKE v_like ESCAPE '\'
            OR t.ticket_no ILIKE v_like ESCAPE '\'
            OR coalesce(t.erp_module_label, '') ILIKE v_like ESCAPE '\'
            OR coalesce(t.erp_submodule_label, '') ILIKE v_like ESCAPE '\'
          )
      ) x
    ),
    '[]'::jsonb
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.it_list_my_tickets(text, text) TO authenticated, service_role;

-- ── Create ticket with optional CC list ──────────────────────

DROP FUNCTION IF EXISTS public.it_create_ticket(text, text, uuid, uuid, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.it_create_ticket(text, text, uuid, uuid, text, text, text, text, text, uuid[]);

CREATE OR REPLACE FUNCTION public.it_create_ticket(
  p_title text,
  p_description text,
  p_category_id uuid DEFAULT NULL,
  p_subcategory_id uuid DEFAULT NULL,
  p_impact text DEFAULT 'only_me',
  p_erp_module_key text DEFAULT NULL,
  p_erp_module_label text DEFAULT NULL,
  p_erp_submodule_key text DEFAULT NULL,
  p_erp_submodule_label text DEFAULT NULL,
  p_cc_user_ids uuid[] DEFAULT NULL
)
RETURNS public.it_tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile public.profiles%ROWTYPE;
  v_dept text;
  v_row public.it_tickets;
  v_mod_key text := NULLIF(btrim(coalesce(p_erp_module_key, '')), '');
  v_mod_label text := NULLIF(btrim(coalesce(p_erp_module_label, '')), '');
  v_sub_key text := NULLIF(btrim(coalesce(p_erp_submodule_key, '')), '');
  v_sub_label text := NULLIF(btrim(coalesce(p_erp_submodule_label, '')), '');
  v_cc uuid;
  v_cc_profile public.profiles%ROWTYPE;
  v_cc_name text;
  v_cc_code text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.current_user_has_it_support_raise() THEN
    RAISE EXCEPTION 'You do not have permission to raise an IT Support ticket';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_uid;
  IF v_profile.id IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  SELECT NULLIF(btrim(em.department), '')
    INTO v_dept
  FROM public.admin_ifsp_employee_master em
  WHERE v_profile.employee_code IS NOT NULL
    AND lower(btrim(em.employee_code)) = lower(btrim(v_profile.employee_code))
  LIMIT 1;

  INSERT INTO public.it_tickets (
    ticket_no, title, description, category_id, subcategory_id,
    requester_id, requester_employee_code, requester_department, requester_display_name,
    impact, status,
    erp_module_key, erp_module_label, erp_submodule_key, erp_submodule_label
  ) VALUES (
    public.it_allocate_ticket_no(),
    NULLIF(btrim(p_title), ''),
    coalesce(p_description, ''),
    p_category_id,
    p_subcategory_id,
    v_uid,
    v_profile.employee_code,
    v_dept,
    coalesce(nullif(btrim(v_profile.username), ''), split_part(coalesce(v_profile.email, ''), '@', 1)),
    CASE
      WHEN lower(btrim(coalesce(p_impact, ''))) IN ('only_me', 'my_team', 'whole_office')
        THEN lower(btrim(p_impact))
      ELSE 'only_me'
    END,
    'new',
    v_mod_key,
    COALESCE(v_mod_label, v_mod_key),
    v_sub_key,
    COALESCE(v_sub_label, v_sub_key)
  )
  RETURNING * INTO v_row;

  INSERT INTO public.it_ticket_history (ticket_id, event_type, to_value, remark, actor_id)
  VALUES (v_row.id, 'created', 'new', 'Ticket raised', v_uid);

  -- CC watchers (Employee Master / Indus One logins only; skip self / inactive).
  IF p_cc_user_ids IS NOT NULL THEN
    FOREACH v_cc IN ARRAY p_cc_user_ids
    LOOP
      IF v_cc IS NULL OR v_cc = v_uid THEN
        CONTINUE;
      END IF;
      SELECT * INTO v_cc_profile
      FROM public.profiles p
      WHERE p.id = v_cc AND coalesce(p.is_active, true) = true;
      IF v_cc_profile.id IS NULL THEN
        CONTINUE;
      END IF;

      v_cc_name := coalesce(
        nullif(btrim(v_cc_profile.username), ''),
        nullif(split_part(coalesce(v_cc_profile.email, ''), '@', 1), ''),
        'Employee'
      );
      v_cc_code := nullif(btrim(v_cc_profile.employee_code), '');
      SELECT
        nullif(btrim(em.full_name), ''),
        coalesce(nullif(btrim(em.employee_code), ''), v_cc_code)
      INTO v_cc_name, v_cc_code
      FROM public.admin_ifsp_employee_master em
      WHERE v_cc_code IS NOT NULL
        AND lower(btrim(em.employee_code)) = lower(v_cc_code)
      LIMIT 1;
      -- If no master row, keep profile-derived name/code already set above.
      IF NOT FOUND THEN
        v_cc_name := coalesce(
          nullif(btrim(v_cc_profile.username), ''),
          nullif(split_part(coalesce(v_cc_profile.email, ''), '@', 1), ''),
          'Employee'
        );
        v_cc_code := nullif(btrim(v_cc_profile.employee_code), '');
      ELSIF v_cc_name IS NULL OR btrim(v_cc_name) = '' THEN
        v_cc_name := coalesce(
          nullif(btrim(v_cc_profile.username), ''),
          nullif(split_part(coalesce(v_cc_profile.email, ''), '@', 1), ''),
          'Employee'
        );
      END IF;

      INSERT INTO public.it_ticket_cc (ticket_id, user_id, employee_code, display_name, added_by)
      VALUES (v_row.id, v_cc, v_cc_code, v_cc_name, v_uid)
      ON CONFLICT (ticket_id, user_id) DO NOTHING;

      INSERT INTO public.it_notifications (user_id, ticket_id, type, title, body)
      VALUES (
        v_cc,
        v_row.id,
        'cc',
        format('CC on ticket %s', v_row.ticket_no),
        left(format('You were added in CC on “%s”. Open My Tickets to follow the status.', v_row.title), 200)
      );
    END LOOP;
  END IF;

  INSERT INTO public.it_notifications (user_id, ticket_id, type, title, body)
  SELECT p.id, v_row.id, 'created',
         format('New ticket %s', v_row.ticket_no),
         left(
           CASE
             WHEN v_row.erp_module_label IS NOT NULL
               THEN format('[%s%s] %s',
                 v_row.erp_module_label,
                 CASE WHEN v_row.erp_submodule_label IS NOT NULL
                   THEN format(' › %s', v_row.erp_submodule_label) ELSE '' END,
                 v_row.title)
             ELSE v_row.title
           END,
           200
         )
  FROM public.profiles p
  WHERE p.id IS DISTINCT FROM v_uid
    AND (
      replace(lower(btrim(coalesce(p.role, ''))), ' ', '_') IN ('super_admin', 'super_admin_pro')
      OR COALESCE(p.allowed_modules, '[]'::jsonb) ? 'itIs'
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(COALESCE(p.allowed_sub_modules, '[]'::jsonb)) s(val)
        WHERE lower(btrim(s.val)) IN ('itis.helpdesk-agent', 'itis.helpdesk-admin')
           OR lower(btrim(s.val)) LIKE 'itis.helpdesk-agent%'
           OR lower(btrim(s.val)) LIKE 'itis.helpdesk-admin%'
      )
    );

  INSERT INTO public.it_notifications (user_id, ticket_id, type, title, body)
  VALUES (
    v_uid, v_row.id, 'created',
    format('Ticket %s submitted', v_row.ticket_no),
    'IT Support has received your request.'
  );

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.it_create_ticket(text, text, uuid, uuid, text, text, text, text, text, uuid[])
  TO authenticated, service_role;
