import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Download, RefreshCw, Search, Upload } from "lucide-react";
import { formatDateDdMmYyyy } from "../../../utils/dateDisplay";
import FormDateInput from "../../../components/FormDateInput";
import {
  PageTaskHeader,
  SectionCard,
  DenseTable,
  StatusChip,
  Modal,
  CollapsibleHelp,
} from "../components/AdminUi";
import { formatINRPlain } from "./salaryData";
import {
  DEFAULT_MONTH_DAYS,
  getMonthRunByKey,
  getMonthRunWithLines,
  listProcessedSalarySheets,
  monthKey,
  monthLabel,
  processSalaryMonth,
  recomputeLineFromEdits,
  saveMonthRunEdits,
  PROCESS_MODES,
  fetchSalaryProcessCandidates,
  buildSalaryScopePreviewLines,
  getRunSheetNo,
  getMonthHoldIds,
  setMonthHoldIds,
  saveScopeLineDraft,
  syncScopeDraftBankFromMaster,
} from "./salaryMonthProcessing";
import {
  USE_MOCK_SALARY_PROCESSING,
  mockGetMonthRunByKey,
  mockGetMonthRunWithLines,
  mockListProcessedSalarySheets,
  mockProcessSalaryMonth,
  mockSaveMonthRunEdits,
  mockFetchSalaryProcessCandidates,
} from "./salaryProcessingMock";
import { exportSalaryProcessingWorkbook } from "../../../lib/salaryProcessingExcel";
import { SalaryBankImportModal } from "./SalaryBankImportModal";

const numIn =
  "w-[4.25rem] h-7 px-1 text-right text-[11px] tabular-nums border border-slate-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-accent/30 focus:border-accent";
const textIn =
  "h-7 px-1.5 text-[11px] border border-slate-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-accent/30 focus:border-accent";
const selectIn = "h-7 border border-slate-200 rounded px-1.5 text-[11px] bg-white";
const btnGhost =
  "h-7 px-2.5 text-[11px] font-medium rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50";
const btnPrimary =
  "h-7 px-2.5 text-[11px] font-medium rounded bg-accent text-white disabled:opacity-50 inline-flex items-center gap-1";

/** Employee salary line — worksheet controls */
const sheetNumIn =
  "w-[7.5rem] h-9 px-2.5 text-right text-[14px] font-normal tabular-nums text-ink border border-border-strong rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-info/20 focus:border-info";
const sheetTextIn =
  "w-full max-w-[14rem] h-9 px-2.5 text-[14px] font-normal text-ink border border-border-strong rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-info/20 focus:border-info";

function Money({ value, strong = false }) {
  if (value == null || value === "") return <span className="text-ink-disabled">—</span>;
  return (
    <span className={`tabular-nums font-normal ${strong ? "text-ink-strong" : "text-ink"}`}>
      {formatINRPlain(value)}
    </span>
  );
}

function SheetAmt({ value, size = "md" }) {
  if (value == null || value === "") {
    return <span className="text-ink-disabled tabular-nums">—</span>;
  }
  const sizeCls = size === "lg" ? "text-2xl tracking-tight" : "text-[14px]";
  return (
    <span className={`tabular-nums font-normal text-ink-strong ${sizeCls}`}>
      {formatINRPlain(value)}
    </span>
  );
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

function SheetRow({ label, hint, children, tone = "default" }) {
  const rowBg =
    tone === "total"
      ? "bg-info-soft/70"
      : tone === "edit"
        ? "bg-white"
        : "bg-transparent";
  return (
    <div
      className={`grid grid-cols-[minmax(0,1fr)_auto] gap-4 items-center px-4 sm:px-5 py-2.5 border-b border-divider last:border-b-0 ${rowBg}`}
    >
      <div className="min-w-0">
        <p
          className={`text-[13px] ${
            tone === "total" ? "font-semibold text-ink-strong" : "font-medium text-ink"
          }`}
        >
          {label}
        </p>
        {hint ? <p className="text-[11px] text-ink-muted mt-0.5">{hint}</p> : null}
      </div>
      <div className="justify-self-end text-right">{children}</div>
    </div>
  );
}

function Fact({ label, value, mono = false }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-muted">{label}</p>
      <p
        className={`mt-1 text-[13px] text-ink-strong truncate ${mono ? "font-mono" : ""}`}
        title={value == null || value === "" ? undefined : String(value)}
      >
        {value == null || value === "" ? "—" : value}
      </p>
    </div>
  );
}

/**
 * Employee salary line — worksheet layout (summary rail + earn/deduct sheets).
 */
function EmployeeSalaryDetailPage({
  line,
  monthLabelText,
  monthDays,
  onBack,
  onUpdate,
  onSave,
  dirty = false,
  saving = false,
  saveMsg = "",
  saveError = "",
}) {
  if (!line) return null;
  const patch = (p) => onUpdate(line.id, p);
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
    <div className="max-w-[1200px] w-full mx-auto pb-24">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <button
          type="button"
          className="h-9 px-3 text-sm font-medium rounded-lg border border-border bg-white text-ink hover:bg-surface-sunken"
          onClick={() => {
            if (dirty && !window.confirm("Discard unsaved changes?")) return;
            onBack();
          }}
        >
          ← Back to sheet
        </button>
        <div className="flex flex-wrap items-center gap-2">
          {line.alreadyProcessed ? <StatusChip label="On sheet" severity="info" /> : null}
          {dirty ? <StatusChip label="Unsaved" severity="warning" /> : null}
          <button
            type="button"
            disabled={saving || !dirty}
            className="h-9 px-4 text-sm font-medium rounded-lg bg-info text-white disabled:opacity-45 hover:opacity-95"
            onClick={() => onSave?.(line)}
          >
            {saving ? "Saving…" : "Save line"}
          </button>
        </div>
      </div>

      {saveError ? (
        <p className="mb-4 text-sm text-critical rounded-lg border border-critical-border bg-critical-soft px-4 py-2.5">
          {saveError}
        </p>
      ) : null}
      {saveMsg ? (
        <p className="mb-4 text-sm text-success rounded-lg border border-success-border bg-success-soft px-4 py-2.5">
          {saveMsg}
        </p>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-5 items-start">
        {/* Left rail — identity + totals */}
        <aside className="lg:sticky lg:top-3 space-y-4">
          <div className="rounded-2xl border border-info-border bg-info overflow-hidden text-white shadow-card">
            <div className="px-5 pt-5 pb-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/70">
                {monthLabelText}
              </p>
              <h1 className="mt-2 text-xl font-semibold leading-snug tracking-tight">
                {line.employee_name || "Employee"}
              </h1>
              <p className="mt-1.5 text-[12px] text-white/80 font-mono">{line.employee_code || "—"}</p>
              <p className="mt-1 text-[12px] text-white/75">{line.designation || "—"}</p>
            </div>
            <div className="grid grid-cols-2 border-t border-white/15">
              <div className="px-4 py-3 border-r border-white/15">
                <p className="text-[9px] uppercase tracking-[0.1em] text-white/65">Days</p>
                <p className="mt-1 text-lg tabular-nums font-normal">{monthDays}</p>
              </div>
              <div className="px-4 py-3">
                <p className="text-[9px] uppercase tracking-[0.1em] text-white/65">Present</p>
                <p className="mt-1 text-lg tabular-nums font-normal">{line.present_days ?? "—"}</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-white shadow-card overflow-hidden">
            <div className="px-4 py-3 border-b border-divider bg-surface-raised">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
                This month
              </p>
            </div>
            <div className="px-4 py-4 space-y-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
                  Gross wages
                </p>
                <div className="mt-1">
                  <SheetAmt value={line.gross_wages} size="lg" />
                </div>
              </div>
              <div className="h-px bg-divider" />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
                  Total deductions
                </p>
                <div className="mt-1 text-[18px]">
                  <SheetAmt value={line.total_ded} />
                </div>
              </div>
              <div className="rounded-xl bg-info-soft border border-info-border px-3.5 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-info">
                  Net salary
                </p>
                <div className="mt-1 text-info">
                  <SheetAmt value={line.net_salary} size="lg" />
                </div>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
                  Bank amount
                </p>
                <div className="mt-1 text-[18px]">
                  <SheetAmt value={line.bank_amount} />
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Right — worksheets */}
        <div className="space-y-4 min-w-0">
          {/* Profile / bank strip */}
          <section className="rounded-2xl border border-border bg-white shadow-card overflow-hidden">
            <div className="px-5 py-3 border-b border-divider flex items-center justify-between gap-3 bg-surface-raised">
              <h2 className="text-[14px] font-semibold text-ink-strong">Employee & bank</h2>
              <span className="text-[11px] text-ink-muted">Edit account / IFSC if needed</span>
            </div>
            <div className="p-5 grid grid-cols-2 sm:grid-cols-3 gap-x-5 gap-y-4">
              <Fact label="UAN" value={line.uan_no} mono />
              <Fact label="ESIC no." value={line.esic_no} />
              <Fact
                label="Date of joining"
                value={line.date_of_joining ? formatDateDdMmYyyy(line.date_of_joining) : "—"}
              />
              <div className="min-w-0 sm:col-span-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
                  Account number
                </p>
                <input
                  className={`${sheetTextIn} mt-1.5`}
                  value={line.account_no || ""}
                  onChange={(e) => patch({ account_no: e.target.value })}
                />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
                  IFSC
                </p>
                <input
                  className={`${sheetTextIn} mt-1.5`}
                  value={line.ifsc || ""}
                  onChange={(e) => patch({ ifsc: e.target.value })}
                />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
                  Confirmation
                </p>
                <FormDateInput
                  className="mt-1.5 h-9 text-[14px] w-full max-w-[14rem]"
                  value={line.confirmation_date ? String(line.confirmation_date).slice(0, 10) : ""}
                  onChange={(e) => patch({ confirmation_date: e?.target?.value || null })}
                />
              </div>
            </div>
          </section>

          {/* Earnings sheet */}
          <section className="rounded-2xl border border-border bg-white shadow-card overflow-hidden">
            <div className="px-5 py-3 border-b border-info-border bg-info-soft/60 flex items-baseline justify-between gap-3">
              <h2 className="text-[14px] font-semibold text-ink-strong">Earnings</h2>
              <p className="text-[11px] text-ink-muted">White rows are editable</p>
            </div>
            <div>
              <SheetRow label="Gross (CTC rate)">
                <SheetAmt value={line.salary_rate} />
              </SheetRow>
              <SheetRow label="Present days" hint="Drives earned amounts" tone="edit">
                <input
                  type="number"
                  step="0.5"
                  className={sheetNumIn}
                  value={line.present_days ?? ""}
                  onChange={(e) => patch({ present_days: e.target.value })}
                />
              </SheetRow>
              <SheetRow label="PF basic" tone="edit">
                <input
                  type="number"
                  className={sheetNumIn}
                  value={line.pf_basic ?? ""}
                  onChange={(e) => patch({ pf_basic: e.target.value })}
                />
              </SheetRow>
              <SheetRow label="PF earn">
                <SheetAmt value={line.pf_earned_basic} />
              </SheetRow>
              <SheetRow label="Basic">
                <SheetAmt value={line.basic_full} />
              </SheetRow>
              <SheetRow label="Basic earned">
                <SheetAmt value={line.basic_earned} />
              </SheetRow>
              <SheetRow label="HRA">
                <SheetAmt value={line.hra_earned} />
              </SheetRow>
              <SheetRow label="Special allowance">
                <SheetAmt value={line.special_allowance} />
              </SheetRow>
              <SheetRow label="Custom +" hint={customEarnTitle} tone="edit">
                <input
                  type="number"
                  className={sheetNumIn}
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
                />
              </SheetRow>
              <SheetRow label="Gross wages" tone="total">
                <SheetAmt value={line.gross_wages} />
              </SheetRow>
            </div>
          </section>

          {/* Deductions sheet */}
          <section className="rounded-2xl border border-border bg-white shadow-card overflow-hidden">
            <div className="px-5 py-3 border-b border-divider bg-surface-raised flex items-baseline justify-between gap-3">
              <h2 className="text-[14px] font-semibold text-ink-strong">Deductions</h2>
              <p className="text-[11px] text-ink-muted">Loan, advance, TDS — edit as needed</p>
            </div>
            <div>
              <SheetRow label="Employee PF (12%)">
                <SheetAmt value={line.emp_pf} />
              </SheetRow>
              <SheetRow label="ESIC">
                <SheetAmt value={line.emp_esic} />
              </SheetRow>
              <SheetRow label="Professional tax" tone="edit">
                <input
                  type="number"
                  className={sheetNumIn}
                  value={line.pt_amount ?? ""}
                  onChange={(e) => patch({ pt_amount: e.target.value })}
                />
              </SheetRow>
              <SheetRow label="Loan" tone="edit">
                <input
                  type="number"
                  className={sheetNumIn}
                  value={line.loan ?? 0}
                  onChange={(e) => patch({ loan: e.target.value })}
                />
              </SheetRow>
              <SheetRow label="Salary advance" tone="edit">
                <input
                  type="number"
                  className={sheetNumIn}
                  value={line.sal_adv ?? 0}
                  onChange={(e) => patch({ sal_adv: e.target.value })}
                />
              </SheetRow>
              <SheetRow label="Unpaid / Paid" tone="edit">
                <input
                  type="number"
                  className={sheetNumIn}
                  value={line.unpaid_paid ?? 0}
                  onChange={(e) => patch({ unpaid_paid: e.target.value })}
                />
              </SheetRow>
              <SheetRow label="TDS" tone="edit">
                <input
                  type="number"
                  className={sheetNumIn}
                  value={line.tds ?? 0}
                  onChange={(e) => patch({ tds: e.target.value })}
                />
              </SheetRow>
              <SheetRow label="Custom −" hint={customDedTitle} tone="edit">
                <input
                  type="number"
                  className={sheetNumIn}
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
                />
              </SheetRow>
              <SheetRow label="Total deductions" tone="total">
                <SheetAmt value={line.total_ded} />
              </SheetRow>
            </div>
          </section>
        </div>
      </div>

      {/* Sticky save bar */}
      <div className="fixed bottom-0 inset-x-0 z-20 pointer-events-none">
        <div className="max-w-[1200px] mx-auto px-4 pb-4 pointer-events-auto">
          <div className="rounded-xl border border-border bg-white/95 backdrop-blur shadow-lg px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[12px] text-ink-muted truncate">
                {line.employee_name} · Net{" "}
                <span className="text-ink-strong tabular-nums">
                  {formatINRPlain(line.net_salary)}
                </span>
              </p>
              <p className="text-[11px] text-ink-muted">
                {dirty ? "Unsaved edits on this line" : "All changes saved"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="h-9 px-3 text-sm font-medium rounded-lg border border-border bg-white hover:bg-surface-sunken"
                onClick={() => {
                  if (dirty && !window.confirm("Discard unsaved changes?")) return;
                  onBack();
                }}
              >
                Back
              </button>
              <button
                type="button"
                disabled={saving || !dirty}
                className="h-9 px-4 text-sm font-medium rounded-lg bg-info text-white disabled:opacity-45"
                onClick={() => onSave?.(line)}
              >
                {saving ? "Saving…" : "Save line"}
              </button>
            </div>
          </div>
        </div>
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
  const selectable = lines.filter((l) => !l.alreadyProcessed);
  const allSelected =
    selectable.length > 0 &&
    selectable.every((l) => selectedIds.some((id) => String(id) === String(l.employee_master_id)));
  const colCount = SCOPE_HEADERS.length + (showSelect ? 1 : 0);

  return (
    <div className="overflow-auto rounded border border-slate-200 max-h-[min(28rem,50vh)]">
      <table className="min-w-[1180px] w-full border-collapse">
        <thead className="sticky top-0 z-10 bg-slate-50">
          <tr>
            {showSelect ? (
              <th className="w-9 px-1.5 py-1.5 border-b border-slate-200">
                <input
                  type="checkbox"
                  className="rounded border-slate-300"
                  checked={allSelected}
                  disabled={!selectable.length}
                  onChange={() => onToggleSelectAll?.(!allSelected)}
                  aria-label="Select all visible employees"
                  onClick={(e) => e.stopPropagation()}
                />
              </th>
            ) : null}
            {SCOPE_HEADERS.map((h) => (
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
          {loading ? (
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
                  line.alreadyProcessed ? "bg-slate-50/80 opacity-70" : "bg-white hover:bg-slate-50/80",
                  checked ? "bg-amber-50/50" : "",
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
                      disabled={line.alreadyProcessed && false}
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
                </td>
                <td
                  className="px-0.5 py-0.5 border-b border-slate-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  {readOnly ? (
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
                  {readOnly ? (
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
                <td
                  className="px-0.5 py-0.5 border-b border-slate-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  {readOnly ? (
                    <span className="px-1.5 text-[11px] tabular-nums">{line.present_days ?? "—"}</span>
                  ) : (
                    <input
                      type="number"
                      step="0.5"
                      className={numIn}
                      value={line.present_days ?? ""}
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
                  {readOnly ? (
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
                  {readOnly ? (
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
                  {readOnly ? (
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
                  {readOnly ? (
                    <Money value={line.unpaid_paid} />
                  ) : (
                    <input
                      type="number"
                      className={numIn}
                      value={line.unpaid_paid ?? 0}
                      onChange={(e) => onUpdateLine(line.id, { unpaid_paid: e.target.value })}
                    />
                  )}
                </td>
                <td
                  className="px-0.5 py-0.5 border-b border-slate-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  {readOnly ? (
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
                  {readOnly ? (
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

function currentYearMonth() {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

const api = {
  listProcessedSheets: () =>
    USE_MOCK_SALARY_PROCESSING
      ? Promise.resolve(mockListProcessedSalarySheets())
      : listProcessedSalarySheets(),
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
  save: (id, lines) =>
    USE_MOCK_SALARY_PROCESSING ? mockSaveMonthRunEdits(id, lines) : saveMonthRunEdits(id, lines),
  fetchCandidates: (args) =>
    USE_MOCK_SALARY_PROCESSING
      ? mockFetchSalaryProcessCandidates(args)
      : fetchSalaryProcessCandidates(args),
};

export default function SalaryProcessing() {
  const now = currentYearMonth();
  const [year, setYear] = useState(now.year);
  const [month, setMonth] = useState(now.month);
  const [monthDays, setMonthDays] = useState(DEFAULT_MONTH_DAYS);
  const [includeWithoutCtc, setIncludeWithoutCtc] = useState(false);
  const [tableSearch, setTableSearch] = useState("");
  const [processMode, setProcessMode] = useState(PROCESS_MODES.BULK);
  const [selectedDepartments, setSelectedDepartments] = useState([]);
  const [holdIds, setHoldIds] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [scopeLines, setScopeLines] = useState([]);
  const [scopeLinesLoading, setScopeLinesLoading] = useState(false);
  const [detailLineId, setDetailLineId] = useState(null);
  const [detailDirty, setDetailDirty] = useState(false);
  const [detailSaving, setDetailSaving] = useState(false);
  const [detailSaveMsg, setDetailSaveMsg] = useState("");
  const [detailSaveError, setDetailSaveError] = useState("");
  const [candidates, setCandidates] = useState({
    employees: [],
    departments: [],
    departmentStats: {},
    existingRun: null,
  });
  const [candidatesLoading, setCandidatesLoading] = useState(false);

  const [processedSheets, setProcessedSheets] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

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

  const loadRuns = useCallback(async () => {
    setListLoading(true);
    setError("");
    try {
      const sheetRows = await api.listProcessedSheets();
      setProcessedSheets(sheetRows);
    } catch (err) {
      console.error(err);
      setError(err?.message || "Could not load processed salary sheets.");
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRuns();
  }, [loadRuns]);

  const loadCandidates = useCallback(async () => {
    setCandidatesLoading(true);
    try {
      const data = await api.fetchCandidates({ year, month, includeWithoutCtc });
      setCandidates(data);
      const holds = Array.isArray(data.holdIds)
        ? data.holdIds.map(String)
        : getMonthHoldIds(monthKey(year, month));
      setHoldIds(holds);
      setSelectedDepartments((prev) =>
        prev.filter((d) => (data.departments || []).includes(d))
      );
    } catch (err) {
      console.warn("Salary process candidates load failed", err);
      setCandidates({ employees: [], departments: [], departmentStats: {}, existingRun: null });
      setHoldIds(getMonthHoldIds(monthKey(year, month)));
    } finally {
      setCandidatesLoading(false);
    }
  }, [year, month, includeWithoutCtc]);

  useEffect(() => {
    loadCandidates();
  }, [loadCandidates]);

  const handleBankImported = useCallback(
    async ({ message, rows } = {}) => {
      for (const row of rows || []) {
        if (!row?.employeeMasterId) continue;
        syncScopeDraftBankFromMaster(row.employeeMasterId, {
          account_no: row.accountNo,
          ifsc: row.ifsc,
        });
      }
      setNotice(message || "Bank details saved to Employee Master.");
      setError("");
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

  const processPreview = useMemo(() => {
    const rows = candidates.employees || [];
    const holdSet = new Set(holdIds.map(String));
    const selectedSet = new Set(selectedIds.map(String));
    let pool = rows.filter((e) => e.eligible && !holdSet.has(String(e.id)));
    if (processMode === PROCESS_MODES.DEPT) {
      const deptSet = new Set(selectedDepartments);
      pool = pool.filter((e) => deptSet.has(e.department));
    } else if (processMode === PROCESS_MODES.HOLD) {
      pool = [];
    }
    // If user ticked employees, process only those (still not held)
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
      if (processMode === PROCESS_MODES.DEPT) {
        return selectedDepartments.includes(e.department) && !holdSet.has(String(e.id));
      }
      return !holdSet.has(String(e.id));
    });
    const withoutCtc = inScope.filter((e) => !e.hasCtc).length;
    const onHoldCount = rows.filter((e) => holdSet.has(String(e.id))).length;
    return { pool, toProcess, skipped, inScope, withoutCtc, onHoldCount };
  }, [candidates.employees, processMode, selectedDepartments, holdIds, selectedIds]);

  const toggleDepartment = useCallback((dept) => {
    setSelectedDepartments((prev) =>
      prev.includes(dept) ? prev.filter((d) => d !== dept) : [...prev, dept]
    );
    setSelectedIds([]);
  }, []);

  const scopeEmployees = useMemo(() => {
    const holdSet = new Set(holdIds.map(String));
    if (processMode === PROCESS_MODES.HOLD) {
      // Hold tab: everyone marked hold for this month
      return (candidates.employees || []).filter((e) => holdSet.has(String(e.id)));
    }
    let rows = (candidates.employees || []).filter(
      (e) => e.eligible && !holdSet.has(String(e.id))
    );
    if (processMode === PROCESS_MODES.DEPT) {
      if (!selectedDepartments.length) return [];
      const deptSet = new Set(selectedDepartments);
      rows = rows.filter((e) => deptSet.has(e.department));
    }
    return rows;
  }, [candidates.employees, processMode, selectedDepartments, holdIds]);

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
      const visible = visibleScopeLines.map((l) => String(l.employee_master_id)).filter(Boolean);
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
    [visibleScopeLines]
  );

  const holdSelectedEmployees = useCallback(() => {
    if (!selectedIds.length) {
      setError("Select at least one employee to put on hold.");
      return;
    }
    const key = monthKey(year, month);
    const next = [...new Set([...holdIds.map(String), ...selectedIds.map(String)])];
    setMonthHoldIds(key, next);
    setHoldIds(next);
    setSelectedIds([]);
    setNotice(`${selectedIds.length} employee(s) moved to Hold — excluded from salary process.`);
    setError("");
    window.setTimeout(() => setNotice(""), 2500);
    loadCandidates();
  }, [selectedIds, holdIds, year, month, loadCandidates]);

  const releaseSelectedFromHold = useCallback(() => {
    if (!selectedIds.length) {
      setError("Select at least one employee to release from hold.");
      return;
    }
    const key = monthKey(year, month);
    const drop = new Set(selectedIds.map(String));
    const next = holdIds.map(String).filter((id) => !drop.has(id));
    setMonthHoldIds(key, next);
    setHoldIds(next);
    setSelectedIds([]);
    setNotice(`${drop.size} employee(s) released from Hold.`);
    setError("");
    window.setTimeout(() => setNotice(""), 2500);
    loadCandidates();
  }, [selectedIds, holdIds, year, month, loadCandidates]);

  // Clear row selection / search when month / tab / CTC filter changes
  useEffect(() => {
    setSelectedIds([]);
  }, [year, month, processMode, includeWithoutCtc]);

  useEffect(() => {
    setTableSearch("");
  }, [year, month, processMode, includeWithoutCtc]);

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
    setScopeLinesLoading(true);
    (async () => {
      try {
        const built = await buildSalaryScopePreviewLines({
          employees: scopeEmployees,
          year,
          month,
          monthDays,
        });
        if (!cancelled) setScopeLines(built);
      } catch (err) {
        console.warn("Salary scope preview failed", err);
        if (!cancelled) setScopeLines([]);
      } finally {
        if (!cancelled) setScopeLinesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scopeEmployees, year, month, monthDays, processMode, detailLineId]);

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
          return recomputeLineFromEdits({ ...row, ...patch }, monthDays);
        })
      );
      if (detailLineId && id === detailLineId) {
        setDetailDirty(true);
        setDetailSaveMsg("");
        setDetailSaveError("");
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
      setDetailSaveMsg("");
      setDetailSaveError("");
    }
  }, []);

  const saveEmployeeDetail = useCallback(
    async (line) => {
      if (!line?.employee_master_id) return;
      setDetailSaving(true);
      setDetailSaveError("");
      setDetailSaveMsg("");
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
            setDetailSaveMsg("Saved to salary sheet.");
          } else {
            setDetailSaveMsg("Saved. Changes apply when you process salary.");
          }
        } else {
          setDetailSaveMsg("Saved. Changes apply when you process salary.");
        }
        setDetailDirty(false);
        window.setTimeout(() => setDetailSaveMsg(""), 2500);
      } catch (err) {
        console.error("Salary detail save failed", err);
        setDetailSaveError(err?.message || "Could not save employee salary details.");
      } finally {
        setDetailSaving(false);
      }
    },
    [year, month, monthDays, candidates.existingRun, loadCandidates]
  );

  const openRun = useCallback(async (runId) => {
    setBusy(true);
    setError("");
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
      setError(err?.message || "Could not open salary sheet.");
    } finally {
      setBusy(false);
    }
  }, []);

  const doProcess = useCallback(
    async ({ forceFullReprocess = false } = {}) => {
      if (processMode === PROCESS_MODES.HOLD) {
        setError("Hold employees are excluded from processing. Release them first, or process from All / By department.");
        return;
      }
      setBusy(true);
      setError("");
      setNotice("");
      try {
        const key = monthKey(year, month);
        const isBulk = processMode === PROCESS_MODES.BULK && !selectedIds.length;
        if (isBulk && forceFullReprocess) {
          const existing = await api.getByKey(key);
          if (!existing) {
            forceFullReprocess = false;
          }
        } else if (isBulk && !forceFullReprocess && !candidates.existingRun) {
          // first all-run for month — proceed
        } else if (isBulk && !forceFullReprocess && candidates.existingRun && processPreview.toProcess.length === 0) {
          setExistingRun(candidates.existingRun);
          setConfirmOpen(true);
          setBusy(false);
          return;
        }

        const useSelect = selectedIds.length > 0;
        const result = await api.process({
          year,
          month,
          monthDays,
          includeWithoutCtc,
          processMode: useSelect
            ? PROCESS_MODES.SELECT
            : processMode,
          employeeIds: useSelect ? selectedIds : [],
          departments: useSelect ? [] : selectedDepartments,
          forceFullReprocess: isBulk && forceFullReprocess,
        });
        const meta = result.processMeta || {};
        let msg = `Processed ${meta.processedCount ?? result.run.employee_count} employee(s) for ${monthLabel(year, month)}`;
        if (meta.skippedDuplicateCount > 0) {
          msg += ` · skipped ${meta.skippedDuplicateCount} already on sheet`;
        }
        if (result.run.revision_no) {
          msg += ` (rev ${result.run.revision_no})`;
        }
        msg += ". Payslips generated.";
        setNotice(msg);
        setSelectedIds([]);
        await loadRuns();
        await loadCandidates();
        setRun(result.run);
        setLines(result.lines || []);
        setDirty(false);
        setEditorOpen(true);
        setConfirmOpen(false);
        setExistingRun(null);
      } catch (err) {
        console.error(err);
        setError(err?.message || "Salary processing failed.");
      } finally {
        setBusy(false);
      }
    },
    [
      year,
      month,
      monthDays,
      includeWithoutCtc,
      processMode,
      selectedDepartments,
      selectedIds,
      candidates.existingRun,
      processPreview.toProcess.length,
      loadRuns,
      loadCandidates,
    ]
  );

  const updateLine = useCallback(
    (id, patch) => {
      setLines((prev) =>
        prev.map((row) => {
          if (row.id !== id) return row;
          return recomputeLineFromEdits({ ...row, ...patch }, run?.month_days || monthDays);
        })
      );
      setDirty(true);
    },
    [run?.month_days, monthDays]
  );

  const handleSave = useCallback(async () => {
    if (!run?.id) return;
    setSaving(true);
    setError("");
    try {
      const result = await api.save(run.id, lines);
      setRun(result.run);
      setLines(result.lines || []);
      setDirty(false);
      setNotice(
        `Saved as revision ${result.run.revision_no}. Payslips updated. Employee Master loan / advances / TDS synced from this sheet.`
      );
      await loadRuns();
    } catch (err) {
      console.error(err);
      setError(err?.message || "Could not save sheet edits.");
    } finally {
      setSaving(false);
    }
  }, [run?.id, lines, loadRuns]);

  const handleExport = useCallback(async () => {
    if (!run) return;
    try {
      await exportSalaryProcessingWorkbook({ run, lines });
    } catch (err) {
      console.error(err);
      setError(err?.message || "Excel export failed.");
    }
  }, [run, lines]);

  const filteredLines = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return lines;
    return lines.filter((l) => {
      const hay = `${l.employee_code || ""} ${l.employee_name || ""} ${l.designation || ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [lines, q]);

  const processedSheetRows = useMemo(
    () => processedSheets.map((row, idx) => ({ ...row, sr_no: idx + 1 })),
    [processedSheets]
  );

  const listColumns = useMemo(
    () => [
      {
        key: "sr_no",
        label: "Sr No",
        cellClassName: "tabular-nums text-center w-12",
        headerClassName: "text-center w-12",
        render: (row) => row.sr_no,
      },
      {
        key: "salary_sheet_no",
        label: "Salary sheet no",
        render: (row) => (
          <span className="font-mono text-[10px] text-slate-700">{row.salary_sheet_no || "—"}</span>
        ),
      },
      {
        key: "month",
        label: "Month",
        render: (row) => monthLabel(row.pay_year, row.pay_month),
      },
      {
        key: "process_label",
        label: "Process type",
        render: (row) => row.process_label || "—",
      },
      {
        key: "employee_count",
        label: "Emps",
        cellClassName: "tabular-nums text-right",
        headerClassName: "text-right",
      },
      {
        key: "total_net",
        label: "Net total",
        headerClassName: "text-right",
        cellClassName: "text-right tabular-nums",
        render: (row) => formatINRPlain(row.total_net),
      },
      {
        key: "revision_no",
        label: "Rev",
        render: (row) => row.revision_no ?? "—",
      },
      {
        key: "updated_at",
        label: "Updated",
        render: (row) =>
          row.updated_at ? formatDateDdMmYyyy(String(row.updated_at).slice(0, 10)) : "—",
      },
      {
        key: "actions",
        label: "Actions",
        render: (row) => (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="text-[11px] font-medium text-accent hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                openRun(row.run_id);
              }}
            >
              Open
            </button>
            <button
              type="button"
              className="text-[11px] font-medium text-slate-600 hover:underline"
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  const data = await api.getWithLines(row.run_id);
                  await exportSalaryProcessingWorkbook(data);
                } catch (err) {
                  console.error(err);
                  setError(err?.message || "Export failed.");
                }
              }}
            >
              Export
            </button>
          </div>
        ),
      },
    ],
    [openRun]
  );

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
          setDetailSaveMsg("");
          setDetailSaveError("");
        }}
        onUpdate={updateScopeLine}
        onSave={saveEmployeeDetail}
        dirty={detailDirty}
        saving={detailSaving}
        saveMsg={detailSaveMsg}
        saveError={detailSaveError}
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
              setNotice("");
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

        {error ? (
          <p className="text-xs text-red-600 rounded border border-red-100 bg-red-50 px-2.5 py-1.5">{error}</p>
        ) : null}
        {notice ? (
          <p className="text-xs text-emerald-800 rounded border border-emerald-100 bg-emerald-50 px-2.5 py-1.5">
            {notice}
          </p>
        ) : null}

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
                      value={line.unpaid_paid ?? 0}
                      onChange={(e) => updateLine(line.id, { unpaid_paid: e.target.value })}
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
        subtitle="Build monthly salary sheets from Employee Master."
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
        Import bank details (or use Employee Master Excel) to save Account / IFSC / UAN / ESIC by employee
        code. Tick employees on All or By department, then Hold selected or Process salary. CTC from
        Employee Master drives Gross / PF / ESIC; imported account details fill Account and IFSC on the
        sheet. Manual cells recompute with the same sheet formulas.
      </CollapsibleHelp>

      {error ? (
        <p className="text-xs text-red-600 rounded border border-red-100 bg-red-50 px-2.5 py-1.5">{error}</p>
      ) : null}
      {notice ? (
        <p className="text-xs text-emerald-800 rounded border border-emerald-100 bg-emerald-50 px-2.5 py-1.5">
          {notice}
        </p>
      ) : null}

      <SectionCard
        title="Process month"
        className="[&_.erp-card-header]:min-h-0 [&_.erp-card-header]:py-2 [&_.erp-card-body]:p-2.5"
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-2.5">
            <label className="text-[10px] uppercase tracking-wide text-slate-500 space-y-0.5">
              <span className="block">Month</span>
              <select
                className={selectIn}
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {new Date(2000, m - 1, 1).toLocaleString("en-IN", { month: "short" })}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[10px] uppercase tracking-wide text-slate-500 space-y-0.5">
              <span className="block">Year</span>
              <select
                className={selectIn}
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
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
                onChange={(e) => setMonthDays(Number(e.target.value) || DEFAULT_MONTH_DAYS)}
              />
            </label>
            <label className="flex items-center gap-1.5 text-[11px] text-slate-600 pb-1">
              <input
                type="checkbox"
                className="rounded border-slate-300"
                checked={includeWithoutCtc}
                onChange={(e) => setIncludeWithoutCtc(e.target.checked)}
              />
              Without CTC only
            </label>
          </div>

          <div
            role="tablist"
            aria-label="Process scope"
            className="flex flex-wrap gap-0 border-b border-slate-200"
          >
            {[
              { id: PROCESS_MODES.BULK, label: "All" },
              { id: PROCESS_MODES.DEPT, label: "By department" },
              { id: PROCESS_MODES.HOLD, label: "Hold" },
            ].map((opt) => {
              const active = processMode === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setProcessMode(opt.id)}
                  className={`h-8 px-3 text-[11px] font-semibold border-b-2 -mb-px transition-colors ${
                    active
                      ? "border-accent text-accent"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {opt.label}
                  {opt.id === PROCESS_MODES.HOLD && holdIds.length > 0 ? (
                    <span className={`ml-1 tabular-nums ${active ? "text-accent/80" : "text-slate-400"}`}>
                      ({holdIds.length})
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {processMode === PROCESS_MODES.DEPT ? (
            <div className="rounded border border-slate-200 bg-slate-50/80 p-2.5 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Departments</p>
              {candidatesLoading ? (
                <p className="text-xs text-slate-500">Loading…</p>
              ) : !(candidates.departments || []).length ? (
                <p className="text-xs text-slate-500">No departments found on active employees.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {(candidates.departments || []).map((dept) => {
                    const stats = candidates.departmentStats?.[dept] || {
                      total: 0,
                      pending: 0,
                      eligible: 0,
                      processed: 0,
                    };
                    const selected = selectedDepartments.includes(dept);
                    return (
                      <button
                        key={dept}
                        type="button"
                        onClick={() => toggleDepartment(dept)}
                        className={`h-7 px-2 text-[11px] rounded border ${
                          selected
                            ? "bg-indigo-600 text-white border-indigo-600"
                            : "bg-white text-slate-700 border-slate-200"
                        }`}
                        title={`${stats.pending} ready · ${stats.eligible} ${includeWithoutCtc ? "without CTC" : "with CTC"} · ${stats.total} active`}
                      >
                        {dept}
                        <span className={`ml-1 ${selected ? "text-indigo-100" : "text-slate-400"}`}>
                          ({stats.pending}/{stats.total})
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
              <input
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                className={`${textIn} pl-6 w-56`}
                placeholder="Search code / name / dept"
                aria-label="Search employees in table"
              />
            </div>
            <span className="text-[11px] text-slate-500">
              {visibleScopeLines.length}
              {tableSearch.trim() ? ` of ${scopeLines.length}` : ""} row
              {visibleScopeLines.length === 1 ? "" : "s"}
            </span>
          </div>

          <ScopeSalarySheetTable
            lines={visibleScopeLines}
            loading={candidatesLoading || scopeLinesLoading}
            emptyHint={
              processMode === PROCESS_MODES.HOLD
                ? "No employees on hold. Select staff on All / By department and click Hold selected."
                : processMode === PROCESS_MODES.DEPT && !selectedDepartments.length
                  ? "Select one or more departments to preview employees."
                  : tableSearch.trim()
                    ? "No employees match this search."
                    : includeWithoutCtc
                      ? "No employees without CTC in this scope."
                      : "No employees with CTC in this scope."
            }
            onUpdateLine={updateScopeLine}
            onOpenEmployee={openEmployeeDetail}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelectEmployee}
            onToggleSelectAll={toggleSelectAllVisible}
            readOnly={false}
            showSelect
          />

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
            <p className="text-[11px] text-slate-600">
              {candidatesLoading || scopeLinesLoading ? (
                "Checking eligibility…"
              ) : processMode === PROCESS_MODES.HOLD ? (
                <>
                  <span className="font-semibold text-slate-800">{holdIds.length}</span> on hold
                  {selectedIds.length ? (
                    <>
                      {" "}
                      · <span className="text-amber-800">{selectedIds.length} selected</span>
                    </>
                  ) : null}
                  <span className="text-slate-500"> · not included in Process salary</span>
                </>
              ) : (
                <>
                  <span className="font-semibold text-slate-800">{scopeLines.length}</span> in sheet
                  {" · "}
                  <span className="font-semibold text-slate-800">{processPreview.toProcess.length}</span> to
                  process
                  {selectedIds.length ? (
                    <>
                      {" "}
                      · <span className="text-amber-800">{selectedIds.length} selected</span>
                    </>
                  ) : null}
                  {holdIds.length ? (
                    <>
                      {" "}
                      · <span className="text-amber-800">{holdIds.length} on hold</span>
                    </>
                  ) : null}
                  {processPreview.skipped.length ? (
                    <>
                      {" "}
                      · <span className="text-amber-700">{processPreview.skipped.length} already on sheet</span>
                    </>
                  ) : null}
                  {processPreview.withoutCtc > 0 && !includeWithoutCtc ? (
                    <>
                      {" "}
                      ·{" "}
                      <span className="text-slate-500">
                        {processPreview.withoutCtc} without CTC (use Without CTC only)
                      </span>
                    </>
                  ) : null}
                  {candidates.existingRun ? (
                    <>
                      {" "}
                      · sheet rev {candidates.existingRun.revision_no}
                    </>
                  ) : null}
                </>
              )}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {processMode === PROCESS_MODES.HOLD ? (
                <button
                  type="button"
                  className={btnGhost}
                  disabled={!selectedIds.length || busy}
                  onClick={() => {
                    setError("");
                    releaseSelectedFromHold();
                  }}
                >
                  Release selected
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className={btnGhost}
                    disabled={!selectedIds.length || busy}
                    onClick={() => {
                      setError("");
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
                        : "Process salary"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Processed sheets"
        className="[&_.erp-card-header]:min-h-0 [&_.erp-card-header]:py-2 [&_.erp-card-body]:p-2.5"
        right={
          <button type="button" className="text-[11px] text-accent hover:underline" onClick={loadRuns}>
            Refresh
          </button>
        }
      >
        {listLoading ? (
          <p className="text-xs text-slate-500 py-3">Loading…</p>
        ) : (
          <DenseTable
            columns={listColumns}
            rows={processedSheetRows}
            rowKey="id"
            onRowClick={(row) => openRun(row.run_id)}
            showSerialNumber={false}
            stickyHeader
            scrollMaxHeight="calc(100dvh - 18rem)"
            density="compact"
          />
        )}
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
          department for remaining staff, or run a full reprocess from All.
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
