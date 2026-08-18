import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Download, RefreshCw, Search } from "lucide-react";
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
  listMonthRuns,
  monthKey,
  monthLabel,
  processSalaryMonth,
  recomputeLineFromEdits,
  saveMonthRunEdits,
} from "./salaryMonthProcessing";
import {
  USE_MOCK_SALARY_PROCESSING,
  mockGetMonthRunByKey,
  mockGetMonthRunWithLines,
  mockListMonthRuns,
  mockProcessSalaryMonth,
  mockSaveMonthRunEdits,
} from "./salaryProcessingMock";
import { exportSalaryProcessingWorkbook } from "../../../lib/salaryProcessingExcel";

const numIn =
  "w-[4.25rem] h-7 px-1 text-right text-[11px] tabular-nums border border-slate-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-accent/30 focus:border-accent";
const textIn =
  "h-7 px-1.5 text-[11px] border border-slate-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-accent/30 focus:border-accent";
const selectIn = "h-7 border border-slate-200 rounded px-1.5 text-[11px] bg-white";
const btnGhost =
  "h-7 px-2.5 text-[11px] font-medium rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50";
const btnPrimary =
  "h-7 px-2.5 text-[11px] font-medium rounded bg-accent text-white disabled:opacity-50 inline-flex items-center gap-1";

function Money({ value, strong = false }) {
  if (value == null || value === "") return <span className="text-slate-300">—</span>;
  return (
    <span className={`tabular-nums ${strong ? "font-semibold text-slate-900" : "text-slate-700"}`}>
      {formatINRPlain(value)}
    </span>
  );
}

function currentYearMonth() {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function statusSeverity(status) {
  if (status === "processed") return "info";
  if (status === "draft") return "warning";
  return "warning";
}

const api = {
  listRuns: () => (USE_MOCK_SALARY_PROCESSING ? Promise.resolve(mockListMonthRuns()) : listMonthRuns()),
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
};

export default function SalaryProcessing() {
  const now = currentYearMonth();
  const [year, setYear] = useState(now.year);
  const [month, setMonth] = useState(now.month);
  const [monthDays, setMonthDays] = useState(DEFAULT_MONTH_DAYS);
  const [includeWithoutCtc, setIncludeWithoutCtc] = useState(false);

  const [runs, setRuns] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [existingRun, setExistingRun] = useState(null);

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
      const data = await api.listRuns();
      setRuns(data);
    } catch (err) {
      console.error(err);
      setError(err?.message || "Could not load processed salary sheets.");
    } finally {
      setListLoading(false);
    }
  }, [year, month, includeWithoutCtc]);

  useEffect(() => {
    loadRuns();
  }, [loadRuns]);

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
    async ({ forceNewRevision = false } = {}) => {
      setBusy(true);
      setError("");
      setNotice("");
      try {
        const key = monthKey(year, month);
        if (!forceNewRevision) {
          const existing = await api.getByKey(key);
          if (existing) {
            setExistingRun(existing);
            setConfirmOpen(true);
            setBusy(false);
            return;
          }
        }
        const result = await api.process({
          year,
          month,
          monthDays,
          includeWithoutCtc,
        });
        setNotice(
          `Processed ${result.run.employee_count} employees for ${monthLabel(year, month)} (rev ${result.run.revision_no}). Payslips generated.`
        );
        await loadRuns();
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
    [year, month, monthDays, includeWithoutCtc, loadRuns]
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

  const listColumns = useMemo(
    () => [
      {
        key: "month",
        label: "Month",
        render: (row) => monthLabel(row.pay_year, row.pay_month),
      },
      { key: "pay_year", label: "Year", render: (row) => row.pay_year },
      {
        key: "revision_no",
        label: "Rev",
        render: (row) => row.revision_no,
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
        key: "updated_at",
        label: "Updated",
        render: (row) =>
          row.updated_at ? formatDateDdMmYyyy(String(row.updated_at).slice(0, 10)) : "—",
      },
      {
        key: "status",
        label: "Status",
        render: (row) => <StatusChip label={row.status || "—"} severity={statusSeverity(row.status)} />,
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
                openRun(row.id);
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
                  const data = await api.getWithLines(row.id);
                  await exportSalaryProcessingWorkbook(data);
                } catch (err) {
                  console.error(err);
                  setError(err?.message || "Export failed.");
                }
              }}
            >
              Export
            </button>
            <button
              type="button"
              className="text-[11px] font-medium text-slate-600 hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                setYear(row.pay_year);
                setMonth(row.pay_month);
                setMonthDays(row.month_days || DEFAULT_MONTH_DAYS);
                setExistingRun(row);
                setConfirmOpen(true);
              }}
            >
              Again
            </button>
          </div>
        ),
      },
    ],
    [openRun]
  );

  const editorHeaders = [
    "Sr",
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

  if (editorOpen && run) {
    return (
      <div className="space-y-2.5 max-w-[1600px] w-full mx-auto">
        <PageTaskHeader
          className="mb-0"
          title={`Salary — ${monthLabel(run.pay_year, run.pay_month)}`}
          subtitle={`${run.employee_count} emps · ${run.month_days} days · Net ${formatINRPlain(run.total_net)}${
            USE_MOCK_SALARY_PROCESSING ? " · mock data" : ""
          }`}
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
                  <td className="px-1.5 py-1 text-[11px] font-mono border-b border-slate-100">{line.employee_code}</td>
                  <td className="px-1.5 py-1 text-[11px] border-b border-slate-100 max-w-[8.5rem] truncate" title={line.employee_name}>
                    {line.employee_name}
                    {line.has_master_variance ? (
                      <span className="ml-1 text-[9px] text-amber-700">var</span>
                    ) : null}
                  </td>
                  <td className="px-0.5 py-0.5 border-b border-slate-100">
                    <input
                      className={`${textIn} w-[7.5rem]`}
                      value={line.account_no || ""}
                      onChange={(e) => updateLine(line.id, { account_no: e.target.value })}
                    />
                  </td>
                  <td className="px-0.5 py-0.5 border-b border-slate-100">
                    <input
                      className={`${textIn} w-[5.75rem]`}
                      value={line.ifsc || ""}
                      onChange={(e) => updateLine(line.id, { ifsc: e.target.value })}
                    />
                  </td>
                  <td className="px-1.5 py-1 text-[11px] border-b border-slate-100 max-w-[6rem] truncate">
                    {line.designation || "—"}
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
    <div className="space-y-3 max-w-5xl w-full mx-auto">
      <PageTaskHeader
        className="mb-0"
        title="Salary Processing"
        subtitle={
          USE_MOCK_SALARY_PROCESSING
            ? "Mock preview — process, open, edit, export without CTC or live DB."
            : "Build monthly salary sheets from Employee Master."
        }
      >
        {USE_MOCK_SALARY_PROCESSING ? <StatusChip label="Mock data" severity="warning" /> : null}
      </PageTaskHeader>

      <CollapsibleHelp label="how this works">
        Select month/year → Process salary (pulls Loan / Sal Adv / TDS from Employee Master). Edit the
        sheet and Save — those monthly amounts write back to the employee profile. Export downloads Excel
        with sample formulas.
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
            Incl. without CTC
          </label>
          <button type="button" disabled={busy} className={`${btnPrimary} ml-auto`} onClick={() => doProcess()}>
            <RefreshCw className={`h-3 w-3 ${busy ? "animate-spin" : ""}`} />
            {busy ? "Processing…" : "Process salary"}
          </button>
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
            rows={runs}
            onRowClick={(row) => openRun(row.id)}
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
              onClick={() => doProcess({ forceNewRevision: true })}
            >
              New revision from master
            </button>
          </div>
        }
      >
        <p className="text-sm text-slate-700">
          A sheet for{" "}
          <span className="font-medium">
            {existingRun
              ? monthLabel(existingRun.pay_year, existingRun.pay_month)
              : monthLabel(year, month)}
          </span>{" "}
          already exists
          {existingRun ? ` (rev ${existingRun.revision_no})` : ""}. Open it, or rebuild as a new
          revision.
        </p>
      </Modal>
    </div>
  );
}
