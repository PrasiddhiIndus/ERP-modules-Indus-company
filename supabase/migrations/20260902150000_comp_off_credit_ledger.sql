-- C/O (Compensatory Off) credit ledger — earn on WO/NH/PH work, deduct on CO mark, 2-month expiry.
-- Scope: current calendar month onward only (no backfill). Does not alter PL/CL/SL leave workflow.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS indus_one.comp_off_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_code text NOT NULL,
  earned_date date NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('register_p', 'register_pod', 'punch')),
  source_register_id uuid REFERENCES public.admin_attendance_register (id) ON DELETE SET NULL,
  source_key text NOT NULL,
  credit_amount numeric(8, 2) NOT NULL DEFAULT 1 CHECK (credit_amount > 0),
  expiry_date date NOT NULL,
  consumed_amount numeric(8, 2) NOT NULL DEFAULT 0 CHECK (consumed_amount >= 0),
  remaining_amount numeric(8, 2) GENERATED ALWAYS AS (
    GREATEST(credit_amount - consumed_amount, 0)
  ) STORED,
  status text NOT NULL DEFAULT 'available' CHECK (
    status IN ('available', 'partial', 'consumed', 'expired', 'revoked')
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comp_off_credits_source_key_unique UNIQUE (source_key),
  CONSTRAINT comp_off_credits_employee_earned_unique UNIQUE (employee_code, earned_date),
  CONSTRAINT comp_off_credits_consumed_lte_credit CHECK (consumed_amount <= credit_amount)
);

CREATE INDEX IF NOT EXISTS idx_comp_off_credits_employee_expiry
  ON indus_one.comp_off_credits (employee_code, expiry_date, earned_date);

CREATE INDEX IF NOT EXISTS idx_comp_off_credits_employee_earned_month
  ON indus_one.comp_off_credits (employee_code, earned_date);

CREATE TABLE IF NOT EXISTS indus_one.comp_off_deductions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_code text NOT NULL,
  consumption_date date NOT NULL,
  register_id uuid REFERENCES public.admin_attendance_register (id) ON DELETE SET NULL,
  credit_id uuid NOT NULL REFERENCES indus_one.comp_off_credits (id) ON DELETE RESTRICT,
  amount numeric(8, 2) NOT NULL DEFAULT 1 CHECK (amount > 0),
  entry_type text NOT NULL CHECK (entry_type IN ('deduct', 'restore')),
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comp_off_deductions_idempotency_unique UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_comp_off_deductions_employee_date
  ON indus_one.comp_off_deductions (employee_code, consumption_date);

CREATE INDEX IF NOT EXISTS idx_comp_off_deductions_register
  ON indus_one.comp_off_deductions (register_id);

DROP TRIGGER IF EXISTS comp_off_credits_updated_at ON indus_one.comp_off_credits;
CREATE TRIGGER comp_off_credits_updated_at
  BEFORE UPDATE ON indus_one.comp_off_credits
  FOR EACH ROW EXECUTE FUNCTION indus_one.set_updated_at();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION indus_one.comp_off_cutoff_date()
RETURNS date
LANGUAGE sql
STABLE
AS $$
  SELECT date_trunc('month', (now() AT TIME ZONE 'Asia/Kolkata'))::date;
$$;

CREATE OR REPLACE FUNCTION indus_one.comp_off_normalize_mark(p_mark text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE upper(btrim(coalesce(p_mark, '')))
    WHEN 'C/O' THEN 'CO'
    WHEN 'COMP OFF' THEN 'CO'
    WHEN 'COMPENSATORY OFF' THEN 'CO'
    WHEN 'P(OD)' THEN 'P(OD)'
    WHEN 'POD' THEN 'P(OD)'
    ELSE upper(btrim(coalesce(p_mark, '')))
  END;
$$;

CREATE OR REPLACE FUNCTION indus_one.comp_off_is_present_mark(p_mark text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT indus_one.comp_off_normalize_mark(p_mark) IN ('P', 'P(OD)');
$$;

CREATE OR REPLACE FUNCTION indus_one.comp_off_is_co_mark(p_mark text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT indus_one.comp_off_normalize_mark(p_mark) = 'CO';
$$;

CREATE OR REPLACE FUNCTION indus_one.comp_off_is_earning_day(
  p_date date,
  p_prior_mark text DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    CASE
      WHEN p_date IS NULL THEN false
      WHEN indus_one.comp_off_normalize_mark(p_prior_mark) IN ('WO', 'NH/PH', 'NHPH') THEN true
      WHEN extract(dow FROM p_date) = 0 THEN true
      ELSE EXISTS (
        SELECT 1
        FROM public.admin_national_public_holidays h
        WHERE h.holiday_date = p_date
          AND h.holiday_type IN ('NH', 'PH')
      )
    END;
$$;

CREATE OR REPLACE FUNCTION indus_one.comp_off_is_earning_calendar_day(p_date date)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT indus_one.comp_off_is_earning_day(p_date, NULL);
$$;

CREATE OR REPLACE FUNCTION indus_one.comp_off_expiry_for_earned(p_earned date)
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (p_earned + interval '2 months')::date;
$$;

CREATE OR REPLACE FUNCTION indus_one.comp_off_refresh_credit_status(p_credit_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  r indus_one.comp_off_credits%ROWTYPE;
BEGIN
  SELECT * INTO r FROM indus_one.comp_off_credits WHERE id = p_credit_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF r.status = 'revoked' THEN RETURN; END IF;
  IF r.remaining_amount <= 0 THEN
    UPDATE indus_one.comp_off_credits SET status = 'consumed' WHERE id = p_credit_id;
    RETURN;
  END IF;
  IF r.expiry_date < (now() AT TIME ZONE 'Asia/Kolkata')::date THEN
    UPDATE indus_one.comp_off_credits SET status = 'expired' WHERE id = p_credit_id;
    RETURN;
  END IF;
  IF r.consumed_amount > 0 THEN
    UPDATE indus_one.comp_off_credits SET status = 'partial' WHERE id = p_credit_id;
  ELSE
    UPDATE indus_one.comp_off_credits SET status = 'available' WHERE id = p_credit_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION indus_one.expire_comp_off_credits(p_as_of date DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, indus_one
AS $$
DECLARE
  v_as_of date := coalesce(p_as_of, (now() AT TIME ZONE 'Asia/Kolkata')::date);
  v_count integer := 0;
BEGIN
  UPDATE indus_one.comp_off_credits c
  SET status = 'expired', updated_at = now()
  WHERE c.expiry_date < v_as_of
    AND c.remaining_amount > 0
    AND c.status NOT IN ('expired', 'revoked');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION indus_one.get_comp_off_available_balance(
  p_employee_code text,
  p_as_of date DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, indus_one
AS $$
DECLARE
  v_as_of date := coalesce(p_as_of, (now() AT TIME ZONE 'Asia/Kolkata')::date);
  v_code text := upper(btrim(coalesce(p_employee_code, '')));
  v_total numeric := 0;
BEGIN
  -- Read-only: do not UPDATE here (PostgREST STABLE = read-only txn).
  -- Expiry is applied by filtering expiry_date; status refresh runs on write paths / summary RPC.
  IF v_code = '' THEN RETURN 0; END IF;
  SELECT coalesce(sum(c.remaining_amount), 0)
  INTO v_total
  FROM indus_one.comp_off_credits c
  WHERE upper(btrim(c.employee_code)) = v_code
    AND c.earned_date >= indus_one.comp_off_cutoff_date()
    AND c.status IN ('available', 'partial')
    AND c.remaining_amount > 0
    AND c.expiry_date >= v_as_of;
  RETURN v_total;
END;
$$;

-- ---------------------------------------------------------------------------
-- Earn / revoke credits from register Present / P(OD) on WO/NH/PH days
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION indus_one.comp_off_try_earn_credit(
  p_employee_code text,
  p_earned_date date,
  p_register_id uuid,
  p_mark text,
  p_prior_mark text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, indus_one
AS $$
DECLARE
  v_code text := upper(btrim(coalesce(p_employee_code, '')));
  v_mark text := indus_one.comp_off_normalize_mark(p_mark);
  v_source text;
BEGIN
  IF v_code = '' OR p_earned_date IS NULL THEN RETURN; END IF;
  IF p_earned_date < indus_one.comp_off_cutoff_date() THEN RETURN; END IF;
  IF NOT indus_one.comp_off_is_present_mark(v_mark) THEN RETURN; END IF;
  IF NOT indus_one.comp_off_is_earning_day(p_earned_date, p_prior_mark) THEN RETURN; END IF;

  v_source := CASE
    WHEN v_mark = 'P(OD)' THEN 'register_pod'
    ELSE 'register_p'
  END;

  INSERT INTO indus_one.comp_off_credits (
    employee_code, earned_date, source_type, source_register_id, source_key,
    credit_amount, expiry_date, status
  )
  VALUES (
    v_code,
    p_earned_date,
    v_source,
    p_register_id,
    v_code || '|' || p_earned_date::text,
    1,
    indus_one.comp_off_expiry_for_earned(p_earned_date),
    'available'
  )
  ON CONFLICT (employee_code, earned_date) DO UPDATE
  SET
    source_register_id = coalesce(excluded.source_register_id, indus_one.comp_off_credits.source_register_id),
    source_type = excluded.source_type,
    status = CASE
      WHEN indus_one.comp_off_credits.status = 'revoked'
        AND indus_one.comp_off_credits.consumed_amount = 0
      THEN 'available'
      ELSE indus_one.comp_off_credits.status
    END,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION indus_one.comp_off_try_revoke_credit(
  p_employee_code text,
  p_earned_date date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, indus_one
AS $$
DECLARE
  v_code text := upper(btrim(coalesce(p_employee_code, '')));
BEGIN
  IF v_code = '' OR p_earned_date IS NULL THEN RETURN; END IF;
  IF p_earned_date < indus_one.comp_off_cutoff_date() THEN RETURN; END IF;

  UPDATE indus_one.comp_off_credits c
  SET status = 'revoked', updated_at = now()
  WHERE upper(btrim(c.employee_code)) = v_code
    AND c.earned_date = p_earned_date
    AND c.consumed_amount = 0
    AND c.status IN ('available', 'partial');
END;
$$;

-- ---------------------------------------------------------------------------
-- Deduct / restore on CO mark (FIFO by expiry)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION indus_one.comp_off_deduct_for_co_mark(
  p_employee_code text,
  p_consumption_date date,
  p_register_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, indus_one
AS $$
DECLARE
  v_code text := upper(btrim(coalesce(p_employee_code, '')));
  v_key text;
  v_credit_id uuid;
  v_as_of date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  IF v_code = '' OR p_consumption_date IS NULL THEN RETURN; END IF;
  IF p_consumption_date < indus_one.comp_off_cutoff_date() THEN RETURN; END IF;

  PERFORM indus_one.expire_comp_off_credits(v_as_of);

  v_key := coalesce(p_register_id::text, v_code || '|' || p_consumption_date::text) || ':deduct';
  IF EXISTS (SELECT 1 FROM indus_one.comp_off_deductions d WHERE d.idempotency_key = v_key) THEN
    RETURN;
  END IF;

  SELECT c.id
  INTO v_credit_id
  FROM indus_one.comp_off_credits c
  WHERE upper(btrim(c.employee_code)) = v_code
    AND c.earned_date >= indus_one.comp_off_cutoff_date()
    AND c.status IN ('available', 'partial')
    AND c.remaining_amount >= 1
    AND c.expiry_date >= v_as_of
  ORDER BY c.expiry_date ASC, c.earned_date ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_credit_id IS NULL THEN
    RAISE EXCEPTION 'Insufficient C/O balance for employee % on %', v_code, p_consumption_date
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE indus_one.comp_off_credits
  SET consumed_amount = consumed_amount + 1, updated_at = now()
  WHERE id = v_credit_id;

  INSERT INTO indus_one.comp_off_deductions (
    employee_code, consumption_date, register_id, credit_id, amount, entry_type, idempotency_key
  )
  VALUES (v_code, p_consumption_date, p_register_id, v_credit_id, 1, 'deduct', v_key);

  PERFORM indus_one.comp_off_refresh_credit_status(v_credit_id);
END;
$$;

CREATE OR REPLACE FUNCTION indus_one.comp_off_restore_for_co_unmark(
  p_employee_code text,
  p_consumption_date date,
  p_register_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, indus_one
AS $$
DECLARE
  v_code text := upper(btrim(coalesce(p_employee_code, '')));
  v_deduct_key text;
  v_restore_key text;
  v_deduct indus_one.comp_off_deductions%ROWTYPE;
BEGIN
  IF v_code = '' OR p_consumption_date IS NULL THEN RETURN; END IF;
  IF p_consumption_date < indus_one.comp_off_cutoff_date() THEN RETURN; END IF;

  v_deduct_key := coalesce(p_register_id::text, v_code || '|' || p_consumption_date::text) || ':deduct';
  v_restore_key := coalesce(p_register_id::text, v_code || '|' || p_consumption_date::text) || ':restore';

  IF EXISTS (SELECT 1 FROM indus_one.comp_off_deductions d WHERE d.idempotency_key = v_restore_key) THEN
    RETURN;
  END IF;

  SELECT * INTO v_deduct
  FROM indus_one.comp_off_deductions d
  WHERE d.idempotency_key = v_deduct_key
    AND d.entry_type = 'deduct'
  LIMIT 1;

  IF NOT FOUND THEN RETURN; END IF;

  UPDATE indus_one.comp_off_credits
  SET consumed_amount = greatest(consumed_amount - v_deduct.amount, 0), updated_at = now()
  WHERE id = v_deduct.credit_id;

  -- Clearing CO deletes the register row; do not insert a dead register_id (FK 23503).
  IF p_register_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.admin_attendance_register r WHERE r.id = p_register_id
  ) THEN
    INSERT INTO indus_one.comp_off_deductions (
      employee_code, consumption_date, register_id, credit_id, amount, entry_type, idempotency_key
    )
    VALUES (
      v_code, p_consumption_date, NULL, v_deduct.credit_id, v_deduct.amount, 'restore', v_restore_key
    );
  ELSE
    INSERT INTO indus_one.comp_off_deductions (
      employee_code, consumption_date, register_id, credit_id, amount, entry_type, idempotency_key
    )
    VALUES (
      v_code, p_consumption_date, p_register_id, v_deduct.credit_id, v_deduct.amount, 'restore', v_restore_key
    );
  END IF;

  PERFORM indus_one.comp_off_refresh_credit_status(v_deduct.credit_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- Register mark change orchestrator (idempotent)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION indus_one.process_comp_off_register_change(
  p_employee_code text,
  p_register_date date,
  p_old_mark text,
  p_new_mark text,
  p_register_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, indus_one
AS $$
DECLARE
  v_old text := indus_one.comp_off_normalize_mark(p_old_mark);
  v_new text := indus_one.comp_off_normalize_mark(p_new_mark);
BEGIN
  IF p_register_date IS NULL THEN RETURN; END IF;

  -- Earn / revoke from Present on WO/NH/PH
  IF indus_one.comp_off_is_present_mark(v_new)
     AND indus_one.comp_off_is_earning_day(p_register_date, p_old_mark) THEN
    PERFORM indus_one.comp_off_try_earn_credit(
      p_employee_code, p_register_date, p_register_id, v_new, p_old_mark
    );
  END IF;

  IF indus_one.comp_off_is_present_mark(v_old)
     AND NOT indus_one.comp_off_is_present_mark(v_new)
     AND indus_one.comp_off_is_earning_day(p_register_date, p_old_mark) THEN
    PERFORM indus_one.comp_off_try_revoke_credit(p_employee_code, p_register_date);
  END IF;

  -- CO consumption
  IF indus_one.comp_off_is_co_mark(v_new) AND NOT indus_one.comp_off_is_co_mark(v_old) THEN
    PERFORM indus_one.comp_off_deduct_for_co_mark(p_employee_code, p_register_date, p_register_id);
  END IF;

  IF indus_one.comp_off_is_co_mark(v_old) AND NOT indus_one.comp_off_is_co_mark(v_new) THEN
    PERFORM indus_one.comp_off_restore_for_co_unmark(p_employee_code, p_register_date, p_register_id);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION indus_one.trg_comp_off_register_mark()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, indus_one
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM indus_one.process_comp_off_register_change(
      OLD.employee_code, OLD.register_date, OLD.mark, NULL, OLD.id
    );
    RETURN OLD;
  END IF;

  PERFORM indus_one.process_comp_off_register_change(
    NEW.employee_code,
    NEW.register_date,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.mark ELSE NULL END,
    NEW.mark,
    NEW.id
  );
  RETURN NEW;
EXCEPTION
  WHEN SQLSTATE 'P0001' THEN
    RAISE;
END;
$$;

DROP TRIGGER IF EXISTS comp_off_register_mark_trg ON public.admin_attendance_register;
CREATE TRIGGER comp_off_register_mark_trg
  AFTER INSERT OR UPDATE OF mark, employee_code, register_date OR DELETE
  ON public.admin_attendance_register
  FOR EACH ROW
  EXECUTE FUNCTION indus_one.trg_comp_off_register_mark();

-- ---------------------------------------------------------------------------
-- Month-wise summary for UI (current month onward within selected year)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION indus_one.fetch_comp_off_monthly_summary(p_year integer)
RETURNS TABLE (
  employee_code text,
  month_key text,
  earned numeric,
  used numeric,
  expired numeric,
  available numeric
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, indus_one
AS $$
DECLARE
  v_cutoff date := indus_one.comp_off_cutoff_date();
  v_cutoff_year integer := extract(year FROM v_cutoff)::integer;
  v_cutoff_month integer := extract(month FROM v_cutoff)::integer;
  v_as_of date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  -- VOLATILE so PostgREST uses a writable transaction (expire updates credit status).
  PERFORM indus_one.expire_comp_off_credits(v_as_of);

  RETURN QUERY
  WITH months AS (
    SELECT to_char(make_date(p_year, m, 1), 'YYYY-MM') AS mk, m AS mon
    FROM generate_series(1, 12) AS m
    WHERE p_year > v_cutoff_year OR (p_year = v_cutoff_year AND m >= v_cutoff_month)
  ),
  employees AS (
    SELECT DISTINCT upper(btrim(c.employee_code)) AS emp
    FROM indus_one.comp_off_credits c
    WHERE extract(year FROM c.earned_date)::integer = p_year
      AND c.earned_date >= v_cutoff
    UNION
    SELECT DISTINCT upper(btrim(d.employee_code)) AS emp
    FROM indus_one.comp_off_deductions d
    WHERE extract(year FROM d.consumption_date)::integer = p_year
      AND d.consumption_date >= v_cutoff
    UNION
    SELECT upper(btrim(m.employee_code)) AS emp
    FROM public.admin_ifsp_employee_master m
    WHERE coalesce(m.employee_code, '') <> ''
  ),
  grid AS (
    SELECT e.emp, mo.mk, mo.mon
    FROM employees e
    CROSS JOIN months mo
  ),
  earned_agg AS (
    SELECT
      upper(btrim(c.employee_code)) AS emp,
      to_char(c.earned_date, 'YYYY-MM') AS mk,
      sum(c.credit_amount)::numeric AS earned
    FROM indus_one.comp_off_credits c
    WHERE c.earned_date >= v_cutoff
      AND extract(year FROM c.earned_date)::integer = p_year
      AND c.status <> 'revoked'
    GROUP BY 1, 2
  ),
  used_agg AS (
    SELECT
      upper(btrim(d.employee_code)) AS emp,
      to_char(d.consumption_date, 'YYYY-MM') AS mk,
      sum(d.amount)::numeric AS used
    FROM indus_one.comp_off_deductions d
    WHERE d.entry_type = 'deduct'
      AND d.consumption_date >= v_cutoff
      AND extract(year FROM d.consumption_date)::integer = p_year
    GROUP BY 1, 2
  ),
  expired_agg AS (
    SELECT
      upper(btrim(c.employee_code)) AS emp,
      to_char(c.expiry_date, 'YYYY-MM') AS mk,
      sum(c.remaining_amount)::numeric AS expired
    FROM indus_one.comp_off_credits c
    WHERE c.status = 'expired'
      AND c.earned_date >= v_cutoff
      AND extract(year FROM c.expiry_date)::integer = p_year
    GROUP BY 1, 2
  ),
  available_now AS (
    SELECT
      upper(btrim(c.employee_code)) AS emp,
      sum(c.remaining_amount)::numeric AS avail
    FROM indus_one.comp_off_credits c
    WHERE c.earned_date >= v_cutoff
      AND c.status IN ('available', 'partial')
      AND c.remaining_amount > 0
      AND c.expiry_date >= v_as_of
    GROUP BY 1
  )
  SELECT
    g.emp AS employee_code,
    g.mk AS month_key,
    coalesce(ea.earned, 0) AS earned,
    coalesce(ua.used, 0) AS used,
    coalesce(xa.expired, 0) AS expired,
    CASE
      WHEN g.mk = to_char(v_as_of, 'YYYY-MM') THEN coalesce(an.avail, 0)
      ELSE 0::numeric
    END AS available
  FROM grid g
  LEFT JOIN earned_agg ea ON ea.emp = g.emp AND ea.mk = g.mk
  LEFT JOIN used_agg ua ON ua.emp = g.emp AND ua.mk = g.mk
  LEFT JOIN expired_agg xa ON xa.emp = g.emp AND xa.mk = g.mk
  LEFT JOIN available_now an ON an.emp = g.emp
  WHERE coalesce(ea.earned, 0) > 0
     OR coalesce(ua.used, 0) > 0
     OR coalesce(xa.expired, 0) > 0
     OR (g.mk = to_char(v_as_of, 'YYYY-MM') AND coalesce(an.avail, 0) > 0)
  ORDER BY g.emp, g.mk;
END;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE indus_one.comp_off_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE indus_one.comp_off_deductions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS comp_off_credits_select ON indus_one.comp_off_credits;
CREATE POLICY comp_off_credits_select ON indus_one.comp_off_credits
  FOR SELECT TO authenticated
  USING (
    (SELECT public.current_user_has_attendance_admin_access())
    OR upper(btrim(employee_code)) = upper(btrim(coalesce(public.current_user_employee_code(), '')))
  );

DROP POLICY IF EXISTS comp_off_deductions_select ON indus_one.comp_off_deductions;
CREATE POLICY comp_off_deductions_select ON indus_one.comp_off_deductions
  FOR SELECT TO authenticated
  USING (
    (SELECT public.current_user_has_attendance_admin_access())
    OR upper(btrim(employee_code)) = upper(btrim(coalesce(public.current_user_employee_code(), '')))
  );

GRANT SELECT ON indus_one.comp_off_credits TO authenticated;
GRANT SELECT ON indus_one.comp_off_deductions TO authenticated;
GRANT EXECUTE ON FUNCTION indus_one.get_comp_off_available_balance(text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION indus_one.fetch_comp_off_monthly_summary(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION indus_one.expire_comp_off_credits(date) TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE indus_one.comp_off_credits;
    ALTER PUBLICATION supabase_realtime ADD TABLE indus_one.comp_off_deductions;
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
