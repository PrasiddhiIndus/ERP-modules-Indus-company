/**
 * Annexure-I (salary breakup) as an .xlsx download, laid out like the company's
 * "SALARY BREAKUP" sheet. Labels and amounts come from ANNEXURE_ROWS and the saved
 * CTC record (frozen values, not live Excel formulas).
 */

import ExcelJS from "exceljs";
import { annexureMonthlyValue, annexurePaValue, annexureRowsFor, roundRupee } from "./ctcEngine";
import { isAnnexureRecord, recordToComponents, statusLabel } from "./annexureCtcRecord";

const COMPANY_NAME = "Indus Fire Safety Private Limited";
const DEFAULT_TITLE = "COMPENSATION SCHEME-Year 2026-27";
const DEFAULT_NOTE =
  "*Note: The salary and its components mentioned herein are subject to revision in accordance with applicable Government laws and regulations from time to time, without any impact on the total CTC.";
const DEFAULT_SIGNATORY_COMPANY = "For Indus Fire Safety Private Limited";
const DEFAULT_SIGNATORY_TITLE = "C.E.O.";

const FONT = { name: "Aptos Narrow", size: 11 };
const GREY = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };
const THIN = { style: "thin" };
const BOX = { top: THIN, left: THIN, bottom: THIN, right: THIN };
const AMOUNT_FMT = '[>=10000000]"₹"##\\,##\\,##\\,##0;[>=100000]"₹"##\\,##\\,##0;"₹"#,##0';

function isoParts(d) {
  const s = String(d || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split("-").map(Number) : null;
}

/** Excel date cell value (UTC so the serial does not shift by the browser time zone). */
function excelDate(d) {
  const p = isoParts(d);
  return p ? new Date(Date.UTC(p[0], p[1] - 1, p[2])) : "";
}

function wefHeader(d) {
  const p = isoParts(d);
  if (!p) return "w.e.f.";
  const [y, m, day] = p;
  return `w.e.f. ${String(day).padStart(2, "0")}.${String(m).padStart(2, "0")}.${String(y).slice(-2)}`;
}

function amount(v) {
  const n = Number(v);
  return Number.isFinite(n) ? roundRupee(n) : null;
}

function safeFilePart(v) {
  return String(v || "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, "_");
}

function triggerXlsxDownload(buffer, filename) {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function styleRange(ws, row, style) {
  for (const col of ["A", "B", "C"]) Object.assign(ws.getCell(`${col}${row}`), style);
}

/** Build the workbook (exported for tests). */
export function buildCtcDetailsWorkbook({ employee, record, segment, ruleVersion }) {
  const values = recordToComponents(record) || {};
  const wb = new ExcelJS.Workbook();
  wb.creator = "Indus ERP";
  const sheetName = isAnnexureRecord(record) ? statusLabel(record.employee_status) : "CTC";
  const ws = wb.addWorksheet(sheetName, {
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  ws.columns = [{ width: 45.4 }, { width: 14.7 }, { width: 19.4 }];

  let r = 1;
  ws.mergeCells(`A${r}:C${r}`);
  ws.getCell(`A${r}`).value = "Annexure-I";
  styleRange(ws, r, {
    font: { ...FONT, size: 12, bold: true },
    alignment: { horizontal: "center", vertical: "middle" },
  });

  r = 3;
  ws.mergeCells(`A${r}:C${r}`);
  ws.getCell(`A${r}`).value = COMPANY_NAME;
  styleRange(ws, r, { font: { ...FONT, size: 12, bold: true }, fill: GREY, border: BOX, alignment: { horizontal: "center" } });

  const info = [
    ["Location", employee?.location || ""],
    ["Employee Code", employee?.employee_code || employee?.employee_id || ""],
    ["Employee Name", employee?.full_name || ""],
    ["Department", employee?.department || ""],
    ["Designation", employee?.designation || ""],
    ["Segment", segment || ""],
    ["DOB", excelDate(employee?.date_of_birth), true],
    ["DOJ", excelDate(employee?.date_of_joining), true],
    ["W.E.F.", excelDate(record?.wef_date), true],
  ];
  r = 4;
  for (const [label, value, isDate] of info) {
    ws.mergeCells(`B${r}:C${r}`);
    ws.getCell(`A${r}`).value = label;
    ws.getCell(`B${r}`).value = value;
    styleRange(ws, r, { font: FONT, border: BOX });
    for (const col of ["B", "C"]) {
      const cell = ws.getCell(`${col}${r}`);
      cell.alignment = { horizontal: "left", vertical: "middle" };
      if (isDate) cell.numFmt = "d-mmm-yy";
    }
    r += 1;
  }

  ws.mergeCells(`A${r}:C${r}`);
  ws.getCell(`A${r}`).value = ruleVersion?.annexure_title || DEFAULT_TITLE;
  styleRange(ws, r, { font: { ...FONT, bold: true }, fill: GREY, border: BOX, alignment: { horizontal: "center" } });
  r += 1;

  ws.getCell(`A${r}`).value = "PART-A";
  ws.getCell(`B${r}`).value = wefHeader(record?.wef_date);
  ws.getCell(`C${r}`).value = "P.A";
  styleRange(ws, r, { font: { ...FONT, bold: true }, fill: GREY, border: BOX, alignment: { horizontal: "center" } });
  r += 1;

  for (const row of annexureRowsFor(values)) {
    if (row.heading) {
      ws.mergeCells(`B${r}:C${r}`);
      ws.getCell(`A${r}`).value = row.label;
      styleRange(ws, r, { font: FONT, border: BOX });
      ws.getCell(`A${r}`).font = { ...FONT, bold: true };
      ws.getCell(`A${r}`).alignment = { horizontal: "center" };
      r += 1;
      continue;
    }
    const monthly = amount(values[row.key]);
    const pa = monthly == null ? null : annexurePaValue(values, row.key);
    ws.getCell(`A${r}`).value = row.label;
    ws.getCell(`B${r}`).value = annexureMonthlyValue(values, row.key) == null ? null : monthly;
    ws.getCell(`C${r}`).value = pa == null ? null : amount(pa);
    const isCtc = row.key === "ctc";
    styleRange(ws, r, {
      font: { ...FONT, bold: Boolean(row.total) },
      border: BOX,
      ...(isCtc ? { fill: GREY } : {}),
    });
    ws.getCell(`A${r}`).alignment = row.total
      ? { horizontal: row.key === "total_b" ? "right" : "center" }
      : { horizontal: "left" };
    for (const col of ["B", "C"]) {
      const cell = ws.getCell(`${col}${r}`);
      cell.alignment = { horizontal: "right" };
      cell.numFmt = AMOUNT_FMT;
    }
    r += 1;
  }

  const note = ruleVersion?.annexure_note || DEFAULT_NOTE;
  ws.mergeCells(`A${r}:C${r + 1}`);
  ws.getCell(`A${r}`).value = note;
  for (const rr of [r, r + 1]) {
    styleRange(ws, rr, {
      font: { ...FONT, size: 9 },
      alignment: { horizontal: "center", vertical: "top", wrapText: true },
    });
    ws.getRow(rr).height = 13.5;
  }
  styleRange(ws, r, { border: { top: THIN } });
  r += 2;

  ws.getCell(`A${r}`).value = ruleVersion?.signatory_company || DEFAULT_SIGNATORY_COMPANY;
  ws.getCell(`A${r}`).font = { ...FONT, bold: true };
  r += 3;
  ws.getCell(`A${r}`).value = ruleVersion?.signatory_title || DEFAULT_SIGNATORY_TITLE;
  ws.getCell(`A${r}`).font = { ...FONT, bold: true };

  return wb;
}

/** Download the Annexure-I sheet for one CTC record. */
export async function exportCtcDetailsExcel({ employee, record, segment, ruleVersion }) {
  const wb = buildCtcDetailsWorkbook({ employee, record, segment, ruleVersion });
  const buffer = await wb.xlsx.writeBuffer();
  const code = safeFilePart(employee?.employee_code || employee?.employee_id);
  const name = safeFilePart(employee?.full_name);
  triggerXlsxDownload(buffer, `Salary_Breakup_${[code, name].filter(Boolean).join("_") || "employee"}.xlsx`);
}
