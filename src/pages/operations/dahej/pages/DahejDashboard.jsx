import React from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useDahejExpenses } from "../contexts/DahejExpensesContext";
import { ChartCard, KpiTile, PageHeader, SectionCard, TinySelect } from "../../components/OperationsUi";
import { useOperations } from "../../contexts/OperationsContext";
import { formatCurrency } from "../../data/mockOperationsData";

const COLORS = ["#1F3A8A", "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6"];

function monthOptions() {
  const opts = [];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    opts.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return opts;
}

export default function DahejDashboard() {
  const { theme } = useOperations();
  const { dashboard, selectedMonth, setSelectedMonth, refresh } = useDahejExpenses();

  return (
    <div className="space-y-4">
      <PageHeader title="Dahej Expenses Dashboard" subtitle="Operational spend overview for selected month" onRefresh={refresh} theme={theme} />

      <label className="text-[11px] text-gray-600 inline-block">
        Month
        <TinySelect value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="block mt-0.5 w-36 ml-0">
          {monthOptions().map((k) => (
            <option key={k} value={k}>{k}</option>
          ))}
        </TinySelect>
      </label>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
        <KpiTile label="Total Advances" value={formatCurrency(dashboard.totalAdvances)} />
        <KpiTile label="Total Expenses" value={formatCurrency(dashboard.totalExpenses)} tone="border-blue-100" />
        <KpiTile label="Fuel Expenses" value={formatCurrency(dashboard.fuel)} tone="border-amber-100" />
        <KpiTile label="Vehicle Maintenance" value={formatCurrency(dashboard.maintenance)} />
        <KpiTile label="Inventory" value={formatCurrency(dashboard.inventory)} />
        <KpiTile label="Other Services" value={formatCurrency(dashboard.other)} />
        <KpiTile label="Balance Amount" value={formatCurrency(dashboard.balance)} tone={dashboard.balance < 0 ? "border-red-100" : "border-emerald-100"} />
        <KpiTile label="Entries" value={dashboard.rowCount} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Top expense categories" theme={theme}>
          {dashboard.topCategories.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={dashboard.topCategories} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => formatCurrency(v)} />
                <Bar dataKey="total" fill="#1F3A8A" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-xs text-gray-500 py-8 text-center">No expense data for this month.</p>
          )}
        </ChartCard>

        <ChartCard title="Vehicle-wise cost analysis" theme={theme}>
          {dashboard.vehicleAnalysis.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={dashboard.vehicleAnalysis.slice(0, 6)} dataKey="total" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name.slice(0, 12)} ${(percent * 100).toFixed(0)}%`}>
                  {dashboard.vehicleAnalysis.slice(0, 6).map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => formatCurrency(v)} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-xs text-gray-500 py-8 text-center">No vehicle expense data.</p>
          )}
        </ChartCard>
      </div>

      <SectionCard title="Expense type summary" className={theme === "dark" ? "bg-slate-900 border-slate-700" : ""}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="px-2 py-2">Expense Type</th>
                <th className="px-2 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.topCategories.map((c) => (
                <tr key={c.name} className="border-t border-gray-100">
                  <td className="px-2 py-1.5">{c.name}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatCurrency(c.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
