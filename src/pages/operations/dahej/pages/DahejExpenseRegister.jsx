import React, { useRef, useState } from "react";
import { Download, FileSpreadsheet, FileText, Plus, Send, Trash2, Upload } from "lucide-react";
import { useDahejExpenses } from "../contexts/DahejExpensesContext";
import DahejExpenseGrid from "../components/DahejExpenseGrid";
import {
  FilterBar,
  OpsStatusBadge,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  TinyInput,
  TinySelect,
} from "../../components/OperationsUi";
import { useOperations } from "../../contexts/OperationsContext";
import { DAHEJ_WORKFLOW_STATUSES } from "../constants/columns";
import {
  downloadDahejTemplate,
  exportDahejExcel,
  exportDahejPdf,
  importDahejExcel,
} from "../utils/dahejExpenseExcel";
import { formatCurrency } from "../../data/mockOperationsData";
import { formatMonthYearLabel } from "../../../../utils/dateDisplay";

function monthOptions() {
  const opts = [];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = formatMonthYearLabel(d.getFullYear(), d.getMonth() + 1);
    opts.push({ key, label });
  }
  return opts;
}

export default function DahejExpenseRegister() {
  const { theme } = useOperations();
  const {
    monthEntries,
    selectedMonth,
    setSelectedMonth,
    monthClosed,
    saveEntry,
    deleteEntry,
    importEntries,
    addBlankRows,
    submitForApproval,
    dashboard,
    refresh,
  } = useDahejExpenses();

  const fileRef = useRef(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [vehicleFilter, setVehicleFilter] = useState("");
  const [search, setSearch] = useState("");
  const [bulkCount, setBulkCount] = useState(5);

  const filtered = monthEntries.filter((r) => {
    if (statusFilter && r.status !== statusFilter) return false;
    if (vehicleFilter && r.vehicle_utilized_for !== vehicleFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (
        !String(r.expense_type || "").toLowerCase().includes(q) &&
        !String(r.expense_booked_under || "").toLowerCase().includes(q) &&
        !String(r.remarks || "").toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  const vehicles = [...new Set(monthEntries.map((r) => r.vehicle_utilized_for).filter(Boolean))];

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const rows = await importDahejExcel(file, selectedMonth);
      importEntries(rows);
      window.alert(`Imported ${rows.length} rows into ${selectedMonth}`);
    } catch (err) {
      window.alert(err.message || "Import failed");
    }
    e.target.value = "";
  };

  const monthLabel = monthOptions().find((m) => m.key === selectedMonth)?.label || selectedMonth;

  return (
    <div className="space-y-3">
      <PageHeader
        title="Expense Register"
        subtitle={monthClosed ? "Month closed — register is read-only" : "Excel-like grid entry with inline editing"}
        onRefresh={refresh}
        theme={theme}
        primaryAction={
          !monthClosed && (
            <PrimaryButton icon={Plus} onClick={() => addBlankRows(Number(bulkCount) || 1)}>
              Add Rows
            </PrimaryButton>
          )
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <div className="rounded-lg border bg-white px-3 py-2">
          <p className="text-gray-500">Advances</p>
          <p className="font-bold text-[#1F3A8A]">{formatCurrency(dashboard.totalAdvances)}</p>
        </div>
        <div className="rounded-lg border bg-white px-3 py-2">
          <p className="text-gray-500">Expenses</p>
          <p className="font-bold">{formatCurrency(dashboard.totalExpenses)}</p>
        </div>
        <div className="rounded-lg border bg-white px-3 py-2">
          <p className="text-gray-500">Balance</p>
          <p className={`font-bold ${dashboard.balance < 0 ? "text-red-600" : "text-emerald-700"}`}>
            {formatCurrency(dashboard.balance)}
          </p>
        </div>
        <div className="rounded-lg border bg-white px-3 py-2">
          <p className="text-gray-500">Status</p>
          <p className="font-medium">{monthClosed ? "Closed" : "Open"} · {filtered.length} rows</p>
        </div>
      </div>

      <FilterBar>
        <label className="text-[11px] text-gray-600">
          Month
          <TinySelect value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="block mt-0.5 w-36">
            {monthOptions().map((m) => (
              <option key={m.key} value={m.key}>{m.label}</option>
            ))}
          </TinySelect>
        </label>
        <label className="text-[11px] text-gray-600">
          Status
          <TinySelect value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="block mt-0.5 w-32">
            <option value="">All</option>
            {DAHEJ_WORKFLOW_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </TinySelect>
        </label>
        <label className="text-[11px] text-gray-600">
          Vehicle
          <TinySelect value={vehicleFilter} onChange={(e) => setVehicleFilter(e.target.value)} className="block mt-0.5 w-44">
            <option value="">All</option>
            {vehicles.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </TinySelect>
        </label>
        <label className="text-[11px] text-gray-600 flex-1 min-w-[120px]">
          Search
          <TinyInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Type, location, remarks…" className="block mt-0.5 w-full max-w-xs" />
        </label>
        <label className="text-[11px] text-gray-600">
          Bulk add
          <TinyInput type="number" min={1} max={50} value={bulkCount} onChange={(e) => setBulkCount(e.target.value)} className="block mt-0.5 w-16" />
        </label>
      </FilterBar>

      <div className="flex flex-wrap gap-2">
        <SecondaryButton onClick={() => downloadDahejTemplate()}>
          <FileSpreadsheet className="w-3.5 h-3.5 inline mr-1" /> Template
        </SecondaryButton>
        <SecondaryButton onClick={() => fileRef.current?.click()}>
          <Upload className="w-3.5 h-3.5 inline mr-1" /> Import Excel
        </SecondaryButton>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
        <SecondaryButton onClick={() => exportDahejExcel(filtered, `dahej-expenses-${selectedMonth}.xlsx`, monthLabel)}>
          <Download className="w-3.5 h-3.5 inline mr-1" /> Export Excel
        </SecondaryButton>
        <SecondaryButton onClick={() => exportDahejPdf(filtered, `Dahej Expenses ${monthLabel}`)}>
          <FileText className="w-3.5 h-3.5 inline mr-1" /> Export PDF
        </SecondaryButton>
        {!monthClosed && (
          <SecondaryButton onClick={() => submitForApproval(filtered.filter((r) => r.status === "draft").map((r) => r.id))}>
            <Send className="w-3.5 h-3.5 inline mr-1" /> Submit Drafts
          </SecondaryButton>
        )}
      </div>

      <DahejExpenseGrid rows={filtered} onSave={saveEntry} readOnly={monthClosed} />

      <p className="text-[10px] text-gray-400">
        Workflow: Draft → Submitted → Approved → Paid → Closed. Audit trail stored per row (created/modified by, approval history, change log).
      </p>
    </div>
  );
}
