import React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Receipt, Wallet, Stethoscope, Building2, HandCoins } from "lucide-react";
import { useOperations } from "../contexts/OperationsContext";
import { getBreadcrumbs } from "../navConfig";
import { formatCurrency } from "../data/mockOperationsData";
import {
  Breadcrumbs,
  ChartCard,
  DemoBanner,
  EnterpriseDataTable,
  ErrorState,
  KpiTile,
  LoadingSkeleton,
  OpsStatusBadge,
  PageHeader,
  QuickActions,
  SectionCard,
  Timeline,
  useThemeClasses,
} from "../components/OperationsUi";

export default function Dashboard() {
  const { data, loading, error, refresh, theme, navigateTo } = useOperations();
  const t = useThemeClasses(theme);

  if (loading && !data) return <LoadingSkeleton rows={8} theme={theme} />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;

  const kpis = data?.dashboard || {};
  const crumbs = getBreadcrumbs("dashboard");

  const quickActions = [
    { label: "New Expense", icon: Receipt, onClick: () => navigateTo("expenses") },
    { label: "Request Advance", icon: Wallet, onClick: () => navigateTo("advances") },
    { label: "Record Rent Payment", icon: Building2, onClick: () => navigateTo("rent-entry") },
    { label: "PME Due List", icon: Stethoscope, onClick: () => navigateTo("pme-due") },
    { label: "Settle Advance", icon: HandCoins, onClick: () => navigateTo("advance-settlement") },
  ];

  return (
    <div className="space-y-4">
      <DemoBanner />
      <Breadcrumbs items={crumbs} theme={theme} />
      <PageHeader
        title="Operations Command Center"
        subtitle="Site expenses, advances, medical compliance & accommodation overview"
        onRefresh={refresh}
        onExport={() => window.alert("Dashboard export — connect to reporting service")}
        theme={theme}
      />

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
        <KpiTile label="Active Sites" value={kpis.active_sites ?? "—"} onClick={() => navigateTo("expense-site-dashboard")} />
        <KpiTile label="Monthly Expenses" value={formatCurrency(kpis.monthly_expenses)} tone="border-blue-100" onClick={() => navigateTo("expense-summary")} />
        <KpiTile label="Pending Advances" value={kpis.pending_advances ?? "—"} tone="border-amber-100" onClick={() => navigateTo("advance-approval")} />
        <KpiTile label="Open Settlements" value={kpis.open_settlements ?? "—"} onClick={() => navigateTo("advance-settlement")} />
        <KpiTile label="Rent Due" value={formatCurrency(kpis.rent_due)} tone="border-orange-100" onClick={() => navigateTo("rent-dashboard")} />
        <KpiTile label="PME Due" value={kpis.pme_due ?? "—"} tone="border-red-100" onClick={() => navigateTo("pme-due")} />
      </div>

      <SectionCard title="Quick actions" className={t.card}>
        <QuickActions actions={quickActions} />
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Monthly expense trend" theme={theme}>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data?.monthlyTrends?.expenses || []}>
              <CartesianGrid strokeDasharray="3 3" stroke={t.dark ? "#334155" : "#e5e7eb"} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke={t.dark ? "#94a3b8" : "#6b7280"} />
              <YAxis tick={{ fontSize: 11 }} stroke={t.dark ? "#94a3b8" : "#6b7280"} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => formatCurrency(v)} />
              <Area type="monotone" dataKey="amount" stroke="#1F3A8A" fill="#1F3A8A" fillOpacity={0.15} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Advances — requested vs settled" theme={theme}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data?.monthlyTrends?.advances || []}>
              <CartesianGrid strokeDasharray="3 3" stroke={t.dark ? "#334155" : "#e5e7eb"} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => formatCurrency(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="requested" fill="#1F3A8A" name="Requested" radius={[4, 4, 0, 0]} />
              <Bar dataKey="settled" fill="#10B981" name="Settled" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="Rent collection trend" theme={theme}>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data?.monthlyTrends?.rent || []}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(v / 100000).toFixed(1)}L`} />
            <Tooltip formatter={(v) => formatCurrency(v)} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="due" stroke="#F59E0B" name="Due" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="paid" stroke="#1F3A8A" name="Paid" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Recent activities" className={t.card}>
          <Timeline
            items={(data?.activities || []).map((a) => ({
              title: a.title,
              meta: a.meta,
            }))}
          />
        </SectionCard>

        <SectionCard title="Pending approvals" className={t.card}>
          <EnterpriseDataTable
            theme={theme}
            columns={[
              { key: "type", label: "Type", render: (r) => <OpsStatusBadge status={r.type} /> },
              { key: "ref", label: "Reference" },
              { key: "amount", label: "Amount", render: (r) => formatCurrency(r.amount) },
              { key: "status", label: "Status", render: (r) => <OpsStatusBadge status={r.status} /> },
            ]}
            rows={[
              ...(data?.expenses || []).filter((e) => e.status === "pending").slice(0, 3).map((e) => ({
                id: e.id,
                type: "expense",
                ref: e.expense_no,
                amount: e.amount,
                status: e.status,
              })),
              ...(data?.advances || []).filter((a) => a.status === "pending_approval").slice(0, 2).map((a) => ({
                id: a.id,
                type: "advance",
                ref: a.request_no,
                amount: a.amount,
                status: a.status,
              })),
            ]}
            pageSize={5}
          />
        </SectionCard>
      </div>
    </div>
  );
}
