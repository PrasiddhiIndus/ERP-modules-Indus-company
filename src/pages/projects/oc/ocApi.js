import { supabase } from "../../../lib/supabase";
import { fetchApiWithAuth } from "../../../lib/apiBase";
import { getEmployeeDocumentFileUrl } from "../../../lib/adminEmployeeDocuments";
import { IEV_OC_DEPARTMENT } from "./ocDepartment";

// Every call takes the department profile (ocDepartment.js); IEV when omitted.

/** User-facing message; technical detail goes to the console. */
export function friendlyOcError(error, fallback = "Something went wrong. Please try again.", dept = IEV_OC_DEPARTMENT) {
  if (!error) return fallback;
  console.error("[PO At Glance]", error);
  const msg = String(error.message || error);
  const code = String(error.code || "");
  if (/^Only the Finance Department can fill or change the OC No\./.test(msg)) return msg;
  if (/can sign only after the previous stage|Only the person who created this OC|cannot be removed while a later stage/.test(msg)) {
    return msg;
  }
  if (/^Only .+ can sign the .+ box\.$/.test(msg) || /^No one is assigned to sign the /.test(msg)) {
    return msg.replace("OC Sign-off Assignment", "PO At Glance Sign-off Assignment");
  }
  if (code === "42501" || /do not have access|permission denied|row-level security/i.test(msg)) {
    return dept.accessDeniedMessage;
  }
  if (code === "PGRST202" || code === "42883" || code === "42P01" || /could not find the function|does not exist/i.test(msg)) {
    return "PO At Glance is not set up on the server yet. Please contact the administrator.";
  }
  if (code === "23505" || /duplicate key/i.test(msg)) return "This OC No. is already used. Enter a different number.";
  if (code === "23514" || /violates check constraint/i.test(msg)) return "Some values are out of range. Check percentages, dates and amounts.";
  if (code === "P0001" || code === "22023") return msg;
  return fallback;
}

export async function listOcs(dept = IEV_OC_DEPARTMENT) {
  const { data, error } = await supabase
    .from(dept.tables.master)
    .select("id, oc_no, oc_date, client_name, po_wo_no, po_date, contract_value, currency, delivery_date, updated_at, created_by")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return data || [];
}

export async function loadOc(id, dept = IEV_OC_DEPARTMENT) {
  const t = dept.tables;
  const byOc = (table, order) => {
    let q = supabase.from(table).select("*").eq("oc_id", id);
    if (order) q = q.order(order, { ascending: true });
    return q;
  };
  const [master, security, conditions, penalty, milestones, contacts, signoff] = await Promise.all([
    supabase.from(t.master).select("*").eq("id", id).maybeSingle(),
    byOc(t.security, "seq"),
    byOc(t.conditions),
    byOc(t.penalty).maybeSingle(),
    byOc(t.milestones, "seq"),
    byOc(t.contacts, "seq"),
    byOc(t.signoff),
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
export async function saveOc(payload, dept = IEV_OC_DEPARTMENT) {
  const { data, error } = await supabase.rpc(dept.rpc.save, { p: payload });
  if (error) throw error;
  return data;
}

/** { [slot]: { employee_code, employee_name } } for the dissemination boxes that have someone assigned. */
export async function loadSignoffAssignees(dept = IEV_OC_DEPARTMENT) {
  const { data, error } = await supabase.from(dept.tables.assignees).select("slot, employee_code, employee_name");
  if (error) throw error;
  return Object.fromEntries((data || []).map((r) => [r.slot, { employee_code: r.employee_code, employee_name: r.employee_name }]));
}

/** Assigns an employee to a box, or clears the box when `employee` is null. */
export async function saveSignoffAssignee(slot, employee, dept = IEV_OC_DEPARTMENT) {
  const q = supabase.from(dept.tables.assignees);
  const { error } = employee
    ? await q.upsert(
      { slot, employee_code: employee.employee_code, employee_name: employee.full_name, updated_at: new Date().toISOString() },
      { onConflict: "slot" },
    )
    : await q.delete().eq("slot", slot);
  if (error) throw error;
}

/** Active Employee Master people: [{ employee_code, full_name, department }]. */
export async function listEmployeeOptions(dept = IEV_OC_DEPARTMENT) {
  const { data, error } = await supabase.rpc(dept.rpc.employeeOptions);
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

/** Digital signature already stored in Indus One for this login's employee code. */
export async function fetchOcSignatureUrl(userId) {
  if (!userId) return "";
  const { data, error } = await supabase.rpc("employee_signature_file_for_user", { p_user_id: userId });
  if (error || !data?.objectKey) return "";
  const objectKey = String(data.objectKey);
  try {
    if (objectKey.startsWith("signature/")) {
      const res = await fetchApiWithAuth("/api/employee-signature/file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) return "";
      return res.data?.url || "";
    }
    return await getEmployeeDocumentFileUrl(data.employeeMasterId, {
      objectKey,
      fileName: data.fileName,
    });
  } catch {
    return "";
  }
}

const PO_DOCUMENT_BUCKET = "projects-po-documents";

function docsFromRpc(data, fallbackName, fallbackPath) {
  const list = Array.isArray(data) ? data : [];
  const cleaned = list
    .filter((d) => d && String(d.path || "").trim())
    .map((d) => ({
      name: String(d.name || "Purchase order").trim() || "Purchase order",
      path: String(d.path).trim(),
      uploaded_at: d.uploaded_at || null,
    }));
  if (cleaned.length) {
    return {
      po_documents: cleaned,
      po_document_name: cleaned[0].name,
      po_document_path: cleaned[0].path,
    };
  }
  return {
    po_documents: [],
    po_document_name: fallbackName || "",
    po_document_path: fallbackPath || "",
  };
}

/** Stores an original purchase order file on a saved Projects PO At Glance record (appends). */
export async function uploadProjectPoDocument(ocId, file) {
  const safeName = String(file.name || "purchase-order").replace(/[^\w.\-() ]+/g, "_");
  const path = `${ocId}/${Date.now()}-${safeName}`;
  const { error: uploadError } = await supabase.storage.from(PO_DOCUMENT_BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type || undefined,
  });
  if (uploadError) throw uploadError;
  const { data, error } = await supabase.rpc("pj_oc_set_po_document", {
    p_id: ocId,
    p_name: file.name,
    p_path: path,
  });
  if (error) throw error;
  return docsFromRpc(data, file.name, path);
}

/** Uploads several original PO files; returns the merged document list. */
export async function uploadProjectPoDocuments(ocId, files) {
  let latest = { po_documents: [], po_document_name: "", po_document_path: "" };
  for (const file of files || []) {
    latest = await uploadProjectPoDocument(ocId, file);
  }
  return latest;
}

/** Removes one purchase order file that was already saved with the PO. */
export async function removeProjectPoDocument(ocId, path) {
  const { data, error } = await supabase.rpc("pj_oc_remove_po_document", {
    p_id: ocId,
    p_path: path,
  });
  if (error) throw error;
  if (path) {
    const { error: storageError } = await supabase.storage.from(PO_DOCUMENT_BUCKET).remove([path]);
    if (storageError) console.warn("[PO At Glance] file remove", storageError);
  }
  return docsFromRpc(data);
}

/** Removes every purchase order file that was already saved with the PO. */
export async function clearProjectPoDocument(ocId, pathOrPaths) {
  const paths = Array.isArray(pathOrPaths)
    ? pathOrPaths.filter(Boolean)
    : pathOrPaths
      ? [pathOrPaths]
      : [];
  const { error } = await supabase.rpc("pj_oc_clear_po_document", { p_id: ocId });
  if (error) throw error;
  if (paths.length) {
    const { error: storageError } = await supabase.storage.from(PO_DOCUMENT_BUCKET).remove(paths);
    if (storageError) console.warn("[PO At Glance] file remove", storageError);
  }
}

/** Execution and Department Head save remarks without changing the rest of the PO. */
export async function setProjectPoRemarks({ id, remarks, remarksDate }) {
  const { error } = await supabase.rpc("pj_oc_set_remarks", {
    p_id: id,
    p_remarks: remarks ?? "",
    p_remarks_date: remarksDate || null,
  });
  if (error) throw error;
}

/** Short-lived link so the preview can open the original purchase order. */
export async function projectPoDocumentUrl(path) {
  const { data, error } = await supabase.storage.from(PO_DOCUMENT_BUCKET).createSignedUrl(path, 3600);
  if (error) throw error;
  return data?.signedUrl || "";
}

/** Projects only: every approval / modification action on one OC, oldest first. */
export async function loadProjectApprovalLog(ocId) {
  const { data, error } = await supabase
    .from("pj_oc_approval_log")
    .select("id, action, slot, remarks, actor_name, backfilled, created_at")
    .eq("oc_id", ocId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw error;
  return data || [];
}

/** Projects only: the assigned Department Head sends the OC back to its creator (remarks required). */
export async function requestProjectOcModification(ocId, remarks) {
  const { error } = await supabase.rpc("pj_oc_request_modification", { p_oc_id: ocId, p_remarks: remarks });
  if (error) throw error;
}

/** Projects only: sign one stage now with the logged-in user's own Indus One signature. */
export async function signProjectOcStage(ocId, slot) {
  const { data, error } = await supabase.rpc("pj_oc_sign_stage", { p_oc_id: ocId, p_slot: slot });
  if (error) throw error;
  return data;
}

export async function deleteOc(id, dept = IEV_OC_DEPARTMENT) {
  const { error } = await supabase.from(dept.tables.master).delete().eq("id", id);
  if (error) throw error;
}

/**
 * Email the department's assigned sign-off users (outreach Verified From mailbox) after a PO slot is signed.
 * @param {{ ocId: string, signatures: { slot: string, signed_by: string }[], signerName?: string }} p
 */
export async function notifyOcSignoff({ ocId, signatures, signerName, event, ocNo, ocDate, remarks, actorName }, dept = IEV_OC_DEPARTMENT) {
  const res = await fetchApiWithAuth(dept.notifyPath, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ocId, signatures, signerName, event, ocNo, ocDate, remarks, actorName }),
    timeoutMs: 60_000,
  });
  if (!res.ok) throw new Error(res.error || "Could not send the sign-off notification.");
  return res.data;
}
