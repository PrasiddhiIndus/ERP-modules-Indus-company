import React, { useMemo } from "react";
import EntityListPage from "./components/EntityListPage";
import AmcFilterBar from "./components/AmcFilterBar";
import { AmcStatusBadge } from "./components/AmcUi";
import { useAmcSelection } from "./hooks/useAmcList";
import { useAmc } from "./contexts/AmcContext";
import LinkedRecord from "./components/LinkedRecord";

export default function ServiceReports() {
  const { openRecord } = useAmc();
  const { rows, loading, search, setSearch, statusFilter, setStatusFilter, reload } =
    useAmcSelection("service-reports", ["report_no", "visit_no", "customer_name"]);

  const columns = useMemo(
    () => [
      { key: "report_no", label: "Report ID" },
      {
        key: "visit_no",
        label: "Visit",
        render: (r) => <LinkedRecord type="visit" id={r.visit_id} label={r.visit_no} />,
      },
      {
        key: "customer_name",
        label: "Customer",
        render: (r) => <LinkedRecord type="customer" id={r.customer_id} label={r.customer_name} />,
      },
      { key: "site_name", label: "Site" },
      { key: "engineer_name", label: "Engineer" },
      { key: "report_date", label: "Date" },
      { key: "report_status", label: "Report", render: (r) => <AmcStatusBadge status={r.report_status} /> },
      { key: "signoff_status", label: "Sign-off", render: (r) => <AmcStatusBadge status={r.signoff_status} /> },
    ],
    []
  );

  return (
    <>
      <AmcFilterBar />
      <EntityListPage
        title="Service Reports"
        subtitle="Linked to visits — open visit for full context"
        onRefresh={reload}
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        statusOptions={["uploaded", "pending", "approved"]}
        columns={columns}
        rows={rows}
        loading={loading}
        onRowClick={(r) => r.visit_id && openRecord("visit", r.visit_id)}
      />
    </>
  );
}
