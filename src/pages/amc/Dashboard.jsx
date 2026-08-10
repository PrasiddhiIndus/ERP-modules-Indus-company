import React from "react";
import {
  SectionCard,
  FilterBar,
  DenseTable,
  Timeline,
  TinySelect,
  AlertCard,
  AmcStatusBadge,
  PageHeader,
} from "./components/AmcUi";
import { useAmc } from "./contexts/AmcContext";
import LinkedRecord from "./components/LinkedRecord";
import {
  SparkKpi,
  ChartPanel,
  AreaTrendChart,
  DonutChart,
  BarCompareChart,
  RadialScoreChart,
  sparkFromValue,
  CHART_SERIES,
} from "../../components/charts/DashboardCharts";

import { toast } from "../../lib/toast";
export default function Dashboard() {
  const { data, loading, refresh, navigateTo, openRecord } = useAmc();

  if (loading && !data) {
    return <p className="text-sm text-gray-500 py-12 text-center">Loading AMC command center…</p>;
  }

  const kpis = data?.dashboard || {};
  const alerts = (data?.alerts || []).filter((a) => a.status === "open").slice(0, 6);
  const activity = data?.activity || [];
  const expiring = (data?.contracts || []).filter((c) => c.status === "expiring_soon" || c.status === "at_risk");

  const go = (page, params = {}) => navigateTo(page, params);

  const kpiTiles = [
    { label: "Active Contracts", value: kpis.active_contracts ?? 0, path: "contracts", params: { status: "running" }, color: CHART_SERIES[0] },
    { label: "Expiring (30d)", value: kpis.contracts_expiring_30d ?? 0, path: "contracts", params: { status: "expiring_soon" }, color: CHART_SERIES[2] },
    { label: "PM Due Today", value: kpis.pm_due_today ?? 0, path: "pm-schedule", params: { due: "today" }, color: CHART_SERIES[1] },
    { label: "PM Overdue", value: kpis.pm_overdue ?? 0, path: "pm-schedule", params: { status: "overdue" }, color: CHART_SERIES[3] },
    { label: "Open Complaints", value: kpis.open_complaints ?? 0, path: "complaints", params: {}, color: CHART_SERIES[4] },
    { label: "SLA Breaches", value: kpis.sla_breaches ?? 0, path: "alerts", params: {}, color: CHART_SERIES[3] },
    { label: "Pending Reports", value: kpis.pending_service_reports ?? 0, path: "service-reports", params: { status: "pending" }, color: CHART_SERIES[5] },
    { label: "Contracts At Risk", value: kpis.contracts_at_risk ?? 0, path: "contracts", params: { status: "at_risk" }, color: CHART_SERIES[3] },
  ];

  const serviceMix = [
    { name: "PM due", value: Number(kpis.pm_due_today) || 0 },
    { name: "PM overdue", value: Number(kpis.pm_overdue) || 0 },
    { name: "Complaints", value: Number(kpis.open_complaints) || 0 },
    { name: "SLA", value: Number(kpis.sla_breaches) || 0 },
    { name: "Reports", value: Number(kpis.pending_service_reports) || 0 },
  ].filter((x) => x.value > 0);

  const contractBars = [
    { name: "Active", value: Number(kpis.active_contracts) || 0 },
    { name: "Expiring", value: Number(kpis.contracts_expiring_30d) || 0 },
    { name: "At risk", value: Number(kpis.contracts_at_risk) || 0 },
  ];

  const techLoad = (data?.engineers || []).slice(0, 8).map((e) => {
    const pm = (data?.pmSchedules || []).filter((p) => p.assigned_engineer_id === e.id && !["completed", "closed"].includes(p.status)).length;
    const complaints = (data?.complaints || []).filter((c) => c.assigned_engineer_id === e.id && !["closed", "resolved"].includes(c.status)).length;
    return { name: String(e.name || e.id).slice(0, 12), pm, complaints };
  });

  const trend = Array.from({ length: 12 }, (_, i) => ({
    name: `W${i + 1}`,
    pm: Math.max(0, (Number(kpis.pm_due_today) || 2) + (i % 4) - 1),
    complaints: Math.max(0, (Number(kpis.open_complaints) || 1) + ((i * 2) % 3)),
  }));

  const health = Math.max(
    10,
    Math.min(100, 100 - (Number(kpis.pm_overdue) || 0) * 8 - (Number(kpis.sla_breaches) || 0) * 10 - (Number(kpis.contracts_at_risk) || 0) * 6)
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="AMC Command Center"
        subtitle="Live KPIs from connected contracts, PM, complaints & visits"
        onRefresh={refresh}
        onExport={() => toast.success("Dashboard export — connect to reporting service")}
      />

      <FilterBar>
        <label className="text-[11px] text-gray-600">
          Customer
          <TinySelect
            className="block mt-0.5 w-44"
            onChange={(e) => e.target.value && go("customers", { customerId: e.target.value, highlight: e.target.value })}
            defaultValue=""
          >
            <option value="">All customers</option>
            {(data?.customers || []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.customer_name}
              </option>
            ))}
          </TinySelect>
        </label>
      </FilterBar>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
        {kpiTiles.map((k) => (
          <SparkKpi
            key={k.label}
            label={k.label}
            value={k.value ?? "—"}
            series={sparkFromValue(Number(k.value) || 0)}
            color={k.color}
            onClick={() => go(k.path, k.params)}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartPanel title="Service demand trend" subtitle="PM vs complaints" className="lg:col-span-2" height={220}>
          <AreaTrendChart
            data={trend}
            series={[
              { key: "pm", name: "PM", color: CHART_SERIES[0] },
              { key: "complaints", name: "Complaints", color: CHART_SERIES[3] },
            ]}
            height={220}
          />
        </ChartPanel>
        <ChartPanel title="Service health" height={220}>
          <RadialScoreChart value={health} label="Health" color={health >= 70 ? CHART_SERIES[5] : CHART_SERIES[2]} height={200} />
        </ChartPanel>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ChartPanel title="Open work mix" height={230}>
          <DonutChart data={serviceMix} centerLabel="Open" height={210} />
        </ChartPanel>
        <ChartPanel title="Contract posture" height={230}>
          <BarCompareChart data={contractBars} series={[{ key: "value", name: "Contracts", color: CHART_SERIES[1] }]} height={210} />
        </ChartPanel>
        <ChartPanel title="Technician load" height={230}>
          <BarCompareChart
            data={techLoad}
            layout="horizontal"
            series={[
              { key: "pm", name: "PM", color: CHART_SERIES[0] },
              { key: "complaints", name: "Calls", color: CHART_SERIES[2] },
            ]}
            height={210}
          />
        </ChartPanel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SectionCard title="Open alerts" className="lg:col-span-1">
          <div className="space-y-2 max-h-52 overflow-y-auto">
            {alerts.map((a) => (
              <AlertCard
                key={a.id}
                alert={a}
                onAction={() => a.record_type && a.record_id && openRecord(a.record_type, a.record_id)}
              />
            ))}
          </div>
          <button type="button" onClick={() => go("alerts")} className="text-[11px] text-accent mt-2 font-medium">
            View all alerts →
          </button>
        </SectionCard>

        <SectionCard title="Contract expiry tracker" className="lg:col-span-2">
          <DenseTable
            columns={[
              { key: "contract_no", label: "Contract", render: (r) => <LinkedRecord type="contract" id={r.id} label={r.contract_no} /> },
              { key: "customer_name", label: "Customer", render: (r) => <LinkedRecord type="customer" id={r.customer_id} label={r.customer_name} /> },
              { key: "end_date", label: "End" },
              { key: "status", label: "Status", render: (r) => <AmcStatusBadge status={r.status} /> },
            ]}
            rows={expiring}
            onRowClick={(r) => openRecord("contract", r.id)}
          />
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Technician workload (today)">
          <DenseTable
            columns={[
              { key: "name", label: "Technician" },
              { key: "region", label: "Region" },
              { key: "pm", label: "PM" },
              { key: "complaints", label: "Calls" },
            ]}
            rows={(data?.engineers || []).map((e) => {
              const wl = (data?.pmSchedules || []).filter((p) => p.assigned_engineer_id === e.id && !["completed", "closed"].includes(p.status));
              const wc = (data?.complaints || []).filter((c) => c.assigned_engineer_id === e.id && !["closed", "resolved"].includes(c.status));
              return { ...e, pm: wl.length, complaints: wc.length };
            })}
            onRowClick={(e) => go("technicians", { engineerId: e.id })}
          />
        </SectionCard>

        <SectionCard title="Recent activity">
          <Timeline
            items={
              activity.length
                ? activity.map((a) => ({
                    title: a.title,
                    meta: a.meta,
                  }))
                : [{ title: "No activity", meta: "—" }]
            }
          />
        </SectionCard>
      </div>
    </div>
  );
}
