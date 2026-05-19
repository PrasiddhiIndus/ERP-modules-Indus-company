import React, { useMemo } from "react";
import EntityListPage from "./components/EntityListPage";
import AmcFilterBar from "./components/AmcFilterBar";
import RelatedRecordsTable, { customerColumn, siteColumn } from "./components/RelatedRecordsTable";
import { Drawer, ProfileTabs, DetailField, AmcStatusBadge } from "./components/AmcUi";
import { useAmcSelection } from "./hooks/useAmcList";
import { useAmc } from "./contexts/AmcContext";
import LinkedRecord from "./components/LinkedRecord";
import { CONTRACT_STATUS } from "./constants/workflows";

const TABS = [
  { id: "summary", label: "Summary" },
  { id: "sites", label: "Covered Sites" },
  { id: "assets", label: "Covered Assets" },
  { id: "pm", label: "PM Schedule" },
  { id: "complaints", label: "Complaints" },
  { id: "visits", label: "Visits" },
  { id: "sla", label: "SLA" },
];

export default function Contracts() {
  const { related, navigateTo, openRecord } = useAmc();
  const { rows, loading, search, setSearch, statusFilter, setStatusFilter, reload, selected, setSelected } =
    useAmcSelection("contracts", ["contract_no", "customer_name", "contract_type"]);
  const [tab, setTab] = React.useState("summary");

  const columns = useMemo(
    () => [
      { key: "contract_no", label: "Contract No" },
      customerColumn(),
      { key: "contract_type", label: "Type" },
      { key: "end_date", label: "End" },
      { key: "site_count", label: "Sites" },
      { key: "status", label: "Status", render: (r) => <AmcStatusBadge status={r.status} /> },
    ],
    []
  );

  const linked = selected
    ? {
        sites: related.sitesForContract(selected.id),
        assets: related.assetsForContract(selected.id),
        pm: related.pmForContract(selected.id),
        complaints: related.complaintsForContract(selected.id),
      }
    : null;

  return (
    <>
      <AmcFilterBar />
      <EntityListPage
        title="AMC Contracts"
        subtitle="Linked to customers, sites, assets, PM and complaints"
        onRefresh={reload}
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        statusOptions={CONTRACT_STATUS}
        columns={columns}
        rows={rows}
        loading={loading}
        onRowClick={setSelected}
      />
      <Drawer open={!!selected} title={selected?.contract_no} onClose={() => setSelected(null)} widthClass="max-w-2xl">
        {selected && linked && (
          <ProfileTabs tabs={TABS} active={tab} onChange={setTab}>
            {tab === "summary" && (
              <div className="grid grid-cols-2 gap-3">
                <DetailField
                  label="Customer"
                  value={<LinkedRecord type="customer" id={selected.customer_id} label={selected.customer_name} />}
                />
                <DetailField label="Period" value={`${selected.start_date} → ${selected.end_date}`} />
                <DetailField label="SLA" value={`${selected.sla_response_hours}h / ${selected.sla_closure_hours}h`} />
                <DetailField label="Status" value={selected.status} />
              </div>
            )}
            {tab === "sites" && (
              <RelatedRecordsTable
                columns={[siteColumn(), { key: "city", label: "City" }, { key: "asset_count", label: "Assets" }]}
                rows={linked.sites}
                onRowClick={(r) => openRecord("site", r.id)}
                onViewAll={() => navigateTo("sites", { contractId: selected.id })}
              />
            )}
            {tab === "assets" && (
              <RelatedRecordsTable
                columns={[
                  { key: "asset_code", label: "Code" },
                  { key: "equipment_name", label: "Equipment" },
                  { key: "next_due_date", label: "Next PM" },
                ]}
                rows={linked.assets}
                onRowClick={(r) => openRecord("asset", r.id)}
                onViewAll={() => navigateTo("assets", { contractId: selected.id })}
              />
            )}
            {tab === "pm" && (
              <RelatedRecordsTable
                columns={[
                  { key: "pm_no", label: "PM" },
                  { key: "due_date", label: "Due" },
                  { key: "status", label: "Status", render: (r) => <AmcStatusBadge status={r.status} /> },
                ]}
                rows={linked.pm}
                onRowClick={(r) => openRecord("pm", r.id)}
                onViewAll={() => navigateTo("pm-schedule", { contractId: selected.id })}
              />
            )}
            {tab === "complaints" && (
              <RelatedRecordsTable
                columns={[
                  { key: "complaint_no", label: "Complaint" },
                  { key: "priority", label: "Priority" },
                  { key: "status", label: "Status", render: (r) => <AmcStatusBadge status={r.status} /> },
                ]}
                rows={linked.complaints}
                onRowClick={(r) => openRecord("complaint", r.id)}
                onViewAll={() => navigateTo("complaints", { contractId: selected.id })}
              />
            )}
            {tab === "sla" && (
              <DetailField
                label="SLA rules"
                value={`Response within ${selected.sla_response_hours}h · Closure within ${selected.sla_closure_hours}h`}
              />
            )}
          </ProfileTabs>
        )}
      </Drawer>
    </>
  );
}
