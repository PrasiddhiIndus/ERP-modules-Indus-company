-- Return 0.5 C/O for two CO+punch rows that deducted a full day.
--   9588 / 2026-09-08
--   10911 / 2026-10-27
-- Also set register mark CO → P/CO.
-- Idempotent: skips if deduct amount is already 0.5.

DO $repair_pco_half_two$
DECLARE
  v_row record;
  v_cases constant jsonb := '[
    {
      "employee_code": "9588",
      "register_date": "2026-09-08",
      "deduct_id": "e87d686a-6193-430e-bf67-66b15acead67",
      "credit_id": "a3c3d995-6345-45b7-a8d3-f1c0ef449913"
    },
    {
      "employee_code": "10911",
      "register_date": "2026-10-27",
      "deduct_id": "8abeb779-0479-439d-8aeb-410a2610599f",
      "credit_id": "a1411d26-3a38-48b6-8f76-64c116f79327"
    }
  ]'::jsonb;
  v_case jsonb;
  v_deduct_id uuid;
  v_credit_id uuid;
  v_emp text;
  v_date date;
  v_amount numeric;
  v_consumed numeric;
BEGIN
  FOR v_case IN SELECT * FROM jsonb_array_elements(v_cases)
  LOOP
    v_emp := v_case->>'employee_code';
    v_date := (v_case->>'register_date')::date;
    v_deduct_id := (v_case->>'deduct_id')::uuid;
    v_credit_id := (v_case->>'credit_id')::uuid;

    SELECT d.amount
    INTO v_amount
    FROM indus_one.comp_off_deductions d
    WHERE d.id = v_deduct_id
      AND d.entry_type = 'deduct';

    IF NOT FOUND THEN
      RAISE NOTICE 'SKIP % %: deduct row missing', v_emp, v_date;
      CONTINUE;
    END IF;

    IF coalesce(v_amount, 0) < 1 THEN
      RAISE NOTICE 'SKIP % %: deduct already %', v_emp, v_date, v_amount;
      CONTINUE;
    END IF;

    SELECT c.consumed_amount
    INTO v_consumed
    FROM indus_one.comp_off_credits c
    WHERE c.id = v_credit_id;

    IF NOT FOUND THEN
      RAISE NOTICE 'SKIP % %: credit row missing', v_emp, v_date;
      CONTINUE;
    END IF;

    UPDATE indus_one.comp_off_credits c
    SET
      consumed_amount = greatest(coalesce(c.consumed_amount, 0) - 0.5, 0),
      updated_at = now()
    WHERE c.id = v_credit_id;

    UPDATE indus_one.comp_off_deductions d
    SET amount = 0.5
    WHERE d.id = v_deduct_id;

    PERFORM indus_one.comp_off_refresh_credit_status(v_credit_id);

    RAISE NOTICE 'OK % %: returned 0.5 C/O on credit %', v_emp, v_date, v_credit_id;
  END LOOP;

  -- Mark CO → P/CO without re-firing C/O consume (balance already adjusted).
  -- Requires 20261030190000 so mark_check allows P/CO.
  BEGIN
    ALTER TABLE public.admin_attendance_register
      DISABLE TRIGGER comp_off_register_mark_trg;

    UPDATE public.admin_attendance_register r
    SET
      mark = 'P/CO',
      updated_at = now()
    WHERE (
        (public.norm_emp_code(r.employee_code) = public.norm_emp_code('9588')
          AND r.register_date = DATE '2026-09-08')
        OR
        (public.norm_emp_code(r.employee_code) = public.norm_emp_code('10911')
          AND r.register_date = DATE '2026-10-27')
      )
      AND upper(btrim(coalesce(r.mark, ''))) = 'CO';

    ALTER TABLE public.admin_attendance_register
      ENABLE TRIGGER comp_off_register_mark_trg;
  EXCEPTION WHEN OTHERS THEN
    ALTER TABLE public.admin_attendance_register
      ENABLE TRIGGER comp_off_register_mark_trg;
    RAISE;
  END;
END
$repair_pco_half_two$;
