import React, { useMemo } from "react";
import { useParams } from "react-router-dom";
import { useOperations } from "../../contexts/OperationsContext";
import { getBreadcrumbs } from "../../navConfig";
import { formatCurrency } from "../../data/mockOperationsData";
import {
  Breadcrumbs,
  DemoBanner,
  EnterpriseDataTable,
  LinkedSiteChip,
  OpsStatusBadge,
  PageHeader,
  PrimaryButton,
  SectionCard,
  useThemeClasses,
} from "../../components/OperationsUi";

function DetailField({ label, value }) {
  return (
    <div>
      <p className="text-[10px] font-medium text-gray-500 uppercase">{label}</p>
      <p className="text-sm text-gray-900 mt-0.5">{value ?? "—"}</p>
    </div>
  );
}

export default function PropertyDetails() {
  const { id } = useParams();
  const { data, refresh, theme, getSite, navigateTo } = useOperations();
  const t = useThemeClasses(theme);

  const property = useMemo(
    () => (data?.properties || []).find((p) => String(p.id) === String(id)),
    [data, id]
  );

  const payments = useMemo(
    () => (data?.rentPayments || []).filter((r) => r.property_id === id),
    [data, id]
  );

  if (!property) {
    return <p className="text-sm text-gray-500 py-8 text-center">Property not found.</p>;
  }

  const site = getSite(property.site_id);
  const occupancyPct = Math.round((property.occupied / property.units) * 100);

  return (
    <div className="space-y-4">
      <DemoBanner />
      <Breadcrumbs items={getBreadcrumbs("property-details", { name: property.name })} theme={theme} />
      <PageHeader
        title={property.name}
        subtitle={property.property_code}
        onRefresh={refresh}
        primaryAction={<PrimaryButton onClick={() => navigateTo("rent-entry")}>Record Rent Payment</PrimaryButton>}
        theme={theme}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SectionCard title="Property details" className={`lg:col-span-2 ${t.card}`}>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <DetailField label="Type" value={property.type} />
            <DetailField label="Site" value={<LinkedSiteChip site={site} />} />
            <DetailField label="Status" value={<OpsStatusBadge status={property.status} />} />
            <DetailField label="Address" value={property.address} />
            <DetailField label="Landlord" value={property.landlord} />
            <DetailField label="Monthly Rent" value={formatCurrency(property.monthly_rent)} />
            <DetailField label="Units" value={property.units} />
            <DetailField label="Occupied" value={`${property.occupied} (${occupancyPct}%)`} />
            <DetailField label="Vacant" value={property.units - property.occupied} />
          </div>
        </SectionCard>

        <SectionCard title="Occupancy" className={t.card}>
          <div className="flex items-center justify-center py-4">
            <div className="relative w-28 h-28">
              <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5e7eb" strokeWidth="3" />
                <circle
                  cx="18"
                  cy="18"
                  r="15.9"
                  fill="none"
                  stroke="#1F3A8A"
                  strokeWidth="3"
                  strokeDasharray={`${occupancyPct} ${100 - occupancyPct}`}
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-lg font-bold">{occupancyPct}%</span>
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Recent rent payments" className={t.card}>
        <EnterpriseDataTable
          theme={theme}
          columns={[
            { key: "payment_no", label: "Payment No." },
            { key: "month", label: "Month" },
            { key: "amount", label: "Amount", render: (r) => formatCurrency(r.amount) },
            { key: "payment_date", label: "Paid On" },
            { key: "mode", label: "Mode" },
            { key: "status", label: "Status", render: (r) => <OpsStatusBadge status={r.status} /> },
          ]}
          rows={payments}
          pageSize={5}
        />
      </SectionCard>
    </div>
  );
}
