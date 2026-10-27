/**
 * IFSPL In-house Employee Master — Excel sample + parse/preview helpers.
 * Writes always go through admin_ifsp_employee_master (history trigger logs changes).
 */
import * as XLSX from "xlsx";
import {
  computeIfsplExperienceYears,
  computeTotalExperienceYears,
  normalizeEmploymentType,
  nextEmployeeSystemId,
  isEmployeeIdTaken,
} from "../../../utils/employeeMasterReminders";
import { normalizeAttendanceEmpCode } from "../../../lib/attendanceDaily";

/**
 * Sheet columns — same order/headers as Export Excel (round-trip safe).
 * employee_code is mandatory on import. Computed columns are present for format
 * match but are not written from the sheet (recalculated from DOB / DOJ / other exp).
 */
export const EMPLOYEE_MASTER_SHEET_FIELDS = [
  "employee_id",
  "employment_type",
  "employee_code",
  "age",
  "full_name",
  "gender",
  "date_of_joining",
  "confirmation_date",
  "designation",
  "department",
  "location",
  "date_of_birth",
  "date_of_anniversary",
  "blood_group",
  "aadhar_no",
  "pan_card_no",
  "religion",
  "father_name",
  "mother_name",
  "spouse_name",
  "son_details",
  "daughter_details",
  "address",
  "full_address",
  "personal_no",
  "emergency_no",
  "identification_mark",
  "educational_qualification",
  "other_experience",
  "ifspl_experience",
  "years_of_experience",
  "date_of_leaving",
  "status",
  "uan_no",
  "esic_no",
  "bank_name",
  "bank_account_no",
  "ifsc_code",
  "email_id",
  "marital_status",
];

/** @deprecated use EMPLOYEE_MASTER_SHEET_FIELDS */
export const EMPLOYEE_MASTER_IMPORT_FIELDS = EMPLOYEE_MASTER_SHEET_FIELDS;

/** Columns that appear on export/sample but are never taken from the import sheet. */
export const EMPLOYEE_MASTER_IMPORT_COMPUTED_FIELDS = new Set([
  "age",
  "ifspl_experience",
  "years_of_experience",
]);

export const EMPLOYEE_MASTER_IMPORT_LABELS = {
  employee_id: "Machine ID",
  employment_type: "Employment type",
  employee_code: "Employee code",
  age: "Age",
  full_name: "Full name",
  gender: "Gender",
  date_of_joining: "Date of joining",
  confirmation_date: "Date of confirmation",
  designation: "Designation",
  department: "Department",
  location: "Location",
  date_of_birth: "Date of birth",
  date_of_anniversary: "Anniversary",
  blood_group: "Blood group",
  aadhar_no: "Aadhar",
  pan_card_no: "PAN",
  religion: "Religion",
  father_name: "Father name",
  mother_name: "Mother name",
  spouse_name: "Spouse name",
  son_details: "Son details",
  daughter_details: "Daughter details",
  address: "Address",
  full_address: "Full address",
  personal_no: "Personal phone",
  emergency_no: "Emergency contact",
  identification_mark: "Identification mark",
  educational_qualification: "Qualification",
  other_experience: "Other experience (yrs)",
  ifspl_experience: "IFSPL experience (yrs)",
  years_of_experience: "Total experience (yrs)",
  date_of_leaving: "Date of leaving",
  status: "Status",
  uan_no: "UAN",
  esic_no: "ESIC",
  bank_name: "Bank name",
  bank_account_no: "Bank account",
  ifsc_code: "IFSC",
  email_id: "Email",
  marital_status: "Marital status",
};

const DATE_FIELDS = new Set([
  "date_of_joining",
  "confirmation_date",
  "date_of_birth",
  "date_of_anniversary",
  "date_of_leaving",
]);

function normalizeHeader(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\w]/g, "");
}

/** True when the sheet is a full Employee Master export/sample (not bank-only). */
export function isFullEmployeeMasterSheet(headerFields) {
  const set = headerFields instanceof Set ? headerFields : new Set(headerFields || []);
  const markers = [
    "date_of_birth",
    "father_name",
    "mother_name",
    "aadhar_no",
    "pan_card_no",
    "personal_no",
    "address",
    "full_address",
    "educational_qualification",
    "blood_group",
    "marital_status",
    "religion",
    "location",
    "gender",
    "confirmation_date",
  ];
  let hits = 0;
  for (const m of markers) {
    if (set.has(m)) hits += 1;
  }
  const looksLikeExportLayout =
    set.has("employee_code") &&
    set.has("full_name") &&
    (set.has("employee_id") || set.has("employment_type")) &&
    (set.has("designation") || set.has("department")) &&
    hits >= 2;
  return hits >= 3 || looksLikeExportLayout;
}

export function collectEmployeeMasterHeaderFields(rawRow) {
  const fields = new Set();
  Object.keys(rawRow || {}).forEach((k) => {
    const field = mapEmployeeMasterImportHeader(k);
    if (field) fields.add(field);
  });
  return fields;
}

export function mapEmployeeMasterImportHeader(key) {
  const k = normalizeHeader(key);
  const dict = {
    ifspl_employee_system_id: "employee_id",
    employment_type: "employment_type",
    employee_type: "employment_type",
    employee_code: "employee_code",
    emp_code: "employee_code",
    code: "employee_code",
    empcode: "employee_code",
    full_name: "full_name",
    name_of_employee: "full_name",
    employee_name: "full_name",
    name: "full_name",
    gender: "gender",
    date_of_joining: "date_of_joining",
    confirmation_date: "confirmation_date",
    date_of_confirmation: "confirmation_date",
    designation: "designation",
    department: "department",
    location: "location",
    date_of_birth: "date_of_birth",
    date_of_anniversary: "date_of_anniversary",
    blood_group: "blood_group",
    aadhar_no: "aadhar_no",
    pan_card_no: "pan_card_no",
    religion: "religion",
    father_name: "father_name",
    mother_name: "mother_name",
    spouse_name: "spouse_name",
    son_details: "son_details",
    daughter_details: "daughter_details",
    present_address: "address",
    address: "address",
    permanent_address: "full_address",
    full_address: "full_address",
    personal_no: "personal_no",
    emergency_no: "emergency_no",
    identification_mark: "identification_mark",
    educational_qualification: "educational_qualification",
    qualification: "educational_qualification",
    other_experience: "other_experience",
    ifspl_experience: "ifspl_experience",
    years_of_experience: "years_of_experience",
    age: "age",
    date_of_leaving: "date_of_leaving",
    activeinactive: "status",
    active_inactive: "status",
    status: "status",
    uan_number: "uan_no",
    uan_no: "uan_no",
    uan: "uan_no",
    esic_number: "esic_no",
    esic_no: "esic_no",
    esic: "esic_no",
    bank_name: "bank_name",
    bank_account_no: "bank_account_no",
    account_number: "bank_account_no",
    account_no: "bank_account_no",
    ac_number: "bank_account_no",
    ifsc_code: "ifsc_code",
    ifsc: "ifsc_code",
    email_id: "email_id",
    email: "email_id",
    marital_status: "marital_status",
    employee_id: "employee_id",
  };
  return dict[k] || null;
}

export function downloadEmployeeMasterSampleSheet() {
  const headers = EMPLOYEE_MASTER_SHEET_FIELDS;
  // Same column order as Export; dates as YYYY-MM-DD like exported master rows.
  const sample = {
    employee_id: "1001",
    employment_type: "permanent",
    employee_code: "E-1001",
    age: "",
    full_name: "Sample Employee",
    gender: "Male",
    date_of_joining: "2024-04-01",
    confirmation_date: "2024-10-01",
    designation: "Executive",
    department: "Human Resource-Safety",
    location: "Indus HO",
    date_of_birth: "1995-06-15",
    date_of_anniversary: "",
    blood_group: "B+",
    aadhar_no: "",
    pan_card_no: "",
    religion: "Hindu",
    father_name: "",
    mother_name: "",
    spouse_name: "",
    son_details: "",
    daughter_details: "",
    address: "",
    full_address: "",
    personal_no: "9876543210",
    emergency_no: "",
    identification_mark: "",
    educational_qualification: "Graduate",
    other_experience: "2",
    ifspl_experience: "",
    years_of_experience: "",
    date_of_leaving: "",
    status: "Active",
    uan_no: "",
    esic_no: "",
    bank_name: "",
    bank_account_no: "",
    ifsc_code: "",
    email_id: "sample@example.com",
    marital_status: "Single",
  };
  const ws = XLSX.utils.json_to_sheet([sample], { header: headers });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Employee Master");
  XLSX.writeFile(wb, "ifspl-employee-master-import-sample.xlsx");
}

function blankImportVal(v) {
  const s = String(v ?? "").trim();
  return (
    !s ||
    s === "-" ||
    /^n\/?a$/i.test(s) ||
    s.toLowerCase() === "null" ||
    /^#+$/.test(s)
  );
}

function cellText(v) {
  if (v == null || v === "") return "";
  if (typeof v === "number" && Number.isFinite(v)) {
    if (Math.abs(v) >= 1e11) return String(Math.round(v));
    if (Number.isInteger(v)) return String(v);
    return String(v);
  }
  return String(v).trim();
}

export function parseExcelDateValue(v) {
  if (v == null || v === "") return null;
  if (typeof v === "string") {
    const s = v.trim();
    if (!s || s === "-" || s.toLowerCase() === "na" || s.toLowerCase() === "n/a") return null;
  }
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    const dt = XLSX.SSF.parse_date_code(v);
    if (dt?.y && dt?.m && dt?.d) {
      const mm = String(dt.m).padStart(2, "0");
      const dd = String(dt.d).padStart(2, "0");
      return `${dt.y}-${mm}-${dd}`;
    }
  }
  const d = new Date(v);
  if (!Number.isNaN(d.getTime()) && typeof v !== "string") return d.toISOString().slice(0, 10);
  const str = String(v).trim();
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(str);
  if (m) {
    const dd = String(m[1]).padStart(2, "0");
    const mm = String(m[2]).padStart(2, "0");
    return `${m[3]}-${mm}-${dd}`;
  }
  const m2 = /^(\d{1,2})[\s/-]([A-Za-z]{3,9})[\s/-](\d{2,4})$/.exec(str);
  if (m2) {
    const dd = String(m2[1]).padStart(2, "0");
    const monRaw = String(m2[2]).slice(0, 3).toLowerCase();
    const monMap = {
      jan: "01",
      feb: "02",
      mar: "03",
      apr: "04",
      may: "05",
      jun: "06",
      jul: "07",
      aug: "08",
      sep: "09",
      oct: "10",
      nov: "11",
      dec: "12",
    };
    const mm = monMap[monRaw];
    if (!mm) return null;
    const yearRaw = String(m2[3]);
    const yy = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
    return `${yy}-${mm}-${dd}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  return null;
}

function findEmployeeByCode(list, code) {
  const raw = cellText(code);
  if (!raw) return null;
  const norm = normalizeAttendanceEmpCode(raw);
  const normKey = /^\d+$/.test(norm)
    ? norm
    : norm.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^([A-Z]+)(\d+)$/, "$1-$2");
  const hits = (list || []).filter((e) => {
    const cRaw = String(e.employee_code || "").trim();
    if (!cRaw) return false;
    const c = normalizeAttendanceEmpCode(cRaw);
    const cKey = /^\d+$/.test(c)
      ? c
      : c.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^([A-Z]+)(\d+)$/, "$1-$2");
    return cKey === normKey;
  });
  if (!hits.length) return null;
  hits.sort((a, b) => {
    const aH = String(a.employee_code || "").includes("-") ? 1 : 0;
    const bH = String(b.employee_code || "").includes("-") ? 1 : 0;
    return bH - aH;
  });
  return hits[0];
}

function normalizeComparable(field, value) {
  if (value == null || value === "") return "";
  if (DATE_FIELDS.has(field)) {
    const d = parseExcelDateValue(value);
    return d || String(value).trim();
  }
  if (field === "ifsc_code") return cellText(value).replace(/\s+/g, "").toUpperCase();
  if (field === "bank_account_no") return cellText(value).replace(/\s+/g, "");
  if (field === "status") {
    const s = cellText(value).toLowerCase();
    if (s === "inactive" || s === "i" || s === "0" || s === "false") return "Inactive";
    if (s) return "Active";
    return "";
  }
  if (field === "employment_type") return normalizeEmploymentType(value) || "";
  if (field === "other_experience") {
    const n = Number(value);
    return Number.isFinite(n) ? String(n) : cellText(value);
  }
  return cellText(value);
}

function coerceImportValue(field, raw) {
  if (blankImportVal(raw)) return null;
  if (DATE_FIELDS.has(field)) return parseExcelDateValue(raw);
  if (field === "status") {
    const s = cellText(raw).toLowerCase();
    if (s === "inactive" || s === "i" || s === "0" || s === "false") return "Inactive";
    return "Active";
  }
  if (field === "employment_type") return normalizeEmploymentType(raw);
  if (field === "ifsc_code") return cellText(raw).replace(/\s+/g, "").toUpperCase();
  if (field === "other_experience") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return cellText(raw);
}

function mapRawRow(r) {
  const out = {};
  Object.entries(r || {}).forEach(([k, v]) => {
    const field = mapEmployeeMasterImportHeader(k);
    if (!field) return;
    out[field] = v;
  });
  return out;
}

/**
 * Parse Excel into preview model for full Employee Master import.
 * @returns {{
 *   newEmployees: Array,
 *   updates: Array<{ employee, employeeCode, fullName, changes: Array }>,
 *   errors: string[],
 *   skippedBlank: number,
 * }}
 */
export function buildEmployeeMasterImportPreview(rawRows, employees) {
  const errors = [];
  const newEmployees = [];
  const updates = [];
  let skippedBlank = 0;
  const workingList = [...(employees || [])];
  const todayYmd = new Date().toISOString().slice(0, 10);

  rawRows.forEach((r, idx) => {
    const rowNo = idx + 2;
    const out = mapRawRow(r);
    const hasAny = Object.values(out).some((v) => !blankImportVal(v));
    if (!hasAny) {
      skippedBlank += 1;
      return;
    }

    const empCode = cellText(out.employee_code);
    if (!empCode) {
      errors.push(`Row ${rowNo}: Employee code is mandatory.`);
      return;
    }

    const existing = findEmployeeByCode(workingList, empCode);
    if (existing) {
      const changes = [];
      for (const field of EMPLOYEE_MASTER_SHEET_FIELDS) {
        if (field === "employee_code") continue;
        if (EMPLOYEE_MASTER_IMPORT_COMPUTED_FIELDS.has(field)) continue;
        if (blankImportVal(out[field])) continue;
        const nextVal = coerceImportValue(field, out[field]);
        if (nextVal == null || nextVal === "") continue;
        let prevRaw = existing[field];
        if (
          (prevRaw == null || prevRaw === "") &&
          field === "educational_qualification"
        ) {
          prevRaw = existing.qualification;
        }
        const prevNorm = normalizeComparable(field, prevRaw);
        const nextNorm = normalizeComparable(field, nextVal);
        if (prevNorm === nextNorm) continue;
        changes.push({
          field,
          label: EMPLOYEE_MASTER_IMPORT_LABELS[field] || field,
          oldValue: prevRaw == null || prevRaw === "" ? "" : String(prevRaw),
          newValue: String(nextVal),
          importValue: nextVal,
          selected: true,
        });
      }
      if (changes.length) {
        updates.push({
          employeeId: existing.id,
          employeeCode: empCode,
          fullName: existing.full_name || empCode,
          existing,
          changes,
        });
      }
      return;
    }

    const employment_type = normalizeEmploymentType(out.employment_type || out.employee_id);
    const fullName = cellText(out.full_name) || `Unknown (${empCode})`;
    const designation = cellText(out.designation) || "Other";
    const department = cellText(out.department) || "Other";
    const doj = parseExcelDateValue(out.date_of_joining) || todayYmd;
    const prevExp =
      out.other_experience === "" || out.other_experience == null
        ? null
        : Number(out.other_experience);
    const ifsplExp = computeIfsplExperienceYears(doj);
    const totalExp = computeTotalExperienceYears(doj, prevExp);

    let sysId = cellText(out.employee_id);
    if (sysId && sysId === empCode) sysId = "";
    if (sysId && isEmployeeIdTaken(sysId, workingList)) {
      errors.push(`Row ${rowNo}: Machine ID "${sysId}" is already in use.`);
      return;
    }
    if (!sysId) sysId = nextEmployeeSystemId(workingList, employment_type);

    const statusRaw = cellText(out.status).toLowerCase();
    const normalizedStatus =
      statusRaw === "inactive" || statusRaw === "i" || statusRaw === "0" || statusRaw === "false"
        ? "Inactive"
        : "Active";
    const dateOfLeavingParsed = parseExcelDateValue(out.date_of_leaving);
    if (normalizedStatus === "Inactive" && !dateOfLeavingParsed) {
      errors.push(`Row ${rowNo}: Date of Leaving is required when status is Inactive.`);
      return;
    }

    const payload = {
      employee_id: sysId,
      employment_type,
      employee_code: empCode,
      full_name: fullName,
      gender: coerceImportValue("gender", out.gender),
      father_name: coerceImportValue("father_name", out.father_name),
      mother_name: coerceImportValue("mother_name", out.mother_name),
      spouse_name: coerceImportValue("spouse_name", out.spouse_name),
      religion: coerceImportValue("religion", out.religion),
      identification_mark: coerceImportValue("identification_mark", out.identification_mark),
      date_of_birth: parseExcelDateValue(out.date_of_birth),
      date_of_joining: doj,
      confirmation_date: parseExcelDateValue(out.confirmation_date),
      designation,
      department,
      location: coerceImportValue("location", out.location),
      aadhar_no: coerceImportValue("aadhar_no", out.aadhar_no),
      pan_card_no: coerceImportValue("pan_card_no", out.pan_card_no),
      uan_no: coerceImportValue("uan_no", out.uan_no),
      esic_no: coerceImportValue("esic_no", out.esic_no),
      bank_name: coerceImportValue("bank_name", out.bank_name),
      bank_account_no: coerceImportValue("bank_account_no", out.bank_account_no),
      ifsc_code: coerceImportValue("ifsc_code", out.ifsc_code),
      personal_no: coerceImportValue("personal_no", out.personal_no),
      email_id: coerceImportValue("email_id", out.email_id),
      address: coerceImportValue("address", out.address),
      full_address: coerceImportValue("full_address", out.full_address),
      emergency_no: coerceImportValue("emergency_no", out.emergency_no),
      blood_group: coerceImportValue("blood_group", out.blood_group),
      marital_status: coerceImportValue("marital_status", out.marital_status),
      date_of_anniversary: parseExcelDateValue(out.date_of_anniversary),
      son_details: coerceImportValue("son_details", out.son_details),
      daughter_details: coerceImportValue("daughter_details", out.daughter_details),
      educational_qualification: coerceImportValue(
        "educational_qualification",
        out.educational_qualification
      ),
      qualification: coerceImportValue("educational_qualification", out.educational_qualification),
      date_of_leaving: dateOfLeavingParsed,
      other_experience: Number.isFinite(prevExp) ? prevExp : null,
      years_of_experience: totalExp,
      ifspl_experience: ifsplExp,
      status: normalizedStatus,
    };

    workingList.push({
      employee_id: sysId,
      employment_type,
      employee_code: empCode,
      id: `pending-${empCode}`,
    });

    newEmployees.push({
      rowNo,
      employeeCode: empCode,
      fullName,
      payload,
      summaryFields: {
        designation,
        department,
        date_of_joining: doj,
        status: normalizedStatus,
      },
    });
  });

  return { newEmployees, updates, errors, skippedBlank };
}

export async function parseEmployeeMasterImportFile(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error("No sheet found in file.");
  const raw = XLSX.utils.sheet_to_json(ws, { defval: "", raw: false });
  if (!Array.isArray(raw) || raw.length === 0) throw new Error("Excel is empty.");
  return raw;
}
