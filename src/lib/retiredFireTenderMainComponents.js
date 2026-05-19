/**
 * Main-component labels removed from the Fire Tender catalog (mistaken tender ref as root name).
 * DB cleanup: supabase/migrations/20260515180000_remove_retired_main_pump_main_component.sql
 */
const RETIRED_MAIN_COMPONENT_EXACT = new Set([
  "IFSPL/Ad-X/00001/08-25 - 1Main Pump",
  "IFSPL/Ad-X/00001/08-25 - 1 Main Pump",
]);

export function isRetiredFireTenderMainComponentLabel(mainComponent) {
  const s = String(mainComponent || "").trim();
  if (!s) return false;
  if (RETIRED_MAIN_COMPONENT_EXACT.has(s)) return true;
  return /^IFSPL\/Ad-X\/00001\/08-25\s*-\s*(\d+Main\s*Pump|\d+\s+Main\s*Pump)$/i.test(s);
}
