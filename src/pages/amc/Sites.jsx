import React, { useMemo } from "react";
import EntityListPage from "./components/EntityListPage";
import AmcFilterBar from "./components/AmcFilterBar";
import RelatedRecordsTable, { customerColumn, contractColumn } from "./components/RelatedRecordsTable";
import { Drawer, ProfileTabs, DetailField, AmcStatusBadge } from "./components/AmcUi";
import { useAmcSelection } from "./hooks/useAmcList";
import { useAmc } from "./contexts/AmcContext";
import LinkedRecord from "./components/LinkedRecord";

export default function Sites() {
  const { related, navigateTo, openRecord } = useAmc();
  const { rows, loading, search, setSearch, statusFilter, setStatusFilter, reload, selected, setSelected } =
    useAmcSelection("sites", ["site_code", "site_name", "customer_name", "city"]);
  const [tab, setTab] = React.useState("info");

  const columns = useMemo(
    () => [
      { key: "site_code", label: "Site Code" },
      { key: "site_name", label: "Site Name" },
      customerColumn(),
      contractColumn(),
      { key: "city", label: "City" },
      { key: "assigned_engineer_name", label: "Engineer" },
      { key: "next_pm_date", label: "Next PM" },
      { key: "status", label: "Status", render: (r) => <AmcStatusBadge status={r.status} /> },
    ],
    []
  );

  const linked = selected
    ? {
        assets: related.assetsForSite(selected.id),
        pm: related.pmForSite(selected.id),
        complaints: related.complaintsForSite(selected.id),
      }
    : null;

  return (
    <>
      <AmcFilterBar />
      <EntityListPage
        title="Covered Sites"
        subtitle="Sites under contract — assets, PM, and complaints linked"
        onRefresh={reload}
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        statusOptions={["active", "inactive"]}
        columns={columns}
        rows={rows}
        loading={loading}
        onRowClick={setSelected}
      />
      <Drawer open={!!selected} title={selected?.site_name} onClose={() => setSelected(null)} widthClass="max-w-xl">
        {selected && linked && (
          <ProfileTabs
            tabs={[
              { id: "info", label: "Site Info" },
              { id: "assets", label: "Assets" },
              { id: "pm", label: "PM" },
              { id: "complaints", label: "Complaints" },
            ]}
            active={tab}
            onChange={setTab}
          >
            {tab === "info" && (
              <div className="grid grid-cols-2 gap-3">
                <DetailField label="Customer" value={<LinkedRecord type="customer" id={selected.customer_id} label={selected.customer_name} />} />
                <DetailField label="Contract" value={<LinkedRecord type="contract" id={selected.contract_id} label={selected.contract_no} />} />
                <DetailField label="Engineer" value={selected.assigned_engineer_name} />
                <DetailField label="Next PM" value={selected.next_pm_date} />
              </div>
            )}
            {tab === "assets" && (
              <RelatedRecordsTable
                rows={linked.assets}
                columns={[
                  { key: "asset_code", label: "Code" },
                  { key: "equipment_name", label: "Equipment" },
                ]}
                onRowClick={(r) => openRecord("asset", r.id)}
                onViewAll={() => navigateTo("assets", { siteId: selected.id })}
              />
            )}
            {tab === "pm" && (
              <RelatedRecordsTable
                rows={linked.pm}
                columns={[
                  { key: "pm_no", label: "PM" },
                  { key: "due_date", label: "Due" },
                ]}
                onRowClick={(r) => openRecord("pm", r.id)}
                onViewAll={() => navigateTo("pm-schedule", { siteId: selected.id })}
              />
            )}
            {tab === "complaints" && (
              <RelatedRecordsTable
                rows={linked.complaints}
                columns={[
                  { key: "complaint_no", label: "No" },
                  { key: "status", label: "Status" },
                ]}
                onRowClick={(r) => openRecord("complaint", r.id)}
                onViewAll={() => navigateTo("complaints", { siteId: selected.id })}
              />
            )}
          </ProfileTabs>
        )}
      </Drawer>
    </>
  );
}
