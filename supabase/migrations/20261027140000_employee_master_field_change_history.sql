-- Field-level audit trail for Employee Master (admin_ifsp_employee_master).
-- Logs every column change on UPDATE (and a single "created" row on INSERT).
-- Does not alter existing business logic — append-only history via AFTER trigger.

CREATE TABLE IF NOT EXISTS public.admin_ifsp_employee_master_field_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_master_id bigint NOT NULL
    REFERENCES public.admin_ifsp_employee_master (id) ON DELETE CASCADE,
  field_key text NOT NULL,
  field_label text,
  old_value text,
  new_value text,
  changed_by uuid,
  changed_by_name text,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_ifsp_employee_master_field_history_emp_idx
  ON public.admin_ifsp_employee_master_field_history (employee_master_id, changed_at DESC);

COMMENT ON TABLE public.admin_ifsp_employee_master_field_history IS
  'Per-field audit trail for Employee Master edits (who / field / old / new / when).';

-- Business-friendly labels (unknown keys fall back to the column name).
CREATE OR REPLACE FUNCTION public.admin_employee_master_field_label(p_key text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(btrim(coalesce(p_key, '')))
    WHEN 'employee_id' THEN 'Machine ID'
    WHEN 'employment_type' THEN 'Employment type'
    WHEN 'employee_code' THEN 'Employee code'
    WHEN 'employee_type' THEN 'Employee type'
    WHEN 'full_name' THEN 'Full name'
    WHEN 'gender' THEN 'Gender'
    WHEN 'date_of_joining' THEN 'Date of joining'
    WHEN 'confirmation_date' THEN 'Date of confirmation'
    WHEN 'date_of_resignation' THEN 'Date of resignation'
    WHEN 'date_of_relieving' THEN 'Date of relieving'
    WHEN 'fnf_done_date' THEN 'F&F done date'
    WHEN 'designation' THEN 'Designation'
    WHEN 'department' THEN 'Department'
    WHEN 'location' THEN 'Location'
    WHEN 'date_of_birth' THEN 'Date of birth'
    WHEN 'date_of_anniversary' THEN 'Anniversary'
    WHEN 'blood_group' THEN 'Blood group'
    WHEN 'aadhar_no' THEN 'Aadhar'
    WHEN 'pan_card_no' THEN 'PAN'
    WHEN 'religion' THEN 'Religion'
    WHEN 'father_name' THEN 'Father name'
    WHEN 'mother_name' THEN 'Mother name'
    WHEN 'spouse_name' THEN 'Spouse name'
    WHEN 'son_details' THEN 'Son details'
    WHEN 'daughter_details' THEN 'Daughter details'
    WHEN 'son_name' THEN 'Son name'
    WHEN 'son_dob' THEN 'Son DOB'
    WHEN 'daughter_name' THEN 'Daughter name'
    WHEN 'daughter_dob' THEN 'Daughter DOB'
    WHEN 'address' THEN 'Address'
    WHEN 'full_address' THEN 'Full address'
    WHEN 'personal_no' THEN 'Personal phone'
    WHEN 'emergency_no' THEN 'Emergency contact'
    WHEN 'identification_mark' THEN 'Identification mark'
    WHEN 'educational_qualification' THEN 'Qualification'
    WHEN 'qualification' THEN 'Qualification'
    WHEN 'other_experience' THEN 'Other experience (yrs)'
    WHEN 'ifspl_experience' THEN 'IFSPL experience (yrs)'
    WHEN 'years_of_experience' THEN 'Total experience (yrs)'
    WHEN 'date_of_leaving' THEN 'Date of leaving'
    WHEN 'status' THEN 'Status'
    WHEN 'status_reason' THEN 'Status reason'
    WHEN 'remarks' THEN 'Remarks'
    WHEN 'uan_no' THEN 'UAN'
    WHEN 'esic_no' THEN 'ESIC'
    WHEN 'bank_account_no' THEN 'Bank account'
    WHEN 'ifsc_code' THEN 'IFSC'
    WHEN 'bank_name' THEN 'Bank name'
    WHEN 'bank_branch' THEN 'Bank branch'
    WHEN 'l1_manager_code' THEN 'L1 manager'
    WHEN 'l2_manager_code' THEN 'L2 manager'
    WHEN 'hierarchy_sort_order' THEN 'Hierarchy order'
    WHEN 'user_id' THEN 'Linked login'
    WHEN 'email_id' THEN 'Email'
    WHEN 'birthday_reminder' THEN 'Birthday reminder'
    WHEN 'anniversary_reminder' THEN 'Anniversary reminder'
    WHEN '__created__' THEN 'Record'
    ELSE replace(initcap(replace(coalesce(p_key, ''), '_', ' ')), ' Id', ' ID')
  END;
$$;

CREATE OR REPLACE FUNCTION public.admin_employee_master_actor_display_name()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_name text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN 'System';
  END IF;

  SELECT nullif(btrim(m.full_name), '')
  INTO v_name
  FROM public.admin_ifsp_employee_master m
  WHERE m.user_id = v_uid
  ORDER BY CASE WHEN lower(coalesce(m.status, '')) = 'active' THEN 0 ELSE 1 END, m.id
  LIMIT 1;

  IF v_name IS NOT NULL THEN
    RETURN v_name;
  END IF;

  SELECT coalesce(
    nullif(btrim(p.full_name), ''),
    nullif(btrim(p.email), ''),
    v_uid::text
  )
  INTO v_name
  FROM public.profiles p
  WHERE p.id = v_uid
  LIMIT 1;

  RETURN coalesce(v_name, 'Unknown user');
END;
$$;

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
  v_skip text[] := ARRAY[
    'updated_at', 'created_at', 'timestamp'
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

DROP TRIGGER IF EXISTS trg_admin_ifsp_employee_master_field_history
  ON public.admin_ifsp_employee_master;
CREATE TRIGGER trg_admin_ifsp_employee_master_field_history
  AFTER INSERT OR UPDATE ON public.admin_ifsp_employee_master
  FOR EACH ROW
  EXECUTE FUNCTION public.admin_ifsp_employee_master_log_field_changes();

ALTER TABLE public.admin_ifsp_employee_master_field_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_employee_master_field_history_select
  ON public.admin_ifsp_employee_master_field_history;
CREATE POLICY admin_employee_master_field_history_select
  ON public.admin_ifsp_employee_master_field_history
  FOR SELECT TO authenticated
  USING (
    (SELECT public.current_user_has_admin_module_access())
    OR (SELECT public.current_user_has_attendance_admin_access())
  );

-- Trigger inserts as security definer (table owner / bypass); no INSERT policy for clients.
REVOKE ALL ON TABLE public.admin_ifsp_employee_master_field_history FROM anon;
GRANT SELECT ON TABLE public.admin_ifsp_employee_master_field_history TO authenticated;
GRANT ALL ON TABLE public.admin_ifsp_employee_master_field_history TO service_role;

GRANT EXECUTE ON FUNCTION public.admin_employee_master_field_label(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_employee_master_actor_display_name() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
