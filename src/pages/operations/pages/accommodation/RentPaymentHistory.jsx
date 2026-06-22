import React, { useMemo, useState } from "react";
import { useOperations } from "../../contexts/OperationsContext";
import { getBreadcrumbs } from "../../navConfig";
import { formatCurrency, RENT_STATUSES } from "../../data/mockOperationsData";
import {
  Breadcrumbs,
  DemoBanner,
  EnterpriseDataTable,
  FilterBar,
  LinkedSiteChip,
  OpsStatusBadge,
  PageHeader,
  TinyInput,
  TinySelect,
} from "../../components/OperationsUi";

export default function RentPaymentHistory() {
  const { data, refresh, theme, getProperty, getSite } = useOperations();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [propertyFilter, setPropertyFilter] = useState("");

  const rows = useMemo(() => {
    let list = (data?.rentPayments || []).map((r) => ({
      ...r,
      property: getProperty(r.property_id),
    }));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (r) =>
          r.payment_no.toLowerCase().includes(q) ||
          r.reference?.toLowerCase().includes(q) ||
          r.property?.name?.toLowerCase().includes(q)
      );
    }
    if (statusFilter) list = list.filter((r) => r.status === statusFilter);
    if (propertyFilter) list = list.filter((r) => r.property_id === propertyFilter);
    return list;
  }, [data, search, statusFilter, propertyFilter, getProperty]);

  return (
    <div className="space-y-3">
      <DemoBanner />
      <Breadcrumbs items={getBreadcrumbs("rent-history")} theme={theme} />
      <PageHeader title="Rent Payment History" subtitle="Complete payment ledger for all accommodation properties" onRefresh={refresh} onExport={() => window.alert("Export payment history")} theme={theme} />

      <FilterBar>
        <label className="text-[11px] text-gray-600 flex-1">
          Search
          <TinyInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Payment no., reference…" className="block mt-0.5 max-w-xs w-full" />
        </label>
        <label className="text-[11px] text-gray-600">
          Property
          <TinySelect value={propertyFilter} onChange={(e) => setPropertyFilter(e.target.value)} className="block mt-0.5 w-48">
            <option value="">All</option>
            {(data?.properties || []).map((p) => (
              <option key={p.id} value={p.id}>{p.property_code}</option>
            ))}
          </TinySelect>
        </label>
        <label className="text-[11px] text-gray-600">
          Status
          <TinySelect value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="block mt-0.5 w-32">
            <option value="">All</option>
            {RENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </TinySelect>
        </label>
      </FilterBar>

      <EnterpriseDataTable
        theme={theme}
        columns={[
          { key: "payment_no", label: "Payment No." },
          { key: "property_id", label: "Property", render: (r) => r.property?.name },
          { key: "site", label: "Site", render: (r) => <LinkedSiteChip site={getSite(r.property?.site_id)} /> },
          { key: "month", label: "Month" },
          { key: "amount", label: "Amount", render: (r) => formatCurrency(r.amount), sortValue: (r) => r.amount },
          { key: "payment_date", label: "Paid On" },
          { key: "mode", label: "Mode" },
          { key: "reference", label: "Reference" },
          { key: "status", label: "Status", render: (r) => <OpsStatusBadge status={r.status} /> },
        ]}
        rows={rows}
        enableBulk
        onExport={() => window.alert("Exported payment history")}
      />
    </div>
  );
}
