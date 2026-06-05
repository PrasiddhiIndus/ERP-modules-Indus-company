-- L1/L2 reporting lines for Indus One org chart and leave approval (shared with LMS).
-- Idempotent: safe if columns were created in LMS migrations already.

ALTER TABLE public.admin_ifsp_employee_master
  ADD COLUMN IF NOT EXISTS l1_manager_code text,
  ADD COLUMN IF NOT EXISTS l2_manager_code text,
  ADD COLUMN IF NOT EXISTS l1_manager_name text,
  ADD COLUMN IF NOT EXISTS l2_manager_name text,
  ADD COLUMN IF NOT EXISTS hierarchy_sort_order integer;

COMMENT ON COLUMN public.admin_ifsp_employee_master.l1_manager_code IS
  'Direct manager employee code; org tree parent for get_employee_org_hierarchy().';
COMMENT ON COLUMN public.admin_ifsp_employee_master.l2_manager_code IS
  'Skip-level manager employee code; L2 leave approval routing.';
COMMENT ON COLUMN public.admin_ifsp_employee_master.hierarchy_sort_order IS
  'Org chart list order; Indus One org chart shows rows where this IS NOT NULL.';
