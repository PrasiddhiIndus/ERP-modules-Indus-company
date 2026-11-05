import { supabase } from "../../../lib/supabase";

/** User-facing message; technical detail goes to the console. */
export function friendlyFinancePoError(error, fallback = "Something went wrong. Please try again.") {
  if (!error) return fallback;
  console.error("[Master PO At Glance]", error);
  const msg = String(error.message || error);
  const code = String(error.code || "");
  if (/can sign only after the previous stage|Only the person who created this OC/.test(msg)) return msg;
  if (code === "42501" || /permission denied|row-level security|do not have access/i.test(msg)) {
    return /Master PO At Glance|Finance Department/i.test(msg)
      ? msg
      : "You do not have access to Master PO At Glance.";
  }
  if (code === "PGRST202" || code === "42883" || code === "42P01" || /could not find the function/i.test(msg)) {
    return "Master PO At Glance is not set up on the server yet. Please contact the administrator.";
  }
  if (code === "23505" || /duplicate key/i.test(msg)) return "This OC No. is already used. Enter a different number.";
  if (code === "P0001" || code === "22023") return msg;
  if (/failed to fetch|network/i.test(msg)) return "Network error. Check your connection and try again.";
  return fallback;
}

/** Full PO At Glance form for one department record (same shape the department screen loads). */
export async function getFinancePoDetail(department, id) {
  const { data, error } = await supabase.rpc("finance_po_glance_detail", {
    p_department: department,
    p_id: id,
  });
  if (error) throw error;
  return data;
}

/** Records the Finance Department signature only. The assigned finance signer is checked on the server. */
export async function signFinancePo({ department, id, signedBy }) {
  const { data, error } = await supabase.rpc("finance_po_sign", {
    p_department: department,
    p_id: id,
    p_signed_by: signedBy,
  });
  if (error) throw error;
  return data;
}

/** POs of every department (header fields + signed sign-off slots). Finance only. */
export async function listFinancePos() {
  const { data, error } = await supabase.rpc("finance_po_glance_list");
  if (error) throw error;
  return data || [];
}

/** Sets only the OC No. / OC date; rejected when the PO changed after `expectedUpdatedAt`. */
export async function setFinancePoOcNo({ department, id, ocNo, ocDate, expectedUpdatedAt }) {
  const { data, error } = await supabase.rpc("finance_po_set_oc_no", {
    p_department: department,
    p_id: id,
    p_oc_no: ocNo,
    p_oc_date: ocDate || null,
    p_expected_updated_at: expectedUpdatedAt || null,
  });
  if (error) throw error;
  return data;
}

export async function listFinancePoOcHistory(department, id) {
  const { data, error } = await supabase.rpc("finance_po_oc_history", { p_department: department, p_id: id });
  if (error) throw error;
  return data || [];
}

/** Who changed which field, from what, to what, and when. */
export async function listFinancePoFieldHistory(department, id) {
  const { data, error } = await supabase.rpc("finance_po_field_history", {
    p_department: department,
    p_id: id,
  });
  if (error) throw error;
  return data || [];
}
