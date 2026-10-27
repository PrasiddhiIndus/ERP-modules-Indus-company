import { supabase } from "../../../lib/supabase";

export const EMPLOYEE_MASTER_HISTORY_TABLE = "admin_ifsp_employee_master_field_history";

function displayValue(v) {
  const s = v == null ? "" : String(v).trim();
  return s || "(empty)";
}

function formatWhen(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  } catch {
    return String(iso);
  }
}

/**
 * Human sentence: "Amit changed Full name from Samit to Sumit on 27 Oct 2026, 10:30:00 am."
 */
export function formatEmployeeHistorySentence(row) {
  const who = String(row?.changed_by_name || "Someone").trim() || "Someone";
  const when = formatWhen(row?.changed_at);
  const field = String(row?.field_label || row?.field_key || "field").trim();

  if (row?.field_key === "__created__") {
    return when ? `${who} created this employee record on ${when}.` : `${who} created this employee record.`;
  }

  const from = displayValue(row?.old_value);
  const to = displayValue(row?.new_value);
  const body = `${who} changed ${field} from ${from} to ${to}`;
  return when ? `${body} on ${when}.` : `${body}.`;
}

export async function fetchEmployeeMasterFieldHistory(employeeMasterId) {
  if (employeeMasterId == null || employeeMasterId === "") return [];
  const { data, error } = await supabase
    .from(EMPLOYEE_MASTER_HISTORY_TABLE)
    .select(
      "id, employee_master_id, field_key, field_label, old_value, new_value, changed_by, changed_by_name, changed_at"
    )
    .eq("employee_master_id", employeeMasterId)
    .order("changed_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(2000);

  if (error) {
    console.warn("Employee Master history load failed:", error);
    throw error;
  }
  return data || [];
}
