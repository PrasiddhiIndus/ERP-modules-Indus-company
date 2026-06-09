-- Run in Supabase Dashboard → SQL Editor AFTER fix_profiles_save.sql.
--
-- Fixes stack depth when saving profiles.employee_code for codes that exist on
-- admin_ifsp_employee_master (e.g. 10377). Root cause: triggers on profiles UPDATE
-- employee_code → UPDATE employee_master → RLS helpers re-query profiles recursively.
--
-- Symptoms: PATCH/upsert with employee_code fails with "stack depth limit exceeded"
-- even via service_role REST or admin_upsert_profile RPC.

-- ── RLS helpers: must not recurse into profiles policies ─────────────────────
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('super_admin', 'super_admin_pro')
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_has_admin_module_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT
    NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role IN ('admin', 'super_admin', 'super_admin_pro')
          OR p.team = 'admin'
          OR COALESCE(p.allowed_modules, '[]'::jsonb) ? 'admin'
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.current_user_can_access_module(module_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  WITH requested AS (
    SELECT lower(trim(coalesce(module_key, ''))) AS key
  )
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    CROSS JOIN requested r
    WHERE p.id = auth.uid()
      AND r.key <> ''
      AND (
        p.role IN ('super_admin', 'super_admin_pro')
        OR (
          p.role = 'admin'
          AND r.key NOT IN ('usermanagement', 'softwaresubscriptions')
        )
        OR lower(coalesce(p.team, '')) = r.key
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(coalesce(p.allowed_modules, '[]'::jsonb)) AS m(value)
          WHERE lower(m.value) = r.key
        )
      )
  );
$$;

-- ── profiles → auth.users metadata sync ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_auth_user_employee_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
SET row_security = off
AS $$
BEGIN
  UPDATE auth.users
  SET raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
    || CASE
      WHEN NEW.employee_code IS NULL OR btrim(NEW.employee_code) = '' THEN
        coalesce(raw_user_meta_data, '{}'::jsonb) - 'employee_code'
      ELSE
        jsonb_build_object('employee_code', btrim(NEW.employee_code))
    END
  WHERE id = NEW.id;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'sync_auth_user_employee_code failed for %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- ── profiles.employee_code → employee_master.user_id (single canonical trigger) ─
CREATE OR REPLACE FUNCTION public.sync_employee_master_from_profile_employee_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  IF NEW.employee_code IS NULL OR btrim(NEW.employee_code) = '' THEN
    RETURN NEW;
  END IF;

  UPDATE public.admin_ifsp_employee_master m
  SET user_id = NEW.id
  WHERE coalesce(m.status, 'Active') ILIKE 'Active'
    AND (
      public.norm_emp_code(m.employee_code) = public.norm_emp_code(NEW.employee_code)
      OR public.norm_emp_code(m.employee_id::text) = public.norm_emp_code(NEW.employee_code)
    )
    AND (m.user_id IS NULL OR m.user_id = NEW.id);

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'sync_employee_master_from_profile_employee_code failed for %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- Drop duplicate legacy trigger/function (same logic, doubles work)
DROP TRIGGER IF EXISTS trg_sync_employee_master_from_profile_code ON public.profiles;
DROP FUNCTION IF EXISTS public.sync_employee_master_from_profile_code();

DROP TRIGGER IF EXISTS trg_sync_auth_user_employee_code ON public.profiles;
CREATE TRIGGER trg_sync_auth_user_employee_code
  AFTER INSERT OR UPDATE OF employee_code ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_auth_user_employee_code();

DROP TRIGGER IF EXISTS trg_sync_employee_master_from_profile_employee_code ON public.profiles;
CREATE TRIGGER trg_sync_employee_master_from_profile_employee_code
  AFTER INSERT OR UPDATE OF employee_code ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_employee_master_from_profile_employee_code();

NOTIFY pgrst, 'reload schema';
