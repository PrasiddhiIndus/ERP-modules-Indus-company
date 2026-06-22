import React, { useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { useOperations } from "../../contexts/OperationsContext";
import { getBreadcrumbs } from "../../navConfig";
import { formatCurrency } from "../../data/mockOperationsData";
import {
  Breadcrumbs,
  DemoBanner,
  EnterpriseDataTable,
  LinkedEmployeeChip,
  LinkedSiteChip,
  Modal,
  OpsStatusBadge,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  SectionCard,
  useThemeClasses,
} from "../../components/OperationsUi";

export default function AdvanceApproval() {
  const { data, refresh, theme, getSite, getEmployee } = useOperations();
  const t = useThemeClasses(theme);
  const [selected, setSelected] = useState(null);
  const [remarks, setRemarks] = useState("");

  const pending = useMemo(
    () => (data?.advances || []).filter((a) => a.status === "pending_approval"),
    [data]
  );

  const handleAction = (action) => {
    window.alert(`Advance ${selected?.request_no} ${action} (UI preview)${remarks ? `: ${remarks}` : ""}`);
    setSelected(null);
    setRemarks("");
  };

  return (
    <div className="space-y-4">
      <DemoBanner />
      <Breadcrumbs items={getBreadcrumbs("advance-approval")} theme={theme} />
      <PageHeader
        title="Advance Approval Workflow"
        subtitle="Review and approve pending advance requests"
        onRefresh={refresh}
        theme={theme}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <SectionCard title="Pending" className={t.card}>
          <p className="text-2xl font-bold text-amber-600">{pending.length}</p>
        </SectionCard>
        <SectionCard title="Approved (month)" className={t.card}>
          <p className="text-2xl font-bold text-emerald-600">
            {(data?.advances || []).filter((a) => a.status === "approved").length}
          </p>
        </SectionCard>
        <SectionCard title="Rejected (month)" className={t.card}>
          <p className="text-2xl font-bold text-red-600">
            {(data?.advances || []).filter((a) => a.status === "rejected").length}
          </p>
        </SectionCard>
      </div>

      <EnterpriseDataTable
        theme={theme}
        columns={[
          { key: "request_no", label: "Request No." },
          { key: "site_id", label: "Site", render: (r) => <LinkedSiteChip site={getSite(r.site_id)} /> },
          { key: "employee_id", label: "Employee", render: (r) => <LinkedEmployeeChip employee={getEmployee(r.employee_id)} /> },
          { key: "purpose", label: "Purpose" },
          { key: "amount", label: "Amount", render: (r) => formatCurrency(r.amount) },
          { key: "requested_date", label: "Date" },
          {
            key: "actions",
            label: "Actions",
            sortable: false,
            render: (r) => (
              <button type="button" onClick={(e) => { e.stopPropagation(); setSelected(r); }} className="text-[11px] text-[#1F3A8A] font-medium">
                Review
              </button>
            ),
          },
        ]}
        rows={pending}
        onRowClick={setSelected}
        emptyTitle="No pending approvals"
        emptyDescription="All advance requests have been processed."
      />

      <Modal
        open={!!selected}
        title={selected ? `Approve ${selected.request_no}` : ""}
        onClose={() => setSelected(null)}
        widthClass="max-w-md"
        footer={
          selected && (
            <div className="flex justify-end gap-2">
              <SecondaryButton onClick={() => handleAction("rejected")}>
                <X className="w-3.5 h-3.5 inline mr-1" /> Reject
              </SecondaryButton>
              <PrimaryButton onClick={() => handleAction("approved")}>
                <Check className="w-3.5 h-3.5 inline mr-1" /> Approve
              </PrimaryButton>
            </div>
          )
        }
      >
        {selected && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><p className="text-[10px] text-gray-500">Site</p><LinkedSiteChip site={getSite(selected.site_id)} /></div>
              <div><p className="text-[10px] text-gray-500">Employee</p><LinkedEmployeeChip employee={getEmployee(selected.employee_id)} /></div>
              <div><p className="text-[10px] text-gray-500">Amount</p><p className="font-bold">{formatCurrency(selected.amount)}</p></div>
              <div><p className="text-[10px] text-gray-500">Status</p><OpsStatusBadge status={selected.status} /></div>
            </div>
            <p className="text-sm"><span className="text-gray-500">Purpose:</span> {selected.purpose}</p>
            <label className="block text-[11px] text-gray-600">
              Approval remarks
              <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm" rows={2} placeholder="Optional comments…" />
            </label>
          </div>
        )}
      </Modal>
    </div>
  );
}
