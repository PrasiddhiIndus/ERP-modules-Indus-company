import React, { useEffect, useMemo, useState } from "react";
import { Layers, Pencil, Plus, Trash2 } from "lucide-react";
import {
  EmptyState,
  FormField,
  InlineAlert,
  LoadingBlock,
  Modal,
  PrimaryButton,
  SecondaryButton,
} from "../../../components/erpUi";
import toast from "../../../lib/toast";
import { alertDialog, confirmDialog } from "../../../lib/dialog";
import { usePettyCashAccess } from "./pettyCashAccess";
import {
  createOverheadCategory,
  deleteOverheadCategory,
  formatInr,
  previewNextOverheadCode,
  updateOverheadCategory,
  usePettyCashMasters,
} from "./pettyCashApi";
import { IconButton, PC_BTN, PC_INPUT, PC_INPUT_ERROR, Panel, SearchInput, StatTile } from "./pettyCashUi";

const norm = (s) => String(s || "").toLowerCase().trim();
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function CountBadge({ count, active, title }) {
  return (
    <span
      className={`inline-flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full border px-1.5 text-[11px] font-semibold tabular-nums ${
        active ? "border-accent bg-accent text-white" : "border-border bg-surface-sunken text-ink-secondary"
      }`}
      title={title}
    >
      {count}
    </span>
  );
}

export default function OverheadExpenseMasterPage() {
  const { canManageMasters } = usePettyCashAccess();
  const { overheads, usage, loading, loaded, error } = usePettyCashMasters();

  const [selectedId, setSelectedId] = useState(null);
  const [ohSearch, setOhSearch] = useState("");
  const [ohModal, setOhModal] = useState(null);

  const usageFor = (id) => usage[id] || { vouchers: 0, spentThisMonth: 0 };

  useEffect(() => {
    if (!overheads.length) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }
    if (!overheads.some((o) => o.id === selectedId)) setSelectedId(overheads[0].id);
  }, [overheads, selectedId]);

  const selected = overheads.find((o) => o.id === selectedId) || null;

  const filteredOverheads = useMemo(() => {
    const q = norm(ohSearch);
    if (!q) return overheads;
    return overheads.filter((o) => norm(o.name).includes(q) || norm(o.code).includes(q));
  }, [overheads, ohSearch]);

  const totalVouchers = useMemo(
    () => overheads.reduce((sum, o) => sum + (usageFor(o.id).vouchers || 0), 0),
    [overheads, usage]
  );

  const openAddOverhead = () => setOhModal({ name: "" });
  const openEditOverhead = (o) => setOhModal({ id: o.id, name: o.name, code: o.code });

  const handleDeleteOverhead = async (o) => {
    const vouchers = usageFor(o.id).vouchers;
    if (vouchers > 0) {
      await alertDialog({
        title: "Cannot delete overhead category",
        message: `"${o.name}" is used on ${plural(vouchers, "voucher", "vouchers")}, so it cannot be deleted.`,
      });
      return;
    }
    const ok = await confirmDialog({
      title: "Delete overhead category?",
      message: `"${o.name}" (${o.code}) will be removed permanently.`,
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteOverheadCategory(o.id);
      toast.success("Overhead category deleted", o.name);
    } catch (e) {
      toast.error("Could not delete overhead category", e.message);
    }
  };

  if (!loaded && loading) return <LoadingBlock rows={6} />;

  return (
    <div className="space-y-5">
      {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatTile icon={Layers} label="Overhead categories" value={overheads.length} hint="Groups for daily expenses" />
        <StatTile icon={Layers} label="Linked vouchers" value={totalVouchers} hint="Across all overheads" />
      </div>

      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-[minmax(240px,300px)_minmax(0,1fr)]">
        <Panel
          title="Overhead categories"
          subtitle="Select one to review usage"
          right={
            canManageMasters ? (
              <PrimaryButton icon={Plus} onClick={openAddOverhead} className={PC_BTN}>
                Add Overhead
              </PrimaryButton>
            ) : null
          }
          className="md:sticky md:top-4"
          bodyClassName="!p-0"
        >
          <div className="border-b border-divider px-3 py-2.5">
            <SearchInput value={ohSearch} onChange={setOhSearch} placeholder="Search overhead" />
          </div>
          <div className="max-h-[420px] space-y-1 overflow-y-auto overscroll-contain p-2.5 md:max-h-[calc(100vh-280px)] md:min-h-[280px]">
            {!overheads.length ? (
              <EmptyState
                icon={Layers}
                title="No overhead categories yet"
                message="Overheads group petty cash expenses, e.g. Office Administration or Travel."
                action={
                  canManageMasters ? (
                    <PrimaryButton icon={Plus} onClick={openAddOverhead} className={PC_BTN}>
                      Add Overhead Category
                    </PrimaryButton>
                  ) : null
                }
              />
            ) : !filteredOverheads.length ? (
              <p className="py-8 text-center text-[13px] text-ink-muted">No overhead categories match your search.</p>
            ) : (
              filteredOverheads.map((o) => {
                const u = usageFor(o.id);
                const active = o.id === selectedId;
                return (
                  <div
                    key={o.id}
                    role="button"
                    tabIndex={0}
                    aria-pressed={active}
                    onClick={() => setSelectedId(o.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedId(o.id);
                      }
                    }}
                    className={`group relative cursor-pointer rounded-lg border px-2.5 py-2 outline-none transition-colors focus-visible:shadow-focus ${
                      active
                        ? "border-accent bg-accent-soft/50 shadow-sm"
                        : "border-border bg-surface hover:border-accent-border hover:bg-surface-sunken/60"
                    }`}
                  >
                    {active ? <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-r bg-accent" aria-hidden /> : null}
                    <div className="flex items-center gap-1.5">
                      <div className="flex min-w-0 flex-1 items-center gap-1.5">
                        <span className="type-truncate text-[13px] font-semibold leading-tight text-ink-strong" title={o.name}>
                          {o.name}
                        </span>
                        <CountBadge
                          count={u.vouchers}
                          active={active}
                          title={plural(u.vouchers, "voucher", "vouchers")}
                        />
                      </div>
                      {canManageMasters ? (
                        <div className="-mr-0.5 flex shrink-0 items-center">
                          <IconButton title={`Edit ${o.name}`} onClick={() => openEditOverhead(o)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </IconButton>
                          <IconButton title={`Delete ${o.name}`} tone="danger" onClick={() => handleDeleteOverhead(o)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </IconButton>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Panel>

        <Panel title="Selected overhead" subtitle="Usage this month and all time">
          {!selected ? (
            <EmptyState
              icon={Layers}
              title="Select an overhead category"
              message="Pick an overhead on the left to see how it is used on vouchers."
            />
          ) : (
            <div className="space-y-4 text-[13px]">
              <div>
                <p className="text-[11.5px] font-semibold uppercase tracking-wider text-ink-muted">Overhead</p>
                <h2 className="mt-1 text-[17px] font-semibold text-ink-strong">{selected.name}</h2>
                <p className="mt-1 font-mono text-[12px] text-ink-muted">{selected.code}</p>
              </div>
              <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="rounded-card border border-border bg-surface-sunken/60 px-3 py-2.5">
                  <dt className="text-[12px] text-ink-muted">Vouchers</dt>
                  <dd className="mt-0.5 text-[15px] font-semibold tabular-nums text-ink-strong">
                    {usageFor(selected.id).vouchers}
                  </dd>
                </div>
                <div className="rounded-card border border-border bg-surface-sunken/60 px-3 py-2.5">
                  <dt className="text-[12px] text-ink-muted">Spent this month</dt>
                  <dd className="mt-0.5 text-[15px] font-semibold tabular-nums text-ink-strong">
                    {formatInr(usageFor(selected.id).spentThisMonth)}
                  </dd>
                </div>
              </dl>
              <p className="text-[12.5px] leading-relaxed text-ink-secondary">
                Expense category is entered as free text on Daily Expense Entry. Attachments (receipts / bills) are
                uploaded there and stored in Cloudflare.
              </p>
            </div>
          )}
        </Panel>
      </div>

      {ohModal && canManageMasters ? (
        <OverheadModal
          initial={ohModal}
          overheads={overheads}
          onClose={() => setOhModal(null)}
          onSaved={(row, isNew) => {
            setOhModal(null);
            if (isNew && row?.id) setSelectedId(row.id);
          }}
        />
      ) : null}
    </div>
  );
}

function OverheadModal({ initial, overheads, onClose, onSaved }) {
  const isEdit = Boolean(initial.id);
  const [name, setName] = useState(initial.name || "");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const code = isEdit ? initial.code : previewNextOverheadCode(overheads);

  const submit = async (e) => {
    e?.preventDefault();
    const clean = name.replace(/\s+/g, " ").trim();
    if (!clean) return setErr("Overhead category name is required");
    if (overheads.some((o) => o.id !== initial.id && norm(o.name) === norm(clean))) {
      return setErr("An overhead category with this name already exists");
    }
    setSaving(true);
    try {
      const row = isEdit ? await updateOverheadCategory(initial.id, clean) : await createOverheadCategory(clean);
      toast.success(isEdit ? "Overhead category updated" : "Overhead category added", clean);
      onSaved(row, !isEdit);
    } catch (ex) {
      setErr(ex.message);
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={isEdit ? "Edit Overhead Category" : "Add Overhead Category"}
      onClose={onClose}
      widthClass="max-w-lg"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <SecondaryButton onClick={onClose} className={PC_BTN}>
            Cancel
          </SecondaryButton>
          <PrimaryButton onClick={submit} disabled={saving} className={PC_BTN}>
            {saving ? "Saving…" : "Save"}
          </PrimaryButton>
        </div>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-4 text-[13px]">
        <FormField label="Overhead Category Name" required error={err} htmlFor="pc-oh-name">
          <input
            id="pc-oh-name"
            autoFocus
            value={name}
            maxLength={80}
            onChange={(e) => {
              setName(e.target.value);
              setErr("");
            }}
            placeholder="e.g. Courier & Postage"
            className={`${PC_INPUT} ${err ? PC_INPUT_ERROR : ""}`}
          />
        </FormField>
        <FormField label="Code" hint={isEdit ? "Codes do not change." : "Generated automatically when you save."} htmlFor="pc-oh-code">
          <input id="pc-oh-code" value={code} readOnly className={`${PC_INPUT} bg-surface-sunken font-mono`} />
        </FormField>
      </form>
    </Modal>
  );
}
