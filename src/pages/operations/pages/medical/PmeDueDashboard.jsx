import React, { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { useOperations } from "../../contexts/OperationsContext";
import { getBreadcrumbs } from "../../navConfig";
import {
  Breadcrumbs,
  DemoBanner,
  EmptyState,
  EnterpriseDataTable,
  KpiTile,
  LinkedEmployeeChip,
  OpsStatusBadge,
  PageHeader,
  PrimaryButton,
} from "../../components/OperationsUi";

export default function PmeDueDashboard() {
  const { data, refresh, theme, getEmployee, navigateTo } = useOperations();

  const dueRecords = useMemo(
    () => (data?.pmeRecords || []).filter((p) => ["due_soon", "overdue"].includes(p.status)),
    [data]
  );

  const overdue = dueRecords.filter((p) => p.status === "overdue");
  const dueSoon = dueRecords.filter((p) => p.status === "due_soon");

  return (
    <div className="space-y-4">
      <DemoBanner />
      <Breadcrumbs items={getBreadcrumbs("pme-due")} theme={theme} />
      <PageHeader title="Due / Overdue Medical Dashboard" subtitle="Employees requiring PME action" onRefresh={refresh} theme={theme} />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        <KpiTile label="Overdue" value={overdue.length} tone="border-red-100" />
        <KpiTile label="Due Soon (30d)" value={dueSoon.length} tone="border-amber-100" />
        <KpiTile label="Total Action Required" value={dueRecords.length} tone="border-orange-100" />
      </div>

      {dueRecords.length === 0 ? (
        <EmptyState icon={AlertTriangle} title="All PME records compliant" description="No employees are due or overdue for medical examination." />
      ) : (
        <EnterpriseDataTable
          theme={theme}
          columns={[
            { key: "employee_id", label: "Employee", render: (r) => <LinkedEmployeeChip employee={getEmployee(r.employee_id)} /> },
            { key: "next_due_date", label: "Due Date", sortable: true },
            { key: "last_pme_date", label: "Last PME" },
            { key: "fitness_status", label: "Fitness" },
            { key: "status", label: "Status", render: (r) => <OpsStatusBadge status={r.status} /> },
            {
              key: "action",
              label: "Action",
              sortable: false,
              render: (r) => (
                <PrimaryButton onClick={(e) => { e.stopPropagation(); navigateTo("medical-record", { id: r.employee_id, name: getEmployee(r.employee_id)?.name }); }}>
                  Schedule
                </PrimaryButton>
              ),
            },
          ]}
          rows={dueRecords.sort((a, b) => a.next_due_date.localeCompare(b.next_due_date))}
          enableBulk
        />
      )}
    </div>
  );
}
