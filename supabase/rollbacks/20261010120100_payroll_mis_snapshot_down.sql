-- Rollback for 20261010120100_payroll_mis_snapshot.sql
-- Removes the after-lock trigger, report functions, snapshot and statutory payment tables.
-- The salary month runs, lines and lock behaviour are untouched.
-- Challan files are kept in storage; the bucket row is removed only when it is empty.

DROP TRIGGER IF EXISTS trg_admin_payroll_mis_after_lock ON public.admin_salary_month_runs;

DROP FUNCTION IF EXISTS public.admin_payroll_mis_mark_paid(uuid, date, text, numeric, numeric, text);
DROP FUNCTION IF EXISTS public.admin_payroll_mis_register_totals(text, text);
DROP FUNCTION IF EXISTS public.admin_payroll_mis_rows(text, text);
DROP FUNCTION IF EXISTS public.admin_payroll_mis_months();
DROP FUNCTION IF EXISTS public.admin_payroll_mis_row_visible(text, text, bigint);
DROP FUNCTION IF EXISTS public.admin_payroll_mis_rebuild_snapshot(uuid);
DROP FUNCTION IF EXISTS public.admin_payroll_mis_after_lock();
DROP FUNCTION IF EXISTS public.admin_payroll_mis_build_snapshot(uuid);
DROP FUNCTION IF EXISTS public.admin_payroll_mis_sync_statutory_payments(uuid);
DROP FUNCTION IF EXISTS public.admin_payroll_mis_due_date(text, text, text);

DROP POLICY IF EXISTS payroll_statutory_challans_select ON storage.objects;
DROP POLICY IF EXISTS payroll_statutory_challans_insert ON storage.objects;
DROP POLICY IF EXISTS payroll_statutory_challans_update ON storage.objects;
DROP POLICY IF EXISTS payroll_statutory_challans_delete ON storage.objects;
DELETE FROM storage.buckets b
WHERE b.id = 'payroll-statutory-challans'
  AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = b.id);

DROP TABLE IF EXISTS public.admin_payroll_statutory_payments;
DROP TABLE IF EXISTS public.admin_payroll_mis_snapshot;

NOTIFY pgrst, 'reload schema';
