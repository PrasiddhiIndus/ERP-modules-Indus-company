import React, { useMemo, useState } from "react";
import EntityListPage from "./components/EntityListPage";
import AmcFilterBar from "./components/AmcFilterBar";
import RelatedRecordsTable, { customerColumn, siteColumn } from "./components/RelatedRecordsTable";
import { Drawer, ProfileTabs, DetailField, AmcStatusBadge } from "./components/AmcUi";
import { useAmcSelection } from "./hooks/useAmcList";
import { useAmc } from "./contexts/AmcContext";
import LinkedRecord from "./components/LinkedRecord";
import { COMPLAINT_STATUS } from "./constants/workflows";

export default function Complaints() {
  const { related, navigateTo, openRecord } = useAmc();
  const { rows, loading, search, setSearch, statusFilter, setStatusFilter, reload, selected, setSelected } =
    useAmcSelection("complaints", ["complaint_no", "customer_name", "site_name"]);
  const [tab, setTab] = useState("info");

  const columns = useMemo(
    () => [
      { key: "complaint_no", label: "Complaint No" },
      customerColumn(),
      siteColumn(),
      {
        key: "asset_name",
        label: "Asset",
        render: (r) => <LinkedRecord type="asset" id={r.asset_id} label={r.asset_name} />,
      },
      { key: "priority", label: "Priority", render: (r) => <AmcStatusBadge status={r.priority} /> },
      { key: "assigned_engineer_name", label: "Assigned" },
      { key: "status", label: "Status", render: (r) => <AmcStatusBadge status={r.status} /> },
      { key: "sla_status", label: "SLA", render: (r) => <AmcStatusBadge status={r.sla_status} /> },
    ],
    []
  );

  const visits = selected ? related.visitsForComplaint(selected.id) : [];

  return (
    <>
      <AmcFilterBar />
      <EntityListPage
        title="Complaint Calls"
        subtitle="SLA-tracked — linked visits and assets"
        onRefresh={reload}
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        statusOptions={COMPLAINT_STATUS}
        columns={columns}
        rows={rows}
        loading={loading}
        onRowClick={setSelected}
      />
      <Drawer open={!!selected} title={selected?.complaint_no} onClose={() => setSelected(null)} widthClass="max-w-xl">
        {selected && (
          <ProfileTabs
            tabs={[
              { id: "info", label: "Info" },
              { id: "visits", label: "Visits" },
              { id: "sla", label: "SLA" },
            ]}
            active={tab}
            onChange={setTab}
          >
            {tab === "info" && (
              <div className="space-y-2">
                <DetailField label="Customer" value={<LinkedRecord type="customer" id={selected.customer_id} label={selected.customer_name} />} />
                <DetailField label="Site" value={<LinkedRecord type="site" id={selected.site_id} label={selected.site_name} />} />
                <DetailField label="Asset" value={<LinkedRecord type="asset" id={selected.asset_id} label={selected.asset_name} />} />
                <button
                  type="button"
                  className="text-xs mt-2 px-3 py-1.5 border rounded"
                  onClick={() => navigateTo("visits", { complaintId: selected.id })}
                >
                  Schedule visit →
                </button>
              </div>
            )}
            {tab === "visits" && (
              <RelatedRecordsTable
                rows={visits}
                columns={[
                  { key: "visit_no", label: "Visit" },
                  { key: "status", label: "Status" },
                ]}
                onRowClick={(r) => openRecord("visit", r.id)}
              />
            )}
            {tab === "sla" && (
              <div className="grid grid-cols-2 gap-2">
                <DetailField label="Response due" value={selected.response_due_at && new Date(selected.response_due_at).toLocaleString()} />
                <DetailField label="Closure due" value={selected.closure_due_at && new Date(selected.closure_due_at).toLocaleString()} />
              </div>
            )}
          </ProfileTabs>
        )}
      </Drawer>
    </>
  );
}
