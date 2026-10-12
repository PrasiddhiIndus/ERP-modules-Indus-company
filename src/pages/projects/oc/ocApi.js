import { supabase } from "../../../lib/supabase";

/** User-facing message; technical detail goes to the console. */
export function friendlyOcError(error, fallback = "Something went wrong. Please try again.") {
  if (!error) return fallback;
  console.error("[PO At Glance]", error);
  const msg = String(error.message || error);
  const code = String(error.code || "");
  if (/^Only the Finance Department can fill or change the OC No\./.test(msg)) return msg;
  if (/^Only .+ can sign the .+ box\.$/.test(msg) || /^No one is assigned to sign the /.test(msg)) {
    return msg.replace("OC Sign-off Assignment", "PO At Glance Sign-off Assignment");
  }
  if (code === "42501" || /do not have access|permission denied|row-level security/i.test(msg)) {
    return "You do not have access to IEV PO At Glance.";
  }
  if (code === "PGRST202" || code === "42883" || code === "42P01" || /could not find the function|does not exist/i.test(msg)) {
    return "PO At Glance is not set up on the server yet. Please contact the administrator.";
  }
  if (code === "23505" || /duplicate key/i.test(msg)) return "This OC No. is already used. Enter a different number.";
  if (code === "23514" || /violates check constraint/i.test(msg)) return "Some values are out of range. Check percentages, dates and amounts.";
  if (code === "P0001" || code === "22023") return msg;
  return fallback;
}

export async function listOcs() {
  const { data, error } = await supabase
    .from("oc_master")
    .select("id, oc_no, oc_date, client_name, po_wo_no, po_date, contract_value, currency, delivery_date, updated_at")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return data || [];
}

export async function loadOc(id) {
  const byOc = (table, order) => {
    let q = supabase.from(table).select("*").eq("oc_id", id);
    if (order) q = q.order(order, { ascending: true });
    return q;
  };
  const [master, security, conditions, penalty, milestones, contacts, signoff] = await Promise.all([
    supabase.from("oc_master").select("*").eq("id", id).maybeSingle(),
    byOc("oc_security_items", "seq"),
    byOc("oc_fixed_conditions"),
    byOc("oc_penalty").maybeSingle(),
    byOc("oc_payment_milestones", "seq"),
    byOc("oc_contacts", "seq"),
    byOc("oc_signoff"),
  ]);
  const failed = [master, security, conditions, penalty, milestones, contacts, signoff].find((r) => r.error);
  if (failed) throw failed.error;
  if (!master.data) throw new Error("This PO At Glance no longer exists.");
  return {
    master: master.data,
    security: security.data || [],
    conditions: conditions.data || [],
    penalty: penalty.data || null,
    milestones: milestones.data || [],
    contacts: contacts.data || [],
    signoff: signoff.data || [],
  };
}

/** Saves header + all rows in one transaction; returns { id, oc_no }. */
export async function saveOc(payload) {
  const { data, error } = await supabase.rpc("oc_save", { p: payload });
  if (error) throw error;
  return data;
}

/** { [slot]: { employee_code, employee_name } } for the dissemination boxes that have someone assigned. */
export async function loadSignoffAssignees() {
  const { data, error } = await supabase.from("oc_signoff_assignees").select("slot, employee_code, employee_name");
  if (error) throw error;
  return Object.fromEntries((data || []).map((r) => [r.slot, { employee_code: r.employee_code, employee_name: r.employee_name }]));
}

/** Assigns an employee to a box, or clears the box when `employee` is null. */
export async function saveSignoffAssignee(slot, employee) {
  const q = supabase.from("oc_signoff_assignees");
  const { error } = employee
    ? await q.upsert(
      { slot, employee_code: employee.employee_code, employee_name: employee.full_name, updated_at: new Date().toISOString() },
      { onConflict: "slot" },
    )
    : await q.delete().eq("slot", slot);
  if (error) throw error;
}

/** Active Employee Master people: [{ employee_code, full_name, department }]. */
export async function listEmployeeOptions() {
  const { data, error } = await supabase.rpc("oc_employee_options");
  if (error) throw error;
  return data || [];
}

export async function myEmployeeCode() {
  const { data, error } = await supabase.rpc("oc_current_employee_code");
  if (error) throw error;
  return data || "";
}

/** Finance Department people (and Super Admins) fill the OC No.; false when it cannot be checked. */
export async function amFinance() {
  const { data, error } = await supabase.rpc("oc_current_user_is_finance");
  if (error) {
    console.warn("[PO At Glance] Finance check unavailable", error);
    return false;
  }
  return data === true;
}

export async function deleteOc(id) {
  const { error } = await supabase.from("oc_master").delete().eq("id", id);
  if (error) throw error;
}
