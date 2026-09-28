-- =============================================================================
-- C/O: approved tour days (register mark T) count as P(OD).
--
-- The Daily Register stores tours as T but shows them as P(OD). C/O only
-- recognised P / P(OD) / HD, so P(OD)-on-WO shown in the grid never earned.
-- Mapping T → P(OD) inside the C/O ledger applies the existing department
-- rules unchanged (e.g. Production* / R&M Sunday: P(OD) earns +1).
--
-- Only the C/O mark normaliser changes (used by indus_one.comp_off_* only).
-- Writes only indus_one.comp_off_credits via the one-time reconcile below.
-- =============================================================================

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
    WHEN 'T' THEN 'P(OD)'
    ELSE upper(btrim(coalesce(p_mark, '')))
  END;
$$;

-- Credit tour / P(OD) days already in the register since the C/O start date.
SELECT indus_one.reconcile_comp_off_credits_from_register();

NOTIFY pgrst, 'reload schema';
