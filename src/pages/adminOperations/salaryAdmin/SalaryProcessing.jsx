import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Download, RefreshCw, Search, Upload } from "lucide-react";
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
import {
  DEFAULT_MONTH_DAYS,
  getMonthRunByKey,
  getMonthRunWithLines,
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

const DETAIL_FIELD_CLASS =
  "rounded border border-slate-200 bg-white px-2.5 py-2 min-h-[3.25rem] flex flex-col justify-center gap-0.5";
const DETAIL_LABEL_CLASS = "text-[9px] font-semibold uppercase tracking-wide text-slate-500";

function DetailField({ label, children, className = "" }) {
  return (
    <div className={`${DETAIL_FIELD_CLASS} ${className}`}>
      <span className={DETAIL_LABEL_CLASS}>{label}</span>
      <div className="text-[12px] text-slate-800 min-w-0">{children}</div>
    </div>
  );
}

/**
 * Full employee salary detail page — all sheet columns, same manual + formula fields.
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
    <div className="space-y-3 max-w-[1100px] w-full mx-auto">
      <PageTaskHeader
        className="mb-0"
        title={line.employee_name || "Employee"}
        subtitle={
          <>
            <span className="font-mono text-[11px] text-slate-600">{line.employee_code || "—"}</span>
            <span className="mx-1.5 text-slate-300">·</span>
            {line.designation || "—"}
            <span className="mx-1.5 text-slate-300">·</span>
            {monthLabelText}
            <span className="mx-1.5 text-slate-300">·</span>
            {monthDays} days
          </>
        }
      >
        {line.alreadyProcessed ? <StatusChip label="On sheet" severity="info" /> : null}
        {dirty ? <StatusChip label="Unsaved" severity="warning" /> : null}
        <button
          type="button"
          className={btnGhost}
          onClick={() => {
            if (dirty && !window.confirm("Discard unsaved changes?")) return;
            onBack();
          }}
        >
          Back
        </button>
        <button
          type="button"
          className={btnPrimary}
          disabled={saving || !dirty}
          onClick={() => onSave?.(line)}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </PageTaskHeader>

      {saveError ? (
        <p className="text-xs text-red-600 rounded border border-red-100 bg-red-50 px-2.5 py-1.5">{saveError}</p>
      ) : null}
      {saveMsg ? (
        <p className="text-xs text-emerald-800 rounded border border-emerald-100 bg-emerald-50 px-2.5 py-1.5">
          {saveMsg}
        </p>
      ) : null}

      <SectionCard
        title="Employee & bank"
        className="[&_.erp-card-header]:min-h-0 [&_.erp-card-header]:py-2 [&_.erp-card-body]:p-2.5"
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          <DetailField label="Code">
            <span className="font-mono font-medium" title={line.employee_code || undefined}>
              {line.employee_code || "—"}
            </span>
          </DetailField>
          <DetailField label="Name" className="sm:col-span-2">
            <span className="font-medium" title={line.employee_name || undefined}>
              {line.employee_name || "—"}
            </span>
          </DetailField>
          <DetailField label="Desig.">
            <span title={line.designation || undefined}>{line.designation || "—"}</span>
          </DetailField>
          <DetailField label="Account">
            <input
              className={`${textIn} w-full`}
              value={line.account_no || ""}
              title={line.account_no || undefined}
              onChange={(e) => patch({ account_no: e.target.value })}
            />
          </DetailField>
          <DetailField label="IFSC">
            <input
              className={`${textIn} w-full`}
              value={line.ifsc || ""}
              title={line.ifsc || undefined}
              onChange={(e) => patch({ ifsc: e.target.value })}
            />
          </DetailField>
          <DetailField label="UAN">
            <span className="font-mono text-[11px]" title={line.uan_no || undefined}>
              {line.uan_no || "—"}
            </span>
          </DetailField>
          <DetailField label="ESIC no.">
            <span className="text-[11px]" title={line.esic_no || undefined}>
              {line.esic_no || "—"}
            </span>
          </DetailField>
          <DetailField label="DOJ">
            {line.date_of_joining ? formatDateDdMmYyyy(line.date_of_joining) : "—"}
          </DetailField>
          <DetailField label="Conf.">
            <FormDateInput
              compact
              className="h-7 text-[11px] w-full"
              value={line.confirmation_date ? String(line.confirmation_date).slice(0, 10) : ""}
              onChange={(e) => patch({ confirmation_date: e?.target?.value || null })}
            />
          </DetailField>
        </div>
      </SectionCard>

      <SectionCard
        title="Earnings"
        className="[&_.erp-card-header]:min-h-0 [&_.erp-card-header]:py-2 [&_.erp-card-body]:p-2.5"
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          <DetailField label="Gross">
            <Money value={line.salary_rate} strong />
          </DetailField>
          <DetailField label="P.Days">
            <input
              type="number"
              step="0.5"
              className={`${numIn} w-full`}
              value={line.present_days ?? ""}
              onChange={(e) => patch({ present_days: e.target.value })}
            />
          </DetailField>
          <DetailField label="PF Basic">
            <input
              type="number"
              className={`${numIn} w-full`}
              value={line.pf_basic ?? ""}
              onChange={(e) => patch({ pf_basic: e.target.value })}
            />
          </DetailField>
          <DetailField label="PF earn">
            <Money value={line.pf_earned_basic} />
          </DetailField>
          <DetailField label="Basic">
            <Money value={line.basic_full} />
          </DetailField>
          <DetailField label="B.earn">
            <Money value={line.basic_earned} />
          </DetailField>
          <DetailField label="HRA">
            <Money value={line.hra_earned} />
          </DetailField>
          <DetailField label="Special">
            <Money value={line.special_allowance} />
          </DetailField>
          <DetailField label="Custom+">
            <input
              type="number"
              className={`${numIn} w-full`}
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
          </DetailField>
          <DetailField label="Gross W">
            <Money value={line.gross_wages} strong />
          </DetailField>
        </div>
      </SectionCard>

      <SectionCard
        title="Deductions & net"
        className="[&_.erp-card-header]:min-h-0 [&_.erp-card-header]:py-2 [&_.erp-card-body]:p-2.5"
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          <DetailField label="PF 12%">
            <Money value={line.emp_pf} />
          </DetailField>
          <DetailField label="ESIC">
            <Money value={line.emp_esic} />
          </DetailField>
          <DetailField label="PT">
            <input
              type="number"
              className={`${numIn} w-full`}
              value={line.pt_amount ?? ""}
              onChange={(e) => patch({ pt_amount: e.target.value })}
            />
          </DetailField>
          <DetailField label="Loan">
            <input
              type="number"
              className={`${numIn} w-full`}
              value={line.loan ?? 0}
              onChange={(e) => patch({ loan: e.target.value })}
            />
          </DetailField>
          <DetailField label="Sal Adv">
            <input
              type="number"
              className={`${numIn} w-full`}
              value={line.sal_adv ?? 0}
              onChange={(e) => patch({ sal_adv: e.target.value })}
            />
          </DetailField>
          <DetailField label="U/P">
            <input
              type="number"
              className={`${numIn} w-full`}
              placeholder="—"
              value={unpaidInputValue(line.unpaid_paid)}
              onChange={(e) => patch({ unpaid_paid: e.target.value === "" ? 0 : e.target.value })}
            />
          </DetailField>
          <DetailField label="TDS">
            <input
              type="number"
              className={`${numIn} w-full`}
              value={line.tds ?? 0}
              onChange={(e) => patch({ tds: e.target.value })}
            />
          </DetailField>
          <DetailField label="Custom−">
            <input
              type="number"
              className={`${numIn} w-full`}
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
          </DetailField>
          <DetailField label="Tot Ded">
            <Money value={line.total_ded} />
          </DetailField>
          <DetailField label="Net">
            <Money value={line.net_salary} strong />
          </DetailField>
          <DetailField label="Bank">
            <Money value={line.bank_amount} strong />
          </DetailField>
        </div>
      </SectionCard>
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
        prev.filter((d) =>
          (data.departments || []).some((listed) => departmentInSelection(listed, [d]))
        )
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
      pool = pool.filter((e) => departmentInSelection(e.department, selectedDepartments));
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
        return (
          departmentInSelection(e.department, selectedDepartments) &&
          !holdSet.has(String(e.id))
        );
      }
      return !holdSet.has(String(e.id));
    });
    const withoutCtc = inScope.filter((e) => !e.hasCtc).length;
    const onHoldCount = rows.filter((e) => holdSet.has(String(e.id))).length;
    return { pool, toProcess, skipped, inScope, withoutCtc, onHoldCount };
  }, [candidates.employees, processMode, selectedDepartments, holdIds, selectedIds]);

  const toggleDepartment = useCallback((dept) => {
    setSelectedDepartments((prev) => {
      const already = prev.some((d) => departmentInSelection(dept, [d]));
      if (already) {
        return prev.filter((d) => !departmentInSelection(dept, [d]));
      }
      return [...prev, dept];
    });
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
      rows = rows.filter((e) => departmentInSelection(e.department, selectedDepartments));
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
        setError(
          "Hold employees are excluded from processing. Release them first, or process from All / By department."
        );
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
          setError(
            selectedIds.length
              ? "No selected employees left to process for this month."
              : "No employees on this list to process for this month."
          );
          setBusy(false);
          return;
        }

        const processDay = new Date();
        const processedOn = `${processDay.getFullYear()}-${String(processDay.getMonth() + 1).padStart(2, "0")}-${String(processDay.getDate()).padStart(2, "0")}`;
        const dayLabel = processDay.toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });

        const result = await api.process({
          year,
          month,
          monthDays,
          includeWithoutCtc,
          processMode:
            forceFullReprocess && isBulk
              ? PROCESS_MODES.BULK
              : PROCESS_MODES.SELECT,
          employeeIds: forceFullReprocess && isBulk ? [] : pageIds,
          departments:
            forceFullReprocess && isBulk
              ? []
              : processMode === PROCESS_MODES.DEPT
                ? selectedDepartments
                : [],
          forceFullReprocess: Boolean(forceFullReprocess && isBulk),
          processedOn,
        });
        const meta = result.processMeta || {};
        const count = meta.processedCount ?? result.run?.employee_count ?? pageIds.length;
        const slips = meta.payslipCount ?? count;
        let msg = `Processed ${count} employee(s) for ${monthLabel(year, month)} on ${dayLabel}`;
        if (meta.skippedDuplicateCount > 0) {
          msg += ` · skipped ${meta.skippedDuplicateCount} already on sheet`;
        }
        if (result.run?.revision_no) {
          msg += ` (rev ${result.run.revision_no})`;
        }
        msg += `. ${slips} salary slip(s) created — open each employee → Payslips.`;
        setNotice(msg);
        setSelectedIds([]);
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
    } catch (err) {
      console.error(err);
      setError(err?.message || "Could not save sheet edits.");
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
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Departments from Employee Master
              </p>
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
                    const selected = selectedDepartments.some((d) =>
                      departmentInSelection(dept, [d])
                    );
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
                        title={`${stats.pending} ready · ${stats.eligible} ${includeWithoutCtc ? "without CTC" : "with CTC"} · ${stats.total} active in this department`}
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
              {selectedDepartments.length ? (
                <p className="text-[11px] text-slate-600">
                  Showing employees in:{" "}
                  <span className="font-medium text-slate-800">
                    {selectedDepartments.join(", ")}
                  </span>
                </p>
              ) : (
                <p className="text-[11px] text-slate-500">
                  Click a department to list its employees from Employee Master.
                </p>
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
