/**
 * Builds the monthly attendance / payroll prep workbook (.xlsx).
 *
 * Layout is intentionally data-driven so you can swap column order, add
 * statutory columns, or change formula rules when you share the final
 * company template — adjust ATTENDANCE_SHEET_LAYOUT below.
 */
import * as XLSX from "xlsx";

/** @typedef {{ code: string, name: string, department: string, designation?: string, shift?: string }} EmployeeRow */

export const ATTENDANCE_SHEET_LAYOUT = {
  /** First data column index (0 = A) after fixed employee columns */
  fixedCols: [
    { key: "sl", header: "Sl.", width: 5 },
    { key: "code", header: "Employee Code", width: 14 },
    { key: "name", header: "Employee Name", width: 22 },
    { key: "department", header: "Department", width: 16 },
    { key: "designation", header: "Designation", width: 16 },
    { key: "shift", header: "Shift", width: 10 },
  ],
  /** Summary columns after day columns (formulas reference the day band) */
  summaryHeaders: ["Days in month", "Present (P)", "Absent (A)", "Leave (L)", "Holiday (H)", "Weekly off (WO)", "Payable days*"],
  /**
   * Excel formulas for summary columns; {startCol} and {endCol} are absolute column letters
   * for the day range on the same row (Excel 1-based row index = dataRowExcel).
   */
  summaryFormulas: [
    (ctx) => `DAY(EOMONTH(DATE(${ctx.year},${ctx.month},1),0))`,
    (ctx) => `COUNTIF(${ctx.dayStartCol}{row}:${ctx.dayEndCol}{row},"P")`,
    (ctx) => `COUNTIF(${ctx.dayStartCol}{row}:${ctx.dayEndCol}{row},"A")`,
    (ctx) => `COUNTIF(${ctx.dayStartCol}{row}:${ctx.dayEndCol}{row},"L")`,
    (ctx) => `COUNTIF(${ctx.dayStartCol}{row}:${ctx.dayEndCol}{row},"H")`,
    (ctx) => `COUNTIF(${ctx.dayStartCol}{row}:${ctx.dayEndCol}{row},"WO")`,
    (ctx) => `${ctx.presentCol}{row}+${ctx.leaveCol}{row}+${ctx.holidayCol}{row}+${ctx.woCol}{row}`,
  ],
};

/** Admin → Payroll → Formula tab (mirrors `summaryFormulas`; day columns shift by month length). */
export const PAYROLL_ATTENDANCE_FORMULA_DOCS = [
  {
    header: "Days in month",
    description: "Calendar days for the register month.",
    excelPattern: "DAY(EOMONTH(DATE(year,month,1),0))",
  },
  {
    header: "Present (P)",
    description: "Count of day cells marked P in that employee row.",
    excelPattern: 'COUNTIF(dayStart:dayEnd,"P")',
  },
  {
    header: "Absent (A)",
    description: "Count of A marks.",
    excelPattern: 'COUNTIF(dayStart:dayEnd,"A")',
  },
  {
    header: "Leave (L)",
    description: "Count of approved leave marks.",
    excelPattern: 'COUNTIF(dayStart:dayEnd,"L")',
  },
  {
    header: "Holiday (H)",
    description: "Count of holiday marks.",
    excelPattern: 'COUNTIF(dayStart:dayEnd,"H")',
  },
  {
    header: "Weekly off (WO)",
    description: "Count of weekly-off marks.",
    excelPattern: 'COUNTIF(dayStart:dayEnd,"WO")',
  },
  {
    header: "Payable days*",
    description: "Present + Leave + Holiday + WO (policy note in export legend; adjust in code if your policy differs).",
    excelPattern: "Present_col + Leave_col + Holiday_col + WO_col",
  },
];

function pad2(n) {
  return String(n).padStart(2, "0");
}

export function monthMeta(year, month) {
  const days = new Date(year, month, 0).getDate();
  const label = `${year}-${pad2(month)}`;
  const title = `${new Date(year, month - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" })}`;
  return { days, label, title };
}

/**
 * @param {object} opts
 * @param {number} opts.year
 * @param {number} opts.month 1-12
 * @param {EmployeeRow[]} opts.employees
 * @param {string} [opts.company]
 * @param {string} [opts.site]
 * @param {Record<string, Record<number, string>>} [opts.seedMarks] empCode -> day(1..n) -> letter e.g. P,A,L
 */
export function buildAttendancePayrollWorkbook(opts) {
  const { year, month, employees, company = "IFSPL / IEVPL", site = "All sites" } = opts;
  const seedMarks = opts.seedMarks || {};
  const { days, label, title } = monthMeta(year, month);
  const fixed = ATTENDANCE_SHEET_LAYOUT.fixedCols;
  const firstDayColIdx = fixed.length;
  const lastDayColIdx = firstDayColIdx + days - 1;
  const dayStartCol = XLSX.utils.encode_col(firstDayColIdx);
  const dayEndCol = XLSX.utils.encode_col(lastDayColIdx);
  const summaryStartColIdx = lastDayColIdx + 1;
  const summaryHeaders = ATTENDANCE_SHEET_LAYOUT.summaryHeaders;
  const summaryCount = summaryHeaders.length;
  const presentSummaryIdx = summaryStartColIdx + 1;
  const leaveSummaryIdx = summaryStartColIdx + 3;
  const holidaySummaryIdx = summaryStartColIdx + 4;
  const woSummaryIdx = summaryStartColIdx + 5;
  const presentCol = XLSX.utils.encode_col(presentSummaryIdx);
  const leaveCol = XLSX.utils.encode_col(leaveSummaryIdx);
  const holidayCol = XLSX.utils.encode_col(holidaySummaryIdx);
  const woCol = XLSX.utils.encode_col(woSummaryIdx);

  const headerRow0 = 1;
  const headerRow1 = 2;
  const headerRow2 = 3;
  const colHeaderRow = 4;
  const firstDataExcelRow = 5;

  const ws = {};
  const merges = [];

  const totalCols = fixed.length + days + summaryCount;
  merges.push({
    s: { r: headerRow0 - 1, c: 0 },
    e: { r: headerRow0 - 1, c: totalCols - 1 },
  });
  merges.push({
    s: { r: headerRow1 - 1, c: 0 },
    e: { r: headerRow1 - 1, c: totalCols - 1 },
  });
  merges.push({
    s: { r: headerRow2 - 1, c: 0 },
    e: { r: headerRow2 - 1, c: totalCols - 1 },
  });

  ws[XLSX.utils.encode_cell({ r: headerRow0 - 1, c: 0 })] = {
    v: `Attendance register — ${title}`,
    t: "s",
  };
  ws[XLSX.utils.encode_cell({ r: headerRow1 - 1, c: 0 })] = {
    v: `Company: ${company}   |   Site / location: ${site}   |   Period: ${label}`,
    t: "s",
  };
  ws[XLSX.utils.encode_cell({ r: headerRow2 - 1, c: 0 })] = {
    v: "Mark each day: P = Present, A = Absent, L = Approved leave, H = Holiday, WO = Weekly off. Accounts / compliance consume this export as-is.",
    t: "s",
  };

  fixed.forEach((col, c) => {
    const addr = XLSX.utils.encode_cell({ r: colHeaderRow - 1, c });
    ws[addr] = { v: col.header, t: "s" };
  });
  for (let d = 1; d <= days; d += 1) {
    const c = firstDayColIdx + d - 1;
    const addr = XLSX.utils.encode_cell({ r: colHeaderRow - 1, c });
    const dateObj = new Date(year, month - 1, d);
    const dow = dateObj.toLocaleString("en-IN", { weekday: "short" });
    ws[addr] = { v: `${d}\n${dow}`, t: "s" };
  }
  summaryHeaders.forEach((h, i) => {
    const c = summaryStartColIdx + i;
    ws[XLSX.utils.encode_cell({ r: colHeaderRow - 1, c })] = { v: h, t: "s" };
  });

  const formulaCtxBase = {
    year,
    month,
    dayStartCol,
    dayEndCol,
    presentCol,
    leaveCol,
    holidayCol,
    woCol,
  };

  employees.forEach((emp, idx) => {
    const excelRow = firstDataExcelRow + idx;
    const r = excelRow - 1;
    let c = 0;
    ws[XLSX.utils.encode_cell({ r, c: c++ })] = { v: idx + 1, t: "n" };
    ws[XLSX.utils.encode_cell({ r, c: c++ })] = { v: emp.code, t: "s" };
    ws[XLSX.utils.encode_cell({ r, c: c++ })] = { v: emp.name, t: "s" };
    ws[XLSX.utils.encode_cell({ r, c: c++ })] = { v: emp.department, t: "s" };
    ws[XLSX.utils.encode_cell({ r, c: c++ })] = { v: emp.designation || "", t: "s" };
    ws[XLSX.utils.encode_cell({ r, c: c++ })] = { v: emp.shift || "General", t: "s" };

    const empSeed = seedMarks[emp.code] || {};
    for (let d = 1; d <= days; d += 1) {
      const mark = empSeed[d] ?? "";
      ws[XLSX.utils.encode_cell({ r, c })] = { v: mark, t: "s" };
      c += 1;
    }

    const formulaCtx = { ...formulaCtxBase, row: excelRow };
    ATTENDANCE_SHEET_LAYOUT.summaryFormulas.forEach((fn, i) => {
      const f = fn(formulaCtx).replaceAll("{row}", String(excelRow));
      const addr = XLSX.utils.encode_cell({ r, c: summaryStartColIdx + i });
      ws[addr] = { f, t: "n" };
    });
  });

  const legendRow = firstDataExcelRow + employees.length + 1;
  ws[XLSX.utils.encode_cell({ r: legendRow - 1, c: 0 })] = {
    v: "* Payable days formula sums Present + Leave + Holiday + weekly off (adjust in attendanceSheetExcel.js to match your policy).",
    t: "s",
  };

  ws["!merges"] = merges;
  ws["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: legendRow - 1, c: totalCols - 1 },
  });

  const colWidths = [
    ...fixed.map((x) => ({ wch: x.width })),
    ...Array.from({ length: days }, () => ({ wch: 4 })),
    ...summaryHeaders.map(() => ({ wch: 14 })),
  ];
  ws["!cols"] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Attendance");
  const meta = XLSX.utils.aoa_to_sheet([
    ["Workbook role", "Admin → Accounts / compliance handoff"],
    ["Period", label],
    ["Generated at (UTC)", new Date().toISOString()],
    ["Source", "INDUS OS — Admin payroll module (mock or API data)"],
  ]);
  XLSX.utils.book_append_sheet(wb, meta, "Meta");
  return wb;
}

export function downloadAttendanceWorkbook(wb, filename) {
  XLSX.writeFile(wb, filename);
}

export const PAYROLL_ENTRY_COLUMNS = [
  { key: "srNo", header: "SR.No.", width: 7, source: "master" },
  { key: "employeeCode", header: "Emp'ee Code", width: 13, source: "master" },
  { key: "pfNo", header: "PF No.", width: 14, source: "master" },
  { key: "uanNo", header: "UAN No.", width: 14, source: "master" },
  { key: "esicNo", header: "ESIC No.", width: 14, source: "master" },
  { key: "name", header: "Name", width: 22, source: "master" },
  { key: "accountNumber", header: "Account Number", width: 18, source: "master" },
  { key: "ifscCode", header: "IFSC Code", width: 15, source: "master" },
  { key: "designation", header: "Designation", width: 18, source: "master" },
  { key: "dateOfJoining", header: "Date Of Joining", width: 15, source: "master" },
  { key: "presentDays", header: "P. Days", width: 8, source: "attendance" },
  { key: "grossWages", header: "Gross wages", width: 13, source: "editable" },
  { key: "pfBasic", header: "PF basic", width: 11, source: "editable" },
  { key: "pfBasicEarned", header: "PF basic earned", width: 15, source: "formula" },
  { key: "basic", header: "Basic", width: 11, source: "editable" },
  { key: "basicEarned", header: "Basic Earned", width: 13, source: "formula" },
  { key: "hra", header: "HRA", width: 11, source: "formula" },
  { key: "conveyanceAllowance", header: "Convayance Allowance", width: 19, source: "formula" },
  { key: "medicalAllowance", header: "Medical  Allowance", width: 17, source: "formula" },
  { key: "attendanceBonus", header: "Attendance bonus", width: 16, source: "formula" },
  { key: "journalPeriodicals", header: "Journal & Periodicals", width: 20, source: "formula" },
  { key: "childrenEduAllowance", header: "Children Edu allow", width: 18, source: "formula" },
  { key: "telephoneInternet", header: "Telephone/ Internet", width: 18, source: "formula" },
  { key: "performanceIncentive", header: "Performance Incentive", width: 20, source: "formula" },
  { key: "specialAllowance", header: "Special allowance", width: 17, source: "formula" },
  { key: "uniformAllowance", header: "Uniform Allowance", width: 17, source: "formula" },
  { key: "grossWagesEarned", header: "Gross Wages (J:Q)", width: 16, source: "formula" },
  { key: "pfAmount", header: "PF Amt 12%", width: 12, source: "formula" },
  { key: "esic", header: "ESIC", width: 10, source: "formula" },
  { key: "professionalTax", header: "P    Tax", width: 10, source: "editable" },
  { key: "loan", header: "Loan", width: 10, source: "editable" },
  { key: "salaryAdvance", header: "Sal adv", width: 10, source: "editable" },
  { key: "held", header: "Held", width: 10, source: "editable" },
  { key: "totalDeduction", header: "Total Ded. (S:Y)", width: 15, source: "formula" },
  { key: "netSalary", header: "Net      Salary", width: 14, source: "formula" },
  { key: "bank", header: "bank", width: 12, source: "formula" },
  { key: "paid", header: "Paid", width: 10, source: "editable" },
  { key: "diff", header: "Diff", width: 10, source: "formula" },
  { key: "remarks", header: "Remarks", width: 22, source: "editable" },
];

function daysInMonthExcelExpr(year, month) {
  return `DAY(EOMONTH(DATE(${year},${month},1),0))`;
}

function colLetterByKey(key) {
  const index = PAYROLL_ENTRY_COLUMNS.findIndex((c) => c.key === key);
  return XLSX.utils.encode_col(index);
}

function payrollEntryFormula(key, rowNumber, year, month) {
  const col = (k) => `${colLetterByKey(k)}${rowNumber}`;
  const d = daysInMonthExcelExpr(year, month);

  const formulas = {
    pfBasicEarned: `${col("pfBasic")}/${d}*${col("presentDays")}`,
    basicEarned: `${col("basic")}/${d}*${col("presentDays")}`,
    grossWagesEarned: `SUM(${col("basicEarned")}:${col("uniformAllowance")})`,
    pfAmount: `${col("pfBasicEarned")}*0.12`,
    esic: `IF(${col("grossWagesEarned")}<=21000,${col("grossWagesEarned")}*0.75/100,0)`,
    totalDeduction: `SUM(${col("pfAmount")}:${col("held")})`,
    netSalary: `${col("grossWagesEarned")}-${col("totalDeduction")}`,
    bank: `ROUND(${col("netSalary")},0)`,
    diff: `${col("bank")}-${col("paid")}`,
  };
  return formulas[key];
}

function allowanceFormula(row, key, rowNumber, year, month) {
  const monthlyValue = Number(row[`${key}Monthly`] ?? row[key] ?? 0);
  const presentDaysCol = colLetterByKey("presentDays");
  const d = daysInMonthExcelExpr(year, month);
  return `${monthlyValue}/${d}*${presentDaysCol}${rowNumber}`;
}

/** Column keys that use `allowanceFormula` (monthly master ÷ days × present). Keep in sync with `buildPayrollEntryWorkbook`. */
export const ENTRY_ALLOWANCE_FORMULA_KEYS = new Set([
  "hra",
  "conveyanceAllowance",
  "medicalAllowance",
  "attendanceBonus",
  "journalPeriodicals",
  "childrenEduAllowance",
  "telephoneInternet",
  "performanceIncentive",
  "specialAllowance",
  "uniformAllowance",
]);

/**
 * Sample Excel formula for one data row (default row 5) for admin documentation.
 * Allowance columns use a placeholder monthly value (5400) in the string; real export embeds each employee’s master value.
 */
export function getEntryFormulaExcelSample(key, excelRow = 5, year = 2026, month = 1) {
  if (ENTRY_ALLOWANCE_FORMULA_KEYS.has(key)) {
    return allowanceFormula({ [`${key}Monthly`]: 5400 }, key, excelRow, year, month);
  }
  return payrollEntryFormula(key, excelRow, year, month) || null;
}

const GROSS_SUM_PART_KEYS = [
  "basicEarned",
  "hra",
  "conveyanceAllowance",
  "medicalAllowance",
  "attendanceBonus",
  "journalPeriodicals",
  "childrenEduAllowance",
  "telephoneInternet",
  "performanceIncentive",
  "specialAllowance",
  "uniformAllowance",
];

const DEDUCTION_SUM_PART_KEYS = ["pfAmount", "esic", "professionalTax", "loan", "salaryAdvance", "held"];

const ENTRY_SUMMABLE_KEYS = new Set([
  "grossWages",
  "pfBasic",
  "pfBasicEarned",
  "basic",
  "basicEarned",
  "hra",
  "conveyanceAllowance",
  "medicalAllowance",
  "attendanceBonus",
  "journalPeriodicals",
  "childrenEduAllowance",
  "telephoneInternet",
  "performanceIncentive",
  "specialAllowance",
  "uniformAllowance",
  "grossWagesEarned",
  "pfAmount",
  "esic",
  "professionalTax",
  "loan",
  "salaryAdvance",
  "held",
  "totalDeduction",
  "netSalary",
  "bank",
  "paid",
  "diff",
]);

function getOrderedEntryColumns(columnKeys) {
  const keys =
    columnKeys && columnKeys.length > 0 ? columnKeys : PAYROLL_ENTRY_COLUMNS.map((c) => c.key);
  return keys.map((k) => PAYROLL_ENTRY_COLUMNS.find((c) => c.key === k)).filter(Boolean);
}

function buildEntryFormulaHelpers(cols, year, month) {
  const indexByKey = Object.fromEntries(cols.map((c, i) => [c.key, i]));
  const col = (k) => {
    const i = indexByKey[k];
    if (i == null || i < 0) throw new Error(`payroll excel: missing column ${k}`);
    return XLSX.utils.encode_col(i);
  };
  const d = daysInMonthExcelExpr(year, month);
  const L = (k, row) => `${col(k)}${row}`;

  function payrollEntryFormulaDyn(key, excelRow) {
    const earningRefs = GROSS_SUM_PART_KEYS.filter((gk) => indexByKey[gk] != null).map((gk) => L(gk, excelRow));
    const grossExpr = earningRefs.length ? `SUM(${earningRefs.join(",")})` : "0";

    const dedRefs = DEDUCTION_SUM_PART_KEYS.filter((dk) => indexByKey[dk] != null).map((dk) => L(dk, excelRow));
    const totalDedExpr = dedRefs.length ? `SUM(${dedRefs.join(",")})` : "0";

    if (key === "pfBasicEarned") return `${L("pfBasic", excelRow)}/${d}*${L("presentDays", excelRow)}`;
    if (key === "basicEarned") return `${L("basic", excelRow)}/${d}*${L("presentDays", excelRow)}`;
    if (key === "grossWagesEarned") return grossExpr;
    if (key === "pfAmount") return `${L("pfBasicEarned", excelRow)}*0.12`;
    if (key === "esic") return `IF(${L("grossWagesEarned", excelRow)}<=21000,${L("grossWagesEarned", excelRow)}*0.75/100,0)`;
    if (key === "totalDeduction") return totalDedExpr;
    if (key === "netSalary") return `${L("grossWagesEarned", excelRow)}-${L("totalDeduction", excelRow)}`;
    if (key === "bank") return `ROUND(${L("netSalary", excelRow)},0)`;
    if (key === "diff") return `${L("bank", excelRow)}-${L("paid", excelRow)}`;
    return null;
  }

  function allowanceFormulaDyn(row, key, excelRow) {
    const monthlyValue = Number(row[`${key}Monthly`] ?? row[key] ?? 0);
    return `${monthlyValue}/${d}*${L("presentDays", excelRow)}`;
  }

  return { payrollEntryFormulaDyn, allowanceFormulaDyn };
}

/**
 * Build the uploaded-format payroll entry sheet. Rows should already include
 * master data, attendance totals, and editable overrides from the UI.
 * @param {string[]} [columnKeys] Column order (subset allowed); defaults to full `PAYROLL_ENTRY_COLUMNS`.
 */
export function buildPayrollEntryWorkbook({ year, month, company = "IFSPL / IEVPL", site = "All sites", rows, columnKeys } = {}) {
  const { days, title } = monthMeta(year, month);
  const cols = getOrderedEntryColumns(columnKeys);
  const { payrollEntryFormulaDyn, allowanceFormulaDyn } = buildEntryFormulaHelpers(cols, year, month);

  const headerRow0 = 1;
  const headerRow1 = 2;
  const headerRow2 = 3;
  const colHeaderRow = 4;
  const firstDataExcelRow = 5;
  const ws = {};
  const totalCols = cols.length;
  const lastColIdx = totalCols - 1;

  ws[XLSX.utils.encode_cell({ r: headerRow0 - 1, c: 0 })] = { v: `${company}, ${site}`, t: "s" };
  ws[XLSX.utils.encode_cell({ r: headerRow1 - 1, c: 0 })] = {
    v: `${site} Fix Term Contract Staff Salary for the month of ${title}`,
    t: "s",
  };
  ws[XLSX.utils.encode_cell({ r: headerRow2 - 1, c: 0 })] = {
    v: `Month calendar days: ${days} (used inside formulas as DAY(EOMONTH(DATE(${year},${month},1),0)))`,
    t: "s",
  };
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: lastColIdx } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: lastColIdx } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: lastColIdx } },
  ];

  cols.forEach((column, c) => {
    ws[XLSX.utils.encode_cell({ r: colHeaderRow - 1, c })] = { v: column.header, t: "s" };
  });

  rows.forEach((row, idx) => {
    const r = firstDataExcelRow + idx - 1;
    const excelRow = firstDataExcelRow + idx;
    cols.forEach((column, c) => {
      const addr = XLSX.utils.encode_cell({ r, c });
      const formula = ENTRY_ALLOWANCE_FORMULA_KEYS.has(column.key)
        ? allowanceFormulaDyn(row, column.key, excelRow)
        : payrollEntryFormulaDyn(column.key, excelRow);
      if (formula) {
        ws[addr] = { f: formula, t: "n" };
        return;
      }
      const value = column.key === "srNo" ? idx + 1 : row[column.key] ?? "";
      ws[addr] = typeof value === "number" ? { v: value, t: "n" } : { v: value, t: "s" };
    });
  });

  const totalExcelRow = firstDataExcelRow + rows.length;
  const totalRowIndex = totalExcelRow - 1;
  const totalLabelCol = Math.min(5, lastColIdx);
  ws[XLSX.utils.encode_cell({ r: totalRowIndex, c: totalLabelCol })] = { v: "TOTAL", t: "s" };
  cols.forEach((column, c) => {
    if (ENTRY_SUMMABLE_KEYS.has(column.key)) {
      const colLet = XLSX.utils.encode_col(c);
      ws[XLSX.utils.encode_cell({ r: totalRowIndex, c })] = {
        f: `SUM(${colLet}${firstDataExcelRow}:${colLet}${totalExcelRow - 1})`,
        t: "n",
      };
    }
  });

  ws["!cols"] = cols.map((column) => ({ wch: column.width }));
  ws["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: totalRowIndex, c: lastColIdx },
  });

  const sourceSheet = XLSX.utils.aoa_to_sheet([
    ["Source", "Fields"],
    ["Master", cols.filter((c) => c.source === "master").map((c) => c.header).join(", ")],
    ["Attendance", cols.filter((c) => c.source === "attendance").map((c) => c.header).join(", ")],
    ["Formula", cols.filter((c) => c.source === "formula").map((c) => c.header).join(", ")],
    ["Editable", cols.filter((c) => c.source === "editable").map((c) => c.header).join(", ")],
    ["Column keys", cols.map((c) => c.key).join(", ")],
  ]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Entry Sheet");
  XLSX.utils.book_append_sheet(wb, sourceSheet, "Field Map");
  return wb;
}
