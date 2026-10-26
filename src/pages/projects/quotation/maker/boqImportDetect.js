/**
 * Detect BOQ header row(s) and map columns (incl. dual SUPPLY / INSTALLATION rates).
 */

import { normalizeCellText, parseBoqNumber } from './boqImportParse';

/** @typedef {'sr'|'description'|'unit'|'qty'|'supply_rate'|'supply_amount'|'install_rate'|'install_amount'|'service_rate'|'service_amount'|'rate'|'amount'|'make'|'remarks'|'ignore'} BoqField */

export const BOQ_FIELD_OPTIONS = [
  { value: 'ignore', label: '— Ignore —' },
  { value: 'sr', label: 'Source Sr / No.' },
  { value: 'description', label: 'Description' },
  { value: 'unit', label: 'Unit' },
  { value: 'qty', label: 'Quantity' },
  { value: 'supply_rate', label: 'Supply rate' },
  { value: 'supply_amount', label: 'Supply amount' },
  { value: 'install_rate', label: 'Installation rate' },
  { value: 'install_amount', label: 'Installation amount' },
  { value: 'service_rate', label: 'Service rate' },
  { value: 'service_amount', label: 'Service amount' },
  { value: 'rate', label: 'Rate (ambiguous)' },
  { value: 'amount', label: 'Amount (ambiguous)' },
  { value: 'make', label: 'Make' },
  { value: 'remarks', label: 'Remarks' },
];

function normHeader(s) {
  return normalizeCellText(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Score a single cell as a possible header label for a field. */
function scoreFieldLabel(h) {
  const n = normHeader(h);
  if (!n) return null;

  if (/^(sr|s no|sno|sl|sl no|item no|itemno|serial|no)$/.test(n) || n === 'sr no' || n.startsWith('sr no')) {
    return { field: 'sr', score: 10 };
  }
  if (/description|particular|item description|scope of work|work description|^item$|^desc$/.test(n)) {
    return { field: 'description', score: 10 };
  }
  if (/^unit$|^uom$|unit of measure/.test(n)) return { field: 'unit', score: 10 };
  if (/^qty$|^quantity$|^qty\.$/.test(n)) return { field: 'qty', score: 10 };
  if (/make|manufacturer|brand|vendor/.test(n) && !/remark/.test(n)) return { field: 'make', score: 9 };
  if (/remark|notes?|exclusion|comment/.test(n)) return { field: 'remarks', score: 8 };

  // Short forms used by many contractors: "S.Rate", "S.Total", "I.Rate", "I.Total"
  const short = n.match(/^(s|i)\s+(rate|total|amount|amt)$/);
  if (short) {
    const grp = short[1] === 's' ? 'supply' : 'install';
    return { field: `${grp}_${short[2] === 'rate' ? 'rate' : 'amount'}`, score: 11 };
  }

  const isSupply = /supply/.test(n);
  const isInstall = /install|erection|fitting/.test(n);
  const isService = /\bservice\b/.test(n) && !isSupply && !isInstall;
  const isRate = /\brate\b|\brates\b|unit price|unit rate|price\/unit|price per/.test(n);
  // Avoid matching "Basic Total", "Grand Total" banners as amount columns.
  const isPlainAmount = /^(total|amount|amt|value)$/.test(n);
  const isAmount =
    isPlainAmount ||
    ((isSupply || isInstall || isService) && /\b(total|amount|amt)\b/.test(n));

  if (isSupply && isRate) return { field: 'supply_rate', score: 12 };
  if (isInstall && isRate) return { field: 'install_rate', score: 12 };
  if (isService && isRate) return { field: 'service_rate', score: 11 };
  if (isSupply && isAmount) return { field: 'supply_amount', score: 10 };
  if (isInstall && isAmount) return { field: 'install_amount', score: 10 };
  if (isService && isAmount) return { field: 'service_amount', score: 9 };
  if (isRate && !isSupply && !isInstall && !isService) return { field: 'rate', score: 6 };
  if (isPlainAmount && !isSupply && !isInstall && !isService) return { field: 'amount', score: 5 };

  return null;
}

/**
 * Look at row index and previous row for group labels like "SUPPLY In Rs" spanning columns.
 * @returns {Record<number, 'supply'|'install'|'service'|null>}
 */
function inferGroupContext(grid, headerRowIndex) {
  const groups = {};
  const prev = headerRowIndex > 0 ? grid[headerRowIndex - 1] || [] : [];
  let current = null;
  const maxCol = Math.max(prev.length, (grid[headerRowIndex] || []).length);
  for (let c = 0; c < maxCol; c += 1) {
    const label = normHeader(prev[c]);
    if (/supply/.test(label)) current = 'supply';
    else if (/install|erection/.test(label)) current = 'install';
    else if (/^service$|service in/.test(label)) current = 'service';
    else if (/make|manufacturer|brand|basic|accessories/.test(label)) current = null;
    // Empty cell under a merged group keeps current
    groups[c] = current;
  }
  return groups;
}

function applyGroupToField(field, group) {
  if (!group) return field;
  if (field === 'rate') {
    if (group === 'supply') return 'supply_rate';
    if (group === 'install') return 'install_rate';
    if (group === 'service') return 'service_rate';
  }
  if (field === 'amount') {
    if (group === 'supply') return 'supply_amount';
    if (group === 'install') return 'install_amount';
    if (group === 'service') return 'service_amount';
  }
  return field;
}

/**
 * Score how well a row looks like a BOQ column-header row.
 * Group labels on the previous row (SUPPLY / INSTALLATION) only remap Rate/Total —
 * they are not used as column titles (avoids picking the banner row as the header).
 */
export function scoreHeaderRow(grid, rowIndex) {
  const row = grid[rowIndex] || [];
  const groups = inferGroupContext(grid, rowIndex);
  let score = 0;
  const hits = new Set();
  row.forEach((cell, c) => {
    const hit = scoreFieldLabel(cell);
    if (!hit) return;
    const field = applyGroupToField(hit.field, groups[c]);
    score += hit.score;
    hits.add(field);
  });
  // Real BOQ headers almost always include Description + Qty.
  if (hits.has('description')) score += 40;
  else score -= 50;
  if (hits.has('qty')) score += 20;
  if (hits.has('unit')) score += 10;
  if (hits.has('sr')) score += 8;
  if (hits.has('supply_rate') || hits.has('install_rate') || hits.has('rate') || hits.has('service_rate')) {
    score += 15;
  }
  if (hits.has('supply_rate') && hits.has('install_rate')) score += 20;
  return { score, hits };
}

/**
 * @returns {{ headerRowIndex: number, columnMap: Record<number, BoqField>, ambiguousRate: boolean, score: number, headerLabels: string[] }}
 */
export function detectBoqColumns(grid) {
  const g = grid || [];
  let best = { score: Number.NEGATIVE_INFINITY, index: -1, hits: new Set() };
  const scanLimit = Math.min(g.length, 80);
  for (let i = 0; i < scanLimit; i += 1) {
    const { score, hits } = scoreHeaderRow(g, i);
    if (score > best.score) best = { score, index: i, hits };
  }

  // Need Description (+ typically Qty) — raw group-banner rows score poorly after penalties.
  if (best.index < 0 || best.score < 30 || !best.hits?.has?.('description')) {
    // Re-check hits on best index
    const check = best.index >= 0 ? scoreHeaderRow(g, best.index) : { hits: new Set() };
    if (best.index < 0 || best.score < 30 || !check.hits.has('description')) {
      return {
        headerRowIndex: -1,
        columnMap: {},
        ambiguousRate: false,
        score: best.score,
        headerLabels: [],
        groupContext: {},
      };
    }
  }

  // Two-row header: group labels (SUPPLY / INSTALLATION) on the header row and
  // RATE / AMOUNT on the row just below — treat the lower row as the detail header.
  const below = g[best.index + 1] || [];
  const belowHasRateLabels = below.some((cell) => {
    const hit = scoreFieldLabel(cell);
    return hit && ['rate', 'amount', 'supply_rate', 'install_rate', 'supply_amount', 'install_amount'].includes(hit.field);
  });
  const belowLooksLikeData = below.some((cell) => parseBoqNumber(cell) != null);
  if (belowHasRateLabels && !belowLooksLikeData) {
    const top = g[best.index] || [];
    const merged = [];
    const width = Math.max(top.length, below.length);
    let group = '';
    for (let c = 0; c < width; c += 1) {
      const t = normalizeCellText(top[c]);
      const b = normalizeCellText(below[c]);
      if (t) group = /supply|install|erection|service/i.test(t) ? t : '';
      if (b && scoreFieldLabel(b)) merged[c] = group ? `${group} ${b}` : b;
      else merged[c] = t || b;
    }
    const nextGrid = g.slice();
    nextGrid[best.index + 1] = merged;
    const det = detectBoqColumnsAt(nextGrid, best.index + 1);
    return { ...det, score: best.score };
  }
  return detectBoqColumnsAt(g, best.index, best.score);
}

function detectBoqColumnsAt(g, headerIndex, score) {
  const best = { index: headerIndex, score };
  const headerRow = g[best.index] || [];
  const prevRow = best.index > 0 ? g[best.index - 1] || [] : [];
  const maxCol = Math.max(headerRow.length, prevRow.length);
  const groups = inferGroupContext(g, best.index);
  /** @type {Record<number, BoqField>} */
  const columnMap = {};
  const used = new Set();
  const headerLabels = [];

  for (let c = 0; c < maxCol; c += 1) {
    const label = normalizeCellText(headerRow[c]);
    // Make often sits on the group row above an empty detail cell.
    const prevLabel = normalizeCellText(prevRow[c]);
    const labelForScore =
      label || (/make|manufacturer|brand|remark|notes?/i.test(prevLabel) ? prevLabel : '');
    headerLabels[c] = label || prevLabel;
    const hit = scoreFieldLabel(labelForScore);
    if (!hit) {
      columnMap[c] = 'ignore';
      continue;
    }
    const field = applyGroupToField(hit.field, groups[c]);
    if (used.has(field) && !['ignore', 'remarks'].includes(field)) {
      columnMap[c] = 'ignore';
      continue;
    }
    used.add(field);
    columnMap[c] = field;
  }

  const hasSplit =
    Object.values(columnMap).includes('supply_rate') ||
    Object.values(columnMap).includes('install_rate');
  const hasAmbiguousRate = Object.values(columnMap).includes('rate') && !hasSplit;

  return {
    headerRowIndex: best.index,
    columnMap,
    ambiguousRate: hasAmbiguousRate,
    score: best.score,
    headerLabels,
    groupContext: groups,
  };
}

/**
 * Rank sheets that look like BOQ tables (skip cover / summary letters).
 * @param {Array<{ name: string, grid: string[][] }>} sheets
 */
export function rankBoqSheets(sheets) {
  return (sheets || [])
    .map((sheet, index) => {
      const det = detectBoqColumns(sheet.grid);
      return {
        index,
        name: sheet.name,
        score: det.score,
        headerRowIndex: det.headerRowIndex,
        recommended:
          det.score >= 60 &&
          det.headerRowIndex >= 0 &&
          Object.values(det.columnMap).includes('qty'),
      };
    })
    .sort((a, b) => b.score - a.score);
}

export function emptyColumnMap(colCount) {
  const map = {};
  for (let i = 0; i < colCount; i += 1) map[i] = 'ignore';
  return map;
}
