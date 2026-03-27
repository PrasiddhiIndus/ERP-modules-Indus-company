import React from "react";
import {
  headerMeta,
  executiveSummary,
  enterpriseKpis,
  moduleHealth,
  priorityActions,
  trends,
  snapshots,
  criticalAlerts,
  pendingApprovals,
  recentActivity,
  quickActions,
  managementInsights,
} from "./dashboard/data/mockCommandCenterData";
import {
  SectionHeader,
  ExecutiveChip,
  KpiCard,
  HealthCard,
  PriorityActionRow,
  TrendWidget,
  SnapshotCard,
  AlertRow,
  ApprovalTable,
  ActivityItem,
  QuickActionTile,
  HeaderControls,
  InsightRow,
} from "./dashboard/components/CommandCenterUi";

const Dashboard = () => {
  return (
    <div className="space-y-4 max-w-[1800px] mx-auto">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{headerMeta.title}</h1>
            <p className="text-xs text-gray-500 mt-1">{headerMeta.today} · Business period: {headerMeta.businessPeriod}</p>
          </div>
          <HeaderControls />
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {executiveSummary.map((x) => <ExecutiveChip key={x.id} label={x.label} value={x.value} tone={x.tone} />)}
        </div>
      </div>

      <section>
        <SectionHeader title="Executive KPI Strip" />
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2">
          {enterpriseKpis.map((k) => <KpiCard key={k.id} item={k} />)}
        </div>
      </section>

      <section>
        <SectionHeader title="Department Health Overview" right={<button className="text-xs text-blue-700 font-medium">Open module scorecard</button>} />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
          {moduleHealth.map((m) => <HealthCard key={m.module} item={m} />)}
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="px-3 py-2 border-b border-gray-200"><SectionHeader title="Today's Priority Action Center" /></div>
          <div>
            {priorityActions.map((r) => <PriorityActionRow key={r.id} row={r} />)}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="px-3 py-2 border-b border-gray-200"><SectionHeader title="Critical Alerts & Exceptions" /></div>
          <div>
            {criticalAlerts.map((a) => <AlertRow key={a.id} row={a} />)}
          </div>
        </div>
      </section>

      <section>
        <SectionHeader title="Business Activity & Trends" />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
          {trends.map((t) => <TrendWidget key={t.id} title={t.title} values={t.values} />)}
        </div>
      </section>

      <section>
        <SectionHeader title="Module-specific Snapshot Panels" />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
          {snapshots.map((s) => <SnapshotCard key={s.module} module={s.module} rows={s.rows} />)}
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[1.2fr_.8fr] gap-3">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
          <SectionHeader title="Cross-Module Pending Approvals" />
          <ApprovalTable rows={pendingApprovals} />
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
          <SectionHeader title="Recent Activity / ERP Timeline" />
          {recentActivity.map((r) => <ActivityItem key={r.id} item={r} />)}
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[1fr_.9fr] gap-3">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
          <SectionHeader title="Quick Access / Quick Actions" />
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
            {quickActions.map((q) => <QuickActionTile key={q} label={q} />)}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
          <SectionHeader title="Management Insight Layer" />
          {managementInsights.map((i) => <InsightRow key={i} text={i} />)}
        </div>
      </section>
    </div>
  );
};

export default Dashboard;
