import React, { useMemo, useState } from "react";
import { useOperations } from "../../contexts/OperationsContext";
import { getBreadcrumbs } from "../../navConfig";
import { formatCurrency } from "../../data/mockOperationsData";
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

export default function PropertyList() {
  const { data, refresh, theme, getSite, navigateTo } = useOperations();
  const [search, setSearch] = useState("");
  const [siteFilter, setSiteFilter] = useState("");

  const rows = useMemo(() => {
    let list = data?.properties || [];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.property_code.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q) ||
          p.address.toLowerCase().includes(q)
      );
    }
    if (siteFilter) list = list.filter((p) => String(p.site_id) === siteFilter);
    return list;
  }, [data, search, siteFilter]);

  return (
    <div className="space-y-3">
      <DemoBanner />
      <Breadcrumbs items={getBreadcrumbs("properties")} theme={theme} />
      <PageHeader title="Property Listing" subtitle="Accommodation assets linked to operational sites" onRefresh={refresh} theme={theme} />

      <FilterBar>
        <label className="text-[11px] text-gray-600 flex-1">
          Search
          <TinyInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Code, name, address…" className="block mt-0.5 max-w-xs w-full" />
        </label>
        <label className="text-[11px] text-gray-600">
          Site
          <TinySelect value={siteFilter} onChange={(e) => setSiteFilter(e.target.value)} className="block mt-0.5 w-48">
            <option value="">All sites</option>
            {(data?.sites || []).map((s) => (
              <option key={s.id} value={s.id}>{s.site_code}</option>
            ))}
          </TinySelect>
        </label>
      </FilterBar>

      <EnterpriseDataTable
        theme={theme}
        columns={[
          { key: "property_code", label: "Code" },
          { key: "name", label: "Property Name" },
          { key: "type", label: "Type" },
          { key: "site_id", label: "Site", render: (r) => <LinkedSiteChip site={getSite(r.site_id)} /> },
          { key: "units", label: "Units" },
          { key: "occupied", label: "Occupied", render: (r) => `${r.occupied}/${r.units}` },
          { key: "monthly_rent", label: "Monthly Rent", render: (r) => formatCurrency(r.monthly_rent) },
          { key: "status", label: "Status", render: (r) => <OpsStatusBadge status={r.status} /> },
        ]}
        rows={rows}
        onRowClick={(r) => navigateTo("property-details", { id: r.id, name: r.name })}
        enableBulk
      />
    </div>
  );
}
