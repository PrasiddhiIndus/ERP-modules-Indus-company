/**
 * In-memory demo for Salary Processing → Generate Payslip.
 * Lets users try generate / revise / history without a live processed month.
 */

import {
  buildPayslipFromLine,
  withPayslipRevision,
} from "../../../lib/salaryPayslips";
import { recomputeLineFromEdits } from "./salaryMonthProcessing";

const DEMO_PEOPLE = [
  {
    code: "IFSPL0012",
    name: "Rahul Raj R",
    designation: "Software Engineer",
    department: "IT",
    present: 26,
    gross: 45000,
    basic: 22500,
    hra: 9000,
    special: 13500,
    pfBasic: 15000,
    loan: 2500,
    salAdv: 0,
    unpaid: 0,
    tds: 1200,
    pt: 200,
    withSlip: true,
    withHistory: true,
  },
  {
    code: "IFSPL0045",
    name: "Priya Sharma",
    designation: "HR Executive",
    department: "HR",
    present: 24,
    gross: 38000,
    basic: 19000,
    hra: 7600,
    special: 11400,
    pfBasic: 15000,
    loan: 0,
    salAdv: 3000,
    unpaid: 0,
    tds: 800,
    pt: 200,
    withSlip: true,
    withHistory: false,
  },
  {
    code: "IFSPL0078",
    name: "Amit Patel",
    designation: "Site Supervisor",
    department: "Operations",
    present: 26,
    gross: 28000,
    basic: 15000,
    hra: 6000,
    special: 7000,
    pfBasic: 15000,
    loan: 1500,
    salAdv: 0,
    unpaid: 500,
    tds: 0,
    pt: 200,
    withSlip: false,
    withHistory: false,
  },
  {
    code: "IFSPL0091",
    name: "Sneha Nair",
    designation: "Accounts Officer",
    department: "Accounts",
    present: 25,
    gross: 42000,
    basic: 21000,
    hra: 8400,
    special: 12600,
    pfBasic: 15000,
    loan: 0,
    salAdv: 0,
    unpaid: 0,
    tds: 1500,
    pt: 200,
    withSlip: false,
    withHistory: false,
  },
  {
    code: "IFSPL0110",
    name: "Vikram Singh",
    designation: "Fire Officer",
    department: "Operations",
    present: 22,
    gross: 18500,
    basic: 12000,
    hra: 4000,
    special: 2500,
    pfBasic: 12000,
    loan: 0,
    salAdv: 1000,
    unpaid: 0,
    tds: 0,
    pt: 0,
    withSlip: true,
    withHistory: false,
  },
];

function monthKey(year, month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function buildDemoLine(person, runId, monthDays, idx) {
  const employeeMasterId = `demo_emp_${idx + 1}`;
  const draft = {
    id: `demo_line_${idx + 1}`,
    run_id: runId,
    employee_master_id: employeeMasterId,
    employee_code: person.code,
    employee_name: person.name,
    designation: person.designation,
    department: person.department,
    date_of_joining: "2021-01-01",
    account_no: `50100${1000000 + idx}`,
    ifsc: "UTIB0000217",
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
    custom_earn_full: 0,
    custom_ded_full: 0,
    source_snapshot_json: {
      department: person.department,
      designation: person.designation,
    },
    overrides_json: {},
    computed_json: {},
    line_revision_no: 1,
  };
  return recomputeLineFromEdits(draft, monthDays);
}

/**
 * Build a demo run + lines (+ optional pre-generated slips) for the selected month.
 */
export function buildPayslipDemoBundle({ year, month, monthDays = 26 } = {}) {
  const y = Number(year) || new Date().getFullYear();
  const m = Number(month) || new Date().getMonth() + 1;
  const days = Number(monthDays) || 26;
  const key = monthKey(y, m);
  const runId = `demo_run_${key}`;
  const processedOn = `${key}-28`;

  const run = {
    id: runId,
    pay_year: y,
    pay_month: m,
    month_key: key,
    month_days: days,
    status: "processed",
    revision_no: 1,
    processed_on: processedOn,
    summary_json: { processed_on: processedOn, demo: true },
    demo: true,
  };

  const lines = DEMO_PEOPLE.map((p, i) => buildDemoLine(p, runId, days, i));
  const slipsByEmp = new Map();

  DEMO_PEOPLE.forEach((person, i) => {
    if (!person.withSlip) return;
    const line = lines[i];
    let slip = buildPayslipFromLine(run, line, {
      processedOn,
      generatedAt: `${processedOn}T10:00:00.000Z`,
    });
    if (!slip) return;

    if (person.withHistory) {
      const olderLine = recomputeLineFromEdits(
        { ...line, loan: Number(line.loan || 0) + 500, present_days: Math.max(20, Number(line.present_days) - 1) },
        days
      );
      const olderSlip = buildPayslipFromLine(run, olderLine, {
        processedOn,
        generatedAt: `${processedOn}T09:00:00.000Z`,
      });
      slip = withPayslipRevision(olderSlip, slip, {
        note: "Attendance / loan correction (demo)",
        revisedBy: "demo@indus",
        generatedAt: `${processedOn}T11:30:00.000Z`,
      });
    } else {
      slip = {
        ...slip,
        payslip_revision_no: 1,
        revision_history: [],
        revision_note: "Generated (demo)",
      };
    }

    line.computed_json = {
      ...(line.computed_json || {}),
      payslip: slip,
      payslip_revision_no: slip.payslip_revision_no,
      slip_generated_on: processedOn,
    };
    slipsByEmp.set(String(line.employee_master_id), slip);
  });

  const departments = [...new Set(lines.map((l) => l.department).filter(Boolean))].sort();

  return { run, lines, slipsByEmp, departments, isDemo: true };
}

/** Demo generate / regenerate for selected employee ids. */
export function demoGeneratePayslips({ run, lines, slipsByEmp, employeeIds = [], forceRevision = false, note = "" }) {
  const idSet = new Set((employeeIds || []).map(String));
  const target = idSet.size
    ? lines.filter((l) => idSet.has(String(l.employee_master_id)))
    : lines;
  const nextSlips = new Map(slipsByEmp);
  const nextLines = lines.map((line) => {
    if (idSet.size && !idSet.has(String(line.employee_master_id))) return line;
    const prev = nextSlips.get(String(line.employee_master_id));
    if (prev && !forceRevision) return line;

    const base = buildPayslipFromLine(run, line, {
      processedOn: run.processed_on,
      generatedAt: new Date().toISOString(),
    });
    if (!base) return line;

    const slip =
      prev || forceRevision
        ? withPayslipRevision(prev, base, {
            note: note || (prev ? "Regenerated (demo)" : "Generated (demo)"),
            revisedBy: "demo@indus",
            generatedAt: new Date().toISOString(),
          })
        : {
            ...base,
            payslip_revision_no: 1,
            revision_history: [],
            revision_note: note || "Generated (demo)",
          };

    nextSlips.set(String(line.employee_master_id), slip);
    return {
      ...line,
      computed_json: {
        ...(line.computed_json || {}),
        payslip: slip,
        payslip_revision_no: slip.payslip_revision_no,
        slip_generated_on: run.processed_on,
      },
    };
  });

  const created = target.filter((l) => {
    const before = slipsByEmp.has(String(l.employee_master_id));
    return forceRevision || !before;
  }).length;

  return { lines: nextLines, slipsByEmp: nextSlips, slipCount: created || (forceRevision ? target.length : 0) };
}

/** Demo amount revision — recomputes line + new payslip revision. */
export function demoRevisePayslip({ run, lines, slipsByEmp, employeeMasterId, patch = {}, note = "" }) {
  const idx = lines.findIndex((l) => String(l.employee_master_id) === String(employeeMasterId));
  if (idx < 0) throw new Error("Employee not found in demo sheet.");

  const EDITABLE = [
    "present_days",
    "loan",
    "sal_adv",
    "unpaid_paid",
    "tds",
    "pt_amount",
    "pf_basic",
    "custom_earn_full",
    "custom_ded_full",
  ];
  const line = { ...lines[idx] };
  for (const k of EDITABLE) {
    if (patch[k] !== undefined) line[k] = patch[k];
  }
  const next = recomputeLineFromEdits(line, run.month_days);
  const previous = slipsByEmp.get(String(employeeMasterId)) || next.computed_json?.payslip || null;
  const base = buildPayslipFromLine(run, next, {
    processedOn: previous?.processed_on || run.processed_on,
    generatedAt: new Date().toISOString(),
  });
  const slip = withPayslipRevision(previous, base, {
    note: note || "Amount revision (demo)",
    revisedBy: "demo@indus",
    generatedAt: new Date().toISOString(),
  });

  const stamped = {
    ...next,
    line_revision_no: (Number(next.line_revision_no) || 1) + 1,
    computed_json: {
      ...(next.computed_json || {}),
      payslip: slip,
      payslip_revision_no: slip.payslip_revision_no,
      slip_generated_on: run.processed_on,
      last_payslip_revision_note: note || "Amount revision (demo)",
    },
  };

  const nextLines = lines.map((l, i) => (i === idx ? stamped : l));
  const nextSlips = new Map(slipsByEmp);
  nextSlips.set(String(employeeMasterId), slip);

  return { lines: nextLines, slipsByEmp: nextSlips, slip, line: stamped };
}
