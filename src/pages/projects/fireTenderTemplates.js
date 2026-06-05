// Fire Tender costing templates (vehicle categories).
// The MAIN costing sheet items differ per template; Accessories & MOC are shared.

export const FIRE_TENDER_TEMPLATES = [
  "Fire Tender",
  "Rescue vehicle",
  "Rhino/QRV/ERV",
  "Ambulance",
];

export const DEFAULT_FIRE_TENDER_TEMPLATE = "Fire Tender";

/** Normalise any stored value to a known template (falls back to the default). */
export function normalizeTemplate(value) {
  const v = String(value || "").trim();
  return FIRE_TENDER_TEMPLATES.includes(v) ? v : DEFAULT_FIRE_TENDER_TEMPLATE;
}

/** True when a catalog row (main_components / price_master) belongs to `template`. */
export function rowMatchesTemplate(row, template) {
  return normalizeTemplate(row?.template) === normalizeTemplate(template);
}
