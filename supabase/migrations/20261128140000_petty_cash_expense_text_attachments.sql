-- Petty Cash: free-text expense category + voucher attachments (Cloudflare R2 keys).
--
-- Changes:
--   • expense_category master table removed — daily entry stores a free-text name
--   • petty_cash_voucher.expense_category_id → expense_category_name (text)
--   • petty_cash_voucher.attachments jsonb — [{ objectKey, fileName, contentType }]
--   • Overhead delete blocked when vouchers still reference it
--
-- Rollback: supabase/rollbacks/20261128140000_petty_cash_expense_text_attachments_down.sql

-- ---------------------------------------------------------------------------
-- 1) Add new voucher columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.petty_cash_voucher
  ADD COLUMN IF NOT EXISTS expense_category_name text,
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- 2) Copy expense category names onto vouchers (while expense_category still exists)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'petty_cash_voucher'
      AND column_name = 'expense_category_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'expense_category'
  ) THEN
    UPDATE public.petty_cash_voucher v
    SET expense_category_name = COALESCE(
      (
        SELECT btrim(ec.name)
        FROM public.expense_category ec
        WHERE ec.id = v.expense_category_id
      ),
      NULLIF(btrim(v.expense_category_name), ''),
      'Unspecified'
    )
    WHERE v.expense_category_name IS NULL OR btrim(v.expense_category_name) = '';
  ELSE
    UPDATE public.petty_cash_voucher
    SET expense_category_name = 'Unspecified'
    WHERE expense_category_name IS NULL OR btrim(expense_category_name) = '';
  END IF;
END $$;

ALTER TABLE public.petty_cash_voucher
  ALTER COLUMN expense_category_name SET NOT NULL;

ALTER TABLE public.petty_cash_voucher
  DROP CONSTRAINT IF EXISTS petty_cash_voucher_expense_category_name_check;

ALTER TABLE public.petty_cash_voucher
  ADD CONSTRAINT petty_cash_voucher_expense_category_name_check
  CHECK (btrim(expense_category_name) <> '');

COMMENT ON COLUMN public.petty_cash_voucher.expense_category_name IS
  'Free-text expense category entered on Daily Expense Entry (no master list).';
COMMENT ON COLUMN public.petty_cash_voucher.attachments IS
  'Cloudflare R2 attachment metadata: [{ "objectKey", "fileName", "contentType" }].';

-- ---------------------------------------------------------------------------
-- 3) Drop dependents FIRST (view uses expense_category_id), then remove the column
-- ---------------------------------------------------------------------------

DROP VIEW IF EXISTS public.expense_category_usage CASCADE;

ALTER TABLE public.petty_cash_voucher
  DROP CONSTRAINT IF EXISTS fk_petty_cash_voucher_expense_category;

DROP INDEX IF EXISTS public.idx_petty_cash_voucher_category_date;

ALTER TABLE public.petty_cash_voucher
  DROP COLUMN IF EXISTS expense_category_id;

-- ---------------------------------------------------------------------------
-- 4) Delete expense category master data + table
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_expense_category_before_write ON public.expense_category;
DROP TRIGGER IF EXISTS trg_expense_category_before_delete ON public.expense_category;
DROP FUNCTION IF EXISTS public.expense_category_before_write();
DROP FUNCTION IF EXISTS public.expense_category_before_delete();

-- Clear rows then drop table (safe if already gone).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'expense_category'
  ) THEN
    DELETE FROM public.expense_category;
  END IF;
END $$;

DROP TABLE IF EXISTS public.expense_category CASCADE;

CREATE INDEX IF NOT EXISTS idx_petty_cash_voucher_overhead_date
  ON public.petty_cash_voucher (overhead_category_id, expense_date);

CREATE INDEX IF NOT EXISTS idx_petty_cash_voucher_expense_name
  ON public.petty_cash_voucher (lower(btrim(expense_category_name)));

COMMENT ON TABLE public.petty_cash_voucher IS
  'Petty Cash daily expense vouchers (PCV-YYMM-NNNN). Expense category is free text; files live in R2 under petty-cash/.';

-- ---------------------------------------------------------------------------
-- 5) Overhead delete: block when vouchers still reference the overhead
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.overhead_category_before_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM public.petty_cash_voucher WHERE overhead_category_id = OLD.id;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Cannot delete "%": it is used on % voucher%.',
      OLD.name, v_count, CASE WHEN v_count = 1 THEN '' ELSE 's' END
      USING ERRCODE = 'P0001', HINT = 'petty_cash_overhead_in_use';
  END IF;
  RETURN OLD;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6) Voucher insert: trim free-text category
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.petty_cash_voucher_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_prefix text;
  v_next int;
BEGIN
  NEW.description := btrim(NEW.description);
  NEW.paid_to := btrim(NEW.paid_to);
  NEW.expense_category_name := btrim(NEW.expense_category_name);
  IF NEW.attachments IS NULL THEN
    NEW.attachments := '[]'::jsonb;
  END IF;
  NEW.created_by := auth.uid();
  v_prefix := 'PCV-' || to_char(NEW.expense_date, 'YYMM') || '-';
  PERFORM pg_advisory_xact_lock(hashtext('public.petty_cash_voucher.no.' || v_prefix));
  SELECT COALESCE(MAX(substring(voucher_no FROM length(v_prefix) + 1)::int), 0) + 1
    INTO v_next
    FROM public.petty_cash_voucher
   WHERE voucher_no LIKE v_prefix || '%'
     AND substring(voucher_no FROM length(v_prefix) + 1) ~ '^\d+$';
  NEW.voucher_no := v_prefix || lpad(v_next::text, 4, '0');
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.current_user_can_manage_petty_cash_masters() IS
  'True when the caller may add / edit / delete Petty Cash overhead categories. Super Admin always; everyone else only with admin.petty-cash.manage-masters.';

-- ---------------------------------------------------------------------------
-- 7) Overhead usage view (replaces expense_category_usage)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.overhead_category_usage
WITH (security_invoker = true) AS
SELECT
  oh.id AS overhead_category_id,
  count(v.id)::int AS voucher_count,
  COALESCE(sum(v.amount) FILTER (
    WHERE v.expense_date >= date_trunc('month', (now() AT TIME ZONE 'Asia/Kolkata'))::date
      AND v.expense_date <  (date_trunc('month', (now() AT TIME ZONE 'Asia/Kolkata')) + interval '1 month')::date
  ), 0)::numeric(14, 2) AS spent_this_month
FROM public.overhead_category oh
LEFT JOIN public.petty_cash_voucher v ON v.overhead_category_id = oh.id
GROUP BY oh.id;

COMMENT ON VIEW public.overhead_category_usage IS
  'Voucher count and current-month (IST) spend per Petty Cash overhead category.';

GRANT SELECT ON public.overhead_category_usage TO authenticated;
REVOKE ALL ON public.overhead_category_usage FROM anon;
