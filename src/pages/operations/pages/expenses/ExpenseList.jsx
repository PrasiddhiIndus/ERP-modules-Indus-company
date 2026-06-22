import React, { useMemo, useState } from "react";
import { Eye, Plus } from "lucide-react";
import { useOperations } from "../../contexts/OperationsContext";
import { getBreadcrumbs } from "../../navConfig";
import { EXPENSE_CATEGORIES, EXPENSE_STATUSES, formatCurrency } from "../../data/mockOperationsData";
import {
  Breadcrumbs,
  DemoBanner,
  Drawer,
  EnterpriseDataTable,
  FilterBar,
  FormField,
  FormInput,
  FormSelect,
  FormTextarea,
  LinkedSiteChip,
  Modal,
  OpsStatusBadge,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  TinyInput,
  TinySelect,
} from "../../components/OperationsUi";

const emptyForm = {
  site_id: "",
  category: "",
  head: "",
  amount: "",
  expense_date: "",
  payment_mode: "Bank Transfer",
  remarks: "",
};

export default function ExpenseList() {
  const { data, refresh, theme, getSite, filters, setFilters } = useOperations();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(filters.status || "");
  const [siteFilter, setSiteFilter] = useState(filters.siteId || "");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [drawerRow, setDrawerRow] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});

  const rows = useMemo(() => {
    let list = data?.expenses || [];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          e.expense_no.toLowerCase().includes(q) ||
          e.head.toLowerCase().includes(q) ||
          getSite(e.site_id)?.site_name?.toLowerCase().includes(q)
      );
    }
    if (statusFilter) list = list.filter((e) => e.status === statusFilter);
    if (siteFilter) list = list.filter((e) => String(e.site_id) === siteFilter);
    if (categoryFilter) list = list.filter((e) => e.category === categoryFilter);
    return list;
  }, [data, search, statusFilter, siteFilter, categoryFilter, getSite]);

  const openCreate = () => {
    setEditRow(null);
    setForm(emptyForm);
    setErrors({});
    setFormOpen(true);
  };

  const openEdit = (row) => {
    setEditRow(row);
    setForm({
      site_id: row.site_id,
      category: row.category,
      head: row.head,
      amount: String(row.amount),
      expense_date: row.expense_date,
      payment_mode: row.payment_mode,
      remarks: row.remarks || "",
    });
    setErrors({});
    setFormOpen(true);
  };

  const validate = () => {
    const next = {};
    if (!form.site_id) next.site_id = "Site is required";
    if (!form.category) next.category = "Category is required";
    if (!form.head.trim()) next.head = "Expense head is required";
    if (!form.amount || Number(form.amount) <= 0) next.amount = "Valid amount required";
    if (!form.expense_date) next.expense_date = "Date is required";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = (e) => {
    e.preventDefault();
    if (!validate()) return;
    window.alert(editRow ? "Expense updated (UI preview)" : "Expense created (UI preview)");
    setFormOpen(false);
  };

  const columns = [
    { key: "expense_no", label: "Expense No.", sortable: true },
    {
      key: "site_id",
      label: "Site",
      render: (r) => <LinkedSiteChip site={getSite(r.site_id)} />,
    },
    { key: "category", label: "Category" },
    { key: "head", label: "Head" },
    { key: "amount", label: "Amount", sortable: true, sortValue: (r) => r.amount, render: (r) => formatCurrency(r.amount) },
    { key: "expense_date", label: "Date", sortable: true },
    { key: "status", label: "Status", render: (r) => <OpsStatusBadge status={r.status} /> },
    {
      key: "actions",
      label: "Actions",
      sortable: false,
      render: (r) => (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          <button type="button" onClick={() => setDrawerRow(r)} className="p-1 text-[#1F3A8A] hover:bg-blue-50 rounded" title="View">
            <Eye className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={() => openEdit(r)} className="text-[11px] text-gray-600 hover:text-[#1F3A8A] px-1">
            Edit
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <DemoBanner />
      <Breadcrumbs items={getBreadcrumbs("expenses")} theme={theme} />
      <PageHeader
        title="Site Expense Management"
        subtitle="Track and approve site-level operational expenses"
        onRefresh={refresh}
        onExport={() => window.alert("Export expenses CSV")}
        primaryAction={<PrimaryButton icon={Plus} onClick={openCreate}>New Expense</PrimaryButton>}
        theme={theme}
      />

      <FilterBar>
        <label className="text-[11px] text-gray-600 flex-1 min-w-[140px]">
          Search
          <TinyInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Expense no., head, site…" className="block mt-0.5 w-full max-w-xs" />
        </label>
        <label className="text-[11px] text-gray-600">
          Site
          <TinySelect value={siteFilter} onChange={(e) => { setSiteFilter(e.target.value); setFilters({ siteId: e.target.value }); }} className="block mt-0.5 w-44">
            <option value="">All sites</option>
            {(data?.sites || []).map((s) => (
              <option key={s.id} value={s.id}>{s.site_code} — {s.site_name}</option>
            ))}
          </TinySelect>
        </label>
        <label className="text-[11px] text-gray-600">
          Category
          <TinySelect value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="block mt-0.5 w-36">
            <option value="">All</option>
            {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </TinySelect>
        </label>
        <label className="text-[11px] text-gray-600">
          Status
          <TinySelect value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setFilters({ status: e.target.value }); }} className="block mt-0.5 w-32">
            <option value="">All</option>
            {EXPENSE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </TinySelect>
        </label>
      </FilterBar>

      <EnterpriseDataTable
        theme={theme}
        columns={columns}
        rows={rows}
        enableBulk
        onRowClick={setDrawerRow}
        onExport={() => window.alert("Exported filtered expenses")}
        emptyTitle="No expenses found"
        emptyDescription="Create a new expense or adjust filters."
      />

      <Drawer open={!!drawerRow} title={drawerRow ? `Expense ${drawerRow.expense_no}` : ""} onClose={() => setDrawerRow(null)} widthClass="max-w-xl">
        {drawerRow && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-[10px] text-gray-500 uppercase">Site</p><p>{getSite(drawerRow.site_id)?.site_name}</p></div>
              <div><p className="text-[10px] text-gray-500 uppercase">Amount</p><p className="font-semibold">{formatCurrency(drawerRow.amount)}</p></div>
              <div><p className="text-[10px] text-gray-500 uppercase">Category</p><p>{drawerRow.category}</p></div>
              <div><p className="text-[10px] text-gray-500 uppercase">Head</p><p>{drawerRow.head}</p></div>
              <div><p className="text-[10px] text-gray-500 uppercase">Date</p><p>{drawerRow.expense_date}</p></div>
              <div><p className="text-[10px] text-gray-500 uppercase">Status</p><OpsStatusBadge status={drawerRow.status} /></div>
              <div><p className="text-[10px] text-gray-500 uppercase">Payment Mode</p><p>{drawerRow.payment_mode}</p></div>
            </div>
            {drawerRow.remarks && (
              <div><p className="text-[10px] text-gray-500 uppercase">Remarks</p><p className="text-sm">{drawerRow.remarks}</p></div>
            )}
            <SecondaryButton onClick={() => openEdit(drawerRow)}>Edit expense</SecondaryButton>
          </div>
        )}
      </Drawer>

      <Modal
        open={formOpen}
        title={editRow ? "Edit Expense" : "Create Expense"}
        onClose={() => setFormOpen(false)}
        widthClass="max-w-lg"
        footer={
          <div className="flex justify-end gap-2">
            <SecondaryButton onClick={() => setFormOpen(false)}>Cancel</SecondaryButton>
            <PrimaryButton type="submit" onClick={handleSave}>{editRow ? "Update" : "Submit"}</PrimaryButton>
          </div>
        }
      >
        <form className="grid grid-cols-1 sm:grid-cols-2 gap-3" onSubmit={handleSave}>
          <FormField label="Site" required error={errors.site_id}>
            <FormSelect value={form.site_id} error={errors.site_id} onChange={(e) => setForm({ ...form, site_id: e.target.value })}>
              <option value="">Select site</option>
              {(data?.sites || []).filter((s) => s.status === "Active").map((s) => (
                <option key={s.id} value={s.id}>{s.site_code} — {s.site_name}</option>
              ))}
            </FormSelect>
          </FormField>
          <FormField label="Category" required error={errors.category}>
            <FormSelect value={form.category} error={errors.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option value="">Select</option>
              {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </FormSelect>
          </FormField>
          <FormField label="Expense Head" required error={errors.head} className="sm:col-span-2">
            <FormInput value={form.head} error={errors.head} onChange={(e) => setForm({ ...form, head: e.target.value })} placeholder="e.g. Electricity bill" />
          </FormField>
          <FormField label="Amount (₹)" required error={errors.amount}>
            <FormInput type="number" value={form.amount} error={errors.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </FormField>
          <FormField label="Expense Date" required error={errors.expense_date}>
            <FormInput type="date" value={form.expense_date} error={errors.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
          </FormField>
          <FormField label="Payment Mode">
            <FormSelect value={form.payment_mode} onChange={(e) => setForm({ ...form, payment_mode: e.target.value })}>
              {["Bank Transfer", "Cash", "UPI", "Cheque", "Credit Card", "Fuel Card"].map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </FormSelect>
          </FormField>
          <FormField label="Remarks" className="sm:col-span-2">
            <FormTextarea value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} rows={2} />
          </FormField>
        </form>
      </Modal>
    </div>
  );
}
