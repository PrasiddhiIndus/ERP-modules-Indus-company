-- Ask for Employee Master employment type on convert (do not silently inherit offer "Probation").

DROP FUNCTION IF EXISTS public.admin_recruitment_convert_to_employee(uuid, text, bigint);

CREATE OR REPLACE FUNCTION public.admin_recruitment_convert_to_employee(
  p_candidate_id uuid,
  p_employee_code text DEFAULT NULL,
  p_link_employee_id bigint DEFAULT NULL,
  p_employment_type text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c public.admin_recruitment_candidates%rowtype;
  v_o public.admin_recruitment_offers%rowtype;
  v_r public.admin_recruitment_requisitions%rowtype;
  v_matches jsonb;
  v_emp record;
  v_code text;
  v_sys_id text;
  v_seq integer;
  v_new_id bigint;
  v_type text;
  v_email text;
BEGIN
  PERFORM public.admin_recruitment_require('conversion');

  SELECT * INTO v_c FROM public.admin_recruitment_candidates WHERE id = p_candidate_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidate not found.';
  END IF;

  IF v_c.stage = 'employee_created' AND v_c.employee_master_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'converted', 'alreadyConverted', true,
      'employeeMasterId', v_c.employee_master_id,
      'employeeId', v_c.employee_system_id,
      'employeeCode', v_c.employee_code
    );
  END IF;
  IF v_c.outcome IS NOT NULL THEN
    RAISE EXCEPTION 'This candidate is closed (%).', replace(v_c.outcome, '_', ' ');
  END IF;
  IF v_c.stage <> 'joined' THEN
    RAISE EXCEPTION 'Only candidates marked as Joined can be converted to employees.';
  END IF;

  SELECT * INTO v_o FROM public.admin_recruitment_offers
  WHERE candidate_id = p_candidate_id AND status = 'accepted'
  ORDER BY responded_at DESC LIMIT 1;
  SELECT * INTO v_r FROM public.admin_recruitment_requisitions WHERE id = v_c.requisition_id;

  PERFORM pg_advisory_xact_lock(hashtextextended('admin_recruitment:employee_conversion', 0));

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', e.id, 'employeeId', e.employee_id, 'employeeCode', e.employee_code,
           'name', e.full_name, 'designation', e.designation, 'status', e.status
         )), '[]'::jsonb)
    INTO v_matches
  FROM public.admin_ifsp_employee_master e
  WHERE coalesce(lower(btrim(e.status)), 'active') NOT IN ('inactive', 'left', 'resigned', 'terminated', 'exited', 'relieved')
    AND (
      (v_c.phone_key IS NOT NULL AND public.admin_recruitment_phone_key(e.personal_no) = v_c.phone_key)
      OR (v_c.email_key IS NOT NULL AND public.admin_recruitment_email_key(e.email_id) = v_c.email_key)
    );

  IF p_link_employee_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_matches) m WHERE (m ->> 'id')::bigint = p_link_employee_id) THEN
      RAISE EXCEPTION 'The selected employee does not match this candidate''s mobile number or email.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.admin_recruitment_candidates WHERE employee_master_id = p_link_employee_id AND id <> p_candidate_id) THEN
      RAISE EXCEPTION 'That employee is already linked to another recruitment record.';
    END IF;
    SELECT id, employee_id, employee_code INTO v_emp FROM public.admin_ifsp_employee_master WHERE id = p_link_employee_id;

    UPDATE public.admin_recruitment_candidates SET
      stage = 'employee_created',
      employee_master_id = v_emp.id,
      employee_system_id = v_emp.employee_id,
      employee_code = v_emp.employee_code,
      converted_at = now(),
      converted_by = auth.uid(),
      converted_by_name = public.admin_recruitment_actor_name(auth.uid()),
      version = version + 1
    WHERE id = p_candidate_id;
    PERFORM public.admin_recruitment_log(
      p_candidate_id, v_c.requisition_id, 'conversion', p_candidate_id, 'employee_linked', 'joined', 'employee_created',
      'Linked to existing employee ' || coalesce(v_emp.employee_code, v_emp.employee_id, v_emp.id::text) || ' (no employee data changed)',
      jsonb_build_object('employeeMasterId', v_emp.id)
    );
    RETURN jsonb_build_object(
      'status', 'converted', 'linked', true,
      'employeeMasterId', v_emp.id, 'employeeId', v_emp.employee_id, 'employeeCode', v_emp.employee_code
    );
  END IF;

  IF jsonb_array_length(v_matches) > 0 THEN
    RETURN jsonb_build_object('status', 'duplicate', 'matches', v_matches);
  END IF;

  -- New Employee Master row: employment type must be chosen explicitly (UI).
  v_type := replace(lower(btrim(coalesce(p_employment_type, ''))), ' ', '_');
  IF v_type = '' THEN
    RAISE EXCEPTION 'Select an employment type before creating the employee.';
  END IF;
  IF v_type NOT IN ('permanent', 'consultant', 'voucher', 'probation', 'contract', 'pip', 'notice_period') THEN
    RAISE EXCEPTION 'Invalid employment type.';
  END IF;

  BEGIN
    v_code := public.hr_allocate_shared_employee_code(public.admin_recruitment_clean(p_employee_code), NULL::uuid);
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM ILIKE '%permission denied%' THEN
      RAISE EXCEPTION 'You do not have permission to allocate employee codes.' USING ERRCODE = '42501';
    END IF;
    RAISE;
  END;
  IF v_code IS NULL OR btrim(v_code) = '' THEN
    RAISE EXCEPTION 'Could not allocate an employee code. Enter one manually.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.admin_ifsp_employee_master e
    WHERE lower(btrim(coalesce(e.employee_code, ''))) = lower(v_code)
  ) THEN
    RAISE EXCEPTION 'Employee code % already exists in Employee Master.', v_code;
  END IF;

  SELECT coalesce(max(
    CASE
      WHEN trim(coalesce(e.employee_id, '')) ~ '^\d+$' THEN trim(e.employee_id)::integer
      WHEN trim(coalesce(e.employee_id, '')) ~* '^IFSPL-EMP-(\d+)$' THEN substring(trim(e.employee_id) FROM '(?i)IFSPL-EMP-(\d+)')::integer
      ELSE 0
    END
  ), 0) + 1
    INTO v_seq
  FROM public.admin_ifsp_employee_master e;
  LOOP
    v_sys_id := lpad(v_seq::text, 5, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.admin_ifsp_employee_master e WHERE e.employee_id = v_sys_id);
    v_seq := v_seq + 1;
    IF v_seq > 99999 THEN
      RAISE EXCEPTION 'Employee ID limit reached.';
    END IF;
  END LOOP;

  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  INSERT INTO public.admin_ifsp_employee_master (
    user_id, employee_id, employment_type, employee_code, full_name, designation, date_of_joining,
    personal_no, email_id, gender, date_of_birth, location, qualification, educational_qualification,
    other_experience, years_of_experience, department, status, created_by, updated_by
  ) VALUES (
    auth.uid(), v_sys_id, v_type, v_code, v_c.full_name,
    coalesce(v_o.designation, v_r.designation, 'Pending'),
    coalesce(v_c.actual_joining_date, public.admin_recruitment_today()),
    v_c.phone, v_c.email, v_c.gender, v_c.date_of_birth,
    coalesce(v_o.location, v_r.location),
    v_c.qualification, v_c.qualification,
    v_c.experience_years, v_c.experience_years,
    coalesce(v_o.department, v_r.department, ''),
    'Active', coalesce(v_email, ''), coalesce(v_email, '')
  )
  RETURNING id INTO v_new_id;

  UPDATE public.admin_recruitment_candidates SET
    stage = 'employee_created',
    employee_master_id = v_new_id,
    employee_system_id = v_sys_id,
    employee_code = v_code,
    converted_at = now(),
    converted_by = auth.uid(),
    converted_by_name = public.admin_recruitment_actor_name(auth.uid()),
    version = version + 1
  WHERE id = p_candidate_id;

  PERFORM public.admin_recruitment_log(
    p_candidate_id, v_c.requisition_id, 'conversion', p_candidate_id, 'employee_created', 'joined', 'employee_created',
    'Employee created in Employee Master — code ' || v_code || ', ID ' || v_sys_id || ', type ' || v_type,
    jsonb_build_object(
      'employeeMasterId', v_new_id,
      'employeeCode', v_code,
      'employeeId', v_sys_id,
      'employmentType', v_type
    )
  );

  RETURN jsonb_build_object(
    'status', 'converted', 'linked', false,
    'employeeMasterId', v_new_id, 'employeeId', v_sys_id, 'employeeCode', v_code,
    'employmentType', v_type
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_recruitment_convert_to_employee(uuid, text, bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_recruitment_convert_to_employee(uuid, text, bigint, text) TO authenticated, service_role;
