import React, { useEffect, useMemo, useState } from "react";
import { Edit3, Plus, RotateCcw, Trash2 } from "lucide-react";
import {
  Modal,
  PageTaskHeader,
  SectionCard,
  TinySelect,
} from "../../adminOperations/components/AdminUi";
import { pushToast } from "../../../lib/toast";
import { CALLING_DROPDOWN_MASTERS, CALLING_MASTER_DROPDOWNS_EVENT, isLinkedDropdownMaster } from "./callingMasterConfig";
import {
  addDropdownOption,
  deleteDropdownOption,
  loadCallingMasterDropdownCatalog,
  resetAllDropdownMasters,
  resetDropdownMaster,
  updateDropdownOption,
} from "./callingMasterStorage";

export default function CallingMasterDropdownPage() {
  const [catalog, setCatalog] = useState({});
  const [loading, setLoading] = useState(true);
  const [activeKey, setActiveKey] = useState(CALLING_DROPDOWN_MASTERS[0]?.key || "");
  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const [pendingDelete, setPendingDelete] = useState(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      const next = await loadCallingMasterDropdownCatalog();
      setCatalog(next);
    } catch (err) {
      setCatalog({});
      pushToast("Unable to load dropdowns", err.message || "Please try again.", "warning");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener(CALLING_MASTER_DROPDOWNS_EVENT, onChange);
    return () => window.removeEventListener(CALLING_MASTER_DROPDOWNS_EVENT, onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeMaster = useMemo(
    () => CALLING_DROPDOWN_MASTERS.find((item) => item.key === activeKey) || CALLING_DROPDOWN_MASTERS[0],
    [activeKey]
  );

  const options = catalog[activeKey] || [];
  const linkedMaster = isLinkedDropdownMaster(activeKey);

  const openCreate = () => {
    if (linkedMaster) return;
    setEditing(null);
    setLabel("");
    setError("");
    setFormOpen(true);
  };

  const openEdit = (option) => {
    setEditing(option);
    setLabel(option.label);
    setError("");
    setFormOpen(true);
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      if (editing) await updateDropdownOption(activeKey, editing.id, label);
      else await addDropdownOption(activeKey, label);
      await refresh();
      setFormOpen(false);
      pushToast(editing ? "Option updated" : "Option added", `${activeMaster.label} refreshed in Calling Master.`, "success");
    } catch (err) {
      setError(err.message || "Unable to save option.");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      await deleteDropdownOption(activeKey, pendingDelete.id);
      await refresh();
      setDeleteOpen(false);
      pushToast("Option removed", `${pendingDelete.label} deleted from ${activeMaster.label}.`, "success");
      setPendingDelete(null);
    } catch (err) {
      pushToast("Delete failed", err.message || "Unable to delete option.", "warning");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageTaskHeader
        title="Dropdown Master"
        subtitle="Manage every select list used in Calling Master. Changes apply instantly to forms and filters."
      >
        <button
          type="button"
          onClick={openCreate}
          disabled={linkedMaster}
          className="erp-btn-primary rounded-control px-3.5 py-2 inline-flex items-center gap-2 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Add option
        </button>
        <button
          type="button"
          disabled={busy || linkedMaster}
          onClick={async () => {
            setBusy(true);
            try {
              await resetDropdownMaster(activeKey);
              await refresh();
              pushToast("List cleared", `${activeMaster.label} options cleared.`, "success");
            } catch (err) {
              pushToast("Clear failed", err.message || "Unable to clear list.", "warning");
            } finally {
              setBusy(false);
            }
          }}
          className="erp-btn-secondary rounded-control px-3.5 py-2 inline-flex items-center gap-2 disabled:opacity-50"
        >
          <RotateCcw className="h-4 w-4" />
          Clear this list
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await resetAllDropdownMasters();
              await refresh();
              pushToast("All lists cleared", "Manual dropdown options cleared.", "success");
            } catch (err) {
              pushToast("Clear failed", err.message || "Unable to clear lists.", "warning");
            } finally {
              setBusy(false);
            }
          }}
          className="erp-btn-secondary rounded-control px-3.5 py-2 inline-flex items-center gap-2 disabled:opacity-50"
        >
          Clear all
        </button>
      </PageTaskHeader>

      {loading ? (
        <div className="animate-pulse rounded-card border border-slate-200 bg-white p-6">
          <div className="h-8 w-48 rounded bg-slate-100" />
          <div className="mt-4 h-40 rounded bg-slate-100" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <SectionCard title="Dropdown lists">
            <div className="space-y-1">
              {CALLING_DROPDOWN_MASTERS.map((master) => {
                const count = (catalog[master.key] || []).length;
                const active = master.key === activeKey;
                return (
                  <button
                    key={master.key}
                    type="button"
                    onClick={() => setActiveKey(master.key)}
                    className={`w-full rounded-lg border px-3 py-2.5 text-left transition ${
                      active
                        ? "border-accent bg-blue-50 text-ink"
                        : "border-transparent hover:border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{master.label}</span>
                      <span className="text-[11px] text-slate-500">{count}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500 line-clamp-2">{master.description}</p>
                  </button>
                );
              })}
            </div>
          </SectionCard>

          <SectionCard
            title={activeMaster?.label || "Options"}
            right={
              <div className="hidden sm:block">
                <TinySelect
                  value={activeKey}
                  onChange={(event) => setActiveKey(event.target.value)}
                  className="rounded-lg border-slate-200 bg-white text-sm lg:hidden"
                >
                  {CALLING_DROPDOWN_MASTERS.map((master) => (
                    <option key={master.key} value={master.key}>
                      {master.label}
                    </option>
                  ))}
                </TinySelect>
              </div>
            }
          >
            <p className="mb-4 text-xs text-slate-500">{activeMaster?.description}</p>

            {linkedMaster ? (
              <div className="mb-4 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs text-teal-900">
                {activeKey === "callingBy"
                  ? "Calling By is synced live from Employee Master (Active employees in Human Resource and Human Resource-Safety)."
                  : "Site Suitable is synced live from public Sites (site_name)."}
                {" "}Add / edit / delete is disabled for this list.
              </div>
            ) : null}
            <div className="mb-3 sm:hidden">
              <TinySelect
                value={activeKey}
                onChange={(event) => setActiveKey(event.target.value)}
                className="w-full rounded-lg border-slate-200 bg-white text-sm"
              >
                {CALLING_DROPDOWN_MASTERS.map((master) => (
                  <option key={master.key} value={master.key}>
                    {master.label}
                  </option>
                ))}
              </TinySelect>
            </div>

            {options.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
                <h3 className="text-sm font-semibold text-slate-900">No options yet</h3>
                <p className="mt-1 text-xs text-slate-500">
                  {linkedMaster
                    ? "No matching records found in the linked master table."
                    : "Add the first option for this dropdown master."}
                </p>
                {!linkedMaster ? (
                  <button type="button" onClick={openCreate} className="erp-btn-primary mt-4 rounded-control px-4 py-2">
                    Add option
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-full table-fixed text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="w-14 px-3 py-2 text-left font-semibold">#</th>
                      <th className="px-3 py-2 text-left font-semibold">Option</th>
                      {!linkedMaster ? <th className="w-40 px-3 py-2 text-right font-semibold">Actions</th> : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {options.map((option, index) => (
                      <tr key={option.id} className="hover:bg-slate-50/80">
                        <td className="px-3 py-2.5 align-middle text-slate-500">{index + 1}</td>
                        <td className="max-w-0 px-3 py-2.5 align-middle font-medium text-slate-900">
                          <span className="block truncate" title={option.label}>
                            {option.label}
                          </span>
                        </td>
                        {!linkedMaster ? (
                          <td className="px-3 py-2.5 align-middle">
                            <div className="flex flex-nowrap justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => openEdit(option)}
                                className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2.5 text-xs font-medium text-slate-700 hover:bg-white"
                              >
                                <Edit3 className="h-3.5 w-3.5 shrink-0" />
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setPendingDelete(option);
                                  setDeleteOpen(true);
                                }}
                                className="inline-flex h-8 items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2.5 text-xs font-medium text-rose-700"
                              >
                                <Trash2 className="h-3.5 w-3.5 shrink-0" />
                                Delete
                              </button>
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>
      )}

      <Modal
        open={formOpen}
        title={editing ? `Edit ${activeMaster?.label}` : `Add ${activeMaster?.label}`}
        onClose={() => setFormOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setFormOpen(false)} className="erp-btn-secondary rounded-control px-4 py-2">
              Cancel
            </button>
            <button type="submit" form="dropdown-master-form" disabled={busy} className="erp-btn-primary rounded-control px-4 py-2 disabled:opacity-50">
              {editing ? "Save changes" : "Add option"}
            </button>
          </div>
        }
      >
        <form id="dropdown-master-form" onSubmit={handleSave} className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-700">Option label</span>
            <input
              value={label}
              onChange={(event) => {
                setLabel(event.target.value);
                setError("");
              }}
              className={`w-full rounded-lg border px-3 py-2.5 text-sm ${
                error ? "border-rose-300" : "border-slate-200"
              }`}
              placeholder={`Enter ${activeMaster?.label?.toLowerCase() || "option"}`}
              autoFocus
            />
            {error ? <span className="mt-1 block text-xs text-rose-600">{error}</span> : null}
          </label>
          <p className="text-xs text-slate-500">
            Calling Master forms and filters will pick up this value immediately after save.
          </p>
        </form>
      </Modal>

      <Modal
        open={deleteOpen}
        title="Delete option"
        onClose={() => setDeleteOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setDeleteOpen(false)} className="erp-btn-secondary rounded-control px-4 py-2">
              Cancel
            </button>
            <button type="button" disabled={busy} onClick={handleDelete} className="rounded-control bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50">
              Delete
            </button>
          </div>
        }
      >
        <p className="text-sm text-slate-600">
          Remove <span className="font-medium text-slate-900">{pendingDelete?.label}</span> from{" "}
          {activeMaster?.label}? Existing candidate records keep their saved value.
        </p>
      </Modal>
    </div>
  );
}
