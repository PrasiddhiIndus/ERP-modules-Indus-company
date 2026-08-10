import React from "react";
import { Receipt, Wallet, Stethoscope, Building2, HandCoins } from "lucide-react";
import { useOperations } from "../contexts/OperationsContext";
import { getBreadcrumbs } from "../navConfig";
import { formatCurrency } from "../data/mockOperationsData";
import {
  Breadcrumbs,
  DemoBanner,
  EnterpriseDataTable,
  ErrorState,
  LoadingSkeleton,
  OpsStatusBadge,
  PageHeader,
  QuickActions,
  SectionCard,
  Timeline,
  useThemeClasses,
} from "../components/OperationsUi";
import {
  SparkKpi,
  ChartPanel,
  AreaTrendChart,
  BarCompareChart,
  DonutChart,
  RadialScoreChart,
  ComposedTrendChart,
  sparkFromValue,
  CHART_SERIES,
} from "../../../components/charts/DashboardCharts";

import { toast } from "../../../lib/toast";
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
        onExport={() => toast.success("Dashboard export — connect to reporting service")}
        theme={theme}
      />

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
        <SparkKpi label="Active Sites" value={kpis.active_sites ?? "—"} series={sparkFromValue(kpis.active_sites)} color={CHART_SERIES[0]} onClick={() => navigateTo("expense-site-dashboard")} />
        <SparkKpi label="Monthly Expenses" value={formatCurrency(kpis.monthly_expenses)} series={sparkFromValue(Number(kpis.monthly_expenses) || 0)} color={CHART_SERIES[1]} onClick={() => navigateTo("expense-summary")} />
        <SparkKpi label="Pending Advances" value={kpis.pending_advances ?? "—"} series={sparkFromValue(kpis.pending_advances)} color={CHART_SERIES[2]} onClick={() => navigateTo("advance-approval")} />
        <SparkKpi label="Open Settlements" value={kpis.open_settlements ?? "—"} series={sparkFromValue(kpis.open_settlements)} color={CHART_SERIES[4]} onClick={() => navigateTo("advance-settlement")} />
        <SparkKpi label="Rent Due" value={formatCurrency(kpis.rent_due)} series={sparkFromValue(Number(kpis.rent_due) || 0)} color={CHART_SERIES[2]} onClick={() => navigateTo("rent-dashboard")} />
        <SparkKpi label="PME Due" value={kpis.pme_due ?? "—"} series={sparkFromValue(kpis.pme_due)} color={CHART_SERIES[3]} onClick={() => navigateTo("pme-due")} />
      </div>

      <SectionCard title="Quick actions" className={t.card}>
        <QuickActions actions={quickActions} />
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartPanel title="Monthly expense trend" className="lg:col-span-2" height={220}>
          <AreaTrendChart
            data={(data?.monthlyTrends?.expenses || []).map((r) => ({ name: r.month, value: r.amount }))}
            series={[{ key: "value", name: "Expense", color: CHART_SERIES[0] }]}
            height={220}
            formatter={(v) => formatCurrency(v)}
          />
        </ChartPanel>
        <ChartPanel title="Ops pressure" height={220}>
          <RadialScoreChart
            value={Math.max(10, 100 - (Number(kpis.pending_advances) || 0) * 5 - (Number(kpis.pme_due) || 0) * 3)}
            label="Ready"
            color={CHART_SERIES[5]}
            height={200}
          />
        </ChartPanel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartPanel title="Advances — requested vs settled" height={220}>
          <BarCompareChart
            data={data?.monthlyTrends?.advances || []}
            xKey="month"
            series={[
              { key: "requested", name: "Requested", color: CHART_SERIES[0] },
              { key: "settled", name: "Settled", color: CHART_SERIES[5] },
            ]}
            height={200}
            formatter={(v) => formatCurrency(v)}
          />
        </ChartPanel>
        <ChartPanel title="Rent collection" height={220}>
          <ComposedTrendChart
            data={data?.monthlyTrends?.rent || []}
            xKey="month"
            areas={[{ key: "paid", name: "Paid", color: CHART_SERIES[0] }]}
            lines={[{ key: "due", name: "Due", color: CHART_SERIES[2] }]}
            height={200}
            formatter={(v) => formatCurrency(v)}
          />
        </ChartPanel>
      </div>

      <ChartPanel title="Open work mix" height={200}>
        <DonutChart
          data={[
            { name: "Pending advances", value: Number(kpis.pending_advances) || 0 },
            { name: "Settlements", value: Number(kpis.open_settlements) || 0 },
            { name: "PME due", value: Number(kpis.pme_due) || 0 },
            { name: "Active sites", value: Number(kpis.active_sites) || 0 },
          ].filter((x) => x.value > 0)}
          height={180}
          centerLabel="Signals"
        />
      </ChartPanel>

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
