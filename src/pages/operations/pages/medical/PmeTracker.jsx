import React, { useMemo, useState } from "react";
import { useOperations } from "../../contexts/OperationsContext";
import { getBreadcrumbs } from "../../navConfig";
import { PME_STATUSES } from "../../data/mockOperationsData";
import {
  Breadcrumbs,
  DemoBanner,
  EnterpriseDataTable,
  FilterBar,
  LinkedEmployeeChip,
  OpsStatusBadge,
  PageHeader,
  TinyInput,
  TinySelect,
} from "../../components/OperationsUi";

export default function PmeTracker() {
  const { data, refresh, theme, getEmployee, navigateTo } = useOperations();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const rows = useMemo(() => {
    let list = data?.pmeRecords || [];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => {
        const emp = getEmployee(p.employee_id);
        return emp?.name?.toLowerCase().includes(q) || emp?.employeeCode?.includes(q);
      });
    }
    if (statusFilter) list = list.filter((p) => p.status === statusFilter);
    return list;
  }, [data, search, statusFilter, getEmployee]);

  const getCenter = (id) => data?.medicalCenters?.find((c) => c.id === id);

  return (
    <div className="space-y-3">
      <DemoBanner />
      <Breadcrumbs items={getBreadcrumbs("pme-tracker")} theme={theme} />
      <PageHeader title="Employee PME Tracker" subtitle="Periodic Medical Examination compliance linked to People Master" onRefresh={refresh} theme={theme} />

      <FilterBar>
        <label className="text-[11px] text-gray-600 flex-1">
          Search employee
          <TinyInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or code…" className="block mt-0.5 max-w-xs w-full" />
        </label>
        <label className="text-[11px] text-gray-600">
          Status
          <TinySelect value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="block mt-0.5 w-36">
            <option value="">All</option>
            {PME_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
          </TinySelect>
        </label>
      </FilterBar>

      <EnterpriseDataTable
        theme={theme}
        columns={[
          { key: "employee_id", label: "Employee", render: (r) => <LinkedEmployeeChip employee={getEmployee(r.employee_id)} /> },
          { key: "last_pme_date", label: "Last PME" },
          { key: "next_due_date", label: "Next Due", sortable: true },
          { key: "fitness_status", label: "Fitness" },
          { key: "blood_group", label: "Blood Group" },
          { key: "center", label: "Medical Center", render: (r) => getCenter(r.medical_center_id)?.name || "—" },
          { key: "status", label: "Status", render: (r) => <OpsStatusBadge status={r.status} /> },
          {
            key: "actions",
            label: "Details",
            sortable: false,
            render: (r) => (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); navigateTo("medical-record", { id: r.employee_id, name: getEmployee(r.employee_id)?.name }); }}
                className="text-[11px] text-[#1F3A8A] font-medium"
              >
                View record
              </button>
            ),
          },
        ]}
        rows={rows}
        onRowClick={(r) => navigateTo("medical-record", { id: r.employee_id, name: getEmployee(r.employee_id)?.name })}
        enableBulk
      />
    </div>
  );
}
