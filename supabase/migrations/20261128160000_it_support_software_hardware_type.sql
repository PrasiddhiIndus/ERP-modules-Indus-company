-- IT Support: Software vs Hardware support type on tickets and categories.
-- Reuses existing ticket engine (SLA, comments, attachments, RLS, notifications).
--
-- Rollback: supabase/rollbacks/20261128160000_it_support_software_hardware_type_down.sql

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.it_tickets
  ADD COLUMN IF NOT EXISTS support_type text;

ALTER TABLE public.it_ticket_categories
  ADD COLUMN IF NOT EXISTS support_type text;

UPDATE public.it_tickets
SET support_type = 'software'
WHERE support_type IS NULL;

UPDATE public.it_ticket_categories
SET support_type = 'software'
WHERE support_type IS NULL;

-- Heuristic: known physical-IT category names → hardware
UPDATE public.it_ticket_categories
SET support_type = 'hardware'
WHERE deleted_at IS NULL
  AND lower(btrim(name)) IN ('hardware', 'printer', 'networking', 'laptop/desktop', 'peripherals', 'repairs');

UPDATE public.it_tickets t
SET support_type = 'hardware'
FROM public.it_ticket_categories c
WHERE t.support_type = 'software'
  AND t.category_id = c.id
  AND c.support_type = 'hardware';

ALTER TABLE public.it_tickets
  ALTER COLUMN support_type SET DEFAULT 'software',
  ALTER COLUMN support_type SET NOT NULL;

ALTER TABLE public.it_ticket_categories
  ALTER COLUMN support_type SET DEFAULT 'software',
  ALTER COLUMN support_type SET NOT NULL;

ALTER TABLE public.it_tickets
  DROP CONSTRAINT IF EXISTS it_tickets_support_type_check;
ALTER TABLE public.it_tickets
  ADD CONSTRAINT it_tickets_support_type_check
  CHECK (support_type IN ('software', 'hardware'));

ALTER TABLE public.it_ticket_categories
  DROP CONSTRAINT IF EXISTS it_ticket_categories_support_type_check;
ALTER TABLE public.it_ticket_categories
  ADD CONSTRAINT it_ticket_categories_support_type_check
  CHECK (support_type IN ('software', 'hardware'));

CREATE INDEX IF NOT EXISTS idx_it_tickets_support_type_live
  ON public.it_tickets (support_type)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_it_ticket_categories_support_type_live
  ON public.it_ticket_categories (support_type)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.it_tickets.support_type IS
  'Queue split: software (ERP/apps) vs hardware (devices/network).';
COMMENT ON COLUMN public.it_ticket_categories.support_type IS
  'Issue types shown under Software Support or Hardware Support raise forms.';

-- ---------------------------------------------------------------------------
-- Seed / reactivate hardware issue types
-- ---------------------------------------------------------------------------

UPDATE public.it_ticket_categories
SET is_active = true,
    support_type = 'hardware',
    deleted_at = NULL,
    description = coalesce(nullif(btrim(description), ''), 'Physical IT equipment and devices')
WHERE lower(btrim(name)) IN ('hardware', 'printer')
  AND deleted_at IS NULL;

INSERT INTO public.it_ticket_categories (name, description, sort_order, is_active, support_type)
SELECT v.name, v.description, v.sort_order, true, 'hardware'
FROM (
  VALUES
    ('Laptop / Desktop', 'Workstations, laptops and related issues', 10),
    ('Networking', 'LAN, Wi-Fi, cabling and connectivity', 20),
    ('Peripherals', 'Keyboard, mouse, monitor, webcam, etc.', 30),
    ('Repairs', 'Repair / service requests for IT hardware', 40),
    ('Printer', 'Printers, scanners and print queues', 50),
    ('Hardware', 'Other hardware issues', 60)
) AS v(name, description, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.it_ticket_categories c
  WHERE c.deleted_at IS NULL AND lower(btrim(c.name)) = lower(btrim(v.name))
);

UPDATE public.it_ticket_categories
SET support_type = 'software'
WHERE deleted_at IS NULL
  AND support_type IS DISTINCT FROM 'hardware'
  AND lower(btrim(name)) NOT IN (
    'hardware', 'printer', 'networking', 'laptop/desktop', 'laptop / desktop', 'peripherals', 'repairs'
  );

INSERT INTO public.it_ticket_categories (name, description, sort_order, is_active, support_type)
SELECT v.name, v.description, v.sort_order, true, 'software'
FROM (
  VALUES
    ('Login / Access', 'Cannot sign in, password reset, account access', 70),
    ('Application bug', 'Unexpected behaviour or errors in ERP / Indus One / apps', 80),
    ('Data error', 'Incorrect or missing data in screens or reports', 90)
) AS v(name, description, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.it_ticket_categories c
  WHERE c.deleted_at IS NULL AND lower(btrim(c.name)) = lower(btrim(v.name))
);

-- ---------------------------------------------------------------------------
-- Raise masters: include support_type; optional filter
-- ---------------------------------------------------------------------------

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
    SELECT 1
    FROM public.profiles p
    WHERE p.id = v_uid
      AND COALESCE(p.is_active, true) = true
  ) THEN
    RAISE EXCEPTION 'Your account is inactive';
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

COMMENT ON FUNCTION public.it_list_raise_masters(text) IS
  'Active IT Support issue types for Raise Ticket; optional p_support_type filters software|hardware.';

GRANT EXECUTE ON FUNCTION public.it_list_raise_masters(text) TO authenticated, service_role;
-- Keep zero-arg overload for older clients
CREATE OR REPLACE FUNCTION public.it_list_raise_masters()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT public.it_list_raise_masters(NULL);
$$;

GRANT EXECUTE ON FUNCTION public.it_list_raise_masters() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Create ticket: accept support_type
-- ---------------------------------------------------------------------------

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
  IF NOT public.current_user_has_it_support_raise() THEN
    RAISE EXCEPTION 'You do not have permission to raise an IT Support ticket';
  END IF;

  IF v_support NOT IN ('software', 'hardware') THEN
    v_support := 'software';
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

GRANT EXECUTE ON FUNCTION public.it_create_ticket(
  text, text, uuid, uuid, text, text, text, text, text, uuid[], text
) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- My Tickets: include support_type (still returns both software + hardware)
-- ---------------------------------------------------------------------------

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
          t.support_type,
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
            SELECT jsonb_build_object('id', c.id, 'name', c.name, 'support_type', c.support_type)
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
