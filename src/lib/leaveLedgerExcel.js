import * as XLSX from "xlsx";
import { normalizeAttendanceEmpCode } from "./attendanceDaily";
import { buildLeaveBalanceDbRow } from "./leaveManagement";

/** Column headers for template, export, and import (first row). */
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

const HEADER_ALIASES = {
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

function buildHeaderFieldMap() {
  const map = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    for (const alias of aliases) {
      map[normalizeHeader(alias)] = field;
    }
  }
  return map;
}

const HEADER_FIELD_MAP = buildHeaderFieldMap();

function parseNum(v) {
  if (v == null || v === "") return 0;
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : NaN;
}

function rowFromSheetObject(raw, defaultYear) {
  const mapped = { emp_code: "", employee_name: "" };
  for (const [key, value] of Object.entries(raw || {})) {
    const field = HEADER_FIELD_MAP[normalizeHeader(key)];
    if (!field) continue;
    if (field === "emp_code") {
      mapped.emp_code = String(value ?? "").trim();
    } else if (field === "employee_name") {
      mapped.employee_name = String(value ?? "").trim();
    } else if (field === "year") {
      const y = parseNum(value);
      mapped.year = Number.isFinite(y) && y >= 1900 ? Math.round(y) : defaultYear;
    } else {
      const n = parseNum(value);
      mapped[field] = Number.isFinite(n) ? n : 0;
    }
  }
  if (!mapped.year) mapped.year = defaultYear;
  mapped.emp_code = normalizeAttendanceEmpCode(mapped.emp_code);
  return mapped;
}

/**
 * @param {Array<{ empCode?: string, employeeName?: string }>} sampleEmployees
 */
export function downloadLeaveLedgerImportTemplate(year, sampleEmployees = []) {
  const y = Number(year) || new Date().getFullYear();
  const samples =
    sampleEmployees.length > 0
      ? sampleEmployees.slice(0, 3).map((e) => ({
          Year: y,
          "Employee Code": e.empCode || "",
          "Employee Name": e.employeeName || "",
          "PL Open": 0,
          "PL Used": 0,
          "PL Carried": 0,
          "PL Encashed": 0,
          "PL Expired": 0,
          "SL Open": 0,
          "SL Used": 0,
          "SL Carried": 0,
          "SL Expired": 0,
          "CL Open": 0,
          "CL Used": 0,
          "CL Expired": 0,
        }))
      : [
          {
            Year: y,
            "Employee Code": "10001",
            "Employee Name": "Sample Employee",
            "PL Open": 2,
            "PL Used": 5,
            "PL Carried": 7,
            "PL Encashed": 0,
            "PL Expired": 6,
            "SL Open": 0,
            "SL Used": 2,
            "SL Carried": 6,
            "SL Expired": 0,
            "CL Open": 0,
            "CL Used": 1,
            "CL Expired": 7,
          },
        ];

  const instructions = [
    {
      Note: "Fill one row per employee for the selected year. Employee Code is required.",
    },
    {
      Note: "Use Download sample import sheet for a blank template with your active employees.",
    },
    {
      Note: "Numeric columns accept decimals (e.g. 0.5). Leave blank cells as 0.",
    },
  ];

  const wsData = XLSX.utils.json_to_sheet(samples, { header: LEAVE_LEDGER_IMPORT_HEADERS });
  const wsNotes = XLSX.utils.json_to_sheet(instructions);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsData, "Leave Ledger");
  XLSX.utils.book_append_sheet(wb, wsNotes, "Instructions");
  XLSX.writeFile(wb, `leave-ledger-import-template-${y}.xlsx`);
}

/**
 * @returns {Promise<{ rows: object[], errors: string[], skipped: number }>}
 */
export async function parseLeaveLedgerImportFile(file, defaultYear) {
  const errors = [];
  if (!file) {
    return { rows: [], errors: ["No file selected."], skipped: 0 };
  }

  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName =
    wb.SheetNames.find((n) => normalizeHeader(n) === "leave ledger") || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) {
    return { rows: [], errors: ["No worksheet found in file."], skipped: 0 };
  }

  const rawRows = XLSX.utils.sheet_to_json(ws, { defval: "" });
  if (!rawRows.length) {
    return { rows: [], errors: ["Import sheet has no data rows."], skipped: 0 };
  }

  const payloads = [];
  let skipped = 0;

  rawRows.forEach((raw, index) => {
    const rowNum = index + 2;
    const mapped = rowFromSheetObject(raw, defaultYear);
    if (!mapped.emp_code) {
      const hasAny =
        Object.values(raw).some((v) => String(v ?? "").trim() !== "") &&
        !String(raw.Note || raw.note || "").trim();
      if (hasAny) {
        errors.push(`Row ${rowNum}: missing Employee Code — skipped.`);
        skipped += 1;
      }
      return;
    }

    const dbRow = buildLeaveBalanceDbRow(mapped, mapped.year || defaultYear);
    if (!dbRow) {
      errors.push(`Row ${rowNum}: invalid row for ${mapped.emp_code}.`);
      skipped += 1;
      return;
    }
    payloads.push(dbRow);
  });

  if (!payloads.length && !errors.length) {
    errors.push("No valid employee rows found. Check Employee Code column.");
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
