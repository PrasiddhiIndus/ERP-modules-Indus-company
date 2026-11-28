-- IT Support access control
-- ----------------------------
-- Super Admin / Super Admin Pro → full Software + Hardware (all tabs).
-- Everyone else → only when User Management grants IT Support keys
--   (or the full itIs module). No open access for all active users.
--   No team-name bypass.
--
-- Software keys (unchanged names):
--   itIs.helpdesk / itIs.helpdesk-agent / itIs.helpdesk-admin
-- Hardware keys:
--   itIs.hardware-support                  — parent (all hardware pages)
--   itIs.hardware-support.raise|dashboard|queue|tickets|masters|reports
--
-- Rollback: supabase/rollbacks/20261128170000_it_support_hardware_permissions_down.sql

-- ---------------------------------------------------------------------------
-- Software Support: raise is grant-based (not all active users)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_user_has_it_support_raise()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND COALESCE(p.is_active, true) = true
      AND (
        replace(lower(btrim(coalesce(p.role, ''))), ' ', '_') IN (
          'super_admin', 'super_admin_pro', 'superadmin', 'superadmin_pro'
        )
        OR COALESCE(p.allowed_modules, '[]'::jsonb) ? 'itIs'
        OR COALESCE(p.allowed_modules, '[]'::jsonb) ? 'itis'
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(COALESCE(p.allowed_sub_modules, '[]'::jsonb)) s(val)
          WHERE lower(btrim(s.val)) IN (
              'itis.helpdesk',
              'itis.helpdesk-agent',
              'itis.helpdesk-admin'
            )
            OR lower(btrim(s.val)) LIKE 'itis.helpdesk%'
        )
      )
  );
$$;

COMMENT ON FUNCTION public.current_user_has_it_support_raise() IS
  'Software Support raise: Super Admin, full itIs module, or explicit helpdesk grant — not all active users.';

CREATE OR REPLACE FUNCTION public.current_user_is_it_support_agent()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND COALESCE(p.is_active, true) = true
      AND (
        replace(lower(btrim(coalesce(p.role, ''))), ' ', '_') IN (
          'super_admin', 'super_admin_pro', 'superadmin', 'superadmin_pro'
        )
        OR COALESCE(p.allowed_modules, '[]'::jsonb) ? 'itIs'
        OR COALESCE(p.allowed_modules, '[]'::jsonb) ? 'itis'
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(COALESCE(p.allowed_sub_modules, '[]'::jsonb)) s(val)
          WHERE lower(btrim(s.val)) IN (
              'itis.helpdesk-agent',
              'itis.helpdesk-admin'
            )
            OR lower(btrim(s.val)) LIKE 'itis.helpdesk-agent%'
            OR lower(btrim(s.val)) LIKE 'itis.helpdesk-admin%'
        )
      )
  );
$$;

COMMENT ON FUNCTION public.current_user_is_it_support_agent() IS
  'Software Support agent: Super Admin, full itIs, or helpdesk-agent/admin grant (no team bypass).';

CREATE OR REPLACE FUNCTION public.current_user_is_it_support_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND COALESCE(p.is_active, true) = true
      AND (
        replace(lower(btrim(coalesce(p.role, ''))), ' ', '_') IN (
          'super_admin', 'super_admin_pro', 'superadmin', 'superadmin_pro'
        )
        OR COALESCE(p.allowed_modules, '[]'::jsonb) ? 'itIs'
        OR COALESCE(p.allowed_modules, '[]'::jsonb) ? 'itis'
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(COALESCE(p.allowed_sub_modules, '[]'::jsonb)) s(val)
          WHERE lower(btrim(s.val)) IN ('itis.helpdesk-admin')
            OR lower(btrim(s.val)) LIKE 'itis.helpdesk-admin%'
        )
      )
  );
$$;

COMMENT ON FUNCTION public.current_user_is_it_support_admin() IS
  'Software Support admin: Super Admin, full itIs, or helpdesk-admin grant.';

GRANT EXECUTE ON FUNCTION public.current_user_has_it_support_raise() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_is_it_support_agent() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_is_it_support_admin() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Hardware Support helpers (Super Admin / full itIs / explicit keys)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_user_has_hardware_support_key(p_keys text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND COALESCE(p.is_active, true) = true
      AND (
        replace(lower(btrim(coalesce(p.role, ''))), ' ', '_') IN (
          'super_admin', 'super_admin_pro', 'superadmin', 'superadmin_pro'
        )
        OR COALESCE(p.allowed_modules, '[]'::jsonb) ? 'itIs'
        OR COALESCE(p.allowed_modules, '[]'::jsonb) ? 'itis'
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(COALESCE(p.allowed_sub_modules, '[]'::jsonb)) s(val)
          WHERE lower(btrim(s.val)) = 'itis.hardware-support'
             OR lower(btrim(s.val)) = ANY (
                  SELECT lower(btrim(k)) FROM unnest(coalesce(p_keys, ARRAY[]::text[])) k
                )
        )
      )
  );
$$;

COMMENT ON FUNCTION public.current_user_has_hardware_support_key(text[]) IS
  'True when the user has Hardware Support parent, full itIs, Super Admin, or any listed page key.';

CREATE OR REPLACE FUNCTION public.current_user_has_hardware_support_raise()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT public.current_user_has_hardware_support_key(
    ARRAY['itIs.hardware-support.raise']
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_is_hardware_support_agent()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT public.current_user_has_hardware_support_key(
    ARRAY[
      'itIs.hardware-support.dashboard',
      'itIs.hardware-support.queue',
      'itIs.hardware-support.tickets',
      'itIs.hardware-support.masters',
      'itIs.hardware-support.reports'
    ]
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_is_hardware_support_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT public.current_user_has_hardware_support_key(
    ARRAY[
      'itIs.hardware-support.masters',
      'itIs.hardware-support.reports'
    ]
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_can_access_hardware_ticket_detail()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT public.current_user_has_hardware_support_key(
    ARRAY[
      'itIs.hardware-support.tickets',
      'itIs.hardware-support.raise',
      'itIs.hardware-support.dashboard',
      'itIs.hardware-support.queue',
      'itIs.hardware-support.masters',
      'itIs.hardware-support.reports'
    ]
  );
$$;

-- Agent for a specific ticket based on support_type (software helpers unchanged).
CREATE OR REPLACE FUNCTION public.current_user_is_it_ticket_agent(p_ticket_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.it_tickets t
    WHERE t.id = p_ticket_id
      AND t.deleted_at IS NULL
      AND (
        CASE
          WHEN lower(btrim(coalesce(t.support_type, 'software'))) = 'hardware'
            THEN public.current_user_is_hardware_support_agent()
          ELSE public.current_user_is_it_support_agent()
        END
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_is_it_ticket_type_agent(p_support_type text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT CASE
    WHEN lower(btrim(coalesce(p_support_type, 'software'))) = 'hardware'
      THEN public.current_user_is_hardware_support_agent()
    ELSE public.current_user_is_it_support_agent()
  END;
$$;

GRANT EXECUTE ON FUNCTION public.current_user_has_hardware_support_key(text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_has_hardware_support_raise() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_is_hardware_support_agent() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_is_hardware_support_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_can_access_hardware_ticket_detail() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_is_it_ticket_agent(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_is_it_ticket_type_agent(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Tickets RLS — software agents see software; hardware agents see hardware
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS it_tickets_select ON public.it_tickets;
CREATE POLICY it_tickets_select ON public.it_tickets
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      requester_id = auth.uid()
      OR public.current_user_is_it_ticket_cc(id)
      OR public.current_user_is_it_ticket_type_agent(support_type)
      OR (
        lower(btrim(coalesce(support_type, 'software'))) = 'hardware'
        AND public.current_user_can_access_hardware_ticket_detail()
      )
    )
  );

DROP POLICY IF EXISTS it_tickets_insert ON public.it_tickets;
CREATE POLICY it_tickets_insert ON public.it_tickets
  FOR INSERT TO authenticated
  WITH CHECK (
    requester_id = auth.uid()
    AND (
      (
        lower(btrim(coalesce(support_type, 'software'))) = 'software'
        AND public.current_user_has_it_support_raise()
      )
      OR (
        lower(btrim(coalesce(support_type, ''))) = 'hardware'
        AND public.current_user_has_hardware_support_raise()
      )
    )
  );

DROP POLICY IF EXISTS it_tickets_update ON public.it_tickets;
CREATE POLICY it_tickets_update ON public.it_tickets
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      requester_id = auth.uid()
      OR public.current_user_is_it_ticket_type_agent(support_type)
    )
  )
  WITH CHECK (
    requester_id = auth.uid()
    OR public.current_user_is_it_ticket_type_agent(support_type)
  );

DROP POLICY IF EXISTS it_tickets_delete ON public.it_tickets;
CREATE POLICY it_tickets_delete ON public.it_tickets
  FOR DELETE TO authenticated
  USING (
    CASE
      WHEN lower(btrim(coalesce(support_type, 'software'))) = 'hardware'
        THEN public.current_user_is_hardware_support_admin()
      ELSE public.current_user_is_it_support_admin()
    END
  );

-- History / comments / attachments — ticket-scoped agent
DROP POLICY IF EXISTS it_ticket_history_select ON public.it_ticket_history;
CREATE POLICY it_ticket_history_select ON public.it_ticket_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.it_tickets t
      WHERE t.id = ticket_id
        AND t.deleted_at IS NULL
        AND (
          t.requester_id = auth.uid()
          OR public.current_user_is_it_ticket_cc(t.id)
          OR public.current_user_is_it_ticket_type_agent(t.support_type)
          OR (
            lower(btrim(coalesce(t.support_type, 'software'))) = 'hardware'
            AND public.current_user_can_access_hardware_ticket_detail()
          )
        )
    )
    AND (
      is_internal = false
      OR public.current_user_is_it_ticket_agent(ticket_id)
    )
  );

DROP POLICY IF EXISTS it_ticket_history_insert ON public.it_ticket_history;
CREATE POLICY it_ticket_history_insert ON public.it_ticket_history
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.it_tickets t
      WHERE t.id = ticket_id
        AND t.deleted_at IS NULL
        AND (
          t.requester_id = auth.uid()
          OR public.current_user_is_it_ticket_type_agent(t.support_type)
        )
    )
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
          t.requester_id = auth.uid()
          OR public.current_user_is_it_ticket_cc(t.id)
          OR public.current_user_is_it_ticket_type_agent(t.support_type)
          OR (
            lower(btrim(coalesce(t.support_type, 'software'))) = 'hardware'
            AND public.current_user_can_access_hardware_ticket_detail()
          )
        )
    )
    AND (
      is_internal = false
      OR public.current_user_is_it_ticket_agent(ticket_id)
    )
  );

DROP POLICY IF EXISTS it_ticket_comments_insert ON public.it_ticket_comments;
CREATE POLICY it_ticket_comments_insert ON public.it_ticket_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.it_tickets t
      WHERE t.id = ticket_id
        AND t.deleted_at IS NULL
        AND (
          t.requester_id = auth.uid()
          OR public.current_user_is_it_ticket_cc(t.id)
          OR public.current_user_is_it_ticket_type_agent(t.support_type)
        )
    )
    AND (is_internal = false OR public.current_user_is_it_ticket_agent(ticket_id))
  );

DROP POLICY IF EXISTS it_ticket_comments_update ON public.it_ticket_comments;
CREATE POLICY it_ticket_comments_update ON public.it_ticket_comments
  FOR UPDATE TO authenticated
  USING (public.current_user_is_it_ticket_agent(ticket_id))
  WITH CHECK (public.current_user_is_it_ticket_agent(ticket_id));

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
          t.requester_id = auth.uid()
          OR public.current_user_is_it_ticket_cc(t.id)
          OR public.current_user_is_it_ticket_type_agent(t.support_type)
          OR (
            lower(btrim(coalesce(t.support_type, 'software'))) = 'hardware'
            AND public.current_user_can_access_hardware_ticket_detail()
          )
        )
    )
  );

DROP POLICY IF EXISTS it_ticket_attachments_insert ON public.it_ticket_attachments;
CREATE POLICY it_ticket_attachments_insert ON public.it_ticket_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.it_tickets t
      WHERE t.id = ticket_id
        AND t.deleted_at IS NULL
        AND (
          t.requester_id = auth.uid()
          OR public.current_user_is_it_ticket_type_agent(t.support_type)
        )
    )
  );

DROP POLICY IF EXISTS it_ticket_attachments_update ON public.it_ticket_attachments;
CREATE POLICY it_ticket_attachments_update ON public.it_ticket_attachments
  FOR UPDATE TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR public.current_user_is_it_ticket_agent(ticket_id)
  );

-- Categories / SLA masters: software admin OR hardware admin may write
DROP POLICY IF EXISTS it_ticket_categories_select ON public.it_ticket_categories;
CREATE POLICY it_ticket_categories_select ON public.it_ticket_categories
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      public.current_user_has_it_support_raise()
      OR public.current_user_has_hardware_support_raise()
      OR public.current_user_is_it_support_agent()
      OR public.current_user_is_hardware_support_agent()
    )
  );

DROP POLICY IF EXISTS it_ticket_categories_write ON public.it_ticket_categories;
CREATE POLICY it_ticket_categories_write ON public.it_ticket_categories
  FOR ALL TO authenticated
  USING (
    public.current_user_is_it_support_admin()
    OR public.current_user_is_hardware_support_admin()
  )
  WITH CHECK (
    public.current_user_is_it_support_admin()
    OR public.current_user_is_hardware_support_admin()
  );

DROP POLICY IF EXISTS it_ticket_subcategories_select ON public.it_ticket_subcategories;
CREATE POLICY it_ticket_subcategories_select ON public.it_ticket_subcategories
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      public.current_user_has_it_support_raise()
      OR public.current_user_has_hardware_support_raise()
      OR public.current_user_is_it_support_agent()
      OR public.current_user_is_hardware_support_agent()
    )
  );

DROP POLICY IF EXISTS it_ticket_subcategories_write ON public.it_ticket_subcategories;
CREATE POLICY it_ticket_subcategories_write ON public.it_ticket_subcategories
  FOR ALL TO authenticated
  USING (
    public.current_user_is_it_support_admin()
    OR public.current_user_is_hardware_support_admin()
  )
  WITH CHECK (
    public.current_user_is_it_support_admin()
    OR public.current_user_is_hardware_support_admin()
  );

DROP POLICY IF EXISTS it_sla_rules_select ON public.it_sla_rules;
CREATE POLICY it_sla_rules_select ON public.it_sla_rules
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      public.current_user_has_it_support_raise()
      OR public.current_user_has_hardware_support_raise()
      OR public.current_user_is_it_support_agent()
      OR public.current_user_is_hardware_support_agent()
    )
  );

DROP POLICY IF EXISTS it_sla_rules_write ON public.it_sla_rules;
CREATE POLICY it_sla_rules_write ON public.it_sla_rules
  FOR ALL TO authenticated
  USING (
    public.current_user_is_it_support_admin()
    OR public.current_user_is_hardware_support_admin()
  )
  WITH CHECK (
    public.current_user_is_it_support_admin()
    OR public.current_user_is_hardware_support_admin()
  );

-- Assignees master readable by either agent type; writable by either admin
DROP POLICY IF EXISTS it_support_assignees_select ON public.it_support_assignees;
CREATE POLICY it_support_assignees_select ON public.it_support_assignees
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      public.current_user_is_it_support_agent()
      OR public.current_user_is_it_support_admin()
      OR public.current_user_is_hardware_support_agent()
      OR public.current_user_is_hardware_support_admin()
    )
  );

DROP POLICY IF EXISTS it_support_assignees_write ON public.it_support_assignees;
CREATE POLICY it_support_assignees_write ON public.it_support_assignees
  FOR ALL TO authenticated
  USING (
    public.current_user_is_it_support_admin()
    OR public.current_user_is_hardware_support_admin()
  )
  WITH CHECK (
    public.current_user_is_it_support_admin()
    OR public.current_user_is_hardware_support_admin()
  );

-- ---------------------------------------------------------------------------
-- Create ticket: gate raise by support_type; notify matching agents
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.it_create_ticket(text, text, uuid, uuid, text, text, text, text, text, uuid[], text);

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
  p_cc_user_ids uuid[] DEFAULT NULL,
  p_support_type text DEFAULT 'software'
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
  v_support text := lower(btrim(coalesce(p_support_type, 'software')));
  v_cc uuid;
  v_cc_profile public.profiles%ROWTYPE;
  v_cc_name text;
  v_cc_code text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_support NOT IN ('software', 'hardware') THEN
    v_support := 'software';
  END IF;

  IF v_support = 'hardware' THEN
    IF NOT public.current_user_has_hardware_support_raise() THEN
      RAISE EXCEPTION 'You do not have permission to raise a Hardware Support ticket';
    END IF;
  ELSE
    IF NOT public.current_user_has_it_support_raise() THEN
      RAISE EXCEPTION 'You do not have permission to raise an IT Support ticket';
    END IF;
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
    impact, status, support_type,
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
    v_support,
    v_mod_key,
    COALESCE(v_mod_label, v_mod_key),
    v_sub_key,
    COALESCE(v_sub_label, v_sub_key)
  )
  RETURNING * INTO v_row;

  INSERT INTO public.it_ticket_history (ticket_id, event_type, to_value, remark, actor_id)
  VALUES (v_row.id, 'created', 'new', 'Ticket raised (' || v_support || ')', v_uid);

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
    AND COALESCE(p.is_active, true) = true
    AND (
      -- Super Admin / full itIs always notified for either queue
      replace(lower(btrim(coalesce(p.role, ''))), ' ', '_') IN ('super_admin', 'super_admin_pro')
      OR COALESCE(p.allowed_modules, '[]'::jsonb) ? 'itIs'
      OR COALESCE(p.allowed_modules, '[]'::jsonb) ? 'itis'
      OR (
        v_support = 'software'
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(COALESCE(p.allowed_sub_modules, '[]'::jsonb)) s(val)
          WHERE lower(btrim(s.val)) IN ('itis.helpdesk-agent', 'itis.helpdesk-admin')
             OR lower(btrim(s.val)) LIKE 'itis.helpdesk-agent%'
             OR lower(btrim(s.val)) LIKE 'itis.helpdesk-admin%'
        )
      )
      OR (
        v_support = 'hardware'
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(COALESCE(p.allowed_sub_modules, '[]'::jsonb)) s(val)
          WHERE lower(btrim(s.val)) = 'itis.hardware-support'
             OR lower(btrim(s.val)) LIKE 'itis.hardware-support.%'
        )
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

GRANT EXECUTE ON FUNCTION public.it_create_ticket(
  text, text, uuid, uuid, text, text, text, text, text, uuid[], text
) TO authenticated, service_role;

-- Raise masters / employee search: allow hardware raisers too
CREATE OR REPLACE FUNCTION public.it_list_raise_masters(p_support_type text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_type text := lower(btrim(coalesce(p_support_type, '')));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_uid AND COALESCE(p.is_active, true) = true
  ) THEN
    RAISE EXCEPTION 'Your account is inactive';
  END IF;

  IF v_type = 'hardware' THEN
    IF NOT public.current_user_has_hardware_support_raise()
       AND NOT public.current_user_is_hardware_support_agent() THEN
      RAISE EXCEPTION 'You do not have permission to raise Hardware Support tickets';
    END IF;
  ELSIF v_type = 'software' THEN
    IF NOT public.current_user_has_it_support_raise() THEN
      RAISE EXCEPTION 'You do not have permission to raise Software Support tickets';
    END IF;
  ELSIF NOT public.current_user_has_it_support_raise()
        AND NOT public.current_user_has_hardware_support_raise() THEN
    RAISE EXCEPTION 'You do not have permission to raise IT Support tickets';
  END IF;

  IF v_type <> '' AND v_type NOT IN ('software', 'hardware') THEN
    v_type := NULL;
  END IF;

  RETURN jsonb_build_object(
    'categories',
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', c.id,
            'name', c.name,
            'description', c.description,
            'is_active', c.is_active,
            'sort_order', c.sort_order,
            'support_type', c.support_type,
            'created_at', c.created_at
          )
          ORDER BY c.sort_order ASC NULLS LAST, c.name ASC
        )
        FROM public.it_ticket_categories c
        WHERE c.deleted_at IS NULL
          AND COALESCE(c.is_active, true) = true
          AND (v_type IS NULL OR c.support_type = v_type)
      ),
      '[]'::jsonb
    ),
    'subcategories',
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', s.id,
            'category_id', s.category_id,
            'name', s.name,
            'description', s.description,
            'is_active', s.is_active,
            'sort_order', s.sort_order,
            'created_at', s.created_at
          )
          ORDER BY s.sort_order ASC NULLS LAST, s.name ASC
        )
        FROM public.it_ticket_subcategories s
        JOIN public.it_ticket_categories c ON c.id = s.category_id
        WHERE s.deleted_at IS NULL
          AND COALESCE(s.is_active, true) = true
          AND c.deleted_at IS NULL
          AND COALESCE(c.is_active, true) = true
          AND (v_type IS NULL OR c.support_type = v_type)
      ),
      '[]'::jsonb
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.it_list_raise_masters(text) TO authenticated, service_role;

-- CC policies: hardware agents may add CC on hardware tickets
DROP POLICY IF EXISTS it_ticket_cc_select ON public.it_ticket_cc;
CREATE POLICY it_ticket_cc_select ON public.it_ticket_cc
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.it_tickets t
      WHERE t.id = ticket_id
        AND t.deleted_at IS NULL
        AND (
          t.requester_id = auth.uid()
          OR public.current_user_is_it_ticket_type_agent(t.support_type)
        )
    )
  );

DROP POLICY IF EXISTS it_ticket_cc_insert ON public.it_ticket_cc;
CREATE POLICY it_ticket_cc_insert ON public.it_ticket_cc
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_is_it_ticket_type_agent(
      (SELECT t.support_type FROM public.it_tickets t WHERE t.id = ticket_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.it_tickets t
      WHERE t.id = ticket_id
        AND t.requester_id = auth.uid()
        AND t.deleted_at IS NULL
    )
  );

-- Employee CC typeahead for software OR hardware raisers
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
  IF NOT public.current_user_has_it_support_raise()
     AND NOT public.current_user_has_hardware_support_raise() THEN
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

GRANT EXECUTE ON FUNCTION public.it_support_search_employees(text) TO authenticated, service_role;

-- Assignee picker: software or hardware agents; no team-name bypass in fallback list
CREATE OR REPLACE FUNCTION public.it_list_support_agents()
RETURNS TABLE (
  id uuid,
  username text,
  email text,
  employee_code text,
  role text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  IF NOT public.current_user_is_it_support_agent()
     AND NOT public.current_user_is_hardware_support_agent() THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.it_support_assignees a
    WHERE a.deleted_at IS NULL AND COALESCE(a.is_active, true) = true
  ) THEN
    RETURN QUERY
    SELECT
      a.profile_id AS id,
      a.display_name AS username,
      p.email,
      a.employee_code,
      p.role
    FROM public.it_support_assignees a
    JOIN public.profiles p ON p.id = a.profile_id
    WHERE a.deleted_at IS NULL
      AND COALESCE(a.is_active, true) = true
      AND coalesce(p.is_active, true) = true
    ORDER BY a.sort_order ASC NULLS LAST, a.display_name ASC NULLS LAST;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.id, p.username, p.email, p.employee_code, p.role
  FROM public.profiles p
  WHERE coalesce(p.is_active, true) = true
    AND (
      replace(lower(btrim(coalesce(p.role, ''))), ' ', '_') IN ('super_admin', 'super_admin_pro')
      OR COALESCE(p.allowed_modules, '[]'::jsonb) ? 'itIs'
      OR COALESCE(p.allowed_modules, '[]'::jsonb) ? 'itis'
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(COALESCE(p.allowed_sub_modules, '[]'::jsonb)) s(val)
        WHERE lower(btrim(s.val)) IN ('itis.helpdesk-agent', 'itis.helpdesk-admin')
           OR lower(btrim(s.val)) LIKE 'itis.helpdesk-agent%'
           OR lower(btrim(s.val)) LIKE 'itis.helpdesk-admin%'
           OR lower(btrim(s.val)) = 'itis.hardware-support'
           OR lower(btrim(s.val)) LIKE 'itis.hardware-support.%'
      )
    )
  ORDER BY p.username NULLS LAST, p.email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.it_list_support_agents() TO authenticated, service_role;
