-- After In-house Recruitment creates an Employee Master row, attach the candidate's
-- saved CTC as the initial Admin Salary structure. SECURITY DEFINER so conversion
-- users (without Salary Admin allowlist) can still write the CTC once.

CREATE OR REPLACE FUNCTION public.admin_recruitment_attach_employee_ctc(
  p_employee_master_id bigint,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp public.admin_ifsp_employee_master%rowtype;
  v_existing public.admin_salary_structures%rowtype;
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_id uuid;
BEGIN
  PERFORM public.admin_recruitment_require('conversion');

  IF p_employee_master_id IS NULL THEN
    RAISE EXCEPTION 'Employee is required.';
  END IF;

  IF coalesce(public.admin_recruitment_num(v_payload ->> 'ctc_monthly'), 0) <= 0 THEN
    RAISE EXCEPTION 'CTC amount is required.';
  END IF;

  SELECT * INTO v_emp FROM public.admin_ifsp_employee_master WHERE id = p_employee_master_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee Master record not found.';
  END IF;

  -- Skip if a declared CTC already exists (never overwrite Admin Salary edits).
  SELECT * INTO v_existing
  FROM public.admin_salary_structures
  WHERE employee_master_id = p_employee_master_id
  FOR UPDATE;

  IF FOUND AND v_existing.declared IS TRUE AND coalesce(v_existing.ctc_monthly, 0) > 0 THEN
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'ctc_exists', 'structureId', v_existing.id);
  END IF;

  IF FOUND THEN
    UPDATE public.admin_salary_structures SET
      structure_version = coalesce(v_payload ->> 'structure_version', structure_version),
      employee_level = coalesce(v_payload ->> 'employee_level', employee_level, 'office'),
      basic_mode = coalesce(v_payload ->> 'basic_mode', basic_mode, 'auto'),
      hra_mode = coalesce(v_payload ->> 'hra_mode', hra_mode, 'percent_40'),
      emp_esic_mode = coalesce(v_payload ->> 'emp_esic_mode', emp_esic_mode, 'auto'),
      er_esic_mode = coalesce(v_payload ->> 'er_esic_mode', er_esic_mode, 'auto'),
      leave_encash_mode = coalesce(v_payload ->> 'leave_encash_mode', leave_encash_mode, 'auto'),
      gratuity_mode = coalesce(v_payload ->> 'gratuity_mode', gratuity_mode, 'auto'),
      gross_monthly = public.admin_recruitment_num(v_payload ->> 'gross_monthly'),
      basic_monthly = public.admin_recruitment_num(v_payload ->> 'basic_monthly'),
      hra_monthly = public.admin_recruitment_num(v_payload ->> 'hra_monthly'),
      special_allowance_monthly = public.admin_recruitment_num(v_payload ->> 'special_allowance_monthly'),
      conveyance_monthly = public.admin_recruitment_num(v_payload ->> 'conveyance_monthly'),
      stat_bonus_monthly = public.admin_recruitment_num(v_payload ->> 'stat_bonus_monthly'),
      medical_allowance_monthly = public.admin_recruitment_num(v_payload ->> 'medical_allowance_monthly'),
      emp_pf_monthly = public.admin_recruitment_num(v_payload ->> 'emp_pf_monthly'),
      pf_wage_monthly = public.admin_recruitment_num(v_payload ->> 'pf_wage_monthly'),
      pt_monthly = public.admin_recruitment_num(v_payload ->> 'pt_monthly'),
      emp_esic_monthly = public.admin_recruitment_num(v_payload ->> 'emp_esic_monthly'),
      emp_esic_applicable = coalesce((v_payload ->> 'emp_esic_applicable')::boolean, emp_esic_applicable, false),
      take_home_monthly = public.admin_recruitment_num(v_payload ->> 'take_home_monthly'),
      esic_enabled = coalesce((v_payload ->> 'esic_enabled')::boolean, esic_enabled, true),
      esic_eligible = coalesce((v_payload ->> 'esic_eligible')::boolean, esic_eligible, false),
      er_pf_monthly = public.admin_recruitment_num(v_payload ->> 'er_pf_monthly'),
      er_esic_monthly = public.admin_recruitment_num(v_payload ->> 'er_esic_monthly'),
      er_esic_applicable = coalesce((v_payload ->> 'er_esic_applicable')::boolean, er_esic_applicable, false),
      gratuity_monthly = public.admin_recruitment_num(v_payload ->> 'gratuity_monthly'),
      leave_encash_monthly = public.admin_recruitment_num(v_payload ->> 'leave_encash_monthly'),
      mediclaim_enabled = coalesce((v_payload ->> 'mediclaim_enabled')::boolean, mediclaim_enabled, false),
      mediclaim_monthly = public.admin_recruitment_num(v_payload ->> 'mediclaim_monthly'),
      ex_gratia_monthly = public.admin_recruitment_num(v_payload ->> 'ex_gratia_monthly'),
      bonus_monthly = public.admin_recruitment_num(v_payload ->> 'bonus_monthly'),
      total_b_monthly = public.admin_recruitment_num(v_payload ->> 'total_b_monthly'),
      ctc_monthly = public.admin_recruitment_num(v_payload ->> 'ctc_monthly'),
      ctc_annual = public.admin_recruitment_num(v_payload ->> 'ctc_annual'),
      skill_category = coalesce(v_payload ->> 'skill_category', skill_category),
      salary_scheme = coalesce(v_payload ->> 'salary_scheme', salary_scheme),
      employee_status = coalesce(v_payload ->> 'employee_status', employee_status),
      employee_category = coalesce(v_payload ->> 'employee_category', employee_category),
      salary_band = coalesce(public.admin_recruitment_num(v_payload ->> 'salary_band')::integer, salary_band),
      input_basis = coalesce(v_payload ->> 'input_basis', input_basis),
      input_amount = public.admin_recruitment_num(v_payload ->> 'input_amount'),
      validation_status = coalesce(v_payload ->> 'validation_status', validation_status),
      is_custom = coalesce((v_payload ->> 'is_custom')::boolean, is_custom, false),
      revision_type = coalesce(v_payload ->> 'revision_type', revision_type, 'initial'),
      revision_reason = coalesce(v_payload ->> 'revision_reason', revision_reason),
      declared = true,
      wef_date = coalesce(nullif(v_payload ->> 'wef_date', '')::date, wef_date, v_emp.date_of_joining),
      date_of_birth = coalesce(nullif(v_payload ->> 'date_of_birth', '')::date, date_of_birth, v_emp.date_of_birth),
      date_of_joining = coalesce(nullif(v_payload ->> 'date_of_joining', '')::date, date_of_joining, v_emp.date_of_joining),
      updated_by = auth.uid(),
      updated_at = now()
    WHERE id = v_existing.id
    RETURNING id INTO v_id;
  ELSE
    INSERT INTO public.admin_salary_structures (
      employee_master_id, structure_version, employee_level, basic_mode, hra_mode,
      emp_esic_mode, er_esic_mode, leave_encash_mode, gratuity_mode,
      gross_monthly, basic_monthly, hra_monthly, special_allowance_monthly,
      conveyance_monthly, stat_bonus_monthly, medical_allowance_monthly,
      emp_pf_monthly, pf_wage_monthly, pt_monthly, emp_esic_monthly, emp_esic_applicable,
      take_home_monthly, esic_enabled, esic_eligible,
      er_pf_monthly, er_esic_monthly, er_esic_applicable,
      gratuity_monthly, leave_encash_monthly, mediclaim_enabled, mediclaim_monthly,
      ex_gratia_monthly, bonus_monthly, total_b_monthly, ctc_monthly, ctc_annual,
      skill_category, salary_scheme, employee_status, employee_category, salary_band,
      input_basis, input_amount, validation_status, is_custom, revision_type, revision_reason,
      declared, wef_date, date_of_birth, date_of_joining, revision_count, created_by, updated_by
    ) VALUES (
      p_employee_master_id,
      coalesce(v_payload ->> 'structure_version', 'annexure_2026'),
      coalesce(v_payload ->> 'employee_level', 'office'),
      coalesce(v_payload ->> 'basic_mode', 'auto'),
      coalesce(v_payload ->> 'hra_mode', 'percent_40'),
      coalesce(v_payload ->> 'emp_esic_mode', 'auto'),
      coalesce(v_payload ->> 'er_esic_mode', 'auto'),
      coalesce(v_payload ->> 'leave_encash_mode', 'auto'),
      coalesce(v_payload ->> 'gratuity_mode', 'auto'),
      public.admin_recruitment_num(v_payload ->> 'gross_monthly'),
      public.admin_recruitment_num(v_payload ->> 'basic_monthly'),
      public.admin_recruitment_num(v_payload ->> 'hra_monthly'),
      public.admin_recruitment_num(v_payload ->> 'special_allowance_monthly'),
      public.admin_recruitment_num(v_payload ->> 'conveyance_monthly'),
      public.admin_recruitment_num(v_payload ->> 'stat_bonus_monthly'),
      public.admin_recruitment_num(v_payload ->> 'medical_allowance_monthly'),
      public.admin_recruitment_num(v_payload ->> 'emp_pf_monthly'),
      public.admin_recruitment_num(v_payload ->> 'pf_wage_monthly'),
      public.admin_recruitment_num(v_payload ->> 'pt_monthly'),
      public.admin_recruitment_num(v_payload ->> 'emp_esic_monthly'),
      coalesce((v_payload ->> 'emp_esic_applicable')::boolean, false),
      public.admin_recruitment_num(v_payload ->> 'take_home_monthly'),
      coalesce((v_payload ->> 'esic_enabled')::boolean, true),
      coalesce((v_payload ->> 'esic_eligible')::boolean, false),
      public.admin_recruitment_num(v_payload ->> 'er_pf_monthly'),
      public.admin_recruitment_num(v_payload ->> 'er_esic_monthly'),
      coalesce((v_payload ->> 'er_esic_applicable')::boolean, false),
      public.admin_recruitment_num(v_payload ->> 'gratuity_monthly'),
      public.admin_recruitment_num(v_payload ->> 'leave_encash_monthly'),
      coalesce((v_payload ->> 'mediclaim_enabled')::boolean, false),
      public.admin_recruitment_num(v_payload ->> 'mediclaim_monthly'),
      public.admin_recruitment_num(v_payload ->> 'ex_gratia_monthly'),
      public.admin_recruitment_num(v_payload ->> 'bonus_monthly'),
      public.admin_recruitment_num(v_payload ->> 'total_b_monthly'),
      public.admin_recruitment_num(v_payload ->> 'ctc_monthly'),
      public.admin_recruitment_num(v_payload ->> 'ctc_annual'),
      v_payload ->> 'skill_category',
      v_payload ->> 'salary_scheme',
      v_payload ->> 'employee_status',
      v_payload ->> 'employee_category',
      public.admin_recruitment_num(v_payload ->> 'salary_band')::integer,
      v_payload ->> 'input_basis',
      public.admin_recruitment_num(v_payload ->> 'input_amount'),
      v_payload ->> 'validation_status',
      coalesce((v_payload ->> 'is_custom')::boolean, false),
      coalesce(v_payload ->> 'revision_type', 'initial'),
      v_payload ->> 'revision_reason',
      true,
      coalesce(nullif(v_payload ->> 'wef_date', '')::date, v_emp.date_of_joining),
      coalesce(nullif(v_payload ->> 'date_of_birth', '')::date, v_emp.date_of_birth),
      coalesce(nullif(v_payload ->> 'date_of_joining', '')::date, v_emp.date_of_joining),
      0,
      auth.uid(),
      auth.uid()
    )
    RETURNING id INTO v_id;
  END IF;

  RETURN jsonb_build_object('status', 'saved', 'structureId', v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_recruitment_attach_employee_ctc(bigint, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_recruitment_attach_employee_ctc(bigint, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
