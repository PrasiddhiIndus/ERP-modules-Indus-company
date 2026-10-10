-- Rollback for 20261010100000_fix_employee_master_inactive_wrong_login.sql
-- Restores the previous status sync (user_id first, else employee_code) and drops
-- the own-login guard. Data repairs (user_id relinking, re-activated / deactivated
-- logins) are not reverted.

DROP TRIGGER IF EXISTS trg_employee_master_link_own_login ON public.admin_ifsp_employee_master;
DROP FUNCTION IF EXISTS public.employee_master_link_own_login();

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

  IF NEW.user_id IS NOT NULL THEN
    UPDATE public.profiles p
    SET
      is_active = want_active,
      updated_at = now()
    WHERE p.id = NEW.user_id;
  ELSIF code <> '' THEN
    UPDATE public.profiles p
    SET
      is_active = want_active,
      updated_at = now()
    WHERE public.norm_emp_code(p.employee_code) = code;
  END IF;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
