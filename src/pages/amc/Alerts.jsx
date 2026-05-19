import React from "react";
import EntityListPage from "./components/EntityListPage";
import AmcFilterBar from "./components/AmcFilterBar";
import { AlertCard, AmcStatusBadge, PageHeader, TinySelect } from "./components/AmcUi";
import { useAmcList } from "./hooks/useAmcList";
import { useAmc } from "./contexts/AmcContext";
import LinkedRecord from "./components/LinkedRecord";

export default function Alerts() {
  const { openRecord, refresh } = useAmc();
  const { rows, loading, search, setSearch, reload } = useAmcList("alerts", ["title", "customer_name", "related_record"]);
  const [severity, setSeverity] = React.useState("");

  const filtered = rows.filter((r) => !severity || r.severity === severity);

  const columns = [
    { key: "alert_type", label: "Type", render: (r) => r.alert_type?.replace(/_/g, " ") },
    { key: "severity", label: "Severity", render: (r) => <AmcStatusBadge status={r.severity} /> },
    {
      key: "customer_name",
      label: "Customer",
      render: (r) => <LinkedRecord type="customer" id={r.customer_id} label={r.customer_name} />,
    },
    {
      key: "site_name",
      label: "Site",
      render: (r) => <LinkedRecord type="site" id={r.site_id} label={r.site_name} />,
    },
    { key: "related_record", label: "Related" },
    { key: "status", label: "Status", render: (r) => <AmcStatusBadge status={r.status} /> },
    {
      key: "action",
      label: "Action",
      render: (r) =>
        r.record_type && r.record_id ? (
          <button
            type="button"
            className="text-[11px] text-[#1F3A8A] font-medium"
            onClick={(e) => {
              e.stopPropagation();
              openRecord(r.record_type, r.record_id);
            }}
          >
            Open record →
          </button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Alerts & SLA" subtitle="Drill through to PM, complaints, contracts" onRefresh={() => refresh()} />
      <AmcFilterBar />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {filtered.slice(0, 4).map((a) => (
          <AlertCard key={a.id} alert={a} onAction={() => a.record_type && a.record_id && openRecord(a.record_type, a.record_id)} />
        ))}
      </div>
      <EntityListPage
        title="All alerts"
        search={search}
        onSearchChange={setSearch}
        statusFilter=""
        onStatusFilterChange={() => {}}
        onRefresh={reload}
        extraFilters={
          <label className="text-[11px] text-gray-600">
            Severity
            <TinySelect value={severity} onChange={(e) => setSeverity(e.target.value)} className="block mt-0.5 w-32">
              <option value="">All</option>
              <option value="warning">Warning</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </TinySelect>
          </label>
        }
        columns={columns}
        rows={filtered}
        loading={loading}
        onRowClick={(r) => r.record_type && r.record_id && openRecord(r.record_type, r.record_id)}
      />
    </div>
  );
}
