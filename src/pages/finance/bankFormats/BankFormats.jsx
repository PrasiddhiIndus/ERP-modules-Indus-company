import React, { useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import {
  PageTaskHeader,
  SectionCard,
  FilterBar,
  KpiTile,
  CollapsibleHelp,
  Badge,
} from "../../adminOperations/components/AdminUi";
import {
  DEFAULT_DEBIT_ACCOUNT_NO,
  buildDemoBankRows,
  formatInr,
  paymentMethodName,
} from "./bankFormatModel";
import { downloadBankFormatWorkbook } from "./bankFormatExcel";

const COLUMNS = [
  { key: "paymentMethod", label: "Payment Method Name", width: "7.5rem" },
  { key: "paymentAmount", label: "Payment Amount (Request)", width: "9rem", inputMode: "numeric" },
  { key: "activationDate", label: "Activation Date", width: "8rem" },
  { key: "beneficiaryName", label: "Beneficiary Name (Request)", width: "12rem" },
  { key: "beneficiaryAccountNo", label: "Beneficiary Account No", width: "11rem" },
  { key: "blank", label: "blank", width: "5rem" },
  { key: "emailBody", label: "Email body", width: "8rem" },
  { key: "debitAccountNo", label: "Debit Account No", width: "11rem" },
  { key: "crnNo", label: "CRN No.", width: "7rem" },
  { key: "receiverIfsc", label: "Receiver IFSC Code", width: "9.5rem" },
  { key: "receiverAccountType", label: "Receiver Account Type", width: "8rem" },
];

const cellInputClass =
  "w-full min-w-0 h-8 px-1.5 text-[11px] text-center outline-none border-0 bg-transparent focus:ring-1 focus:ring-inset focus:ring-accent/40 focus:bg-white tabular-nums";

function CellInput({ value, onChange, inputMode, title }) {
  return (
    <input
      type="text"
      value={value ?? ""}
      title={title}
      inputMode={inputMode}
      onChange={(e) => onChange(e.target.value)}
      className={cellInputClass}
    />
  );
}

export default function BankFormats() {
  const [rows, setRows] = useState(() =>
    buildDemoBankRows({
      debitAccountNo: DEFAULT_DEBIT_ACCOUNT_NO,
      receiverAccountType: "10",
    })
  );
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => String(r.beneficiaryName || "").toLowerCase().includes(q));
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

  const updateCell = (id, key, raw) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        const next = { ...row };

        if (key === "paymentAmount") {
          const digits = String(raw).replace(/[^\d.-]/g, "");
          next.paymentAmount = digits === "" || digits === "-" ? "" : Number(digits);
        } else if (key === "receiverIfsc") {
          const ifsc = String(raw).trim().toUpperCase();
          next.receiverIfsc = ifsc;
          next.paymentMethod = paymentMethodName({ ifsc, bankName: row.bankName });
        } else if (key === "paymentMethod") {
          const v = String(raw).trim().toUpperCase();
          next.paymentMethod = v === "I" || v === "N" ? v : v.slice(0, 1);
        } else {
          next[key] = raw;
        }
        return next;
      })
    );
  };

  const handleDownload = async () => {
    setExporting(true);
    try {
      await downloadBankFormatWorkbook(filteredRows, { monthLabel: "bank_format" });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="px-4 sm:px-6 py-4 max-w-[1600px] mx-auto space-y-4">
      <PageTaskHeader
        title="Bank formats"
        subtitle="Salary payment upload sheet for Axis Bank. Amount, name, account and IFSC come from salary processing — edit any cell before download."
      />

      <CollapsibleHelp label="how Payment Method works">
        <p>
          <strong>I</strong> = employee account is Axis Bank (IFSC starts with UTIB).{" "}
          <strong>N</strong> = any other bank. Changing IFSC updates this automatically; you can still
          type over any cell.
        </p>
      </CollapsibleHelp>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile label="Rows" value={String(totals.count)} sub="Visible after search" />
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
        right={<Badge tone="bg-surface-sunken text-ink-secondary border border-border">Demo data</Badge>}
      >
        <div className="space-y-3">
          <FilterBar>
            <label className="flex-1 min-w-[14rem] max-w-md">
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
            <button
              type="button"
              onClick={handleDownload}
              disabled={exporting || filteredRows.length === 0}
              className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-semibold rounded-lg bg-accent text-white hover:bg-accent-deep disabled:opacity-50 mb-0.5"
            >
              <Download className="w-3.5 h-3.5" />
              {exporting ? "Preparing…" : "Download Excel"}
            </button>
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
                {filteredRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={COLUMNS.length}
                      className="px-3 py-10 text-center text-ink-muted border-b border-divider"
                    >
                      No person matches this name.
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
                            : row[col.key] ?? "";

                        return (
                          <td
                            key={col.key}
                            className="border-b border-divider p-0 align-middle hover:bg-accent-soft/40"
                          >
                            <CellInput
                              value={value}
                              inputMode={col.inputMode}
                              title={
                                col.key === "paymentMethod"
                                  ? "I = Axis Bank, N = other bank"
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
