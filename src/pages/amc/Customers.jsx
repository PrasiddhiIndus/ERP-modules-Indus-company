import React, { useMemo } from "react";
import EntityListPage from "./components/EntityListPage";
import AmcFilterBar from "./components/AmcFilterBar";
import RelatedRecordsTable, { contractColumn } from "./components/RelatedRecordsTable";
import { Drawer, ProfileTabs, DetailField, AmcStatusBadge } from "./components/AmcUi";
import { useAmcSelection } from "./hooks/useAmcList";
import { useAmc } from "./contexts/AmcContext";
import LinkedRecord from "./components/LinkedRecord";

const PROFILE_TABS = [
  { id: "basic", label: "Basic Info" },
  { id: "contacts", label: "Contacts" },
  { id: "contracts", label: "Contracts" },
  { id: "sites", label: "Sites" },
  { id: "history", label: "Service History" },
  { id: "alerts", label: "Alerts" },
];

export default function Customers() {
  const { related, navigateTo, openRecord } = useAmc();
  const { rows, loading, search, setSearch, statusFilter, setStatusFilter, reload, selected, setSelected } =
    useAmcSelection("customers", ["customer_code", "customer_name", "city"]);

  const [tab, setTab] = React.useState("basic");

  const columns = useMemo(
    () => [
      { key: "customer_code", label: "Code" },
      { key: "customer_name", label: "Customer Name" },
      { key: "primary_contact_name", label: "Primary Contact" },
      { key: "contract_count", label: "Contracts" },
      { key: "site_count", label: "Sites" },
      { key: "status", label: "Status", render: (r) => <AmcStatusBadge status={r.status} /> },
    ],
    []
  );

  const linked = selected
    ? {
        contracts: related.contractsForCustomer(selected.id),
        sites: related.sitesForCustomer(selected.id),
        complaints: related.complaintsForCustomer(selected.id),
        visits: related.visitsForCustomer(selected.id),
        alerts: related.alertsForCustomer(selected.id),
      }
    : null;

  return (
    <>
      <AmcFilterBar />
      <EntityListPage
        title="AMC Customers"
        subtitle="Customer master — drill down to contracts, sites, and service history"
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
      <Drawer open={!!selected} title={selected?.customer_name} onClose={() => setSelected(null)} widthClass="max-w-xl">
        {selected && linked && (
          <ProfileTabs tabs={PROFILE_TABS} active={tab} onChange={setTab}>
            {tab === "basic" && (
              <div className="grid grid-cols-2 gap-3">
                <DetailField label="Code" value={selected.customer_code} />
                <DetailField label="City" value={selected.city} />
                <DetailField label="Category" value={selected.customer_category} />
                <DetailField label="Status" value={selected.status} />
              </div>
            )}
            {tab === "contacts" && (
              <div className="space-y-3">
                <DetailField label="Primary" value={`${selected.primary_contact_name} · ${selected.primary_contact_phone}`} />
                <DetailField label="Service" value={`${selected.service_contact_name} · ${selected.service_contact_phone}`} />
              </div>
            )}
            {tab === "contracts" && (
              <RelatedRecordsTable
                columns={[
                  { key: "contract_no", label: "Contract" },
                  { key: "contract_type", label: "Type" },
                  { key: "end_date", label: "End" },
                  { key: "status", label: "Status", render: (r) => <AmcStatusBadge status={r.status} /> },
                ]}
                rows={linked.contracts}
                onRowClick={(r) => openRecord("contract", r.id)}
                onViewAll={() => navigateTo("contracts", { customerId: selected.id })}
              />
            )}
            {tab === "sites" && (
              <RelatedRecordsTable
                columns={[
                  { key: "site_code", label: "Code" },
                  { key: "site_name", label: "Site" },
                  { key: "city", label: "City" },
                ]}
                rows={linked.sites}
                onRowClick={(r) => openRecord("site", r.id)}
                onViewAll={() => navigateTo("sites", { customerId: selected.id })}
              />
            )}
            {tab === "history" && (
              <RelatedRecordsTable
                title="Recent visits"
                columns={[
                  { key: "visit_no", label: "Visit" },
                  { key: "visit_type", label: "Type" },
                  { key: "visit_date", label: "Date" },
                ]}
                rows={linked.visits}
                onRowClick={(r) => openRecord("visit", r.id)}
                onViewAll={() => navigateTo("visits", { customerId: selected.id })}
              />
            )}
            {tab === "alerts" && (
              <RelatedRecordsTable
                columns={[{ key: "title", label: "Alert" }, { key: "severity", label: "Severity" }]}
                rows={linked.alerts}
                onRowClick={(a) => a.record_type && a.record_id && openRecord(a.record_type, a.record_id)}
              />
            )}
          </ProfileTabs>
        )}
      </Drawer>
    </>
  );
}
