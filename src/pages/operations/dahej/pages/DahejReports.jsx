import React, { useMemo, useState } from "react";
import { Download, FileText } from "lucide-react";
import { useDahejExpenses } from "../contexts/DahejExpensesContext";
import {
  EnterpriseDataTable,
  FilterBar,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  TinySelect,
} from "../../components/OperationsUi";
import { useOperations } from "../../contexts/OperationsContext";
import { formatCurrency } from "../../data/mockOperationsData";
import { aggregateByField, exportDahejExcel, exportDahejPdf } from "../utils/dahejExpenseExcel";
import { rowTotalExpense } from "../data/dahejExpenseStorage";

const REPORTS = [
  { id: "monthly", label: "Monthly Expense Report", groupField: null },
  { id: "vehicle", label: "Vehicle Expense Report", groupField: "vehicle_utilized_for" },
  { id: "fuel", label: "Fuel Consumption Report", filter: "fuel" },
  { id: "repair", label: "Repair & Maintenance Report", filter: "repair" },
  { id: "inventory", label: "Inventory Purchase Report", filter: "inventory" },
  { id: "advance", label: "Advance vs Expense Report", filter: "advance" },
  { id: "site", label: "Site-wise Expense Report", groupField: "expense_booked_under" },
  { id: "ledger", label: "Expense Ledger Report", filter: "ledger" },
];

function monthOptions() {
  const opts = [];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    opts.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return opts;
}

export default function DahejReports() {
  const { theme } = useOperations();
  const { monthEntries, selectedMonth, setSelectedMonth, refresh, sites } = useDahejExpenses();
  const [activeReport, setActiveReport] = useState("monthly");

  const report = REPORTS.find((r) => r.id === activeReport);

  const reportRows = useMemo(() => {
    const rows = monthEntries;
    if (report?.groupField) {
      return aggregateByField(rows, report.groupField).map((r, i) => ({ id: `agg-${i}`, ...r }));
    }
    if (report?.filter === "fuel") {
      return rows
        .filter((r) => (Number(r.fuel_camper) || 0) + (Number(r.fuel_maruti_eco) || 0) + (Number(r.fuel_bike) || 0) + (Number(r.fuel_fire_tender) || 0) > 0)
        .map((r) => ({
          ...r,
          _fuel_total: (Number(r.fuel_camper) || 0) + (Number(r.fuel_maruti_eco) || 0) + (Number(r.fuel_bike) || 0) + (Number(r.fuel_fire_tender) || 0),
        }));
    }
    if (report?.filter === "repair") {
      return rows.filter(
        (r) =>
          (Number(r.service_camper) || 0) +
          (Number(r.service_maruti_eco) || 0) +
          (Number(r.service_bike) || 0) +
          (Number(r.service_fire_tender) || 0) >
          0
      );
    }
    if (report?.filter === "inventory") {
      return rows.filter((r) => Number(r.inventory_item) > 0);
    }
    if (report?.filter === "advance") {
      return rows.map((r) => ({
        ...r,
        _advance: Number(r.advance_amount_paid) || 0,
        _expense: rowTotalExpense(r),
        _variance: (Number(r.advance_amount_paid) || 0) - rowTotalExpense(r),
      }));
    }
    return rows;
  }, [monthEntries, report]);

  const columns = useMemo(() => {
    if (report?.groupField) {
      return [
        { key: "label", label: report.groupField === "vehicle_utilized_for" ? "Vehicle" : "Location / Site", sortable: true },
        { key: "count", label: "Entries" },
        { key: "fuel", label: "Fuel", render: (r) => formatCurrency(r.fuel) },
        { key: "maintenance", label: "Maintenance", render: (r) => formatCurrency(r.maintenance) },
        { key: "inventory", label: "Inventory", render: (r) => formatCurrency(r.inventory) },
        { key: "other", label: "Other", render: (r) => formatCurrency(r.other) },
        { key: "total", label: "Total", render: (r) => formatCurrency(r.total), sortValue: (r) => r.total },
      ];
    }
    if (report?.filter === "fuel") {
      return [
        { key: "date", label: "Date" },
        { key: "vehicle_utilized_for", label: "Vehicle" },
        { key: "expense_type", label: "Expense Type" },
        { key: "_fuel_total", label: "Fuel Total", render: (r) => formatCurrency(r._fuel_total) },
      ];
    }
    if (report?.filter === "advance") {
      return [
        { key: "sr_no", label: "Sr. No." },
        { key: "date", label: "Date" },
        { key: "_advance", label: "Advance", render: (r) => formatCurrency(r._advance) },
        { key: "_expense", label: "Expense", render: (r) => formatCurrency(r._expense) },
        { key: "_variance", label: "Variance", render: (r) => formatCurrency(r._variance) },
      ];
    }
    if (report?.filter === "ledger") {
      return [
        { key: "sr_no", label: "Sr. No." },
        { key: "date", label: "Date" },
        { key: "expense_booked_under", label: "Booked Under" },
        { key: "expense_type", label: "Type" },
        { key: "amount", label: "Amount", render: (r) => formatCurrency(r.amount) },
        { key: "status", label: "Status" },
        { key: "_running_balance", label: "Balance", render: (r) => formatCurrency(r._running_balance) },
      ];
    }
    return [
      { key: "sr_no", label: "Sr. No." },
      { key: "date", label: "Date" },
      { key: "expense_booked_under", label: "Booked Under" },
      { key: "expense_type", label: "Expense Type" },
      { key: "amount", label: "Amount", render: (r) => formatCurrency(rowTotalExpense(r)) },
    ];
  }, [report]);

  return (
    <div className="space-y-3">
      <PageHeader title="Dahej Expense Reports" subtitle="Monthly, vehicle, fuel, repair, inventory, advance & ledger reports" onRefresh={refresh} theme={theme} />

      <FilterBar>
        <label className="text-[11px] text-gray-600">
          Month
          <TinySelect value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="block mt-0.5 w-36">
            {monthOptions().map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </TinySelect>
        </label>
        <label className="text-[11px] text-gray-600 flex-1 min-w-[200px]">
          Report
          <TinySelect value={activeReport} onChange={(e) => setActiveReport(e.target.value)} className="block mt-0.5 w-full max-w-md">
            {REPORTS.map((r) => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </TinySelect>
        </label>
      </FilterBar>

      <div className="flex flex-wrap gap-2">
        <SecondaryButton onClick={() => exportDahejExcel(reportRows, `dahej-${activeReport}-${selectedMonth}.xlsx`)}>
          <Download className="w-3.5 h-3.5 inline mr-1" /> Excel
        </SecondaryButton>
        <SecondaryButton onClick={() => exportDahejPdf(reportRows, report?.label || "Report")}>
          <FileText className="w-3.5 h-3.5 inline mr-1" /> PDF
        </SecondaryButton>
      </div>

      <EnterpriseDataTable theme={theme} columns={columns} rows={reportRows} pageSize={25} onExport={() => exportDahejExcel(reportRows, `dahej-${activeReport}.xlsx`)} />
    </div>
  );
}
