-- Site Employee IOM (HR-Safety payroll memo) — draft/confirm events that update
-- public.people + site_assignments, with sensitive banking/ID in a linked table.
-- Does NOT modify ifspl_all_employees (read-only view stays as-is).

-- ---------------------------------------------------------------------------
-- Sensitive details (1:1 with people) — tighter boundary than general people
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.people_sensitive_details (
  person_id bigint PRIMARY KEY REFERENCES public.people (id) ON DELETE CASCADE,
  date_of_birth date,
  aadhaar_no text NOT NULL DEFAULT '',
  pan_no text NOT NULL DEFAULT '',
  uan_no text NOT NULL DEFAULT '',
  bank_account_no text NOT NULL DEFAULT '',
  ifsc_code text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

COMMENT ON TABLE public.people_sensitive_details IS
  'Banking and ID fields for site employees (people). Isolated from general people queries.';

CREATE INDEX IF NOT EXISTS people_sensitive_details_pan_idx
  ON public.people_sensitive_details (lower(btrim(pan_no)))
  WHERE btrim(pan_no) <> '';

ALTER TABLE public.people_sensitive_details ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS people_sensitive_details_select ON public.people_sensitive_details;
DROP POLICY IF EXISTS people_sensitive_details_insert ON public.people_sensitive_details;
DROP POLICY IF EXISTS people_sensitive_details_update ON public.people_sensitive_details;
DROP POLICY IF EXISTS people_sensitive_details_delete ON public.people_sensitive_details;

CREATE POLICY people_sensitive_details_select
  ON public.people_sensitive_details FOR SELECT TO authenticated
  USING (public.current_user_can_access_module('hr'));

CREATE POLICY people_sensitive_details_insert
  ON public.people_sensitive_details FOR INSERT TO authenticated
  WITH CHECK (public.current_user_can_access_module('hr'));

CREATE POLICY people_sensitive_details_update
  ON public.people_sensitive_details FOR UPDATE TO authenticated
  USING (public.current_user_can_access_module('hr'))
  WITH CHECK (public.current_user_can_access_module('hr'));

CREATE POLICY people_sensitive_details_delete
  ON public.people_sensitive_details FOR DELETE TO authenticated
  USING (public.current_user_can_access_module('hr'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.people_sensitive_details TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.people_sensitive_details TO service_role;

-- ---------------------------------------------------------------------------
-- IOM event history (permanent; never deleted on confirm)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_site_iom_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_status text NOT NULL DEFAULT 'draft'
    CHECK (entry_status IN ('draft', 'confirmed', 'cancelled')),
  rotation_type text NOT NULL
    CHECK (rotation_type IN (
      'New',
      'Transferred',
      'Promotion',
      'Demotion',
      'Revision of Salary'
    )),
  event_date date NOT NULL DEFAULT (timezone('Asia/Kolkata', now()))::date,
  site_id bigint REFERENCES public.sites (id) ON DELETE SET NULL,
  site_name text NOT NULL DEFAULT '',
  person_id bigint REFERENCES public.people (id) ON DELETE SET NULL,
  employee_code text NOT NULL DEFAULT '',
  employee_name text NOT NULL DEFAULT '',
  designation text NOT NULL DEFAULT '',
  salary_amount numeric(14, 2),
  father_name text NOT NULL DEFAULT '',
  bank_account_no text NOT NULL DEFAULT '',
  ifsc_code text NOT NULL DEFAULT '',
  date_of_birth date,
  date_of_joining date,
  remarks text NOT NULL DEFAULT '',
  contact_number text NOT NULL DEFAULT '',
  aadhaar_no text NOT NULL DEFAULT '',
  pan_no text NOT NULL DEFAULT '',
  uan_no text NOT NULL DEFAULT '',
  pf_no text NOT NULL DEFAULT '',
  previous_site_name text NOT NULL DEFAULT '',
  previous_designation text NOT NULL DEFAULT '',
  previous_salary_amount numeric(14, 2),
  confirmed_at timestamptz,
  confirmed_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

COMMENT ON TABLE public.hr_site_iom_entries IS
  'Site Employee IOM history. Confirmed rows stay forever; employee updates are side effects.';

CREATE INDEX IF NOT EXISTS hr_site_iom_entries_event_date_idx
  ON public.hr_site_iom_entries (event_date DESC, site_name);

CREATE INDEX IF NOT EXISTS hr_site_iom_entries_status_idx
  ON public.hr_site_iom_entries (entry_status, event_date DESC);

CREATE INDEX IF NOT EXISTS hr_site_iom_entries_person_idx
  ON public.hr_site_iom_entries (person_id)
  WHERE person_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS hr_site_iom_entries_code_idx
  ON public.hr_site_iom_entries (lower(btrim(employee_code)))
  WHERE btrim(employee_code) <> '';

ALTER TABLE public.hr_site_iom_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_site_iom_entries_select ON public.hr_site_iom_entries;
DROP POLICY IF EXISTS hr_site_iom_entries_insert ON public.hr_site_iom_entries;
DROP POLICY IF EXISTS hr_site_iom_entries_update ON public.hr_site_iom_entries;
DROP POLICY IF EXISTS hr_site_iom_entries_delete ON public.hr_site_iom_entries;

CREATE POLICY hr_site_iom_entries_select
  ON public.hr_site_iom_entries FOR SELECT TO authenticated
  USING (public.current_user_can_access_module('hr'));

CREATE POLICY hr_site_iom_entries_insert
  ON public.hr_site_iom_entries FOR INSERT TO authenticated
  WITH CHECK (public.current_user_can_access_module('hr'));

CREATE POLICY hr_site_iom_entries_update
  ON public.hr_site_iom_entries FOR UPDATE TO authenticated
  USING (public.current_user_can_access_module('hr'))
  WITH CHECK (public.current_user_can_access_module('hr'));

-- Soft-cancel only via status; block hard deletes of confirmed history from clients
CREATE POLICY hr_site_iom_entries_delete
  ON public.hr_site_iom_entries FOR DELETE TO authenticated
  USING (
    public.current_user_can_access_module('hr')
    AND entry_status = 'draft'
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_site_iom_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_site_iom_entries TO service_role;

-- ---------------------------------------------------------------------------
-- Shared employee code allocator (master + people + calling candidates)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_allocate_shared_employee_code(
  p_requested text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_manual text;
  v_free text;
  v_next bigint;
  v_code text;
  v_manual_num bigint;
BEGIN
  IF NOT public.current_user_can_access_module('hr') THEN
    RAISE EXCEPTION 'Permission denied.';
  END IF;

  v_manual := nullif(btrim(coalesce(p_requested, '')), '');

  IF v_manual IS NOT NULL THEN
    IF v_manual !~ '^[A-Za-z0-9]+$' THEN
      RAISE EXCEPTION 'Employee code must contain only letters and numbers.';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.admin_ifsp_employee_master m
      WHERE lower(btrim(coalesce(m.employee_code, ''))) = lower(v_manual)
    ) OR EXISTS (
      SELECT 1 FROM public.people p
      WHERE lower(btrim(coalesce(p.unique_code, ''))) = lower(v_manual)
    ) OR (
      to_regclass('public.hr_calling_candidates') IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.hr_calling_candidates c
        WHERE c.is_active = true
          AND lower(btrim(coalesce(c.employee_code, ''))) = lower(v_manual)
      )
    ) THEN
      RAISE EXCEPTION 'Employee code % is already taken.', v_manual;
    END IF;

    IF to_regclass('public.hr_calling_reusable_employee_codes') IS NOT NULL THEN
      DELETE FROM public.hr_calling_reusable_employee_codes
      WHERE lower(btrim(employee_code)) = lower(v_manual);
    END IF;

    IF to_regclass('public.hr_calling_offer_counters') IS NOT NULL THEN
      INSERT INTO public.hr_calling_offer_counters (counter_key, last_value)
      VALUES ('employee_code', 0)
      ON CONFLICT (counter_key) DO NOTHING;

      v_manual_num := nullif(regexp_replace(v_manual, '[^0-9]', '', 'g'), '')::bigint;
      IF v_manual_num IS NOT NULL THEN
        UPDATE public.hr_calling_offer_counters
        SET last_value = greatest(last_value, v_manual_num),
            updated_at = now()
        WHERE counter_key = 'employee_code';
      END IF;
    END IF;

    RETURN v_manual;
  END IF;

  -- Prefer reusable pool when present
  IF to_regclass('public.hr_calling_reusable_employee_codes') IS NOT NULL THEN
    SELECT r.employee_code
      INTO v_free
    FROM public.hr_calling_reusable_employee_codes r
    WHERE NOT EXISTS (
      SELECT 1 FROM public.admin_ifsp_employee_master m
      WHERE lower(btrim(coalesce(m.employee_code, ''))) = lower(btrim(r.employee_code))
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.people p
      WHERE lower(btrim(coalesce(p.unique_code, ''))) = lower(btrim(r.employee_code))
    )
    AND (
      to_regclass('public.hr_calling_candidates') IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM public.hr_calling_candidates c
        WHERE c.is_active = true
          AND lower(btrim(coalesce(c.employee_code, ''))) = lower(btrim(r.employee_code))
      )
    )
    ORDER BY r.freed_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF v_free IS NOT NULL THEN
      DELETE FROM public.hr_calling_reusable_employee_codes WHERE employee_code = v_free;
      RETURN v_free;
    END IF;
  END IF;

  -- Ensure counter exists and is at least max across sources
  IF to_regclass('public.hr_calling_offer_counters') IS NOT NULL THEN
    INSERT INTO public.hr_calling_offer_counters (counter_key, last_value)
    VALUES ('employee_code', 0)
    ON CONFLICT (counter_key) DO NOTHING;

    UPDATE public.hr_calling_offer_counters c
    SET last_value = greatest(
      c.last_value,
      coalesce((
        SELECT max(nullif(regexp_replace(btrim(m.employee_code), '[^0-9]', '', 'g'), '')::bigint)
        FROM public.admin_ifsp_employee_master m
        WHERE coalesce(btrim(m.employee_code), '') ~ '^[0-9]+$'
      ), 0),
      coalesce((
        SELECT max(nullif(regexp_replace(btrim(p.unique_code), '[^0-9]', '', 'g'), '')::bigint)
        FROM public.people p
        WHERE coalesce(btrim(p.unique_code), '') ~ '^[0-9]+$'
      ), 0)
    ),
    updated_at = now()
    WHERE c.counter_key = 'employee_code';

    LOOP
      UPDATE public.hr_calling_offer_counters
      SET last_value = last_value + 1,
          updated_at = now()
      WHERE counter_key = 'employee_code'
      RETURNING last_value INTO v_next;

      v_code := v_next::text;

      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.admin_ifsp_employee_master m
        WHERE lower(btrim(coalesce(m.employee_code, ''))) = lower(v_code)
      ) AND NOT EXISTS (
        SELECT 1 FROM public.people p
        WHERE lower(btrim(coalesce(p.unique_code, ''))) = lower(v_code)
      ) AND (
        to_regclass('public.hr_calling_candidates') IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM public.hr_calling_candidates c
          WHERE c.is_active = true
            AND lower(btrim(coalesce(c.employee_code, ''))) = lower(v_code)
        )
      );
    END LOOP;

    RETURN v_code;
  END IF;

  -- Fallback if calling counters table is absent
  SELECT coalesce(max(v), 0) + 1 INTO v_next
  FROM (
    SELECT nullif(regexp_replace(btrim(m.employee_code), '[^0-9]', '', 'g'), '')::bigint AS v
    FROM public.admin_ifsp_employee_master m
    WHERE coalesce(btrim(m.employee_code), '') ~ '^[0-9]+$'
    UNION ALL
    SELECT nullif(regexp_replace(btrim(p.unique_code), '[^0-9]', '', 'g'), '')::bigint
    FROM public.people p
    WHERE coalesce(btrim(p.unique_code), '') ~ '^[0-9]+$'
  ) s;

  RETURN v_next::text;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_allocate_shared_employee_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hr_allocate_shared_employee_code(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.hr_peek_shared_employee_code()
RETURNS TABLE (last_used text, suggested_next text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last bigint := 0;
  v_free text;
BEGIN
  IF NOT public.current_user_can_access_module('hr') THEN
    RAISE EXCEPTION 'Permission denied.';
  END IF;

  IF to_regclass('public.hr_calling_reusable_employee_codes') IS NOT NULL THEN
    SELECT r.employee_code INTO v_free
    FROM public.hr_calling_reusable_employee_codes r
    WHERE NOT EXISTS (
      SELECT 1 FROM public.admin_ifsp_employee_master m
      WHERE lower(btrim(coalesce(m.employee_code, ''))) = lower(btrim(r.employee_code))
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.people p
      WHERE lower(btrim(coalesce(p.unique_code, ''))) = lower(btrim(r.employee_code))
    )
    ORDER BY r.freed_at ASC
    LIMIT 1;
  END IF;

  SELECT greatest(
    coalesce((
      SELECT max(nullif(regexp_replace(btrim(m.employee_code), '[^0-9]', '', 'g'), '')::bigint)
      FROM public.admin_ifsp_employee_master m
      WHERE coalesce(btrim(m.employee_code), '') ~ '^[0-9]+$'
    ), 0),
    coalesce((
      SELECT max(nullif(regexp_replace(btrim(p.unique_code), '[^0-9]', '', 'g'), '')::bigint)
      FROM public.people p
      WHERE coalesce(btrim(p.unique_code), '') ~ '^[0-9]+$'
    ), 0),
    CASE
      WHEN to_regclass('public.hr_calling_offer_counters') IS NOT NULL THEN
        coalesce((
          SELECT last_value FROM public.hr_calling_offer_counters
          WHERE counter_key = 'employee_code'
        ), 0)
      ELSE 0
    END
  ) INTO v_last;

  last_used := CASE WHEN v_last > 0 THEN v_last::text ELSE '' END;
  suggested_next := coalesce(nullif(btrim(v_free), ''), (v_last + 1)::text);
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_peek_shared_employee_code() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hr_peek_shared_employee_code() TO authenticated;

-- ---------------------------------------------------------------------------
-- Confirm draft IOM entry → update people / assignments / sensitive details
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_site_iom_confirm_entry(p_entry_id uuid)
RETURNS public.hr_site_iom_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.hr_site_iom_entries%ROWTYPE;
  v_person public.people%ROWTYPE;
  v_code text;
  v_site_id bigint;
  v_site_name text;
  v_today date := (timezone('Asia/Kolkata', now()))::date;
  v_user uuid := auth.uid();
  v_has_dob boolean;
BEGIN
  IF NOT public.current_user_can_access_module('hr') THEN
    RAISE EXCEPTION 'Permission denied.';
  END IF;

  IF p_entry_id IS NULL THEN
    RAISE EXCEPTION 'Entry is required.';
  END IF;

  SELECT * INTO v_row
  FROM public.hr_site_iom_entries
  WHERE id = p_entry_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'IOM entry not found.';
  END IF;

  IF v_row.entry_status = 'confirmed' THEN
    RETURN v_row;
  END IF;

  IF v_row.entry_status <> 'draft' THEN
    RAISE EXCEPTION 'Only draft entries can be confirmed.';
  END IF;

  IF nullif(btrim(v_row.employee_name), '') IS NULL THEN
    RAISE EXCEPTION 'Employee name is required.';
  END IF;

  IF nullif(btrim(v_row.site_name), '') IS NULL AND v_row.site_id IS NULL THEN
    RAISE EXCEPTION 'Site is required.';
  END IF;

  -- Resolve site
  IF v_row.site_id IS NOT NULL THEN
    SELECT s.id, s.site_name INTO v_site_id, v_site_name
    FROM public.sites s WHERE s.id = v_row.site_id;
  END IF;

  IF v_site_id IS NULL AND nullif(btrim(v_row.site_name), '') IS NOT NULL THEN
    SELECT s.id, s.site_name INTO v_site_id, v_site_name
    FROM public.sites s
    WHERE lower(btrim(s.site_name)) = lower(btrim(v_row.site_name))
    ORDER BY s.id
    LIMIT 1;
  END IF;

  IF v_site_id IS NULL THEN
    RAISE EXCEPTION 'Site not found. Pick a site from the master list.';
  END IF;

  v_site_name := coalesce(nullif(btrim(v_site_name), ''), btrim(v_row.site_name));

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'people' AND column_name = 'date_of_birth'
  ) INTO v_has_dob;

  IF v_row.rotation_type = 'New' THEN
    v_code := nullif(btrim(v_row.employee_code), '');
    v_code := public.hr_allocate_shared_employee_code(v_code);

    INSERT INTO public.people (
      unique_code,
      full_name,
      designation,
      father_name,
      phone_no,
      joining_date,
      pf_no,
      salary_basic,
      is_active
    ) VALUES (
      v_code,
      btrim(v_row.employee_name),
      coalesce(nullif(btrim(v_row.designation), ''), ''),
      coalesce(nullif(btrim(v_row.father_name), ''), ''),
      coalesce(nullif(btrim(v_row.contact_number), ''), ''),
      coalesce(v_row.date_of_joining, v_row.event_date, v_today),
      coalesce(nullif(btrim(v_row.pf_no), ''), ''),
      v_row.salary_amount,
      true
    )
    RETURNING * INTO v_person;

    IF v_has_dob AND v_row.date_of_birth IS NOT NULL THEN
      UPDATE public.people
      SET date_of_birth = v_row.date_of_birth
      WHERE id = v_person.id;
    END IF;

    INSERT INTO public.site_assignments (person_id, site_id, from_date, to_date)
    VALUES (v_person.id, v_site_id, coalesce(v_row.event_date, v_today), NULL);

  ELSE
    IF v_row.person_id IS NULL THEN
      RAISE EXCEPTION 'Select the existing site employee for this change.';
    END IF;

    SELECT * INTO v_person FROM public.people WHERE id = v_row.person_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Site employee not found.';
    END IF;

    v_code := coalesce(nullif(btrim(v_person.unique_code), ''), nullif(btrim(v_row.employee_code), ''));

    -- Snapshot previous values onto the IOM row if empty
    IF nullif(btrim(v_row.previous_designation), '') IS NULL THEN
      v_row.previous_designation := coalesce(v_person.designation, '');
    END IF;
    IF v_row.previous_salary_amount IS NULL THEN
      v_row.previous_salary_amount := v_person.salary_basic;
    END IF;
    IF nullif(btrim(v_row.previous_site_name), '') IS NULL THEN
      SELECT s.site_name INTO v_row.previous_site_name
      FROM public.site_assignments a
      JOIN public.sites s ON s.id = a.site_id
      WHERE a.person_id = v_person.id
        AND (a.to_date IS NULL OR a.to_date >= v_today)
      ORDER BY a.from_date DESC NULLS LAST
      LIMIT 1;
      v_row.previous_site_name := coalesce(v_row.previous_site_name, '');
    END IF;

    UPDATE public.people
    SET
      full_name = coalesce(nullif(btrim(v_row.employee_name), ''), full_name),
      designation = CASE
        WHEN v_row.rotation_type IN ('Promotion', 'Demotion', 'Transferred')
          THEN coalesce(nullif(btrim(v_row.designation), ''), designation)
        ELSE designation
      END,
      father_name = coalesce(nullif(btrim(v_row.father_name), ''), father_name),
      phone_no = coalesce(nullif(btrim(v_row.contact_number), ''), phone_no),
      pf_no = coalesce(nullif(btrim(v_row.pf_no), ''), pf_no),
      salary_basic = CASE
        WHEN v_row.rotation_type IN ('Revision of Salary', 'Promotion', 'Demotion', 'Transferred')
             AND v_row.salary_amount IS NOT NULL
          THEN v_row.salary_amount
        ELSE salary_basic
      END,
      joining_date = coalesce(joining_date, v_row.date_of_joining),
      is_active = true
    WHERE id = v_person.id
    RETURNING * INTO v_person;

    IF v_has_dob AND v_row.date_of_birth IS NOT NULL THEN
      UPDATE public.people
      SET date_of_birth = v_row.date_of_birth
      WHERE id = v_person.id;
    END IF;

    IF v_row.rotation_type = 'Transferred' THEN
      UPDATE public.site_assignments
      SET to_date = greatest(coalesce(v_row.event_date, v_today) - 1, from_date)
      WHERE person_id = v_person.id
        AND (to_date IS NULL OR to_date >= coalesce(v_row.event_date, v_today));

      INSERT INTO public.site_assignments (person_id, site_id, from_date, to_date)
      VALUES (v_person.id, v_site_id, coalesce(v_row.event_date, v_today), NULL);
    END IF;
  END IF;

  -- Upsert sensitive details from the IOM snapshot
  INSERT INTO public.people_sensitive_details (
    person_id, date_of_birth, aadhaar_no, pan_no, uan_no,
    bank_account_no, ifsc_code, updated_at, updated_by
  ) VALUES (
    v_person.id,
    v_row.date_of_birth,
    coalesce(nullif(btrim(v_row.aadhaar_no), ''), ''),
    coalesce(nullif(btrim(v_row.pan_no), ''), ''),
    coalesce(nullif(btrim(v_row.uan_no), ''), ''),
    coalesce(nullif(btrim(v_row.bank_account_no), ''), ''),
    coalesce(nullif(btrim(v_row.ifsc_code), ''), ''),
    now(),
    v_user
  )
  ON CONFLICT (person_id) DO UPDATE SET
    date_of_birth = coalesce(EXCLUDED.date_of_birth, public.people_sensitive_details.date_of_birth),
    aadhaar_no = CASE
      WHEN nullif(btrim(EXCLUDED.aadhaar_no), '') IS NOT NULL THEN EXCLUDED.aadhaar_no
      ELSE public.people_sensitive_details.aadhaar_no
    END,
    pan_no = CASE
      WHEN nullif(btrim(EXCLUDED.pan_no), '') IS NOT NULL THEN EXCLUDED.pan_no
      ELSE public.people_sensitive_details.pan_no
    END,
    uan_no = CASE
      WHEN nullif(btrim(EXCLUDED.uan_no), '') IS NOT NULL THEN EXCLUDED.uan_no
      ELSE public.people_sensitive_details.uan_no
    END,
    bank_account_no = CASE
      WHEN nullif(btrim(EXCLUDED.bank_account_no), '') IS NOT NULL THEN EXCLUDED.bank_account_no
      ELSE public.people_sensitive_details.bank_account_no
    END,
    ifsc_code = CASE
      WHEN nullif(btrim(EXCLUDED.ifsc_code), '') IS NOT NULL THEN EXCLUDED.ifsc_code
      ELSE public.people_sensitive_details.ifsc_code
    END,
    updated_at = now(),
    updated_by = v_user;

  UPDATE public.hr_site_iom_entries
  SET
    entry_status = 'confirmed',
    person_id = v_person.id,
    employee_code = coalesce(v_code, v_person.unique_code, employee_code),
    site_id = v_site_id,
    site_name = v_site_name,
    previous_site_name = coalesce(v_row.previous_site_name, previous_site_name),
    previous_designation = coalesce(v_row.previous_designation, previous_designation),
    previous_salary_amount = coalesce(v_row.previous_salary_amount, previous_salary_amount),
    confirmed_at = now(),
    confirmed_by = v_user,
    updated_at = now(),
    updated_by = v_user
  WHERE id = p_entry_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_site_iom_confirm_entry(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hr_site_iom_confirm_entry(uuid) TO authenticated;

COMMENT ON FUNCTION public.hr_site_iom_confirm_entry(uuid) IS
  'Confirms a draft site IOM entry: creates/updates people, site assignment, and sensitive details. Entry remains as history.';

NOTIFY pgrst, 'reload schema';
