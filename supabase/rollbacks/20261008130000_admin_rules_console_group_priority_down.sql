-- =============================================================================
-- Rollback for 20261008130000_admin_rules_console_group_priority.sql
-- Returns to the Phase 1 resolver (most recently created group wins).
-- Run by hand. Roll back 20261008140000 / 20261008140100 first if applied.
-- Afterwards: DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261008130000';
-- =============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.get_rules_bulk(text[], text[], date, date);
DROP FUNCTION IF EXISTS public.get_rule_value(text, text, date);
DROP FUNCTION IF EXISTS public.get_rule(text, text, date);
DROP FUNCTION IF EXISTS public.admin_rule_group_save(uuid, text, text, text, text[], text, integer);

DROP INDEX IF EXISTS public.admin_rule_groups_priority_active_idx;
ALTER TABLE public.admin_rule_groups
  DROP CONSTRAINT IF EXISTS admin_rule_groups_priority_check,
  DROP COLUMN IF EXISTS priority;

CREATE FUNCTION public.get_rule_detail(
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
    SELECT g.id::text AS gid, g.name, g.created_at
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
    SELECT l.value, 'employee'::text AS scope, l.scope_id, l.scope_label, l.id, 1 AS rank,
           NULL::timestamptz AS group_created
    FROM latest l, ctx
    WHERE l.scope_type = 'employee' AND l.scope_id = ctx.emp AND l.value IS NOT NULL
    UNION ALL
    SELECT l.value, 'group', l.scope_id, g.name, l.id, 2, g.created_at
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
  ORDER BY c.rank, c.group_created DESC NULLS LAST, c.scope_id DESC NULLS LAST
  LIMIT 1;
$$;

CREATE FUNCTION public.get_rule(
  p_employee_code text,
  p_rule_key text,
  p_on date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT d.value FROM public.get_rule_detail(p_employee_code, p_rule_key, p_on) d;
$$;

CREATE FUNCTION public.get_rules_bulk(
  p_employee_codes text[],
  p_rule_keys text[],
  p_from date,
  p_to date
)
RETURNS TABLE (employee_code text, rule_key text, on_date date, value jsonb, source_scope text, source_id text)
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
  SELECT e.code, k.key, d.day::date, r.value, r.source_scope, r.source_id
  FROM unnest(p_employee_codes) AS e(code)
  CROSS JOIN unnest(p_rule_keys) AS k(key)
  CROSS JOIN generate_series(p_from, p_to, interval '1 day') AS d(day)
  CROSS JOIN LATERAL public.get_rule_detail(e.code, k.key, d.day::date) AS r;
END;
$$;

CREATE FUNCTION public.admin_rule_group_save(
  p_id uuid,
  p_name text,
  p_kind text,
  p_description text,
  p_match_departments text[],
  p_reason text
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

  IF v_id IS NULL THEN
    INSERT INTO public.admin_rule_groups (name, kind, description, match_departments, created_by_name)
    VALUES (v_name, v_kind, btrim(coalesce(p_description, '')), v_depts, public.admin_rules_actor_name())
    RETURNING id INTO v_id;
  ELSE
    SELECT to_jsonb(g) INTO v_before FROM public.admin_rule_groups g WHERE g.id = v_id AND g.is_active;
    IF v_before IS NULL THEN
      RAISE EXCEPTION 'This group was not found.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.admin_rule_groups
    SET name = v_name, kind = v_kind, description = btrim(coalesce(p_description, '')),
        match_departments = v_depts, updated_at = now()
    WHERE id = v_id;
  END IF;

  INSERT INTO public.admin_rules_events (event_type, target_id, target_label, details, reason, created_by_name)
  VALUES (CASE WHEN p_id IS NULL THEN 'group_created' ELSE 'group_updated' END, v_id::text, v_name,
          jsonb_build_object('kind', v_kind, 'match_departments', to_jsonb(v_depts), 'before', v_before),
          btrim(p_reason), public.admin_rules_actor_name());
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_rule_detail(text, text, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_rule(text, text, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_rules_bulk(text[], text[], date, date) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_rule_group_save(uuid, text, text, text, text[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_rule_group_save(uuid, text, text, text, text[], text) TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
