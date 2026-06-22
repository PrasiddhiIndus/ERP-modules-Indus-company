import React, { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useOperations } from "../../contexts/OperationsContext";
import { getBreadcrumbs } from "../../navConfig";
import { ADVANCE_STATUSES, formatCurrency } from "../../data/mockOperationsData";
import {
  Breadcrumbs,
  DemoBanner,
  EnterpriseDataTable,
  FilterBar,
  FormField,
  FormInput,
  FormSelect,
  FormTextarea,
  LinkedEmployeeChip,
  LinkedSiteChip,
  Modal,
  OpsStatusBadge,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  TinyInput,
  TinySelect,
} from "../../components/OperationsUi";

const emptyForm = { site_id: "", employee_id: "", purpose: "", amount: "", requested_date: "" };

export default function AdvanceList() {
  const { data, refresh, theme, getSite, getEmployee } = useOperations();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});

  const rows = useMemo(() => {
    let list = data?.advances || [];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (a) =>
          a.request_no.toLowerCase().includes(q) ||
          a.purpose.toLowerCase().includes(q) ||
          getEmployee(a.employee_id)?.name?.toLowerCase().includes(q)
      );
    }
    if (statusFilter) list = list.filter((a) => a.status === statusFilter);
    return list;
  }, [data, search, statusFilter, getEmployee]);

  const validate = () => {
    const next = {};
    if (!form.site_id) next.site_id = "Site required";
    if (!form.employee_id) next.employee_id = "Employee required";
    if (!form.purpose.trim()) next.purpose = "Purpose required";
    if (!form.amount || Number(form.amount) <= 0) next.amount = "Valid amount required";
    if (!form.requested_date) next.requested_date = "Date required";
    setErrors(next);
    return !Object.keys(next).length;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;
    window.alert("Advance request submitted (UI preview)");
    setFormOpen(false);
    setForm(emptyForm);
  };

  const columns = [
    { key: "request_no", label: "Request No." },
    { key: "site_id", label: "Site", render: (r) => <LinkedSiteChip site={getSite(r.site_id)} /> },
    { key: "employee_id", label: "Employee", render: (r) => <LinkedEmployeeChip employee={getEmployee(r.employee_id)} /> },
    { key: "purpose", label: "Purpose" },
    { key: "amount", label: "Amount", render: (r) => formatCurrency(r.amount), sortValue: (r) => r.amount },
    { key: "balance", label: "Balance", render: (r) => formatCurrency(r.balance) },
    { key: "requested_date", label: "Requested" },
    { key: "status", label: "Status", render: (r) => <OpsStatusBadge status={r.status} /> },
  ];

  return (
    <div className="space-y-3">
      <DemoBanner />
      <Breadcrumbs items={getBreadcrumbs("advances")} theme={theme} />
      <PageHeader
        title="Site Advance Requests"
        subtitle="Request and track site-level cash advances"
        onRefresh={refresh}
        onExport={() => window.alert("Export advances")}
        primaryAction={<PrimaryButton icon={Plus} onClick={() => setFormOpen(true)}>New Request</PrimaryButton>}
        theme={theme}
      />

      <FilterBar>
        <label className="text-[11px] text-gray-600 flex-1">
          Search
          <TinyInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Request no., purpose, employee…" className="block mt-0.5 max-w-xs w-full" />
        </label>
        <label className="text-[11px] text-gray-600">
          Status
          <TinySelect value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="block mt-0.5 w-40">
            <option value="">All</option>
            {ADVANCE_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
          </TinySelect>
        </label>
      </FilterBar>

      <EnterpriseDataTable theme={theme} columns={columns} rows={rows} enableBulk onExport={() => window.alert("Exported")} />

      <Modal
        open={formOpen}
        title="Create Advance Request"
        onClose={() => setFormOpen(false)}
        widthClass="max-w-lg"
        footer={
          <div className="flex justify-end gap-2">
            <SecondaryButton onClick={() => setFormOpen(false)}>Cancel</SecondaryButton>
            <PrimaryButton onClick={handleSubmit}>Submit Request</PrimaryButton>
          </div>
        }
      >
        <form className="grid grid-cols-1 sm:grid-cols-2 gap-3" onSubmit={handleSubmit}>
          <FormField label="Site" required error={errors.site_id}>
            <FormSelect value={form.site_id} error={errors.site_id} onChange={(e) => setForm({ ...form, site_id: e.target.value })}>
              <option value="">Select site</option>
              {(data?.sites || []).filter((s) => s.status === "Active").map((s) => (
                <option key={s.id} value={s.id}>{s.site_code} — {s.site_name}</option>
              ))}
            </FormSelect>
          </FormField>
          <FormField label="Employee" required error={errors.employee_id}>
            <FormSelect value={form.employee_id} error={errors.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
              <option value="">Select employee</option>
              {(data?.employees || []).map((e) => (
                <option key={e.id} value={e.id}>{e.employeeCode} — {e.name}</option>
              ))}
            </FormSelect>
          </FormField>
          <FormField label="Amount (₹)" required error={errors.amount}>
            <FormInput type="number" value={form.amount} error={errors.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </FormField>
          <FormField label="Request Date" required error={errors.requested_date}>
            <FormInput type="date" value={form.requested_date} error={errors.requested_date} onChange={(e) => setForm({ ...form, requested_date: e.target.value })} />
          </FormField>
          <FormField label="Purpose" required error={errors.purpose} className="sm:col-span-2">
            <FormTextarea value={form.purpose} error={errors.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
          </FormField>
        </form>
      </Modal>
    </div>
  );
}
