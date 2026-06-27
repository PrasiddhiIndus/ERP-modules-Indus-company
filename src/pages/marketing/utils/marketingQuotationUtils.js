/** Sum grand total (incl. GST) from Excel costing JSON. */
export function calcFinalAmountFromCostingData(costingData) {
  if (!costingData) return 0;
  const parsed =
    typeof costingData === 'string'
      ? (() => {
          try {
            return JSON.parse(costingData);
          } catch {
            return null;
          }
        })()
      : costingData;
  if (!parsed?.items?.length) return 0;

  return parsed.items.reduce((sum, item) => {
    const withGst = parseFloat(parsed[`${item.id}_grand_total_supply_cost_with_gst`] || 0);
    if (withGst > 0) return sum + withGst;
    const legacy = parseFloat(parsed[`${item.id}_final_price`] || 0);
    return sum + legacy;
  }, 0);
}

/** Map quotation_id -> latest costing sheet row (prefers JSON costing_data). */
export function buildLatestCostingMap(sheets) {
  const map = new Map();
  (sheets || []).forEach((sheet) => {
    const qid = sheet.quotation_id;
    if (!qid) return;
    const existing = map.get(qid);
    if (!existing) {
      map.set(qid, sheet);
      return;
    }
    const existingHasJson = !!existing.costing_data;
    const sheetHasJson = !!sheet.costing_data;
    if (sheetHasJson && !existingHasJson) {
      map.set(qid, sheet);
      return;
    }
    const existingTs = new Date(existing.updated_at || existing.created_at || 0).getTime();
    const sheetTs = new Date(sheet.updated_at || sheet.created_at || 0).getTime();
    if (sheetTs > existingTs) map.set(qid, sheet);
  });
  return map;
}

/** Remove blank rows before persisting costing sheet JSON. */
export function filterEmptyCostingItems(items, costingData = {}) {
  const manualKeys = [
    'qty',
    'import_base_cost',
    'import_custom_duty_pct',
    'import_freight',
    'import_transit_insurance_pct',
    'supply_freight',
    'supply_transit_insurance_pct',
    'margin_pct',
    'business_dev_pct',
    'other_misc_cost',
    'gst_pct',
  ];

  const filtered = (items || []).filter((item) => {
    const name = (item.productName || item.name || '').trim();
    if (name) return true;
    return manualKeys.some((key) => {
      const raw = costingData[`${item.id}_${key}`];
      if (raw === '' || raw === null || raw === undefined) return false;
      const n = parseFloat(raw);
      return !Number.isNaN(n) && n !== 0;
    });
  });

  return filtered.length > 0 ? filtered : items?.length ? [items[0]] : [];
}

/** Parse enquiry secondary emails from DB value. */
export function parseEnquirySecondaryEmails(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((e) => String(e).trim()).filter(Boolean);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map((e) => String(e).trim()).filter(Boolean);
    } catch {
      // comma-separated fallback
    }
    return trimmed
      .split(/[,;]+/)
      .map((e) => e.trim())
      .filter(Boolean);
  }
  return [];
}

/** Normalize comma-separated email input into unique list. */
export function parseCommaSeparatedEmails(input) {
  return String(input || '')
    .split(/[,;]+/)
    .map((e) => e.trim())
    .filter(Boolean);
}
