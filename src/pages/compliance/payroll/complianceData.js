/**
 * Load processed salary employees for a compliance month (PF / ESIC).
 */

import { supabase } from "../../../lib/supabase";
import { EMPLOYEE_MASTER_TABLE } from "../../../modules/payroll/integrations";
import {
  getMonthRunByKey,
  getMonthRunWithLines,
  monthKey,
  monthLabel,
} from "../../adminOperations/salaryAdmin/salaryMonthProcessing";
import { ageFromDob, applyEpfDerived } from "./complianceEpf";
import { sanitizeIpName } from "./complianceEsic";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function fetchMasterByIds(ids = []) {
  const unique = [...new Set(ids.map((id) => Number(id)).filter((n) => Number.isFinite(n)))];
  if (!unique.length) return new Map();
  const { data, error } = await supabase
    .from(EMPLOYEE_MASTER_TABLE)
    .select("id, full_name, employee_code, uan_no, esic_no, date_of_birth, date_of_leaving, status")
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

  const runMeta = await getMonthRunByKey(key);
  const isProcessed =
    runMeta?.id && String(runMeta.status || "").toLowerCase() === "processed";
  if (!isProcessed) {
    return {
      year: y,
      month: m,
      monthKey: key,
      monthLabel: label,
      hasSheet: false,
      run: runMeta || null,
      epfRows: [],
      esicRows: [],
    };
  }

  const { run, lines } = await getMonthRunWithLines(runMeta.id);
  const masterMap = await fetchMasterByIds((lines || []).map((l) => l.employee_master_id));

  const epfRows = [];
  const esicRows = [];

  for (const line of lines || []) {
    const empId = line.employee_master_id;
    const master = masterMap.get(String(empId)) || {};
    const name = line.employee_name || master.full_name || "";
    const code = line.employee_code || master.employee_code || "";
    const uan = String(line.uan_no || master.uan_no || "").replace(/\D/g, "");
    const esicNo = String(line.esic_no || master.esic_no || "").replace(/\D/g, "");
    const dob = master.date_of_birth || null;
    const age = ageFromDob(dob, asOf);
    const age58Plus = age != null && age >= 58;

    const grossWages = num(line.gross_wages);
    const epfWages = num(line.pf_earned_basic) || num(line.pf_basic) || 0;
    const presentDays = num(line.present_days);
    const empEsic = num(line.emp_esic);

    let epfRow = {
      id: `epf_${empId}`,
      employeeMasterId: empId,
      employeeCode: code,
      uan,
      name,
      grossWages,
      epfWages,
      epsWages: age58Plus ? 0 : null,
      epsWagesManual: age58Plus,
      edliWages: 0,
      epfContn: 0,
      epsContnAmt: 0,
      epfBalance: 0,
      ncpDays: 0,
      refundOfAdvance: 0,
      age,
      age58Plus,
      dob,
    };
    epfRow = applyEpfDerived(epfRow);
    epfRows.push(epfRow);

    // ESIC list: anyone with ESIC number or ESIC deduction / wages in ceiling band
    const esicCandidate = Boolean(esicNo) || empEsic > 0 || (grossWages > 0 && grossWages <= 21000);
    if (esicCandidate) {
      esicRows.push({
        id: `esic_${empId}`,
        employeeMasterId: empId,
        employeeCode: code,
        ipNumber: esicNo,
        ipName: sanitizeIpName(name) || name,
        daysPaid: presentDays,
        monthlyWages: grossWages,
        reasonCode: presentDays === 0 ? "0" : "",
        lastWorkingDay: "",
        reasonNote: presentDays === 0 ? "" : "",
      });
    }
  }

  epfRows.sort((a, b) =>
    String(a.employeeCode).localeCompare(String(b.employeeCode), undefined, { numeric: true })
  );
  esicRows.sort((a, b) =>
    String(a.employeeCode).localeCompare(String(b.employeeCode), undefined, { numeric: true })
  );

  return {
    year: y,
    month: m,
    monthKey: key,
    monthLabel: label,
    hasSheet: true,
    run,
    epfRows,
    esicRows,
  };
}
