-- Unified read-only employee directory: in-house (admin_ifsp_employee_master)
-- + site (people). Visibility/reporting only — does not allocate employee codes
-- and does not alter either source table.

CREATE OR REPLACE VIEW public.ifspl_all_employees
WITH (security_invoker = on)
AS
-- In-house employees (Admin / IFSPL Employee Master)
SELECT
  'in_house'::text AS employee_type,
  'admin_ifsp_employee_master'::text AS source_table,
  m.id::text AS source_id,
  nullif(btrim(coalesce(m.employee_code, '')), '') AS employee_code,
  nullif(btrim(coalesce(m.employee_id, '')), '') AS system_employee_id,
  nullif(btrim(coalesce(m.full_name, '')), '') AS full_name,
  nullif(btrim(coalesce(m.designation, '')), '') AS designation,
  nullif(btrim(coalesce(m.department, '')), '') AS department,
  null::text AS category_name,
  nullif(btrim(coalesce(m.father_name, '')), '') AS father_name,
  nullif(btrim(coalesce(m.personal_no, '')), '') AS phone_no,
  m.date_of_joining AS date_of_joining,
  m.date_of_leaving AS date_of_leaving,
  CASE
    WHEN lower(btrim(coalesce(m.status, ''))) = 'inactive' THEN false
    ELSE true
  END AS is_active,
  CASE
    WHEN lower(btrim(coalesce(m.status, ''))) = 'inactive' THEN 'Inactive'
    ELSE 'Active'
  END AS status,
  nullif(btrim(coalesce(m.employment_type, '')), '') AS employment_type,
  nullif(btrim(coalesce(m.location, '')), '') AS location,
  null::text AS pf_no,
  null::text AS esic_no,
  m.created_at,
  m.updated_at
FROM public.admin_ifsp_employee_master m

UNION ALL

-- Site employees (HR / people)
SELECT
  'site'::text AS employee_type,
  'people'::text AS source_table,
  p.id::text AS source_id,
  nullif(btrim(coalesce(p.unique_code, '')), '') AS employee_code,
  null::text AS system_employee_id,
  nullif(btrim(coalesce(p.full_name, '')), '') AS full_name,
  nullif(btrim(coalesce(p.designation, '')), '') AS designation,
  null::text AS department,
  nullif(btrim(coalesce(p.category_name, '')), '') AS category_name,
  nullif(btrim(coalesce(p.father_name, '')), '') AS father_name,
  nullif(btrim(coalesce(p.phone_no, '')), '') AS phone_no,
  p.joining_date AS date_of_joining,
  p.leaving_date AS date_of_leaving,
  coalesce(p.is_active, true) AS is_active,
  CASE
    WHEN coalesce(p.is_active, true) THEN 'Active'
    ELSE 'Inactive'
  END AS status,
  null::text AS employment_type,
  null::text AS location,
  nullif(btrim(coalesce(p.pf_no, '')), '') AS pf_no,
  nullif(btrim(coalesce(p.esic_no, '')), '') AS esic_no,
  p.created_at,
  null::timestamptz AS updated_at
FROM public.people p;

COMMENT ON VIEW public.ifspl_all_employees IS
  'Read-only unified employee directory: in-house (admin_ifsp_employee_master) + site (people). '
  'For visibility/reporting only. Employee code allocation stays on existing source-table logic.';

GRANT SELECT ON public.ifspl_all_employees TO authenticated;
GRANT SELECT ON public.ifspl_all_employees TO service_role;

NOTIFY pgrst, 'reload schema';
