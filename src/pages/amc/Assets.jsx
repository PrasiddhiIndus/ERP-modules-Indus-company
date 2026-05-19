import React, { useMemo } from "react";
import EntityListPage from "./components/EntityListPage";
import AmcFilterBar from "./components/AmcFilterBar";
import RelatedRecordsTable, { customerColumn, siteColumn } from "./components/RelatedRecordsTable";
import { Drawer, ProfileTabs, DetailField, AmcStatusBadge } from "./components/AmcUi";
import { useAmcSelection } from "./hooks/useAmcList";
import { useAmc } from "./contexts/AmcContext";
import LinkedRecord from "./components/LinkedRecord";

export default function Assets() {
  const { related, navigateTo, openRecord } = useAmc();
  const { rows, loading, search, setSearch, statusFilter, setStatusFilter, reload, selected, setSelected } =
    useAmcSelection("assets", ["asset_code", "equipment_name", "serial_number"]);
  const [tab, setTab] = React.useState("basic");

  const columns = useMemo(
    () => [
      { key: "asset_code", label: "Code" },
      { key: "equipment_name", label: "Equipment" },
      customerColumn(),
      siteColumn(),
      { key: "next_due_date", label: "Next Due" },
      { key: "criticality", label: "Criticality" },
      { key: "status", label: "Status", render: (r) => <AmcStatusBadge status={r.status} /> },
    ],
    []
  );

  const linked = selected
    ? {
        pm: related.pmForAsset(selected.id),
        complaints: related.complaintsForSite(selected.site_id).filter((c) => c.asset_id === selected.id),
      }
    : null;

  return (
    <>
      <AmcFilterBar />
      <EntityListPage
        title="Covered Assets"
        subtitle="Equipment registry linked to site, contract, PM and complaints"
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
      <Drawer open={!!selected} title={selected?.equipment_name} onClose={() => setSelected(null)} widthClass="max-w-xl">
        {selected && linked && (
          <ProfileTabs
            tabs={[
              { id: "basic", label: "Basic Info" },
              { id: "pm", label: "PM Schedule" },
              { id: "complaints", label: "Complaints" },
            ]}
            active={tab}
            onChange={setTab}
          >
            {tab === "basic" && (
              <div className="grid grid-cols-2 gap-3">
                <DetailField label="Site" value={<LinkedRecord type="site" id={selected.site_id} label={selected.site_name} />} />
                <DetailField label="Serial" value={selected.serial_number} />
                <DetailField label="Last service" value={selected.last_service_date} />
                <DetailField label="Next due" value={selected.next_due_date} />
              </div>
            )}
            {tab === "pm" && (
              <RelatedRecordsTable
                rows={linked.pm}
                columns={[{ key: "pm_no", label: "PM" }, { key: "due_date", label: "Due" }]}
                onRowClick={(r) => openRecord("pm", r.id)}
                onViewAll={() => navigateTo("pm-schedule", { assetId: selected.id })}
              />
            )}
            {tab === "complaints" && (
              <RelatedRecordsTable
                rows={linked.complaints}
                columns={[{ key: "complaint_no", label: "No" }, { key: "status", label: "Status" }]}
                onRowClick={(r) => openRecord("complaint", r.id)}
                onViewAll={() => navigateTo("complaints", { assetId: selected.id })}
              />
            )}
          </ProfileTabs>
        )}
      </Drawer>
    </>
  );
}
