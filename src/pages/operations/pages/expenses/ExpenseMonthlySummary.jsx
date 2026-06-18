import React, { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useOperations } from "../../contexts/OperationsContext";
import { getBreadcrumbs } from "../../navConfig";
import { formatCurrency } from "../../data/mockOperationsData";
import {
  Breadcrumbs,
  ChartCard,
  DemoBanner,
  EnterpriseDataTable,
  FilterBar,
  KpiTile,
  LinkedSiteChip,
  OpsStatusBadge,
  PageHeader,
  TinySelect,
  useThemeClasses,
} from "../../components/OperationsUi";

export default function ExpenseMonthlySummary() {
  const { data, refresh, theme, getSite } = useOperations();
  const t = useThemeClasses(theme);
  const [month, setMonth] = useState("2026-06");

  const summary = useMemo(() => {
    const expenses = (data?.expenses || []).filter((e) => e.expense_date.startsWith(month));
    const byCategory = {};
    const bySite = {};
    expenses.forEach((e) => {
      byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
      bySite[e.site_id] = (bySite[e.site_id] || 0) + e.amount;
    });
    return { expenses, byCategory, bySite, total: expenses.reduce((s, e) => s + e.amount, 0) };
  }, [data, month]);

  const chartData = Object.entries(summary.byCategory).map(([name, amount]) => ({ name, amount }));

  return (
    <div className="space-y-4">
      <DemoBanner />
      <Breadcrumbs items={getBreadcrumbs("expense-summary")} theme={theme} />
      <PageHeader title="Monthly Expense Summary" subtitle="Category and site-wise expense breakdown" onRefresh={refresh} theme={theme} />

      <FilterBar>
        <label className="text-[11px] text-gray-600">
          Month
          <TinySelect value={month} onChange={(e) => setMonth(e.target.value)} className="block mt-0.5 w-36">
            {["2026-06", "2026-05", "2026-04"].map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </TinySelect>
        </label>
      </FilterBar>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <KpiTile label="Total Expenses" value={formatCurrency(summary.total)} />
        <KpiTile label="Records" value={summary.expenses.length} />
        <KpiTile label="Approved" value={summary.expenses.filter((e) => e.status === "approved").length} tone="border-emerald-100" />
        <KpiTile label="Pending" value={summary.expenses.filter((e) => e.status === "pending").length} tone="border-amber-100" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="By category" theme={theme}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => formatCurrency(v)} />
              <Bar dataKey="amount" fill="#1F3A8A" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <EnterpriseDataTable
          theme={theme}
          columns={[
            { key: "site", label: "Site", render: (r) => <LinkedSiteChip site={getSite(r.site_id)} /> },
            { key: "amount", label: "Total", render: (r) => formatCurrency(r.amount) },
            { key: "count", label: "Records" },
          ]}
          rows={Object.entries(summary.bySite).map(([site_id, amount]) => ({
            id: site_id,
            site_id,
            amount,
            count: summary.expenses.filter((e) => e.site_id === site_id).length,
          }))}
          pageSize={5}
        />
      </div>

      <EnterpriseDataTable
        theme={theme}
        columns={[
          { key: "expense_no", label: "Expense No." },
          { key: "site_id", label: "Site", render: (r) => getSite(r.site_id)?.site_code },
          { key: "category", label: "Category" },
          { key: "head", label: "Head" },
          { key: "amount", label: "Amount", render: (r) => formatCurrency(r.amount) },
          { key: "expense_date", label: "Date" },
          { key: "status", label: "Status", render: (r) => <OpsStatusBadge status={r.status} /> },
        ]}
        rows={summary.expenses}
      />
    </div>
  );
}
