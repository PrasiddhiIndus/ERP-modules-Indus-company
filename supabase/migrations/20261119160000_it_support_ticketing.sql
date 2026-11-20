-- ============================================================
-- IT Support ticketing (flat IT queue — no L1/L2/L3)
-- Tables, RLS, RPCs, SLA/auto-close jobs, seed from real people
-- ============================================================

-- ── Access helpers ───────────────────────────────────────────

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
  );
$$;

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
      AND (
        replace(lower(btrim(coalesce(p.role, ''))), ' ', '_') IN (
          'super_admin', 'super_admin_pro', 'superadmin', 'superadmin_pro'
        )
        OR lower(btrim(coalesce(p.team, ''))) IN (
          'itis', 'it_is', 'it/is', 'it-is', 'information system', 'information systems'
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

COMMENT ON FUNCTION public.current_user_has_it_support_raise() IS
  'IT Support: any active signed-in user can raise tickets and see their own.';
COMMENT ON FUNCTION public.current_user_is_it_support_agent() IS
  'IT Support: agent or admin — full queue access.';
COMMENT ON FUNCTION public.current_user_is_it_support_admin() IS
  'IT Support: admin — masters, reports, SLA alerts.';

GRANT EXECUTE ON FUNCTION public.current_user_has_it_support_raise() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_is_it_support_agent() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_is_it_support_admin() TO authenticated, service_role;

-- ── Masters ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.it_ticket_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text,
  sort_order  int NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_it_ticket_categories_name_live
  ON public.it_ticket_categories (lower(btrim(name)))
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.it_ticket_subcategories (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id  uuid NOT NULL REFERENCES public.it_ticket_categories(id),
  name         text NOT NULL,
  description  text,
  sort_order   int NOT NULL DEFAULT 0,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_it_ticket_subcategories_cat_name_live
  ON public.it_ticket_subcategories (category_id, lower(btrim(name)))
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.it_sla_rules (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text NOT NULL DEFAULT '',
  impact               text CHECK (impact IS NULL OR impact IN ('only_me', 'my_team', 'whole_office')),
  priority             text NOT NULL CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  first_response_mins  int NOT NULL,
  resolution_mins      int NOT NULL,
  is_active            boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_it_sla_rules_priority_live
  ON public.it_sla_rules (priority)
  WHERE deleted_at IS NULL AND is_active = true;

CREATE TABLE IF NOT EXISTS public.it_ticket_number_seq (
  year       int PRIMARY KEY,
  last_value int NOT NULL DEFAULT 0
);

-- ── Tickets ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.it_tickets (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_no               text NOT NULL,
  title                   text NOT NULL,
  description             text NOT NULL DEFAULT '',
  category_id             uuid REFERENCES public.it_ticket_categories(id),
  subcategory_id          uuid REFERENCES public.it_ticket_subcategories(id),
  requester_id            uuid NOT NULL REFERENCES public.profiles(id),
  requester_employee_code text,
  requester_department    text,
  requester_display_name  text,
  assignee_display_name   text,
  impact                  text NOT NULL DEFAULT 'only_me'
                          CHECK (impact IN ('only_me', 'my_team', 'whole_office')),
  priority                text CHECK (priority IS NULL OR priority IN ('critical', 'high', 'medium', 'low')),
  status                  text NOT NULL DEFAULT 'new'
                          CHECK (status IN (
                            'new', 'open', 'in_progress', 'on_hold',
                            'resolved', 'closed', 'reopened'
                          )),
  assignee_id             uuid REFERENCES public.profiles(id),
  first_response_due_at   timestamptz,
  resolution_due_at       timestamptz,
  first_responded_at      timestamptz,
  sla_paused_at           timestamptz,
  sla_paused_total_mins   int NOT NULL DEFAULT 0,
  first_response_breached boolean NOT NULL DEFAULT false,
  resolution_breached     boolean NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  resolved_at             timestamptz,
  closed_at               timestamptz,
  reopen_deadline_at      timestamptz,
  auto_close_at           timestamptz,
  deleted_at              timestamptz,
  last_status_remark      text
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_it_tickets_ticket_no_live
  ON public.it_tickets (ticket_no) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_it_tickets_requester
  ON public.it_tickets (requester_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_it_tickets_assignee
  ON public.it_tickets (assignee_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_it_tickets_status
  ON public.it_tickets (status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_it_tickets_priority
  ON public.it_tickets (priority) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_it_tickets_created
  ON public.it_tickets (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_it_tickets_sla_breach
  ON public.it_tickets (resolution_breached, first_response_breached)
  WHERE deleted_at IS NULL AND status NOT IN ('closed');

CREATE TABLE IF NOT EXISTS public.it_ticket_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   uuid NOT NULL REFERENCES public.it_tickets(id) ON DELETE CASCADE,
  event_type  text NOT NULL,
  from_value  text,
  to_value    text,
  remark      text,
  actor_id    uuid REFERENCES public.profiles(id),
  is_internal boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_it_ticket_history_ticket
  ON public.it_ticket_history (ticket_id, created_at);

CREATE TABLE IF NOT EXISTS public.it_ticket_comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   uuid NOT NULL REFERENCES public.it_tickets(id) ON DELETE CASCADE,
  author_id   uuid NOT NULL REFERENCES public.profiles(id),
  body        text NOT NULL,
  is_internal boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

CREATE INDEX IF NOT EXISTS idx_it_ticket_comments_ticket
  ON public.it_ticket_comments (ticket_id, created_at)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.it_ticket_attachments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id    uuid NOT NULL REFERENCES public.it_tickets(id) ON DELETE CASCADE,
  comment_id   uuid REFERENCES public.it_ticket_comments(id),
  uploaded_by  uuid NOT NULL REFERENCES public.profiles(id),
  file_name    text NOT NULL,
  content_type text,
  size_bytes   bigint NOT NULL DEFAULT 0,
  -- Cloudflare R2 object key (same value in file_path + r2_key for house style)
  file_path    text NOT NULL DEFAULT '',
  r2_key       text NOT NULL DEFAULT '',
  storage      text NOT NULL DEFAULT 'r2' CHECK (storage IN ('r2')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);

CREATE INDEX IF NOT EXISTS idx_it_ticket_attachments_ticket
  ON public.it_ticket_attachments (ticket_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.it_notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.profiles(id),
  ticket_id  uuid REFERENCES public.it_tickets(id) ON DELETE SET NULL,
  type       text NOT NULL DEFAULT 'info',
  title      text NOT NULL,
  body       text,
  is_read    boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_it_notifications_user
  ON public.it_notifications (user_id, is_read, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.it_notify_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id    uuid REFERENCES public.it_tickets(id) ON DELETE SET NULL,
  event_type   text NOT NULL,
  recipient    text NOT NULL,
  payload_hash text NOT NULL DEFAULT '',
  sent_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ticket_id, event_type, recipient, payload_hash)
);

-- ── Ticket number allocator ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.it_allocate_ticket_no()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_year int := EXTRACT(YEAR FROM now())::int;
  v_next int;
BEGIN
  INSERT INTO public.it_ticket_number_seq (year, last_value)
  VALUES (v_year, 1)
  ON CONFLICT (year) DO UPDATE
    SET last_value = public.it_ticket_number_seq.last_value + 1
  RETURNING last_value INTO v_next;

  RETURN format('IT-%s-%s', v_year::text, lpad(v_next::text, 5, '0'));
END;
$$;

GRANT EXECUTE ON FUNCTION public.it_allocate_ticket_no() TO authenticated, service_role;

-- ── Create ticket RPC ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.it_create_ticket(
  p_title text,
  p_description text,
  p_category_id uuid DEFAULT NULL,
  p_subcategory_id uuid DEFAULT NULL,
  p_impact text DEFAULT 'only_me'
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

  -- Department snapshot from employee master when linked
  SELECT NULLIF(btrim(em.department), '')
    INTO v_dept
  FROM public.admin_ifsp_employee_master em
  WHERE v_profile.employee_code IS NOT NULL
    AND lower(btrim(em.employee_code)) = lower(btrim(v_profile.employee_code))
  LIMIT 1;

  INSERT INTO public.it_tickets (
    ticket_no, title, description, category_id, subcategory_id,
    requester_id, requester_employee_code, requester_department, requester_display_name,
    impact, status
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
    'new'
  )
  RETURNING * INTO v_row;

  INSERT INTO public.it_ticket_history (ticket_id, event_type, to_value, remark, actor_id)
  VALUES (v_row.id, 'created', 'new', 'Ticket raised', v_uid);

  -- Notify agents / admins (profiles with agent or admin grant, or full itIs)
  INSERT INTO public.it_notifications (user_id, ticket_id, type, title, body)
  SELECT p.id, v_row.id, 'created',
         format('New ticket %s', v_row.ticket_no),
         left(v_row.title, 200)
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

  -- Confirm to requester
  INSERT INTO public.it_notifications (user_id, ticket_id, type, title, body)
  VALUES (
    v_uid, v_row.id, 'created',
    format('Ticket %s submitted', v_row.ticket_no),
    'IT Support has received your request.'
  );

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.it_create_ticket(text, text, uuid, uuid, text) TO authenticated, service_role;

-- ── Apply SLA when priority is set ───────────────────────────

CREATE OR REPLACE FUNCTION public.it_apply_sla_for_ticket(p_ticket_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_t public.it_tickets%ROWTYPE;
  v_rule public.it_sla_rules%ROWTYPE;
  v_base timestamptz;
BEGIN
  SELECT * INTO v_t FROM public.it_tickets WHERE id = p_ticket_id AND deleted_at IS NULL;
  IF v_t.id IS NULL OR v_t.priority IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO v_rule
  FROM public.it_sla_rules
  WHERE priority = v_t.priority
    AND deleted_at IS NULL
    AND is_active = true
  ORDER BY created_at
  LIMIT 1;

  IF v_rule.id IS NULL THEN
    RETURN;
  END IF;

  v_base := coalesce(v_t.created_at, now());

  UPDATE public.it_tickets
  SET
    first_response_due_at = CASE
      WHEN first_responded_at IS NULL THEN v_base + make_interval(mins => v_rule.first_response_mins)
      ELSE first_response_due_at
    END,
    resolution_due_at = v_base
      + make_interval(mins => v_rule.resolution_mins)
      + make_interval(mins => coalesce(sla_paused_total_mins, 0)),
    updated_at = now()
  WHERE id = p_ticket_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.it_apply_sla_for_ticket(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.it_tickets_before_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_pause_mins int;
BEGIN
  NEW.updated_at := now();

  -- Keep assignee display name in sync (employees cannot always join profiles under RLS)
  IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN
    IF NEW.assignee_id IS NULL THEN
      NEW.assignee_display_name := NULL;
    ELSE
      SELECT coalesce(nullif(btrim(p.username), ''), split_part(coalesce(p.email, ''), '@', 1))
        INTO NEW.assignee_display_name
      FROM public.profiles p
      WHERE p.id = NEW.assignee_id;
    END IF;
  END IF;

  -- First response when leaving new / first agent touch
  IF OLD.first_responded_at IS NULL
     AND NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('open', 'in_progress', 'on_hold', 'resolved') THEN
    NEW.first_responded_at := now();
  END IF;

  -- Pause SLA on hold
  IF NEW.status = 'on_hold' AND OLD.status IS DISTINCT FROM 'on_hold' THEN
    NEW.sla_paused_at := coalesce(NEW.sla_paused_at, now());
  END IF;

  -- Resume: accumulate paused minutes
  IF OLD.status = 'on_hold' AND NEW.status IS DISTINCT FROM 'on_hold' AND OLD.sla_paused_at IS NOT NULL THEN
    v_pause_mins := GREATEST(0, floor(EXTRACT(EPOCH FROM (now() - OLD.sla_paused_at)) / 60)::int);
    NEW.sla_paused_total_mins := coalesce(OLD.sla_paused_total_mins, 0) + v_pause_mins;
    NEW.sla_paused_at := NULL;
    IF NEW.resolution_due_at IS NOT NULL THEN
      NEW.resolution_due_at := NEW.resolution_due_at + make_interval(mins => v_pause_mins);
    END IF;
    IF NEW.first_response_due_at IS NOT NULL AND NEW.first_responded_at IS NULL THEN
      NEW.first_response_due_at := NEW.first_response_due_at + make_interval(mins => v_pause_mins);
    END IF;
  END IF;

  -- Resolved → set reopen / auto-close windows
  IF NEW.status = 'resolved' AND OLD.status IS DISTINCT FROM 'resolved' THEN
    NEW.resolved_at := coalesce(NEW.resolved_at, now());
    NEW.reopen_deadline_at := NEW.resolved_at + interval '7 days';
    NEW.auto_close_at := NEW.resolved_at + interval '3 days';
  END IF;

  IF NEW.status = 'closed' AND OLD.status IS DISTINCT FROM 'closed' THEN
    NEW.closed_at := coalesce(NEW.closed_at, now());
  END IF;

  IF NEW.status = 'reopened' THEN
    NEW.resolved_at := NULL;
    NEW.closed_at := NULL;
    NEW.reopen_deadline_at := NULL;
    NEW.auto_close_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_it_tickets_before_update ON public.it_tickets;
CREATE TRIGGER trg_it_tickets_before_update
  BEFORE UPDATE ON public.it_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.it_tickets_before_update();

CREATE OR REPLACE FUNCTION public.it_tickets_after_priority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  IF NEW.priority IS DISTINCT FROM OLD.priority AND NEW.priority IS NOT NULL THEN
    PERFORM public.it_apply_sla_for_ticket(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_it_tickets_after_priority ON public.it_tickets;
CREATE TRIGGER trg_it_tickets_after_priority
  AFTER UPDATE OF priority ON public.it_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.it_tickets_after_priority();

-- ── SLA breach + auto-close (for pg_cron / edge function) ────

CREATE OR REPLACE FUNCTION public.it_process_sla_and_autoclose()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_breached_fr int := 0;
  v_breached_res int := 0;
  v_closed int := 0;
  r record;
BEGIN
  -- First-response breaches
  FOR r IN
    SELECT t.id, t.ticket_no, t.assignee_id, t.title
    FROM public.it_tickets t
    WHERE t.deleted_at IS NULL
      AND t.status NOT IN ('closed', 'resolved', 'on_hold')
      AND t.first_responded_at IS NULL
      AND t.first_response_due_at IS NOT NULL
      AND t.first_response_due_at < now()
      AND t.first_response_breached = false
      AND t.sla_paused_at IS NULL
  LOOP
    UPDATE public.it_tickets
    SET first_response_breached = true, updated_at = now()
    WHERE id = r.id;
    v_breached_fr := v_breached_fr + 1;

    INSERT INTO public.it_notifications (user_id, ticket_id, type, title, body)
    SELECT p.id, r.id, 'sla_breach',
           format('SLA breach (first response): %s', r.ticket_no),
           left(coalesce(r.title, ''), 200)
    FROM public.profiles p
    WHERE p.id = r.assignee_id
       OR replace(lower(btrim(coalesce(p.role, ''))), ' ', '_') IN ('super_admin', 'super_admin_pro')
       OR COALESCE(p.allowed_modules, '[]'::jsonb) ? 'itIs'
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements_text(COALESCE(p.allowed_sub_modules, '[]'::jsonb)) s(val)
         WHERE lower(btrim(s.val)) IN ('itis.helpdesk-admin')
            OR lower(btrim(s.val)) LIKE 'itis.helpdesk-admin%'
       );
  END LOOP;

  -- Resolution breaches
  FOR r IN
    SELECT t.id, t.ticket_no, t.assignee_id, t.title
    FROM public.it_tickets t
    WHERE t.deleted_at IS NULL
      AND t.status NOT IN ('closed', 'resolved', 'on_hold')
      AND t.resolution_due_at IS NOT NULL
      AND t.resolution_due_at < now()
      AND t.resolution_breached = false
      AND t.sla_paused_at IS NULL
  LOOP
    UPDATE public.it_tickets
    SET resolution_breached = true, updated_at = now()
    WHERE id = r.id;
    v_breached_res := v_breached_res + 1;

    INSERT INTO public.it_notifications (user_id, ticket_id, type, title, body)
    SELECT p.id, r.id, 'sla_breach',
           format('SLA breach (resolution): %s', r.ticket_no),
           left(coalesce(r.title, ''), 200)
    FROM public.profiles p
    WHERE p.id = r.assignee_id
       OR replace(lower(btrim(coalesce(p.role, ''))), ' ', '_') IN ('super_admin', 'super_admin_pro')
       OR COALESCE(p.allowed_modules, '[]'::jsonb) ? 'itIs'
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements_text(COALESCE(p.allowed_sub_modules, '[]'::jsonb)) s(val)
         WHERE lower(btrim(s.val)) IN ('itis.helpdesk-admin')
            OR lower(btrim(s.val)) LIKE 'itis.helpdesk-admin%'
       );
  END LOOP;

  -- Auto-close resolved tickets after 3 days with no reopen
  FOR r IN
    SELECT t.id, t.ticket_no, t.requester_id
    FROM public.it_tickets t
    WHERE t.deleted_at IS NULL
      AND t.status = 'resolved'
      AND t.auto_close_at IS NOT NULL
      AND t.auto_close_at <= now()
  LOOP
    UPDATE public.it_tickets
    SET status = 'closed',
        closed_at = now(),
        last_status_remark = 'Auto-closed after 3 days with no response',
        updated_at = now()
    WHERE id = r.id;

    INSERT INTO public.it_ticket_history (ticket_id, event_type, from_value, to_value, remark, actor_id)
    VALUES (r.id, 'status', 'resolved', 'closed', 'Auto-closed after 3 days with no response', NULL);

    INSERT INTO public.it_notifications (user_id, ticket_id, type, title, body)
    VALUES (
      r.requester_id, r.id, 'closed',
      format('Ticket %s closed', r.ticket_no),
      'This ticket was closed automatically because there was no response for 3 days after it was marked resolved.'
    );

    v_closed := v_closed + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'first_response_breaches', v_breached_fr,
    'resolution_breaches', v_breached_res,
    'auto_closed', v_closed,
    'ran_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.it_process_sla_and_autoclose() TO service_role;

-- Agent directory for assign dropdown (SECURITY DEFINER — profiles are otherwise self-only)
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
  IF NOT public.current_user_is_it_support_agent() THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  RETURN QUERY
  SELECT p.id, p.username, p.email, p.employee_code, p.role
  FROM public.profiles p
  WHERE coalesce(p.is_active, true) = true
    AND (
      replace(lower(btrim(coalesce(p.role, ''))), ' ', '_') IN ('super_admin', 'super_admin_pro')
      OR COALESCE(p.allowed_modules, '[]'::jsonb) ? 'itIs'
      OR COALESCE(p.allowed_modules, '[]'::jsonb) ? 'itis'
      OR lower(btrim(coalesce(p.team, ''))) IN (
        'itis', 'it_is', 'it/is', 'it-is', 'information system', 'information systems'
      )
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(COALESCE(p.allowed_sub_modules, '[]'::jsonb)) s(val)
        WHERE lower(btrim(s.val)) IN ('itis.helpdesk-agent', 'itis.helpdesk-admin')
           OR lower(btrim(s.val)) LIKE 'itis.helpdesk-agent%'
           OR lower(btrim(s.val)) LIKE 'itis.helpdesk-admin%'
      )
      OR EXISTS (
        SELECT 1
        FROM public.admin_ifsp_employee_master em
        WHERE p.employee_code IS NOT NULL
          AND lower(btrim(em.employee_code)) = lower(btrim(p.employee_code))
          AND lower(btrim(coalesce(em.department, ''))) IN (
            'information system', 'information systems', 'it/is', 'it'
          )
      )
    )
  ORDER BY p.username NULLS LAST, p.email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.it_list_support_agents() TO authenticated, service_role;

-- Optional pg_cron every 5 minutes
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('it-support-sla-autoclose');
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    PERFORM cron.schedule(
      'it-support-sla-autoclose',
      '*/5 * * * *',
      $cron$SELECT public.it_process_sla_and_autoclose();$cron$
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'it_support: pg_cron schedule skipped (%). Deploy edge function it-support-sla-cron instead.',
      SQLERRM;
END;
$$;

-- ── RLS ──────────────────────────────────────────────────────

ALTER TABLE public.it_ticket_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.it_ticket_subcategories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.it_sla_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.it_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.it_ticket_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.it_ticket_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.it_ticket_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.it_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.it_notify_log ENABLE ROW LEVEL SECURITY;

-- Categories / subcategories / SLA: readable by anyone with raise+; write admin
DROP POLICY IF EXISTS it_ticket_categories_select ON public.it_ticket_categories;
CREATE POLICY it_ticket_categories_select ON public.it_ticket_categories
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND public.current_user_has_it_support_raise());

DROP POLICY IF EXISTS it_ticket_categories_write ON public.it_ticket_categories;
CREATE POLICY it_ticket_categories_write ON public.it_ticket_categories
  FOR ALL TO authenticated
  USING (public.current_user_is_it_support_admin())
  WITH CHECK (public.current_user_is_it_support_admin());

DROP POLICY IF EXISTS it_ticket_subcategories_select ON public.it_ticket_subcategories;
CREATE POLICY it_ticket_subcategories_select ON public.it_ticket_subcategories
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND public.current_user_has_it_support_raise());

DROP POLICY IF EXISTS it_ticket_subcategories_write ON public.it_ticket_subcategories;
CREATE POLICY it_ticket_subcategories_write ON public.it_ticket_subcategories
  FOR ALL TO authenticated
  USING (public.current_user_is_it_support_admin())
  WITH CHECK (public.current_user_is_it_support_admin());

DROP POLICY IF EXISTS it_sla_rules_select ON public.it_sla_rules;
CREATE POLICY it_sla_rules_select ON public.it_sla_rules
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND public.current_user_has_it_support_raise());

DROP POLICY IF EXISTS it_sla_rules_write ON public.it_sla_rules;
CREATE POLICY it_sla_rules_write ON public.it_sla_rules
  FOR ALL TO authenticated
  USING (public.current_user_is_it_support_admin())
  WITH CHECK (public.current_user_is_it_support_admin());

-- Tickets: employees own rows; agents all
DROP POLICY IF EXISTS it_tickets_select ON public.it_tickets;
CREATE POLICY it_tickets_select ON public.it_tickets
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      public.current_user_is_it_support_agent()
      OR requester_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS it_tickets_insert ON public.it_tickets;
CREATE POLICY it_tickets_insert ON public.it_tickets
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_has_it_support_raise()
    AND requester_id = auth.uid()
  );

DROP POLICY IF EXISTS it_tickets_update ON public.it_tickets;
CREATE POLICY it_tickets_update ON public.it_tickets
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      public.current_user_is_it_support_agent()
      OR requester_id = auth.uid()
    )
  )
  WITH CHECK (
    public.current_user_is_it_support_agent()
    OR requester_id = auth.uid()
  );

-- Soft delete only via agent/admin update of deleted_at
DROP POLICY IF EXISTS it_tickets_delete ON public.it_tickets;
CREATE POLICY it_tickets_delete ON public.it_tickets
  FOR DELETE TO authenticated
  USING (public.current_user_is_it_support_admin());

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
        )
    )
    AND (is_internal = false OR public.current_user_is_it_support_agent())
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
          public.current_user_is_it_support_agent()
          OR t.requester_id = auth.uid()
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
          public.current_user_is_it_support_agent()
          OR t.requester_id = auth.uid()
        )
    )
    AND (is_internal = false OR public.current_user_is_it_support_agent())
  );

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
          OR (t.requester_id = auth.uid() AND is_internal = false)
        )
    )
  );

DROP POLICY IF EXISTS it_ticket_comments_update ON public.it_ticket_comments;
CREATE POLICY it_ticket_comments_update ON public.it_ticket_comments
  FOR UPDATE TO authenticated
  USING (
    public.current_user_is_it_support_agent()
    OR author_id = auth.uid()
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
        )
    )
  );

DROP POLICY IF EXISTS it_ticket_attachments_insert ON public.it_ticket_attachments;
CREATE POLICY it_ticket_attachments_insert ON public.it_ticket_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.it_tickets t
      WHERE t.id = ticket_id
        AND t.deleted_at IS NULL
        AND (
          public.current_user_is_it_support_agent()
          OR t.requester_id = auth.uid()
        )
    )
  );

DROP POLICY IF EXISTS it_ticket_attachments_update ON public.it_ticket_attachments;
CREATE POLICY it_ticket_attachments_update ON public.it_ticket_attachments
  FOR UPDATE TO authenticated
  USING (public.current_user_is_it_support_agent() OR uploaded_by = auth.uid());

DROP POLICY IF EXISTS it_notifications_select ON public.it_notifications;
CREATE POLICY it_notifications_select ON public.it_notifications
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND user_id = auth.uid());

DROP POLICY IF EXISTS it_notifications_update ON public.it_notifications;
CREATE POLICY it_notifications_update ON public.it_notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS it_notifications_insert ON public.it_notifications;
CREATE POLICY it_notifications_insert ON public.it_notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_is_it_support_agent()
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS it_notify_log_all ON public.it_notify_log;
CREATE POLICY it_notify_log_all ON public.it_notify_log
  FOR ALL TO authenticated
  USING (public.current_user_is_it_support_admin())
  WITH CHECK (public.current_user_is_it_support_admin());

GRANT SELECT, INSERT, UPDATE ON public.it_ticket_categories TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.it_ticket_subcategories TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.it_sla_rules TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.it_tickets TO authenticated;
GRANT SELECT, INSERT ON public.it_ticket_history TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.it_ticket_comments TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.it_ticket_attachments TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.it_notifications TO authenticated;
GRANT SELECT, INSERT ON public.it_notify_log TO authenticated;
GRANT ALL ON public.it_ticket_number_seq TO service_role;

-- ── Masters only (no sample tickets — start clean) ───────────

INSERT INTO public.it_ticket_categories (name, description, sort_order)
SELECT v.name, v.description, v.sort_order
FROM (VALUES
  ('Hardware', 'Laptops, desktops, peripherals', 1),
  ('Software', 'Applications and installs', 2),
  ('Network/Internet', 'Connectivity and Wi‑Fi', 3),
  ('Email', 'Outlook / mailbox issues', 4),
  ('Access/Password', 'Logins, VPN, account unlock', 5),
  ('Printer', 'Print / scan devices', 6),
  ('ERP', 'Company ERP modules', 7),
  ('Other', 'Anything else', 8)
) AS v(name, description, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.it_ticket_categories c
  WHERE lower(btrim(c.name)) = lower(v.name) AND c.deleted_at IS NULL
);

INSERT INTO public.it_sla_rules (name, priority, first_response_mins, resolution_mins)
SELECT v.name, v.priority, v.fr, v.res
FROM (VALUES
  ('Critical', 'critical', 30, 240),
  ('High', 'high', 120, 480),
  ('Medium', 'medium', 240, 2880),
  ('Low', 'low', 1440, 7200)
) AS v(name, priority, fr, res)
WHERE NOT EXISTS (
  SELECT 1 FROM public.it_sla_rules r
  WHERE r.priority = v.priority AND r.deleted_at IS NULL
);
