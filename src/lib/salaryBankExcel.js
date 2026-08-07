import * as XLSX from "xlsx";
import { normalizeAttendanceEmpCode } from "./attendanceDaily";

/** Headers matching Indus monthly salary bank sheets. */
export const SALARY_BANK_SAMPLE_HEADERS = [
  "Sr. No.",
  "Emp. Code",
  "Name",
  "Account Number",
  "IFSC Code",
  "Dept",
  "Designation",
  "Date Of Joining",
  "Date of confirmation",
];

const HEADER_ALIASES = {
  emp_code: [
    "emp. code",
    "emp code",
    "emp'ee code",
    "empee code",
    "employee code",
    "employee_code",
    "emp_code",
    "code",
  ],
  employee_name: ["name", "employee name", "employee", "full name", "emp name"],
  account_no: ["account number", "account no", "account no.", "a/c no", "a/c number", "bank account", "bank a/c"],
  ifsc: ["ifsc code", "ifsc", "ifs code"],
  department: ["dept", "department"],
  designation: ["designation", "desig", "designation / role"],
  date_of_joining: ["date of joining", "date of joining.", "doj", "d.o.j", "joining date"],
  confirmation_note: [
    "date of confirmation",
    "date of confirmation.",
    "confirmation date",
    "confirmation",
    "date of conf",
  ],
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
  for (const [field, keys] of Object.entries(HEADER_ALIASES)) {
    for (const alias of keys) {
      map[normalizeHeader(alias)] = field;
    }
  }
  return map;
}

const FIELD_MAP = buildHeaderFieldMap();

function looksLikeHeaderRow(cells) {
  const normalized = cells.map((c) => normalizeHeader(c));
  const hasCode = normalized.some((h) => FIELD_MAP[h] === "emp_code");
  const hasAccount = normalized.some((h) => FIELD_MAP[h] === "account_no");
  const hasName = normalized.some((h) => FIELD_MAP[h] === "employee_name");
  return hasCode && (hasAccount || hasName);
}

/** Preserve account / code text; avoid scientific notation for numeric Excel cells. */
function cellToText(v) {
  if (v == null || v === "") return "";
  if (typeof v === "number" && Number.isFinite(v)) {
    if (Number.isInteger(v) || Math.abs(v - Math.round(v)) < 1e-9) {
      return String(Math.round(v));
    }
    return String(v);
  }
  return String(v).trim();
}

function parseFlexibleDate(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    const dt = XLSX.SSF.parse_date_code(v);
    if (dt?.y && dt?.m && dt?.d) {
      return `${dt.y}-${String(dt.m).padStart(2, "0")}-${String(dt.d).padStart(2, "0")}`;
    }
  }
  const s = String(v).trim();
  if (!s || s === "-" || /^n\/?a$/i.test(s)) return null;

  const dmy = s.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})$/);
  if (dmy) {
    let y = Number(dmy[3]);
    if (y < 100) y += y >= 70 ? 1900 : 2000;
    const m = String(Number(dmy[2])).padStart(2, "0");
    const d = String(Number(dmy[1])).padStart(2, "0");
    if (Number(m) >= 1 && Number(m) <= 12 && Number(d) >= 1 && Number(d) <= 31) {
      return `${y}-${m}-${d}`;
    }
  }

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

/**
 * Parse confirmation cell: real date, "new", or "left 1.8.26." style notes.
 */
export function parseConfirmationCell(value) {
  const raw = cellToText(value);
  if (!raw) {
    return { confirmationDate: null, leftDate: null, isNew: false, note: "" };
  }
  const lower = raw.toLowerCase().replace(/\s+/g, " ").trim();

  if (lower === "new" || lower === "new." || lower.startsWith("new ")) {
    return { confirmationDate: null, leftDate: null, isNew: true, note: raw };
  }

  const leftMatch = lower.match(/^left\s*[.:\-]?\s*(.*)$/i);
  if (leftMatch) {
    const rest = (leftMatch[1] || "").replace(/\.+$/, "").trim();
    return {
      confirmationDate: null,
      leftDate: parseFlexibleDate(rest) || parseFlexibleDate(value),
      isNew: false,
      note: raw,
    };
  }

  const asDate = parseFlexibleDate(value);
  if (asDate) {
    return { confirmationDate: asDate, leftDate: null, isNew: false, note: "" };
  }

  return { confirmationDate: null, leftDate: null, isNew: false, note: raw };
}

function mapCellsToFields(headerCells, dataCells) {
  const mapped = {};
  headerCells.forEach((h, i) => {
    const field = FIELD_MAP[normalizeHeader(h)];
    if (!field) return;
    mapped[field] = dataCells[i];
  });
  return mapped;
}

function buildEmployeeCodeIndex(employees = []) {
  const byCode = new Map();
  for (const emp of employees) {
    const code = normalizeAttendanceEmpCode(emp.employee_code || emp.employee_id || emp.empCode);
    if (code && !byCode.has(code)) byCode.set(code, emp);
  }
  return byCode;
}

/**
 * @param {File|Blob} file
 * @param {{ employees?: Array<object> }} [options]
 * @returns {Promise<{ rows: object[], unmatched: object[], errors: string[], skipped: number }>}
 */
export async function parseSalaryBankImportFile(file, options = {}) {
  const errors = [];
  const { employees = [] } = options;
  if (!file) {
    return { rows: [], unmatched: [], errors: ["No file selected."], skipped: 0 };
  }

  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) {
    return { rows: [], unmatched: [], errors: ["No worksheet found in file."], skipped: 0 };
  }

  const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true });
  let headerIdx = -1;
  for (let i = 0; i < Math.min(matrix.length, 25); i += 1) {
    const row = (matrix[i] || []).map((c) => cellToText(c));
    if (looksLikeHeaderRow(row)) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx < 0) {
    return {
      rows: [],
      unmatched: [],
      errors: [
        "Could not find a header row with Emp. Code (and Account Number or Name). Check the sheet layout.",
      ],
      skipped: 0,
    };
  }

  const headerCells = (matrix[headerIdx] || []).map((c) => cellToText(c));
  const byCode = buildEmployeeCodeIndex(employees);
  const matched = [];
  const unmatched = [];
  let skipped = 0;
  const seenCodes = new Set();

  for (let r = headerIdx + 1; r < matrix.length; r += 1) {
    const dataCells = matrix[r] || [];
    const hasAny = dataCells.some((v) => cellToText(v) !== "");
    if (!hasAny) continue;

    const mapped = mapCellsToFields(headerCells, dataCells);
    const empCodeRaw = cellToText(mapped.emp_code);
    const empCode = normalizeAttendanceEmpCode(empCodeRaw);
    const rowNum = r + 1;

    if (!empCode) {
      errors.push(`Row ${rowNum}: missing Emp. Code — skipped.`);
      skipped += 1;
      continue;
    }

    // Later uploads / duplicate rows in same file: last wins
    if (seenCodes.has(empCode)) {
      const dropFrom = matched.findIndex((x) => x.empCode === empCode);
      if (dropFrom >= 0) matched.splice(dropFrom, 1);
      const dropUn = unmatched.findIndex((x) => x.empCode === empCode);
      if (dropUn >= 0) unmatched.splice(dropUn, 1);
    }
    seenCodes.add(empCode);

    const conf = parseConfirmationCell(mapped.confirmation_note);
    const accountNo = cellToText(mapped.account_no).replace(/\s+/g, "");
    const ifsc = cellToText(mapped.ifsc).toUpperCase().replace(/\s+/g, "");
    const payload = {
      empCode,
      empCodeRaw,
      employeeName: cellToText(mapped.employee_name),
      accountNo: accountNo || null,
      ifsc: ifsc || null,
      department: cellToText(mapped.department) || null,
      designation: cellToText(mapped.designation) || null,
      dateOfJoining: parseFlexibleDate(mapped.date_of_joining),
      confirmationDate: conf.confirmationDate,
      leftDate: conf.leftDate,
      isNew: conf.isNew,
      confirmationNote: conf.note || null,
      sheetRow: rowNum,
    };

    const master = byCode.get(empCode);
    if (!master) {
      unmatched.push({ ...payload, matchStatus: "unmatched" });
      continue;
    }

    matched.push({
      ...payload,
      matchStatus: conf.isNew ? "new_flag" : conf.leftDate || /left/i.test(conf.note || "") ? "left" : "matched",
      employeeMasterId: master.id,
      masterName: master.full_name || master.employeeName || null,
    });
  }

  if (!matched.length && !unmatched.length && !errors.length) {
    errors.push("No employee rows found under the header. Check Emp. Code column.");
  }

  return { rows: matched, unmatched, errors, skipped };
}

/**
 * @param {Array<{ employee_code?: string, employee_id?: string, full_name?: string, department?: string, designation?: string, bank_account_no?: string, ifsc_code?: string }>} employees
 */
export function downloadSalaryBankSampleSheet(employees = []) {
  const rows =
    employees.length > 0
      ? employees.map((e, i) => ({
          "Sr. No.": i + 1,
          "Emp. Code": e.employee_code || e.employee_id || "",
          Name: e.full_name || "",
          "Account Number": e.bank_account_no || "",
          "IFSC Code": e.ifsc_code || "",
          Dept: e.department || "",
          Designation: e.designation || "",
          "Date Of Joining": e.date_of_joining || "",
          "Date of confirmation": e.confirmation_date || "",
        }))
      : [
          {
            "Sr. No.": 1,
            "Emp. Code": "10051",
            Name: "Sample Employee",
            "Account Number": "00301140002234",
            "IFSC Code": "HDFC0000030",
            Dept: "Project",
            Designation: "Manager Project",
            "Date Of Joining": "01.10.2015",
            "Date of confirmation": "",
          },
        ];

  const ws = XLSX.utils.json_to_sheet(rows, { header: SALARY_BANK_SAMPLE_HEADERS });
  ws["!cols"] = [
    { wch: 8 },
    { wch: 12 },
    { wch: 28 },
    { wch: 20 },
    { wch: 14 },
    { wch: 12 },
    { wch: 28 },
    { wch: 14 },
    { wch: 18 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Bank Details");
  XLSX.writeFile(wb, "salary-bank-details-sample.xlsx");
}

/**
 * Build employee-master patch from one import row (only non-empty fields).
 */
export function buildMasterPatchFromBankRow(row) {
  const patch = {
    updated_at: new Date().toISOString(),
  };
  if (row.accountNo) patch.bank_account_no = row.accountNo;
  if (row.ifsc) patch.ifsc_code = row.ifsc;
  if (row.designation) patch.designation = row.designation;
  if (row.department) patch.department = row.department;
  if (row.dateOfJoining) patch.date_of_joining = row.dateOfJoining;
  if (row.confirmationDate) patch.confirmation_date = row.confirmationDate;
  if (row.leftDate) {
    patch.date_of_leaving = row.leftDate;
    patch.status = "Inactive";
    if (row.confirmationNote) patch.status_reason = row.confirmationNote;
  } else if (row.isNew && row.confirmationNote) {
    patch.status_reason = row.confirmationNote;
  }
  return patch;
}
