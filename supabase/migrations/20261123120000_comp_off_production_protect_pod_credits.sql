-- =============================================================================
-- Production C/O: stop punch / WO-cell sync from revoking valid P(OD) credits.
--
-- Root cause (live example FTC-8 / Bharatbhai Chauhan, 2026-09-13):
--   1) Credit earned as source_type = register_pod from P(OD)/tour.
--   2) Later attendance update reset the cell to WO (with machine punch present).
--   3) process_comp_off_register_change / reconcile called
--      comp_off_try_earn_credit(..., mark 'P', ...).
--   4) Pod-only branch revoked ANY unconsumed credit for that day — including
--      the valid register_pod row.
--
-- Fix (engine, co.sunday_pod_only employees — Production* primary; same branch
-- also covers other pod-only depts with identical bug):
--   * If register mark is still P(OD)/tour → do not revoke, do not punch-earn.
--   * Else revoke only non-POD leftovers; revoke register_pod only when the
--     register was demoted to plain P/HD.
--   * WO / NH/PH / empty cell must not clobber historical register_pod.
--
-- Data repair (Production* only):
--   Restore verified revoked unconsumed credits:
--     * source_type = register_pod (not 3rd-Saturday excluded days)
--     * or manual + current register mark P(OD)/tour, not expired, not 3rd-Sat
--   Past-expiry POD rows → status expired (ledger truth; no usable balance).
--   Do not restore register_p punch credits or consumed rows.
--
-- Does not change: other departments' balances, leave, punches, register marks,
-- M&M rules, or global earning-day / 3rd-Saturday policy.
-- Rollback: supabase/rollbacks/20261123120000_comp_off_production_protect_pod_credits_down.sql
-- =============================================================================

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
  v_code text := indus_one.comp_off_norm_emp(p_employee_code);
  v_mark text := indus_one.comp_off_normalize_mark(p_mark);
  v_source text;
  v_reg_mark text;
BEGIN
  IF v_code = '' OR p_earned_date IS NULL THEN RETURN; END IF;
  IF p_earned_date < indus_one.comp_off_cutoff_date() THEN RETURN; END IF;
  IF NOT indus_one.comp_off_is_present_mark(v_mark) THEN RETURN; END IF;
  IF NOT public.admin_rule_earns_co(v_code, p_earned_date) THEN RETURN; END IF;
  IF NOT indus_one.comp_off_is_earning_day(p_earned_date, p_prior_mark, v_code) THEN RETURN; END IF;

  -- Pod-only departments: machine punch P/HD does not earn.
  -- Must not revoke a valid P(OD) credit when punch/reconcile re-enters with 'P'
  -- after the cell was reset to WO/NH/PH, or while register still shows P(OD).
  IF indus_one.comp_off_sunday_pod_only_employee(v_code)
     AND v_mark IS DISTINCT FROM 'P(OD)' THEN
    SELECT indus_one.comp_off_normalize_mark(r.mark)
    INTO v_reg_mark
    FROM public.admin_attendance_register r
    WHERE indus_one.comp_off_codes_match(r.employee_code, v_code)
      AND r.register_date = p_earned_date
    ORDER BY r.id DESC
    LIMIT 1;

    IF v_reg_mark = 'P(OD)' THEN
      RETURN;
    END IF;

    UPDATE indus_one.comp_off_credits c
    SET status = 'revoked',
        updated_at = now()
    WHERE indus_one.comp_off_norm_emp(c.employee_code) = v_code
      AND c.earned_date = p_earned_date
      AND coalesce(c.consumed_amount, 0) = 0
      AND c.status IN ('available', 'partial')
      AND (
        c.source_type IS DISTINCT FROM 'register_pod'
        OR v_reg_mark IN ('P', 'HD')
      );
    RETURN;
  END IF;

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
    source_key = excluded.source_key,
    status = CASE
      WHEN indus_one.comp_off_credits.status = 'revoked'
        AND indus_one.comp_off_credits.consumed_amount = 0
      THEN 'available'
      ELSE indus_one.comp_off_credits.status
    END,
    updated_at = now();
END;
$$;

COMMENT ON FUNCTION indus_one.comp_off_try_earn_credit(text, date, uuid, text, text) IS
  'Earn C/O when co.earn is on and day qualifies. Pod-only: P(OD) only; punch/WO sync must not revoke existing register_pod.';

-- ---------------------------------------------------------------------------
-- Production* data repair — restore only verified invalid revokes
-- ---------------------------------------------------------------------------
WITH production_revoked AS (
  SELECT
    c.id,
    c.earned_date,
    c.source_type,
    c.expiry_date,
    indus_one.comp_off_normalize_mark(r.mark) AS mark_norm,
    (c.expiry_date >= (now() AT TIME ZONE 'Asia/Kolkata')::date) AS not_expired,
    indus_one.comp_off_is_third_saturday(c.earned_date)
      AND indus_one.comp_off_third_saturday_excluded_employee(c.employee_code) AS is_blocked_third_sat
  FROM indus_one.comp_off_credits c
  JOIN public.admin_ifsp_employee_master m
    ON indus_one.comp_off_norm_emp(m.employee_code)
     = indus_one.comp_off_norm_emp(c.employee_code)
  LEFT JOIN LATERAL (
    SELECT r2.mark
    FROM public.admin_attendance_register r2
    WHERE indus_one.comp_off_codes_match(r2.employee_code, c.employee_code)
      AND r2.register_date = c.earned_date
    ORDER BY r2.id DESC
    LIMIT 1
  ) r ON true
  WHERE c.earned_date >= indus_one.comp_off_cutoff_date()
    AND c.status = 'revoked'
    AND coalesce(c.consumed_amount, 0) = 0
    AND public.admin_rule_norm_department(m.department) LIKE 'production%'
),
to_fix AS (
  SELECT
    id,
    CASE
      WHEN not_expired THEN 'available'::text
      ELSE 'expired'::text
    END AS new_status
  FROM production_revoked
  WHERE NOT is_blocked_third_sat
    AND (
      source_type = 'register_pod'
      OR (source_type = 'manual' AND mark_norm = 'P(OD)' AND not_expired)
    )
)
UPDATE indus_one.comp_off_credits c
SET status = t.new_status,
    updated_at = now()
FROM to_fix t
WHERE c.id = t.id;

NOTIFY pgrst, 'reload schema';
