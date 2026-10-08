-- =============================================================================
-- Rules Console — Phase 1 follow-up: group priority + get_rule() returns source.
--
-- Rollback: supabase/rollbacks/20261008130000_admin_rules_console_group_priority_down.sql
--
-- * admin_rule_groups.priority: higher wins when an employee is in several
--   groups that set the same rule. Unique among active groups, editable.
--   Existing groups get priorities in creation order (newest highest), so
--   results are the same as the previous "most recently created" tie-break.
-- * get_rule(employee, rule, date) now returns value + source level + source id
--   (+ label, value row id). get_rule_value() returns just the value.
--   get_rule_detail() is replaced by get_rule().
-- No other table is touched; the C/O engine does not use these functions.
-- =============================================================================

ALTER TABLE public.admin_rule_groups ADD COLUMN IF NOT EXISTS priority integer;

UPDATE public.admin_rule_groups g
SET priority = s.rn * 10
FROM (SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn FROM public.admin_rule_groups) s
WHERE g.id = s.id AND g.priority IS NULL;

ALTER TABLE public.admin_rule_groups
  ALTER COLUMN priority SET NOT NULL,
  ADD CONSTRAINT admin_rule_groups_priority_check CHECK (priority BETWEEN 1 AND 100000);

CREATE UNIQUE INDEX IF NOT EXISTS admin_rule_groups_priority_active_idx
  ON public.admin_rule_groups (priority) WHERE is_active;

-- -----------------------------------------------------------------------------
-- Resolver
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_rules_bulk(text[], text[], date, date);
DROP FUNCTION IF EXISTS public.get_rule(text, text, date);
DROP FUNCTION IF EXISTS public.get_rule_detail(text, text, date);

-- Value for one employee on one date, and the level that supplied it.
-- source_scope: employee | group | department | company | default
CREATE FUNCTION public.get_rule(
  p_employee_code text,
  p_rule_key text,
  p_on date DEFAULT NULL
)
RETURNS TABLE (value jsonb, source_scope text, source_id text, source_label text, value_id bigint)
LANGUAGE sql
STABLE
AS $$
  WITH ctx AS (
    SELECT public.admin_rule_norm_employee(p_employee_code) AS emp,
           coalesce(p_on, current_date) AS d
  ),
  emp AS (
    SELECT public.admin_rule_norm_department(m.department) AS dept_key
    FROM public.admin_ifsp_employee_master m, ctx
    WHERE ctx.emp IS NOT NULL
      AND public.normalize_attendance_employee_code(m.employee_code) = ctx.emp
    LIMIT 1
  ),
  latest AS (
    SELECT DISTINCT ON (v.scope_type, v.scope_id)
      v.id, v.scope_type, v.scope_id, v.scope_label, v.value
    FROM public.admin_attendance_rule_values v, ctx
    WHERE v.rule_key = p_rule_key
      AND v.status = 'active'
      AND v.effective_from <= ctx.d
    ORDER BY v.scope_type, v.scope_id, v.effective_from DESC, v.id DESC
  ),
  my_groups AS (
    SELECT g.id::text AS gid, g.name, g.priority
    FROM public.admin_rule_groups g, ctx
    WHERE g.is_active
      AND ctx.emp IS NOT NULL
      AND (
        EXISTS (
          SELECT 1 FROM public.admin_rule_group_members gm
          WHERE gm.group_id = g.id AND gm.employee_code = ctx.emp
        )
        OR EXISTS (
          SELECT 1 FROM emp, unnest(g.match_departments) md
          WHERE emp.dept_key IS NOT NULL AND public.admin_rule_norm_department(md) = emp.dept_key
        )
      )
  ),
  candidates AS (
    SELECT l.value, 'employee'::text AS scope, l.scope_id, l.scope_label, l.id, 1 AS rank, NULL::integer AS priority
    FROM latest l, ctx
    WHERE l.scope_type = 'employee' AND l.scope_id = ctx.emp AND l.value IS NOT NULL
    UNION ALL
    SELECT l.value, 'group', l.scope_id, g.name, l.id, 2, g.priority
    FROM latest l JOIN my_groups g ON g.gid = l.scope_id
    WHERE l.scope_type = 'group' AND l.value IS NOT NULL
    UNION ALL
    SELECT l.value, 'department', l.scope_id, l.scope_label, l.id, 3, NULL
    FROM latest l, emp
    WHERE l.scope_type = 'department' AND l.scope_id = emp.dept_key AND l.value IS NOT NULL
    UNION ALL
    SELECT l.value, 'company', NULL, NULL, l.id, 4, NULL
    FROM latest l
    WHERE l.scope_type = 'company'
    UNION ALL
    SELECT r.default_value, 'default', NULL, NULL, NULL, 5, NULL
    FROM public.admin_attendance_rules r
    WHERE r.rule_key = p_rule_key
  )
  SELECT c.value, c.scope, c.scope_id, c.scope_label, c.id
  FROM candidates c
  ORDER BY c.rank, c.priority DESC NULLS LAST
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_rule_value(
  p_employee_code text,
  p_rule_key text,
  p_on date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT r.value FROM public.get_rule(p_employee_code, p_rule_key, p_on) r;
$$;

CREATE FUNCTION public.get_rules_bulk(
  p_employee_codes text[],
  p_rule_keys text[],
  p_from date,
  p_to date
)
RETURNS TABLE (employee_code text, rule_key text, on_date date, value jsonb, source_scope text, source_id text, source_label text)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN
    RAISE EXCEPTION 'Choose a valid date range.' USING ERRCODE = '22023';
  END IF;
  IF p_to - p_from > 62 THEN
    RAISE EXCEPTION 'Date range can be at most 63 days.' USING ERRCODE = '22023';
  END IF;
  IF coalesce(array_length(p_employee_codes, 1), 0) > 3000 THEN
    RAISE EXCEPTION 'Too many employees in one request.' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT e.code, k.key, d.day::date, r.value, r.source_scope, r.source_id, r.source_label
  FROM unnest(p_employee_codes) AS e(code)
  CROSS JOIN unnest(p_rule_keys) AS k(key)
  CROSS JOIN generate_series(p_from, p_to, interval '1 day') AS d(day)
  CROSS JOIN LATERAL public.get_rule(e.code, k.key, d.day::date) AS r;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_rule(text, text, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_rule_value(text, text, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_rules_bulk(text[], text[], date, date) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Group save with priority (NULL = keep; new groups go on top)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_rule_group_save(uuid, text, text, text, text[], text);

CREATE FUNCTION public.admin_rule_group_save(
  p_id uuid,
  p_name text,
  p_kind text,
  p_description text,
  p_match_departments text[],
  p_reason text,
  p_priority integer DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid := p_id;
  v_name text := btrim(coalesce(p_name, ''));
  v_kind text := coalesce(nullif(btrim(p_kind), ''), 'custom');
  v_depts text[];
  v_before jsonb;
  v_priority integer := p_priority;
  v_clash text;
BEGIN
  IF NOT public.admin_rules_can_edit() THEN
    RAISE EXCEPTION 'Only admins can change groups.' USING ERRCODE = '42501';
  END IF;
  IF length(v_name) < 2 THEN
    RAISE EXCEPTION 'Enter a group name.' USING ERRCODE = '22023';
  END IF;
  IF v_kind NOT IN ('grade', 'custom') THEN
    RAISE EXCEPTION 'Choose a group type.' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Enter a reason for the change.' USING ERRCODE = '22023';
  END IF;
  IF v_priority IS NOT NULL AND v_priority NOT BETWEEN 1 AND 100000 THEN
    RAISE EXCEPTION 'Priority must be between 1 and 100000.' USING ERRCODE = '22023';
  END IF;

  -- One entry per department (first spelling kept), in the order given.
  SELECT coalesce(array_agg(s.name ORDER BY s.pos), '{}') INTO v_depts
  FROM (
    SELECT DISTINCT ON (public.admin_rule_norm_department(d)) btrim(d) AS name, pos
    FROM unnest(coalesce(p_match_departments, '{}')) WITH ORDINALITY AS u(d, pos)
    WHERE public.admin_rule_norm_department(d) IS NOT NULL
    ORDER BY public.admin_rule_norm_department(d), pos
  ) s;

  IF EXISTS (
    SELECT 1 FROM public.admin_rule_groups g
    WHERE g.is_active AND lower(btrim(g.name)) = lower(v_name) AND g.id IS DISTINCT FROM v_id
  ) THEN
    RAISE EXCEPTION 'A group with this name already exists.' USING ERRCODE = '22023';
  END IF;

  IF v_id IS NOT NULL THEN
    SELECT to_jsonb(g) INTO v_before FROM public.admin_rule_groups g WHERE g.id = v_id AND g.is_active;
    IF v_before IS NULL THEN
      RAISE EXCEPTION 'This group was not found.' USING ERRCODE = '22023';
    END IF;
    v_priority := coalesce(v_priority, (v_before ->> 'priority')::integer);
  ELSE
    v_priority := coalesce(
      v_priority,
      (SELECT coalesce(max(priority), 0) + 10 FROM public.admin_rule_groups WHERE is_active)
    );
  END IF;

  SELECT g.name INTO v_clash
  FROM public.admin_rule_groups g
  WHERE g.is_active AND g.priority = v_priority AND g.id IS DISTINCT FROM v_id;
  IF v_clash IS NOT NULL THEN
    RAISE EXCEPTION 'Priority % is already used by "%".', v_priority, v_clash USING ERRCODE = '22023';
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.admin_rule_groups (name, kind, description, match_departments, priority, created_by_name)
    VALUES (v_name, v_kind, btrim(coalesce(p_description, '')), v_depts, v_priority, public.admin_rules_actor_name())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.admin_rule_groups
    SET name = v_name, kind = v_kind, description = btrim(coalesce(p_description, '')),
        match_departments = v_depts, priority = v_priority, updated_at = now()
    WHERE id = v_id;
  END IF;

  INSERT INTO public.admin_rules_events (event_type, target_id, target_label, details, reason, created_by_name)
  VALUES (CASE WHEN p_id IS NULL THEN 'group_created' ELSE 'group_updated' END, v_id::text, v_name,
          jsonb_build_object('kind', v_kind, 'match_departments', to_jsonb(v_depts), 'priority', v_priority,
                             'before', v_before),
          btrim(p_reason), public.admin_rules_actor_name());
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_rule_group_save(uuid, text, text, text, text[], text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_rule_group_save(uuid, text, text, text, text[], text, integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
