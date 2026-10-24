/**
 * Quotation Maker → Excel (.xlsx): headings, items / parts and totals in editor order.
 */

import ExcelJS from 'exceljs';
import {
  QUOTATION_TYPES,
  buildColumnKeys,
  columnLabel,
  computeTotals,
  expandDisplayRows,
  headingColumnTotal,
  isGroup,
  lineAmount,
  normalizeType,
  numberOf,
  rowTotal,
} from './quotationMakerModel';

const MONEY = '#,##0.00';

function itemDepth(rows, r) {
  let depth = 0;
  let cur = r;
  while (cur?.parent_row_id) {
    const p = rows.find((x) => x.id === cur.parent_row_id);
    if (!p || p.row_type !== 'item') break;
    depth += 1;
    cur = p;
  }
  return depth;
}

function headingTotalCell(rows, headingId, key, type) {
  if (key === 'supply_total') return headingColumnTotal(rows, headingId, 'supply');
  if (key === 'install_total') return headingColumnTotal(rows, headingId, 'inst');
  if (key === 'total') {
    const heading = rows.find((x) => x.id === headingId);
    return heading ? rowTotal(rows, heading, type) : 0;
  }
  return null;
}

function itemCell(rows, r, key, type) {
  const group = isGroup(rows, r);
  const t = QUOTATION_TYPES[type];
  switch (key) {
    case 'sr':
      return numberOf(rows, r);
    case 'description':
      return `${'    '.repeat(itemDepth(rows, r))}${r.description || ''}`;
    case 'unit':
      return group ? '' : r.unit || '';
    case 'qty':
      return group ? null : Number(r.qty) || 0;
    case 'make':
      return r.make || '';
    case 'remarks':
      return r.remarks || '';
    case 'price_unit':
      return group ? null : Number(r[t.rateField]) || 0;
    case 'total':
      return rowTotal(rows, r, type);
    case 'supply_unit':
      return group ? null : Number(r.supply_rate) || 0;
    case 'install_unit':
      return group ? null : Number(r.install_rate) || 0;
    case 'supply_total':
      return group
        ? headingColumnTotalOfGroup(rows, r, 'supply')
        : lineAmount(r, 'supply');
    case 'install_total':
      return group ? headingColumnTotalOfGroup(rows, r, 'inst') : lineAmount(r, 'inst');
    default:
      return null;
  }
}

function headingColumnTotalOfGroup(rows, group, which) {
  return rows
    .filter((x) => x.parent_row_id === group.id)
    .reduce((s, x) => s + (isGroup(rows, x) ? headingColumnTotalOfGroup(rows, x, which) : lineAmount(x, which)), 0);
}

/**
 * @param {{ form: object, rows: object[] }} opts
 * @returns {Promise<Blob>}
 */
export async function exportQuotationToExcelBlob({ form, rows }) {
  const type = normalizeType(form.quotation_type);
  const list = rows || [];
  const keys = buildColumnKeys(type, {
    showMake: Boolean(form.show_make),
    showRemarks: Boolean(form.show_remarks),
    makeBefore: form.make_column_before || 'unit',
  }).filter((k) => k !== 'actions');
  const moneyKeys = new Set(['price_unit', 'total', 'supply_unit', 'supply_total', 'install_unit', 'install_total']);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Quotation');
  ws.columns = keys.map((k) => ({
    key: k,
    width: k === 'description' ? 60 : k === 'sr' ? 8 : k === 'remarks' || k === 'make' ? 22 : 14,
  }));

  const info = [
    ['Quotation No.', form.quotation_no || ''],
    ['Date', form.quote_date || ''],
    ['Client', form.client_company || ''],
    ['Contact', form.client_contact || ''],
    ['Address', form.client_address || ''],
    ['Subject', form.subject || ''],
    ['Type', QUOTATION_TYPES[type].name],
  ];
  info.forEach(([label, value]) => {
    const row = ws.addRow([label, value]);
    row.getCell(1).font = { bold: true };
  });
  ws.addRow([]);

  const header = ws.addRow(keys.map((k) => columnLabel(k, type)));
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
    cell.alignment = { vertical: 'middle', wrapText: true };
    cell.border = { bottom: { style: 'thin' } };
  });

  expandDisplayRows(list).forEach((r) => {
    if (r.row_type === 'heading') {
      const row = ws.addRow(keys.map((k) => (k === 'description' ? r.description || '' : null)));
      row.font = { bold: true };
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7EEF7' } };
      });
      return;
    }
    if (r.row_type === 'heading_total') {
      const row = ws.addRow(
        keys.map((k) =>
          k === 'description' ? `Total — ${r.description || ''}` : headingTotalCell(list, r.heading_id, k, type)
        )
      );
      row.font = { bold: true, italic: true };
      keys.forEach((k, i) => {
        if (moneyKeys.has(k)) row.getCell(i + 1).numFmt = MONEY;
      });
      return;
    }
    const row = ws.addRow(keys.map((k) => itemCell(list, r, k, type)));
    if (isGroup(list, r)) row.font = { bold: true };
    keys.forEach((k, i) => {
      const cell = row.getCell(i + 1);
      if (moneyKeys.has(k)) cell.numFmt = MONEY;
      if (k === 'description') cell.alignment = { wrapText: true, vertical: 'top' };
    });
  });

  const totals = computeTotals(list, type);
  ws.addRow([]);
  const lastCol = keys.reduce((last, k, i) => (moneyKeys.has(k) ? i + 1 : last), keys.length);
  const addTotal = (label, value) => {
    const row = ws.addRow([]);
    row.getCell(Math.max(1, lastCol - 1)).value = label;
    row.getCell(lastCol).value = value;
    row.getCell(lastCol).numFmt = MONEY;
    row.font = { bold: true };
  };
  if (QUOTATION_TYPES[type].pricing === 2) {
    addTotal('Supply total', totals.supply_total);
    addTotal('Installation total', totals.install_total);
  }
  addTotal('Grand total (excl. GST)', totals.grand_total);

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
