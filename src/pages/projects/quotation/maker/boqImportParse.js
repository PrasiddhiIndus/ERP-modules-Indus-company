/**
 * BOQ workbook/CSV → sheet list + 2D string grids.
 * Uses xlsx for Excel (cached formula values) and PapaParse for CSV.
 */

import * as XLSX from 'xlsx';
import Papa from 'papaparse';

export const BOQ_IMPORT_MAX_BYTES = 8 * 1024 * 1024;
export const BOQ_IMPORT_MAX_ROWS = 5000;
export const BOQ_IMPORT_MAX_COLS = 40;

const EXCEL_EXT = /\.(xlsx|xls|xlsm)$/i;
const CSV_EXT = /\.csv$/i;

export function normalizeCellText(value) {
  if (value == null) return '';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return String(value)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\u00a0/g, ' ')
    .trim();
}

/** Parse money / qty cells: strip currency, commas, spaces. */
export function parseBoqNumber(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  let s = String(raw)
    .replace(/₹/g, '')
    .replace(/Rs\.?/gi, '')
    .replace(/INR/gi, '')
    .replace(/,/g, '')
    .replace(/\s+/g, '')
    .replace(/[–—−]/g, '-')
    .trim();
  if (!s || s === '-' || s === '—' || /^[-.]+$/.test(s)) return null;
  // Parentheses negative
  if (/^\(.*\)$/.test(s)) s = `-${s.slice(1, -1)}`;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function truncateGrid(grid) {
  const rows = (grid || []).slice(0, BOQ_IMPORT_MAX_ROWS).map((row) => {
    const cells = Array.isArray(row) ? row : [row];
    return cells.slice(0, BOQ_IMPORT_MAX_COLS).map((c) => normalizeCellText(c));
  });
  // Drop trailing all-empty rows
  let end = rows.length;
  while (end > 0 && rows[end - 1].every((c) => !c)) end -= 1;
  return rows.slice(0, end);
}

function sheetToGrid(ws) {
  if (!ws) return [];
  const raw = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: '',
    raw: false,
    blankrows: true,
  });
  return truncateGrid(raw);
}

/**
 * @param {File|Blob} file
 * @returns {Promise<{ fileName: string, sheets: Array<{ name: string, grid: string[][] }> }>}
 */
export async function parseBoqWorkbookFile(file) {
  if (!file) throw new Error('No file selected.');
  const fileName = file.name || 'upload';
  if (file.size > BOQ_IMPORT_MAX_BYTES) {
    throw new Error('File is too large (max 8 MB).');
  }

  if (CSV_EXT.test(fileName) || String(file.type || '').includes('csv')) {
    const text = await file.text();
    const parsed = Papa.parse(text, { header: false, skipEmptyLines: false });
    if (parsed.errors?.length && !parsed.data?.length) {
      throw new Error(parsed.errors[0]?.message || 'Could not parse CSV.');
    }
    const grid = truncateGrid(parsed.data || []);
    return { fileName, sheets: [{ name: 'Sheet1', grid }] };
  }

  if (!EXCEL_EXT.test(fileName) && !/sheet|excel/i.test(String(file.type || ''))) {
    throw new Error('Unsupported file type. Use .xlsx, .xls, or .csv.');
  }

  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true, cellNF: false, cellText: true });
  if (!wb.SheetNames?.length) throw new Error('Workbook has no worksheets.');

  const sheets = wb.SheetNames.map((name) => ({
    name: String(name || '').trim() || 'Sheet',
    grid: sheetToGrid(wb.Sheets[name]),
  })).filter((s) => s.grid.length > 0);

  if (!sheets.length) throw new Error('No readable data found in the workbook.');
  return { fileName, sheets };
}

/** Build a workbook object from in-memory grids (tests / re-detect). */
export function workbookFromGrids(sheets) {
  return {
    fileName: 'fixture.xlsx',
    sheets: (sheets || []).map((s) => ({
      name: s.name || 'Sheet',
      grid: truncateGrid(s.grid || []),
    })),
  };
}
