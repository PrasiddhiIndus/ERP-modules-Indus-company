/**
 * Tour workflow realtime — mirrors leave subscribeLeaveWorkflowRealtime.
 */

import { supabase } from "./supabase";
import { isSupabaseRealtimeEnabled } from "./supabaseConfig";
import { INDUS_ONE_TOUR_TABLES } from "./attendanceDaily";

export const INDUS_ONE_SCHEMA = "indus_one";

/**
 * Subscribe to tour workflow + register rows (approved tours → T on daily register).
 * Requires tables in publication `supabase_realtime` (see migration 20260624150000).
 */
export function subscribeTourWorkflowRealtime(onChange) {
  if (!isSupabaseRealtimeEnabled() || typeof onChange !== "function") {
    return () => {};
  }

  const channel = supabase
    .channel("erp-indus-one-tour-workflow")
    .on(
      "postgres_changes",
      { event: "*", schema: INDUS_ONE_SCHEMA, table: INDUS_ONE_TOUR_TABLES.lmsRequests },
      onChange
    )
    .on(
      "postgres_changes",
      { event: "*", schema: INDUS_ONE_SCHEMA, table: INDUS_ONE_TOUR_TABLES.adminRequests },
      onChange
    )
    .on(
      "postgres_changes",
      { event: "*", schema: INDUS_ONE_SCHEMA, table: INDUS_ONE_TOUR_TABLES.attendanceMarks },
      onChange
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "admin_attendance_register" },
      onChange
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
