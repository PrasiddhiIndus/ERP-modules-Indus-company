import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SectionCard, KpiTile, Badge, FilterBar, TinySelect, DenseTable, LinkedChip } from "../components/AdminUi";
import { mockEmployees } from "../data/mockAdminData";
import {
  PAYROLL_ENTRY_COLUMNS,
  buildPayrollEntryWorkbook,
  downloadAttendanceWorkbook,
  monthMeta,
} from "./attendanceSheetExcel";

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

function exportEntryXlsx({ year, month, company, site, rows }) {
  const wb = buildPayrollEntryWorkbook({ year, month, company, site, rows });
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
          <li>Lock attendance corrections in Attendance Inputs for the payroll period.</li>
          <li>Review the prefilled entry sheet: attendance days are pulled in, formulas calculate pay, and entry fields stay editable.</li>
          <li>Compliance uses the same file or downstream exports from Accounts.</li>
        </ol>
        <div className="mt-3 flex flex-wrap gap-2">
          <LinkedChip label="Attendance Inputs" toHint="Corrections before lock" />
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

  return (
    <div className="space-y-4">
      <SectionCard title="Payroll entry tab" right={<Badge tone="bg-emerald-50 text-emerald-900">Prefilled Excel-style sheet</Badge>}>
        <FilterBar>
          <label className="flex flex-col gap-0.5 text-[11px] text-gray-600">
            Month
            <TinySelect value={String(selectedMonth)} onChange={(e) => setSelectedMonth(Number(e.target.value))} className="min-w-[130px]">
              {MONTH_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </TinySelect>
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] text-gray-600">
            Year
            <TinySelect value={String(selectedYear)} onChange={(e) => setSelectedYear(Number(e.target.value))} className="min-w-[100px]">
              {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((option) => (
                <option key={option} value={option}>
                  {option}
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
          <label className="flex flex-col gap-0.5 text-[11px] text-gray-600 min-w-[140px]">
            Site / unit
            <TinySelect value={site} onChange={(e) => setSite(e.target.value)} className="w-full">
              <option>All sites</option>
              <option>IFSPL FACTORY</option>
              <option>HO - Pune</option>
              <option>Plant Alpha</option>
            </TinySelect>
          </label>
          <div className="flex flex-col gap-0.5 text-[11px] text-gray-600">
            <span className="invisible">.</span>
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
                })
              }
            >
              Download entry sheet
            </button>
          </div>
        </FilterBar>
        <p className="text-[11px] text-gray-500 mt-2">
          Period <strong>{meta.label}</strong> - {meta.days} calendar days. The sheet is prefilled from employee master and attendance,
          with manual fields left editable before handoff. Showing <strong>{rows.length}</strong> employee rows for the selected filters.
        </p>
      </SectionCard>

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

      <SectionCard title="Sample workbook field map" right={<Badge tone="bg-gray-100 text-gray-700">Based on Salary sheet sample.xlsx</Badge>}>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-xs">
          {Object.entries(FIELD_SOURCE_META).map(([source, sourceInfo]) => (
            <div key={source} className={`rounded-lg border px-3 py-2 ${sourceInfo.tone}`}>
              <p className="font-semibold">{sourceInfo.label}</p>
              <p className="mt-1 text-[11px] opacity-80">
                {PAYROLL_ENTRY_COLUMNS.filter((column) => column.source === source)
                  .map((column) => column.header)
                  .join(", ")}
              </p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Salary sheet preview"
        right={<span className="text-[11px] text-gray-500">{rows.length} employees - autosaved - horizontal scroll</span>}
      >
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-[3600px] text-xs">
            <thead className="bg-gray-50 text-gray-700">
              <tr>
                {PAYROLL_ENTRY_COLUMNS.map((column) => (
                  <th key={column.key} className="border-b border-r border-gray-200 px-2 py-2 text-left align-bottom last:border-r-0">
                    <span className="block whitespace-nowrap font-semibold">{column.header}</span>
                    <span className={`mt-1 inline-flex rounded border px-1.5 py-0.5 text-[10px] font-medium ${FIELD_SOURCE_META[column.source].tone}`}>
                      {FIELD_SOURCE_META[column.source].label}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50/70">
                  {PAYROLL_ENTRY_COLUMNS.map((column) => (
                    <td key={column.key} className="border-r border-gray-100 px-2 py-1.5 align-middle last:border-r-0">
                      <EntryCell row={row} column={column} onChange={handleEntryChange} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-gray-500">
          Attendance feeds <strong>P. Days</strong>. Allowance cells use a geometry-style driver: enter the monthly basis in the cell,
          while earned value calculates from <strong>basis / Days x P. Days</strong> and exports as a live Excel formula.
        </p>
      </SectionCard>
    </div>
  );
}

export function PayrollYearPage() {
  const yNow = new Date().getFullYear();
  const [year, setYear] = useState(yNow);
  const [company, setCompany] = useState("IFSPL / IEVPL");
  const [site, setSite] = useState("All sites");

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
        <p className="text-[11px] text-gray-500 mt-2">Each row downloads the entry-sheet structure for that calendar month.</p>
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
