import React, { useState } from "react";
import { ListTable } from "../../components/ListTable";
import { useFinance } from "./contexts/FinanceContext";
import {
  PageHeader, PrimaryButton, SectionCard, Modal, TinyInput, TinySelect,
  LoadingState, ErrorState, Badge,
} from "./components/FinanceUi";
import { upsertSite, deleteSite } from "../../services/financeApi";
import { slug } from "./lib/formatters";
import { inr } from "./lib/formatters";

const EMPTY = {
  name: "", code: "", service_type: "", work_order_no: "",
  contract_start: "", contract_end: "", status: "active",
};

export default function SitesMaster() {
  const { data, loading, error, refresh, permissions, siteRows } = useFinance();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = siteRows.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.service || "").toLowerCase().includes(search.toLowerCase()),
  );

  const openEdit = (row) => {
    setForm({
      id: row.id,
      code: row.code || "",
      name: row.name,
      service_type: row.service_type || row.service || "",
      work_order_no: row.work_order_no || row.wo || "",
      contract_start: row.contract_start || row.contractStart || "",
      contract_end: row.contract_end || row.contractEnd || "",
      status: row.status || "active",
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name?.trim()) return;
    setSaving(true);
    try {
      await upsertSite(form);
      setOpen(false);
      setForm(EMPTY);
      await refresh();
    } catch (e) {
      alert(e?.message || "Failed to save site");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row) => {
    if (!permissions.canEditMasters) return;
    if (!confirm(`Delete "${row.name}" and all related data?`)) return;
    try {
      await deleteSite(row.id);
      await refresh();
    } catch (e) {
      alert(e?.message || "Failed to delete");
    }
  };

  if (loading && !data) return <LoadingState />;
  if (error && !data) return <ErrorState message={error} onRetry={refresh} />;

  return (
    <div>
      <PageHeader
        title="Sites / Projects"
        subtitle="Master list of sites with contract periods and P&L structure"
        onRefresh={refresh}
        primaryAction={
          permissions.canEditMasters ? (
            <PrimaryButton onClick={() => { setForm(EMPTY); setOpen(true); }}>
              Add Site
            </PrimaryButton>
          ) : null
        }
      />

      <SectionCard
        title={`All Sites (${filtered.length})`}
        right={
          <input
            className="h-8 border border-gray-300 rounded px-2 text-xs"
            placeholder="Search sites…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        }
      >
        <ListTable
          emptyMessage="No sites yet. Add your first site to begin P&L tracking."
          columns={[
            { key: "name", label: "Site", render: (r) => <span className="font-semibold">{r.name}</span> },
            { key: "service", label: "Service", render: (r) => r.service || "—" },
            { key: "wo", label: "W.O.", render: (r) => r.wo || "—" },
            {
              key: "contract",
              label: "Contract",
              render: (r) =>
                r.contract_start
                  ? `${r.contract_start} – ${r.contract_end || "—"}`
                  : "—",
            },
            {
              key: "profit",
              label: "Latest P&L",
              className: "text-right",
              render: (r) =>
                r.hasData ? (
                  <span className={r.profit >= 0 ? "text-green-700" : "text-red-700"}>
                    {inr(r.profit)}
                  </span>
                ) : (
                  <span className="text-gray-400">—</span>
                ),
            },
            {
              key: "status",
              label: "Status",
              render: (r) => (
                <Badge tone={r.status === "active" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}>
                  {r.status}
                </Badge>
              ),
            },
            {
              key: "actions",
              label: "",
              render: (r) =>
                permissions.canEditMasters ? (
                  <span className="flex gap-1 justify-end">
                    <button type="button" className="text-xs text-blue-700" onClick={() => openEdit(r)}>Edit</button>
                    <button type="button" className="text-xs text-red-700" onClick={() => remove(r)}>Delete</button>
                  </span>
                ) : null,
            },
          ]}
          rows={filtered}
        />
      </SectionCard>

      {open && (
        <Modal open={open} title={form.id ? "Edit Site" : "Add Site"} onClose={() => setOpen(false)}>
          <div className="space-y-3">
            <label className="block text-xs text-gray-600">
              Site name *
              <TinyInput className="w-full mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="block text-xs text-gray-600">
              Service type
              <TinyInput className="w-full mt-1" value={form.service_type} onChange={(e) => setForm({ ...form, service_type: e.target.value })} placeholder="Fire Fighting / Security…" />
            </label>
            <label className="block text-xs text-gray-600">
              Work order no.
              <TinyInput className="w-full mt-1" value={form.work_order_no} onChange={(e) => setForm({ ...form, work_order_no: e.target.value })} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs text-gray-600">
                Contract start
                <TinyInput type="date" className="w-full mt-1" value={form.contract_start} onChange={(e) => setForm({ ...form, contract_start: e.target.value })} />
              </label>
              <label className="block text-xs text-gray-600">
                Contract end
                <TinyInput type="date" className="w-full mt-1" value={form.contract_end} onChange={(e) => setForm({ ...form, contract_end: e.target.value })} />
              </label>
            </div>
            <label className="block text-xs text-gray-600">
              Status
              <TinySelect className="w-full mt-1" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="closed">Closed</option>
              </TinySelect>
            </label>
            {!form.id && (
              <p className="text-xs text-gray-500">Code: {slug(form.name || "site")}</p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="h-8 px-3 text-xs border rounded" onClick={() => setOpen(false)}>Cancel</button>
              <button type="button" className="h-8 px-3 text-xs bg-[#1F6F4E] text-white rounded" disabled={saving} onClick={save}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
