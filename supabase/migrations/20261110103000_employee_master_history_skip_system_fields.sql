-- Employee Master change history: log only manually performed field changes.
-- Skip derived/system fields (experience recalcs, denormalized manager names, audit stamps).
-- Does not change business save logic — only what the AFTER trigger records.

CREATE OR REPLACE FUNCTION public.admin_ifsp_employee_master_log_field_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_key text;
  v_old_val text;
  v_new_val text;
  v_actor uuid := auth.uid();
  v_actor_name text := public.admin_employee_master_actor_display_name();
  -- Manual edits only: exclude auto-calculated experience, denormalized manager
  -- names, and system/meta timestamps & actor stamps.
  v_skip text[] := ARRAY[
    'updated_at',
    'created_at',
    'timestamp',
    'updated_by',
    'created_by',
    'status_changed_by',
    'status_changed_at',
    'ifspl_experience',
    'years_of_experience',
    'l1_manager_name',
    'l2_manager_name'
  ];
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.admin_ifsp_employee_master_field_history (
      employee_master_id, field_key, field_label, old_value, new_value,
      changed_by, changed_by_name
    ) VALUES (
      NEW.id, '__created__', 'Record', NULL, 'Created',
      v_actor, v_actor_name
    );
    RETURN NEW;
  END IF;

  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  v_old := to_jsonb(OLD);
  v_new := to_jsonb(NEW);

  FOR v_key IN
    SELECT DISTINCT k
    FROM (
      SELECT jsonb_object_keys(v_old) AS k
      UNION
      SELECT jsonb_object_keys(v_new) AS k
    ) keys
    WHERE NOT (k = ANY (v_skip))
  LOOP
    v_old_val := nullif(btrim(coalesce(v_old ->> v_key, '')), '');
    v_new_val := nullif(btrim(coalesce(v_new ->> v_key, '')), '');
    -- Normalize json null / boolean display
    IF (v_old -> v_key) IS NULL OR (v_old ->> v_key) IS NULL THEN
      v_old_val := NULL;
    END IF;
    IF (v_new -> v_key) IS NULL OR (v_new ->> v_key) IS NULL THEN
      v_new_val := NULL;
    END IF;

    IF v_old_val IS NOT DISTINCT FROM v_new_val THEN
      CONTINUE;
    END IF;

    INSERT INTO public.admin_ifsp_employee_master_field_history (
      employee_master_id, field_key, field_label, old_value, new_value,
      changed_by, changed_by_name
    ) VALUES (
      NEW.id,
      v_key,
      public.admin_employee_master_field_label(v_key),
      v_old_val,
      v_new_val,
      v_actor,
      v_actor_name
    );
  END LOOP;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
