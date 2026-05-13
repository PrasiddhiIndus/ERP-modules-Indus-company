import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SectionCard, KpiTile, Badge, FilterBar, TinySelect, DenseTable, LinkedChip } from "../components/AdminUi";
import { mockEmployees } from "../data/mockAdminData";
import {
  PAYROLL_ENTRY_COLUMNS,
  buildPayrollEntryWorkbook,
  downloadAttendanceWorkbook,
  monthMeta,
} from "./attendanceSheetExcel";
import {
  loadPayrollPackages,
  getPackageById,
  resolvePayrollPackageColumnKeys,
  PAYROLL_ENTRY_SELECTED_PACKAGE_KEY,
} from "./payrollPackages";

const base = "/app/admin/payroll";

const EMPLOYEE_SITE_BY_CODE = {
  "IFS-10482": "IFSPL FACTORY",
  "IEV-22011": "HO - Pune",
  "IFS-08991": "Plant Alpha",
};

const MONTH_OPTIONS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];

const PAYROLL_MASTER_BY_CODE = {
  "IFS-10482": {
    pfNo: "MH/PUN/10482",
    uanNo: "100482000001",
    esicNo: "5100048201",
    accountNumber: "50200010482001",
    ifscCode: "HDFC0000149",
    dateOfJoining: "2021-04-12",
    grossWages: 21865,
    pfBasic: 13500,
    basic: 13500,
    hraMonthly: 5400,
    conveyanceAllowanceMonthly: 0,
    medicalAllowanceMonthly: 0,
    attendanceBonusMonthly: 0,
    journalPeriodicalsMonthly: 0,
    childrenEduAllowanceMonthly: 0,
    telephoneInternetMonthly: 0,
    performanceIncentiveMonthly: 2365,
    specialAllowanceMonthly: 0,
    uniformAllowanceMonthly: 600,
    professionalTax: 200,
  },
  "IEV-22011": {
    pfNo: "MH/PUN/22011",
    uanNo: "102201100001",
    esicNo: "5102201101",
    accountNumber: "91702022011001",
    ifscCode: "UTIB0000217",
    dateOfJoining: "2024-11-01",
    grossWages: 24381,
    pfBasic: 13500,
    basic: 13500,
    hraMonthly: 5400,
    conveyanceAllowanceMonthly: 900,
    medicalAllowanceMonthly: 600,
    attendanceBonusMonthly: 600,
    journalPeriodicalsMonthly: 0,
    childrenEduAllowanceMonthly: 300,
    telephoneInternetMonthly: 400,
    performanceIncentiveMonthly: 2181,
    specialAllowanceMonthly: 0,
    uniformAllowanceMonthly: 500,
    professionalTax: 200,
  },
  "IFS-08991": {
    pfNo: "MH/PUN/08991",
    uanNo: "100899100001",
    esicNo: "5100899101",
    accountNumber: "2004108991001",
    ifscCode: "ICIC0000064",
    dateOfJoining: "2019-08-19",
    grossWages: 26145,
    pfBasic: 13500,
    basic: 13500,
    hraMonthly: 5400,
    conveyanceAllowanceMonthly: 1400,
    medicalAllowanceMonthly: 500,
    attendanceBonusMonthly: 1100,
    journalPeriodicalsMonthly: 0,
    childrenEduAllowanceMonthly: 500,
    telephoneInternetMonthly: 400,
    performanceIncentiveMonthly: 2745,
    specialAllowanceMonthly: 0,
    uniformAllowanceMonthly: 600,
    professionalTax: 200,
  },
};

const FIELD_SOURCE_META = {
  master: { label: "Employee / salary master", tone: "bg-blue-50 text-blue-800 border-blue-100" },
  attendance: { label: "Attendance fed", tone: "bg-emerald-50 text-emerald-800 border-emerald-100" },
  editable: { label: "Editable entry", tone: "bg-white text-gray-700 border-gray-300" },
  formula: { label: "Formula / driver", tone: "bg-purple-50 text-purple-800 border-purple-100" },
};

const ENTRY_EDITABLE_KEYS = new Set(PAYROLL_ENTRY_COLUMNS.filter((column) => column.source === "editable").map((column) => column.key));
const ALLOWANCE_DRIVER_KEYS = new Set([
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

const PAYROLL_GENERATE_FIELDS = [
  { key: "grossWages", label: "Gross wages", group: "Wages" },
  { key: "pfBasic", label: "PF basic", group: "Wages" },
  { key: "basic", label: "Basic", group: "Wages" },
  { key: "hraMonthly", label: "HRA", group: "Allowances" },
  { key: "conveyanceAllowanceMonthly", label: "Conveyance allowance", group: "Allowances" },
  { key: "medicalAllowanceMonthly", label: "Medical Allowance", group: "Allowances" },
  { key: "attendanceBonusMonthly", label: "Attendance bonus", group: "Allowances" },
  { key: "journalPeriodicalsMonthly", label: "Journal & Periodicals", group: "Allowances" },
  { key: "childrenEduAllowanceMonthly", label: "Children Edu allow", group: "Allowances" },
  { key: "telephoneInternetMonthly", label: "Telephone/ Internet", group: "Allowances" },
  { key: "performanceIncentiveMonthly", label: "Performance Incentive", group: "Allowances" },
  { key: "specialAllowanceMonthly", label: "Special allowance", group: "Allowances" },
  { key: "uniformAllowanceMonthly", label: "Uniform Allowance", group: "Allowances" },
  { key: "professionalTax", label: "P Tax", group: "Deductions" },
  { key: "loan", label: "Loan", group: "Deductions" },
  { key: "salaryAdvance", label: "Sal adv", group: "Deductions" },
  { key: "held", label: "Held", group: "Deductions" },
  { key: "paid", label: "Paid", group: "Payment" },
  { key: "remarks", label: "Remarks", group: "Notes", type: "text" },
];

function buildGenerateDraft(rows) {
  return rows.reduce((acc, row) => {
    acc[row.id] = PAYROLL_GENERATE_FIELDS.reduce((rowDraft, field) => {
      rowDraft[field.key] = row[field.key] ?? "";
      return rowDraft;
    }, {});
    return acc;
  }, {});
}

const PAYROLL_WIZARD_BASIC_FIELDS = PAYROLL_GENERATE_FIELDS.filter((f) => ["grossWages", "pfBasic", "basic"].includes(f.key));
const PAYROLL_WIZARD_ALLOWANCE_FIELDS = PAYROLL_GENERATE_FIELDS.filter((f) => f.group === "Allowances");
const PAYROLL_WIZARD_MISC_FIELDS = PAYROLL_GENERATE_FIELDS.filter((f) =>
  ["professionalTax", "loan", "salaryAdvance", "held"].includes(f.key),
);

function PayrollWizardCardTable({ stepLabel, title, fields, rows, generateDraft, onDraftChange, complete, onMarkComplete, onUndoComplete }) {
  const shell = complete
    ? "border-emerald-500 bg-emerald-50/30 ring-2 ring-emerald-200/90 shadow-sm shadow-emerald-900/5"
    : "border-red-500 bg-red-50/25 ring-2 ring-red-200/90 shadow-sm shadow-red-900/5";
  return (
    <section className={`flex min-h-0 flex-col overflow-hidden rounded-xl border-2 ${shell}`}>
      <header className="shrink-0 border-b border-black/5 bg-white/60 px-3 py-2.5 backdrop-blur-[2px]">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{stepLabel}</p>
            <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          </div>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
              complete ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
            }`}
          >
            {complete ? "Complete" : "Incomplete"}
          </span>
        </div>
      </header>
      <div className="min-h-0 max-h-[48vh] flex-1 overflow-auto overflow-x-auto [scrollbar-width:thin]">
        {rows.length === 0 ? (
          <p className="p-4 text-center text-xs text-gray-500">No employees for this company and site.</p>
        ) : (
          <table className="w-full min-w-[320px] border-separate border-spacing-0 text-[11px]">
            <thead className="sticky top-0 z-10 bg-white/95 text-gray-700 shadow-sm backdrop-blur">
              <tr>
                <th className="border-b border-r border-gray-200 px-2 py-2 text-left font-semibold">Code</th>
                <th className="border-b border-r border-gray-200 px-2 py-2 text-left font-semibold">Name</th>
                {fields.map((field) => (
                  <th key={field.key} className="border-b border-r border-gray-200 px-2 py-2 text-left font-semibold last:border-r-0">
                    <span className="block whitespace-nowrap">{field.label}</span>
                    <span className="mt-0.5 inline-block rounded bg-gray-100 px-1 py-0.5 text-[9px] font-medium uppercase text-gray-600">
                      {field.group}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50/80">
                  <td className="border-r border-gray-100 px-2 py-1.5 font-semibold text-gray-900">{row.employeeCode}</td>
                  <td className="border-r border-gray-100 px-2 py-1.5 text-gray-800">{row.name}</td>
                  {fields.map((field) => {
                    const value = generateDraft[row.id]?.[field.key] ?? "";
                    return (
                      <td key={field.key} className="border-r border-gray-100 px-1.5 py-1 align-middle last:border-r-0">
                        <GenerateDraftInput
                          field={field}
                          value={value}
                          onChange={(_, nextValue) => onDraftChange(row.id, field, nextValue)}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="shrink-0 flex flex-wrap items-center justify-end gap-2 border-t border-black/5 bg-white/85 px-3 py-2.5 backdrop-blur-[2px]">
        {complete ? (
          <>
            <span className="text-[11px] font-medium text-emerald-800">Marked complete for this section.</span>
            <button
              type="button"
              onClick={onUndoComplete}
              className="h-8 rounded-lg border border-gray-300 bg-white px-3 text-[11px] font-semibold text-gray-800 hover:bg-gray-50"
            >
              Undo
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onMarkComplete}
            className="h-8 rounded-lg bg-emerald-600 px-4 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700"
          >
            Complete
          </button>
        )}
      </div>
    </section>
  );
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function roundMoney(value) {
  return Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;
}

function countAttendanceMarks(marks = {}) {
  const totals = { present: 0, leave: 0, holiday: 0, weeklyOff: 0, absent: 0 };
  Object.values(marks).forEach((mark) => {
    if (mark === "P") totals.present += 1;
    if (mark === "L") totals.leave += 1;
    if (mark === "H") totals.holiday += 1;
    if (mark === "WO") totals.weeklyOff += 1;
    if (mark === "A") totals.absent += 1;
  });
  return { ...totals, payableDays: totals.present + totals.leave + totals.holiday + totals.weeklyOff };
}

function buildPeriodAttendanceMarks(employees, year, month) {
  const days = monthMeta(year, month).days;
  return employees.reduce((acc, employee, employeeIndex) => {
    const marks = {};
    for (let day = 1; day <= days; day += 1) {
      const date = new Date(year, month - 1, day);
      const isSunday = date.getDay() === 0;
      const leaveDay = ((month + year + employeeIndex * 3) % Math.min(days, 24)) + 1;
      const absentDay = ((month * 2 + year + employeeIndex * 5) % Math.min(days, 25)) + 1;

      if (isSunday) marks[day] = "WO";
      else if (day === leaveDay) marks[day] = "L";
      else if (day === absentDay) marks[day] = "A";
      else marks[day] = "P";
    }
    acc[employee.code] = marks;
    return acc;
  }, {});
}

function filterEmployeesForPayroll({ employees, company, site }) {
  return employees.filter((employee) => {
    const companyMatch = company === "IFSPL / IEVPL" || employee.company === company;
    const employeeSite = EMPLOYEE_SITE_BY_CODE[employee.code] || "IFSPL FACTORY";
    const siteMatch = site === "All sites" || employeeSite === site;
    return companyMatch && siteMatch;
  });
}

function buildPayrollEntryRows({ employees, seedMarks, daysInMonth, edits = {} }) {
  return employees.map((employee, idx) => {
    const master = PAYROLL_MASTER_BY_CODE[employee.code] || {};
    const attendance = countAttendanceMarks(seedMarks[employee.code]);
    const edit = edits[employee.id] || {};
    const base = {
      id: employee.id,
      srNo: idx + 1,
      employeeCode: employee.code,
      pfNo: master.pfNo || "",
      uanNo: master.uanNo || "",
      esicNo: master.esicNo || "",
      name: employee.name,
      accountNumber: master.accountNumber || "",
      ifscCode: master.ifscCode || "",
      designation: employee.designation || "",
      dateOfJoining: master.dateOfJoining || employee.joiningDate || "",
      presentDays: attendance.payableDays,
      grossWages: master.grossWages || 0,
      pfBasic: master.pfBasic || 0,
      basic: master.basic || 0,
      hraMonthly: master.hraMonthly || 0,
      conveyanceAllowanceMonthly: master.conveyanceAllowanceMonthly || 0,
      medicalAllowanceMonthly: master.medicalAllowanceMonthly || 0,
      attendanceBonusMonthly: master.attendanceBonusMonthly || 0,
      journalPeriodicalsMonthly: master.journalPeriodicalsMonthly || 0,
      childrenEduAllowanceMonthly: master.childrenEduAllowanceMonthly || 0,
      telephoneInternetMonthly: master.telephoneInternetMonthly || 0,
      performanceIncentiveMonthly: master.performanceIncentiveMonthly || 0,
      specialAllowanceMonthly: master.specialAllowanceMonthly || 0,
      uniformAllowanceMonthly: master.uniformAllowanceMonthly || 0,
      professionalTax: master.professionalTax || 0,
      loan: "",
      salaryAdvance: "",
      held: "",
      paid: "",
      remarks: "",
    };

    const row = { ...base, ...edit };
    const pdays = toNumber(row.presentDays);
    const factor = daysInMonth ? pdays / daysInMonth : 0;
    row.pfBasicEarned = roundMoney(toNumber(row.pfBasic) * factor);
    row.basicEarned = roundMoney(toNumber(row.basic) * factor);
    row.hra = roundMoney(toNumber(row.hraMonthly) * factor);
    row.conveyanceAllowance = roundMoney(toNumber(row.conveyanceAllowanceMonthly) * factor);
    row.medicalAllowance = roundMoney(toNumber(row.medicalAllowanceMonthly) * factor);
    row.attendanceBonus = roundMoney(toNumber(row.attendanceBonusMonthly) * factor);
    row.journalPeriodicals = roundMoney(toNumber(row.journalPeriodicalsMonthly) * factor);
    row.childrenEduAllowance = roundMoney(toNumber(row.childrenEduAllowanceMonthly) * factor);
    row.telephoneInternet = roundMoney(toNumber(row.telephoneInternetMonthly) * factor);
    row.performanceIncentive = roundMoney(toNumber(row.performanceIncentiveMonthly) * factor);
    row.specialAllowance = roundMoney(toNumber(row.specialAllowanceMonthly) * factor);
    row.uniformAllowance = roundMoney(toNumber(row.uniformAllowanceMonthly) * factor);
    row.grossWagesEarned = roundMoney(
      row.basicEarned +
        row.hra +
        row.conveyanceAllowance +
        row.medicalAllowance +
        row.attendanceBonus +
        row.journalPeriodicals +
        row.childrenEduAllowance +
        row.telephoneInternet +
        row.performanceIncentive +
        row.specialAllowance +
        row.uniformAllowance,
    );
    row.pfAmount = roundMoney(row.pfBasicEarned * 0.12);
    row.esic = row.grossWagesEarned <= 21000 ? roundMoney(row.grossWagesEarned * 0.0075) : 0;
    row.totalDeduction = roundMoney(row.pfAmount + row.esic + toNumber(row.professionalTax) + toNumber(row.loan) + toNumber(row.salaryAdvance) + toNumber(row.held));
    row.netSalary = roundMoney(row.grossWagesEarned - row.totalDeduction);
    row.bank = Math.round(row.netSalary);
    row.diff = roundMoney(row.bank - toNumber(row.paid));
    return row;
  });
}

function buildStandardPayrollPayload({ year, month, company, site, rows, editableCells }) {
  const { label } = monthMeta(year, month);
  return {
    schemaVersion: 1,
    period: label,
    year,
    month,
    company,
    site,
    flow: "attendance-salary-sheet-billing-accounts",
    status: "draft",
    editableCells,
    rows: rows.map((row) => ({
      employeeId: row.id,
      employeeCode: row.employeeCode,
      employeeName: row.name,
      attendance: {
        payableDays: row.presentDays,
      },
      wageMaster: {
        grossWages: row.grossWages,
        pfBasic: row.pfBasic,
        basic: row.basic,
        allowancesMonthly: {
          hra: row.hraMonthly,
          conveyanceAllowance: row.conveyanceAllowanceMonthly,
          medicalAllowance: row.medicalAllowanceMonthly,
          attendanceBonus: row.attendanceBonusMonthly,
          journalPeriodicals: row.journalPeriodicalsMonthly,
          childrenEduAllowance: row.childrenEduAllowanceMonthly,
          telephoneInternet: row.telephoneInternetMonthly,
          performanceIncentive: row.performanceIncentiveMonthly,
          specialAllowance: row.specialAllowanceMonthly,
          uniformAllowance: row.uniformAllowanceMonthly,
        },
      },
      earnings: {
        pfBasicEarned: row.pfBasicEarned,
        basicEarned: row.basicEarned,
        hra: row.hra,
        conveyanceAllowance: row.conveyanceAllowance,
        medicalAllowance: row.medicalAllowance,
        attendanceBonus: row.attendanceBonus,
        journalPeriodicals: row.journalPeriodicals,
        childrenEduAllowance: row.childrenEduAllowance,
        telephoneInternet: row.telephoneInternet,
        performanceIncentive: row.performanceIncentive,
        specialAllowance: row.specialAllowance,
        uniformAllowance: row.uniformAllowance,
        grossWagesEarned: row.grossWagesEarned,
      },
      deductions: {
        pfAmount: row.pfAmount,
        esic: row.esic,
        professionalTax: row.professionalTax,
        loan: row.loan,
        salaryAdvance: row.salaryAdvance,
        held: row.held,
        totalDeduction: row.totalDeduction,
      },
      payment: {
        netSalary: row.netSalary,
        bank: row.bank,
        paid: row.paid,
        diff: row.diff,
      },
      remarks: row.remarks,
    })),
    savedAt: new Date().toISOString(),
  };
}

function exportEntryXlsx({ year, month, company, site, rows, columnKeys }) {
  const wb = buildPayrollEntryWorkbook({ year, month, company, site, rows, columnKeys });
  const { label } = monthMeta(year, month);
  downloadAttendanceWorkbook(wb, `Payroll-entry-sheet-${label}.xlsx`);
}

function formatMoney(value) {
  return toNumber(value).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function EntryCell({ row, column, onChange }) {
  const value = row[column.key] ?? "";
  const isTextInput = column.key === "remarks";
  const isTextDisplay = ["employeeCode", "pfNo", "uanNo", "esicNo", "name", "accountNumber", "ifscCode", "designation", "dateOfJoining", "remarks"].includes(column.key);

  if (ALLOWANCE_DRIVER_KEYS.has(column.key)) {
    const monthlyKey = `${column.key}Monthly`;
    const monthlyValue = row[monthlyKey] ?? "";
    return (
      <div className="min-w-[110px] space-y-1">
        <input
          type="number"
          value={monthlyValue}
          onChange={(event) => onChange(row.id, monthlyKey, event.target.value === "" ? "" : toNumber(event.target.value))}
          className="w-full rounded border border-purple-200 bg-white px-1.5 py-1 text-[11px] text-gray-900 focus:border-[#1F3A8A] focus:outline-none"
          title="Monthly allowance basis"
        />
        <div className="flex items-center justify-between gap-2 text-[10px]">
          <span className="text-gray-500">earned</span>
          <span className="font-semibold text-purple-900 tabular-nums">{formatMoney(value)}</span>
        </div>
      </div>
    );
  }

  if (ENTRY_EDITABLE_KEYS.has(column.key)) {
    return (
      <input
        type={isTextInput ? "text" : "number"}
        value={value}
        onChange={(event) => {
          const nextValue = isTextInput || event.target.value === "" ? event.target.value : toNumber(event.target.value);
          onChange(row.id, column.key, nextValue);
        }}
        className="w-full min-w-[90px] rounded border border-gray-300 bg-white px-1.5 py-1 text-[11px] text-gray-900 focus:border-[#1F3A8A] focus:outline-none"
      />
    );
  }

  if (column.source === "formula") {
    return <span className="font-medium text-purple-900">{formatMoney(value)}</span>;
  }

  if (column.key === "srNo" || column.key === "presentDays") {
    return <span className="font-medium text-gray-900 tabular-nums">{value}</span>;
  }

  return <span className={isTextDisplay ? "text-gray-800" : "tabular-nums text-gray-800"}>{isTextDisplay ? value : formatMoney(value)}</span>;
}

function GenerateDraftInput({ field, value, onChange }) {
  return (
    <input
      type={field.type === "text" ? "text" : "number"}
      step={field.type === "text" ? undefined : "0.01"}
      value={value}
      onChange={(event) => onChange(field, event.target.value)}
      className={`h-8 w-full rounded-lg border border-gray-300 bg-white px-2 text-[11px] text-gray-900 focus:border-[#1F3A8A] focus:outline-none focus:ring-2 focus:ring-blue-100 ${
        field.type === "text" ? "" : "tabular-nums"
      }`}
    />
  );
}

export function PayrollDashboardPage() {
  const navigate = useNavigate();
  const activeCount = mockEmployees.filter((e) => !String(e.status || "").includes("Exit")).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <KpiTile label="Active roster (sample)" value={String(activeCount)} sub="Pulls from Employee Master when wired" onClick={() => navigate("/app/admin/employee/master")} />
        <KpiTile label="Entry sheet" value="Excel" sub="Attendance + formulas" onClick={() => navigate(`${base}/entry`)} tone="border-emerald-100" />
        <KpiTile label="Year bulk" value="12 ×" sub="One click per month" onClick={() => navigate(`${base}/year`)} tone="border-sky-100" />
        <KpiTile label="Handoff" value="Accounts" sub="Meta sheet + register" onClick={() => navigate("/app/accounts-finance")} tone="border-amber-100" />
      </div>

      <SectionCard
        title="Workflow"
        right={<Badge tone="bg-blue-50 text-blue-800">Admin → Finance</Badge>}
      >
        <ol className="list-decimal pl-4 space-y-2 text-xs text-gray-700">
          <li>Lock attendance corrections in Raw Attendance Data for the payroll period.</li>
          <li>Review the prefilled entry sheet: attendance days are pulled in, formulas calculate pay, and entry fields stay editable.</li>
          <li>Compliance uses the same file or downstream exports from Accounts.</li>
        </ol>
        <div className="mt-3 flex flex-wrap gap-2">
          <LinkedChip label="Raw Attendance Data" toHint="Corrections before lock" />
          <LinkedChip label="Leaves / LOP" toHint="employee leaves" />
          <LinkedChip label="Salary Inputs" toHint="admin salary layer" />
        </div>
      </SectionCard>

      <SectionCard title="Quick export (current month, sample data)" right={<Badge tone="bg-gray-100 text-gray-700">Demo</Badge>}>
        <p className="text-xs text-gray-600 mb-2">
          Uses mock roster from Admin Operations. Replace with API payload when backend is ready.
        </p>
        <button
          type="button"
          className="h-9 px-4 rounded-lg bg-[#1F3A8A] text-white text-xs font-medium"
          onClick={() => {
            const now = new Date();
            const year = now.getFullYear();
            const month = now.getMonth() + 1;
            const { days } = monthMeta(year, month);
            const employees = filterEmployeesForPayroll({ employees: mockEmployees, company: "IFSPL / IEVPL", site: "All sites" });
            const rows = buildPayrollEntryRows({
              employees,
              seedMarks: buildPeriodAttendanceMarks(employees, year, month),
              daysInMonth: days,
            });
            exportEntryXlsx({
              year,
              month,
              company: "IFSPL / IEVPL",
              site: "All sites",
              rows,
            });
          }}
        >
          Download entry sheet (.xlsx)
        </button>
      </SectionCard>
    </div>
  );
}

export function PayrollMonthPage() {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [company, setCompany] = useState("IFSPL / IEVPL");
  const [site, setSite] = useState("All sites");
  const [entryEdits, setEntryEdits] = useState({});
  const [saveState, setSaveState] = useState("Draft ready");
  /** select: pick period & package; wizard: three input cards; sheet: full salary grid + export */
  const [entryPhase, setEntryPhase] = useState("select");
  const [generateDraft, setGenerateDraft] = useState({});
  const filterSigRef = useRef(null);
  const [wizardPanelsConfirmed, setWizardPanelsConfirmed] = useState({
    basic: false,
    allowances: false,
    misc: false,
  });
  const [showSalaryPreview, setShowSalaryPreview] = useState(false);
  const [selectedPackageId, setSelectedPackageId] = useState(() => {
    try {
      return window.localStorage.getItem(PAYROLL_ENTRY_SELECTED_PACKAGE_KEY) || "standard-full";
    } catch {
      return "standard-full";
    }
  });

  const year = selectedYear;
  const month = selectedMonth;
  const meta = useMemo(() => monthMeta(year, month), [year, month]);
  const autosaveKey = useMemo(() => `indus-payroll-entry:${meta.label}:${company}:${site}`, [company, meta.label, site]);
  const filteredEmployees = useMemo(() => filterEmployeesForPayroll({ employees: mockEmployees, company, site }), [company, site]);
  const periodSeedMarks = useMemo(() => buildPeriodAttendanceMarks(filteredEmployees, year, month), [filteredEmployees, month, year]);
  const rows = useMemo(
    () =>
      buildPayrollEntryRows({
        employees: filteredEmployees,
        seedMarks: periodSeedMarks,
        daysInMonth: meta.days,
        edits: entryEdits,
      }),
    [entryEdits, filteredEmployees, meta.days, periodSeedMarks],
  );

  const packagesState = loadPayrollPackages();
  const activePayrollPackage = getPackageById(packagesState, selectedPackageId);
  const selectedKeysSig = (activePayrollPackage?.selectedKeys || []).join("|");
  const salaryColumnKeys = useMemo(
    () => resolvePayrollPackageColumnKeys(activePayrollPackage?.selectedKeys || []),
    [activePayrollPackage?.id, selectedKeysSig],
  );
  const salaryColumns = useMemo(
    () => salaryColumnKeys.map((k) => PAYROLL_ENTRY_COLUMNS.find((c) => c.key === k)).filter(Boolean),
    [salaryColumnKeys],
  );

  const filterSignature = useMemo(
    () => `${selectedMonth}|${selectedYear}|${company}|${site}|${selectedPackageId}`,
    [company, selectedMonth, selectedPackageId, selectedYear, site],
  );

  useEffect(() => {
    if (filterSigRef.current === null) {
      filterSigRef.current = filterSignature;
      return;
    }
    if (filterSigRef.current !== filterSignature) {
      filterSigRef.current = filterSignature;
      setEntryPhase("select");
      setShowSalaryPreview(false);
      setWizardPanelsConfirmed({ basic: false, allowances: false, misc: false });
    }
  }, [filterSignature]);

  const wizardAllComplete =
    wizardPanelsConfirmed.basic && wizardPanelsConfirmed.allowances && wizardPanelsConfirmed.misc;

  useEffect(() => {
    try {
      const st = loadPayrollPackages();
      if (!st.packages.some((p) => String(p.id) === String(selectedPackageId))) {
        setSelectedPackageId(st.packages[0]?.id || "standard-full");
      }
    } catch {
      /* ignore */
    }
  }, [selectedPackageId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(PAYROLL_ENTRY_SELECTED_PACKAGE_KEY, String(selectedPackageId));
    } catch {
      /* ignore */
    }
  }, [selectedPackageId]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(autosaveKey);
      if (!saved) {
        setEntryEdits({});
        setSaveState("No saved draft");
        return;
      }
      const payload = JSON.parse(saved);
      setEntryEdits(payload.editableCells || {});
      setSaveState(`Loaded saved draft for ${meta.label}`);
    } catch {
      setSaveState("Could not load saved draft");
    }
  }, [autosaveKey, meta.label]);

  useEffect(() => {
    setSaveState("Saving...");
    const timer = window.setTimeout(() => {
      const payload = buildStandardPayrollPayload({ year, month, company, site, rows, editableCells: entryEdits });
      window.localStorage.setItem(autosaveKey, JSON.stringify(payload));
      setSaveState(`Autosaved ${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [autosaveKey, company, entryEdits, month, rows, site, year]);

  const handleEntryChange = (employeeId, key, value) => {
    setEntryEdits((prev) => ({
      ...prev,
      [employeeId]: {
        ...(prev[employeeId] || {}),
        [key]: value,
      },
    }));
  };

  const startEntryWizard = () => {
    setGenerateDraft(buildGenerateDraft(rows));
    setWizardPanelsConfirmed({ basic: false, allowances: false, misc: false });
    setEntryPhase("wizard");
  };

  const cancelEntryWizard = () => {
    setWizardPanelsConfirmed({ basic: false, allowances: false, misc: false });
    setEntryPhase("select");
  };

  const handleGenerateDraftChange = (employeeId, field, value) => {
    setGenerateDraft((prev) => ({
      ...prev,
      [employeeId]: {
        ...(prev[employeeId] || {}),
        [field.key]: field.type === "text" || value === "" ? value : toNumber(value),
      },
    }));
  };

  const commitWizardToSheet = () => {
    setEntryEdits((prev) => {
      const next = { ...prev };
      rows.forEach((row) => {
        const draftRow = generateDraft[row.id] || {};
        next[row.id] = { ...(next[row.id] || {}) };
        PAYROLL_GENERATE_FIELDS.forEach((field) => {
          next[row.id][field.key] = draftRow[field.key] ?? "";
        });
      });
      return next;
    });
    setSaveState(`Salary sheet ready for ${meta.label}`);
    setEntryPhase("sheet");
  };

  const reopenWizardFromSheet = () => {
    setGenerateDraft(buildGenerateDraft(rows));
    setWizardPanelsConfirmed({ basic: false, allowances: false, misc: false });
    setEntryPhase("wizard");
    setShowSalaryPreview(false);
  };

  useEffect(() => {
    if (!showSalaryPreview) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setShowSalaryPreview(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showSalaryPreview]);

  useEffect(() => {
    if (!showSalaryPreview) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [showSalaryPreview]);

  return (
    <div className="space-y-4">
      <SectionCard title="Payroll entry tab" right={<Badge tone="bg-emerald-50 text-emerald-900">Prefilled Excel-style sheet</Badge>}>
        <FilterBar>
          <label className="flex flex-col gap-0.5 text-[11px] text-gray-600">
            Month
            <TinySelect
              value={String(selectedMonth)}
              disabled={entryPhase === "wizard"}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="min-w-[130px]"
            >
              {MONTH_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </TinySelect>
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] text-gray-600">
            Year
            <TinySelect
              value={String(selectedYear)}
              disabled={entryPhase === "wizard"}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="min-w-[100px]"
            >
              {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </TinySelect>
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] text-gray-600 min-w-[140px]">
            Company
            <TinySelect value={company} disabled={entryPhase === "wizard"} onChange={(e) => setCompany(e.target.value)} className="w-full">
              <option>IFSPL / IEVPL</option>
              <option>IFSPL</option>
              <option>IEVPL</option>
            </TinySelect>
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] text-gray-600 min-w-[180px]">
            Salary package
            <TinySelect
              value={String(selectedPackageId)}
              disabled={entryPhase === "wizard"}
              onChange={(e) => setSelectedPackageId(e.target.value)}
              className="w-full min-w-[180px]"
            >
              {packagesState.packages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </TinySelect>
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] text-gray-600 min-w-[140px]">
            Site / unit
            <TinySelect value={site} disabled={entryPhase === "wizard"} onChange={(e) => setSite(e.target.value)} className="w-full">
              <option>All sites</option>
              <option>IFSPL FACTORY</option>
              <option>HO - Pune</option>
              <option>Plant Alpha</option>
            </TinySelect>
          </label>
          <div className="flex flex-col gap-0.5 text-[11px] text-gray-600">
            <span className="invisible">.</span>
            <div className="flex flex-wrap gap-2">
              {entryPhase === "select" ? (
                <button
                  type="button"
                  className="h-8 px-4 rounded-lg bg-emerald-600 text-white text-xs font-medium whitespace-nowrap hover:bg-emerald-700"
                  onClick={startEntryWizard}
                >
                  Generate
                </button>
              ) : null}
              {entryPhase === "wizard" ? (
                <button
                  type="button"
                  className="h-8 px-4 rounded-lg border border-gray-300 bg-white text-xs font-medium text-gray-800 hover:bg-gray-50"
                  onClick={cancelEntryWizard}
                >
                  Cancel setup
                </button>
              ) : null}
              {entryPhase === "sheet" ? (
                <>
                  <button
                    type="button"
                    className="h-8 px-4 rounded-lg bg-[#1F3A8A] text-white text-xs font-medium whitespace-nowrap"
                    onClick={() =>
                      exportEntryXlsx({
                        year,
                        month,
                        company,
                        site,
                        rows,
                        columnKeys: salaryColumnKeys,
                      })
                    }
                  >
                    Download Excel sheet
                  </button>
                  <button
                    type="button"
                    className="h-8 px-4 rounded-lg border border-amber-200 bg-amber-50 text-xs font-medium text-amber-900 hover:bg-amber-100"
                    onClick={reopenWizardFromSheet}
                  >
                    Adjust wage inputs
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </FilterBar>
        <p className="text-[11px] text-gray-500 mt-2">
          {entryPhase === "select" ? (
            <>
              Period <strong>{meta.label}</strong> — {meta.days} calendar days. Package <strong>{activePayrollPackage?.name || "—"}</strong> (
              {salaryColumns.length} columns). Choose filters, then click <strong>Generate</strong> to complete wages in three panels.
            </>
          ) : null}
          {entryPhase === "wizard" ? (
            <>
              Use <strong>Complete</strong> on each panel when you are satisfied (even if some cells stay empty). All three must be marked
              before <strong>Generate salary sheet</strong> unlocks. Use <strong>Undo</strong> on a panel to mark it incomplete again.{" "}
              <strong>Cancel setup</strong> changes month, company, package, or site.
            </>
          ) : null}
          {entryPhase === "sheet" ? (
            <>
              Salary sheet is live for <strong>{meta.label}</strong> with package <strong>{activePayrollPackage?.name || "—"}</strong> (
              {salaryColumns.length} columns). Configure packages under <strong>Admin → Payroll → Formula</strong>.
            </>
          ) : null}
        </p>
      </SectionCard>

      {entryPhase === "wizard" ? (
        <SectionCard
          title="Salary input checklist"
          right={
            <Badge tone={wizardAllComplete ? "bg-emerald-100 text-emerald-900" : "bg-amber-50 text-amber-900"}>
              {wizardAllComplete ? "All panels complete" : "Panels in progress"}
            </Badge>
          }
        >
          <p className="text-[11px] text-gray-600 mb-3">
            Enter what you have for wages, allowances, and deductions. Mark each panel complete when you are ready; paid and remarks stay on the
            Excel / preview sheet only.
          </p>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <PayrollWizardCardTable
              stepLabel="1. Basic"
              title="Gross wages, PF basic & basic"
              fields={PAYROLL_WIZARD_BASIC_FIELDS}
              rows={rows}
              generateDraft={generateDraft}
              onDraftChange={handleGenerateDraftChange}
              complete={wizardPanelsConfirmed.basic}
              onMarkComplete={() => setWizardPanelsConfirmed((p) => ({ ...p, basic: true }))}
              onUndoComplete={() => setWizardPanelsConfirmed((p) => ({ ...p, basic: false }))}
            />
            <PayrollWizardCardTable
              stepLabel="2. Allowances"
              title="Monthly allowance drivers"
              fields={PAYROLL_WIZARD_ALLOWANCE_FIELDS}
              rows={rows}
              generateDraft={generateDraft}
              onDraftChange={handleGenerateDraftChange}
              complete={wizardPanelsConfirmed.allowances}
              onMarkComplete={() => setWizardPanelsConfirmed((p) => ({ ...p, allowances: true }))}
              onUndoComplete={() => setWizardPanelsConfirmed((p) => ({ ...p, allowances: false }))}
            />
            <PayrollWizardCardTable
              stepLabel="3. Tax & miscellaneous"
              title="P Tax, loan, salary advance & held"
              fields={PAYROLL_WIZARD_MISC_FIELDS}
              rows={rows}
              generateDraft={generateDraft}
              onDraftChange={handleGenerateDraftChange}
              complete={wizardPanelsConfirmed.misc}
              onMarkComplete={() => setWizardPanelsConfirmed((p) => ({ ...p, misc: true }))}
              onUndoComplete={() => setWizardPanelsConfirmed((p) => ({ ...p, misc: false }))}
            />
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              disabled={!wizardAllComplete}
              onClick={commitWizardToSheet}
              className={`h-10 rounded-lg px-5 text-sm font-semibold shadow-sm ${
                wizardAllComplete
                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : "cursor-not-allowed bg-gray-200 text-gray-500"
              }`}
            >
              Generate salary sheet
            </button>
          </div>
        </SectionCard>
      ) : null}

      {entryPhase === "sheet" ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <SectionCard title="Autosave" className="!shadow-none">
              <p className="text-sm font-semibold text-gray-900">{saveState}</p>
              <p className="text-[11px] text-gray-500 mt-1">Draft is saved locally as the same normalized payload intended for DB writes.</p>
            </SectionCard>
            <SectionCard title="Attendance source" className="!shadow-none">
              <p className="text-sm font-semibold text-gray-900">{meta.title}</p>
              <p className="text-[11px] text-gray-500 mt-1">P. Days rebuild from the selected month, year, company, and site.</p>
            </SectionCard>
            <SectionCard title="Formula safety" className="!shadow-none">
              <p className="text-sm font-semibold text-gray-900">Live calculations</p>
              <p className="text-[11px] text-gray-500 mt-1">Export keeps Excel formulas for review and downstream handoff.</p>
            </SectionCard>
            <SectionCard title="Next handoff" className="!shadow-none">
              <p className="text-sm font-semibold text-gray-900">Billing - Accounts</p>
              <p className="text-[11px] text-gray-500 mt-1">Flow: Attendance - Salary Sheet - Billing - Accounts.</p>
            </SectionCard>
          </div>

      <SectionCard title="Sample workbook field map" right={<Badge tone="bg-gray-100 text-gray-700">Active package columns</Badge>}>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-xs">
          {Object.entries(FIELD_SOURCE_META).map(([source, sourceInfo]) => (
            <div key={source} className={`rounded-lg border px-3 py-2 ${sourceInfo.tone}`}>
              <p className="font-semibold">{sourceInfo.label}</p>
              <p className="mt-1 text-[11px] opacity-80">
                {salaryColumns.filter((column) => column.source === source)
                  .map((column) => column.header)
                  .join(", ") || "—"}
              </p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Salary sheet preview"
        right={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="text-[11px] text-gray-500 hidden sm:inline">{rows.length} employees · autosaved · wide sheet</span>
            <button
              type="button"
              onClick={() => setShowSalaryPreview(true)}
              className="h-8 px-4 rounded-lg bg-[#1F3A8A] text-white text-xs font-medium whitespace-nowrap hover:bg-[#172c69] shadow-sm"
              aria-expanded={showSalaryPreview}
            >
              Preview
            </button>
          </div>
        }
      >
        <p className="text-sm text-gray-600 py-6 text-center border border-dashed border-gray-200 rounded-lg bg-gray-50/80">
          The salary grid stays hidden until you open <strong>Preview</strong>. It opens <strong>full-screen</strong> so you can
          scroll the full Excel-style sheet without squeezing it into this card.
        </p>
      </SectionCard>

      {showSalaryPreview ? (
        <div
          className="fixed inset-0 z-[200] flex flex-col items-stretch justify-stretch bg-slate-900/40 backdrop-blur-[2px] p-0 sm:p-2"
          role="dialog"
          aria-modal="true"
          aria-labelledby="payroll-salary-preview-title"
          onClick={() => setShowSalaryPreview(false)}
        >
          <div
            className="flex min-h-0 max-h-full w-full max-w-[100vw] flex-1 flex-col overflow-hidden border-0 bg-white shadow-2xl sm:rounded-xl sm:border sm:border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
              <div className="min-w-0">
                <h2 id="payroll-salary-preview-title" className="text-base font-semibold text-gray-900">
                  Salary sheet preview — {activePayrollPackage?.name || "Package"}
                </h2>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  {rows.length} employees · {salaryColumns.length} columns · <kbd className="rounded border border-gray-300 bg-gray-50 px-1 py-0.5 text-[10px]">Esc</kbd>{" "}
                  to close
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    exportEntryXlsx({
                      year,
                      month,
                      company,
                      site,
                      rows,
                      columnKeys: salaryColumnKeys,
                    })
                  }
                  className="h-9 rounded-lg bg-emerald-600 px-4 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  Export to Excel
                </button>
                <button
                  type="button"
                  onClick={() => setShowSalaryPreview(false)}
                  className="h-9 rounded-lg border border-gray-300 bg-white px-4 text-xs font-semibold text-gray-800 hover:bg-gray-50"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto bg-slate-50 p-2 sm:p-3 [scrollbar-width:thin]">
              <div className="inline-block min-h-full min-w-full rounded-xl border-2 border-emerald-200/90 bg-white shadow-inner">
                <table className="min-w-0 text-sm" style={{ minWidth: `${Math.max(720, salaryColumns.length * 120)}px` }}>
                  <thead className="sticky top-0 z-10 bg-gray-50 text-gray-700 shadow-sm">
                    <tr>
                      {salaryColumns.map((column) => (
                        <th key={column.key} className="border-b border-r border-gray-200 px-2.5 py-2.5 text-left align-bottom last:border-r-0">
                          <span className="block whitespace-nowrap font-semibold">{column.header}</span>
                          <span
                            className={`mt-1 inline-flex rounded border px-1.5 py-0.5 text-[10px] font-medium ${FIELD_SOURCE_META[column.source].tone}`}
                          >
                            {FIELD_SOURCE_META[column.source].label}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {rows.map((row) => (
                      <tr key={row.id} className="hover:bg-gray-50/70">
                        {salaryColumns.map((column) => (
                          <td key={column.key} className="border-r border-gray-100 px-2.5 py-2 align-middle last:border-r-0">
                            <EntryCell row={row} column={column} onChange={handleEntryChange} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-2.5">
              <p className="text-[11px] text-gray-500">
                Attendance feeds <strong>P. Days</strong>. Allowance cells use a geometry-style driver: enter the monthly basis in the cell,
                while earned value calculates from <strong>basis / Days × P. Days</strong> and exports as a live Excel formula.
              </p>
            </div>
          </div>
        </div>
      ) : null}

        </>
      ) : null}

      {entryPhase === "select" ? (
        <SectionCard title="Next step" className="!shadow-none border border-dashed border-gray-200 bg-gray-50/70">
          <p className="text-sm text-gray-600 text-center py-8 px-2">
            Set <strong>Month</strong>, <strong>Year</strong>, <strong>Company</strong>, <strong>Salary package</strong>, and{" "}
            <strong>Site / unit</strong>, then click <strong>Generate</strong> to open the three salary input panels.
          </p>
        </SectionCard>
      ) : null}
    </div>
  );
}

export function PayrollYearPage() {
  const yNow = new Date().getFullYear();
  const [year, setYear] = useState(yNow);
  const [company, setCompany] = useState("IFSPL / IEVPL");
  const [site, setSite] = useState("All sites");
  const [selectedPackageId, setSelectedPackageId] = useState(() => {
    try {
      return window.localStorage.getItem(PAYROLL_ENTRY_SELECTED_PACKAGE_KEY) || "standard-full";
    } catch {
      return "standard-full";
    }
  });

  const packagesStateYear = loadPayrollPackages();
  const activePkgYear = getPackageById(packagesStateYear, selectedPackageId);
  const yKeysSig = (activePkgYear?.selectedKeys || []).join("|");
  const yearExportColumnKeys = useMemo(
    () => resolvePayrollPackageColumnKeys(activePkgYear?.selectedKeys || []),
    [activePkgYear?.id, yKeysSig],
  );

  useEffect(() => {
    try {
      const st = loadPayrollPackages();
      if (!st.packages.some((p) => String(p.id) === String(selectedPackageId))) {
        setSelectedPackageId(st.packages[0]?.id || "standard-full");
      }
    } catch {
      /* ignore */
    }
  }, [selectedPackageId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(PAYROLL_ENTRY_SELECTED_PACKAGE_KEY, String(selectedPackageId));
    } catch {
      /* ignore */
    }
  }, [selectedPackageId]);

  const months = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const { label, days } = monthMeta(year, month);
      return { month, label, days };
    });
  }, [year]);

  return (
    <div className="space-y-4">
      <SectionCard title="Year-wise entry sheets" right={<Badge tone="bg-sky-50 text-sky-900">12 workbooks</Badge>}>
        <FilterBar>
          <label className="flex flex-col gap-0.5 text-[11px] text-gray-600">
            Year
            <TinySelect value={String(year)} onChange={(e) => setYear(Number(e.target.value))} className="min-w-[100px]">
              {[yNow - 1, yNow, yNow + 1].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </TinySelect>
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] text-gray-600 min-w-[140px]">
            Company
            <TinySelect value={company} onChange={(e) => setCompany(e.target.value)} className="w-full">
              <option>IFSPL / IEVPL</option>
              <option>IFSPL</option>
              <option>IEVPL</option>
            </TinySelect>
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] text-gray-600 min-w-[180px]">
            Salary package
            <TinySelect
              value={String(selectedPackageId)}
              onChange={(e) => setSelectedPackageId(e.target.value)}
              className="w-full min-w-[180px]"
            >
              {packagesStateYear.packages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </TinySelect>
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] text-gray-600 min-w-[140px]">
            Site / unit
            <TinySelect value={site} onChange={(e) => setSite(e.target.value)} className="w-full">
              <option>All sites</option>
              <option>IFSPL FACTORY</option>
              <option>HO - Pune</option>
              <option>Plant Alpha</option>
            </TinySelect>
          </label>
        </FilterBar>
        <p className="text-[11px] text-gray-500 mt-2">
          Each row downloads the entry-sheet for that month using the selected formula package ({yearExportColumnKeys.length} columns).
        </p>
      </SectionCard>

      <SectionCard title="Months">
        <DenseTable
          rowKey="label"
          columns={[
            { key: "label", label: "Month" },
            { key: "days", label: "Days", render: (r) => String(r.days) },
            {
              key: "_download",
              label: "",
              render: (r) => (
                <button
                  type="button"
                  className="text-[11px] text-blue-700 font-medium"
                  onClick={() => {
                    const employees = filterEmployeesForPayroll({ employees: mockEmployees, company, site });
                    const entryRows = buildPayrollEntryRows({
                      employees,
                      seedMarks: buildPeriodAttendanceMarks(employees, year, r.month),
                      daysInMonth: r.days,
                    });
                    exportEntryXlsx({
                      year,
                      month: r.month,
                      company,
                      site,
                      rows: entryRows,
                      columnKeys: yearExportColumnKeys,
                    });
                  }}
                >
                  Download .xlsx
                </button>
              ),
            },
          ]}
          rows={months}
        />
      </SectionCard>
    </div>
  );
}
