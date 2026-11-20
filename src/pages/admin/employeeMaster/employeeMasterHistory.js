import { supabase } from "../../../lib/supabase";

export const EMPLOYEE_MASTER_HISTORY_TABLE = "admin_ifsp_employee_master_field_history";

/** Derived / system fields — not shown as manual user edits (matches trigger skip list). */
export const EMPLOYEE_MASTER_HISTORY_SYSTEM_FIELD_KEYS = new Set([
  "updated_at",
  "created_at",
  "timestamp",
  "updated_by",
  "created_by",
  "status_changed_by",
  "status_changed_at",
  "ifspl_experience",
  "years_of_experience",
  "l1_manager_name",
  "l2_manager_name",
]);

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
  // Hide system/derived rows already written before the trigger skip list was expanded.
  return (data || []).filter(
    (row) => !EMPLOYEE_MASTER_HISTORY_SYSTEM_FIELD_KEYS.has(String(row?.field_key || ""))
  );
}

/**
 * Resolve creator name + employee code from immutable creation metadata.
 * Prefers field-history `__created__` (changed_by / changed_by_name); falls back to
 * `admin_ifsp_employee_master.created_by` (email stamp set only on insert).
 * Does not write or alter employee rows.
 */
export async function fetchEmployeeMasterCreatedBy(employeeMasterId, createdByEmail = null) {
  if (employeeMasterId == null || employeeMasterId === "") {
    return { name: null, employeeCode: null, createdAt: null, display: "—" };
  }

  let name = null;
  let employeeCode = null;
  let createdAt = null;
  let actorId = null;

  const { data: createdRow } = await supabase
    .from(EMPLOYEE_MASTER_HISTORY_TABLE)
    .select("changed_by, changed_by_name, changed_at")
    .eq("employee_master_id", employeeMasterId)
    .eq("field_key", "__created__")
    .order("changed_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (createdRow) {
    name = String(createdRow.changed_by_name || "").trim() || null;
    createdAt = createdRow.changed_at || null;
    actorId = createdRow.changed_by || null;
  }

  if (actorId) {
    // Prefer Employee Master linked to the creator's login (same source as history actor name).
    const { data: masterByUser } = await supabase
      .from("admin_ifsp_employee_master")
      .select("full_name, employee_code")
      .eq("user_id", actorId)
      .limit(1)
      .maybeSingle();
    if (masterByUser) {
      if (masterByUser.full_name) name = String(masterByUser.full_name).trim() || name;
      employeeCode = String(masterByUser.employee_code || "").trim() || employeeCode;
    }

    if (!name || !employeeCode) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, username, email, employee_code")
        .eq("id", actorId)
        .maybeSingle();
      if (profile) {
        if (!employeeCode) employeeCode = String(profile.employee_code || "").trim() || null;
        if (!name) {
          name =
            String(profile.username || "").trim() ||
            String(profile.email || "").trim() ||
            null;
        }
      }
    }

    if (employeeCode && !name) {
      const { data: master } = await supabase
        .from("admin_ifsp_employee_master")
        .select("full_name, employee_code")
        .eq("employee_code", employeeCode)
        .limit(1)
        .maybeSingle();
      if (master?.full_name) name = String(master.full_name).trim() || name;
    }
  }

  const emailHint = String(createdByEmail || "").trim();
  if ((!name || !employeeCode) && emailHint) {
    const { data: byEmail } = await supabase
      .from("profiles")
      .select("username, email, employee_code")
      .ilike("email", emailHint)
      .limit(1)
      .maybeSingle();
    if (byEmail) {
      if (!employeeCode) employeeCode = String(byEmail.employee_code || "").trim() || null;
      if (!name) {
        name =
          String(byEmail.username || "").trim() ||
          String(byEmail.email || "").trim() ||
          emailHint;
      }
    }
    if (!name || !employeeCode) {
      const { data: masterByEmail } = await supabase
        .from("admin_ifsp_employee_master")
        .select("full_name, employee_code, email_id")
        .ilike("email_id", emailHint)
        .limit(1)
        .maybeSingle();
      if (masterByEmail) {
        if (!name) name = String(masterByEmail.full_name || "").trim() || null;
        if (!employeeCode) employeeCode = String(masterByEmail.employee_code || "").trim() || null;
      }
    }
    if (!name) name = emailHint;
  }

  const parts = [name, employeeCode].filter(Boolean);
  const display = parts.length
    ? employeeCode && name
      ? `${name} · ${employeeCode}`
      : parts.join(" · ")
    : "—";

  return { name, employeeCode, createdAt, display };
}
