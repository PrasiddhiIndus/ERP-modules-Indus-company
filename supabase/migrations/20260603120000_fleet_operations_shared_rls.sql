-- Fleet management: shared data for Operations / Fire Tender teams (not per-user isolation).
-- Replaces strict auth.uid() = user_id policies from 20260514180000_operations_fleet_schema_and_rls.sql.

CREATE OR REPLACE FUNCTION public.current_user_has_fleet_module_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role IN ('super_admin', 'super_admin_pro', 'admin')
          OR p.team IN ('operations', 'fireTender')
          OR COALESCE(p.allowed_modules, '[]'::jsonb) ? 'operations'
          OR COALESCE(p.allowed_modules, '[]'::jsonb) ? 'fireTender'
        )
    );
$$;

COMMENT ON FUNCTION public.current_user_has_fleet_module_access() IS
  'RLS helper: Fleet tables — Operations/Fire Tender team or module, admins, super admins, or legacy users without a profiles row.';

-- operations_fire_tender_vehicle_master
DROP POLICY IF EXISTS "fleet_vehicle_master_own" ON operations_fire_tender_vehicle_master;
CREATE POLICY "fleet_vehicle_master_module_access" ON operations_fire_tender_vehicle_master
  FOR ALL TO authenticated
  USING (public.current_user_has_fleet_module_access())
  WITH CHECK (public.current_user_has_fleet_module_access());

-- operations_fire_tender_vehicle_drivers
DROP POLICY IF EXISTS "fleet_vehicle_drivers_own" ON operations_fire_tender_vehicle_drivers;
CREATE POLICY "fleet_vehicle_drivers_module_access" ON operations_fire_tender_vehicle_drivers
  FOR ALL TO authenticated
  USING (public.current_user_has_fleet_module_access())
  WITH CHECK (public.current_user_has_fleet_module_access());

-- operations_fire_tender_vehicle_trips
DROP POLICY IF EXISTS "fleet_vehicle_trips_own" ON operations_fire_tender_vehicle_trips;
CREATE POLICY "fleet_vehicle_trips_module_access" ON operations_fire_tender_vehicle_trips
  FOR ALL TO authenticated
  USING (public.current_user_has_fleet_module_access())
  WITH CHECK (public.current_user_has_fleet_module_access());

-- operations_fire_tender_vehicle_documents
DROP POLICY IF EXISTS "fleet_vehicle_documents_own" ON operations_fire_tender_vehicle_documents;
CREATE POLICY "fleet_vehicle_documents_module_access" ON operations_fire_tender_vehicle_documents
  FOR ALL TO authenticated
  USING (public.current_user_has_fleet_module_access())
  WITH CHECK (public.current_user_has_fleet_module_access());

-- operations_fire_tender_vehicle_maintenance
DROP POLICY IF EXISTS "fleet_vehicle_maintenance_own" ON operations_fire_tender_vehicle_maintenance;
CREATE POLICY "fleet_vehicle_maintenance_module_access" ON operations_fire_tender_vehicle_maintenance
  FOR ALL TO authenticated
  USING (public.current_user_has_fleet_module_access())
  WITH CHECK (public.current_user_has_fleet_module_access());
