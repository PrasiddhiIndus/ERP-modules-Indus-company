import React, { useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
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
  PageHeader,
  TinySelect,
} from "../../components/OperationsUi";

const COLORS = ["#1F3A8A", "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6"];

export default function ExpenseSiteDashboard() {
  const { data, refresh, theme, getSite, navigateTo } = useOperations();
  const [selectedSite, setSelectedSite] = useState("");

  const siteStats = useMemo(() => {
    return (data?.sites || [])
      .filter((s) => s.status === "Active")
      .map((site) => {
        const expenses = (data?.expenses || []).filter((e) => e.site_id === site.id);
        const approved = expenses.filter((e) => e.status === "approved");
        return {
          ...site,
          total: approved.reduce((s, e) => s + e.amount, 0),
          count: expenses.length,
          pending: expenses.filter((e) => e.status === "pending").length,
        };
      });
  }, [data]);

  const filtered = selectedSite ? siteStats.filter((s) => s.id === selectedSite) : siteStats;
  const pieData = filtered.map((s) => ({ name: s.site_code, value: s.total }));

  return (
    <div className="space-y-4">
      <DemoBanner />
      <Breadcrumbs items={getBreadcrumbs("expense-site-dashboard")} theme={theme} />
      <PageHeader title="Site-wise Expense Dashboard" subtitle="Compare operational spend across active sites" onRefresh={refresh} theme={theme} />

      <FilterBar>
        <label className="text-[11px] text-gray-600">
          Site
          <TinySelect value={selectedSite} onChange={(e) => setSelectedSite(e.target.value)} className="block mt-0.5 w-52">
            <option value="">All active sites</option>
            {siteStats.map((s) => (
              <option key={s.id} value={s.id}>{s.site_code} — {s.site_name}</option>
            ))}
          </TinySelect>
        </label>
      </FilterBar>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <KpiTile label="Active Sites" value={siteStats.length} />
        <KpiTile label="Total Approved Spend" value={formatCurrency(siteStats.reduce((s, x) => s + x.total, 0))} />
        <KpiTile label="Pending Approvals" value={siteStats.reduce((s, x) => s + x.pending, 0)} tone="border-amber-100" />
        <KpiTile label="Expense Records" value={siteStats.reduce((s, x) => s + x.count, 0)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Spend distribution by site" theme={theme}>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                {pieData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => formatCurrency(v)} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <EnterpriseDataTable
          theme={theme}
          columns={[
            { key: "site", label: "Site", render: (r) => <LinkedSiteChip site={r} onClick={() => navigateTo("expenses")} /> },
            { key: "state", label: "State" },
            { key: "total", label: "Approved Spend", render: (r) => formatCurrency(r.total), sortValue: (r) => r.total },
            { key: "count", label: "Records", sortValue: (r) => r.count },
            { key: "pending", label: "Pending", render: (r) => (r.pending ? <span className="text-amber-600 font-medium">{r.pending}</span> : "0") },
          ]}
          rows={filtered}
          onRowClick={(r) => navigateTo("expenses")}
        />
      </div>
    </div>
  );
}
