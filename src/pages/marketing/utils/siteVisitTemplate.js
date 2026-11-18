import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';

const YELLOW = 'FFFFFF00';
const BLUE = 'FF9DC3E6';
const WHITE = 'FFFFFFFF';
const HEADER_FONT = { bold: true, size: 10, color: { argb: 'FF1F2937' } };
const THIN = { style: 'thin', color: { argb: 'FFD1D5DB' } };
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };

const SINGLE_HEADERS = [
  'Date of Expense Submission',
  'Site Expense Submitted By',
  'Site Visited By (Name)',
  'Site Visited By (Designation)',
  'Client Name',
  "Client's Location",
  'Purpose of Visit',
  "Client's Representative (Name)",
  "Client's Representative (Designation)",
  "Client's Representative (Mobile No.)",
  "Client's Representative (E-mail ID)",
  'No. of Visit Days',
  'Fare',
  'Daily Allowance',
  'Lodging',
  'Conveyance',
  'Other Expense',
];

const SETTLEMENT_HEADERS = ['Total Expense', 'Less Advance Taken', 'Final Settlement Amount'];
const LAST_MANUAL_COLUMN = 19;

const COLUMN_WIDTHS = [24, 16, 16, 24, 22, 24, 22, 22, 22, 26, 28, 28, 28, 16, 12, 16, 14, 14, 16, 16, 18, 22];

const DATA_START = 4;
const DATA_ROWS = 40;

function fill(argb) {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function headerCell(cell, text, color) {
  cell.value = text;
  cell.font = HEADER_FONT;
  cell.fill = fill(color);
  cell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
  cell.border = BORDER;
}

export async function downloadSiteVisitTemplate() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'INDUS ERP';
  const ws = wb.addWorksheet('New Site Visit Template', {
    views: [{ state: 'frozen', ySplit: 3 }],
  });

  ws.columns = COLUMN_WIDTHS.map((width) => ({ width }));

  let column = 1;
  SINGLE_HEADERS.forEach((label) => {
    if (column === 2) {
      headerCell(ws.getCell(1, 2), 'Duration of Visit', YELLOW);
      headerCell(ws.getCell(2, 2), 'From (Date)', YELLOW);
      headerCell(ws.getCell(2, 3), 'To (Date)', YELLOW);
      ws.mergeCells(1, 2, 1, 3);
      column = 4;
    }
    headerCell(ws.getCell(1, column), label, YELLOW);
    ws.mergeCells(1, column, 2, column);
    column += 1;
  });

  SETTLEMENT_HEADERS.forEach((label) => {
    headerCell(ws.getCell(1, column), label, BLUE);
    ws.mergeCells(1, column, 2, column);
    column += 1;
  });

  ws.mergeCells(3, 1, 3, LAST_MANUAL_COLUMN);
  headerCell(ws.getCell(3, 1), 'Manual Entry', YELLOW);
  ws.mergeCells(3, LAST_MANUAL_COLUMN + 1, 3, LAST_MANUAL_COLUMN + SETTLEMENT_HEADERS.length);
  headerCell(ws.getCell(3, LAST_MANUAL_COLUMN + 1), 'Formulated', BLUE);

  ws.getRow(1).height = 32;
  ws.getRow(2).height = 22;
  ws.getRow(3).height = 20;

  for (let row = DATA_START; row < DATA_START + DATA_ROWS; row += 1) {
    const excelRow = ws.getRow(row);
    excelRow.height = 18;
    for (let col = 1; col <= COLUMN_WIDTHS.length; col += 1) {
      const cell = excelRow.getCell(col);
      cell.border = BORDER;
      cell.alignment = { vertical: 'middle', horizontal: col >= 14 ? 'right' : 'left' };
      if (col <= 3) cell.numFmt = 'dd-mmm-yyyy';
      if (col === 14) cell.numFmt = '0';
      if (col >= 15) cell.numFmt = '#,##0.00';
      if (col === 20 || col === 22) cell.fill = fill('FFF3F8FC');
    }
    excelRow.getCell(20).value = { formula: `IF(COUNT(O${row}:S${row})=0,"",SUM(O${row}:S${row}))` };
    excelRow.getCell(22).value = { formula: `IF(T${row}="","",T${row}-N(U${row}))` };
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'Site_Visit_Template.xlsx';
  link.click();
  URL.revokeObjectURL(url);
}

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function money(value) {
  const cleaned = text(value).replace(/[₹,\s]/g, '');
  if (!cleaned) return 0;
  const amount = Number(cleaned);
  return Number.isFinite(amount) ? amount : 0;
}

function excelSerialToIso(serial) {
  const days = Math.floor(Number(serial));
  const offset = days >= 60 ? days - 1 : days;
  const date = new Date(Date.UTC(1899, 11, 31) + offset * 86400000);
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${date.getUTCFullYear()}-${month}-${day}`;
}

function sheetDate(value) {
  if (typeof value === 'number' && value > 20000 && value < 80000) {
    return excelSerialToIso(value);
  }
  const raw = text(value);
  if (!raw) return '';
  const parts = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (parts) {
    const year = parts[3].length === 2 ? `20${parts[3]}` : parts[3];
    return `${year}-${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
  }
  const named = raw.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (named) {
    const month = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
      .indexOf(named[2].toLowerCase());
    if (month >= 0) {
      return `${named[3]}-${String(month + 1).padStart(2, '0')}-${named[1].padStart(2, '0')}`;
    }
  }
  return '';
}

function columnIndex(matrix, headerRow, label) {
  const wanted = label.toLowerCase();
  const rows = [matrix[headerRow] || [], matrix[headerRow + 1] || []];
  for (const row of rows) {
    const index = row.findIndex((cell) => text(cell).toLowerCase() === wanted);
    if (index >= 0) return index;
  }
  return -1;
}

const TEMPLATE_HEADERS = [
  'Date of Expense Submission',
  'From (Date)',
  'To (Date)',
  'Site Expense Submitted By',
  'Site Visited By (Name)',
  'Client Name',
  'Fare',
  'Daily Allowance',
  'Lodging',
  'Conveyance',
  'Other Expense',
  'Total Expense',
  'Less Advance Taken',
  'Final Settlement Amount',
];

function isNewSiteVisitMatrix(matrix) {
  const flat = matrix.slice(0, 4).flat().map((cell) => text(cell).toLowerCase());
  return TEMPLATE_HEADERS.every((header) => flat.includes(header.toLowerCase()));
}

function parseNewSiteVisitMatrix(matrix) {
  const headerRow = matrix.findIndex((row) => row.some((cell) => /date of expense submission/i.test(text(cell))));
  const at = (row, label) => {
    const index = columnIndex(matrix, headerRow, label);
    return index >= 0 ? row[index] : '';
  };

  const records = [];
  for (let i = headerRow + 2; i < matrix.length; i += 1) {
    const row = matrix[i] || [];
    const joined = row.map(text).join(' ').toLowerCase();
    if (!joined.trim() || joined.includes('manual entry') || joined === 'formulated') continue;

    const submittedBy = text(at(row, 'Site Expense Submitted By'));
    const visitorName = text(at(row, 'Site Visited By (Name)'));
    const clientName = text(at(row, 'Client Name'));
    if (!submittedBy && !visitorName && !clientName) continue;

    const fare = money(at(row, 'Fare'));
    const allowance = money(at(row, 'Daily Allowance'));
    const lodging = money(at(row, 'Lodging'));
    const conveyance = money(at(row, 'Conveyance'));
    const other = money(at(row, 'Other Expense'));
    const statedTotal = money(at(row, 'Total Expense'));
    const advance = money(at(row, 'Less Advance Taken'));
    const statedSettlement = money(at(row, 'Final Settlement Amount'));
    const total = statedTotal || fare + allowance + lodging + conveyance + other;
    const fromDate = sheetDate(at(row, 'From (Date)'));
    const toDate = sheetDate(at(row, 'To (Date)'));
    const submittedOn = sheetDate(at(row, 'Date of Expense Submission'));
    const representative = text(at(row, "Client's Representative (Name)"));
    const representativeRole = text(at(row, "Client's Representative (Designation)"));
    const days = text(at(row, 'No. of Visit Days'));

    const notes = [
      submittedOn ? `Expense submitted on ${submittedOn}` : '',
      toDate ? `Visit to ${toDate}` : '',
      days ? `Visit days: ${days}` : '',
      representative ? `Client representative: ${representative}${representativeRole ? ` (${representativeRole})` : ''}` : '',
      conveyance ? `Conveyance: ${conveyance}` : '',
      advance ? `Advance taken: ${advance}` : '',
    ].filter(Boolean);

    records.push({
      executive_names: submittedBy,
      visitor_name: visitorName,
      company_name: '',
      client_name: clientName,
      designation: text(at(row, 'Site Visited By (Designation)')),
      site_location: text(at(row, "Client's Location")),
      mobile_number: text(at(row, "Client's Representative (Mobile No.)")),
      email_id: text(at(row, "Client's Representative (E-mail ID)")),
      product_interest: '',
      discussion_note: notes.join('\n'),
      visit_date: fromDate || submittedOn || new Date().toISOString().slice(0, 10),
      purpose_of_visit: text(at(row, 'Purpose of Visit')),
      travel_expenses: fare,
      food_expenses: allowance,
      accommodation: lodging,
      other_expenses: other + conveyance,
      total_expense: total,
      approved_amount: statedSettlement || (total || advance ? total - advance : null),
      status: 'Pending Paid',
    });
  }
  return records;
}

export function readSiteVisitSheet(data) {
  const workbook = XLSX.read(data, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
  if (!isNewSiteVisitMatrix(matrix)) {
    return { format: 'invalid', records: [] };
  }
  return { format: 'new', records: parseNewSiteVisitMatrix(matrix) };
}
