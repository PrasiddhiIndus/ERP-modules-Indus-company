import * as XLSX from "xlsx";
import { normalizeAttendanceEmpCode } from "./attendanceDaily";

/** Headers matching Indus monthly salary bank sheets (Account / IFSC / optional UAN·ESIC). */
export const SALARY_BANK_SAMPLE_HEADERS = [
  "Employee Code",
  "Name of Employee",
  "UAN Number",
  "Esic number",
  "A/c number",
  "IFSC Code",
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
  employee_name: [
    "name",
    "employee name",
    "name of employee",
    "employee",
    "full name",
    "emp name",
  ],
  account_no: [
    "account number",
    "account no",
    "account no.",
    "a/c no",
    "a/c no.",
    "a/c number",
    "a/c. number",
    "ac number",
    "ac no",
    "ac no.",
    "a c number",
    "a c no",
    "bank account",
    "bank account number",
    "bank a/c",
    "bank a/c no",
    "bank ac",
    "account",
  ],
  ifsc: ["ifsc code", "ifsc", "ifs code", "ifsccode", "ifsc_code"],
  uan_no: ["uan number", "uan no", "uan no.", "uan", "uan_no", "uan_number"],
  esic_no: [
    "esic number",
    "esic no",
    "esic no.",
    "esic",
    "esi number",
    "esi no",
    "esic_no",
    "esic_number",
  ],
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
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[()]/g, "");
}

function buildHeaderFieldMap() {
  const map = {};
  for (const [field, keys] of Object.entries(HEADER_ALIASES)) {
    for (const alias of keys) {
      const n = normalizeHeader(alias);
      map[n] = field;
      // also register slash-stripped form so "A/c number" ↔ "ac number"
      map[n.replace(/\//g, "")] = field;
    }
  }
  return map;
}

const FIELD_MAP = buildHeaderFieldMap();

function looksLikeHeaderRow(cells) {
  const normalized = cells.map((c) => {
    const n = normalizeHeader(c);
    return FIELD_MAP[n] || FIELD_MAP[n.replace(/\//g, "")] || null;
  });
  const hasCode = normalized.some((h) => h === "emp_code");
  const hasAccount = normalized.some((h) => h === "account_no");
  const hasName = normalized.some((h) => h === "employee_name");
  const hasUanOrEsic =
    normalized.some((h) => h === "uan_no") ||
    normalized.some((h) => h === "esic_no") ||
    normalized.some((h) => h === "ifsc");
  return hasCode && (hasAccount || hasName || hasUanOrEsic);
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

/** Read sheet as matrix preferring formatted text (leading zeros, long A/c numbers). */
function sheetToMatrix(ws) {
  if (!ws || !ws["!ref"]) return [];
  const range = XLSX.utils.decode_range(ws["!ref"]);
  const matrix = [];
  for (let R = range.s.r; R <= range.e.r; R += 1) {
    const row = [];
    for (let C = range.s.c; C <= range.e.c; C += 1) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[addr];
      if (!cell) {
        row.push("");
        continue;
      }
      if (cell.w != null && String(cell.w).trim() !== "") {
        row.push(String(cell.w).trim());
      } else if (typeof cell.v === "string") {
        row.push(String(cell.v).trim());
      } else {
        row.push(cellToText(cell.v));
      }
    }
    matrix.push(row);
  }
  return matrix;
}

/** Blank / masked / N/A → empty. Keep "Exempted" as a real value for UAN/ESIC. */
export function cleanBankImportValue(v, { keepExempted = true } = {}) {
  const s = cellToText(v).replace(/\s+/g, " ").trim();
  if (!s) return "";
  if (/^#+$/.test(s)) return "";
  if (s === "-" || /^n\/?a$/i.test(s) || /^null$/i.test(s) || /^nil$/i.test(s)) return "";
  if (/^exempted$/i.test(s)) return keepExempted ? "Exempted" : "";
  return s;
}

function empCodeKey(code) {
  const n = normalizeAttendanceEmpCode(code);
  if (!n) return "";
  if (/^\d+$/.test(n)) return n;
  // FTC 41 / FTC-41 / ftc_41 / FTC41 → FTC-41
  const compact = n
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return compact.replace(/^([A-Z]+)(\d+)$/, "$1-$2");
}

function nameKey(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildEmployeeNameIndex(employees = []) {
  const byName = new Map();
  for (const emp of employees) {
    const key = nameKey(emp.full_name);
    if (!key) continue;
    if (byName.has(key)) byName.set(key, null); // ambiguous duplicate names
    else byName.set(key, emp);
  }
  return byName;
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
    const n = normalizeHeader(h);
    const field = FIELD_MAP[n] || FIELD_MAP[n.replace(/\//g, "")];
    if (!field) return;
    mapped[field] = dataCells[i];
  });
  return mapped;
}

function buildEmployeeCodeIndex(employees = []) {
  const byCode = new Map();
  for (const emp of employees) {
    // Match bank sheet Emp. Code to employee_code only (never system / machine id)
    const raw = emp.employee_code;
    const key = empCodeKey(raw);
    if (!key) continue;
    if (!byCode.has(key)) byCode.set(key, emp);
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
  const wb = XLSX.read(buf, { type: "array", cellDates: true, cellText: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) {
    return { rows: [], unmatched: [], errors: ["No worksheet found in file."], skipped: 0 };
  }

  const matrix = sheetToMatrix(ws);
  let headerIdx = -1;
  for (let i = 0; i < Math.min(matrix.length, 40); i += 1) {
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
        "Could not find a header row with Employee Code (and Account / Name / UAN / IFSC). Check the sheet layout.",
      ],
      skipped: 0,
    };
  }

  const headerCells = (matrix[headerIdx] || []).map((c) => cellToText(c));
  const byCode = buildEmployeeCodeIndex(employees);
  const byName = buildEmployeeNameIndex(employees);
  const matched = [];
  const unmatched = [];
  let skipped = 0;
  const seenCodes = new Set();

  for (let r = headerIdx + 1; r < matrix.length; r += 1) {
    const dataCells = matrix[r] || [];
    const hasAny = dataCells.some((v) => cellToText(v) !== "");
    if (!hasAny) continue;

    const mapped = mapCellsToFields(headerCells, dataCells);
    const empCodeRaw = cleanBankImportValue(mapped.emp_code, { keepExempted: false });
    const empCode = empCodeKey(empCodeRaw);
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
    const accountNo = cleanBankImportValue(mapped.account_no, { keepExempted: false }).replace(
      /\s+/g,
      ""
    );
    const ifsc = cleanBankImportValue(mapped.ifsc, { keepExempted: false })
      .toUpperCase()
      .replace(/\s+/g, "");
    const uanNo = cleanBankImportValue(mapped.uan_no, { keepExempted: true }).replace(/\s+/g, "");
    const esicNo = cleanBankImportValue(mapped.esic_no, { keepExempted: true });
    const employeeName = cleanBankImportValue(mapped.employee_name, { keepExempted: false });
    const payload = {
      empCode,
      empCodeRaw: empCodeRaw || empCode,
      employeeName,
      accountNo: accountNo || null,
      ifsc: ifsc || null,
      uanNo: uanNo || null,
      esicNo: esicNo || null,
      department: cleanBankImportValue(mapped.department, { keepExempted: false }) || null,
      designation: cleanBankImportValue(mapped.designation, { keepExempted: false }) || null,
      dateOfJoining: parseFlexibleDate(mapped.date_of_joining),
      confirmationDate: conf.confirmationDate,
      leftDate: conf.leftDate,
      isNew: conf.isNew,
      confirmationNote: conf.note || null,
      sheetRow: rowNum,
    };

    let master = byCode.get(empCode) || null;
    let matchStatus = "matched";
    if (!master && employeeName) {
      const byNm = byName.get(nameKey(employeeName));
      if (byNm) {
        master = byNm;
        matchStatus = "matched_by_name";
      }
    }
    if (!master) {
      unmatched.push({ ...payload, matchStatus: "unmatched" });
      continue;
    }

    matched.push({
      ...payload,
      matchStatus: conf.isNew
        ? "new_flag"
        : conf.leftDate || /left/i.test(conf.note || "")
          ? "left"
          : matchStatus,
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
      ? employees.map((e) => ({
          "Employee Code": e.employee_code || e.employee_id || "",
          "Name of Employee": e.full_name || "",
          "UAN Number": e.uan_no || "",
          "Esic number": e.esic_no || "",
          "A/c number": e.bank_account_no || "",
          "IFSC Code": e.ifsc_code || "",
        }))
      : [
          {
            "Employee Code": "8998",
            "Name of Employee": "Sample Employee",
            "UAN Number": "100512345678",
            "Esic number": "31-00-123456-000-0000",
            "A/c number": "9250100191",
            "IFSC Code": "UTIB000149",
          },
        ];

  const ws = XLSX.utils.json_to_sheet(rows, { header: SALARY_BANK_SAMPLE_HEADERS });
  ws["!cols"] = [
    { wch: 14 },
    { wch: 28 },
    { wch: 16 },
    { wch: 22 },
    { wch: 18 },
    { wch: 14 },
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
  if (row.uanNo) patch.uan_no = row.uanNo;
  if (row.esicNo) patch.esic_no = row.esicNo;
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
