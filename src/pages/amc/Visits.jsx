import React, { useMemo, useState } from "react";
import EntityListPage from "./components/EntityListPage";
import AmcFilterBar from "./components/AmcFilterBar";
import RelatedRecordsTable, { customerColumn, siteColumn } from "./components/RelatedRecordsTable";
import { Drawer, ProfileTabs, DetailField, AmcStatusBadge } from "./components/AmcUi";
import { useAmcSelection } from "./hooks/useAmcList";
import { useAmc } from "./contexts/AmcContext";
import LinkedRecord from "./components/LinkedRecord";
import { VISIT_STATUS } from "./constants/workflows";

export default function Visits() {
  const { related, navigateTo, openRecord, getById } = useAmc();
  const { rows, loading, search, setSearch, statusFilter, setStatusFilter, reload, selected, setSelected } =
    useAmcSelection("visits", ["visit_no", "customer_name", "site_name"]);
  const [tab, setTab] = useState("summary");

  const columns = useMemo(
    () => [
      { key: "visit_no", label: "Visit No" },
      { key: "visit_type", label: "Type" },
      customerColumn(),
      siteColumn(),
      {
        key: "linked_ref",
        label: "PM / Complaint",
        render: (r) => {
          if (r.pm_schedule_id) {
            const pm = getById("pmSchedules", r.pm_schedule_id);
            return <LinkedRecord type="pm" id={r.pm_schedule_id} label={pm?.pm_no || r.linked_ref} />;
          }
          if (r.complaint_id) {
            const c = getById("complaints", r.complaint_id);
            return <LinkedRecord type="complaint" id={r.complaint_id} label={c?.complaint_no || r.linked_ref} />;
          }
          return r.linked_ref || "—";
        },
      },
      { key: "engineer_name", label: "Engineer" },
      { key: "visit_date", label: "Date" },
      { key: "status", label: "Status", render: (r) => <AmcStatusBadge status={r.status} /> },
      { key: "report_status", label: "Report", render: (r) => <AmcStatusBadge status={r.report_status} /> },
    ],
    [getById]
  );

  const reports = selected ? related.reportsForVisit(selected.id) : [];

  return (
    <>
      <AmcFilterBar />
      <EntityListPage
        title="Service Visits"
        subtitle="Originate from PM or complaint — reports linked"
        onRefresh={reload}
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        statusOptions={VISIT_STATUS}
        columns={columns}
        rows={rows}
        loading={loading}
        onRowClick={setSelected}
      />
      <Drawer open={!!selected} title={selected?.visit_no} onClose={() => setSelected(null)} widthClass="max-w-xl">
        {selected && (
          <ProfileTabs
            tabs={[
              { id: "summary", label: "Summary" },
              { id: "report", label: "Report" },
            ]}
            active={tab}
            onChange={setTab}
          >
            {tab === "summary" && (
              <div className="space-y-2">
                <DetailField label="Customer" value={<LinkedRecord type="customer" id={selected.customer_id} label={selected.customer_name} />} />
                <DetailField label="Site" value={<LinkedRecord type="site" id={selected.site_id} label={selected.site_name} />} />
                {selected.pm_schedule_id && (
                  <DetailField
                    label="PM"
                    value={<LinkedRecord type="pm" id={selected.pm_schedule_id} label={selected.linked_ref} />}
                  />
                )}
                {selected.complaint_id && (
                  <DetailField
                    label="Complaint"
                    value={<LinkedRecord type="complaint" id={selected.complaint_id} label={selected.linked_ref} />}
                  />
                )}
                <button
                  type="button"
                  className="text-xs mt-2 px-3 py-1.5 border rounded"
                  onClick={() => navigateTo("service-reports", { visitId: selected.id })}
                >
                  Open service reports →
                </button>
              </div>
            )}
            {tab === "report" && (
              <RelatedRecordsTable
                rows={reports}
                columns={[
                  { key: "report_no", label: "Report" },
                  { key: "report_status", label: "Status" },
                ]}
                onRowClick={(r) => openRecord("report", r.id)}
                emptyText="No report uploaded"
              />
            )}
          </ProfileTabs>
        )}
      </Drawer>
    </>
  );
}
