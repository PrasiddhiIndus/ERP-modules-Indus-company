/**
 * R&M enquiries — rm.enquiries only (not public.manpower_enquiries).
 * Expose schema "rm" in Supabase Dashboard → Settings → API → Exposed schemas.
 */
import { supabase } from "../../lib/supabase";

const RM_SCHEMA = "rm";

export function rmEnquiriesTable() {
  return supabase.schema(RM_SCHEMA).from("enquiries");
}

export async function listRmEnquiries() {
  const { data, error } = await rmEnquiriesTable().select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function upsertRmEnquiry(payload, enquiryId) {
  if (enquiryId) {
    const { data, error } = await rmEnquiriesTable().update(payload).eq("id", enquiryId).select("id").maybeSingle();
    if (error) throw error;
    return data;
  }
  const { data, error } = await rmEnquiriesTable().insert(payload).select("id").single();
  if (error) throw error;
  return data;
}

export async function deleteRmEnquiry(id) {
  const { error } = await rmEnquiriesTable().delete().eq("id", id);
  if (error) throw error;
}

export async function fetchRmEnquiryStats() {
  const { data, error } = await rmEnquiriesTable().select("id, status");
  if (error) throw error;
  const rows = data || [];
  const total = rows.length;
  const approved = rows.filter((r) => r.status === "Approved").length;
  const rejected = rows.filter((r) => r.status === "Rejected").length;
  return { total, approved, rejected, pending: Math.max(0, total - approved - rejected) };
}
