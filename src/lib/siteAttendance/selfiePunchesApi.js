/**
 * Read-only overlay of Indus One site selfie punches (indus_one.site_attendance_punches)
 * onto the HR site-attendance grid. Never writes to the punch table.
 * Only status = 'uploaded' punches count; a day with any uploaded in/out punch => P.
 */
import { supabase } from "../supabase";

const norm = (v) => String(v ?? "").trim().toUpperCase();

/**
 * @returns {Promise<Record<string, {in: string|null, out: string|null, address?: string}>>}
 *   keyed by `${people.id}_${YYYY-MM-DD}`
 */
export async function listSelfiePresenceForPeople(people, from, to) {
  const byCode = new Map();
  const byId = new Map();
  (people || []).forEach((p) => {
    if (p?.unique_code) byCode.set(norm(p.unique_code), p.id);
    if (p?.employee_code) byCode.set(norm(p.employee_code), p.id);
    byId.set(String(p.id), p.id);
  });
  if (!byCode.size && !byId.size) return {};

  // indus_one.site_attendance_punches is not readable by ERP roles directly; use the read-only RPC.
  const { data: rows, error } = await supabase.rpc("hr_list_site_selfie_punches", {
    p_from: from,
    p_to: to,
    p_codes: [...byCode.keys()],
  });
  if (error) {
    console.warn("Selfie punches unavailable for HR overlay:", error.message || error);
    return {};
  }

  const out = {};
  for (const r of rows || []) {
    // If the row carries an approval status, only approved punches count (rejected/pending ignored).
    if (r.approval_status != null && String(r.approval_status).trim().toLowerCase() !== "approved") continue;
    // Prefer employee_code mapping; fall back to person_id.
    const pid = byCode.get(norm(r.employee_code)) ?? byId.get(String(r.person_id ?? ""));
    if (pid == null || !r.att_date) continue;
    const key = `${pid}_${String(r.att_date).slice(0, 10)}`;
    const entry = out[key] || (out[key] = { in: null, out: null, address: r.address || "" });
    const kind = String(r.punch_kind || "").toLowerCase();
    if (kind === "in" && !entry.in) entry.in = r.punched_at; // earliest in
    if (kind === "out") entry.out = r.punched_at; // latest out (ascending order)
  }
  return out;
}

export function formatPunchTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
