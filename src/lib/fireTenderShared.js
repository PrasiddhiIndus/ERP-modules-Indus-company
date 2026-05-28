/**
 * Fire Tender shared workflow helpers.
 * Quotations are one row per tender_id; costing/approved items are shared across the Fire Tender team.
 */

/**
 * Fetch the single quotation row for a tender (unique on tender_id).
 */
export async function fetchQuotationByTenderId(supabase, tenderId) {
  const tid = Number(tenderId);
  const { data, error } = await supabase
    .from("quotations")
    .select("*")
    .eq("tender_id", tid)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Approved costing lines for quotation — shared per tender (not per user).
 */
export async function fetchApprovedQuotationItemsByTenderId(supabase, tenderId) {
  const { data, error } = await supabase
    .from("approved_quotation_items")
    .select("*")
    .eq("tender_id", Number(tenderId))
    .eq("include", true)
    .order("component", { ascending: true });
  if (error) throw error;
  return data || [];
}

/**
 * Tender IDs that have at least one approved line (team-visible list).
 */
export async function fetchApprovedQuotationTenderIds(supabase) {
  const { data, error } = await supabase
    .from("approved_quotation_items")
    .select("tender_id")
    .eq("include", true);
  if (error) throw error;
  return [...new Set((data || []).map((i) => i.tender_id).filter(Boolean))];
}

/**
 * Map DB quotation rows by tender_id for list rendering.
 */
export function quotationsByTenderId(rows) {
  const map = new Map();
  for (const row of rows || []) {
    if (row?.tender_id != null) map.set(row.tender_id, row);
  }
  return map;
}

export function generateFireTenderQuotationNumber(index) {
  const paddedIndex = String(index + 1).padStart(4, "0");
  return `QN/IFSPL/FT/${paddedIndex}`;
}
