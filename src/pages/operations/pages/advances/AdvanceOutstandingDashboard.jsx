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
  LinkedEmployeeChip,
  LinkedSiteChip,
  OpsStatusBadge,
  PageHeader,
} from "../../components/OperationsUi";

export default function AdvanceOutstandingDashboard() {
  const { data, refresh, theme, getSite, getEmployee } = useOperations();

  const outstanding = useMemo(
    () => (data?.advances || []).filter((a) => a.balance > 0),
    [data]
  );

  const chartData = outstanding.map((a) => ({
    name: a.request_no.replace("ADV-", ""),
    balance: a.balance,
  }));

  const totalOutstanding = outstanding.reduce((s, a) => s + a.balance, 0);

  return (
    <div className="space-y-4">
      <DemoBanner />
      <Breadcrumbs items={getBreadcrumbs("advance-outstanding")} theme={theme} />
      <PageHeader title="Outstanding Advances Dashboard" subtitle="Monitor unsettled advance balances across sites" onRefresh={refresh} theme={theme} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <KpiTile label="Outstanding Count" value={outstanding.length} tone="border-amber-100" />
        <KpiTile label="Total Balance" value={formatCurrency(totalOutstanding)} tone="border-orange-100" />
        <KpiTile label="Partially Settled" value={outstanding.filter((a) => a.status === "partially_settled").length} />
        <KpiTile label="Fully Approved (open)" value={outstanding.filter((a) => a.status === "approved").length} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Balance by request" theme={theme}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 9 }} />
              <YAxis tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => formatCurrency(v)} />
              <Bar dataKey="balance" fill="#F59E0B" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <EnterpriseDataTable
          theme={theme}
          columns={[
            { key: "request_no", label: "Request" },
            { key: "employee_id", label: "Employee", render: (r) => <LinkedEmployeeChip employee={getEmployee(r.employee_id)} /> },
            { key: "balance", label: "Balance", render: (r) => <span className="font-semibold text-amber-700">{formatCurrency(r.balance)}</span> },
            { key: "status", label: "Status", render: (r) => <OpsStatusBadge status={r.status} /> },
          ]}
          rows={outstanding}
          pageSize={5}
        />
      </div>

      <EnterpriseDataTable
        theme={theme}
        columns={[
          { key: "request_no", label: "Request No." },
          { key: "site_id", label: "Site", render: (r) => <LinkedSiteChip site={getSite(r.site_id)} /> },
          { key: "employee_id", label: "Employee", render: (r) => <LinkedEmployeeChip employee={getEmployee(r.employee_id)} /> },
          { key: "amount", label: "Original", render: (r) => formatCurrency(r.amount) },
          { key: "settled_amount", label: "Settled", render: (r) => formatCurrency(r.settled_amount) },
          { key: "balance", label: "Balance", render: (r) => formatCurrency(r.balance), sortValue: (r) => r.balance },
          { key: "status", label: "Status", render: (r) => <OpsStatusBadge status={r.status} /> },
        ]}
        rows={outstanding}
        enableBulk
      />
    </div>
  );
}
