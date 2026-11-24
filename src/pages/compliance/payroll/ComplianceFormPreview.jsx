import React, { useEffect, useMemo, useState } from "react";
import { Modal, PrimaryButton, SecondaryButton, TinyInput, TinySelect } from "../../../components/erpUi";
import { toast } from "../../../lib/toast";
import {
  HR_APPLY_LABELS,
  HR_APPLY_MODULES,
  HR_FORM_GROUPS,
  HR_PAYROLL_SOURCES,
  formDisplayName,
} from "./hrSiteFormCatalog";
import {
  blankEntryRow,
  entryStorageKey,
  getFormEntry,
  listHrFormats,
  saveFormEntry,
  upsertHrFormat,
} from "./hrSiteComplianceStore";

export function blankHrFormat(appliesCode = "FIRE") {
  return {
    id: `f${Date.now()}`,
    group: HR_FORM_GROUPS[0],
    formNo: "",
    name: "",
    ruleRef: "",
    appliesTo: [appliesCode],
    type: "Central",
    state: "",
    anyState: false,
    withBill: false,
    active: true,
    payrollSources: [0],
    columns: ["Sr No", "Name"],
  };
}

/** Layout-only editor (columns / applies-to). Kept for “Columns / layout” link. */
export function FormatEditorModal({ open, initial, onClose, onSaved }) {
  const [draft, setDraft] = useState(initial);

  useEffect(() => {
    if (!initial) {
      setDraft(null);
      return;
    }
    setDraft({
      ...initial,
      columnsText: Array.isArray(initial.columns) ? initial.columns.join(", ") : initial.columnsText || "",
    });
  }, [initial, open]);

  if (!open || !draft) return null;

  const set = (key, value) => setDraft((prev) => ({ ...prev, [key]: value }));

  const toggleApply = (code) => {
    setDraft((prev) => {
      const setCodes = new Set(prev.appliesTo || []);
      if (setCodes.has(code)) setCodes.delete(code);
      else setCodes.add(code);
      return { ...prev, appliesTo: [...setCodes] };
    });
  };

  const toggleSource = (idx) => {
    setDraft((prev) => {
      const setIdx = new Set(prev.payrollSources || []);
      if (setIdx.has(idx)) setIdx.delete(idx);
      else setIdx.add(idx);
      return { ...prev, payrollSources: [...setIdx].sort((a, b) => a - b) };
    });
  };

  const save = () => {
    const name = String(draft.name || "").trim();
    const columns = String(draft.columnsText ?? "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    if (!name) {
      toast.warning("Add a form name");
      return;
    }
    if (!(draft.appliesTo || []).length) {
      toast.warning("Pick at least one module");
      return;
    }
    if (!columns.length) {
      toast.warning("Add at least one column");
      return;
    }
    const saved = {
      ...draft,
      formNo: String(draft.formNo || "").trim() || "Form",
      name,
      columns,
      type: draft.type,
      state: draft.type === "State" ? draft.state || "" : "",
      anyState: draft.type === "State" && !draft.state,
      withBill: Boolean(draft.withBill),
    };
    delete saved.columnsText;
    upsertHrFormat(saved);
    toast.success("Layout saved");
    onSaved?.(saved);
    onClose?.();
  };

  return (
    <Modal
      open={open}
      title={initial?.name ? "Columns / layout" : "New format"}
      onClose={onClose}
      widthClass="max-w-xl"
      footer={
        <div className="flex justify-end gap-2">
          <SecondaryButton type="button" onClick={onClose}>
            Cancel
          </SecondaryButton>
          <PrimaryButton type="button" onClick={save}>
            Save layout
          </PrimaryButton>
        </div>
      }
    >
      <div className="space-y-3">
        <label className="block text-[12px] font-semibold text-ink">
          Form number
          <TinyInput
            className="mt-1 w-full"
            value={draft.formNo || ""}
            onChange={(e) => set("formNo", e.target.value)}
            placeholder="e.g. Form IV"
          />
        </label>
        <label className="block text-[12px] font-semibold text-ink">
          Form name
          <TinyInput className="mt-1 w-full" value={draft.name || ""} onChange={(e) => set("name", e.target.value)} />
        </label>
        <label className="block text-[12px] font-semibold text-ink">
          Category
          <TinySelect className="mt-1 w-full" value={draft.group} onChange={(e) => set("group", e.target.value)}>
            {HR_FORM_GROUPS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </TinySelect>
        </label>
        <div>
          <p className="text-[12px] font-semibold text-ink mb-1.5">Applies to</p>
          <div className="flex flex-wrap gap-3">
            {HR_APPLY_MODULES.map((code) => (
              <label key={code} className="inline-flex items-center gap-1.5 text-[12px] text-ink">
                <input
                  type="checkbox"
                  checked={(draft.appliesTo || []).includes(code)}
                  onChange={() => toggleApply(code)}
                />
                {HR_APPLY_LABELS[code]}
              </label>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-[12px] font-semibold text-ink">
            Type
            <TinySelect className="mt-1 w-full" value={draft.type} onChange={(e) => set("type", e.target.value)}>
              <option value="Central">Central</option>
              <option value="State">State</option>
            </TinySelect>
          </label>
          <label className="block text-[12px] font-semibold text-ink">
            State
            <TinySelect
              className="mt-1 w-full"
              value={draft.state || ""}
              disabled={draft.type !== "State"}
              onChange={(e) => set("state", e.target.value)}
            >
              <option value="">Any state (B / C / D style)</option>
              <option value="Gujarat">Gujarat</option>
              <option value="Maharashtra">Maharashtra</option>
              <option value="Karnataka">Karnataka</option>
              <option value="Madhya Pradesh">Madhya Pradesh</option>
            </TinySelect>
          </label>
        </div>
        <label className="block text-[12px] font-semibold text-ink">
          Columns (comma separated; use DAYS for the 1–31 attendance grid)
          <textarea
            className="mt-1 w-full min-h-[72px] rounded-control border border-border bg-surface px-2.5 py-2 text-xs text-ink"
            value={draft.columnsText ?? ""}
            onChange={(e) => set("columnsText", e.target.value)}
          />
        </label>
        <div>
          <p className="text-[12px] font-semibold text-ink mb-1.5">Data fetched from payroll</p>
          <div className="flex flex-wrap gap-3">
            {HR_PAYROLL_SOURCES.map((label, idx) => (
              <label key={label} className="inline-flex items-center gap-1.5 text-[12px] text-ink">
                <input
                  type="checkbox"
                  checked={(draft.payrollSources || []).includes(idx)}
                  onChange={() => toggleSource(idx)}
                />
                {label}
              </label>
            ))}
          </div>
        </div>
        <label className="block text-[12px] font-semibold text-ink">
          Required with bill
          <TinySelect
            className="mt-1 w-full"
            value={draft.withBill ? "Yes" : "No"}
            onChange={(e) => set("withBill", e.target.value === "Yes")}
          >
            <option>Yes</option>
            <option>No</option>
          </TinySelect>
        </label>
      </div>
    </Modal>
  );
}

function cellInputClass() {
  return "h-8 w-full min-w-[110px] rounded-md border border-border bg-surface px-2 text-[11px] text-ink focus:border-accent focus:outline-none";
}

function mapRowsToColumns(rawRows, cols) {
  return (rawRows || []).map((row) => {
    const next = blankEntryRow(cols);
    cols.forEach((col) => {
      next[col] = row?.[col] ?? "";
    });
    return next;
  });
}

function defaultEmptyRows(cols, count = 2) {
  return Array.from({ length: count }, () => blankEntryRow(cols));
}

/**
 * Open form → enter data in the document table → Save.
 * Column titles are fixed. Only data rows can be added or removed.
 */
export default function ComplianceFormPreview({
  form,
  open,
  onClose,
  onFormatsChanged,
  onSaved,
  site = null,
  period = "",
  periodLabelText = "",
  version = null,
  allowLayoutEdit = false,
}) {
  const [liveForm, setLiveForm] = useState(form);
  const [layoutEdit, setLayoutEdit] = useState(null);
  const [header, setHeader] = useState({
    establishment: "",
    employer: "",
    panTan: "",
    lin: "",
    monthOf: "",
  });
  const [rows, setRows] = useState([]);

  const storageKey = useMemo(() => {
    if (!form?.id) return "";
    return entryStorageKey({
      formId: form.id,
      siteId: site?.id ? String(site.id) : "",
      period: period || "",
    });
  }, [form?.id, site?.id, period]);

  useEffect(() => {
    if (!open || !form) return;
    setLiveForm(form);
    const entry = getFormEntry(storageKey);
    const cols = form.columns || [];
    setHeader({
      establishment: entry.header.establishment || site?.site_name || "",
      employer: entry.header.employer || site?.contract_details || "",
      panTan: entry.header.panTan || "",
      lin: entry.header.lin || "",
      monthOf: entry.header.monthOf || periodLabelText || "",
    });
    const filled = (entry.rows || []).filter((row) =>
      Object.values(row || {}).some((value) => String(value || "").trim())
    );
    if (filled.length) {
      setRows(mapRowsToColumns(entry.rows, cols));
    } else if ((entry.rows || []).length) {
      setRows(mapRowsToColumns(entry.rows, cols));
    } else {
      setRows(defaultEmptyRows(cols, 2));
    }
  }, [open, form, storageKey, site, periodLabelText]);

  if (!open || !liveForm) return null;

  const cols = liveForm.columns || [];

  const setHeaderField = (key, value) => setHeader((prev) => ({ ...prev, [key]: value }));

  const setCell = (rowIndex, col, value) => {
    setRows((prev) => prev.map((row, idx) => (idx === rowIndex ? { ...row, [col]: value } : row)));
  };

  const addRow = () => setRows((prev) => [...prev, blankEntryRow(cols)]);

  const removeRow = (rowIndex) => {
    setRows((prev) => {
      if (prev.length <= 1) {
        toast.warning("Keep at least one row");
        return prev;
      }
      return prev.filter((_, idx) => idx !== rowIndex);
    });
  };

  const saveEntry = () => {
    saveFormEntry(storageKey, { header, rows });
    toast.success("Form data saved");
    onSaved?.({ header, rows, key: storageKey });
  };

  const subtitle = site
    ? `${site.site_name || "Site"}${periodLabelText ? ` · ${periodLabelText}` : ""}${version ? ` · v${version}` : ""}`
    : "Column titles stay fixed. Add or remove rows only, enter data, then Save.";

  return (
    <>
      <Modal
        open={open && !layoutEdit}
        title={formDisplayName(liveForm)}
        onClose={onClose}
        widthClass="max-w-6xl"
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <SecondaryButton type="button" onClick={addRow}>
                + Add row
              </SecondaryButton>
              <span className="text-[11px] text-ink-muted">{rows.length} row{rows.length === 1 ? "" : "s"}</span>
              {allowLayoutEdit ? (
                <button
                  type="button"
                  className="h-9 px-2 text-[11px] font-medium text-ink-muted hover:text-accent hover:underline"
                  onClick={() => setLayoutEdit({ ...liveForm })}
                >
                  Columns / layout
                </button>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <SecondaryButton type="button" onClick={onClose}>
                Close
              </SecondaryButton>
              <PrimaryButton type="button" onClick={saveEntry}>
                Save
              </PrimaryButton>
            </div>
          </div>
        }
      >
        <p className="type-meta text-ink-muted mb-3">{subtitle}</p>

        <div className="rounded-lg border border-border bg-surface-sunken/40 p-4">
          <div className="text-center mb-3">
            <p className="text-[13px] font-bold text-ink">
              {String(liveForm.formNo || "").toUpperCase()}{" "}
              <span className="font-normal text-ink-muted">{liveForm.ruleRef || ""}</span>
            </p>
            <p className="text-[12px] font-semibold text-ink mt-0.5">
              {String(liveForm.name || "").toUpperCase()}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-[12px] mb-4">
            <label className="flex flex-col gap-1">
              <span className="text-ink-muted">Name of Establishment</span>
              <input
                className={cellInputClass()}
                value={header.establishment}
                onChange={(e) => setHeaderField("establishment", e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-ink-muted">Name of Employer / Owner</span>
              <input
                className={cellInputClass()}
                value={header.employer}
                onChange={(e) => setHeaderField("employer", e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-ink-muted">PAN/TAN of the Employer</span>
              <input
                className={cellInputClass()}
                value={header.panTan}
                onChange={(e) => setHeaderField("panTan", e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-ink-muted">LIN (Registration No.)</span>
              <input
                className={cellInputClass()}
                value={header.lin}
                onChange={(e) => setHeaderField("lin", e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2 max-w-sm">
              <span className="text-ink-muted">For the month of</span>
              <input
                className={cellInputClass()}
                value={header.monthOf}
                onChange={(e) => setHeaderField("monthOf", e.target.value)}
                placeholder="e.g. November 2026"
              />
            </label>
          </div>

          <div className="max-h-[min(480px,55vh)] overflow-auto rounded-lg border border-border bg-surface">
            <table className="w-max min-w-full border-separate border-spacing-0 text-[11px]">
              <thead>
                <tr>
                  <th className="sticky left-0 top-0 z-20 border border-border bg-surface-sunken px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-ink-secondary">
                    S.No.
                  </th>
                  {cols.map((col) => (
                    <th
                      key={col}
                      className="sticky top-0 z-10 border border-border bg-surface-sunken px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-ink-secondary whitespace-nowrap"
                    >
                      {col === "DAYS" ? "Daily attendance" : col}
                    </th>
                  ))}
                  <th className="sticky top-0 z-10 border border-border bg-surface-sunken px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-ink-secondary whitespace-nowrap">
                    Row
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="bg-surface">
                    <td className="sticky left-0 z-[1] border border-border bg-surface px-2 py-1 text-center text-ink-muted">
                      {rowIndex + 1}
                    </td>
                    {cols.map((col) => (
                      <td key={col} className="border border-border p-1 align-middle">
                        <input
                          className={cellInputClass()}
                          value={row[col] ?? ""}
                          onChange={(e) => setCell(rowIndex, col, e.target.value)}
                          aria-label={`${col} row ${rowIndex + 1}`}
                        />
                      </td>
                    ))}
                    <td className="border border-border px-2 py-1 align-middle whitespace-nowrap">
                      <button
                        type="button"
                        className="h-7 rounded-control border border-border bg-surface px-2 text-[11px] font-medium text-ink-secondary hover:border-critical/40 hover:text-critical disabled:opacity-40"
                        onClick={() => removeRow(rowIndex)}
                        disabled={rows.length <= 1}
                        aria-label={`Remove row ${rowIndex + 1}`}
                        title="Remove this row"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="type-meta text-ink-muted mt-3">
            Titles stay fixed. Use + Add row for another employee line, or Remove on a row to delete that line only.
          </p>
        </div>
      </Modal>

      <FormatEditorModal
        open={Boolean(layoutEdit)}
        initial={layoutEdit}
        onClose={() => setLayoutEdit(null)}
        onSaved={(saved) => {
          setLayoutEdit(null);
          setLiveForm(saved);
          setRows((prev) => mapRowsToColumns(prev, saved.columns || []));
          onFormatsChanged?.(listHrFormats());
        }}
      />
    </>
  );
}
