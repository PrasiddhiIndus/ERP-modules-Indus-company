import React, { useMemo, useState } from "react";
import { SectionCard, DenseTable, PageHeader, TinySelect, FilterBar } from "./components/AmcUi";
import { useAmc } from "./contexts/AmcContext";
import LinkedRecord from "./components/LinkedRecord";
import { AmcStatusBadge } from "./components/AmcUi";

const REPORT_CATALOG = [
  { id: "active", label: "Active Contracts", collection: "contracts" },
  { id: "expiry", label: "Expiry Report", collection: "contracts" },
  { id: "pm_due", label: "PM Due / Overdue", collection: "pmSchedules" },
  { id: "complaint_aging", label: "Complaint Aging", collection: "complaints" },
  { id: "engineer_visits", label: "Engineer Visit Summary", collection: "visits" },
];

export default function Reports() {
  const { data, refresh, openRecord } = useAmc();
  const [reportId, setReportId] = useState("active");
  const active = REPORT_CATALOG.find((r) => r.id === reportId);

  const rows = useMemo(() => {
    if (!data || !active) return [];
    const list = data[active.collection] || [];
    if (reportId === "active") return list.filter((c) => ["active", "running"].includes(c.status));
    if (reportId === "expiry") return list.filter((c) => c.status === "expiring_soon" || c.status === "at_risk");
    if (reportId === "pm_due") {
      const today = new Date().toISOString().slice(0, 10);
      return list.filter((p) => p.due_date <= today && !["completed", "closed"].includes(p.status));
    }
    return list;
  }, [data, active, reportId]);

  const columns = useMemo(() => {
    if (active?.collection === "contracts") {
      return [
        { key: "contract_no", label: "Contract", render: (r) => <LinkedRecord type="contract" id={r.id} label={r.contract_no} /> },
        { key: "customer_name", label: "Customer", render: (r) => <LinkedRecord type="customer" id={r.customer_id} label={r.customer_name} /> },
        { key: "end_date", label: "End" },
        { key: "status", label: "Status", render: (r) => <AmcStatusBadge status={r.status} /> },
      ];
    }
    if (active?.collection === "pmSchedules") {
      return [
        { key: "pm_no", label: "PM", render: (r) => <LinkedRecord type="pm" id={r.id} label={r.pm_no} /> },
        { key: "due_date", label: "Due" },
        { key: "status", label: "Status", render: (r) => <AmcStatusBadge status={r.status} /> },
      ];
    }
    if (active?.collection === "complaints") {
      return [
        { key: "complaint_no", label: "Complaint", render: (r) => <LinkedRecord type="complaint" id={r.id} label={r.complaint_no} /> },
        { key: "priority", label: "Priority" },
        { key: "status", label: "Status", render: (r) => <AmcStatusBadge status={r.status} /> },
      ];
    }
    return [
      { key: "visit_no", label: "Visit" },
      { key: "customer_name", label: "Customer" },
    ];
  }, [active]);

  return (
    <div className="space-y-4">
      <PageHeader title="AMC Reports" subtitle="Live data from connected module store" onRefresh={refresh} onExport={() => window.alert("Export")} />
      <FilterBar>
        <label className="text-[11px] text-gray-600">
          Report
          <TinySelect value={reportId} onChange={(e) => setReportId(e.target.value)} className="block mt-0.5 w-56">
            {REPORT_CATALOG.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </TinySelect>
        </label>
      </FilterBar>
      <SectionCard title={`${active?.label} (${rows.length})`}>
        <DenseTable
          columns={columns}
          rows={rows}
          onRowClick={(r) => {
            const typeMap = {
              contracts: "contract",
              pmSchedules: "pm",
              complaints: "complaint",
              visits: "visit",
            };
            const t = typeMap[active.collection];
            if (t) openRecord(t, r.id);
          }}
        />
      </SectionCard>
    </div>
  );
}
