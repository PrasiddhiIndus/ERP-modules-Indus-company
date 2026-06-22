import React, { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useOperations } from "../../contexts/OperationsContext";
import { getBreadcrumbs } from "../../navConfig";
import { formatCurrency } from "../../data/mockOperationsData";
import {
  Breadcrumbs,
  ChartCard,
  DemoBanner,
  EnterpriseDataTable,
  KpiTile,
  LinkedSiteChip,
  OpsStatusBadge,
  PageHeader,
} from "../../components/OperationsUi";

export default function RentMonthlyDashboard() {
  const { data, refresh, theme, getSite, getProperty } = useOperations();

  const currentMonth = "2026-06";
  const monthPayments = useMemo(
    () => (data?.rentPayments || []).filter((r) => r.month === currentMonth),
    [data]
  );

  const totalDue = (data?.properties || []).reduce((s, p) => s + p.monthly_rent, 0);
  const totalPaid = monthPayments.filter((r) => r.status === "paid").reduce((s, r) => s + r.amount, 0);
  const totalPending = totalDue - totalPaid;

  const propertyRows = useMemo(
    () =>
      (data?.properties || []).map((p) => {
        const payment = monthPayments.find((r) => r.property_id === p.id);
        return {
          ...p,
          payment_status: payment?.status || "due",
          paid_amount: payment?.status === "paid" ? payment.amount : 0,
        };
      }),
    [data, monthPayments]
  );

  return (
    <div className="space-y-4">
      <DemoBanner />
      <Breadcrumbs items={getBreadcrumbs("rent-dashboard")} theme={theme} />
      <PageHeader title="Monthly Rent Dashboard" subtitle={`Rent collection overview — ${currentMonth}`} onRefresh={refresh} theme={theme} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <KpiTile label="Total Due" value={formatCurrency(totalDue)} />
        <KpiTile label="Collected" value={formatCurrency(totalPaid)} tone="border-emerald-100" />
        <KpiTile label="Outstanding" value={formatCurrency(totalPending)} tone="border-amber-100" />
        <KpiTile label="Properties" value={(data?.properties || []).length} />
      </div>

      <ChartCard title="Monthly rent trend" theme={theme}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data?.monthlyTrends?.rent || []}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={(v) => `₹${(v / 100000).toFixed(1)}L`} tick={{ fontSize: 10 }} />
            <Tooltip formatter={(v) => formatCurrency(v)} />
            <Bar dataKey="due" fill="#F59E0B" name="Due" radius={[4, 4, 0, 0]} />
            <Bar dataKey="paid" fill="#1F3A8A" name="Paid" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <EnterpriseDataTable
        theme={theme}
        columns={[
          { key: "property_code", label: "Property" },
          { key: "name", label: "Name" },
          { key: "site_id", label: "Site", render: (r) => <LinkedSiteChip site={getSite(r.site_id)} /> },
          { key: "monthly_rent", label: "Rent Due", render: (r) => formatCurrency(r.monthly_rent) },
          { key: "paid_amount", label: "Paid", render: (r) => formatCurrency(r.paid_amount) },
          { key: "payment_status", label: "Status", render: (r) => <OpsStatusBadge status={r.payment_status} /> },
        ]}
        rows={propertyRows}
      />
    </div>
  );
}
