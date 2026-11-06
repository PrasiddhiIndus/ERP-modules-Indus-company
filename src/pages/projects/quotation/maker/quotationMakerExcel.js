/**
 * Quotation Maker → Excel (.xlsx): headings, items / parts and totals in editor order.
 */

import ExcelJS from 'exceljs';
import { formatDateDdMmYyyy } from '../../../../utils/dateDisplay';
import { DEFAULT_MAKER_CLOSING, DEFAULT_MAKER_OPENING } from '../../../../services/quotationApi';
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
const THIN = { style: 'thin', color: { argb: 'FF9AA3B2' } };
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };
const WIDTHS = {
  sr: 7,
  description: 38,
  unit: 8,
  qty: 8,
  make: 14,
  remarks: 16,
  price_unit: 13,
  total: 14,
  supply_unit: 12,
  supply_total: 13,
  install_unit: 12,
  install_total: 13,
};

function columnWidths(keys) {
  const raw = keys.map((key) => WIDTHS[key] || 12);
  const sum = raw.reduce((total, width) => total + width, 0);
  const target = keys.length > 7 ? 108 : 96;
  return raw.map((width) => Math.max(6, Math.round((width * target) / sum)));
}

function textHeight(text, widthChars) {
  const lines = String(text || '')
    .split('\n')
    .reduce((count, line) => count + Math.max(1, Math.ceil(line.length / Math.max(12, widthChars))), 0);
  return Math.min(96, Math.max(18, lines * 15 + 2));
}

function paintRow(row, colCount, border) {
  for (let col = 1; col <= colCount; col += 1) {
    const cell = row.getCell(col);
    cell.alignment = { ...(cell.alignment || {}), vertical: 'middle', wrapText: true };
    if (border) cell.border = BORDER;
  }
}

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
export async function exportQuotationToExcelBlob({
  form,
  rows,
  signature = null,
  openingText = null,
  closingText = null,
}) {
  const type = normalizeType(form.quotation_type);
  const list = rows || [];
  const keys = buildColumnKeys(type, {
    showMake: Boolean(form.show_make),
    showRemarks: Boolean(form.show_remarks),
    makeBefore: form.make_column_before || 'unit',
  }).filter((k) => k !== 'actions');
  const colCount = keys.length;
  const widths = columnWidths(keys);
  const textWidth = widths.reduce((sum, width) => sum + width, 0);
  const moneyKeys = new Set(['price_unit', 'total', 'supply_unit', 'supply_total', 'install_unit', 'install_total']);
  const rightKeys = new Set(['qty', ...moneyKeys]);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Quotation', {
    views: [{ showGridLines: false }],
    pageSetup: {
      paperSize: 9,
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
    },
  });
  ws.pageSetup.fitToWidth = 1;
  ws.pageSetup.fitToHeight = 0;
  ws.pageMargins = { left: 0.55, right: 0.55, top: 0.5, bottom: 0.5, header: 0.25, footer: 0.25 };
  ws.columns = keys.map((key, index) => ({ key, width: widths[index] }));
  ws.headerFooter = { oddFooter: '&CPage &P of &N' };

  const writeLine = (value, { font, align, height, fill } = {}) => {
    const row = ws.addRow([value]);
    if (colCount > 1) ws.mergeCells(row.number, 1, row.number, colCount);
    const cell = row.getCell(1);
    cell.font = font || { size: 11 };
    cell.alignment = { wrapText: true, vertical: 'middle', horizontal: align || 'left' };
    if (height) row.height = height;
    if (fill) cell.fill = fill;
    return row;
  };

  writeLine('INDUS FIRE SAFETY PVT. LTD.', {
    font: { bold: true, size: 14, color: { argb: 'FFB3261E' } },
    align: 'center',
    height: 20,
  });
  writeLine('QUOTATION', { font: { bold: true, size: 16 }, align: 'center', height: 22 });

  const ref = ws.addRow([`Ref: ${form.quotation_no || ''}`]);
  ref.getCell(colCount).value = `Date: ${formatDateDdMmYyyy(form.quote_date) || form.quote_date || ''}`;
  ref.getCell(1).font = { size: 11, bold: true };
  ref.getCell(colCount).font = { size: 11, bold: true };
  ref.getCell(colCount).alignment = { horizontal: 'right', vertical: 'middle' };
  ref.height = 18;

  const gap = ws.addRow([]);
  gap.height = 6;

  const toLines = ['To,', form.client_contact || '', form.client_company || '', form.client_address || '']
    .filter((line, index) => index === 0 || String(line || '').trim())
    .join('\n');
  writeLine(toLines, { font: { size: 11 }, height: textHeight(toLines, textWidth) });
  writeLine(`Subject: ${form.subject || QUOTATION_TYPES[type].subject}`, { font: { size: 11, bold: true }, height: 18 });

  const opening = openingText == null ? DEFAULT_MAKER_OPENING : openingText;
  if (String(opening || '').trim()) {
    writeLine(opening, { font: { size: 11 }, height: textHeight(opening, textWidth) });
  }

  const beforeTable = ws.addRow([]);
  beforeTable.height = 6;

  const header = ws.addRow(keys.map((key) => columnLabel(key, type)));
  header.height = 28;
  for (let col = 1; col <= colCount; col += 1) {
    const cell = header.getCell(col);
    cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = BORDER;
  }

  const descWidth = widths[keys.indexOf('description')] || 30;
  expandDisplayRows(list).forEach((r) => {
    let row;
    if (r.row_type === 'heading') {
      row = ws.addRow(keys.map((key) => (key === 'description' ? r.description || '' : null)));
      row.font = { bold: true, size: 11 };
    } else if (r.row_type === 'heading_total') {
      row = ws.addRow(
        keys.map((key) =>
          key === 'description' ? `Total — ${r.description || ''}` : headingTotalCell(list, r.heading_id, key, type)
        )
      );
      row.font = { bold: true, italic: true, size: 10 };
    } else {
      row = ws.addRow(keys.map((key) => itemCell(list, r, key, type)));
      row.font = { bold: isGroup(list, r), size: 10 };
    }
    const description = String(row.getCell(keys.indexOf('description') + 1).value || '');
    row.height = Math.min(48, Math.max(16, Math.ceil(description.length / Math.max(10, descWidth)) * 14));
    for (let col = 1; col <= colCount; col += 1) {
      const cell = row.getCell(col);
      const key = keys[col - 1];
      cell.border = BORDER;
      cell.alignment = {
        wrapText: true,
        vertical: 'middle',
        horizontal: key === 'description' || key === 'make' || key === 'remarks' ? 'left' : rightKeys.has(key) ? 'right' : 'center',
      };
      if (moneyKeys.has(key) && typeof cell.value === 'number') cell.numFmt = MONEY;
      if (r.row_type === 'heading') {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F3F7' } };
      }
      if (r.row_type === 'heading_total') {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF6' } };
      }
    }
  });

  const totals = computeTotals(list, type);
  const afterTable = ws.addRow([]);
  afterTable.height = 6;
  const lastCol = keys.reduce((last, key, index) => (moneyKeys.has(key) ? index + 1 : last), colCount);
  const labelCol = Math.max(1, lastCol - 1);
  const addTotal = (label, value, grand = false) => {
    const row = ws.addRow([]);
    row.height = 18;
    row.getCell(labelCol).value = label;
    row.getCell(lastCol).value = value;
    row.getCell(lastCol).numFmt = MONEY;
    row.getCell(labelCol).font = { bold: true, size: grand ? 12 : 11 };
    row.getCell(lastCol).font = { bold: true, size: grand ? 12 : 11 };
    row.getCell(labelCol).alignment = { horizontal: 'right', vertical: 'middle' };
    row.getCell(lastCol).alignment = { horizontal: 'right', vertical: 'middle' };
    if (grand) {
      row.getCell(labelCol).border = { top: { style: 'thin' } };
      row.getCell(lastCol).border = { top: { style: 'thin' } };
    }
  };
  if (QUOTATION_TYPES[type].pricing === 2) {
    addTotal('Supply total', totals.supply_total);
    addTotal('Installation total', totals.install_total);
  }
  addTotal('Grand total (excl. GST)', totals.grand_total, true);

  const terms = (form.terms || []).map((line) => String(line || '').trim()).filter(Boolean);
  if (terms.length) {
    const termsGap = ws.addRow([]);
    termsGap.height = 8;
    writeLine('Terms and Conditions', { font: { bold: true, size: 12 }, height: 18 });
    terms.forEach((line, index) => {
      writeLine(`${index + 1}. ${line}`, { font: { size: 10 }, height: textHeight(`${index + 1}. ${line}`, textWidth) });
    });
  }

  const closing = closingText == null ? DEFAULT_MAKER_CLOSING : closingText;
  if (String(closing || '').trim()) {
    const closingGap = ws.addRow([]);
    closingGap.height = 8;
    writeLine(closing, { font: { size: 11 }, height: textHeight(closing, textWidth) });
  }

  const signGap = ws.addRow([]);
  signGap.height = 8;
  writeLine('Thanks & regards', { font: { bold: true, size: 11 }, height: 16 });
  if (signature?.base64 && signature.extension) {
    const imageId = wb.addImage({ base64: signature.base64, extension: signature.extension });
    const imageRow = ws.addRow([]);
    imageRow.height = 40;
    ws.addImage(imageId, {
      tl: { col: 0.1, row: imageRow.number - 1 },
      ext: { width: 140, height: 44 },
      editAs: 'oneCell',
    });
  }
  writeLine(form.signatory_name || '', { font: { bold: true, size: 11 }, height: 16 });
  if (form.signatory_designation) writeLine(form.signatory_designation, { font: { size: 11 }, height: 16 });
  writeLine('Indus Fire Safety Pvt Ltd.', { font: { size: 11 }, height: 16 });

  const lastColumn = String.fromCharCode(64 + Math.min(colCount, 26));
  ws.pageSetup.printArea = `A1:${lastColumn}${ws.rowCount}`;
  paintRow(ref, colCount, false);

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
