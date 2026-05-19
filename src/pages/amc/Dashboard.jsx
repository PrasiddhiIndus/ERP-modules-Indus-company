import React from "react";
import {
  SectionCard,
  KpiTile,
  FilterBar,
  DenseTable,
  Timeline,
  TinySelect,
  TinyInput,
  AlertCard,
  AmcStatusBadge,
  PageHeader,
} from "./components/AmcUi";
import { useAmc } from "./contexts/AmcContext";
import LinkedRecord from "./components/LinkedRecord";

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

  return (
    <div className="space-y-4">
      <PageHeader
        title="AMC Command Center"
        subtitle="Live KPIs from connected contracts, PM, complaints & visits"
        onRefresh={refresh}
        onExport={() => window.alert("Dashboard export — connect to reporting service")}
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
        <KpiTile label="Active Contracts" value={kpis.active_contracts ?? "—"} onClick={() => go("contracts", { status: "running" })} />
        <KpiTile label="Expiring (30d)" value={kpis.contracts_expiring_30d ?? "—"} tone="border-amber-100" onClick={() => go("contracts", { status: "expiring_soon" })} />
        <KpiTile label="PM Due Today" value={kpis.pm_due_today ?? "—"} onClick={() => go("pm-schedule", { due: "today" })} />
        <KpiTile label="PM Overdue" value={kpis.pm_overdue ?? "—"} tone="border-orange-100" onClick={() => go("pm-schedule", { status: "overdue" })} />
        <KpiTile label="Open Complaints" value={kpis.open_complaints ?? "—"} onClick={() => go("complaints")} />
        <KpiTile label="SLA Breaches" value={kpis.sla_breaches ?? "—"} tone="border-red-100" onClick={() => go("alerts")} />
        <KpiTile label="Pending Reports" value={kpis.pending_service_reports ?? "—"} onClick={() => go("service-reports", { status: "pending" })} />
        <KpiTile label="Contracts At Risk" value={kpis.contracts_at_risk ?? "—"} tone="border-red-100" onClick={() => go("contracts", { status: "at_risk" })} />
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
          <button type="button" onClick={() => go("alerts")} className="text-[11px] text-[#1F3A8A] mt-2 font-medium">
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
              const w = data ? { pm: 0, complaints: 0 } : { pm: 0, complaints: 0 };
              const bundle = data;
              if (bundle) {
                const wl = bundle.pmSchedules.filter((p) => p.assigned_engineer_id === e.id && !["completed", "closed"].includes(p.status));
                const wc = bundle.complaints.filter((c) => c.assigned_engineer_id === e.id && !["closed", "resolved"].includes(c.status));
                return { ...e, pm: wl.length, complaints: wc.length };
              }
              return { ...e, ...w };
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
