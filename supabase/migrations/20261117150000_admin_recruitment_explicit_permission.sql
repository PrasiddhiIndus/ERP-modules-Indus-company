-- Admin In-house Recruitment: explicit permission only.
-- Full Admin module / team / role=admin / admin.employee no longer imply recruitment.
-- Grant via allowed_sub_modules: admin.recruitment (full) or admin.recruitment.<cap> (scoped).
-- Super Admin / Super Admin Pro and service_role keep full access.
-- Rollback: supabase/rollbacks/20261117150000_admin_recruitment_explicit_permission_down.sql

CREATE OR REPLACE FUNCTION public.admin_recruitment_can(p_cap text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_role text;
  v_subs jsonb;
  v_keys text[];
  v_restricted boolean;
  v_full boolean;
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' THEN
    RETURN true;
  END IF;
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT public.normalize_erp_role(p.role),
         public.jsonb_text_array(to_jsonb(p) -> 'allowed_sub_modules')
    INTO v_role, v_subs
  FROM public.profiles p
  WHERE p.id = auth.uid()
    AND coalesce((to_jsonb(p) ->> 'is_active')::boolean, true);

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Platform super-admins only (not role=admin / HOD — those need an explicit Recruitment grant).
  IF v_role IN ('super_admin', 'super_admin_pro') THEN
    RETURN true;
  END IF;

  -- Legacy Admin recruitment tab keys map onto the new sections.
  SELECT coalesce(array_agg(
           CASE s.value
             WHEN 'admin.recruitment.offer-generation' THEN 'admin.recruitment.offers'
             WHEN 'admin.recruitment.offer-response' THEN 'admin.recruitment.offers'
             WHEN 'admin.recruitment.iom' THEN 'admin.recruitment.joining'
             WHEN 'admin.recruitment.referral' THEN 'admin.recruitment.candidates'
             WHEN 'admin.recruitment.dropdown-master' THEN 'admin.recruitment.settings'
             ELSE s.value
           END), '{}'::text[])
    INTO v_keys
  FROM jsonb_array_elements_text(v_subs) AS s(value);

  v_full := 'admin.recruitment' = ANY (v_keys);

  -- Parent grant covers every capability (requisitions, approve, settings, …).
  IF v_full THEN
    RETURN true;
  END IF;

  v_restricted := EXISTS (
    SELECT 1 FROM unnest(v_keys) AS k
    WHERE k LIKE 'admin.recruitment.%' AND k <> 'admin.recruitment.approve'
  );

  IF p_cap = 'view' THEN
    RETURN v_restricted OR 'admin.recruitment.approve' = ANY (v_keys);
  END IF;

  IF p_cap = 'approve' THEN
    RETURN 'admin.recruitment.approve' = ANY (v_keys);
  END IF;

  IF p_cap = 'settings' THEN
    RETURN 'admin.recruitment.settings' = ANY (v_keys);
  END IF;

  RETURN ('admin.recruitment.' || p_cap) = ANY (v_keys);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_recruitment_can(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_recruitment_can(text) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_recruitment_can(text) IS
  'Admin In-house Recruitment capability check. Requires explicit admin.recruitment* grant (or Super Admin). Full Admin module does not imply access.';

-- Calling Database: HR module still opens it; Admin side only via explicit recruitment grant.
CREATE OR REPLACE FUNCTION public.current_user_can_access_calling_master()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND auth.uid() IS NOT NULL
      AND (
        public.current_user_can_access_module('hr')
        OR public.normalize_erp_role(p.role) IN ('super_admin', 'super_admin_pro')
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(
            CASE
              WHEN jsonb_typeof(COALESCE(p.allowed_sub_modules, '[]'::jsonb)) = 'array'
                THEN p.allowed_sub_modules
              ELSE '[]'::jsonb
            END
          ) AS s(value)
          WHERE s.value = 'admin.recruitment'
             OR s.value LIKE 'admin.recruitment.%'
        )
      )
  );
$$;

COMMENT ON FUNCTION public.current_user_can_access_calling_master() IS
  'True when the user may run Calling Database / Recruitment (HR module, Super Admin, or explicit admin.recruitment*).';

GRANT EXECUTE ON FUNCTION public.current_user_can_access_calling_master() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_can_access_calling_master() TO service_role;

NOTIFY pgrst, 'reload schema';
