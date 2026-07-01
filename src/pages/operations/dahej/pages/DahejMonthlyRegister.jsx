import React from "react";
import { Lock } from "lucide-react";
import { useDahejExpenses } from "../contexts/DahejExpensesContext";
import DahejExpenseGrid from "../components/DahejExpenseGrid";
import { PageHeader, PrimaryButton, SectionCard, TinySelect } from "../../components/OperationsUi";
import { useOperations } from "../../contexts/OperationsContext";
import { formatCurrency } from "../../data/mockOperationsData";
import { exportDahejExcel } from "../utils/dahejExpenseExcel";
import { formatDateDdMmYyyy, formatMonthYearLabel } from "../../../../utils/dateDisplay";


function monthOptions() {
  const opts = [];
  const now = new Date();
  for (let i = 0; i < 36; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = formatMonthYearLabel(d.getFullYear(), d.getMonth() + 1);
    opts.push({ key, label });
  }
  return opts;
}

export default function DahejMonthlyRegister() {
  const { theme } = useOperations();
  const {
    monthEntries,
    selectedMonth,
    setSelectedMonth,
    monthClosed,
    monthClosings,
    closeMonth,
    dashboard,
    refresh,
    saveEntry,
  } = useDahejExpenses();

  const closing = monthClosings.find((m) => m.month_key === selectedMonth);
  const monthLabel = monthOptions().find((m) => m.key === selectedMonth)?.label || selectedMonth;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Monthly Expense Register"
        subtitle="Month-wise register with closing, advance utilization & running balance"
        onRefresh={refresh}
        theme={theme}
        primaryAction={
          !monthClosed && monthEntries.length > 0 ? (
            <PrimaryButton icon={Lock} onClick={() => {
              if (window.confirm(`Close month ${monthLabel}? Register will become read-only.`)) closeMonth();
            }}>
              Close Month
            </PrimaryButton>
          ) : null
        }
      />

      <label className="text-[11px] text-gray-600 inline-block">
        Month
        <TinySelect value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="block mt-0.5 w-40">
          {monthOptions().map((m) => (
            <option key={m.key} value={m.key}>{m.label}</option>
          ))}
        </TinySelect>
      </label>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <SectionCard title="Advances Received" className="!shadow-none">
          <p className="text-lg font-bold text-[#1F3A8A]">{formatCurrency(dashboard.totalAdvances)}</p>
        </SectionCard>
        <SectionCard title="Total Expenses" className="!shadow-none">
          <p className="text-lg font-bold">{formatCurrency(dashboard.totalExpenses)}</p>
        </SectionCard>
        <SectionCard title="Balance" className="!shadow-none">
          <p className={`text-lg font-bold ${dashboard.balance < 0 ? "text-red-600" : "text-emerald-700"}`}>{formatCurrency(dashboard.balance)}</p>
        </SectionCard>
        <SectionCard title="Month Status" className="!shadow-none">
          <p className="text-sm font-medium">{monthClosed ? `Closed ${closing?.closed_at ? formatDateDdMmYyyy(closing.closed_at) : ""}` : "Open"}</p>
        </SectionCard>
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={() => exportDahejExcel(monthEntries, `dahej-register-${selectedMonth}.xlsx`, monthLabel)} className="text-xs text-[#1F3A8A] font-medium hover:underline">
          Export month register (Excel)
        </button>
      </div>

      <DahejExpenseGrid rows={monthEntries} onSave={saveEntry} readOnly={monthClosed} />
    </div>
  );
}
