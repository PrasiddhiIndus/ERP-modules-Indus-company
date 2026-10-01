-- =============================================================================
-- Site employee logins → Indus One approvals use People Management L1 / L2.
--
-- Indus One routes leave / tour approvals by profiles.l1_manager_code /
-- l2_manager_code. IFSPL staff get these from Employee Master
-- (sync_employee_hierarchy_to_indus_one). Site employees get them from
-- people_hr_leads:
--   - when HR changes a site person's leads, and
--   - when a login is created / re-coded to a site person's employee code.
-- Codes that belong to an IFSPL employee are never touched here, so Employee
-- Master stays the only source for IFSPL staff.
--
-- DATA SAFETY: only profiles.l1_manager_code / l2_manager_code (and open
-- awaiting-L1 Indus One requests, via the existing sync) of site-employee
-- logins are written.
-- =============================================================================

DO $$
BEGIN
  IF to_regclass('public.people_hr_leads') IS NULL THEN
    RAISE EXCEPTION 'Apply 20260930140000_people_hr_leads.sql first.';
  END IF;
  IF to_regprocedure('public.sync_employee_hierarchy_to_indus_one(text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'Apply 20260904140000_sync_employee_hierarchy_to_indus_one.sql first.';
  END IF;
  IF to_regprocedure('public.site_employee_login_links()') IS NULL THEN
    RAISE EXCEPTION 'Apply 20260930180000_site_employee_logins.sql first.';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.is_ifspl_employee_code(p_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_ifsp_employee_master em
    WHERE public.norm_emp_code(em.employee_code) = public.norm_emp_code(p_code)
  )
$$;

-- Leads changed in People Management → linked login + open requests.
CREATE OR REPLACE FUNCTION public.trg_people_hr_leads_sync_indus_one()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_code text;
  v_person_id bigint := CASE WHEN TG_OP = 'DELETE' THEN OLD.person_id ELSE NEW.person_id END;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.l1_employee_code IS NOT DISTINCT FROM OLD.l1_employee_code
     AND NEW.l2_employee_code IS NOT DISTINCT FROM OLD.l2_employee_code THEN
    RETURN NEW;
  END IF;

  SELECT unique_code::text INTO v_code FROM public.people WHERE id = v_person_id;
  IF coalesce(public.norm_emp_code(v_code), '') = '' OR public.is_ifspl_employee_code(v_code) THEN
    RETURN NULL;
  END IF;

  PERFORM public.sync_employee_hierarchy_to_indus_one(
    v_code,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.l1_employee_code END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.l2_employee_code END
  );
  RETURN NULL;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Site lead sync to Indus One failed for person %: %', v_person_id, SQLERRM;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_people_hr_leads_sync_indus_one ON public.people_hr_leads;
CREATE TRIGGER trg_people_hr_leads_sync_indus_one
  AFTER INSERT OR UPDATE OR DELETE ON public.people_hr_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_people_hr_leads_sync_indus_one();

-- New login (or re-coded login) for a site person → copy that person's leads.
CREATE OR REPLACE FUNCTION public.trg_profiles_site_leads_on_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_l1 text;
  v_l2 text;
  v_found boolean := false;
BEGIN
  IF coalesce(public.norm_emp_code(NEW.employee_code), '') = '' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.employee_code IS NOT DISTINCT FROM OLD.employee_code THEN
    RETURN NEW;
  END IF;
  IF public.is_ifspl_employee_code(NEW.employee_code) THEN
    RETURN NEW;
  END IF;

  SELECT l.l1_employee_code, l.l2_employee_code, true
  INTO v_l1, v_l2, v_found
  FROM public.people pe
  LEFT JOIN public.people_hr_leads l ON l.person_id = pe.id
  WHERE public.norm_emp_code(pe.unique_code::text) = public.norm_emp_code(NEW.employee_code)
  ORDER BY pe.is_active DESC NULLS LAST, pe.id DESC
  LIMIT 1;

  IF v_found THEN
    NEW.l1_manager_code := public.nullif_trim_text(v_l1);
    NEW.l2_manager_code := public.nullif_trim_text(v_l2);
  END IF;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Site lead copy on login failed for %: %', NEW.employee_code, SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_site_leads_on_code ON public.profiles;
CREATE TRIGGER trg_profiles_site_leads_on_code
  BEFORE INSERT OR UPDATE OF employee_code ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_profiles_site_leads_on_code();

-- One-time: existing site-employee logins pick up their current leads.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT pe.unique_code::text AS code, l.l1_employee_code, l.l2_employee_code
    FROM public.site_employee_login_links() k
    JOIN public.people pe ON pe.id = k.person_id
    LEFT JOIN public.people_hr_leads l ON l.person_id = pe.id
  LOOP
    BEGIN
      PERFORM public.sync_employee_hierarchy_to_indus_one(r.code, r.l1_employee_code, r.l2_employee_code);
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE 'Backfill skipped for %: %', r.code, SQLERRM;
    END;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
