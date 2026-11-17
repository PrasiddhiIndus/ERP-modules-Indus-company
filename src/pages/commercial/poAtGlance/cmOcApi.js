/**
 * Commercial PO At Glance — data access for the cm_oc_* tables
 * (migrations 20261116120000 and 20261116160000).
 * Generic, department-aware helpers from the IEV API (assignees, employee options, delete, notify,
 * own signature) are used read-only with the Commercial profile; their own behaviour is unchanged.
 */
import { supabase } from "../../../lib/supabase";
import { fetchApiWithAuth } from "../../../lib/apiBase";
import { COMMERCIAL_OC_DEPARTMENT } from "./cmOcDepartment";
import {
  deleteOc, fetchOcSignatureUrl, friendlyOcError, listEmployeeOptions, loadSignoffAssignees, notifyOcSignoff,
} from "../../projects/oc/ocApi";

export { amFinance, myEmployeeCode } from "../../projects/oc/ocApi";

const DEPT = COMMERCIAL_OC_DEPARTMENT;

/** User-facing message. Workflow messages from cm_oc_sign_stage / cm_oc_save are shown as written. */
export function friendlyCmError(error, fallback) {
  const msg = String(error?.message || "");
  const code = String(error?.code || "");
  if (
    /stage|PO category|digital signature|Only the Finance Department|Only the person who created/i.test(msg)
    && (code === "P0001" || code === "42501" || code === "22023" || !code)
  ) {
    if (error) console.error("[Commercial PO At Glance]", error);
    return msg;
  }
  return friendlyOcError(error, fallback, DEPT);
}

export const loadCmAssignees = () => loadSignoffAssignees(DEPT);
export const listCmEmployeeOptions = () => listEmployeeOptions(DEPT);
export const deleteCmOc = (id) => deleteOc(id, DEPT);
export const notifyCmSignoff = (payload) => notifyOcSignoff(payload, DEPT);

/** The logged-in user's own Indus One signature (shown before they sign). */
export const myCmSignatureUrl = (userId) => fetchOcSignatureUrl(userId);

export async function listCmOcs() {
  const { data, error } = await supabase
    .from(DEPT.tables.master)
    .select("id, oc_no, oc_date, client_name, po_wo_no, po_date, po_category, duration_text, duration_from, duration_to, mobilization_date, updated_at, created_by")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return data || [];
}

/** Signed stages per PO, for the list's status column: { [oc_id]: string[] of slots }. */
export async function listCmSignedSlots(ids) {
  if (!ids.length) return {};
  const { data, error } = await supabase.from(DEPT.tables.signoff).select("oc_id, slot").in("oc_id", ids);
  if (error) throw error;
  const out = {};
  for (const r of data || []) (out[r.oc_id] ||= []).push(r.slot);
  return out;
}

export async function loadCmOc(id) {
  const t = DEPT.tables;
  const [master, contacts, signoff] = await Promise.all([
    supabase.from(t.master).select("*").eq("id", id).maybeSingle(),
    supabase.from(t.contacts).select("*").eq("oc_id", id).order("seq", { ascending: true }),
    supabase.from(t.signoff).select("*").eq("oc_id", id),
  ]);
  const failed = [master, contacts, signoff].find((r) => r.error);
  if (failed) throw failed.error;
  if (!master.data) throw new Error("This PO At Glance no longer exists.");
  return { master: master.data, contacts: contacts.data || [], signoff: signoff.data || [] };
}

/** Saves header + contacts in one transaction; returns { id, oc_no }. */
export async function saveCmOc(payload) {
  const { data, error } = await supabase.rpc(DEPT.rpc.save, { p: payload });
  if (error) throw error;
  return data;
}

/** Signs one approval stage with the caller's own signature; returns { slot, signed_by, signed_at, signed_user_id }. */
export async function signCmStage(ocId, slot) {
  const { data, error } = await supabase.rpc("cm_oc_sign_stage", { p_oc_id: ocId, p_slot: slot });
  if (error) throw error;
  return data;
}

/** Viewable URL of the signature used on a signed stage ("" when none). */
export async function cmStageSignatureUrl(ocId, slot) {
  try {
    const res = await fetchApiWithAuth("/api/commercial/oc/signature-file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ocId, slot }),
    });
    return res.ok ? String(res.data?.url || "") : "";
  } catch {
    return "";
  }
}

/** Raw bytes of the signature used on a signed stage (for the Word export), or null. */
export async function cmStageSignatureBytes(ocId, slot) {
  const res = await fetchApiWithAuth("/api/commercial/oc/signature-file", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ocId, slot, bytes: true }),
  });
  const b64 = res.ok ? String(res.data?.base64 || "") : "";
  if (!b64) return null;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

const WO_DOCUMENT_BUCKET = "commercial-wo-documents";
const WO_MAX_BYTES = 15 * 1024 * 1024;

function docsFromWoRpc(data) {
  const list = Array.isArray(data) ? data : [];
  return list
    .filter((d) => d && String(d.path || "").trim())
    .map((d) => ({
      name: String(d.name || "Work order").trim() || "Work order",
      path: String(d.path).trim(),
      uploaded_at: d.uploaded_at || null,
    }));
}

function assertWoFile(file) {
  if (!file) throw new Error("Choose a work order file to upload.");
  if (file.size > WO_MAX_BYTES) throw new Error("Each work order file must be 15 MB or smaller.");
  const name = String(file.name || "").toLowerCase();
  if (!/\.(pdf|png|jpe?g|webp|docx?)$/i.test(name)) {
    throw new Error("Upload a PDF, Word, or image file.");
  }
}

/** Stores one work order file on a saved Commercial PO At Glance record (appends). */
export async function uploadCmWoDocument(ocId, file) {
  assertWoFile(file);
  const safeName = String(file.name || "work-order").replace(/[^\w.\-() ]+/g, "_");
  const path = `${ocId}/${Date.now()}-${safeName}`;
  const { error: uploadError } = await supabase.storage.from(WO_DOCUMENT_BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type || undefined,
  });
  if (uploadError) throw uploadError;
  const { data, error } = await supabase.rpc("cm_oc_set_wo_document", {
    p_id: ocId,
    p_name: file.name,
    p_path: path,
  });
  if (error) throw error;
  return docsFromWoRpc(data);
}

/** Uploads several work order files; returns the merged document list. */
export async function uploadCmWoDocuments(ocId, files) {
  let latest = [];
  for (const file of files || []) {
    latest = await uploadCmWoDocument(ocId, file);
  }
  return latest;
}

/** Removes one work order file that was already saved with the PO. */
export async function removeCmWoDocument(ocId, path) {
  const { data, error } = await supabase.rpc("cm_oc_remove_wo_document", {
    p_id: ocId,
    p_path: path,
  });
  if (error) throw error;
  if (path) {
    const { error: storageError } = await supabase.storage.from(WO_DOCUMENT_BUCKET).remove([path]);
    if (storageError) console.warn("[Commercial PO At Glance] WO file remove", storageError);
  }
  return docsFromWoRpc(data);
}

/** Removes every work order file that was already saved with the PO. */
export async function clearCmWoDocuments(ocId, pathOrPaths) {
  const paths = Array.isArray(pathOrPaths)
    ? pathOrPaths.filter(Boolean)
    : pathOrPaths
      ? [pathOrPaths]
      : [];
  const { error } = await supabase.rpc("cm_oc_clear_wo_document", { p_id: ocId });
  if (error) throw error;
  if (paths.length) {
    const { error: storageError } = await supabase.storage.from(WO_DOCUMENT_BUCKET).remove(paths);
    if (storageError) console.warn("[Commercial PO At Glance] WO file remove", storageError);
  }
}

/** Short-lived link so the preview can open a work order file. */
export async function cmWoDocumentUrl(path) {
  const { data, error } = await supabase.storage.from(WO_DOCUMENT_BUCKET).createSignedUrl(path, 3600);
  if (error) throw error;
  return data?.signedUrl || "";
}

