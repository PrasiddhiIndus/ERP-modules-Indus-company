import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Modal } from "../components/AdminUi";
import {
  flattenComponentTree,
  hydratePersonComponents,
  isCtcOptionalPresetCode,
  loadCustomComponentAmounts,
  loadPersonComponents,
  normalizeComponentCode,
  newComponentId,
  persistPersonComponents,
  saveCustomComponentAmounts,
  suggestComponentCode,
} from "./salaryComponentsCatalog";

const inputCls =
  "h-8 w-full border border-slate-200 rounded-md px-2 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-accent/30";
const btnGhost =
  "h-8 px-2.5 text-[11px] font-medium rounded-md border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 inline-flex items-center gap-1";
const btnPrimary =
  "h-8 px-2.5 text-[11px] font-medium rounded-md bg-accent text-white disabled:opacity-50 inline-flex items-center gap-1";
const btnIcon =
  "inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-ink disabled:opacity-50";
const btnIconDanger =
  "inline-flex h-7 w-7 items-center justify-center rounded-md border border-red-100 bg-white text-red-600 hover:bg-red-50 disabled:opacity-50";

const PART_OPTIONS = [
  { code: "PART_A", name: "Part A — Gross & Take Home" },
  { code: "PART_B", name: "Part B — Employer cost" },
  { code: "BOTH", name: "Both — Part A and Part B" },
];

function normalizeParentChoice(value) {
  if (value === "PART_B") return "PART_B";
  if (value === "BOTH") return "BOTH";
  return "PART_A";
}

function partLabel(parentCode) {
  if (parentCode === "PART_B") return "Part B";
  return "Part A";
}

function blankForm(parentCode = "PART_A") {
  return {
    id: "",
    code: "",
    name: "",
    parent_code: normalizeParentChoice(parentCode),
    kind: "custom",
    formula: "Manual",
    formula_label: "",
    active: true,
    show_on_profile: true,
    sort_order: 55,
  };
}

function nextSortOrder(list, parentCode) {
  const target = parentCode === "BOTH" ? null : parentCode;
  return (
    Math.max(
      0,
      ...list
        .filter((c) => (target ? c.parent_code === target : true))
        .map((c) => c.sort_order || 0)
    ) + 5
  );
}

/** Suggest a free Part B twin code when adding under Both. */
function twinPartBCode(baseCode, knownCodes) {
  const base = normalizeComponentCode(baseCode);
  const candidates = [`${base}B`, `${base}_B`, `${base}2`];
  for (const c of candidates) {
    if (c && c !== base && !knownCodes.includes(c)) return c;
  }
  return suggestComponentCode(`${base} B`, knownCodes);
}

/**
 * Person-specific salary components — Part A, Part B, or both; Manual amounts on CTC sheet.
 */
export default function PersonSalaryComponentsPanel({
  employeeId,
  employeeName = "Employee",
  onChanged,
}) {
  const [personComponents, setPersonComponents] = useState([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(() => blankForm());
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!employeeId) {
      setPersonComponents([]);
      return undefined;
    }
    setPersonComponents(loadPersonComponents(employeeId));
    setNotice("");
    setError("");
    (async () => {
      try {
        const rows = await hydratePersonComponents(employeeId);
        if (!cancelled) setPersonComponents(rows);
      } catch (err) {
        console.warn("Person components load failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [employeeId]);

  const persistPerson = useCallback(
    async (next) => {
      if (!employeeId) return;
      try {
        const saved = await persistPersonComponents(employeeId, next);
        setPersonComponents(saved);
        setError("");
        onChanged?.();
      } catch (err) {
        console.error("Person components save failed", err);
        setError(
          err?.message
            ? `Could not save to database: ${err.message}`
            : "Could not save components to the database."
        );
        // Still keep local so CTC sheet works
        setPersonComponents(Array.isArray(next) ? next : []);
        onChanged?.();
      }
    },
    [employeeId, onChanged]
  );

  const knownCodes = useMemo(
    () => personComponents.map((c) => c.code),
    [personComponents]
  );

  const personTree = useMemo(
    () =>
      flattenComponentTree(personComponents).filter(
        (row) => !isCtcOptionalPresetCode(row.code)
      ),
    [personComponents]
  );

  const openCreate = () => {
    if (!employeeId) return;
    setEditingId(null);
    const draft = blankForm("PART_A");
    draft.code = suggestComponentCode("New component", knownCodes);
    draft.sort_order = nextSortOrder(personComponents, "PART_A");
    setForm(draft);
    setModalOpen(true);
    setError("");
  };

  const openEdit = (row) => {
    setEditingId(row.id);
    setForm({
      id: row.id,
      code: row.code,
      name: row.name,
      parent_code: row.parent_code === "PART_B" ? "PART_B" : "PART_A",
      kind: row.kind || "custom",
      formula: "Manual",
      formula_label: row.formula_label || "",
      active: row.active !== false,
      show_on_profile: row.show_on_profile !== false,
      sort_order: row.sort_order || 0,
    });
    setModalOpen(true);
    setError("");
  };

  const handleSaveForm = async (e) => {
    e.preventDefault();
    if (!employeeId) return;
    const code = normalizeComponentCode(form.code);
    const name = String(form.name || "").trim();
    const parentChoice = normalizeParentChoice(form.parent_code);
    if (!code) {
      setError("Enter a short code (e.g. CON).");
      return;
    }
    if (isCtcOptionalPresetCode(code)) {
      setError("LTA, FOOD, and VPI are added with the checkboxes on the CTC sheet.");
      return;
    }
    if (!name) {
      setError("Enter a component name.");
      return;
    }
    const clash = personComponents.find((c) => c.code === code && c.id !== editingId);
    if (clash) {
      setError(`This employee already has ${code}.`);
      return;
    }

    const now = new Date().toISOString();
    const formulaLabel = form.formula_label || "Manual amount on CTC";

    if (editingId) {
      // Edit always targets one existing row — Part A or Part B only
      const parent = parentChoice === "PART_B" ? "PART_B" : "PART_A";
      await persistPerson(
        personComponents.map((c) =>
          c.id === editingId
            ? {
                ...c,
                code,
                name,
                parent_code: parent,
                kind: "custom",
                formula: "Manual",
                formula_label: formulaLabel,
                active: true,
                show_on_profile: true,
                sort_order: Number(form.sort_order) || 0,
                updated_at: now,
              }
            : c
        )
      );
      setNotice(`Updated ${code}. Enter monthly / P.A. on the CTC sheet above.`);
    } else if (parentChoice === "BOTH") {
      const codeB = twinPartBCode(code, knownCodes);
      if (isCtcOptionalPresetCode(codeB)) {
        setError("Could not create a Part B code. Try a different code.");
        return;
      }
      const sortA = nextSortOrder(personComponents, "PART_A");
      const sortB = nextSortOrder(personComponents, "PART_B");
      await persistPerson([
        ...personComponents,
        {
          id: newComponentId(),
          code,
          name,
          parent_code: "PART_A",
          kind: "custom",
          formula: "Manual",
          formula_label: formulaLabel,
          is_system: false,
          active: true,
          show_on_profile: true,
          sort_order: sortA,
          employee_master_id: Number(employeeId) || employeeId,
          created_at: now,
          updated_at: now,
        },
        {
          id: newComponentId(),
          code: codeB,
          name,
          parent_code: "PART_B",
          kind: "custom",
          formula: "Manual",
          formula_label: formulaLabel,
          is_system: false,
          active: true,
          show_on_profile: true,
          sort_order: sortB,
          employee_master_id: Number(employeeId) || employeeId,
          created_at: now,
          updated_at: now,
        },
      ]);
      setNotice(
        `${code} (Part A) and ${codeB} (Part B) added. Enter monthly / P.A. on each CTC section, then Save CTC.`
      );
    } else {
      const parent = parentChoice === "PART_B" ? "PART_B" : "PART_A";
      await persistPerson([
        ...personComponents,
        {
          id: newComponentId(),
          code,
          name,
          parent_code: parent,
          kind: "custom",
          formula: "Manual",
          formula_label: formulaLabel,
          is_system: false,
          active: true,
          show_on_profile: true,
          sort_order: Number(form.sort_order) || nextSortOrder(personComponents, parent),
          employee_master_id: Number(employeeId) || employeeId,
          created_at: now,
          updated_at: now,
        },
      ]);
      setNotice(
        `${code} added under ${parent === "PART_B" ? "Part B" : "Part A"}. Enter monthly / P.A. on the CTC sheet, then Save CTC.`
      );
    }
    setModalOpen(false);
    window.setTimeout(() => setNotice(""), 4000);
  };

  const handleDelete = async (row) => {
    if (!window.confirm(`Remove ${row.code} — ${row.name} from this CTC?`)) return;
    await persistPerson(personComponents.filter((c) => c.id !== row.id));
    const amts = { ...loadCustomComponentAmounts(employeeId) };
    delete amts[row.code];
    saveCustomComponentAmounts(employeeId, amts);
    setNotice(`Removed ${row.code}.`);
    window.setTimeout(() => setNotice(""), 3500);
  };

  if (!employeeId) return null;

  return (
    <div className="rounded-lg border border-border bg-white shadow-[0_1px_3px_rgba(40,35,25,0.04)] overflow-hidden">
      <div className="px-4 sm:px-6 py-3 border-b border-divider flex flex-wrap items-center justify-between gap-2 bg-surface-sunken/50">
        <div>
          <h3 className="text-sm font-semibold text-ink-strong">Add components</h3>
          <p className="text-[11px] text-ink-muted mt-0.5">
            Add for {employeeName} under Part A, Part B, or both. Amounts are entered on the CTC
            sheet (monthly + P.A.). Edit or delete components here.
          </p>
        </div>
        <button type="button" className={btnPrimary} onClick={openCreate}>
          <Plus className="h-3.5 w-3.5" />
          Add component
        </button>
      </div>

      <div className="px-4 sm:px-6 py-3 space-y-3">
        {error ? (
          <p className="text-xs text-red-600 rounded border border-red-100 bg-red-50 px-2.5 py-1.5">{error}</p>
        ) : null}
        {notice ? (
          <p className="text-xs text-emerald-800 rounded border border-emerald-100 bg-emerald-50 px-2.5 py-1.5">
            {notice}
          </p>
        ) : null}

        {!personTree.length ? (
          <p className="text-[11px] text-ink-muted py-2">
            No extra components yet. Use Add component above, or tick LTA / Food coupon / Variable
            performance incentive on the CTC sheet.
          </p>
        ) : (
          <div className="overflow-auto max-h-56 rounded border border-slate-200">
            <table className="w-full text-[11px] min-w-[480px]">
              <thead className="sticky top-0 bg-slate-50 text-slate-500 uppercase tracking-wide">
                <tr>
                  <th className="text-left px-2.5 py-2 font-semibold">Code</th>
                  <th className="text-left px-2.5 py-2 font-semibold">Name</th>
                  <th className="text-left px-2.5 py-2 font-semibold">Part</th>
                  <th className="text-right px-2.5 py-2 font-semibold w-[5.5rem]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {personTree.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                    <td className="px-2.5 py-2 font-mono font-semibold text-ink">{row.code}</td>
                    <td className="px-2.5 py-2 text-ink">{row.name}</td>
                    <td className="px-2.5 py-2 text-slate-500">{partLabel(row.parent_code)}</td>
                    <td className="px-2.5 py-2">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          className={btnIcon}
                          onClick={() => openEdit(row)}
                          title="Edit"
                          aria-label={`Edit ${row.code}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className={btnIconDanger}
                          onClick={() => handleDelete(row)}
                          title="Delete"
                          aria-label={`Delete ${row.code}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={modalOpen}
        title={editingId ? "Edit component" : "Add component"}
        onClose={() => setModalOpen(false)}
        widthClass="max-w-md"
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className={btnGhost} onClick={() => setModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" form="ctc-person-comp-form" className={btnPrimary}>
              Save
            </button>
          </div>
        }
      >
        <form id="ctc-person-comp-form" className="space-y-3" onSubmit={handleSaveForm}>
          <label className="text-[10px] uppercase text-slate-500 space-y-0.5 block">
            <span className="block">Add under</span>
            <select
              className={inputCls}
              value={
                editingId
                  ? form.parent_code === "PART_B"
                    ? "PART_B"
                    : "PART_A"
                  : normalizeParentChoice(form.parent_code)
              }
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  parent_code: normalizeParentChoice(e.target.value),
                  sort_order: nextSortOrder(
                    personComponents,
                    normalizeParentChoice(e.target.value)
                  ),
                }))
              }
            >
              {PART_OPTIONS.filter((p) => !editingId || p.code !== "BOTH").map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[10px] uppercase text-slate-500 space-y-0.5">
              <span className="block">Code</span>
              <input
                className={`${inputCls} font-mono`}
                value={form.code}
                onChange={(e) =>
                  setForm((f) => ({ ...f, code: normalizeComponentCode(e.target.value) }))
                }
                placeholder="CON"
                disabled={Boolean(editingId)}
              />
            </label>
            <label className="text-[10px] uppercase text-slate-500 space-y-0.5">
              <span className="block">Name</span>
              <input
                className={inputCls}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Conveyance"
              />
            </label>
          </div>
          <p className="text-[11px] text-slate-500">
            Amount type is <span className="font-medium text-slate-700">Manual</span> — enter monthly
            and P.A. on the CTC sheet after save.
            {!editingId && form.parent_code === "BOTH" ? (
              <>
                {" "}
                <span className="font-medium text-slate-700">Both</span> creates one line in Part A
                and one in Part B (you enter amounts on each).
              </>
            ) : null}
          </p>
        </form>
      </Modal>
    </div>
  );
}
