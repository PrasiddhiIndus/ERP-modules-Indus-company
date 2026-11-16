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

