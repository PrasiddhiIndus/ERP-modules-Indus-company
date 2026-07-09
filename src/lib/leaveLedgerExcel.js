import * as XLSX from "xlsx";
import { normalizeAttendanceEmpCode } from "./attendanceDaily";
import { buildLeaveBalanceDbRow } from "./leaveManagement";

/** Simple sample sheet for leave balance import (Admin → Leave Management). */
export const LEAVE_BALANCE_SAMPLE_HEADERS = [
  "Sr No",
  "Employee Code",
  "Employee Name",
  "Department",
  "CL",
  "PL",
  "SL",
  "S BeL",
  "SPLA",
  "SPLB",
  "SPLM",
  "C/OFF",
  "Paternity",
];

/** Legacy detailed ledger headers (still accepted on upload). */
export const LEAVE_LEDGER_IMPORT_HEADERS = [
  "Year",
  "Employee Code",
  "Employee Name",
  "PL Open",
  "PL Used",
  "PL Carried",
  "PL Encashed",
  "PL Expired",
  "SL Open",
  "SL Used",
  "SL Carried",
  "SL Expired",
  "CL Open",
  "CL Used",
  "CL Expired",
];

const SAMPLE_HEADER_ALIASES = {
  sr_no: ["sr no", "sr. no", "s no", "s.no", "serial no"],
  emp_code: ["employee code", "emp code", "employee_code", "emp_code", "code"],
  employee_name: ["employee name", "employee", "name", "full name"],
  department: ["department", "dept"],
  cl: ["cl"],
  pl: ["pl"],
  sl: ["sl"],
  sbel: ["s bel", "sbel", "s bel", "sb el"],
  spla: ["spla"],
  splb: ["splb"],
  splm: ["splm"],
  co: ["c/off", "c off", "co", "comp off", "compensatory off"],
  paternity: ["paternity", "ptl", "paternity leave"],
};

const LEGACY_HEADER_ALIASES = {
  year: ["year", "calendar year", "balance year"],
  emp_code: ["employee code", "emp code", "employee_code", "emp_code", "code"],
  employee_name: ["employee name", "employee", "name", "full name"],
  opening_pl: ["pl open", "pl opening", "opening pl", "pl_open"],
  used_pl: ["pl used", "used pl", "pl_used"],
  carried_pl: ["pl carried", "carried pl", "pl_carried"],
  encashed_pl: ["pl encashed", "pl encash", "encashed pl", "pl_encash"],
  expired_pl: ["pl expired", "expired pl", "pl_expired"],
  opening_sl: ["sl open", "sl opening", "opening sl", "sl_open"],
  used_sl: ["sl used", "used sl", "sl_used"],
  carried_sl: ["sl carried", "carried sl", "sl_carried"],
  expired_sl: ["sl expired", "expired sl", "sl_expired"],
  opening_cl: ["cl open", "cl opening", "opening cl", "cl_open"],
  used_cl: ["cl used", "used cl", "cl_used"],
  expired_cl: ["cl expired", "expired cl", "cl_expired"],
};

function normalizeHeader(h) {
  return String(h || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[()]/g, "");
}

function buildHeaderFieldMap(aliases) {
  const map = {};
  for (const [field, keys] of Object.entries(aliases)) {
    for (const alias of keys) {
      map[normalizeHeader(alias)] = field;
    }
  }
  return map;
}

const SAMPLE_FIELD_MAP = buildHeaderFieldMap(SAMPLE_HEADER_ALIASES);
const LEGACY_FIELD_MAP = buildHeaderFieldMap(LEGACY_HEADER_ALIASES);

function parseNum(v) {
  if (v == null || v === "") return 0;
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : NaN;
}

function mapRowByFieldMap(raw, fieldMap) {
  const mapped = {};
  for (const [key, value] of Object.entries(raw || {})) {
    const field = fieldMap[normalizeHeader(key)];
    if (!field) continue;
    if (field === "employee_name" || field === "department") {
      mapped[field] = String(value ?? "").trim();
    } else if (field === "emp_code") {
      mapped.emp_code = String(value ?? "").trim();
    } else if (field === "sr_no") {
      const n = parseNum(value);
      mapped.sr_no = Number.isFinite(n) ? n : null;
    } else if (field === "year") {
      const y = parseNum(value);
      mapped.year = Number.isFinite(y) && y >= 1900 ? Math.round(y) : null;
    } else {
      const n = parseNum(value);
      mapped[field] = Number.isFinite(n) ? n : 0;
    }
  }
  return mapped;
}

function resolveEmployeeByName(name, department, employees = []) {
  const n = String(name || "")
    .trim()
    .toLowerCase();
  if (!n) return null;
  const d = String(department || "")
    .trim()
    .toLowerCase();
  const matches = (employees || []).filter(
    (e) => String(e.employeeName || "").trim().toLowerCase() === n
  );
  if (matches.length === 1) return matches[0];
  if (matches.length > 1 && d) {
    const deptMatches = matches.filter(
      (e) => String(e.department || "").trim().toLowerCase() === d
    );
    if (deptMatches.length === 1) return deptMatches[0];
  }
  return matches[0] || null;
}

function detectImportFormat(rawRows) {
  if (!rawRows?.length) return "sample";
  const keys = new Set(Object.keys(rawRows[0] || {}).map((k) => normalizeHeader(k)));
  if (keys.has("pl open") || keys.has("sl open") || keys.has("cl open")) {
    return "legacy";
  }
  return "sample";
}

function rowFromLegacySheetObject(raw, defaultYear) {
  const mapped = mapRowByFieldMap(raw, LEGACY_FIELD_MAP);
  mapped.emp_code = normalizeAttendanceEmpCode(mapped.emp_code || "");
  if (!mapped.year) mapped.year = defaultYear;
  return mapped;
}

/** Leave balance columns imported from the sample sheet (opening values). */
export const LEAVE_BALANCE_IMPORT_COLUMNS = [
  { key: "cl", label: "CL", opening: "opening_cl" },
  { key: "pl", label: "PL", opening: "opening_pl" },
  { key: "sl", label: "SL", opening: "opening_sl" },
  { key: "sbel", label: "S BeL", opening: "opening_sbel" },
  { key: "spla", label: "SPLA", opening: "opening_spla" },
  { key: "splb", label: "SPLB", opening: "opening_splb" },
  { key: "splm", label: "SPLM", opening: "opening_splm" },
  { key: "coff", label: "C/OFF", opening: "opening_coff" },
  { key: "paternity", label: "Paternity", opening: "opening_paternity" },
];

/**
 * Map simple sample-sheet columns to yearly balance fields (one DB column per leave type).
 */
function rowFromSampleBalanceSheet(raw, defaultYear, employees = []) {
  const mapped = mapRowByFieldMap(raw, SAMPLE_FIELD_MAP);
  let emp_code = normalizeAttendanceEmpCode(mapped.emp_code || "");
  let employee = null;
  if (emp_code) {
    employee = (employees || []).find(
      (e) => normalizeAttendanceEmpCode(e.empCode) === emp_code
    );
  }
  if (!emp_code) {
    employee = resolveEmployeeByName(mapped.employee_name, mapped.department, employees);
    emp_code = employee ? normalizeAttendanceEmpCode(employee.empCode) : "";
  }

  return {
    emp_code,
    employee_name: mapped.employee_name || employee?.employeeName || "",
    department: mapped.department || employee?.department || "",
    year: defaultYear,
    opening_cl: Number(mapped.cl || 0),
    opening_pl: Number(mapped.pl || 0),
    opening_sl: Number(mapped.sl || 0),
    opening_sbel: Number(mapped.sbel || 0),
    opening_spla: Number(mapped.spla || 0),
    opening_splb: Number(mapped.splb || 0),
    opening_splm: Number(mapped.splm || 0),
    opening_coff: Number(mapped.co || 0),
    opening_paternity: Number(mapped.paternity || 0),
    used_pl: 0,
    used_sl: 0,
    used_cl: 0,
    used_sbel: 0,
    used_spla: 0,
    used_splb: 0,
    used_splm: 0,
    used_coff: 0,
    used_paternity: 0,
    carried_pl: 0,
    carried_sl: 0,
    carried_cl: 0,
    expired_pl: 0,
    expired_sl: 0,
    expired_cl: 0,
    encashed_pl: 0,
  };
}

function blankSampleRow(srNo, employee) {
  return {
    "Sr No": srNo,
    "Employee Code": employee.empCode || "",
    "Employee Name": employee.employeeName || "",
    Department: employee.department || "",
    CL: "",
    PL: "",
    SL: "",
    "S BeL": "",
    SPLA: "",
    SPLB: "",
    SPLM: "",
    "C/OFF": "",
    Paternity: "",
  };
}

/**
 * @param {Array<{ empCode?: string, employeeName?: string, department?: string }>} employees
 */
export function downloadLeaveBalanceSampleSheet(year, employees = []) {
  const y = Number(year) || new Date().getFullYear();
  const rows =
    employees.length > 0
      ? employees.map((e, i) => blankSampleRow(i + 1, e))
      : [
          {
            "Sr No": 1,
            "Employee Code": "10001",
            "Employee Name": "Sample Employee",
            Department: "Operations",
            CL: "",
            PL: "",
            SL: "",
            "S BeL": "",
            SPLA: "",
            SPLB: "",
            SPLM: "",
            "C/OFF": "",
            Paternity: "",
          },
        ];

  const ws = XLSX.utils.json_to_sheet(rows, { header: LEAVE_BALANCE_SAMPLE_HEADERS });
  ws["!cols"] = [
    { wch: 8 },
    { wch: 14 },
    { wch: 28 },
    { wch: 18 },
    { wch: 8 },
    { wch: 8 },
    { wch: 8 },
    { wch: 8 },
    { wch: 8 },
    { wch: 8 },
    { wch: 8 },
    { wch: 8 },
    { wch: 10 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Leave Balances");
  XLSX.writeFile(wb, `leave-balance-sample-${y}.xlsx`);
}

/** @deprecated Use downloadLeaveBalanceSampleSheet */
export function downloadLeaveLedgerImportTemplate(year, sampleEmployees = []) {
  downloadLeaveBalanceSampleSheet(
    year,
    sampleEmployees.map((e) => ({
      empCode: e.empCode,
      employeeName: e.employeeName,
      department: e.department || "",
    }))
  );
}

/**
 * @param {{ employees?: Array<{ empCode?: string, employeeName?: string, department?: string }> }} [options]
 * @returns {Promise<{ rows: object[], errors: string[], skipped: number }>}
 */
export async function parseLeaveLedgerImportFile(file, defaultYear, options = {}) {
  const errors = [];
  const { employees = [] } = options;
  if (!file) {
    return { rows: [], errors: ["No file selected."], skipped: 0 };
  }

  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName =
    wb.SheetNames.find((n) => {
      const h = normalizeHeader(n);
      return h === "leave balances" || h === "leave ledger";
    }) || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) {
    return { rows: [], errors: ["No worksheet found in file."], skipped: 0 };
  }

  const rawRows = XLSX.utils.sheet_to_json(ws, { defval: "" });
  if (!rawRows.length) {
    return { rows: [], errors: ["Import sheet has no data rows."], skipped: 0 };
  }

  const format = detectImportFormat(rawRows);
  const payloads = [];
  let skipped = 0;

  rawRows.forEach((raw, index) => {
    const rowNum = index + 2;
    const hasAny = Object.values(raw).some((v) => String(v ?? "").trim() !== "");
    if (!hasAny) return;

    let mapped;
    if (format === "legacy") {
      mapped = rowFromLegacySheetObject(raw, defaultYear);
      if (!mapped.emp_code) {
        errors.push(`Row ${rowNum}: missing Employee Code — skipped.`);
        skipped += 1;
        return;
      }
    } else {
      mapped = rowFromSampleBalanceSheet(raw, defaultYear, employees);
      if (!mapped.emp_code && !mapped.employee_name) {
        errors.push(`Row ${rowNum}: missing Employee Code and Employee Name — skipped.`);
        skipped += 1;
        return;
      }
      if (!mapped.emp_code) {
        errors.push(
          `Row ${rowNum}: could not match "${mapped.employee_name || "row"}" to an active employee — skipped.`
        );
        skipped += 1;
        return;
      }
    }

    const dbRow = buildLeaveBalanceDbRow(mapped, mapped.year || defaultYear);
    if (!dbRow) {
      errors.push(`Row ${rowNum}: invalid row for ${mapped.emp_code || mapped.employee_name}.`);
      skipped += 1;
      return;
    }
    payloads.push(dbRow);
  });

  if (!payloads.length && !errors.length) {
    errors.push("No valid employee rows found. Check Employee Name and balance columns.");
  }

  return { rows: payloads, errors, skipped };
}

export function ledgerDisplayRowToEditForm(row) {
  return {
    emp_code: row.empCode || "",
    employee_name: row.employeeName || "",
    opening_pl: Number(row.opening_pl || 0),
    used_pl: Number(row.used_pl || 0),
    carried_pl: Number(row.carried_pl || 0),
    encashed_pl: Number(row.encashed_pl || 0),
    expired_pl: Number(row.expired_pl || 0),
    opening_sl: Number(row.opening_sl || 0),
    used_sl: Number(row.used_sl || 0),
    carried_sl: Number(row.carried_sl || 0),
    expired_sl: Number(row.expired_sl || 0),
    opening_cl: Number(row.opening_cl || 0),
    used_cl: Number(row.used_cl || 0),
    expired_cl: Number(row.expired_cl || 0),
  };
}
