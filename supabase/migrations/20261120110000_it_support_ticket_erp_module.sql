-- IT Support: capture ERP module + sub-module on raise (for triage / reporting).

ALTER TABLE public.it_tickets
  ADD COLUMN IF NOT EXISTS erp_module_key text,
  ADD COLUMN IF NOT EXISTS erp_module_label text,
  ADD COLUMN IF NOT EXISTS erp_submodule_key text,
  ADD COLUMN IF NOT EXISTS erp_submodule_label text;

CREATE INDEX IF NOT EXISTS idx_it_tickets_erp_module
  ON public.it_tickets (erp_module_key)
  WHERE deleted_at IS NULL AND erp_module_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_it_tickets_erp_submodule
  ON public.it_tickets (erp_submodule_key)
  WHERE deleted_at IS NULL AND erp_submodule_key IS NOT NULL;

COMMENT ON COLUMN public.it_tickets.erp_module_key IS
  'ERP module key from User Management tree (e.g. hr, projects) where the issue occurred.';
COMMENT ON COLUMN public.it_tickets.erp_submodule_key IS
  'ERP sub-module key (e.g. hr.attendance) where the issue occurred.';

-- Replace create-ticket RPC with module/sub-module args (drop prior signatures).
DROP FUNCTION IF EXISTS public.it_create_ticket(text, text, uuid, uuid, text);
DROP FUNCTION IF EXISTS public.it_create_ticket(text, text, uuid, uuid, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.it_create_ticket(
  p_title text,
  p_description text,
  p_category_id uuid DEFAULT NULL,
  p_subcategory_id uuid DEFAULT NULL,
  p_impact text DEFAULT 'only_me',
  p_erp_module_key text DEFAULT NULL,
  p_erp_module_label text DEFAULT NULL,
  p_erp_submodule_key text DEFAULT NULL,
  p_erp_submodule_label text DEFAULT NULL
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

GRANT EXECUTE ON FUNCTION public.it_create_ticket(text, text, uuid, uuid, text, text, text, text, text)
  TO authenticated, service_role;
