/**
 * In-memory mock salary sheets for UI testing (no CTC / DB required).
 * Toggle via USE_MOCK_SALARY_PROCESSING.
 */

import { supabase } from "../../../lib/supabase";
import { EMPLOYEE_MASTER_TABLE } from "../../../modules/payroll/integrations";
import { normalizeAttendanceEmpCode } from "../../../lib/attendanceDaily";
import {
  appendProcessBatch,
  applyRevisionToRunSheet,
  flattenProcessedSheetRows,
  getRunSheetNo,
  nextSheetSequenceForRun,
} from "./salarySheetNumbers";
import {
  DEFAULT_MONTH_DAYS,
  buildSheetLineFromSources,
  fetchPresentDaysByEmployeeCode,
  recomputeLineFromEdits,
  PROCESS_MODES,
  filterEmployeesByMode,
  excludeHeldEmployees,
  buildProcessedEmployeeIndex,
  employeeAlreadyProcessed,
  departmentStatsForEmployees,
  getMonthHoldIds,
  getScopeLineDraft,
  applyScopeLineDraft,
} from "./salaryMonthProcessing";
import { fetchSalaryStructureMap } from "./salaryData";
import { applySalarySheetToEmployeeMasters } from "../../admin/employeeMaster/deductions/deductionsStore";
import { resolvePersonComponentsForPayroll } from "./salaryComponentsCatalog";

/** Set false to use live salary processing APIs. */
export const USE_MOCK_SALARY_PROCESSING = true;

function rid(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function sumLines(lines) {
  let gross = 0;
  let ded = 0;
  let net = 0;
  for (const l of lines) {
    gross += Number(l.gross_wages) || 0;
    ded += Number(l.total_ded) || 0;
    net += Number(l.net_salary) || 0;
  }
  return {
    employee_count: lines.length,
    total_gross: Math.round(gross),
    total_deductions: Math.round(ded),
    total_net: Math.round(net),
  };
}

const MOCK_PEOPLE = [
  {
    code: "IFSPL0012",
    name: "Rahul Raj R",
    designation: "Software Engineer",
    doj: "2022-04-11",
    confirmation: "2023-04-11",
    account: "5010023489123",
    ifsc: "HDFC0001234",
    gross: 45000,
    basic: 22500,
    hra: 9000,
    special: 13500,
    pfBasic: 15000,
    present: 26,
    loan: 2500,
    salAdv: 0,
    unpaid: 0,
    tds: 1200,
    pt: 200,
  },
  {
    code: "IFSPL0045",
    name: "Priya Sharma",
    designation: "HR Executive",
    doj: "2021-08-02",
    confirmation: "2022-08-02",
    account: "9182736450123",
    ifsc: "SBIN0000456",
    gross: 38000,
    basic: 19000,
    hra: 7600,
    special: 11400,
    pfBasic: 15000,
    present: 24,
    loan: 0,
    salAdv: 3000,
    unpaid: 0,
    tds: 800,
    pt: 200,
  },
  {
    code: "IFSPL0078",
    name: "Amit Patel",
    designation: "Site Supervisor",
    doj: "2019-01-15",
    confirmation: "2020-01-15",
    account: "1122334455667",
    ifsc: "ICIC0000789",
    gross: 28000,
    basic: 15000,
    hra: 6000,
    special: 7000,
    pfBasic: 15000,
    present: 26,
    loan: 1500,
    salAdv: 0,
    unpaid: 500,
    tds: 0,
    pt: 200,
  },
  {
    code: "IFSPL0091",
    name: "Sneha Nair",
    designation: "Accounts Officer",
    doj: "2020-06-01",
    confirmation: "2021-06-01",
    account: "7788990011223",
    ifsc: "AXIS0001122",
    gross: 42000,
    basic: 21000,
    hra: 8400,
    special: 12600,
    pfBasic: 15000,
    present: 25,
    loan: 0,
    salAdv: 0,
    unpaid: 0,
    tds: 1500,
    pt: 200,
  },
  {
    code: "IFSPL0110",
    name: "Vikram Singh",
    designation: "Fire Officer",
    doj: "2018-03-20",
    confirmation: "2019-03-20",
    account: "4455667788990",
    ifsc: "PUNB0123456",
    gross: 18500,
    basic: 12000,
    hra: 4000,
    special: 2500,
    pfBasic: 12000,
    present: 22,
    loan: 0,
    salAdv: 1000,
    unpaid: 0,
    tds: 0,
    pt: 0,
  },
  {
    code: "IFSPL0133",
    name: "Anita Desai",
    designation: "Admin Assistant",
    doj: "2023-02-14",
    confirmation: null,
    account: "3344556677889",
    ifsc: "YESB0003344",
    gross: 32000,
    basic: 16000,
    hra: 6400,
    special: 9600,
    pfBasic: 15000,
    present: 26,
    loan: 0,
    salAdv: 0,
    unpaid: 0,
    tds: 400,
    pt: 200,
  },
  {
    code: "IFSPL0156",
    name: "Mohammed Irfan",
    designation: "Technician",
    doj: "2024-01-08",
    confirmation: null,
    account: "9988776655443",
    ifsc: "KKBK0009988",
    gross: 21000,
    basic: 14000,
    hra: 4000,
    special: 3000,
    pfBasic: 14000,
    present: 26,
    loan: 800,
    salAdv: 0,
    unpaid: 0,
    tds: 0,
    pt: 0,
  },
  {
    code: "IFSPL0188",
    name: "Kavitha Reddy",
    designation: "Project Coordinator",
    doj: "2021-11-22",
    confirmation: "2022-11-22",
    account: "5566778899001",
    ifsc: "UTIB0005566",
    gross: 52000,
    basic: 26000,
    hra: 10400,
    special: 15600,
    pfBasic: 15000,
    present: 23,
    loan: 4000,
    salAdv: 2000,
    unpaid: 0,
    tds: 2500,
    pt: 200,
  },
];

function buildMockLine(person, runId, monthDays, revisionNo, idx) {
  const employeeMasterId = 9000 + idx;
  const personComps = resolvePersonComponentsForPayroll(employeeMasterId, {
    gross_monthly: person.gross,
    basic_monthly: person.basic,
    hra_monthly: person.hra,
    special_allowance_monthly: person.special,
    emp_pf_monthly: Math.round(Math.min(person.pfBasic, 15000) * 0.12),
    pt_monthly: person.pt,
    emp_esic_monthly: 0,
    take_home_monthly: 0,
    ctc_monthly: person.gross,
  });
  const draft = {
    id: rid("line"),
    run_id: runId,
    employee_master_id: employeeMasterId,
    employee_code: person.code,
    employee_name: person.name,
    designation: person.designation,
    date_of_joining: person.doj,
    account_no: person.account,
    ifsc: person.ifsc,
    confirmation_date: person.confirmation,
    declared: true,
    salary_rate: person.gross,
    present_days: person.present,
    total_days: monthDays,
    pf_basic: person.pfBasic,
    basic_full: person.basic,
    hra_full: person.hra,
    special_full: person.special,
    loan: person.loan,
    sal_adv: person.salAdv,
    unpaid_paid: person.unpaid,
    tds: person.tds,
    pt_amount: person.pt,
    custom_earn_full: personComps.custom_earn_full,
    custom_ded_full: personComps.custom_ded_full,
    source_snapshot_json: {
      account_no: person.account,
      ifsc: person.ifsc,
      confirmation_date: person.confirmation,
      designation: person.designation,
      custom_earn_full: personComps.custom_earn_full,
      custom_ded_full: personComps.custom_ded_full,
      custom_components: personComps.items,
    },
    overrides_json: {},
    computed_json: {
      custom_earn_full: personComps.custom_earn_full,
      custom_ded_full: personComps.custom_ded_full,
      custom_components: personComps.items,
    },
    line_revision_no: revisionNo,
    has_master_variance: idx === 2,
  };
  return recomputeLineFromEdits(draft, monthDays);
}

function buildMockRun({ year, month, monthDays = DEFAULT_MONTH_DAYS, revisionNo = 1, people = MOCK_PEOPLE }) {
  const id = rid("run");
  const key = `${year}-${String(month).padStart(2, "0")}`;
  const rawLines = people.map((p, i) => buildMockLine(p, id, monthDays, revisionNo, i));
  const lines = rawLines;
  const totals = sumLines(lines);
  const updated = new Date();
  updated.setDate(updated.getDate() - (8 - month));
  const summary_json = appendProcessBatch({}, {
    year,
    month,
    processMode: "bulk",
    revisionNo,
    employeeCount: lines.length,
    sequence: 1,
  });
  if (revisionNo > 1) {
    Object.assign(summary_json, applyRevisionToRunSheet(summary_json, { year, month, revisionNo }));
  }
  const run = {
    id,
    pay_year: year,
    pay_month: month,
    month_key: key,
    month_days: monthDays,
    status: "processed",
    revision_no: revisionNo,
    include_without_ctc: false,
    ...totals,
    summary_json,
    created_at: updated.toISOString(),
    updated_at: updated.toISOString(),
    _mock: true,
  };
  return { run, lines };
}

/** Mutable in-memory store for the session. */
let mockStore = null;

function ensureStore() {
  if (mockStore) return mockStore;
  const jun = buildMockRun({ year: 2026, month: 6, revisionNo: 2 });
  const jul = buildMockRun({ year: 2026, month: 7, revisionNo: 1 });
  const aug = buildMockRun({
    year: 2026,
    month: 8,
    revisionNo: 1,
    people: MOCK_PEOPLE.slice(0, 6),
  });
  mockStore = {
    runs: [aug.run, jul.run, jun.run],
    linesByRun: {
      [aug.run.id]: aug.lines,
      [jul.run.id]: jul.lines,
      [jun.run.id]: jun.lines,
    },
  };
  // Seed Employee Master shells from mock sheets (two-way demo)
  for (const run of mockStore.runs) {
    try {
      applySalarySheetToEmployeeMasters(mockStore.linesByRun[run.id], run.month_key);
    } catch {
      /* ignore */
    }
  }
  return mockStore;
}

export function mockListMonthRuns() {
  const store = ensureStore();
  return [...store.runs].sort((a, b) => {
    if (a.pay_year !== b.pay_year) return b.pay_year - a.pay_year;
    return b.pay_month - a.pay_month;
  });
}

export function mockListProcessedSalarySheets() {
  const store = ensureStore();
  return flattenProcessedSheetRows(store.runs);
}

export function mockGetMonthRunByKey(monthKeyStr) {
  return ensureStore().runs.find((r) => r.month_key === monthKeyStr) || null;
}

export function mockGetMonthRunWithLines(runId) {
  const store = ensureStore();
  const run = store.runs.find((r) => r.id === runId) || null;
  const lines = run ? [...(store.linesByRun[runId] || [])] : [];
  return { run, lines };
}

export async function mockFetchSalaryProcessCandidates({
  year,
  month,
  includeWithoutCtc = false,
} = {}) {
  const key = `${year}-${String(month).padStart(2, "0")}`;
  const existing = mockGetMonthRunByKey(key);
  let processedIndex = { ids: new Set(), codes: new Set() };
  if (existing?.id) {
    processedIndex = buildProcessedEmployeeIndex(mockGetMonthRunWithLines(existing.id).lines || []);
  }

  try {
    const [{ data: employees, error: empErr }, salaryMap] = await Promise.all([
      supabase
        .from(EMPLOYEE_MASTER_TABLE)
        .select(
          "id, employee_id, employee_code, full_name, designation, department, date_of_joining, confirmation_date, bank_account_no, ifsc_code, status"
        )
        .eq("status", "Active")
        .order("employee_code", { ascending: true }),
      fetchSalaryStructureMap(),
    ]);
    if (empErr) throw empErr;

    const holdIdSet = new Set(getMonthHoldIds(key));
    const deptSet = new Set();
    const rows = (employees || []).map((emp) => {
      const structure = salaryMap.get(String(emp.id)) || salaryMap.get(emp.id) || null;
      const hasCtc = Boolean(structure?.declared);
      const eligible = includeWithoutCtc ? !hasCtc : hasCtc;
      const dept = emp.department ? String(emp.department).trim() : "";
      if (dept) deptSet.add(dept);
      return {
        id: emp.id,
        employee_code: emp.employee_code || emp.employee_id || "",
        full_name: emp.full_name || "",
        designation: emp.designation || "",
        department: dept || "—",
        date_of_joining: emp.date_of_joining || null,
        confirmation_date: emp.confirmation_date || null,
        bank_account_no: emp.bank_account_no || "",
        ifsc_code: emp.ifsc_code || "",
        employee_id: emp.employee_id || "",
        hasCtc,
        eligible,
        alreadyProcessed: employeeAlreadyProcessed(emp, processedIndex),
        onHold: holdIdSet.has(String(emp.id)),
        _structure: structure,
      };
    });

    const departmentStats = departmentStatsForEmployees(rows);

    return {
      monthKey: key,
      existingRun: existing,
      departments: [...deptSet].sort((a, b) => a.localeCompare(b)),
      departmentStats,
      employees: rows,
      holdIds: [...holdIdSet],
      salaryMap,
    };
  } catch {
    const store = ensureStore();
    const runForMonth = store.runs.find((r) => r.month_key === key);
    const lines = runForMonth ? store.linesByRun[runForMonth.id] || [] : [];
    const processedFromMock = buildProcessedEmployeeIndex(lines);
    const holdIdSet = new Set(getMonthHoldIds(key));
    const deptSet = new Set();
    const rows = MOCK_PEOPLE.map((p, i) => {
      const dept = p.designation?.includes("HR") ? "HR" : "Operations";
      deptSet.add(dept);
      const id = `mock_emp_${i}`;
      return {
        id,
        employee_code: p.code,
        full_name: p.name,
        designation: p.designation,
        department: dept,
        date_of_joining: p.doj || null,
        confirmation_date: null,
        bank_account_no: p.account || "",
        ifsc_code: p.ifsc || "",
        employee_id: p.code,
        hasCtc: true,
        eligible: true,
        alreadyProcessed: employeeAlreadyProcessed(
          { id, employee_code: p.code },
          processedFromMock
        ),
        onHold: holdIdSet.has(String(id)),
      };
    });
    const departmentStats = departmentStatsForEmployees(rows);
    return {
      monthKey: key,
      existingRun: runForMonth || null,
      departments: [...deptSet],
      departmentStats,
      employees: rows,
      holdIds: [...holdIdSet],
    };
  }
}

export async function mockProcessSalaryMonth({
  year,
  month,
  monthDays = DEFAULT_MONTH_DAYS,
  includeWithoutCtc = false,
  processMode = PROCESS_MODES.BULK,
  employeeIds = [],
  departments = [],
  forceFullReprocess = false,
} = {}) {
  const store = ensureStore();
  const key = `${year}-${String(month).padStart(2, "0")}`;
  const existing = store.runs.find((r) => r.month_key === key);
  const mode = processMode || PROCESS_MODES.BULK;

  if (mode === PROCESS_MODES.HOLD) {
    throw new Error("Hold is for marking salary holds only. Use All or By department to process.");
  }
  if (mode === PROCESS_MODES.SELECT && !(employeeIds || []).length) {
    throw new Error("Select at least one employee to process.");
  }
  if (mode === PROCESS_MODES.DEPT && !(departments || []).filter(Boolean).length) {
    throw new Error("Select at least one department to process.");
  }

  const holdIds = getMonthHoldIds(key);

  const existingLines = existing ? [...(store.linesByRun[existing.id] || [])] : [];
  const processedIndex = buildProcessedEmployeeIndex(existingLines);

  let builtLines = null;
  let sourceEmployees = [];
  let revisionNo = existing ? Number(existing.revision_no || 1) : 1;
  try {
    const [{ data: employees, error: empErr }, salaryMap, presentMap] = await Promise.all([
      supabase
        .from(EMPLOYEE_MASTER_TABLE)
        .select(
          "id, employee_id, employee_code, full_name, designation, department, date_of_joining, confirmation_date, bank_account_no, ifsc_code, status"
        )
        .eq("status", "Active")
        .order("employee_code", { ascending: true }),
      fetchSalaryStructureMap(),
      fetchPresentDaysByEmployeeCode(year, month),
    ]);
    if (empErr) throw empErr;
    sourceEmployees = employees || [];
    const days = Number(monthDays) > 0 ? Number(monthDays) : DEFAULT_MONTH_DAYS;
    const scopedRaw = filterEmployeesByMode(sourceEmployees, {
      processMode: mode,
      employeeIds,
      departments,
      holdIds,
    });
    const scoped =
      mode === PROCESS_MODES.BULK || mode === PROCESS_MODES.DEPT || mode === PROCESS_MODES.SELECT
        ? excludeHeldEmployees(scopedRaw, holdIds)
        : scopedRaw;
    const eligible = scoped.filter((emp) => {
      const structure = salaryMap.get(String(emp.id)) || salaryMap.get(emp.id) || null;
      return includeWithoutCtc
        ? !Boolean(structure?.declared)
        : Boolean(structure?.declared);
    });

    const fullReprocess = mode === PROCESS_MODES.BULK && forceFullReprocess && Boolean(existing);
    if (fullReprocess) revisionNo = Number(existing.revision_no || 1) + 1;
    let toProcess = eligible;
    if (!fullReprocess) {
      toProcess = eligible.filter((emp) => !employeeAlreadyProcessed(emp, processedIndex));
    }

    const skippedDuplicates = eligible.filter((emp) => employeeAlreadyProcessed(emp, processedIndex));
    if (!toProcess.length) {
      const dupCount = skippedDuplicates.length;
      throw new Error(
        dupCount
          ? `All ${dupCount} selected employee${dupCount === 1 ? "" : "s"} already processed for this month.`
          : "No employees to process."
      );
    }

    const lines = [];
    for (const emp of toProcess) {
      const structure = salaryMap.get(String(emp.id)) || salaryMap.get(emp.id) || null;
      const code = normalizeAttendanceEmpCode(emp.employee_code || emp.employee_id);
      const present =
        code && presentMap[code] != null && presentMap[code] > 0 ? presentMap[code] : days;
      let line = buildSheetLineFromSources({
        employee: emp,
        structure,
        presentDays: present,
        monthDays: days,
      });
      const draft = getScopeLineDraft(key, emp.id);
      if (draft) line = applyScopeLineDraft(line, draft, days);
      lines.push({
        ...line,
        id: rid("line"),
        run_id: null,
        line_revision_no: revisionNo,
      });
    }
    builtLines = { lines, skippedDuplicates, fullReprocess, toProcessCount: lines.length };
  } catch (err) {
    if (err?.message?.includes("already processed") || err?.message?.includes("Select at least")) {
      throw err;
    }
    console.warn("Mock process: live Employee Master build failed, using sample rows", err);
  }

  if (!builtLines && mode === PROCESS_MODES.BULK && !forceFullReprocess && existing) {
    throw new Error("All employees already processed for this month (mock). Open the sheet or use full reprocess.");
  }

  if (builtLines?.fullReprocess) {
    revisionNo = Number(existing?.revision_no || 1) + 1;
  } else if (existing) {
    revisionNo = Number(existing.revision_no || 1);
  } else {
    revisionNo = 1;
  }

  const newLinesOnly = builtLines?.lines || null;
  let built;

  if (newLinesOnly) {
    const runId = existing && !builtLines.fullReprocess ? existing.id : rid("run");
    const withIds = newLinesOnly.map((l) => ({ ...l, id: l.id || rid("line"), run_id: runId }));
    const mergedLines =
      existing && !builtLines.fullReprocess ? [...existingLines, ...withIds] : withIds;
    const totals = sumLines(mergedLines);
    let summary_json;
    if (builtLines.fullReprocess) {
      summary_json = appendProcessBatch({}, {
        year: Number(year),
        month: Number(month),
        processMode: mode,
        revisionNo,
        employeeCount: withIds.length,
        departments: mode === PROCESS_MODES.DEPT ? departments : undefined,
        sequence: 1,
      });
      summary_json = applyRevisionToRunSheet(summary_json, {
        year: Number(year),
        month: Number(month),
        revisionNo,
      });
    } else {
      summary_json = appendProcessBatch(existing?.summary_json || {}, {
        year: Number(year),
        month: Number(month),
        processMode: mode,
        revisionNo,
        employeeCount: withIds.length,
        departments: mode === PROCESS_MODES.DEPT ? departments : undefined,
        sequence: existing ? nextSheetSequenceForRun(existing) : 1,
      });
    }
    built = {
      run: {
        id: runId,
        pay_year: Number(year),
        pay_month: Number(month),
        month_key: key,
        month_days: Number(monthDays) || DEFAULT_MONTH_DAYS,
        status: "processed",
        revision_no: revisionNo,
        include_without_ctc: includeWithoutCtc,
        ...totals,
        summary_json,
        created_at: existing?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        _mock: true,
      },
      lines: mergedLines,
      processMeta: {
        processMode: mode,
        processedCount: withIds.length,
        skippedDuplicateCount: builtLines.skippedDuplicates?.length || 0,
        skippedDuplicates: (builtLines.skippedDuplicates || []).map((e) => ({
          id: e.id,
          employee_code: e.employee_code || e.employee_id,
          full_name: e.full_name,
        })),
        fullReprocess: Boolean(builtLines.fullReprocess),
      },
    };
  } else {
    built = buildMockRun({ year, month, monthDays, revisionNo });
    built.processMeta = {
      processMode: mode,
      processedCount: built.lines.length,
      skippedDuplicateCount: 0,
      skippedDuplicates: [],
      fullReprocess: false,
    };
  }

  if (existing) {
    if (builtLines?.fullReprocess || !newLinesOnly) {
      delete store.linesByRun[existing.id];
      store.runs = store.runs.filter((r) => r.id !== existing.id);
    } else if (built.run.id === existing.id) {
      store.runs = store.runs.filter((r) => r.id !== existing.id);
    }
  }
  const existingIdx = store.runs.findIndex((r) => r.id === built.run.id);
  if (existingIdx >= 0) {
    store.runs.splice(existingIdx, 1);
  }
  store.runs.unshift(built.run);
  store.linesByRun[built.run.id] = built.lines;

  const newLinesForSync = newLinesOnly || built.lines;
  try {
    applySalarySheetToEmployeeMasters(newLinesForSync, built.run.month_key);
  } catch (err) {
    console.warn("Mock process: master sync skipped", err);
  }
  try {
    const { generatePayslipsForRun } = await import("../../../lib/salaryPayslips");
    generatePayslipsForRun(built.run, newLinesForSync);
  } catch (psErr) {
    console.warn("Mock process: payslip generation skipped", psErr);
  }
  return { run: built.run, lines: [...built.lines], processMeta: built.processMeta };
}

export async function mockSaveMonthRunEdits(runId, editedLines) {
  const store = ensureStore();
  const run = store.runs.find((r) => r.id === runId);
  if (!run) throw new Error("Mock salary sheet not found.");
  const revisionNo = Number(run.revision_no || 1) + 1;
  const lines = editedLines.map((raw) => {
    const next = recomputeLineFromEdits(raw, run.month_days);
    return {
      ...next,
      line_revision_no: revisionNo,
      has_master_variance: Boolean(next.has_master_variance),
    };
  });
  const totals = sumLines(lines);
  const summary_json = applyRevisionToRunSheet(run.summary_json || {}, {
    year: run.pay_year,
    month: run.pay_month,
    revisionNo,
  });
  Object.assign(run, {
    revision_no: revisionNo,
    ...totals,
    updated_at: new Date().toISOString(),
    summary_json,
  });
  store.linesByRun[runId] = lines;
  try {
    applySalarySheetToEmployeeMasters(lines, run.month_key);
  } catch (err) {
    console.warn("Mock save: master sync skipped", err);
  }
  try {
    const { generatePayslipsForRun } = await import("../../../lib/salaryPayslips");
    generatePayslipsForRun(run, lines);
  } catch (psErr) {
    console.warn("Mock save: payslip generation skipped", psErr);
  }
  return { run: { ...run }, lines: [...lines] };
}

/** All runs with lines — for Salary Admin dashboard analytics. */
export function mockListRunsWithLines() {
  const store = ensureStore();
  return mockListMonthRuns().map((run) => ({
    run,
    lines: [...(store.linesByRun[run.id] || [])],
  }));
}

export function resetMockSalaryStore() {
  mockStore = null;
}
