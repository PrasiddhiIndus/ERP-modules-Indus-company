/**
 * Classify BOQ data rows and infer heading / item / part hierarchy.
 */

import { parseBoqNumber, normalizeCellText } from './boqImportParse';
import { round2 } from './quotationMakerModel';

/** @typedef {'heading'|'item'|'part'|'note'|'total'|'blank'|'unknown'} BoqRowType */

/**
 * @param {Record<number, string>} columnMap
 * @param {string[]} row
 */
export function extractMappedValues(columnMap, row) {
  const out = {
    sr: '',
    description: '',
    unit: '',
    qty: null,
    supply_rate: null,
    supply_amount: null,
    install_rate: null,
    install_amount: null,
    service_rate: null,
    service_amount: null,
    rate: null,
    amount: null,
    make: '',
    remarks: '',
  };
  Object.entries(columnMap || {}).forEach(([colKey, field]) => {
    if (!field || field === 'ignore') return;
    const col = Number(colKey);
    const cell = row[col];
    if (['sr', 'description', 'unit', 'make', 'remarks'].includes(field)) {
      const text = normalizeCellText(cell);
      if (text) out[field] = out[field] ? `${out[field]} ${text}`.trim() : text;
      return;
    }
    const n = parseBoqNumber(cell);
    if (n != null) out[field] = n;
  });
  return out;
}

function parseSrToken(sr) {
  const s = normalizeCellText(sr);
  if (!s) return { kind: 'empty', raw: '' };
  // "5.0" / "10.00" are whole numbers, not sub-items
  if (/^\d+\.0+$/.test(s)) return { kind: 'int', raw: s, n: Number(s) };
  // 1.1.1 style
  if (/^\d+(\.\d+)+$/.test(s)) {
    const parts = s.split('.').map(Number);
    return { kind: 'decimal', raw: s, parts, depth: parts.length };
  }
  if (/^\d+$/.test(s)) return { kind: 'int', raw: s, n: Number(s) };
  if (/^[A-Z]$/.test(s)) return { kind: 'section', raw: s };
  if (/^[a-z]$/.test(s)) return { kind: 'letter', raw: s };
  if (/^[ivxlcdm]+$/i.test(s) && s.length <= 4) return { kind: 'roman', raw: s };
  return { kind: 'other', raw: s };
}

function isTotalDescription(desc) {
  const d = normalizeCellText(desc).toLowerCase();
  return /^(grand\s+)?totals?\b/.test(d) || /^sub[\s-]?totals?\b/.test(d);
}

/** Total / GST summary rows often put the label in Sr, Unit or Rate columns. */
function isTotalLine(line, vals) {
  if (vals.qty != null) return false;
  return (line || []).some((cell) => {
    const t = normalizeCellText(cell).toLowerCase();
    return (
      /^(grand\s+)?totals?/.test(t) ||
      /^sub[\s-]?totals?/.test(t) ||
      /^total\s+amount/.test(t) ||
      /^gst/.test(t)
    );
  });
}

function isTypeOfJobLine(desc) {
  return /^type of job\b/i.test(normalizeCellText(desc));
}

/**
 * Resolve rates into supply / install / service using ambiguousRateTarget when needed.
 * @param {object} vals
 * @param {'service'|'supply'|'installation'|null} ambiguousRateTarget
 */
export function resolveRates(vals, ambiguousRateTarget = null) {
  let supply = vals.supply_rate;
  let install = vals.install_rate;
  let service = vals.service_rate;
  if (vals.rate != null) {
    if (ambiguousRateTarget === 'supply' && supply == null) supply = vals.rate;
    else if (ambiguousRateTarget === 'installation' && install == null) install = vals.rate;
    else if (ambiguousRateTarget === 'service' && service == null) service = vals.rate;
    else if (supply == null && install == null && service == null) {
      // Still ambiguous — leave on service for preview until user picks
      service = vals.rate;
    }
  }
  return {
    supply_rate: supply ?? 0,
    install_rate: install ?? 0,
    service_rate: service ?? 0,
    supply_amount: vals.supply_amount,
    install_amount: vals.install_amount,
    service_amount: vals.service_amount ?? vals.amount,
  };
}

function amountDiscrepancy(qty, rate, sourceAmount) {
  if (sourceAmount == null || rate == null || qty == null) return null;
  const calc = round2(Number(qty) * Number(rate));
  const src = round2(sourceAmount);
  const diff = round2(Math.abs(calc - src));
  if (diff <= 0.05) return null;
  return { calc, source: src, diff };
}

/**
 * @param {object} opts
 * @param {string[][]} opts.grid
 * @param {number} opts.headerRowIndex
 * @param {Record<number, string>} opts.columnMap
 * @param {string} opts.sheetName
 * @param {'service'|'supply'|'installation'|null} [opts.ambiguousRateTarget]
 */
export function classifyBoqRows({
  grid,
  headerRowIndex,
  columnMap,
  sheetName = 'Sheet',
  ambiguousRateTarget = null,
}) {
  const rows = [];
  if (headerRowIndex < 0) return { rows, summary: emptySummary() };

  let currentHeadingKey = null;
  let currentItemKey = null;
  let lastPricedKey = null;
  /** @type {Map<string, number>} */
  const keyToIndex = new Map();
  /** key → { parentKey, priced } for items, so priced parents don't swallow siblings */
  const itemInfo = new Map();
  let headingIsSection = false;

  for (let r = headerRowIndex + 1; r < grid.length; r += 1) {
    const line = grid[r] || [];
    const vals = extractMappedValues(columnMap, line);
    const blank = !vals.sr && !vals.description && vals.qty == null && !vals.make && !vals.remarks;
    if (blank) continue;

    if (isTypeOfJobLine(vals.description)) {
      rows.push(
        makeReviewRow({
          sourceRow: r + 1,
          sheetName,
          vals,
          rowType: 'note',
          excluded: true,
          status: 'excluded',
          warnings: ['Type-of-job banner — excluded by default'],
          parentKey: null,
          key: `r${r}`,
        })
      );
      continue;
    }

    if (isTotalDescription(vals.description) || isTotalLine(line, vals)) {
      rows.push(
        makeReviewRow({
          sourceRow: r + 1,
          sheetName,
          vals,
          rowType: 'total',
          excluded: true,
          status: 'excluded',
          warnings: ['Section/grand total row — not imported as a priced item'],
          parentKey: null,
          key: `r${r}`,
          rates: resolveRates(vals, ambiguousRateTarget),
        })
      );
      continue;
    }

    const sr = parseSrToken(vals.sr);
    const hasQty = vals.qty != null;
    const hasUnit = Boolean(vals.unit);
    const rates = resolveRates(vals, ambiguousRateTarget);
    const hasRate =
      rates.supply_rate > 0 || rates.install_rate > 0 || rates.service_rate > 0 || vals.rate != null;
    const key = `r${r}`;

    /** @type {BoqRowType} */
    let rowType = 'unknown';
    let parentKey = null;
    const warnings = [];

    const priced = hasQty || hasRate;
    if (sr.kind === 'section' && priced) {
      // "A / B / C" with qty: sub-item of an un-priced group item, else a plain item
      const group = currentItemKey ? itemInfo.get(currentItemKey) : null;
      if (group && !group.priced) {
        rowType = 'part';
        parentKey = currentItemKey;
      } else {
        // Peer of section headings A / B → stands on its own, not inside the last section
        rowType = 'item';
        parentKey = headingIsSection ? null : currentHeadingKey;
        currentItemKey = key;
      }
      lastPricedKey = key;
    } else if (sr.kind === 'section') {
      rowType = 'heading';
      currentHeadingKey = key;
      headingIsSection = true;
      currentItemKey = null;
    } else if (sr.kind === 'letter' || (sr.kind === 'decimal' && sr.depth >= 2)) {
      rowType = 'part';
      parentKey = currentItemKey || lastPricedKey;
      const parentInfo = parentKey ? itemInfo.get(parentKey) : null;
      if (parentInfo?.priced && priced) {
        // e.g. "2.0" priced then "2.1" priced — siblings, not parts
        rowType = 'item';
        parentKey = parentInfo.parentKey;
        lastPricedKey = key;
      } else if (!parentKey) {
        warnings.push('Part without a parent item — flagged for review');
        rowType = 'item';
        parentKey = currentHeadingKey;
      } else {
        lastPricedKey = key;
      }
    } else if (sr.kind === 'int' || (sr.kind === 'decimal' && sr.depth === 1)) {
      // Parent group item (no qty) or leaf
      rowType = 'item';
      parentKey = currentHeadingKey;
      currentItemKey = key;
      lastPricedKey = key;
    } else if (sr.kind === 'empty') {
      // Continuation / note under last item
      if (lastPricedKey && vals.description && !hasQty && !hasRate) {
        rowType = 'note';
        parentKey = lastPricedKey;
      } else if (vals.description && (hasQty || hasRate)) {
        rowType = 'item';
        parentKey = currentHeadingKey;
        currentItemKey = key;
        lastPricedKey = key;
        warnings.push('No source serial — treated as item');
      } else if (vals.description) {
        rowType = 'note';
        parentKey = lastPricedKey || currentHeadingKey;
      } else {
        rowType = 'blank';
      }
    } else {
      if (hasQty || hasRate) {
        rowType = 'item';
        parentKey = currentHeadingKey;
        currentItemKey = key;
        lastPricedKey = key;
        warnings.push('Unrecognized serial format');
      } else if (vals.description) {
        rowType = 'heading';
        currentHeadingKey = key;
        currentItemKey = null;
        warnings.push('Treated as heading (unrecognized serial)');
      }
    }

    // Amount discrepancy for leaf-like rows
    if (rowType === 'item' || rowType === 'part') {
      const qty = vals.qty ?? 0;
      const checks = [
        amountDiscrepancy(qty, rates.supply_rate || null, rates.supply_amount),
        amountDiscrepancy(qty, rates.install_rate || null, rates.install_amount),
        amountDiscrepancy(
          qty,
          rates.service_rate || null,
          rates.service_amount ?? (vals.amount != null && !rates.supply_amount ? vals.amount : null)
        ),
      ].filter(Boolean);
      checks.forEach((d) => {
        warnings.push(`Amount mismatch: source ${d.source} vs qty×rate ${d.calc}`);
      });
    }

    if (rowType === 'item') itemInfo.set(key, { parentKey, priced });

    if (!vals.description && rowType !== 'blank') {
      warnings.push('Missing description');
    }

    let status = 'ok';
    let excluded = false;
    if (rowType === 'blank') {
      excluded = true;
      status = 'excluded';
    } else if (warnings.some((w) => /Missing description|without a parent|Unrecognized/.test(w))) {
      status = 'warn';
    } else if (warnings.length) status = 'warn';

    const review = makeReviewRow({
      sourceRow: r + 1,
      sheetName,
      vals,
      rowType,
      excluded,
      status,
      warnings,
      parentKey,
      key,
      rates,
    });
    keyToIndex.set(key, rows.length);
    rows.push(review);
  }

  // Merge notes into parent description (still keep note rows excluded for import tree)
  rows.forEach((row) => {
    if (row.rowType !== 'note' || row.excluded === false) return;
    // notes are excluded from import as separate rows; text merged in toMakerRows
  });

  return { rows, summary: summarize(rows) };
}

function makeReviewRow({
  sourceRow,
  sheetName,
  vals,
  rowType,
  excluded,
  status,
  warnings,
  parentKey,
  key,
  rates,
}) {
  const r = rates || resolveRates(vals, null);
  return {
    key,
    sourceRow,
    sheetName,
    sourceSr: vals.sr || '',
    rowType,
    description: vals.description || '',
    unit: vals.unit || '',
    qty: vals.qty,
    supply_rate: r.supply_rate || 0,
    install_rate: r.install_rate || 0,
    service_rate: r.service_rate || 0,
    supply_amount: r.supply_amount,
    install_amount: r.install_amount,
    service_amount: r.service_amount,
    make: vals.make || '',
    remarks: vals.remarks || '',
    parentKey,
    excluded: Boolean(excluded),
    status,
    warnings: warnings || [],
  };
}

function emptySummary() {
  return { extracted: 0, valid: 0, warning: 0, excluded: 0 };
}

export function summarize(rows) {
  const summary = emptySummary();
  (rows || []).forEach((r) => {
    summary.extracted += 1;
    if (r.excluded) summary.excluded += 1;
    else if (r.status === 'warn') summary.warning += 1;
    else summary.valid += 1;
  });
  return summary;
}

/** Re-run rate resolution after user picks ambiguous target. */
export function reapplyAmbiguousRates(rows, ambiguousRateTarget, originalValsByKey) {
  return (rows || []).map((row) => {
    const vals = originalValsByKey?.get(row.key);
    if (!vals) return row;
    const rates = resolveRates(vals, ambiguousRateTarget);
    return {
      ...row,
      supply_rate: rates.supply_rate || 0,
      install_rate: rates.install_rate || 0,
      service_rate: rates.service_rate || 0,
    };
  });
}
