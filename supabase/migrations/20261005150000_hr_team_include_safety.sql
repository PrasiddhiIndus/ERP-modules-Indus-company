-- People Management L1 / L2 HR leads: include the Human Resource-Safety department.
-- is_hr_team_department() backs both list_hr_team_leads() and set_people_hr_leads(),
-- so the picker and the save validation stay in sync.

CREATE OR REPLACE FUNCTION public.is_hr_team_department(dept text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(regexp_replace(regexp_replace(btrim(coalesce(dept, '')), '\s*-\s*', '-', 'g'), '\s+', ' ', 'g')) IN (
    'hr', 'human resource', 'human resources', 'hr dept', 'hr department', 'dahej-hr',
    'human resource-safety', 'human resources-safety', 'hr-safety'
  )
$$;

COMMENT ON FUNCTION public.is_hr_team_department(text) IS
  'Employee Master departments that form the HR team for L1/L2 leads (HR, Dahej-HR, Human Resource-Safety and aliases).';
