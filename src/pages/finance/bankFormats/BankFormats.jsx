import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Download, RefreshCw, Save, Search } from "lucide-react";
import {
  PageTaskHeader,
  SectionCard,
  FilterBar,
  KpiTile,
  CollapsibleHelp,
  StatusChip,
} from "../../adminOperations/components/AdminUi";
import {
  getMonthRunByKey,
  getMonthRunWithLines,
  listMonthRuns,
  monthKey,
  monthLabel,
} from "../../adminOperations/salaryAdmin/salaryMonthProcessing";
import {
  DEFAULT_DEBIT_ACCOUNT_NO,
  DEFAULT_RECEIVER_ACCOUNT_TYPE,
  buildBankRowsFromSalaryLines,
  formatInr,
  mergeSavedWithSalary,
  paymentMethodName,
} from "./bankFormatModel";
import { fetchBankFormatSheet, saveBankFormatSheet } from "./bankFormatDb";
import { downloadBankFormatWorkbook } from "./bankFormatExcel";
import { toast } from "../../../lib/toast";

const COLUMNS = [
  { key: "paymentMethod", label: "Payment Method Name", width: "7.5rem" },
  { key: "paymentAmount", label: "Payment Amount (Request)", width: "9rem", inputMode: "numeric" },
  { key: "activationDate", label: "Activation Date", width: "8rem" },
  { key: "beneficiaryName", label: "Beneficiary Name (Request)", width: "12rem" },
  { key: "beneficiaryAccountNo", label: "Beneficiary Account No", width: "11rem" },
  { key: "blank", label: "blank", width: "5rem" },
  { key: "emailBody", label: "Email body", width: "8rem" },
  { key: "debitAccountNo", label: "Debit Account No", width: "11rem", readOnly: true },
  { key: "crnNo", label: "CRN No.", width: "7rem" },
  { key: "receiverIfsc", label: "Receiver IFSC Code", width: "9.5rem" },
  { key: "receiverAccountType", label: "Receiver Account Type", width: "8rem" },
];

const selectIn =
  "h-8 px-2 text-[11px] border border-gray-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-accent/30";
const cellInputClass =
  "w-full min-w-0 h-8 px-1.5 text-[11px] text-center outline-none border-0 bg-transparent focus:ring-1 focus:ring-inset focus:ring-accent/40 focus:bg-white tabular-nums disabled:text-ink-muted disabled:cursor-default";

function CellInput({ value, onChange, inputMode, title, readOnly }) {
  return (
    <input
      type="text"
      value={value ?? ""}
      title={title}
      inputMode={inputMode}
      readOnly={readOnly}
      disabled={readOnly}
      onChange={(e) => onChange?.(e.target.value)}
      className={cellInputClass}
    />
  );
}

function previousPayYearMonth() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export default function BankFormats() {
  const fallback = useMemo(() => previousPayYearMonth(), []);
  const [year, setYear] = useState(fallback.year);
  const [month, setMonth] = useState(fallback.month);
  const [processedKeys, setProcessedKeys] = useState(() => new Set());
  const [salaryRunId, setSalaryRunId] = useState(null);
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loadError, setLoadError] = useState("");

  const years = useMemo(() => {
    const y = fallback.year;
    return [y + 1, y, y - 1, y - 2, y - 3];
  }, [fallback.year]);

  const key = monthKey(year, month);
  const label = monthLabel(year, month);
  const isProcessed = processedKeys.has(key);

  const refreshProcessedMonths = useCallback(async () => {
    try {
      const runs = await listMonthRuns();
      const keys = new Set(
        (runs || [])
          .map((r) => r.month_key || monthKey(r.pay_year, r.pay_month))
          .filter(Boolean)
      );
      setProcessedKeys(keys);
      return keys;
    } catch (err) {
      console.warn("Bank formats: could not list salary months", err);
      return new Set();
    }
  }, []);

  const loadMonth = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const keys = await refreshProcessedMonths();
      const mk = monthKey(year, month);
      if (!keys.has(mk)) {
        setSalaryRunId(null);
        setRows([]);
        setDirty(false);
        return;
      }

      const existing = await getMonthRunByKey(mk);
      if (!existing?.id) {
        setSalaryRunId(null);
        setRows([]);
        setDirty(false);
        return;
      }

      const bundle = await getMonthRunWithLines(existing.id);
      const salaryRows = buildBankRowsFromSalaryLines(bundle.lines || [], {
        debitAccountNo: DEFAULT_DEBIT_ACCOUNT_NO,
        receiverAccountType: DEFAULT_RECEIVER_ACCOUNT_TYPE,
      });

      let nextRows = salaryRows;
      try {
        const saved = await fetchBankFormatSheet(mk);
        if (saved?.rows?.length) {
          nextRows = mergeSavedWithSalary(salaryRows, saved.rows);
        }
      } catch (dbErr) {
        console.warn("Bank formats: saved sheet load skipped", dbErr);
      }

      setSalaryRunId(bundle.run?.id || existing.id);
      setRows(nextRows);
      setDirty(false);
    } catch (err) {
      console.error(err);
      setLoadError(err?.message || "Could not load processed salary for this month.");
      setSalaryRunId(null);
      setRows([]);
      setDirty(false);
    } finally {
      setLoading(false);
    }
  }, [year, month, refreshProcessedMonths]);

  useEffect(() => {
    loadMonth();
  }, [loadMonth]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = [r.beneficiaryName, r.employeeCode, r.beneficiaryAccountNo, r.receiverIfsc]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search]);

  const totals = useMemo(() => {
    const amount = filteredRows.reduce((s, r) => s + (Number(r.paymentAmount) || 0), 0);
    const axis = filteredRows.filter((r) => r.paymentMethod === "I").length;
    return {
      count: filteredRows.length,
      amount,
      axis,
      other: filteredRows.length - axis,
    };
  }, [filteredRows]);

  const updateCell = (id, colKey, raw) => {
    if (colKey === "debitAccountNo") return;
    setDirty(true);
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        const next = { ...row };

        if (colKey === "paymentAmount") {
          const digits = String(raw).replace(/[^\d.-]/g, "");
          next.paymentAmount = digits === "" || digits === "-" ? "" : Number(digits);
        } else if (colKey === "receiverIfsc") {
          const ifsc = String(raw).trim().toUpperCase();
          next.receiverIfsc = ifsc;
          next.paymentMethod = paymentMethodName({ ifsc, bankName: row.bankName });
        } else if (colKey === "paymentMethod") {
          const v = String(raw).trim().toUpperCase();
          next.paymentMethod = v === "I" || v === "N" ? v : v.slice(0, 1);
        } else if (colKey === "receiverAccountType") {
          next.receiverAccountType = String(raw).trim() || DEFAULT_RECEIVER_ACCOUNT_TYPE;
        } else {
          next[colKey] = raw;
        }
        next.debitAccountNo = DEFAULT_DEBIT_ACCOUNT_NO;
        return next;
      })
    );
  };

  const handleSave = async () => {
    if (!isProcessed || !rows.length) {
      toast.warning("Nothing to save for this month.");
      return;
    }
    setSaving(true);
    try {
      await saveBankFormatSheet({
        monthKey: key,
        payYear: year,
        payMonth: month,
        salaryRunId,
        debitAccountNo: DEFAULT_DEBIT_ACCOUNT_NO,
        defaultAccountType: DEFAULT_RECEIVER_ACCOUNT_TYPE,
        rows: rows.map((r) => ({
          ...r,
          debitAccountNo: DEFAULT_DEBIT_ACCOUNT_NO,
          receiverAccountType: r.receiverAccountType || DEFAULT_RECEIVER_ACCOUNT_TYPE,
        })),
      });
      setDirty(false);
      toast.success(`Bank format saved for ${label}.`);
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Could not save bank format.");
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = async () => {
    if (!filteredRows.length) return;
    setExporting(true);
    try {
      await downloadBankFormatWorkbook(filteredRows, {
        monthLabel: `${year}-${String(month).padStart(2, "0")}`,
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="px-4 sm:px-6 py-4 max-w-[1600px] mx-auto space-y-4">
      <PageTaskHeader
        title="Bank formats"
        subtitle="Axis salary payment sheet from processed salary. Debit account is company-fixed; account type defaults to 10 (savings). Edit cells, then save or download Excel."
      />

      <CollapsibleHelp label="how this sheet works">
        <ul className="list-disc pl-4 space-y-1">
          <li>
            Pick a <strong>month / year</strong> that has processed salary — those employees fill
            the sheet.
          </li>
          <li>
            <strong>Payment Method</strong> — <code>I</code> if IFSC starts with UTIB (Axis), else{" "}
            <code>N</code>.
          </li>
          <li>
            <strong>Debit Account No</strong> is fixed ({DEFAULT_DEBIT_ACCOUNT_NO}) on every row.
          </li>
          <li>
            <strong>Receiver Account Type</strong> defaults to <code>10</code> (savings) and can be
            edited.
          </li>
        </ul>
      </CollapsibleHelp>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile label="Rows" value={String(totals.count)} sub={label} />
        <KpiTile
          label="Total amount"
          value={`₹${formatInr(totals.amount)}`}
          sub="Payment Amount (Request)"
          tone="border-accent-border"
        />
        <KpiTile label="Axis (I)" value={String(totals.axis)} sub="Same bank transfer" />
        <KpiTile label="Other (N)" value={String(totals.other)} sub="NEFT / other banks" />
      </div>

      <SectionCard
        title="Payment sheet"
        right={
          <StatusChip
            label={isProcessed ? (dirty ? "Unsaved edits" : "Processed") : "Not processed"}
            severity={isProcessed ? (dirty ? "warning" : "info") : "neutral"}
          />
        }
      >
        <div className="space-y-3">
          <FilterBar>
            <label className="flex-1 min-w-[12rem] max-w-md">
              <span className="text-[11px] text-ink-muted">Search by name</span>
              <div className="relative mt-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-muted pointer-events-none" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Person name…"
                  className="h-8 w-full border border-gray-300 rounded pl-8 pr-2 text-xs bg-white"
                  aria-label="Search by person name"
                />
              </div>
            </label>

            <div className="flex flex-wrap items-end gap-2 ml-auto">
              <label className="block">
                <span className="text-[11px] text-ink-muted">Month</span>
                <select
                  className={`${selectIn} mt-1 block min-w-[7.5rem]`}
                  value={month}
                  onChange={(e) => setMonth(Number(e.target.value))}
                  aria-label="Pay month"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>
                      {new Date(2000, m - 1, 1).toLocaleString("en-IN", { month: "long" })}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-[11px] text-ink-muted">Year</span>
                <select
                  className={`${selectIn} mt-1 block min-w-[5rem]`}
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
              </label>
              <button
                type="button"
                onClick={() => loadMonth()}
                disabled={loading}
                className="inline-flex items-center gap-1.5 h-8 px-2.5 text-xs font-medium rounded-lg border border-border bg-white hover:bg-surface-sunken disabled:opacity-50 mb-0.5"
                title="Reload from salary processing"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || loading || !isProcessed || !rows.length}
                className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-semibold rounded-lg border border-border bg-white hover:bg-surface-sunken disabled:opacity-50 mb-0.5"
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={handleDownload}
                disabled={exporting || filteredRows.length === 0}
                className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-semibold rounded-lg bg-accent text-white hover:bg-accent-deep disabled:opacity-50 mb-0.5"
              >
                <Download className="w-3.5 h-3.5" />
                {exporting ? "Preparing…" : "Download Excel"}
              </button>
            </div>
          </FilterBar>

          <div className="w-full overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="border-collapse text-[11px] min-w-[72rem] w-full">
              <thead>
                <tr>
                  {COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      style={{ width: col.width, minWidth: col.width }}
                      className="sticky top-0 z-[1] border-b border-border bg-surface-raised px-1.5 py-2.5 font-semibold text-ink text-center align-middle leading-tight"
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={COLUMNS.length}
                      className="px-3 py-10 text-center text-ink-muted border-b border-divider"
                    >
                      Loading processed salary…
                    </td>
                  </tr>
                ) : loadError ? (
                  <tr>
                    <td
                      colSpan={COLUMNS.length}
                      className="px-3 py-10 text-center text-critical border-b border-divider"
                    >
                      {loadError}
                    </td>
                  </tr>
                ) : !isProcessed ? (
                  <tr>
                    <td
                      colSpan={COLUMNS.length}
                      className="px-3 py-10 text-center text-ink-muted border-b border-divider"
                    >
                      No processed salary for {label}. Process salary first, then return here.
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={COLUMNS.length}
                      className="px-3 py-10 text-center text-ink-muted border-b border-divider"
                    >
                      {rows.length === 0
                        ? `No employees on the processed sheet for ${label}.`
                        : "No person matches this name."}
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row, idx) => (
                    <tr
                      key={row.id}
                      className={idx % 2 === 0 ? "bg-surface" : "bg-surface-raised/60"}
                    >
                      {COLUMNS.map((col) => {
                        const value =
                          col.key === "paymentAmount"
                            ? row.paymentAmount === "" || row.paymentAmount == null
                              ? ""
                              : String(row.paymentAmount)
                            : col.key === "debitAccountNo"
                              ? DEFAULT_DEBIT_ACCOUNT_NO
                              : row[col.key] ?? "";

                        return (
                          <td
                            key={col.key}
                            className="border-b border-divider p-0 align-middle hover:bg-accent-soft/40"
                          >
                            <CellInput
                              value={value}
                              inputMode={col.inputMode}
                              readOnly={col.readOnly}
                              title={
                                col.key === "paymentMethod"
                                  ? "I = Axis Bank, N = other bank"
                                  : col.key === "debitAccountNo"
                                    ? "Company debit account (fixed)"
                                    : col.key === "receiverAccountType"
                                      ? "10 = savings (editable)"
                                      : undefined
                              }
                              onChange={(v) => updateCell(row.id, col.key, v)}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
