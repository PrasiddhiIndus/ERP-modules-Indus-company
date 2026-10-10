-- =============================================================================
-- Bug: marking an employee Inactive in Employee Master deactivated the login of
-- the admin / HR user who CREATED that employee, while the employee who left
-- kept their login.
--
-- Cause: Employee Master create / import / recruitment conversion stored the
-- creator's auth uid in admin_ifsp_employee_master.user_id, and the status sync
-- trigger deactivates profiles by user_id first (code match only as fallback).
--
-- Fix:
-- 1) Status sync matches the login by employee code only, runs only when the
--    active/inactive state or code actually changes, and never deactivates a
--    login while another Active master row still carries the same code.
-- 2) Repair user_id: point it at the profile with the same employee code, or
--    NULL when no such profile exists (user_id = the employee's own login, used
--    by letters / policies / joining documents access).
-- 3) Re-activate logins that were switched off only because of (2), then apply
--    the intended sync so employees who left lose access.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.sync_profile_is_active_from_employee_master()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  want_active boolean;
  code text;
BEGIN
  want_active := lower(btrim(coalesce(NEW.status, 'Active'))) <> 'inactive';
  code := public.norm_emp_code(NEW.employee_code);

  IF code IS NULL OR code = '' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND want_active THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND want_active = (lower(btrim(coalesce(OLD.status, 'Active'))) <> 'inactive')
     AND code = coalesce(public.norm_emp_code(OLD.employee_code), '') THEN
    RETURN NEW;
  END IF;

  IF NOT want_active AND EXISTS (
    SELECT 1
    FROM public.admin_ifsp_employee_master o
    WHERE o.id <> NEW.id
      AND public.norm_emp_code(o.employee_code) = code
      AND lower(btrim(coalesce(o.status, 'Active'))) <> 'inactive'
  ) THEN
    RETURN NEW;
  END IF;

  UPDATE public.profiles p
  SET
    is_active = want_active,
    updated_at = now()
  WHERE public.norm_emp_code(p.employee_code) = code
    AND p.is_active IS DISTINCT FROM want_active;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_profile_is_active_from_employee_master() IS
  'Mirrors admin_ifsp_employee_master.status onto the profile with the same '
  'employee code, only when the active state or code changes.';

-- user_id must be the employee's own login (same employee code) — never the
-- admin / HR user who saved the row.
CREATE OR REPLACE FUNCTION public.employee_master_link_own_login()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  code text;
BEGIN
  code := coalesce(public.norm_emp_code(NEW.employee_code), '');

  IF NEW.user_id IS NOT NULL AND code <> '' AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = NEW.user_id AND public.norm_emp_code(p.employee_code) = code
  ) THEN
    RETURN NEW;
  END IF;

  IF code = '' THEN
    NEW.user_id := NULL;
  ELSE
    SELECT p.id INTO NEW.user_id
    FROM public.profiles p
    WHERE public.norm_emp_code(p.employee_code) = code
    LIMIT 1;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_employee_master_link_own_login ON public.admin_ifsp_employee_master;
CREATE TRIGGER trg_employee_master_link_own_login
  BEFORE INSERT OR UPDATE OF user_id, employee_code
  ON public.admin_ifsp_employee_master
  FOR EACH ROW
  EXECUTE FUNCTION public.employee_master_link_own_login();

-- ---------------------------------------------------------------------------
-- Data repair
-- ---------------------------------------------------------------------------

-- Logins switched off by an Inactive master row that belongs to someone else.
CREATE TEMP TABLE _wrongly_deactivated ON COMMIT DROP AS
SELECT DISTINCT p.id
FROM public.profiles p
JOIN public.admin_ifsp_employee_master m ON m.user_id = p.id
WHERE p.is_active = false
  AND lower(btrim(coalesce(m.status, ''))) = 'inactive'
  AND coalesce(public.norm_emp_code(m.employee_code), '')
      IS DISTINCT FROM coalesce(public.norm_emp_code(p.employee_code), '')
  -- Keep off if the user's own employee record is Inactive with no Active row.
  AND NOT (
    coalesce(public.norm_emp_code(p.employee_code), '') <> ''
    AND EXISTS (
      SELECT 1 FROM public.admin_ifsp_employee_master own
      WHERE public.norm_emp_code(own.employee_code) = public.norm_emp_code(p.employee_code)
        AND lower(btrim(coalesce(own.status, ''))) = 'inactive'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.admin_ifsp_employee_master own
      WHERE public.norm_emp_code(own.employee_code) = public.norm_emp_code(p.employee_code)
        AND lower(btrim(coalesce(own.status, 'Active'))) <> 'inactive'
    )
  );

-- Point user_id at the employee's own login (same code), else clear it.
UPDATE public.admin_ifsp_employee_master m
SET user_id = (
  SELECT p.id
  FROM public.profiles p
  WHERE coalesce(public.norm_emp_code(m.employee_code), '') <> ''
    AND public.norm_emp_code(p.employee_code) = public.norm_emp_code(m.employee_code)
  LIMIT 1
)
WHERE m.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = m.user_id
      AND coalesce(public.norm_emp_code(p.employee_code), '') <> ''
      AND public.norm_emp_code(p.employee_code) = public.norm_emp_code(m.employee_code)
  );

UPDATE public.profiles p
SET is_active = true, updated_at = now()
FROM _wrongly_deactivated w
WHERE p.id = w.id;

-- Employees whose every master row is Inactive lose ERP access.
UPDATE public.profiles p
SET is_active = false, updated_at = now()
WHERE p.is_active = true
  AND coalesce(public.norm_emp_code(p.employee_code), '') <> ''
  AND EXISTS (
    SELECT 1 FROM public.admin_ifsp_employee_master m
    WHERE public.norm_emp_code(m.employee_code) = public.norm_emp_code(p.employee_code)
      AND lower(btrim(coalesce(m.status, ''))) = 'inactive'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.admin_ifsp_employee_master m
    WHERE public.norm_emp_code(m.employee_code) = public.norm_emp_code(p.employee_code)
      AND lower(btrim(coalesce(m.status, 'Active'))) <> 'inactive'
  );

NOTIFY pgrst, 'reload schema';
