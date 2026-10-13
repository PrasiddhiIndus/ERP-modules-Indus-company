import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Search,
  Upload,
} from "lucide-react";
import { DateInput } from "../../../components/DateInput";
import {
  CollapsibleHelp,
  PageTaskHeader,
  SectionCard,
  StatusChip,
  TinyInput,
  TinySelect,
} from "../../adminOperations/components/AdminUi";
import { monthKey, monthLabel } from "../../adminOperations/salaryAdmin/salaryMonthProcessing";
import { persistComplianceMonth } from "./complianceDb";
import { loadComplianceMonthEmployees } from "./complianceData";
import { applyEpfDerived, sumEpfTotals, validateEpfRows } from "./complianceEpf";
import { formatLastWorkingDay, lastWorkingDayToIso, validateEsicRows } from "./complianceEsic";
import { downloadEpfChallanWorkbook, downloadEsicReturnWorkbook } from "./complianceExcel";
import {
  applyComplianceWorkbookToRows,
  digitsOnly,
  formatImportSummary,
  mergeParsedWorkbooks,
  parseComplianceWorkbooks,
} from "./complianceImport";

const STEPS = [
  { id: "month", label: "Month" },
  { id: "review", label: "Review" },
  { id: "validate", label: "Validate" },
  { id: "download", label: "Download" },
];

const TABS = [
  { id: "epf", label: "PF / EPF" },
  { id: "esic", label: "ESIC" },
];

function currentYearMonth() {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function yearOptions() {
  const y = new Date().getFullYear();
  return [y, y - 1, y - 2, y - 3];
}

function formatInr(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return `₹${v.toLocaleString("en-IN")}`;
}

function Stepper({ step, maxReached }) {
  const idx = STEPS.findIndex((s) => s.id === step);
  return (
    <ol className="flex flex-wrap items-center gap-1 sm:gap-2">
      {STEPS.map((s, i) => {
        const active = s.id === step;
        const done = i < idx;
        const reachable = i <= maxReached;
        return (
          <li key={s.id} className="flex items-center gap-1 sm:gap-2">
            {i > 0 ? <span className="text-ink-muted text-[10px] px-0.5">→</span> : null}
            <span
              className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-[11px] font-medium border ${
                active
                  ? "bg-accent-soft border-accent text-accent"
                  : done
                    ? "bg-surface border-accent/40 text-ink"
                    : reachable
                      ? "bg-surface border-border text-ink-secondary"
                      : "bg-surface-sunken border-border text-ink-muted"
              }`}
            >
              <span
                className={`h-5 w-5 rounded-full inline-flex items-center justify-center text-[10px] ${
                  active || done ? "bg-accent text-white" : "bg-surface-sunken text-ink-muted"
                }`}
              >
                {i + 1}
              </span>
              {s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function ErrorPanel({ errors, kind }) {
  if (!errors?.length) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-900">
        <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">No errors found</p>
          <p className="text-emerald-800/80 mt-0.5">
            All rows look ready. You can continue to download.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-critical-border bg-critical-soft/40 px-3 py-2.5 space-y-2">
      <div className="flex items-start gap-2 text-xs text-critical">
        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
        <p className="font-medium">
          {errors.length} employee{errors.length === 1 ? "" : "s"} need attention before download
        </p>
      </div>
      <ul className="space-y-2 max-h-64 overflow-y-auto">
        {errors.map((e) => (
          <li
            key={`${e.rowIndex}-${e.employeeCode || e.uan || e.ipNumber}`}
            className="text-[11px] bg-surface border border-border rounded-md px-2.5 py-2"
          >
            <p className="font-medium text-ink">
              Row {e.rowIndex + 1}
              {e.employeeCode ? ` · ${e.employeeCode}` : ""} — {e.employeeName}
              {kind === "epf" && e.uan && e.uan !== "—" ? ` · UAN ${e.uan}` : null}
              {kind === "esic" && e.ipNumber && e.ipNumber !== "—"
                ? ` · IP ${e.ipNumber}`
                : null}
            </p>
            <ul className="mt-1 list-disc pl-4 text-critical space-y-0.5">
              {e.messages.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

function cellInputClass(hasError) {
  return `h-7 w-full min-w-[4.5rem] border rounded px-1.5 text-[11px] ${
    hasError ? "border-critical bg-critical-soft/30" : "border-gray-300 bg-white"
  }`;
}

/**
 * Compliance Payroll Process — linear month → review → validate → download for PF/EPF & ESIC.
 */
export default function CompliancePayrollProcess() {
  const [searchParams, setSearchParams] = useSearchParams();
  const init = currentYearMonth();

  const tab = searchParams.get("tab") === "esic" ? "esic" : "epf";
  const year = Number(searchParams.get("year")) || init.year;
  const month = Number(searchParams.get("month")) || init.month;

  const [step, setStep] = useState("month");
  const [maxReached, setMaxReached] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [meta, setMeta] = useState(null);
  const [epfRows, setEpfRows] = useState([]);
  const [esicRows, setEsicRows] = useState([]);
  const [q, setQ] = useState("");
  const [validation, setValidation] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [banner, setBanner] = useState("");
  const fileInputRef = useRef(null);
  const parsedRef = useRef(null);
  const saveTimerRef = useRef(null);

  const setTab = (next) => {
    const p = new URLSearchParams(searchParams);
    p.set("tab", next);
    setSearchParams(p, { replace: true });
    setStep("month");
    setMaxReached(0);
    setValidation(null);
    setBanner("");
  };

  const setYm = (y, m) => {
    const p = new URLSearchParams(searchParams);
    p.set("year", String(y));
    p.set("month", String(m));
    setSearchParams(p, { replace: true });
  };

  const loadMonth = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    setBanner("");
    setValidation(null);
    parsedRef.current = null;
    try {
      const data = await loadComplianceMonthEmployees({ year, month });
      setMeta(data);
      setEpfRows(data.epfRows || []);
      setEsicRows(data.esicRows || []);
      if (!data.hasSheet) {
        setLoadError(
          "No salary has been processed for this month. Process salary first, then review those employees here."
        );
      }
    } catch (err) {
      console.error(err);
      setMeta(null);
      setEpfRows([]);
      setEsicRows([]);
      setLoadError("Could not load employees for this month. Try again.");
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    loadMonth();
  }, [loadMonth]);

  const goStep = (nextId) => {
    const i = STEPS.findIndex((s) => s.id === nextId);
    if (i < 0) return;
    setStep(nextId);
    setMaxReached((prev) => Math.max(prev, i));
  };

  const activeRows = tab === "epf" ? epfRows : esicRows;

  const filteredRows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return activeRows;
    return activeRows.filter((r) => {
      const hay = [
        r.employeeCode,
        r.name,
        r.ipName,
        r.uan,
        r.ipNumber,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [activeRows, q]);

  const errorRowIndexes = useMemo(() => {
    if (!validation?.errors?.length) return new Set();
    return new Set(validation.errors.map((e) => e.rowIndex));
  }, [validation]);

  const updateEpf = (id, patch) => {
    setEpfRows((prev) => {
      const next = prev.map((row) => {
        if (row.id !== id) return row;
        const merged = { ...row, ...patch };
        if ("epsWages" in patch) merged.epsWagesManual = true;
        if ("age" in patch) merged.epsWagesManual = false;
        if ("epsWagesManual" in patch) merged.epsWagesManual = Boolean(patch.epsWagesManual);
        return applyEpfDerived(merged);
      });
      scheduleSave(next, esicRows);
      return next;
    });
    setValidation(null);
    setBanner("");
  };

  const updateEsic = (id, patch) => {
    setEsicRows((prev) => {
      const next = prev.map((row) => (row.id === id ? { ...row, ...patch } : row));
      scheduleSave(epfRows, next);
      return next;
    });
    setValidation(null);
    setBanner("");
  };

  const scheduleSave = (nextEpf, nextEsic) => {
    window.clearTimeout(saveTimerRef.current);
    const snapshot = {
      year,
      month,
      monthKey: meta?.monthKey || monthKey(year, month),
      runId: meta?.run?.id,
      epfRows: nextEpf,
      esicRows: nextEsic,
    };
    saveTimerRef.current = window.setTimeout(() => {
      persistComplianceMonth(snapshot).catch((err) => {
        console.warn("Compliance: could not save edits", err);
      });
    }, 800);
  };

  const runValidate = () => {
    const result =
      tab === "epf" ? validateEpfRows(epfRows) : validateEsicRows(esicRows);
    setValidation(result);
    goStep("validate");
    if (result.ok) {
      setBanner("Validation passed. You can download the file.");
      setMaxReached(3);
    } else {
      setBanner("");
    }
  };

  const persistRows = useCallback(
    async (nextEpf, nextEsic, sourceFileName = "", parsed = null) => {
      try {
        await persistComplianceMonth({
          year,
          month,
          monthKey: meta?.monthKey || monthKey(year, month),
          runId: meta?.run?.id,
          epfRows: nextEpf,
          esicRows: nextEsic,
          sourceFileName,
          parsed,
        });
      } catch (err) {
        console.warn("Compliance: could not save statutory IDs", err);
      }
    },
    [year, month, meta?.monthKey, meta?.run?.id]
  );

  const handleWorkbookUpload = async (event) => {
    const files = [...(event.target.files || [])];
    event.target.value = "";
    if (!files.length) return;
    if (!meta?.hasSheet) {
      setLoadError("Load a processed salary month first, then upload the workbook.");
      return;
    }
    setUploading(true);
    setLoadError("");
    setBanner("");
    setValidation(null);
    try {
      const incoming = await parseComplianceWorkbooks(files);
      const parsed = mergeParsedWorkbooks([parsedRef.current, incoming].filter(Boolean));
      parsedRef.current = parsed;
      if (!parsed?.entries?.length) {
        const skipped = (parsed?.sheetReports || incoming?.sheetReports || [])
          .filter((s) => s.skipped)
          .map((s) => `${s.name} (${s.skipped})`)
          .join("; ");
        setLoadError(
          skipped
            ? `No UAN or ESIC IP rows were found. ${skipped}.`
            : "No UAN or ESIC IP numbers were found. Select the PF file and the ESIC file together (all sheets)."
        );
        return;
      }
      const applied = applyComplianceWorkbookToRows({
        epfRows,
        esicRows,
        parsed,
      });
      setEpfRows(applied.epfRows);
      setEsicRows(applied.esicRows);
      const sheetLabel = (parsed.sheetNames || []).filter(Boolean).join(", ");
      const sourceLabel = sheetLabel ? `${parsed.fileName} (${sheetLabel})` : parsed.fileName;
      await persistRows(applied.epfRows, applied.esicRows, sourceLabel, parsed);
      setMeta((prev) =>
        prev
          ? {
              ...prev,
              filing: {
                ...(prev.filing || {}),
                source_file_name: sourceLabel,
                uploaded_at: new Date().toISOString(),
              },
            }
          : prev
      );
      setBanner(
        formatImportSummary(applied.summary, {
          epfCount: applied.epfRows.length,
          esicCount: applied.esicRows.length,
        })
      );
      if (step === "month") goStep("review");
    } catch (err) {
      console.error(err);
      setLoadError("Could not read that Excel file. Use .xls / .xlsx — PF challan and ESIC return can be two files.");
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async () => {
    const result =
      tab === "epf" ? validateEpfRows(epfRows) : validateEsicRows(esicRows);
    setValidation(result);
    if (!result.ok) {
      goStep("validate");
      setBanner("");
      return;
    }
    setDownloading(true);
    try {
      const opts = {
        year,
        month,
        monthLabel: meta?.monthLabel || monthLabel(year, month),
      };
      if (tab === "epf") {
        await downloadEpfChallanWorkbook(epfRows, opts);
      } else {
        await downloadEsicReturnWorkbook(esicRows, opts);
      }
      await persistRows(epfRows, esicRows);
      goStep("download");
      setBanner("File downloaded. UAN and ESIC IP numbers are saved for this month.");
    } catch (err) {
      console.error(err);
      setBanner("");
      setLoadError("Download failed. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  const missingIds = useMemo(() => {
    if (tab === "epf") {
      return epfRows.filter((r) => digitsOnly(r.uan).length !== 12).length;
    }
    return esicRows.filter((r) => digitsOnly(r.ipNumber).length !== 10).length;
  }, [tab, epfRows, esicRows]);
  const canAdvanceFromMonth = Boolean(meta?.hasSheet) && !loading && activeRows.length > 0;
  const validatedOk = Boolean(validation?.ok);

  return (
    <div className="space-y-4">
      <PageTaskHeader
        title="Payroll Compliance"
        subtitle="Prepare PF / EPF and ESIC files from the employees processed in salary for the month you select. Present days come from that month’s attendance."
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          multiple
          onChange={handleWorkbookUpload}
        />
        <button
          type="button"
          disabled={uploading || loading || !meta?.hasSheet}
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border bg-surface text-xs font-medium text-ink hover:bg-surface-sunken disabled:opacity-40"
        >
          {uploading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="h-3.5 w-3.5" />
          )}
          {uploading ? "Reading sheets…" : "Upload Excel"}
        </button>
      </PageTaskHeader>

      <div className="flex flex-wrap gap-1 border-b border-divider">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`h-9 px-3 text-[12px] font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? "border-accent text-accent"
                : "border-transparent text-ink-secondary hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <SectionCard
        title={tab === "epf" ? "PF / EPF challan" : "ESIC contribution return"}
        right={<Stepper step={step} maxReached={maxReached} />}
      >
        <CollapsibleHelp label="process steps">
          <ol className="list-decimal pl-4 space-y-1">
            <li>
              Pick the month that was processed in salary. Continue to review opens only those
              employees. Present days are the attendance total for that same month and employee.
            </li>
            <li>
              Upload Excel at the top — select both files together if needed (PF challan with UAN
              details, plus ESIC return). All sheets are read. Match is by employee code, or by name
              when the ESIC sheet uses site labels instead of codes.
            </li>
            {tab === "epf" ? (
              <li>
                Present days come from that month’s attendance register for each employee. Review
                UAN, name, gross and EPF wages. EPS, EDLI and contributions calculate from the
                challan formulas. Age 58 or more sets EPS wages to 0.
              </li>
            ) : (
              <li>
                Present days come from that month’s attendance register and fill the days paid on
                the return. Review IP number, name, monthly wages, reason code and last working day.
              </li>
            )}
            <li>Check errors, then download the filing file. IDs stay saved for later months.</li>
          </ol>
        </CollapsibleHelp>

        {loadError ? (
          <p className="mt-3 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            {loadError}
          </p>
        ) : null}
        {banner ? (
          <p className="mt-3 text-xs text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            {banner}
          </p>
        ) : null}

        {/* MONTH */}
        {step === "month" ? (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-[11px] text-ink-secondary">
                Year
                <TinySelect
                  className="mt-1 block w-28"
                  value={year}
                  onChange={(e) => setYm(Number(e.target.value), month)}
                >
                  {yearOptions().map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </TinySelect>
              </label>
              <label className="text-[11px] text-ink-secondary">
                Month
                <TinySelect
                  className="mt-1 block w-36"
                  value={month}
                  onChange={(e) => setYm(year, Number(e.target.value))}
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>
                      {monthLabel(year, m).split(" ")[0]}
                    </option>
                  ))}
                </TinySelect>
              </label>
              <button
                type="button"
                onClick={loadMonth}
                disabled={loading}
                className="h-8 px-3 rounded-md border border-border text-xs font-medium text-ink hover:bg-surface-sunken disabled:opacity-50"
              >
                {loading ? "Loading…" : "Refresh list"}
              </button>
            </div>

            <div className="rounded-lg border border-border bg-surface-sunken/40 px-3 py-3 text-xs text-ink-secondary space-y-1">
              <p>
                Selected:{" "}
                <span className="font-medium text-ink">
                  {meta?.monthLabel || monthLabel(year, month)}
                </span>
              </p>
              {loading ? (
                <p className="inline-flex items-center gap-1.5 text-ink-muted">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading employees…
                </p>
              ) : meta?.hasSheet ? (
                <>
                  <p>
                    {activeRows.length} employee{activeRows.length === 1 ? "" : "s"} processed in
                    salary for this month
                    {tab === "esic" ? " (ESIC return)" : ""}.
                  </p>
                  <p>
                    Present days are the attendance total for each of these employees in the
                    selected month.
                  </p>
                  {meta?.filing?.source_file_name ? (
                    <p className="text-ink">Last uploaded: {meta.filing.source_file_name}</p>
                  ) : null}
                </>
              ) : (
                <p>No employees to review for this month.</p>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={!canAdvanceFromMonth}
                onClick={() => goStep("review")}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-accent text-white text-xs font-medium hover:opacity-90 disabled:opacity-40"
              >
                Continue to review
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : null}

        {/* REVIEW */}
        {step === "review" ? (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-muted" />
                <TinyInput
                  className="pl-7 w-56"
                  placeholder="Search name, code, ID…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {missingIds > 0 ? (
                  <StatusChip
                    label={`${missingIds} missing ${tab === "epf" ? "UAN" : "IP"}`}
                    severity="warning"
                  />
                ) : null}
                <StatusChip label={`${filteredRows.length} shown`} severity="neutral" />
              </div>
            </div>

            {tab === "epf" ? (
              <>
                <EpfFormulaKey />
                <EpfReviewTable
                  rows={filteredRows}
                  errorIndexes={errorRowIndexes}
                  allRows={epfRows}
                  onChange={updateEpf}
                />
              </>
            ) : (
              <EsicReviewTable
                rows={filteredRows}
                errorIndexes={errorRowIndexes}
                allRows={esicRows}
                onChange={updateEsic}
              />
            )}

            <div className="flex flex-wrap justify-between gap-2 pt-1">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => goStep("month")}
                  className="inline-flex items-center gap-1 h-9 px-3 rounded-md border border-border text-xs font-medium text-ink hover:bg-surface-sunken"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Back
                </button>
              </div>
              <button
                type="button"
                onClick={runValidate}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-accent text-white text-xs font-medium hover:opacity-90"
              >
                Check errors
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : null}

        {/* VALIDATE */}
        {step === "validate" ? (
          <div className="mt-4 space-y-3">
            <ErrorPanel errors={validation?.errors || []} kind={tab} />

            {!validatedOk ? (
              <p className="text-[11px] text-ink-secondary">
                Fix the highlighted fields on the review step, then run check errors again.
              </p>
            ) : null}

            <div className="flex flex-wrap justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={() => goStep("review")}
                className="inline-flex items-center gap-1 h-9 px-3 rounded-md border border-border text-xs font-medium text-ink hover:bg-surface-sunken"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Back to edit
              </button>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={runValidate}
                  className="h-9 px-3 rounded-md border border-border text-xs font-medium text-ink hover:bg-surface-sunken"
                >
                  Re-check errors
                </button>
                <button
                  type="button"
                  disabled={!validatedOk || downloading}
                  onClick={handleDownload}
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-accent text-white text-xs font-medium hover:opacity-90 disabled:opacity-40"
                >
                  {downloading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  Download file
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* DOWNLOAD */}
        {step === "download" ? (
          <div className="mt-4 space-y-3">
            <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-xs text-emerald-900">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">
                  {tab === "epf" ? "EPF challan" : "ESIC return"} ready
                </p>
                <p className="mt-0.5 text-emerald-800/80">
                  {meta?.monthLabel || monthLabel(year, month)} · {activeRows.length} employees.
                  Download again if needed, or start another month.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setStep("month");
                  setMaxReached(0);
                  setValidation(null);
                  setBanner("");
                }}
                className="h-9 px-3 rounded-md border border-border text-xs font-medium text-ink hover:bg-surface-sunken"
              >
                New month
              </button>
              <button
                type="button"
                disabled={downloading}
                onClick={handleDownload}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-accent text-white text-xs font-medium hover:opacity-90 disabled:opacity-40"
              >
                {downloading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                Download again
              </button>
            </div>
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}

function EpfFormulaKey() {
  return (
    <div className="rounded-lg border border-amber-200 bg-[#FFF9E6] px-3 py-2.5 text-[11px] text-ink space-y-1.5">
      <p className="font-medium">Challan formulas</p>
      <p className="text-ink-secondary">
        White cells are typed: UAN, name, gross wages, EPF wages, age, NCP days, refund of advance.
        Present days are read from attendance for this month. Yellow cells calculate.
      </p>
      <ul className="grid gap-0.5 text-ink-secondary sm:grid-cols-2">
        <li>EPS wages = IF(age ≥ 58, 0, MIN(EPF wages, 15000))</li>
        <li>EDLI wages = IF(EPS ≠ 0, EPS, MIN(EPF wages, 15000))</li>
        <li>EPF contribution = ROUND(EPF wages × 12%, 0) on full EPF wages</li>
        <li>EPS contribution = ROUND(EPS wages × 8.33%, 0)</li>
        <li>Balance = EPF contribution − EPS contribution</li>
      </ul>
      <p className="text-ink-muted">
        Sheet check: EPF wages 20,000 → EPS 15,000, EPF 2,400, EPS 1,250, balance 1,150. Age 58 with
        EPF wages 15,000 → EPS 0, EDLI 15,000, EPF 1,800, balance 1,800. EPF wages 10,000 → EPS
        10,000, EPF 1,200, EPS 833, balance 367.
      </p>
    </div>
  );
}

function formulaCellClass() {
  return "px-2 py-1.5 text-right align-middle bg-[#FFF9E6] text-ink tabular-nums whitespace-nowrap";
}

function formatDays(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(1).replace(/\.0$/, "");
}

function PresentDaysCell({ days }) {
  return (
    <td className="px-3 py-1.5 text-right align-middle tabular-nums font-semibold text-ink whitespace-nowrap bg-sky-50/70">
      {formatDays(days)}
    </td>
  );
}

const thLeft =
  "px-3 py-2.5 text-left align-middle font-semibold text-[12px] text-ink normal-case tracking-normal whitespace-nowrap";
const thRight =
  "px-3 py-2.5 text-right align-middle font-semibold text-[12px] text-ink normal-case tracking-normal whitespace-nowrap";

function numInputClass(hasError) {
  return `${cellInputClass(hasError)} text-right tabular-nums`;
}

function EpfReviewTable({ rows, errorIndexes, allRows, onChange }) {
  const indexOf = (id) => allRows.findIndex((r) => r.id === id);
  const totals = sumEpfTotals(allRows);

  return (
    <div className="w-full overflow-x-auto rounded-lg border border-border">
      <table className="erp-table-exempt w-max min-w-full text-[12px] border-collapse">
        <thead className="bg-[#FFF2CC] text-ink border-b border-border">
          <tr>
            <th className={thLeft}>UAN</th>
            <th className={thLeft}>Name</th>
            <th className={thRight}>Present days</th>
            <th className={thRight}>Gross wages</th>
            <th className={thRight}>EPF wages</th>
            <th className={thRight}>Age</th>
            <th className={thRight}>EPS wages</th>
            <th className={thRight}>EDLI wages</th>
            <th className={thRight}>EPF contribution</th>
            <th className={thRight}>EPS contribution</th>
            <th className={thRight}>Balance</th>
            <th className={thRight}>NCP days</th>
            <th className={thRight}>Refund of advance</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-divider bg-surface">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={13} className="px-3 py-8 text-center text-ink-muted">
                No employees to review
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const idx = indexOf(row.id);
              const bad = errorIndexes.has(idx);
              return (
                <tr key={row.id} className={bad ? "bg-critical-soft/20" : ""}>
                  <td className="px-1.5 py-1.5 align-middle">
                    <input
                      className={`${cellInputClass(bad)} tabular-nums`}
                      value={row.uan || ""}
                      onChange={(e) =>
                        onChange(row.id, { uan: e.target.value.replace(/\D/g, "").slice(0, 12) })
                      }
                    />
                  </td>
                  <td className="px-1.5 py-1.5 align-middle min-w-[11rem]">
                    <input
                      className={cellInputClass(bad)}
                      value={row.name || ""}
                      onChange={(e) => onChange(row.id, { name: e.target.value })}
                    />
                    {row.employeeCode ? (
                      <span className="block text-[9px] text-ink-muted mt-0.5 truncate">
                        {row.employeeCode}
                        {row.designation ? ` · ${row.designation}` : ""}
                      </span>
                    ) : null}
                  </td>
                  <PresentDaysCell days={row.presentDays} />
                  <td className="px-1.5 py-1.5 align-middle">
                    <input
                      type="number"
                      className={numInputClass(false)}
                      value={row.grossWages ?? ""}
                      onChange={(e) => onChange(row.id, { grossWages: Number(e.target.value) })}
                    />
                  </td>
                  <td className="px-1.5 py-1.5 align-middle">
                    <input
                      type="number"
                      className={numInputClass(false)}
                      value={row.epfWages ?? ""}
                      onChange={(e) => onChange(row.id, { epfWages: Number(e.target.value) })}
                    />
                  </td>
                  <td className="px-1.5 py-1.5 align-middle w-16">
                    <input
                      type="number"
                      className={numInputClass(false)}
                      value={row.age ?? ""}
                      onChange={(e) =>
                        onChange(row.id, {
                          age: e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                      title="Age 58 or more sets EPS wages to 0"
                    />
                  </td>
                  <td className={formulaCellClass()} title="IF(age>=58, 0, MIN(EPF wages, 15000))">
                    {row.epsWagesManual ? (
                      <input
                        type="number"
                        className={numInputClass(false)}
                        value={row.epsWages ?? 0}
                        onChange={(e) => onChange(row.id, { epsWages: Number(e.target.value) })}
                      />
                    ) : (
                      <span className="block text-right">{row.epsWages ?? 0}</span>
                    )}
                    <button
                      type="button"
                      className="block w-full text-right text-[9px] text-ink-muted hover:text-ink mt-0.5"
                      onClick={() =>
                        onChange(row.id, {
                          epsWagesManual: !row.epsWagesManual,
                          epsWages: row.epsWages,
                        })
                      }
                    >
                      {row.epsWagesManual ? "Use formula" : "Type amount"}
                    </button>
                    {!row.epsWagesManual && row.age58Plus ? (
                      <span className="block text-right text-[9px] text-amber-700">Age 58+ · EPS 0</span>
                    ) : null}
                  </td>
                  <td className={formulaCellClass()}>{row.edliWages ?? 0}</td>
                  <td className={formulaCellClass()}>{row.epfContn ?? 0}</td>
                  <td className={formulaCellClass()}>{row.epsContnAmt ?? 0}</td>
                  <td className={formulaCellClass()}>{row.epfBalance ?? 0}</td>
                  <td className="px-1.5 py-1.5 align-middle">
                    <input
                      type="number"
                      className={numInputClass(false)}
                      value={row.ncpDays ?? 0}
                      onChange={(e) => onChange(row.id, { ncpDays: Number(e.target.value) })}
                    />
                  </td>
                  <td className="px-1.5 py-1.5 align-middle">
                    <input
                      type="number"
                      className={numInputClass(false)}
                      value={row.refundOfAdvance ?? 0}
                      onChange={(e) =>
                        onChange(row.id, { refundOfAdvance: Number(e.target.value) })
                      }
                    />
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
        {rows.length > 0 ? (
          <tfoot className="bg-[#FFF2CC] font-semibold text-ink">
            <tr>
              <td className="px-2 py-2" />
              <td className="px-2 py-2 text-left">Total</td>
              <td className="px-2 py-2 text-right tabular-nums">{formatDays(totals.presentDays)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{totals.grossWages}</td>
              <td className="px-2 py-2 text-right tabular-nums">{totals.epfWages}</td>
              <td className="px-2 py-2" />
              <td className="px-2 py-2 text-right tabular-nums">{totals.epsWages}</td>
              <td className="px-2 py-2 text-right tabular-nums">{totals.edliWages}</td>
              <td className="px-2 py-2 text-right tabular-nums">{totals.epfContn}</td>
              <td className="px-2 py-2 text-right tabular-nums">{totals.epsContnAmt}</td>
              <td className="px-2 py-2 text-right tabular-nums">{totals.epfBalance}</td>
              <td className="px-2 py-2 text-right tabular-nums">{totals.ncpDays}</td>
              <td className="px-2 py-2 text-right tabular-nums">{totals.refundOfAdvance}</td>
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

function EsicReviewTable({ rows, errorIndexes, allRows, onChange }) {
  const indexOf = (id) => allRows.findIndex((r) => r.id === id);
  const totalDays = allRows.reduce(
    (sum, row) => sum + (Number(row.presentDays ?? row.daysPaid) || 0),
    0
  );
  const totalWages = allRows.reduce((sum, row) => sum + (Number(row.monthlyWages) || 0), 0);

  return (
    <div className="w-full overflow-x-auto rounded-lg border border-border">
      <table className="erp-table-exempt w-max min-w-full text-[12px] border-collapse">
        <thead className="bg-[#DDEBF7] text-ink border-b border-border">
          <tr>
            <th className={thLeft}>IP number</th>
            <th className={thLeft}>IP name</th>
            <th className={thLeft}>Category</th>
            <th className={thRight}>Present days</th>
            <th className={thRight}>Monthly wages</th>
            <th className={thLeft}>Reason code</th>
            <th className={thLeft}>Last working day</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-3 py-8 text-center text-ink-muted">
                No ESIC employees for this month
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const idx = indexOf(row.id);
              const bad = errorIndexes.has(idx);
              const present = row.presentDays ?? row.daysPaid;
              return (
                <tr key={row.id} className={bad ? "bg-critical-soft/20" : ""}>
                  <td className="px-1.5 py-1.5 align-middle">
                    <input
                      className={`${cellInputClass(bad)} tabular-nums`}
                      value={row.ipNumber || ""}
                      onChange={(e) =>
                        onChange(row.id, {
                          ipNumber: e.target.value.replace(/\D/g, "").slice(0, 10),
                        })
                      }
                    />
                  </td>
                  <td className="px-1.5 py-1.5 align-middle min-w-[12rem]">
                    <input
                      className={cellInputClass(bad)}
                      value={row.ipName || ""}
                      onChange={(e) => onChange(row.id, { ipName: e.target.value })}
                    />
                    {row.employeeCode ? (
                      <span className="block text-[9px] text-ink-muted mt-0.5 truncate">
                        {row.employeeCode}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-1.5 py-1.5 align-middle min-w-[8rem]">
                    <input
                      className={cellInputClass(false)}
                      value={row.category || ""}
                      onChange={(e) => onChange(row.id, { category: e.target.value })}
                    />
                  </td>
                  <PresentDaysCell days={present} />
                  <td className="px-1.5 py-1.5 align-middle">
                    <input
                      type="number"
                      className={numInputClass(false)}
                      value={row.monthlyWages ?? ""}
                      onChange={(e) => onChange(row.id, { monthlyWages: Number(e.target.value) })}
                    />
                  </td>
                  <td className="px-1.5 py-1.5 align-middle min-w-[7rem]">
                    <input
                      className={cellInputClass(Number(present) === 0)}
                      placeholder={Number(present) === 0 ? "0" : "—"}
                      value={row.reasonCode ?? ""}
                      onChange={(e) => onChange(row.id, { reasonCode: e.target.value })}
                    />
                  </td>
                  <td className="px-1.5 py-1.5 align-middle min-w-[11rem]">
                    <DateInput
                      compact
                      aria-label="Last working day"
                      placeholder="DD/MM/YYYY"
                      title="Select a day. Shown as DD/MM/YYYY"
                      value={lastWorkingDayToIso(row.lastWorkingDay)}
                      onChange={(iso) =>
                        onChange(row.id, {
                          lastWorkingDay: iso ? formatLastWorkingDay(iso) : "",
                        })
                      }
                      className="h-7 min-w-[10.5rem] rounded border border-gray-300 bg-white text-[11px] [&_.erp-date-input-text]:px-1.5 [&_.erp-date-input-text]:text-[11px]"
                    />
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
        {rows.length > 0 ? (
          <tfoot className="bg-[#DDEBF7] font-semibold text-ink">
            <tr>
              <td className="px-2 py-2 text-left" colSpan={3}>
                Total
              </td>
              <td className="px-2 py-2 text-right tabular-nums">{formatDays(totalDays)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{formatInr(totalWages)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
