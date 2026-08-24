import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, RefreshCw, Search, Upload, CheckCircle2, AlertTriangle, Lock, Clock, ArrowLeft } from "lucide-react";
import { formatDateDdMmYyyy } from "../../../utils/dateDisplay";
import FormDateInput from "../../../components/FormDateInput";
import {
  PageTaskHeader,
  SectionCard,
  StatusChip,
  Modal,
  CollapsibleHelp,
} from "../components/AdminUi";
import { formatINRPlain } from "./salaryData";
import { departmentInSelection } from "../../../lib/employeeMasterDepartments";
import { RegisterDepartmentFilter } from "../employee/RegisterDepartmentFilter";
import {
  DEFAULT_MONTH_DAYS,
  getMonthRunByKey,
  getMonthRunWithLines,
  monthKey,
  monthLabel,
  processSalaryMonth,
  publishSalarySlipsForMonth,
  recomputeLineFromEdits,
  saveMonthRunEdits,
  PROCESS_MODES,
  fetchSalaryProcessCandidates,
  buildSalaryScopePreviewLines,
  emptyPreviewLineFromEmployee,
  findSavedMonthLine,
  decorateScopeLine,
  workingDaysMonToSat,
  getRunSheetNo,
  getMonthHoldIds,
  setMonthHoldIds,
  saveScopeLineDraft,
  syncScopeDraftBankFromMaster,
  collectRosterIdentityStats,
} from "./salaryMonthProcessing";
import {
  USE_MOCK_SALARY_PROCESSING,
  mockGetMonthRunByKey,
  mockGetMonthRunWithLines,
  mockProcessSalaryMonth,
  mockSaveMonthRunEdits,
  mockFetchSalaryProcessCandidates,
} from "./salaryProcessingMock";
import { exportSalaryProcessingWorkbook } from "../../../lib/salaryProcessingExcel";
import { SalaryBankImportModal } from "./SalaryBankImportModal";
import { toast } from "../../../lib/toast";

const numIn =
  "w-[4.25rem] h-7 px-1 text-right text-[11px] tabular-nums border border-slate-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-accent/30 focus:border-accent";
const textIn =
  "h-7 px-1.5 text-[11px] border border-slate-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-accent/30 focus:border-accent";
const selectIn = "h-7 border border-slate-200 rounded px-1.5 text-[11px] bg-white";
const btnGhost =
  "h-7 px-2.5 text-[11px] font-medium rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50";
const btnPrimary =
  "h-7 px-2.5 text-[11px] font-medium rounded bg-accent text-white disabled:opacity-50 inline-flex items-center gap-1";

function Money({ value, strong = false, blankZero = false }) {
  if (value == null || value === "" || (blankZero && Number(value) === 0)) {
    return <span className="text-slate-300">—</span>;
  }
  return (
    <span className={`tabular-nums ${strong ? "font-semibold text-slate-900" : "text-slate-700"}`}>
      {formatINRPlain(value)}
    </span>
  );
}

/** Blank (—) when unpaid/paid is 0 — no deduction/credit this month. */
function unpaidCellValue(v) {
  if (v == null || v === "" || Number(v) === 0) return null;
  return v;
}

function unpaidInputValue(v) {
  if (v == null || v === "" || Number(v) === 0) return "";
  return v;
}

/** Truncated cell text — full value on hover when clipped. */
function TruncateTip({ text, className = "", empty = "—" }) {
  const raw = text == null || text === "" ? "" : String(text);
  const display = raw || empty;
  return (
    <span className={`block truncate ${className}`} title={raw || undefined}>
      {display}
    </span>
  );
}

/** Compact process-scope sheet (All / Dept / Hold) — same manual + formula columns. */
const SCOPE_HEADERS = [
  "Sr No",
  "Code",
  "Name",
  "Account",
  "IFSC",
  "Desig.",
  "CTC",
  "Status",
  "P.Days",
  "Gross W",
  "PF 12%",
  "ESIC",
  "PT",
  "Loan",
  "Sal Adv",
  "U/P",
  "TDS",
  "Custom−",
  "Tot Ded",
  "Net",
  "Bank",
];

function formatProcessDay(ymd) {
  const raw = String(ymd || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";
  return new Date(`${raw}T12:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function lineIsSalaryLocked(line) {
  return Boolean(line?.salaryLocked || line?.processStatus === "locked");
}

function resolveLineProcessStatus(line) {
  if (line?.onHold || line?.processStatus === "held") return "held";
  if (lineIsSalaryLocked(line)) return "locked";
  if (line?.alreadyProcessed || line?.processStatus === "processed") return "processed";
  if (line?.hasCtc === false || line?.processStatus === "ctc_required") return "ctc_required";
  if (line?.processStatus === "pending") return "pending";
  if (line?.hasCtc) return "pending";
  return "ctc_required";
}

const DETAIL_INPUT =
  "h-8 w-full max-w-[9.5rem] border border-slate-200 rounded-md bg-white px-2 text-[12px] tabular-nums text-right focus:outline-none focus:ring-1 focus:ring-accent/30 focus:border-accent";
const DETAIL_TEXT_INPUT =
  "h-8 w-full border border-slate-200 rounded-md bg-white px-2 text-[12px] focus:outline-none focus:ring-1 focus:ring-accent/30 focus:border-accent";

function nameInitials(name) {
  const parts = String(name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  const letters = parts.map((p) => p[0]?.toUpperCase() || "").join("");
  return letters || "—";
}

function ProfileFact({ label, children }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-1 text-[13px] text-slate-900 min-w-0">{children}</div>
    </div>
  );
}

function StatementRow({ label, hint, children, strong = false, total = false }) {
  return (
    <div
      className={`grid grid-cols-[1fr_auto] sm:grid-cols-[minmax(0,1fr)_7.5rem_7.5rem] items-center gap-x-3 gap-y-0.5 py-2.5 ${
        total
          ? "border-t border-slate-200 mt-1 pt-3"
          : "border-b border-slate-100"
      }`}
    >
      <div className="min-w-0">
        <p className={`text-[13px] ${strong || total ? "font-semibold text-slate-900" : "text-slate-700"}`}>
          {label}
        </p>
        {hint ? <p className="text-[10px] text-slate-400 mt-0.5">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

function StatementAmt({ children, strong = false, className = "" }) {
  return (
    <div className={`text-right tabular-nums text-[13px] ${strong ? "font-semibold text-slate-900" : "text-slate-800"} ${className}`}>
      {children}
    </div>
  );
}

/** Overview list tabs — all staff / already processed / held. */
const VIEW_TABS = [
  { id: "all", label: "All Employees" },
  { id: "processed", label: "Processed" },
  { id: "held", label: "Held" },
];

function IdentityErrorNote({ errors }) {
  const list = Array.isArray(errors) ? errors.filter(Boolean) : [];
  if (!list.length) return null;
  return (
    <p className="mt-0.5 text-[10px] font-medium text-red-700 leading-snug" title={list.join(" ")}>
      {list[0]}
      {list.length > 1 ? ` · +${list.length - 1}` : ""}
    </p>
  );
}

function ProcessStatusBadge({ status, lockedOn }) {
  if (status === "locked") {
    const day = formatProcessDay(lockedOn);
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-800">
        <Lock className="h-3.5 w-3.5" />
        Locked{day ? ` · ${day}` : ""}
      </span>
    );
  }
  if (status === "processed") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Processed
      </span>
    );
  }
  if (status === "held") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700">
        <Lock className="h-3.5 w-3.5" />
        Held
      </span>
    );
  }
  if (status === "ctc_required") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
        CTC required
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700">
      <Clock className="h-3.5 w-3.5 text-slate-500" />
      Pending processing
    </span>
  );
}

function CtcStatusCell({ hasCtc }) {
  if (hasCtc) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-800">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
        Saved
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700">
      <AlertTriangle className="h-3.5 w-3.5" />
      Missing
    </span>
  );
}

function OverviewProcessTable({
  rows,
  loading,
  emptyHint,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onOpenEmployee,
}) {
  const selectableIds = rows
    .filter((r) => !(r.salaryLocked || r.processStatus === "locked"))
    .map((r) => String(r.id));
  const selectedSet = useMemo(() => new Set((selectedIds || []).map(String)), [selectedIds]);
  const allSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selectedSet.has(id));
  const someSelected =
    !allSelected && selectableIds.some((id) => selectedSet.has(id));

  if (loading) {
    return <p className="text-xs text-slate-500 py-8 text-center">Loading employees…</p>;
  }
  if (!rows.length) {
    return <p className="text-xs text-slate-500 py-8 text-center">{emptyHint}</p>;
  }

  return (
    <div className="w-full overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full min-w-[720px] text-[12px]">
        <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
          <tr>
            <th className="w-10 px-3 py-2.5 text-left">
              <input
                type="checkbox"
                className="rounded border-slate-300"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected;
                }}
                disabled={!selectableIds.length}
                onChange={(e) => onToggleSelectAll?.(e.target.checked)}
                aria-label="Select all employees on this list"
                title="Select all employees on this list"
              />
            </th>
            <th className="text-left font-semibold px-3 py-2.5">Employee</th>
            <th className="text-left font-semibold px-3 py-2.5">Department</th>
            <th className="text-left font-semibold px-3 py-2.5">Site</th>
            <th className="text-left font-semibold px-3 py-2.5">CTC</th>
            <th className="text-right font-semibold px-3 py-2.5">Salary</th>
            <th className="text-left font-semibold px-3 py-2.5">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.map((emp) => {
            const id = String(emp.id);
            const checked = selectedSet.has(id);
            return (
              <tr
                key={id}
                className={`hover:bg-slate-50/80 ${checked ? "bg-accent-soft/30" : ""} ${
                  emp.has_identity_error
                    ? "bg-red-50/70"
                    : emp.salaryLocked || emp.processStatus === "locked"
                      ? "bg-emerald-50"
                      : ""
                }`}
              >
                <td className="px-3 py-2.5 align-middle">
                  <input
                    type="checkbox"
                    className="rounded border-slate-300"
                    checked={checked}
                    disabled={emp.salaryLocked || emp.processStatus === "locked"}
                    onChange={() => onToggleSelect?.(emp.id)}
                    aria-label={`Select ${emp.full_name || emp.employee_code}`}
                  />
                </td>
                <td className="px-3 py-2.5 align-middle min-w-[12rem]">
                  <button
                    type="button"
                    className="text-left group"
                    onClick={() => onOpenEmployee?.(emp)}
                  >
                    <span className="block font-medium text-slate-900 group-hover:text-accent">
                      {emp.full_name || "—"}
                    </span>
                    <span className="block font-mono text-[10px] text-slate-500 mt-0.5">
                      {emp.employee_code || emp.employee_id || "—"}
                    </span>
                    <IdentityErrorNote errors={emp.identityErrors} />
                  </button>
                </td>
                <td className="px-3 py-2.5 align-middle text-slate-700">{emp.department || "—"}</td>
                <td className="px-3 py-2.5 align-middle text-slate-600">{emp.location || "—"}</td>
                <td className="px-3 py-2.5 align-middle">
                  <CtcStatusCell hasCtc={emp.hasCtc} />
                </td>
                <td className="px-3 py-2.5 align-middle text-right tabular-nums text-slate-800">
                  {emp.hasCtc && emp.ctc_monthly != null ? (
                    <span>₹{formatINRPlain(emp.ctc_monthly)}</span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5 align-middle">
                  <ProcessStatusBadge status={emp.processStatus} lockedOn={emp.lockedOn} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EmployeeSalaryDetailPage({
  line,
  monthLabelText,
  monthDays,
  onBack,
  onUpdate,
  onSave,
  dirty = false,
  saving = false,
  readOnly = false,
}) {
  if (!line) return null;
  const locked = Boolean(readOnly || lineIsSalaryLocked(line));
  const patch = (p) => {
    if (locked) return;
    onUpdate(line.id, p);
  };
  const status = resolveLineProcessStatus(line);
  const lockedDay = formatProcessDay(line.lockedOn);
  const detailInput = locked
    ? `${DETAIL_INPUT} bg-slate-50 text-slate-700 cursor-default`
    : DETAIL_INPUT;
  const detailText = locked
    ? `${DETAIL_TEXT_INPUT} bg-slate-50 text-slate-700 cursor-default`
    : DETAIL_TEXT_INPUT;
  const customEarnTitle = Array.isArray(line.computed_json?.custom_components)
    ? line.computed_json.custom_components
        .filter((c) => c.kind === "earning")
        .map((c) => `${c.code}: ${c.amount}`)
        .join(", ") || "Person components (earn)"
    : "Person components (earn)";
  const customDedTitle = Array.isArray(line.computed_json?.custom_components)
    ? line.computed_json.custom_components
        .filter((c) => c.kind === "deduction")
        .map((c) => `${c.code}: ${c.amount}`)
        .join(", ") || "Person components (deduct)"
    : "Person components (deduct)";

  return (
    <div className="space-y-4 max-w-[1120px] w-full mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button
          type="button"
          className={`${btnGhost} inline-flex items-center gap-1.5`}
          onClick={() => {
            if (dirty && !window.confirm("Discard unsaved changes?")) return;
            onBack();
          }}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to list
        </button>
        <div className="flex flex-wrap items-center gap-2">
          {locked ? (
            <StatusChip
              label={lockedDay ? `Locked · ${lockedDay}` : "Locked · view only"}
              severity="info"
            />
          ) : dirty ? (
            <StatusChip label="Unsaved" severity="warning" />
          ) : null}
          {locked ? null : (
            <button
              type="button"
              className={btnPrimary}
              disabled={saving || !dirty}
              onClick={() => onSave?.(line)}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          )}
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        <div className="px-4 sm:px-5 py-4 flex flex-wrap items-center gap-4 bg-slate-50/80 border-b border-slate-200">
          <div
            className="h-14 w-14 rounded-full bg-accent/15 text-accent flex items-center justify-center text-[15px] font-semibold shrink-0"
            aria-hidden
          >
            {nameInitials(line.employee_name)}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-[18px] font-semibold text-slate-900 leading-tight truncate">
              {line.employee_name || "Employee"}
            </h1>
            <p className="text-[12px] text-slate-500 mt-0.5">
              <span className="font-mono text-slate-700">{line.employee_code || "—"}</span>
              <span className="mx-1.5 text-slate-300">·</span>
              {line.designation || "—"}
              {line.department ? (
                <>
                  <span className="mx-1.5 text-slate-300">·</span>
                  {line.department}
                </>
              ) : null}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              Salary for {monthLabelText} · {monthDays} days
            </p>
            {locked ? (
              <p className="text-[11px] text-emerald-800 mt-1">
                Locked for this month{lockedDay ? ` on ${lockedDay}` : ""}. View only — no changes.
              </p>
            ) : null}
            {Array.isArray(line.identityErrors) && line.identityErrors.length ? (
              <p className="text-[11px] text-red-700 mt-1">{line.identityErrors.join(" ")}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <CtcStatusCell hasCtc={Boolean(line.hasCtc ?? line.declared)} />
            <ProcessStatusBadge status={status} lockedOn={line.lockedOn} />
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-slate-100">
          <div className="px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Gross wages</p>
            <p className="mt-1 text-[16px] font-semibold tabular-nums text-slate-900">
              <Money value={line.gross_wages} strong />
            </p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Deductions</p>
            <p className="mt-1 text-[16px] font-semibold tabular-nums text-slate-900">
              <Money value={line.total_ded} strong />
            </p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Net salary</p>
            <p className="mt-1 text-[16px] font-semibold tabular-nums text-emerald-800">
              <Money value={line.net_salary} strong />
            </p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Credit to bank</p>
            <p className="mt-1 text-[16px] font-semibold tabular-nums text-slate-900">
              <Money value={line.bank_amount} strong />
            </p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
          <h2 className="text-[13px] font-semibold text-slate-900 mb-3">Identity &amp; bank</h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <ProfileFact label="Employee code">
              <span className="font-mono text-[12px]">{line.employee_code || "—"}</span>
            </ProfileFact>
            <ProfileFact label="Employee ID">
              <span className="font-mono text-[12px]">{line.employee_id || "—"}</span>
            </ProfileFact>
            <ProfileFact label="Designation">{line.designation || "—"}</ProfileFact>
            <ProfileFact label="Date of joining">
              {line.date_of_joining ? formatDateDdMmYyyy(line.date_of_joining) : "—"}
            </ProfileFact>
            <ProfileFact label="Confirmation">
              <FormDateInput
                compact
                className="h-8 text-[12px] w-full"
                value={line.confirmation_date ? String(line.confirmation_date).slice(0, 10) : ""}
                onChange={(e) => patch({ confirmation_date: e?.target?.value || null })}
                disabled={locked}
                readOnly={locked}
              />
            </ProfileFact>
            <ProfileFact label="Account number">
              <input
                className={detailText}
                value={line.account_no || ""}
                onChange={(e) => patch({ account_no: e.target.value })}
                disabled={locked}
                readOnly={locked}
              />
            </ProfileFact>
            <ProfileFact label="IFSC">
              <input
                className={detailText}
                value={line.ifsc || ""}
                onChange={(e) => patch({ ifsc: e.target.value })}
                disabled={locked}
                readOnly={locked}
              />
            </ProfileFact>
            <ProfileFact label="UAN">
              <span className="font-mono text-[12px]">{line.uan_no || "—"}</span>
            </ProfileFact>
            <ProfileFact label="ESIC number">
              <span className="text-[12px]">{line.esic_no || "—"}</span>
            </ProfileFact>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
          <h2 className="text-[13px] font-semibold text-slate-900 mb-3">This month</h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <ProfileFact label="Salary rate (gross)">
              <Money value={line.salary_rate} strong />
            </ProfileFact>
            <ProfileFact label="Present days">
              <input
                type="number"
                step="0.5"
                className={`${detailInput} max-w-none`}
                value={line.present_days ?? ""}
                placeholder="—"
                onChange={(e) => patch({ present_days: e.target.value })}
                disabled={locked}
                readOnly={locked}
              />
            </ProfileFact>
            <ProfileFact label="PF basic">
              <input
                type="number"
                className={`${detailInput} max-w-none`}
                value={line.pf_basic ?? ""}
                onChange={(e) => patch({ pf_basic: e.target.value })}
                disabled={locked}
                readOnly={locked}
              />
            </ProfileFact>
            <ProfileFact label="Month days">
              <span className="tabular-nums">{monthDays}</span>
            </ProfileFact>
          </div>
          <p className="text-[11px] text-slate-500 mt-4">
            {locked
              ? "This salary is locked for the month. Amounts cannot be changed."
              : "Present days come from the attendance register. Change them only if this month needs a correction before processing."}
          </p>
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
          <div className="flex items-end justify-between gap-2 mb-1">
            <h2 className="text-[13px] font-semibold text-slate-900">Earnings</h2>
            <p className="hidden sm:block text-[10px] uppercase tracking-wide text-slate-400">
              Full rate · This month
            </p>
          </div>
          <StatementRow label="Basic" hint="Monthly basic">
            <StatementAmt className="hidden sm:block">
              <Money value={line.basic_full} />
            </StatementAmt>
            <StatementAmt>
              <Money value={line.basic_earned} />
            </StatementAmt>
          </StatementRow>
          <StatementRow label="HRA">
            <StatementAmt className="hidden sm:block">
              <Money value={line.hra_full} />
            </StatementAmt>
            <StatementAmt>
              <Money value={line.hra_earned} />
            </StatementAmt>
          </StatementRow>
          <StatementRow label="Special allowance">
            <StatementAmt className="hidden sm:block">
              <Money value={line.special_full} />
            </StatementAmt>
            <StatementAmt>
              <Money value={line.special_allowance} />
            </StatementAmt>
          </StatementRow>
          <StatementRow label="PF earned basic" hint="From PF basic × days">
            <StatementAmt className="hidden sm:block">
              <Money value={line.pf_basic} />
            </StatementAmt>
            <StatementAmt>
              <Money value={line.pf_earned_basic} />
            </StatementAmt>
          </StatementRow>
          <StatementRow label="Custom earnings" hint={customEarnTitle}>
            <StatementAmt className="hidden sm:block">
              <input
                type="number"
                className={detailInput}
                title={customEarnTitle}
                value={line.custom_earn_full ?? line.computed_json?.custom_earn_full ?? 0}
                onChange={(e) =>
                  patch({
                    custom_earn_full: e.target.value,
                    computed_json: {
                      ...(line.computed_json || {}),
                      custom_earn_full: e.target.value,
                    },
                  })
                }
                disabled={locked}
                readOnly={locked}
              />
            </StatementAmt>
            <StatementAmt>
              <Money value={line.custom_earn} />
            </StatementAmt>
          </StatementRow>
          <StatementRow label="Gross wages" total strong>
            <StatementAmt className="hidden sm:block">
              <Money value={line.salary_rate} />
            </StatementAmt>
            <StatementAmt strong>
              <Money value={line.gross_wages} strong />
            </StatementAmt>
          </StatementRow>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
          <div className="flex items-end justify-between gap-2 mb-1">
            <h2 className="text-[13px] font-semibold text-slate-900">Deductions &amp; net</h2>
            <p className="hidden sm:block text-[10px] uppercase tracking-wide text-slate-400">
              This month
            </p>
          </div>
          <StatementRow label="PF 12%">
            <span className="hidden sm:block" />
            <StatementAmt>
              <Money value={line.emp_pf} />
            </StatementAmt>
          </StatementRow>
          <StatementRow label="ESIC">
            <span className="hidden sm:block" />
            <StatementAmt>
              <Money value={line.emp_esic} />
            </StatementAmt>
          </StatementRow>
          <StatementRow label="Professional tax">
            <span className="hidden sm:block" />
            <StatementAmt>
              <input
                type="number"
                className={detailInput}
                value={line.pt_amount ?? ""}
                onChange={(e) => patch({ pt_amount: e.target.value })}
                disabled={locked}
                readOnly={locked}
              />
            </StatementAmt>
          </StatementRow>
          <StatementRow label="Loan">
            <span className="hidden sm:block" />
            <StatementAmt>
              <input
                type="number"
                className={detailInput}
                value={line.loan ?? 0}
                onChange={(e) => patch({ loan: e.target.value })}
                disabled={locked}
                readOnly={locked}
              />
            </StatementAmt>
          </StatementRow>
          <StatementRow label="Salary advance">
            <span className="hidden sm:block" />
            <StatementAmt>
              <input
                type="number"
                className={detailInput}
                value={line.sal_adv ?? 0}
                onChange={(e) => patch({ sal_adv: e.target.value })}
                disabled={locked}
                readOnly={locked}
              />
            </StatementAmt>
          </StatementRow>
          <StatementRow label="Unpaid / paid" hint="Leave unpaid or extra paid days">
            <span className="hidden sm:block" />
            <StatementAmt>
              <input
                type="number"
                className={detailInput}
                placeholder="—"
                value={unpaidInputValue(line.unpaid_paid)}
                onChange={(e) => patch({ unpaid_paid: e.target.value === "" ? 0 : e.target.value })}
                disabled={locked}
                readOnly={locked}
              />
            </StatementAmt>
          </StatementRow>
          <StatementRow label="TDS">
            <span className="hidden sm:block" />
            <StatementAmt>
              <input
                type="number"
                className={detailInput}
                value={line.tds ?? 0}
                onChange={(e) => patch({ tds: e.target.value })}
                disabled={locked}
                readOnly={locked}
              />
            </StatementAmt>
          </StatementRow>
          <StatementRow label="Custom deductions" hint={customDedTitle}>
            <span className="hidden sm:block" />
            <StatementAmt>
              <input
                type="number"
                className={detailInput}
                title={customDedTitle}
                value={line.custom_ded_full ?? line.computed_json?.custom_ded_full ?? 0}
                onChange={(e) =>
                  patch({
                    custom_ded_full: e.target.value,
                    computed_json: {
                      ...(line.computed_json || {}),
                      custom_ded_full: e.target.value,
                    },
                  })
                }
                disabled={locked}
                readOnly={locked}
              />
            </StatementAmt>
          </StatementRow>
          <StatementRow label="Total deductions" total>
            <span className="hidden sm:block" />
            <StatementAmt strong>
              <Money value={line.total_ded} strong />
            </StatementAmt>
          </StatementRow>
          <StatementRow label="Net salary" strong>
            <span className="hidden sm:block" />
            <StatementAmt strong>
              <Money value={line.net_salary} strong />
            </StatementAmt>
          </StatementRow>
          <StatementRow label="Credit to bank" strong>
            <span className="hidden sm:block" />
            <StatementAmt strong>
              <Money value={line.bank_amount} strong />
            </StatementAmt>
          </StatementRow>
        </section>
      </div>
    </div>
  );
}

function ScopeSalarySheetTable({
  lines,
  loading,
  emptyHint,
  onUpdateLine,
  onOpenEmployee,
  selectedIds = [],
  onToggleSelect,
  onToggleSelectAll,
  readOnly = false,
  showSelect = true,
}) {
  const selectableIds = lines
    .filter((l) => !lineIsSalaryLocked(l))
    .map((l) => String(l.employee_master_id || ""))
    .filter(Boolean);
  const selectedSet = new Set((selectedIds || []).map(String));
  const allSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selectedSet.has(id));
  const someSelected =
    !allSelected && selectableIds.some((id) => selectedSet.has(id));
  const colCount = SCOPE_HEADERS.length + (showSelect ? 1 : 0);

  return (
    <div className="overflow-auto rounded-lg border border-slate-200 max-h-[min(42rem,70vh)] shadow-sm">
      <table className="min-w-[1420px] w-full border-collapse text-[11px]">
        <thead className="sticky top-0 z-10 bg-slate-100">
          <tr>
            {showSelect ? (
              <th className="w-9 px-2 py-2.5 border-b border-slate-200 bg-slate-100">
                <input
                  type="checkbox"
                  className="rounded border-slate-300"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  disabled={!selectableIds.length}
                  onChange={() => onToggleSelectAll?.(!allSelected)}
                  aria-label="Select all employees on this list"
                  title="Select all employees on this list"
                  onClick={(e) => e.stopPropagation()}
                />
              </th>
            ) : null}
            {SCOPE_HEADERS.map((h) => (
              <th
                key={h}
                className={`px-2 py-2.5 text-[10px] font-bold uppercase tracking-wide text-slate-700 border-b border-slate-200 whitespace-nowrap bg-slate-100 ${
                  ["Gross W", "PF 12%", "ESIC", "PT", "Loan", "Sal Adv", "U/P", "TDS", "Custom−", "Tot Ded", "Net", "Bank"].includes(
                    h
                  )
                    ? "text-right"
                    : "text-left"
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading && !lines.length ? (
            <tr>
              <td colSpan={colCount} className="px-3 py-6 text-center text-xs text-slate-500">
                Building sheet preview…
              </td>
            </tr>
          ) : !lines.length ? (
            <tr>
              <td colSpan={colCount} className="px-3 py-6 text-center text-xs text-slate-500">
                {emptyHint || "No employees in this view."}
              </td>
            </tr>
          ) : (
            lines.map((line, idx) => {
              const empKey = String(line.employee_master_id);
              const checked = selectedIds.some((id) => String(id) === empKey);
              const rowLocked = lineIsSalaryLocked(line);
              const rowReadOnly = readOnly || rowLocked;
              return (
              <tr
                key={line.id}
                role={onOpenEmployee ? "button" : undefined}
                tabIndex={onOpenEmployee ? 0 : undefined}
                onClick={() => onOpenEmployee?.(line)}
                onKeyDown={(e) => {
                  if (!onOpenEmployee) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpenEmployee(line);
                  }
                }}
                className={[
                  line.has_identity_error
                    ? "bg-red-50/80"
                    : rowLocked
                      ? "bg-emerald-50"
                      : "bg-white hover:bg-slate-50/80",
                  checked && !rowLocked ? "bg-amber-50/50" : "",
                  onOpenEmployee ? "cursor-pointer" : "",
                ].join(" ")}
              >
                {showSelect ? (
                  <td
                    className="px-1.5 py-1 border-b border-slate-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      className="rounded border-slate-300"
                      checked={checked}
                      disabled={rowLocked}
                      onChange={() => onToggleSelect?.(empKey)}
                      aria-label={`Select ${line.employee_name || empKey}`}
                    />
                  </td>
                ) : null}
                <td className="px-1.5 py-1 text-[11px] tabular-nums border-b border-slate-100">{idx + 1}</td>
                <td className="px-1.5 py-1 text-[11px] font-mono border-b border-slate-100 max-w-[5.5rem]">
                  <TruncateTip text={line.employee_code} className="font-mono" />
                </td>
                <td className="px-1.5 py-1 text-[11px] border-b border-slate-100 max-w-[8.5rem]">
                  <TruncateTip text={line.employee_name} />
                  <IdentityErrorNote errors={line.identityErrors} />
                </td>
                <td
                  className="px-0.5 py-0.5 border-b border-slate-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  {rowReadOnly ? (
                    <span className="px-1.5 text-[11px] font-mono block truncate max-w-[7.5rem]" title={line.account_no || undefined}>
                      {line.account_no || "—"}
                    </span>
                  ) : (
                    <input
                      className={`${textIn} w-[7.5rem]`}
                      value={line.account_no || ""}
                      title={line.account_no || undefined}
                      onChange={(e) => onUpdateLine(line.id, { account_no: e.target.value })}
                    />
                  )}
                </td>
                <td
                  className="px-0.5 py-0.5 border-b border-slate-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  {rowReadOnly ? (
                    <span className="px-1.5 text-[11px] font-mono block truncate max-w-[5.75rem]" title={line.ifsc || undefined}>
                      {line.ifsc || "—"}
                    </span>
                  ) : (
                    <input
                      className={`${textIn} w-[5.75rem]`}
                      value={line.ifsc || ""}
                      title={line.ifsc || undefined}
                      onChange={(e) => onUpdateLine(line.id, { ifsc: e.target.value })}
                    />
                  )}
                </td>
                <td className="px-1.5 py-1 text-[11px] border-b border-slate-100 max-w-[6rem]">
                  <TruncateTip text={line.designation} />
                </td>
                <td className="px-1.5 py-1 border-b border-slate-100 whitespace-nowrap">
                  <CtcStatusCell hasCtc={Boolean(line.hasCtc ?? line.declared)} />
                </td>
                <td className="px-1.5 py-1 border-b border-slate-100 whitespace-nowrap">
                  <ProcessStatusBadge status={resolveLineProcessStatus(line)} lockedOn={line.lockedOn} />
                </td>
                <td
                  className="px-0.5 py-0.5 border-b border-slate-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  {rowReadOnly ? (
                    <span className="px-1.5 text-[11px] tabular-nums">{line.present_days ?? "—"}</span>
                  ) : (
                    <input
                      type="number"
                      step="0.5"
                      className={numIn}
                      value={line.present_days ?? ""}
                      placeholder="—"
                      onChange={(e) => onUpdateLine(line.id, { present_days: e.target.value })}
                    />
                  )}
                </td>
                <td className="px-1.5 py-1 text-[11px] text-right border-b border-slate-100">
                  <Money value={line.gross_wages} strong />
                </td>
                <td className="px-1.5 py-1 text-[11px] text-right border-b border-slate-100">
                  <Money value={line.emp_pf} />
                </td>
                <td className="px-1.5 py-1 text-[11px] text-right border-b border-slate-100">
                  <Money value={line.emp_esic} />
                </td>
                <td
                  className="px-0.5 py-0.5 border-b border-slate-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  {rowReadOnly ? (
                    <span className="px-1.5 text-[11px] tabular-nums">
                      <Money value={line.pt_amount} />
                    </span>
                  ) : (
                    <input
                      type="number"
                      className={numIn}
                      value={line.pt_amount ?? ""}
                      onChange={(e) => onUpdateLine(line.id, { pt_amount: e.target.value })}
                    />
                  )}
                </td>
                <td
                  className="px-0.5 py-0.5 border-b border-slate-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  {rowReadOnly ? (
                    <Money value={line.loan} />
                  ) : (
                    <input
                      type="number"
                      className={numIn}
                      value={line.loan ?? 0}
                      onChange={(e) => onUpdateLine(line.id, { loan: e.target.value })}
                    />
                  )}
                </td>
                <td
                  className="px-0.5 py-0.5 border-b border-slate-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  {rowReadOnly ? (
                    <Money value={line.sal_adv} />
                  ) : (
                    <input
                      type="number"
                      className={numIn}
                      value={line.sal_adv ?? 0}
                      onChange={(e) => onUpdateLine(line.id, { sal_adv: e.target.value })}
                    />
                  )}
                </td>
                <td
                  className="px-0.5 py-0.5 border-b border-slate-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  {rowReadOnly ? (
                    <Money value={unpaidCellValue(line.unpaid_paid)} />
                  ) : (
                    <input
                      type="number"
                      className={numIn}
                      value={unpaidInputValue(line.unpaid_paid)}
                      placeholder="—"
                      onChange={(e) =>
                        onUpdateLine(line.id, {
                          unpaid_paid: e.target.value === "" ? 0 : e.target.value,
                        })
                      }
                    />
                  )}
                </td>
                <td
                  className="px-0.5 py-0.5 border-b border-slate-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  {rowReadOnly ? (
                    <Money value={line.tds} />
                  ) : (
                    <input
                      type="number"
                      className={numIn}
                      value={line.tds ?? 0}
                      onChange={(e) => onUpdateLine(line.id, { tds: e.target.value })}
                    />
                  )}
                </td>
                <td
                  className="px-0.5 py-0.5 border-b border-slate-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  {rowReadOnly ? (
                    <Money value={line.custom_ded_full ?? line.computed_json?.custom_ded_full} />
                  ) : (
                    <input
                      type="number"
                      className={numIn}
                      value={line.custom_ded_full ?? line.computed_json?.custom_ded_full ?? 0}
                      onChange={(e) =>
                        onUpdateLine(line.id, {
                          custom_ded_full: e.target.value,
                          computed_json: {
                            ...(line.computed_json || {}),
                            custom_ded_full: e.target.value,
                          },
                        })
                      }
                    />
                  )}
                </td>
                <td className="px-1.5 py-1 text-[11px] text-right border-b border-slate-100">
                  <Money value={line.total_ded} />
                </td>
                <td className="px-1.5 py-1 text-[11px] text-right border-b border-slate-100">
                  <Money value={line.net_salary} strong />
                </td>
                <td className="px-1.5 py-1 text-[11px] text-right border-b border-slate-100">
                  <Money value={line.bank_amount} strong />
                </td>
              </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

function previousPayYearMonth() {
  const d = new Date();
  // Salary for a month is normally run at the start of the next month
  // (Aug processing → July pay month / July register P.Days).
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function hasLoadedPresentDays(line) {
  return line?.present_days != null && line.present_days !== "";
}

function overlayLoadedPresentDays(built, prev, payKey) {
  const prevById = new Map();
  for (const row of prev || []) {
    const id = String(row.employee_master_id || "");
    if (id) prevById.set(id, row);
  }
  return (built || []).map((line) => {
    if (hasLoadedPresentDays(line)) return line;
    const prevRow = prevById.get(String(line.employee_master_id));
    if (prevRow?.pay_month_key === payKey && hasLoadedPresentDays(prevRow)) {
      return { ...line, present_days: prevRow.present_days };
    }
    return line;
  });
}

/** Keep existing P.Days for the same month so the grid does not flash 0 then refill. */
function mergeScopePlaceholders(employeesForSheet, { prev, savedMonthLines, monthDays, payKey }) {
  const identityStats = collectRosterIdentityStats(employeesForSheet);
  const prevById = new Map();
  for (const row of prev || []) {
    const id = String(row.employee_master_id || "");
    if (id) prevById.set(id, row);
  }
  return employeesForSheet.map((e) => {
    const prevRow = prevById.get(String(e.id));
    const sameMonth = Boolean(prevRow && prevRow.pay_month_key === payKey);
    if (sameMonth && hasLoadedPresentDays(prevRow)) {
      return decorateScopeLine(
        { ...prevRow, total_days: monthDays, pay_month_key: payKey },
        e,
        { pay_month_key: payKey, identityStats }
      );
    }
    const saved = findSavedMonthLine(savedMonthLines, e);
    if (saved && (!saved.pay_month_key || saved.pay_month_key === payKey)) {
      return decorateScopeLine(
        {
          ...saved,
          id: saved.id || `preview_${e.id}`,
          pay_month_key: payKey,
        },
        e,
        {
          alreadyProcessed: true,
          hasCtc: Boolean(e.hasCtc) || Number(saved.salary_rate) > 0,
          pay_month_key: payKey,
          identityStats,
        }
      );
    }
    return decorateScopeLine(
      {
        ...emptyPreviewLineFromEmployee(e, monthDays),
        pay_month_key: payKey,
        present_days: sameMonth ? prevRow.present_days : null,
      },
      e,
      { pay_month_key: payKey, identityStats }
    );
  });
}

const api = {
  getByKey: (key) =>
    USE_MOCK_SALARY_PROCESSING ? Promise.resolve(mockGetMonthRunByKey(key)) : getMonthRunByKey(key),
  getWithLines: (id) =>
    USE_MOCK_SALARY_PROCESSING
      ? Promise.resolve(mockGetMonthRunWithLines(id))
      : getMonthRunWithLines(id),
  process: (args) =>
    USE_MOCK_SALARY_PROCESSING
      ? Promise.resolve(mockProcessSalaryMonth(args))
      : processSalaryMonth(args),
  publishSlips: (args) =>
    USE_MOCK_SALARY_PROCESSING
      ? Promise.resolve(publishSalarySlipsForMonth(args))
      : publishSalarySlipsForMonth(args),
  save: (id, lines) =>
    USE_MOCK_SALARY_PROCESSING ? mockSaveMonthRunEdits(id, lines) : saveMonthRunEdits(id, lines),
  fetchCandidates: (args) =>
    USE_MOCK_SALARY_PROCESSING
      ? mockFetchSalaryProcessCandidates(args)
      : fetchSalaryProcessCandidates(args),
};

export default function SalaryProcessing() {
  const now = previousPayYearMonth();
  const [year, setYear] = useState(now.year);
  const [month, setMonth] = useState(now.month);
  const [monthDays, setMonthDays] = useState(() => workingDaysMonToSat(now.year, now.month));
  const [tableSearch, setTableSearch] = useState("");
  const [exporting, setExporting] = useState(false);
  const [viewTab, setViewTab] = useState("all");
  const [listView, setListView] = useState("sheet"); // sheet | overview
  const [filterCtc, setFilterCtc] = useState("all"); // all | ready | missing
  const [processMode, setProcessMode] = useState(PROCESS_MODES.BULK);
  const [selectedDepartments, setSelectedDepartments] = useState([]);
  const [holdIds, setHoldIds] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [scopeLines, setScopeLines] = useState([]);
  const [scopeLinesLoading, setScopeLinesLoading] = useState(false);
  const [savedMonthLines, setSavedMonthLines] = useState([]);
  const [sheetRefreshAt, setSheetRefreshAt] = useState(0);
  const [detailLineId, setDetailLineId] = useState(null);
  const [detailDirty, setDetailDirty] = useState(false);
  const [detailSaving, setDetailSaving] = useState(false);
  const [candidates, setCandidates] = useState({
    employees: [],
    departments: [],
    departmentStats: {},
    existingRun: null,
  });
  const [candidatesLoading, setCandidatesLoading] = useState(false);

  const [busy, setBusy] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [existingRun, setExistingRun] = useState(null);
  const [bankImportOpen, setBankImportOpen] = useState(false);

  const [editorOpen, setEditorOpen] = useState(false);
  const [run, setRun] = useState(null);
  const [lines, setLines] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);

  const years = useMemo(() => {
    const y = now.year;
    return [y, y - 1, y - 2, y - 3];
  }, [now.year]);

  const loadGenRef = useRef(0);

  const loadCandidates = useCallback(async () => {
    const gen = ++loadGenRef.current;
    const payKey = monthKey(year, month);
    setCandidatesLoading(true);
    try {
      const data = await api.fetchCandidates({ year, month });
      if (gen !== loadGenRef.current) return;
      if (data?.monthKey && data.monthKey !== payKey) return;
      setCandidates(data);
      const holds = Array.isArray(data.holdIds)
        ? data.holdIds.map(String)
        : getMonthHoldIds(payKey);
      setHoldIds(holds);
      setSelectedDepartments((prev) =>
        prev.filter((d) =>
          (data.departments || []).some((listed) => departmentInSelection(listed, [d]))
        )
      );
    } catch (err) {
      console.warn("Salary process candidates load failed", err);
      if (gen !== loadGenRef.current) return;
      setCandidates({
        employees: [],
        departments: [],
        departmentStats: {},
        existingRun: null,
        monthKey: payKey,
      });
      setHoldIds(getMonthHoldIds(payKey));
    } finally {
      if (gen === loadGenRef.current) {
        setCandidatesLoading(false);
        setSheetRefreshAt(Date.now());
      }
    }
  }, [year, month]);

  useEffect(() => {
    loadCandidates();
  }, [loadCandidates]);

  useEffect(() => {
    let cancelled = false;
    const payKey = monthKey(year, month);
    const run = candidates.existingRun;
    const runKey =
      run?.month_key ||
      (run?.pay_year != null && run?.pay_month != null ? monthKey(run.pay_year, run.pay_month) : "");
    if (!run?.id || runKey !== payKey) {
      setSavedMonthLines([]);
      return undefined;
    }
    (async () => {
      try {
        const { lines } = await api.getWithLines(run.id);
        if (!cancelled) {
          setSavedMonthLines(
            (lines || []).map((line) => ({ ...line, pay_month_key: payKey }))
          );
        }
      } catch (err) {
        console.warn("Salary processed lines load failed", err);
        if (!cancelled) setSavedMonthLines([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    year,
    month,
    candidates.existingRun?.id,
    candidates.existingRun?.month_key,
    candidates.existingRun?.pay_year,
    candidates.existingRun?.pay_month,
    sheetRefreshAt,
  ]);

  const handleBankImported = useCallback(
    async ({ rows } = {}) => {
      for (const row of rows || []) {
        if (!row?.employeeMasterId) continue;
        syncScopeDraftBankFromMaster(row.employeeMasterId, {
          account_no: row.accountNo,
          ifsc: row.ifsc,
        });
      }
      await loadCandidates();
    },
    [loadCandidates]
  );

  // Re-read CTC when returning from Employee Master Save CTC
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "hidden") return;
      loadCandidates();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [loadCandidates]);

  // Sync process mode with list tab (Hold tab → hold workflow)
  useEffect(() => {
    if (viewTab === "held") setProcessMode(PROCESS_MODES.HOLD);
    else setProcessMode(PROCESS_MODES.BULK);
  }, [viewTab]);

  const rosterEmployees = useMemo(() => {
    const payKey = monthKey(year, month);
    if (candidates.monthKey && candidates.monthKey !== payKey) return [];
    return candidates.employees || [];
  }, [candidates.employees, candidates.monthKey, year, month]);

  const rosterKpis = useMemo(() => {
    const rows = rosterEmployees;
    const holdSet = new Set(holdIds.map(String));
    let ctcReady = 0;
    let pending = 0;
    let processed = 0;
    let held = 0;
    for (const e of rows) {
      const onHold = holdSet.has(String(e.id)) || e.onHold;
      if (onHold) held += 1;
      else if (e.alreadyProcessed) processed += 1;
      else if (e.hasCtc) pending += 1;
      if (e.hasCtc) ctcReady += 1;
    }
    return {
      total: rows.length,
      ctcReady,
      ctcMissing: Math.max(0, rows.length - ctcReady),
      pending,
      processed,
      held,
    };
  }, [rosterEmployees, holdIds]);

  /** Shared tab + filter list — All shows every employee name even without CTC. */
  const tabEmployees = useMemo(() => {
    const holdSet = new Set(holdIds.map(String));

    return (rosterEmployees || []).filter((e) => {
      const onHold = holdSet.has(String(e.id)) || Boolean(e.onHold);
      const status = onHold
        ? "held"
        : e.alreadyProcessed
          ? "processed"
          : e.hasCtc
            ? "pending"
            : "ctc_required";

      if (viewTab === "processed" && status !== "processed") return false;
      if (viewTab === "held" && status !== "held") return false;

      if (selectedDepartments.length > 0 && !departmentInSelection(e.department, selectedDepartments)) {
        return false;
      }
      // All Employees always lists everyone (with or without CTC).
      // CTC Saved / Missing is only an optional extra filter on that tab.
      if (viewTab === "all" && filterCtc === "ready" && !e.hasCtc) return false;
      if (viewTab === "all" && filterCtc === "missing" && e.hasCtc) return false;

      return true;
    });
  }, [
    rosterEmployees,
    holdIds,
    viewTab,
    filterCtc,
    selectedDepartments,
  ]);

  const overviewRows = useMemo(() => {
    const holdSet = new Set(holdIds.map(String));
    const needle = tableSearch.trim().toLowerCase();
    const enriched = tabEmployees.map((e) => {
      const onHold = holdSet.has(String(e.id)) || Boolean(e.onHold);
      const processStatus = onHold
        ? "held"
        : e.alreadyProcessed
          ? "processed"
          : e.hasCtc
            ? "pending"
            : "ctc_required";
      return { ...e, onHold, processStatus };
    });
    if (!needle) return enriched;
    return enriched.filter((e) => {
      const hay = [e.employee_code, e.full_name, e.department, e.location, e.designation]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [tabEmployees, holdIds, tableSearch]);

  const overviewTotals = useMemo(() => {
    let totalCtc = 0;
    let totalNet = 0;
    for (const e of overviewRows) {
      if (e.hasCtc) {
        totalCtc += Number(e.ctc_monthly) || 0;
        totalNet += Number(e.take_home_monthly) || 0;
      }
    }
    return { totalCtc, totalNet };
  }, [overviewRows]);

  const processPreview = useMemo(() => {
    const rows = rosterEmployees;
    const holdSet = new Set(holdIds.map(String));
    const selectedSet = new Set(selectedIds.map(String));
    let pool = rows.filter((e) => {
      if (holdSet.has(String(e.id)) || e.onHold) return false;
      return Boolean(e.hasCtc);
    });
    if (selectedDepartments.length > 0) {
      pool = pool.filter((e) => departmentInSelection(e.department, selectedDepartments));
    }
    if (processMode === PROCESS_MODES.HOLD) {
      pool = [];
    }
    if (
      (processMode === PROCESS_MODES.BULK || processMode === PROCESS_MODES.DEPT) &&
      selectedSet.size
    ) {
      pool = pool.filter((e) => selectedSet.has(String(e.id)));
    }
    const toProcess = pool.filter((e) => !e.alreadyProcessed);
    const skipped = pool.filter((e) => e.alreadyProcessed);
    const inScope = rows.filter((e) => {
      if (processMode === PROCESS_MODES.HOLD) return holdSet.has(String(e.id));
      if (selectedDepartments.length > 0) {
        return departmentInSelection(e.department, selectedDepartments) && !holdSet.has(String(e.id));
      }
      return !holdSet.has(String(e.id));
    });
    const withoutCtc = inScope.filter((e) => !e.hasCtc).length;
    const onHoldCount = rows.filter((e) => holdSet.has(String(e.id))).length;
    return { pool, toProcess, skipped, inScope, withoutCtc, onHoldCount };
  }, [rosterEmployees, processMode, selectedDepartments, holdIds, selectedIds]);

  /** Salary sheet uses the same tab list so All / Processed / Held stay in sync. */
  const scopeEmployees = tabEmployees;

  const visibleScopeLines = useMemo(() => {
    const needle = tableSearch.trim().toLowerCase();
    if (!needle) return scopeLines;
    return scopeLines.filter((line) => {
      const hay = [
        line.employee_code,
        line.employee_name,
        line.department,
        line.designation,
        line.account_no,
        line.ifsc,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [scopeLines, tableSearch]);

  const toggleSelectEmployee = useCallback((empId) => {
    const s = String(empId);
    setSelectedIds((prev) =>
      prev.some((id) => String(id) === s) ? prev.filter((id) => String(id) !== s) : [...prev, s]
    );
  }, []);

  const toggleSelectAllVisible = useCallback(
    (selectAll) => {
      const visible =
        listView === "overview"
          ? overviewRows
              .filter((e) => !(e.salaryLocked || e.processStatus === "locked"))
              .map((e) => String(e.id))
              .filter(Boolean)
          : visibleScopeLines
              .filter((l) => !lineIsSalaryLocked(l))
              .map((l) => String(l.employee_master_id))
              .filter(Boolean);
      if (!selectAll) {
        const drop = new Set(visible);
        setSelectedIds((prev) => prev.filter((id) => !drop.has(String(id))));
        return;
      }
      setSelectedIds((prev) => {
        const merged = new Set(prev.map(String));
        visible.forEach((id) => merged.add(id));
        return [...merged];
      });
    },
    [listView, overviewRows, visibleScopeLines]
  );

  const holdSelectedEmployees = useCallback(() => {
    if (!selectedIds.length) {
      toast.warning("Select at least one employee to put on hold.");
      return;
    }
    const key = monthKey(year, month);
    const next = [...new Set([...holdIds.map(String), ...selectedIds.map(String)])];
    setMonthHoldIds(key, next);
    setHoldIds(next);
    setSelectedIds([]);
    toast.success(`${selectedIds.length} employee(s) moved to Hold`);
    loadCandidates();
  }, [selectedIds, holdIds, year, month, loadCandidates]);

  const releaseSelectedFromHold = useCallback(() => {
    if (!selectedIds.length) {
      toast.warning("Select at least one employee to release from hold.");
      return;
    }
    const key = monthKey(year, month);
    const drop = new Set(selectedIds.map(String));
    const next = holdIds.map(String).filter((id) => !drop.has(id));
    setMonthHoldIds(key, next);
    setHoldIds(next);
    setSelectedIds([]);
    toast.success(`${drop.size} employee(s) released from Hold`);
    loadCandidates();
  }, [selectedIds, holdIds, year, month, loadCandidates]);

  // Clear row selection / search when month / tab / CTC filter changes
  useEffect(() => {
    setSelectedIds([]);
  }, [year, month, viewTab, selectedDepartments, filterCtc]);

  useEffect(() => {
    setTableSearch("");
    setFilterCtc("all");
  }, [year, month, viewTab]);

  useEffect(() => {
    const next = workingDaysMonToSat(year, month);
    setMonthDays((prev) => (Number(prev) === next ? prev : next));
  }, [year, month]);

  useEffect(() => {
    let cancelled = false;
    if (detailLineId) {
      // Keep in-memory edits while the detail page is open
      return undefined;
    }
    if (!scopeEmployees.length) {
      setScopeLines([]);
      setScopeLinesLoading(false);
      return undefined;
    }
    const holdSet = new Set(holdIds.map(String));
    const employeesForSheet = scopeEmployees.map((e) => {
      const onHold = holdSet.has(String(e.id)) || Boolean(e.onHold);
      const processStatus = onHold
        ? "held"
        : e.alreadyProcessed
          ? "processed"
          : e.hasCtc
            ? "pending"
            : "ctc_required";
      return { ...e, onHold, processStatus };
    });
    // Keep existing P.Days for this month so hits do not flash to 0 then refill.
    const payKey = monthKey(year, month);
    setScopeLines((prev) =>
      mergeScopePlaceholders(employeesForSheet, {
        prev,
        savedMonthLines,
        monthDays,
        payKey,
      })
    );
    setScopeLinesLoading(false);
    (async () => {
      try {
        const built = await buildSalaryScopePreviewLines({
          employees: employeesForSheet,
          year,
          month,
          monthDays,
          savedLines: savedMonthLines,
          salaryMap: candidates.salaryMap,
        });
        if (!cancelled) {
          const payKey = monthKey(year, month);
          setScopeLines((prev) =>
            overlayLoadedPresentDays(built, prev, payKey)
          );
        }
      } catch (err) {
        console.warn("Salary scope preview failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scopeEmployees, holdIds, year, month, monthDays, detailLineId, savedMonthLines, candidates.salaryMap]);

  useEffect(() => {
    if (detailLineId && !scopeLines.some((l) => l.id === detailLineId)) {
      setDetailLineId(null);
      setDetailDirty(false);
    }
  }, [scopeLines, detailLineId]);

  const updateScopeLine = useCallback(
    (id, patch) => {
      setScopeLines((prev) =>
        prev.map((row) => {
          if (row.id !== id) return row;
          if (lineIsSalaryLocked(row)) return row;
          return recomputeLineFromEdits({ ...row, ...patch }, monthDays, {
            keepPt: Object.prototype.hasOwnProperty.call(patch, "pt_amount"),
          });
        })
      );
      if (detailLineId && id === detailLineId) {
        setDetailDirty(true);
      }
    },
    [monthDays, detailLineId]
  );

  const detailLine = useMemo(
    () => (detailLineId ? scopeLines.find((l) => l.id === detailLineId) || null : null),
    [detailLineId, scopeLines]
  );

  const openEmployeeDetail = useCallback((line) => {
    if (line?.id) {
      setDetailLineId(line.id);
      setDetailDirty(false);
    }
  }, []);

  const handleOpenScopeEmployee = useCallback((line) => {
    openEmployeeDetail(line);
  }, [openEmployeeDetail]);

  const doPublishProcessedSlips = useCallback(async () => {
    const pool = visibleScopeLines.filter((l) => l.alreadyProcessed);
    const selectedSet = new Set(selectedIds.map(String));
    const chosen = selectedSet.size
      ? pool.filter((l) => selectedSet.has(String(l.employee_master_id)))
      : pool;
    const lockedChosen = chosen.filter((l) => lineIsSalaryLocked(l));
    const toPublish = chosen.filter((l) => !lineIsSalaryLocked(l));
    if (!toPublish.length) {
      toast.warning(
        lockedChosen.length
          ? "These employees are already processed and locked for this month. Their salary will not be updated."
          : "Select employees, then click Processed to lock salary for this month."
      );
      return;
    }
    setBusy(true);
    try {
      const result = await api.publishSlips({
        year,
        month,
        employeeIds: toPublish.map((l) => l.employee_master_id),
      });
      const dayLabel = result.processedOn ? formatProcessDay(result.processedOn) : "";
      const skipped = result.skippedLocked || lockedChosen.length;
      let msg = `${result.slipCount || toPublish.length} employee(s) locked for ${monthLabel(year, month)}${
        dayLabel ? ` on ${dayLabel}` : ""
      }.`;
      if (skipped) {
        msg += ` ${skipped} already locked — left unchanged.`;
      }
      toast.success(msg);
      setSelectedIds([]);
      await loadCandidates();
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Could not lock processed salary.");
    } finally {
      setBusy(false);
    }
  }, [visibleScopeLines, selectedIds, year, month, loadCandidates]);

  const openOverviewEmployee = useCallback(
    async (emp) => {
      if (!emp?.id) return;
      const existing = scopeLines.find(
        (l) => String(l.employee_master_id) === String(emp.id)
      );
      if (existing?.id) {
        if (viewTab === "processed" || existing.alreadyProcessed) {
          handleOpenScopeEmployee(existing);
          return;
        }
        openEmployeeDetail(existing);
        return;
      }
      setScopeLinesLoading(true);
      try {
        const built = await buildSalaryScopePreviewLines({
          employees: [emp],
          year,
          month,
          monthDays,
        });
        const line = built?.[0];
        if (line) {
          setScopeLines((prev) => {
            if (prev.some((l) => String(l.employee_master_id) === String(emp.id))) return prev;
            return [...prev, line];
          });
          if (viewTab === "processed" || line.alreadyProcessed || emp.alreadyProcessed) {
            handleOpenScopeEmployee(line);
          } else {
            openEmployeeDetail(line);
          }
        }
      } catch (err) {
        console.warn("Open employee salary detail failed", err);
        toast.error("Could not open employee salary detail.");
      } finally {
        setScopeLinesLoading(false);
      }
    },
    [scopeLines, year, month, monthDays, viewTab, openEmployeeDetail, handleOpenScopeEmployee]
  );

  const saveEmployeeDetail = useCallback(
    async (line) => {
      if (!line?.employee_master_id) return;
      if (lineIsSalaryLocked(line)) {
        toast.warning("This salary is locked for the month and cannot be changed.");
        return;
      }
      setDetailSaving(true);
      try {
        const key = monthKey(year, month);
        const recomputed = recomputeLineFromEdits(line, monthDays);
        saveScopeLineDraft(key, recomputed.employee_master_id, recomputed);
        setScopeLines((prev) =>
          prev.map((row) => (row.id === line.id ? { ...recomputed, id: row.id } : row))
        );

        // If already on a processed month sheet, update that line too
        const existing = candidates.existingRun || (await api.getByKey(key));
        if (existing?.id) {
          const bundle = await api.getWithLines(existing.id);
          const sheetLine = (bundle.lines || []).find(
            (l) => String(l.employee_master_id) === String(recomputed.employee_master_id)
          );
          if (sheetLine?.id) {
            await api.save(existing.id, [
              {
                ...sheetLine,
                account_no: recomputed.account_no,
                ifsc: recomputed.ifsc,
                confirmation_date: recomputed.confirmation_date,
                present_days: recomputed.present_days,
                pf_basic: recomputed.pf_basic,
                custom_earn_full: recomputed.custom_earn_full,
                pt_amount: recomputed.pt_amount,
                loan: recomputed.loan,
                sal_adv: recomputed.sal_adv,
                unpaid_paid: recomputed.unpaid_paid,
                tds: recomputed.tds,
                custom_ded_full: recomputed.custom_ded_full,
                computed_json: recomputed.computed_json,
              },
            ]);
            await loadCandidates();
            toast.success("Saved to salary sheet.");
          } else {
            toast.success("Saved. Changes apply when you process salary.");
          }
        } else {
          toast.success("Saved. Changes apply when you process salary.");
        }
        setDetailDirty(false);
      } catch (err) {
        console.error("Salary detail save failed", err);
        toast.error(err?.message || "Could not save employee salary details.");
      } finally {
        setDetailSaving(false);
      }
    },
    [year, month, monthDays, candidates.existingRun, loadCandidates]
  );

  const openRun = useCallback(async (runId) => {
    setBusy(true);
    try {
      const { run: r, lines: ls } = await api.getWithLines(runId);
      if (!r) throw new Error("Salary sheet not found.");
      setRun(r);
      setLines(ls || []);
      setDirty(false);
      setQ("");
      setEditorOpen(true);
      setMonthDays(Number(r.month_days) || DEFAULT_MONTH_DAYS);
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Could not open salary sheet.");
    } finally {
      setBusy(false);
    }
  }, []);

  const doProcess = useCallback(
    async ({ forceFullReprocess = false } = {}) => {
      if (processMode === PROCESS_MODES.HOLD) {
        toast.warning(
          "Hold employees are excluded from processing. Release them first, or process from All Employees."
        );
        return;
      }
      setBusy(true);
      try {
        const key = monthKey(year, month);
        const isBulk = processMode === PROCESS_MODES.BULK && !selectedIds.length;
        if (isBulk && forceFullReprocess) {
          const existing = await api.getByKey(key);
          if (!existing) {
            forceFullReprocess = false;
          }
        } else if (
          isBulk &&
          !forceFullReprocess &&
          candidates.existingRun &&
          processPreview.toProcess.length === 0
        ) {
          setExistingRun(candidates.existingRun);
          setConfirmOpen(true);
          setBusy(false);
          return;
        }

        // Process exactly the employees on this page list (to process / full pool).
        const pageIds = (
          forceFullReprocess && isBulk ? processPreview.pool : processPreview.toProcess
        )
          .map((e) => e.id)
          .filter((id) => id != null);

        if (!pageIds.length && !(forceFullReprocess && isBulk)) {
          toast.warning(
            selectedIds.length
              ? "No selected employees left to process for this month."
              : "No employees on this list to process for this month."
          );
          setBusy(false);
          return;
        }

        const processDay = new Date();
        const processedOn = `${processDay.getFullYear()}-${String(processDay.getMonth() + 1).padStart(2, "0")}-${String(processDay.getDate()).padStart(2, "0")}`;

        const result = await api.process({
          year,
          month,
          monthDays,
          processMode:
            forceFullReprocess && isBulk
              ? PROCESS_MODES.BULK
              : PROCESS_MODES.SELECT,
          employeeIds: forceFullReprocess && isBulk ? [] : pageIds,
          departments:
            forceFullReprocess && isBulk
              ? []
              : selectedDepartments.length
                ? selectedDepartments
                : [],
          forceFullReprocess: Boolean(forceFullReprocess && isBulk),
          processedOn,
        });
        const meta = result.processMeta || {};
        const count = meta.processedCount ?? result.run?.employee_count ?? pageIds.length;
        let msg = `${count} employee(s) moved to Processed for ${monthLabel(year, month)}`;
        if (meta.skippedDuplicateCount > 0) {
          msg += ` · skipped ${meta.skippedDuplicateCount} already on sheet`;
        }
        if (result.run?.revision_no) {
          msg += ` (rev ${result.run.revision_no})`;
        }
        msg += ". On Processed, click Processed to lock those employees for this month.";
        toast.success(msg);
        setSelectedIds([]);
        setViewTab("processed");
        await loadCandidates();
        setRun(result.run);
        setLines(result.lines || []);
        setDirty(false);
        setEditorOpen(false);
        setConfirmOpen(false);
        setExistingRun(null);
      } catch (err) {
        console.error(err);
        toast.error(err?.message || "Salary processing failed.");
      } finally {
        setBusy(false);
      }
    },
    [
      year,
      month,
      monthDays,
      processMode,
      selectedDepartments,
      selectedIds,
      candidates.existingRun,
      processPreview.toProcess,
      processPreview.pool,
      loadCandidates,
    ]
  );

  const updateLine = useCallback(
    (id, patch) => {
      setLines((prev) =>
        prev.map((row) => {
          if (row.id !== id) return row;
          return recomputeLineFromEdits({ ...row, ...patch }, run?.month_days || monthDays, {
            keepPt: Object.prototype.hasOwnProperty.call(patch, "pt_amount"),
          });
        })
      );
      setDirty(true);
    },
    [run?.month_days, monthDays]
  );

  const handleSave = useCallback(async () => {
    if (!run?.id) return;
    setSaving(true);
    try {
      const result = await api.save(run.id, lines);
      setRun(result.run);
      setLines(result.lines || []);
      setDirty(false);
      toast.success(
        `Saved as revision ${result.run.revision_no}. Payslips updated. Employee Master loan / advances / TDS synced from this sheet.`
      );
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Could not save sheet edits.");
    } finally {
      setSaving(false);
    }
  }, [run?.id, lines]);

  const handleExport = useCallback(async () => {
    if (!run) return;
    try {
      await exportSalaryProcessingWorkbook({ run, lines });
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Excel export failed.");
    }
  }, [run, lines]);

  const handleTabExport = useCallback(async () => {
    const rows = visibleScopeLines;
    if (!rows.length) {
      toast.warning("No employees on this tab to download.");
      return;
    }
    setExporting(true);
    try {
      const tabMeta = VIEW_TABS.find((t) => t.id === viewTab) || VIEW_TABS[0];
      await exportSalaryProcessingWorkbook(
        {
          run: {
            pay_year: year,
            pay_month: month,
            month_days: monthDays,
            revision_no: candidates.existingRun?.revision_no || 1,
          },
          lines: rows,
        },
        { tabLabel: tabMeta.label, tabId: viewTab }
      );
      toast.success(`Downloaded ${rows.length} employee(s) from ${tabMeta.label}.`);
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Excel download failed.");
    } finally {
      setExporting(false);
    }
  }, [visibleScopeLines, year, month, monthDays, candidates.existingRun, viewTab]);

  const filteredLines = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return lines;
    return lines.filter((l) => {
      const hay = `${l.employee_code || ""} ${l.employee_name || ""} ${l.designation || ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [lines, q]);

  const editorHeaders = [
    "Sr No",
    "Code",
    "Name",
    "Account",
    "IFSC",
    "Desig.",
    "DOJ",
    "Conf.",
    "Gross",
    "P.Days",
    "PF Basic",
    "PF earn",
    "Basic",
    "B.earn",
    "HRA",
    "Special",
    "Custom+",
    "Gross W",
    "PF 12%",
    "ESIC",
    "PT",
    "Loan",
    "Sal Adv",
    "U/P",
    "TDS",
    "Custom−",
    "Tot Ded",
    "Net",
    "Bank",
  ];

  if (detailLine) {
    return (
      <EmployeeSalaryDetailPage
        line={detailLine}
        monthLabelText={monthLabel(year, month)}
        monthDays={monthDays}
        onBack={() => {
          setDetailLineId(null);
          setDetailDirty(false);
        }}
        onUpdate={updateScopeLine}
        onSave={saveEmployeeDetail}
        dirty={detailDirty}
        saving={detailSaving}
        readOnly={lineIsSalaryLocked(detailLine)}
      />
    );
  }

  if (editorOpen && run) {
    return (
      <div className="space-y-2.5 max-w-[1600px] w-full mx-auto">
        <PageTaskHeader
          className="mb-0"
          title={`Salary — ${monthLabel(run.pay_year, run.pay_month)}`}
          subtitle={
            <>
              <span className="font-mono text-[11px] text-slate-600">{getRunSheetNo(run)}</span>
              <span className="mx-1.5 text-slate-300">·</span>
              {run.employee_count} emps · {run.month_days} days · Net {formatINRPlain(run.total_net)}
            </>
          }
        >
          <StatusChip label={`Rev ${run.revision_no}`} severity="info" />
          <button
            type="button"
            className={btnGhost}
            onClick={() => {
              if (dirty && !window.confirm("Discard unsaved edits?")) return;
              setEditorOpen(false);
              setRun(null);
              setLines([]);
              setDirty(false);
            }}
          >
            Back
          </button>
          <button type="button" className={btnGhost} onClick={handleExport}>
            <Download className="h-3 w-3 inline mr-1" />
            Export
          </button>
          <button type="button" disabled={!dirty || saving} className={btnPrimary} onClick={handleSave}>
            {saving ? "Saving…" : "Save"}
          </button>
        </PageTaskHeader>

        <div className="flex flex-wrap items-center gap-2 px-2 py-1.5 rounded border border-slate-200 bg-slate-50/80">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className={`${textIn} pl-6 w-44`}
              placeholder="Search code / name"
            />
          </div>
          {dirty ? (
            <span className="text-[11px] text-amber-700">Unsaved — Save bumps revision</span>
          ) : (
            <span className="text-[11px] text-slate-500">{filteredLines.length} rows</span>
          )}
        </div>

        <div className="overflow-auto rounded border border-slate-200 max-h-[calc(100dvh-11rem)]">
          <table className="min-w-[1320px] w-full border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr>
                {editorHeaders.map((h) => (
                  <th
                    key={h}
                    className="px-1.5 py-1.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-200 whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredLines.map((line, idx) => (
                <tr
                  key={line.id}
                  className={line.has_master_variance ? "bg-amber-50/70" : "bg-white hover:bg-slate-50/80"}
                >
                  <td className="px-1.5 py-1 text-[11px] tabular-nums border-b border-slate-100">{idx + 1}</td>
                  <td className="px-1.5 py-1 text-[11px] font-mono border-b border-slate-100 max-w-[5.5rem]">
                    <TruncateTip text={line.employee_code} className="font-mono" />
                  </td>
                  <td className="px-1.5 py-1 text-[11px] border-b border-slate-100 max-w-[8.5rem]">
                    <TruncateTip text={line.employee_name} />
                    {line.has_master_variance ? (
                      <span className="ml-1 text-[9px] text-amber-700" title="Differs from salary master">
                        var
                      </span>
                    ) : null}
                  </td>
                  <td className="px-0.5 py-0.5 border-b border-slate-100">
                    <input
                      className={`${textIn} w-[7.5rem]`}
                      value={line.account_no || ""}
                      title={line.account_no || undefined}
                      onChange={(e) => updateLine(line.id, { account_no: e.target.value })}
                    />
                  </td>
                  <td className="px-0.5 py-0.5 border-b border-slate-100">
                    <input
                      className={`${textIn} w-[5.75rem]`}
                      value={line.ifsc || ""}
                      title={line.ifsc || undefined}
                      onChange={(e) => updateLine(line.id, { ifsc: e.target.value })}
                    />
                  </td>
                  <td className="px-1.5 py-1 text-[11px] border-b border-slate-100 max-w-[6rem]">
                    <TruncateTip text={line.designation} />
                  </td>
                  <td className="px-1.5 py-1 text-[11px] border-b border-slate-100 whitespace-nowrap">
                    {line.date_of_joining ? formatDateDdMmYyyy(line.date_of_joining) : "—"}
                  </td>
                  <td className="px-0.5 py-0.5 border-b border-slate-100">
                    <FormDateInput
                      compact
                      className="h-7 text-[11px]"
                      value={line.confirmation_date ? String(line.confirmation_date).slice(0, 10) : ""}
                      onChange={(e) =>
                        updateLine(line.id, { confirmation_date: e?.target?.value || null })
                      }
                    />
                  </td>
                  <td className="px-1.5 py-1 text-[11px] text-right border-b border-slate-100">
                    <Money value={line.salary_rate} />
                  </td>
                  <td className="px-0.5 py-0.5 border-b border-slate-100">
                    <input
                      type="number"
                      step="0.5"
                      className={numIn}
                      value={line.present_days ?? ""}
                      placeholder="—"
                      onChange={(e) => updateLine(line.id, { present_days: e.target.value })}
                    />
                  </td>
                  <td className="px-0.5 py-0.5 border-b border-slate-100">
                    <input
                      type="number"
                      className={numIn}
                      value={line.pf_basic ?? ""}
                      onChange={(e) => updateLine(line.id, { pf_basic: e.target.value })}
                    />
                  </td>
                  <td className="px-1.5 py-1 text-[11px] text-right border-b border-slate-100">
                    <Money value={line.pf_earned_basic} />
                  </td>
                  <td className="px-1.5 py-1 text-[11px] text-right border-b border-slate-100">
                    <Money value={line.basic_full} />
                  </td>
                  <td className="px-1.5 py-1 text-[11px] text-right border-b border-slate-100">
                    <Money value={line.basic_earned} />
                  </td>
                  <td className="px-1.5 py-1 text-[11px] text-right border-b border-slate-100">
                    <Money value={line.hra_earned} />
                  </td>
                  <td className="px-1.5 py-1 text-[11px] text-right border-b border-slate-100">
                    <Money value={line.special_allowance} />
                  </td>
                  <td className="px-0.5 py-0.5 border-b border-slate-100">
                    <input
                      type="number"
                      className={numIn}
                      title={
                        Array.isArray(line.computed_json?.custom_components)
                          ? line.computed_json.custom_components
                              .filter((c) => c.kind === "earning")
                              .map((c) => `${c.code}: ${c.amount}`)
                              .join(", ") || "Person components (earn)"
                          : "Person components (earn)"
                      }
                      value={line.custom_earn_full ?? line.computed_json?.custom_earn_full ?? 0}
                      onChange={(e) =>
                        updateLine(line.id, {
                          custom_earn_full: e.target.value,
                          computed_json: {
                            ...(line.computed_json || {}),
                            custom_earn_full: e.target.value,
                          },
                        })
                      }
                    />
                  </td>
                  <td className="px-1.5 py-1 text-[11px] text-right border-b border-slate-100">
                    <Money value={line.gross_wages} strong />
                  </td>
                  <td className="px-1.5 py-1 text-[11px] text-right border-b border-slate-100">
                    <Money value={line.emp_pf} />
                  </td>
                  <td className="px-1.5 py-1 text-[11px] text-right border-b border-slate-100">
                    <Money value={line.emp_esic} />
                  </td>
                  <td className="px-0.5 py-0.5 border-b border-slate-100">
                    <input
                      type="number"
                      className={numIn}
                      value={line.pt_amount ?? ""}
                      onChange={(e) => updateLine(line.id, { pt_amount: e.target.value })}
                    />
                  </td>
                  <td className="px-0.5 py-0.5 border-b border-slate-100">
                    <input
                      type="number"
                      className={numIn}
                      value={line.loan ?? 0}
                      onChange={(e) => updateLine(line.id, { loan: e.target.value })}
                    />
                  </td>
                  <td className="px-0.5 py-0.5 border-b border-slate-100">
                    <input
                      type="number"
                      className={numIn}
                      value={line.sal_adv ?? 0}
                      onChange={(e) => updateLine(line.id, { sal_adv: e.target.value })}
                    />
                  </td>
                  <td className="px-0.5 py-0.5 border-b border-slate-100">
                    <input
                      type="number"
                      className={numIn}
                      value={unpaidInputValue(line.unpaid_paid)}
                      placeholder="—"
                      onChange={(e) =>
                        updateLine(line.id, {
                          unpaid_paid: e.target.value === "" ? 0 : e.target.value,
                        })
                      }
                    />
                  </td>
                  <td className="px-0.5 py-0.5 border-b border-slate-100">
                    <input
                      type="number"
                      className={numIn}
                      value={line.tds ?? 0}
                      onChange={(e) => updateLine(line.id, { tds: e.target.value })}
                    />
                  </td>
                  <td className="px-0.5 py-0.5 border-b border-slate-100">
                    <input
                      type="number"
                      className={numIn}
                      title={
                        Array.isArray(line.computed_json?.custom_components)
                          ? line.computed_json.custom_components
                              .filter((c) => c.kind === "deduction")
                              .map((c) => `${c.code}: ${c.amount}`)
                              .join(", ") || "Person components (deduct)"
                          : "Person components (deduct)"
                      }
                      value={line.custom_ded_full ?? line.computed_json?.custom_ded_full ?? 0}
                      onChange={(e) =>
                        updateLine(line.id, {
                          custom_ded_full: e.target.value,
                          computed_json: {
                            ...(line.computed_json || {}),
                            custom_ded_full: e.target.value,
                          },
                        })
                      }
                    />
                  </td>
                  <td className="px-1.5 py-1 text-[11px] text-right border-b border-slate-100">
                    <Money value={line.total_ded} />
                  </td>
                  <td className="px-1.5 py-1 text-[11px] text-right border-b border-slate-100">
                    <Money value={line.net_salary} strong />
                  </td>
                  <td className="px-1.5 py-1 text-[11px] text-right border-b border-slate-100">
                    <Money value={line.bank_amount} strong />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filteredLines.length ? (
            <p className="text-center text-xs text-slate-500 py-6">No employees match this search.</p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 max-w-[1600px] w-full mx-auto">
      <PageTaskHeader
        className="mb-0"
        title="Salary Processing"
        subtitle="Build monthly salary sheets from Employee Master. P.Days = Daily Register Total Present for the selected pay month."
      >
        <button
          type="button"
          className={btnGhost}
          onClick={() => setBankImportOpen(true)}
          title="Import Account / IFSC / UAN / ESIC from Excel into Employee Master"
        >
          <Upload className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" />
          Import bank details
        </button>
        <button
          type="button"
          className={btnGhost}
          onClick={() => loadCandidates()}
          disabled={candidatesLoading}
          title="Reload employees and CTC from Employee Master"
        >
          <RefreshCw className={`w-3.5 h-3.5 inline-block mr-1 -mt-0.5 ${candidatesLoading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </PageTaskHeader>

      <CollapsibleHelp label="how this works">
        On All Employees, click Process salary — those staff move to the Processed tab.
        On Processed, select employees and click Processed to lock them for this month
        (green rows). Locked staff stay on the day they were processed and cannot be changed.
        Open a row to view the salary form — locked records are view only.
      </CollapsibleHelp>

      <SectionCard
        title="Salary Processing"
        className="[&_.erp-card-header]:min-h-0 [&_.erp-card-header]:py-2.5 [&_.erp-card-body]:p-3"
        right={
          <div className="flex flex-wrap items-center gap-2">
            <select
              className={selectIn}
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              aria-label="Pay month"
              title="Pay month — P.Days from this month’s attendance register (usually last month)"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {new Date(2000, m - 1, 1).toLocaleString("en-IN", { month: "long" })}
                </option>
              ))}
            </select>
            <select
              className={selectIn}
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              aria-label="Pay year"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-slate-600">
            <span>
              <span className="font-semibold text-slate-900 tabular-nums">{rosterKpis.total}</span>{" "}
              Employees
            </span>
            <span className="text-slate-300">·</span>
            <span>
              <span className="font-semibold text-emerald-700 tabular-nums">
                {rosterKpis.ctcReady}
              </span>{" "}
              CTC saved
            </span>
            <span className="text-slate-300">·</span>
            <span>
              <span className="font-semibold text-amber-700 tabular-nums">
                {rosterKpis.ctcMissing}
              </span>{" "}
              CTC missing
            </span>
            <span className="text-slate-300">·</span>
            <span>
              <span className="font-semibold text-slate-700 tabular-nums">
                {rosterKpis.pending}
              </span>{" "}
              Pending processing
            </span>
            <span className="text-slate-300">·</span>
            <span>
              <span className="font-semibold text-slate-800 tabular-nums">
                {rosterKpis.processed}
              </span>{" "}
              Processed
            </span>
            <span className="text-slate-300">·</span>
            <span>
              <span className="font-semibold text-amber-800 tabular-nums">{rosterKpis.held}</span>{" "}
              Held
            </span>
          </div>

          <div role="tablist" aria-label="Process status" className="flex flex-wrap gap-1">
            {VIEW_TABS.map((opt) => {
              const active = viewTab === opt.id;
              const count =
                opt.id === "all"
                  ? rosterKpis.total
                  : opt.id === "processed"
                    ? rosterKpis.processed
                    : rosterKpis.held;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => {
                    setViewTab(opt.id);
                    if (opt.id === "all") setFilterCtc("all");
                  }}
                  className={`h-8 px-3 text-[11px] font-semibold rounded-md border transition-colors ${
                    active
                      ? "bg-ink-strong text-white border-ink-strong"
                      : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:text-slate-900"
                  }`}
                >
                  {opt.label}
                  <span
                    className={`ml-1.5 tabular-nums ${active ? "text-white/70" : "text-slate-400"}`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <label className="text-[10px] uppercase tracking-wide text-slate-500 space-y-0.5">
              <span className="block">Department</span>
              <RegisterDepartmentFilter
                options={candidates.departments || []}
                selected={selectedDepartments}
                onChange={setSelectedDepartments}
              />
            </label>
            <label className="text-[10px] uppercase tracking-wide text-slate-500 space-y-0.5">
              <span className="block">CTC status</span>
              <select
                className={`${selectIn} min-w-[8rem]`}
                value={filterCtc}
                onChange={(e) => setFilterCtc(e.target.value)}
              >
                <option value="all">All</option>
                <option value="ready">Saved</option>
                <option value="missing">Missing</option>
              </select>
            </label>
            <label className="text-[10px] uppercase tracking-wide text-slate-500 space-y-0.5">
              <span className="block">Days</span>
              <input
                type="number"
                min={1}
                max={31}
                className={`${selectIn} w-14`}
                value={monthDays}
                title="Monday to Saturday working days in the selected month (Sundays excluded)"
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setMonthDays(
                    Number.isFinite(n) && n > 0 ? n : workingDaysMonToSat(year, month)
                  );
                }}
              />
            </label>
            <div className="relative pb-0.5">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
              <input
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                className={`${textIn} pl-6 w-52`}
                placeholder="Search employee"
                aria-label="Search employees"
              />
            </div>
            <div className="flex items-center gap-1 ml-auto pb-0.5">
              <button
                type="button"
                className={btnGhost}
                onClick={handleTabExport}
                disabled={exporting || candidatesLoading || scopeLinesLoading || !visibleScopeLines.length}
                title={`Download ${VIEW_TABS.find((t) => t.id === viewTab)?.label || "this tab"} as Excel`}
              >
                <Download className="h-3 w-3 inline mr-1 -mt-0.5" />
                {exporting ? "Downloading…" : "Download Excel"}
              </button>
              <button
                type="button"
                className={`h-7 px-2.5 text-[11px] font-medium rounded border ${
                  listView === "sheet"
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-600 border-slate-200"
                }`}
                onClick={() => setListView("sheet")}
              >
                Salary sheet
              </button>
              <button
                type="button"
                className={`h-7 px-2.5 text-[11px] font-medium rounded border ${
                  listView === "overview"
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-600 border-slate-200"
                }`}
                onClick={() => setListView("overview")}
              >
                Overview
              </button>
            </div>
          </div>

          {listView === "sheet" ? (
            <ScopeSalarySheetTable
              lines={visibleScopeLines}
              loading={candidatesLoading || scopeLinesLoading}
              emptyHint={
                viewTab === "held"
                  ? "No employees on hold. Select staff and click Hold selected."
                  : viewTab === "processed"
                    ? "No processed employees for this month yet."
                    : tableSearch.trim()
                      ? "No employees match this search."
                      : selectedDepartments.length || filterCtc !== "all"
                        ? "No employees match the current filters."
                        : "No active employees found."
              }
              onUpdateLine={updateScopeLine}
              onOpenEmployee={handleOpenScopeEmployee}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelectEmployee}
              onToggleSelectAll={toggleSelectAllVisible}
              readOnly={false}
              showSelect
            />
          ) : (
            <OverviewProcessTable
              rows={overviewRows}
              loading={candidatesLoading}
              emptyHint={
                viewTab === "held"
                  ? "No employees on hold. Select staff and click Hold selected."
                  : viewTab === "processed"
                    ? "No processed employees for this month yet."
                    : tableSearch.trim()
                      ? "No employees match this search."
                      : selectedDepartments.length || filterCtc !== "all"
                        ? "No employees match the current filters."
                        : "No active employees found."
              }
              selectedIds={selectedIds}
              onToggleSelect={toggleSelectEmployee}
              onToggleSelectAll={toggleSelectAllVisible}
              onOpenEmployee={openOverviewEmployee}
            />
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
            <p className="text-[11px] text-slate-600">
              Showing{" "}
              <span className="font-semibold text-slate-800">
                {listView === "overview" ? overviewRows.length : visibleScopeLines.length}
              </span>{" "}
              employee
              {(listView === "overview" ? overviewRows.length : visibleScopeLines.length) === 1
                ? ""
                : "s"}
              {selectedIds.length ? (
                <>
                  {" "}
                  · <span className="text-amber-800">{selectedIds.length} selected</span>
                </>
              ) : null}
              {listView === "overview" && overviewTotals.totalCtc > 0 ? (
                <>
                  {" "}
                  · Total CTC{" "}
                  <span className="font-semibold text-slate-800">
                    ₹{formatINRPlain(overviewTotals.totalCtc)}
                  </span>
                  {" · "}
                  Net{" "}
                  <span className="font-semibold text-slate-800">
                    ₹{formatINRPlain(overviewTotals.totalNet)}
                  </span>
                </>
              ) : null}
              {processPreview.toProcess.length && viewTab !== "held" && viewTab !== "processed" ? (
                <>
                  {" "}
                  ·{" "}
                  <span className="font-semibold text-slate-800">
                    {processPreview.toProcess.length}
                  </span>{" "}
                  to process
                </>
              ) : null}
              {candidates.existingRun ? (
                <>
                  {" "}
                  · sheet rev {candidates.existingRun.revision_no}
                </>
              ) : null}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {viewTab === "held" || processMode === PROCESS_MODES.HOLD ? (
                <button
                  type="button"
                  className={btnGhost}
                  disabled={!selectedIds.length || busy}
                  onClick={() => {
                    releaseSelectedFromHold();
                  }}
                >
                  Release selected
                </button>
              ) : viewTab === "processed" ? (
                <button
                  type="button"
                  className={btnPrimary}
                  disabled={busy || candidatesLoading || !visibleScopeLines.length}
                  onClick={doPublishProcessedSlips}
                >
                  {busy ? "Locking…" : "Processed"}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className={btnGhost}
                    disabled={!selectedIds.length || busy}
                    onClick={() => {
                      holdSelectedEmployees();
                    }}
                  >
                    Hold selected
                  </button>
                  {processMode === PROCESS_MODES.BULK && candidates.existingRun ? (
                    <button
                      type="button"
                      disabled={busy}
                      className={btnGhost}
                      onClick={() => doProcess({ forceFullReprocess: true })}
                      title="Rebuild entire month sheet as new revision"
                    >
                      Full reprocess
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={busy || candidatesLoading || !processPreview.toProcess.length}
                    className={btnPrimary}
                    onClick={() => doProcess()}
                  >
                    <RefreshCw className={`h-3 w-3 ${busy ? "animate-spin" : ""}`} />
                    {busy
                      ? "Processing…"
                      : selectedIds.length
                        ? `Process selected (${processPreview.toProcess.length})`
                        : `Process salary (${processPreview.toProcess.length})`}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </SectionCard>

      <Modal
        open={confirmOpen}
        title="Sheet already exists"
        onClose={() => {
          setConfirmOpen(false);
          setExistingRun(null);
        }}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className={btnGhost}
              onClick={() => {
                setConfirmOpen(false);
                if (existingRun?.id) openRun(existingRun.id);
              }}
            >
              Open existing
            </button>
            <button
              type="button"
              className={btnPrimary}
              onClick={() => doProcess({ forceFullReprocess: true })}
            >
              Full reprocess (new revision)
            </button>
          </div>
        }
      >
        <p className="text-sm text-slate-700">
          All eligible employees are already on the sheet for{" "}
          <span className="font-medium">
            {existingRun
              ? monthLabel(existingRun.pay_year, existingRun.pay_month)
              : monthLabel(year, month)}
          </span>
          {existingRun ? ` (rev ${existingRun.revision_no})` : ""}. Open the sheet, process by
          department for remaining staff, or run a full reprocess from All Employees.
        </p>
      </Modal>

      <SalaryBankImportModal
        open={bankImportOpen}
        employees={candidates.employees || []}
        onClose={() => setBankImportOpen(false)}
        onImported={handleBankImported}
      />
    </div>
  );
}
