import React, { useMemo } from "react";
import { useParams } from "react-router-dom";
import { useOperations } from "../../contexts/OperationsContext";
import { getBreadcrumbs } from "../../navConfig";
import {
  Breadcrumbs,
  DemoBanner,
  LinkedEmployeeChip,
  OpsStatusBadge,
  PageHeader,
  PrimaryButton,
  SectionCard,
  Timeline,
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

export default function MedicalRecordDetails() {
  const { id } = useParams();
  const { data, refresh, theme, getEmployee, navigateTo } = useOperations();
  const t = useThemeClasses(theme);

  const record = useMemo(
    () => (data?.pmeRecords || []).find((p) => String(p.employee_id) === String(id)),
    [data, id]
  );

  const employee = getEmployee(id);
  const center = data?.medicalCenters?.find((c) => c.id === record?.medical_center_id);
  const history = (data?.pmeHistory || []).filter((h) => String(h.employee_id) === String(id));

  const crumbs = getBreadcrumbs("medical-record", { name: employee?.name });

  if (!record || !employee) {
    return (
      <div>
        <Breadcrumbs items={crumbs} theme={theme} />
        <p className="text-sm text-gray-500 py-8 text-center">Medical record not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DemoBanner />
      <Breadcrumbs items={crumbs} theme={theme} />
      <PageHeader
        title={`Medical Record — ${employee.name}`}
        subtitle={`Employee ${employee.employeeCode} · People Master linked`}
        onRefresh={refresh}
        primaryAction={<PrimaryButton onClick={() => navigateTo("medical-centers")}>Select Medical Center</PrimaryButton>}
        theme={theme}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SectionCard title="Employee profile" className={`lg:col-span-1 ${t.card}`}>
          <div className="space-y-3">
            <LinkedEmployeeChip employee={employee} />
            <DetailField label="Location" value={employee.location} />
            <DetailField label="Phone" value={employee.phone} />
            <DetailField label="Date of Joining" value={employee.dateOfJoining} />
            <DetailField label="Blood Group" value={record.blood_group} />
          </div>
        </SectionCard>

        <SectionCard title="Current PME status" className={`lg:col-span-2 ${t.card}`}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <DetailField label="Last PME" value={record.last_pme_date} />
            <DetailField label="Next Due" value={record.next_due_date} />
            <DetailField label="Fitness" value={record.fitness_status} />
            <div>
              <p className="text-[10px] font-medium text-gray-500 uppercase">Status</p>
              <div className="mt-1"><OpsStatusBadge status={record.status} /></div>
            </div>
            <DetailField label="Assigned Center" value={center?.name} />
            <DetailField label="Center City" value={center?.city} />
            <DetailField label="Accreditation" value={center?.accreditation} />
            <DetailField label="Contact" value={center?.contact} />
          </div>
        </SectionCard>
      </div>

      <SectionCard title="PME history timeline" className={t.card}>
        {history.length ? (
          <Timeline
            items={history.map((h) => ({
              title: `${h.date} — ${h.result}`,
              meta: `${h.center} · Valid until ${h.validity}`,
            }))}
          />
        ) : (
          <p className="text-xs text-gray-500">No historical PME records on file.</p>
        )}
      </SectionCard>
    </div>
  );
}
