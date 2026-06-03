/** Header dropdown value: show in-house + fire-tender fleet data. */
export const FLEET_VEHICLE_CATEGORY_ALL = 'all';

export function isFleetCategoryAll(vehicleCategory) {
  return vehicleCategory === FLEET_VEHICLE_CATEGORY_ALL;
}

/** Apply vehicle_category filter unless "All" is selected. */
export function withFleetVehicleCategoryFilter(query, vehicleCategory) {
  if (isFleetCategoryAll(vehicleCategory)) return query;
  return query.eq('vehicle_category', vehicleCategory);
}

/** Apply nested master vehicle_category filter unless "All" is selected. */
export function withFleetMasterCategoryFilter(query, vehicleCategory) {
  if (isFleetCategoryAll(vehicleCategory)) return query;
  return query.eq('operations_fire_tender_vehicle_master.vehicle_category', vehicleCategory);
}

/** User-facing message for failed fleet Supabase queries. */
export function fleetQueryErrorMessage(error) {
  if (!error) return null;
  const msg = String(error.message || error);
  const code = error.code || '';
  if (code === 'PGRST301' || /jwt|session/i.test(msg)) {
    return 'Your session expired. Sign out and sign in again.';
  }
  if (code === '42501' || /permission|policy|row-level security/i.test(msg)) {
    return 'You do not have permission to view fleet data. Your profile needs Operations or Fire Tender access.';
  }
  if (code === '42P01' || /does not exist|relation/i.test(msg)) {
    return 'Fleet database tables are missing. Run the latest Supabase migrations for this project.';
  }
  return msg;
}
