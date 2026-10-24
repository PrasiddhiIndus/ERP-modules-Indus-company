/**
 * Confirmed review rows → Quotation Maker createEmptyRow tree.
 */

import { createEmptyRow, normalizeType, QUOTATION_TYPES } from './quotationMakerModel';

/**
 * Put BOQ rates into the column(s) the current quotation type prices on,
 * e.g. a supply-only BOQ imported into a Service quotation fills the service price.
 */
function fitRatesToQuotationType(row, quotationType) {
  if (!quotationType) return;
  const t = QUOTATION_TYPES[normalizeType(quotationType)];
  const rates = { supply_rate: row.supply_rate, install_rate: row.install_rate, rate: row.rate };
  if (t.pricing === 2) {
    if (!row.supply_rate && !row.install_rate && row.rate) {
      row.supply_rate = row.rate;
      row.rate = 0;
    }
    return;
  }
  if (rates[t.rateField]) return;
  const fallback =
    t.rateField === 'rate'
      ? row.supply_rate + row.install_rate
      : rates.rate || (t.rateField === 'supply_rate' ? row.install_rate : row.supply_rate);
  if (fallback) row[t.rateField] = fallback;
}

/**
 * Collect note text that should append to a parent item description.
 * @param {Array<object>} reviewRows
 */
function notesByParent(reviewRows) {
  const map = new Map();
  (reviewRows || []).forEach((r) => {
    if (r.rowType !== 'note') return;
    if (!r.parentKey || !r.description) return;
    const list = map.get(r.parentKey) || [];
    list.push(String(r.description).trim());
    map.set(r.parentKey, list);
  });
  return map;
}

/**
 * @param {Array<object>} reviewRows - editable review rows from classify / modal
 * @param {{ mode?: 'replace'|'append', existingRows?: object[], quotationType?: string }} [options]
 * @returns {{ rows: object[], showMake: boolean, showRemarks: boolean, importedCount: number }}
 */
export function reviewRowsToMakerRows(reviewRows, options = {}) {
  const mode = options.mode === 'append' ? 'append' : 'replace';
  const existing = mode === 'append' ? [...(options.existingRows || [])] : [];

  const notes = notesByParent(reviewRows);
  const importable = (reviewRows || []).filter(
    (r) => !r.excluded && ['heading', 'item', 'part'].includes(r.rowType)
  );

  /** @type {Map<string, string>} review key → maker id */
  const idByKey = new Map();
  const built = [];
  let showMake = false;
  let showRemarks = false;

  importable.forEach((r) => {
    const isHeading = r.rowType === 'heading';
    let parentId = null;
    if (r.parentKey && idByKey.has(r.parentKey)) {
      parentId = idByKey.get(r.parentKey);
    }

    const row = createEmptyRow(isHeading ? 'heading' : 'item', parentId);
    idByKey.set(r.key, row.id);

    let description = String(r.description || '').trim();
    const extra = notes.get(r.key);
    if (extra?.length) {
      description = [description, ...extra].filter(Boolean).join('\n');
    }
    row.description = description;

    if (!isHeading) {
      row.unit = String(r.unit || '').trim() || 'Nos';
      const qty = r.qty == null || r.qty === '' ? 0 : Number(r.qty);
      row.qty = Number.isFinite(qty) ? qty : 0;
      row.supply_rate = Number(r.supply_rate) || 0;
      row.install_rate = Number(r.install_rate) || 0;
      row.rate = Number(r.service_rate) || 0;
      fitRatesToQuotationType(row, options.quotationType);
      row.make = String(r.make || '').trim();
      row.remarks = String(r.remarks || '').trim();
      if (row.make) showMake = true;
      if (row.remarks) showRemarks = true;
    }

    built.push(row);
  });

  return {
    rows: mode === 'append' ? [...existing, ...built] : built,
    showMake,
    showRemarks,
    importedCount: built.length,
  };
}

/** True when maker already has any real content rows. */
export function makerHasLineItems(rows) {
  return (rows || []).some((r) => {
    if (!r) return false;
    if (r.row_type === 'heading' && String(r.description || '').trim()) return true;
    if (r.row_type === 'item') return true;
    return false;
  });
}
