/**
 * Load processed salary employees for a compliance month (PF / ESIC).
 */

import { supabase } from "../../../lib/supabase";
import {
  attendanceEmpCodeLookupVariants,
  fetchMonthlyRegisterPayrollTotals,
} from "../../../lib/attendanceDaily";
import { EMPLOYEE_MASTER_TABLE } from "../../../modules/payroll/integrations";
import {
  capPresentDaysToWorkingDays,
  getMonthRunByKey,
  getMonthRunWithLines,
  monthKey,
  monthLabel,
  salaryPresentDaysFromDayMarks,
  workingDaysMonToSat,
} from "../../adminOperations/salaryAdmin/salaryMonthProcessing";
import { ageFromDob, applyEpfDerived } from "./complianceEpf";
import { overlayFilingOnRows, loadComplianceFiling } from "./complianceDb";
import { sanitizeIpName } from "./complianceEsic";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function personNameKey(name) {
  return String(name || "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

/**
 * Attendance P.Days for the pay month, keyed by employee code and by name.
 * Same Mon–Sat present and paid-leave total used when salary is processed.
 */
async function fetchAttendancePresentIndex(year, month) {
  const y = Number(year);
  const m = Number(month);
  const byCode = {};
  const byName = {};
  if (!Number.isFinite(y) || m < 1 || m > 12) return { byCode, byName };
  const cap = workingDaysMonToSat(y, m);
  try {
    const result = await fetchMonthlyRegisterPayrollTotals(
      supabase,
      `${y}-${String(m).padStart(2, "0")}`
    );
    for (const row of result.rows || []) {
      const fromMarks = row.dayMarks
        ? salaryPresentDaysFromDayMarks(row.dayMarks, y, m, row.department)
        : capPresentDaysToWorkingDays(row.summary?.totalPresent, cap);
      const days = Number.isFinite(Number(fromMarks)) ? Number(fromMarks) : 0;
      for (const raw of [row.empCode, row.employeeId]) {
        for (const variant of attendanceEmpCodeLookupVariants(raw)) {
          byCode[variant] = days;
        }
      }
      const name = personNameKey(row.employeeName);
      if (name) byName[name] = days;
    }
  } catch (err) {
    console.warn("Compliance: attendance present days unavailable", err);
    return null;
  }
  return { byCode, byName };
}

function attendanceDaysForRow(index, row) {
  if (!index) return null;
  const codes = [row.employeeCode, row.employeeId];
  for (const raw of codes) {
    for (const variant of attendanceEmpCodeLookupVariants(raw)) {
      if (Object.prototype.hasOwnProperty.call(index.byCode, variant)) {
        return index.byCode[variant];
      }
    }
  }
  const name = personNameKey(row.name || row.ipName);
  if (name && Object.prototype.hasOwnProperty.call(index.byName, name)) {
    return index.byName[name];
  }
  return null;
}

function withAttendancePresent(epfRows, esicRows, index) {
  const epfNext = (epfRows || []).map((row) => {
    const hit = attendanceDaysForRow(index, row);
    return { ...row, presentDays: hit != null ? hit : Number(row.presentDays) || 0 };
  });

  const esicNext = (esicRows || []).map((row) => {
    const hit = attendanceDaysForRow(index, { ...row, name: row.ipName || row.name });
    const days = hit != null ? hit : Number(row.presentDays ?? row.daysPaid) || 0;
    const reason =
      Number(days) === 0 && !String(row.reasonCode ?? "").trim() ? "0" : row.reasonCode;
    return {
      ...row,
      presentDays: days,
      daysPaid: days,
      reasonCode: reason ?? "",
    };
  });

  return { epfRows: epfNext, esicRows: esicNext };
}

/**
 * Built-in sample people for any month that has no processed salary sheet.
 * Not loaded from Employee Master — wages match the challan format sheet so
 * EPS / EDLI / 12% / 8.33% can be checked immediately, then edited.
 */
const DEMO_EMPLOYEES = [
  {
    id: "demo-vishal",
    code: "DEMO-01",
    name: "VISHAL KUMAR MISHRA",
    uan: "101247934235",
    esicNo: "1215683979",
    age: 36,
    designation: "Staff",
    category: "BCA ADDITIONAL",
    grossWages: 60000,
    epfWages: 20000,
    presentDays: 27,
    ncpDays: 0,
  },
  {
    id: "demo-ravendra",
    code: "DEMO-02",
    name: "RAVENDRA DWIVEDI",
    uan: "100441271101",
    esicNo: "3813299020",
    age: 59,
    designation: "Staff",
    category: "BCA ADDITIONAL",
    grossWages: 40000,
    epfWages: 15000,
    presentDays: 26,
    ncpDays: 0,
  },
  {
    id: "demo-rishi",
    code: "DEMO-03",
    name: "RISHI KUMAR",
    uan: "101224215526",
    esicNo: "3812046968",
    age: 31,
    designation: "Staff",
    category: "BCA Regular",
    grossWages: 20000,
    epfWages: 10000,
    presentDays: 27,
    ncpDays: 0,
  },
  {
    id: "demo-satheesh",
    code: "DEMO-04",
    name: "SATHEESH KUMAR V",
    uan: "100234288937",
    esicNo: "3812568876",
    age: 42,
    designation: "Staff",
    category: "Staff",
    grossWages: 18000,
    epfWages: 12000,
    presentDays: 24,
    ncpDays: 2,
  },
];

function buildEpfRow({
  empId,
  lineId = null,
  name,
  code,
  employeeId,
  uan,
  dob,
  age,
  grossWages,
  epfWages,
  presentDays,
  ncpDays = 0,
  designation = "",
  department = "",
}) {
  const age58Plus = age != null && age >= 58;
  return applyEpfDerived({
    id: `epf_${empId}`,
    employeeMasterId: empId,
    lineId,
    employeeCode: code,
    employeeId,
    uan,
    name,
    designation,
    department,
    presentDays,
    grossWages,
    epfWages,
    epsWages: null,
    epsWagesManual: false,
    edliWages: 0,
    epfContn: 0,
    epsContnAmt: 0,
    epfBalance: 0,
    ncpDays,
    refundOfAdvance: 0,
    age,
    age58Plus,
    dob,
  });
}

function buildEsicRow({
  empId,
  lineId = null,
  name,
  code,
  employeeId,
  esicNo,
  presentDays,
  grossWages,
  category = "",
}) {
  return {
    id: `esic_${empId}`,
    employeeMasterId: empId,
    lineId,
    employeeCode: code,
    employeeId,
    ipNumber: esicNo,
    ipName: sanitizeIpName(name) || name,
    category,
    daysPaid: presentDays,
    monthlyWages: grossWages,
    reasonCode: presentDays === 0 ? "0" : "",
    lastWorkingDay: "",
    reasonNote: "",
  };
}

/**
 * Four sample employees for a month that has no salary sheet.
 * UAN, name, wages, age, ESIC IP, days and NCP can all be edited on review.
 * These records are not written to Employee Master.
 */
export function loadDemoComplianceEmployees({ year, month } = {}) {
  const y = Number(year);
  const m = Number(month);
  const key = monthKey(y, m);
  const label = monthLabel(y, m);

  const epfRows = DEMO_EMPLOYEES.map((person) =>
    buildEpfRow({
      empId: person.id,
      name: person.name,
      code: person.code,
      employeeId: person.code,
      uan: person.uan,
      dob: null,
      age: person.age,
      grossWages: person.grossWages,
      epfWages: person.epfWages,
      presentDays: person.presentDays,
      ncpDays: person.ncpDays,
      designation: person.designation,
      department: "",
    })
  );
  const esicRows = DEMO_EMPLOYEES.map((person) =>
    buildEsicRow({
      empId: person.id,
      name: person.name,
      code: person.code,
      employeeId: person.code,
      esicNo: person.esicNo,
      presentDays: person.presentDays,
      grossWages: person.grossWages,
      category: person.category,
    })
  );

  return { epfRows, esicRows, monthKey: key, monthLabel: label };
}

async function fetchMasterByIds(ids = []) {
  const unique = [...new Set(ids.map((id) => Number(id)).filter((n) => Number.isFinite(n)))];
  if (!unique.length) return new Map();
  const { data, error } = await supabase
    .from(EMPLOYEE_MASTER_TABLE)
    .select("id, full_name, employee_code, employee_id, uan_no, esic_no, date_of_birth, date_of_leaving, status")
    .in("id", unique);
  if (error) throw error;
  return new Map((data || []).map((r) => [String(r.id), r]));
}

/**
 * @returns {Promise<{
 *   year: number,
 *   month: number,
 *   monthKey: string,
 *   monthLabel: string,
 *   hasSheet: boolean,
 *   run: object|null,
 *   epfRows: object[],
 *   esicRows: object[],
 * }>}
 */
export async function loadComplianceMonthEmployees({ year, month } = {}) {
  const y = Number(year);
  const m = Number(month);
  const key = monthKey(y, m);
  const label = monthLabel(y, m);
  const asOf = new Date(y, m, 0); // last day of month
  const presentPromise = fetchAttendancePresentIndex(y, m);

  let runMeta = null;
  try {
    runMeta = await getMonthRunByKey(key);
  } catch (runErr) {
    console.warn("Compliance: salary month lookup skipped", runErr);
  }
  const emptyMonth = async (run) => {
    const filing = await loadComplianceFiling(key);
    return {
      year: y,
      month: m,
      monthKey: key,
      monthLabel: label,
      hasSheet: false,
      isDemo: false,
      run: run || null,
      filing,
      epfRows: [],
      esicRows: [],
      demo: null,
    };
  };

  if (!runMeta?.id) return emptyMonth(null);

  const { run, lines } = await getMonthRunWithLines(runMeta.id);
  if (!(lines || []).length) return emptyMonth(run);
  const masterMap = await fetchMasterByIds((lines || []).map((l) => l.employee_master_id));

  const epfRows = [];
  const esicRows = [];

  for (const line of lines || []) {
    const empId = line.employee_master_id;
    const master = masterMap.get(String(empId)) || {};
    const name = line.employee_name || master.full_name || "";
    const code = line.employee_code || master.employee_code || "";
    const employeeId = line.employee_id || master.employee_id || "";
    const uan = String(line.uan_no || master.uan_no || "").replace(/\D/g, "");
    const esicNo = String(line.esic_no || master.esic_no || "").replace(/\D/g, "");
    const dob = master.date_of_birth || null;
    const age = ageFromDob(dob, asOf);

    const grossWages = num(line.gross_wages);
    const epfWages = num(line.pf_earned_basic) || num(line.pf_basic) || 0;
    const presentDays = num(line.present_days);
    const empEsic = num(line.emp_esic);

    epfRows.push(
      buildEpfRow({
        empId,
        lineId: line.id || null,
        name,
        code,
        employeeId,
        uan,
        dob,
        age,
        grossWages,
        epfWages,
        presentDays,
        designation: master.designation || line.designation || "",
        department: master.department || "",
      })
    );

    // ESIC list: anyone with ESIC number or ESIC deduction / wages in ceiling band
    const esicCandidate = Boolean(esicNo) || empEsic > 0 || (grossWages > 0 && grossWages <= 21000);
    if (esicCandidate) {
      esicRows.push(
        buildEsicRow({
          empId,
          lineId: line.id || null,
          name,
          code,
          employeeId,
          esicNo,
          presentDays,
          grossWages,
          category: master.designation || master.department || "",
        })
      );
    }
  }

  epfRows.sort((a, b) =>
    String(a.employeeCode).localeCompare(String(b.employeeCode), undefined, { numeric: true })
  );
  esicRows.sort((a, b) =>
    String(a.employeeCode).localeCompare(String(b.employeeCode), undefined, { numeric: true })
  );

  const [filing, presentIndex] = await Promise.all([loadComplianceFiling(key), presentPromise]);
  const overlaid = overlayFilingOnRows({ epfRows, esicRows, filing });
  const stamped = withAttendancePresent(overlaid.epfRows, overlaid.esicRows, presentIndex);

  return {
    year: y,
    month: m,
    monthKey: key,
    monthLabel: label,
    hasSheet: true,
    isDemo: false,
    run,
    filing,
    epfRows: stamped.epfRows.map((row) => applyEpfDerived(row)),
    esicRows: stamped.esicRows,
    demo: null,
  };
}
