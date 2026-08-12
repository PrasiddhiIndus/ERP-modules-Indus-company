import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Modal } from "../components/AdminUi";
import {
  evalComponentFormula,
  flattenComponentTree,
  getDefaultCtcComponents,
  loadPersonComponents,
  normalizeComponentCode,
  newComponentId,
  savePersonComponents,
  suggestComponentCode,
  validateComponentFormula,
} from "./salaryComponentsCatalog";

const inputCls =
  "h-8 w-full border border-slate-200 rounded-md px-2 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-accent/30";
const btnGhost =
  "h-8 px-2.5 text-[11px] font-medium rounded-md border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 inline-flex items-center gap-1";
const btnPrimary =
  "h-8 px-2.5 text-[11px] font-medium rounded-md bg-accent text-white disabled:opacity-50 inline-flex items-center gap-1";

function blankForm(parentCode = "PART_A") {
  return {
    id: "",
    code: "",
    name: "",
    parent_code: parentCode || "PART_A",
    kind: "custom",
    formula: "BAS * 10%",
    formula_label: "",
    active: true,
    show_on_profile: true,
    sort_order: 55,
  };
}

/**
 * Person-specific salary components — embedded on Employee Master CTC (no page redirect).
 */
export default function PersonSalaryComponentsPanel({
  employeeId,
  employeeName = "Employee",
  sampleVars = null,
  onChanged,
}) {
  const defaults = useMemo(() => getDefaultCtcComponents(), []);
  const [personComponents, setPersonComponents] = useState([]);
  const [defaultsOpen, setDefaultsOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(() => blankForm());
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    if (!employeeId) {
      setPersonComponents([]);
      return;
    }
    setPersonComponents(loadPersonComponents(employeeId));
    setNotice("");
    setError("");
  }, [employeeId]);

  const persistPerson = useCallback(
    (next) => {
      if (!employeeId) return;
      const saved = savePersonComponents(employeeId, next);
      setPersonComponents(saved);
      onChanged?.();
    },
    [employeeId, onChanged]
  );

  const knownCodes = useMemo(() => {
    const codes = new Set(defaults.map((c) => c.code));
    for (const c of personComponents) codes.add(c.code);
    return [...codes];
  }, [defaults, personComponents]);

  const parentOptions = useMemo(
    () => [
      ...defaults.filter((c) => c.code === "PART_A" || c.code === "PART_B" || c.kind !== "group"),
      ...personComponents,
    ],
    [defaults, personComponents]
  );

  const personTree = useMemo(() => flattenComponentTree(personComponents), [personComponents]);
  const defaultTree = useMemo(() => flattenComponentTree(defaults), [defaults]);

  const formulaSample = useMemo(() => {
    if (sampleVars && typeof sampleVars === "object") return sampleVars;
    return {
      gross_monthly: 45000,
      basic_monthly: 22500,
      hra_monthly: 9000,
      special_allowance_monthly: 13500,
      emp_pf_monthly: 1800,
      pt_monthly: 200,
      emp_esic_monthly: 0,
      take_home_monthly: 43000,
      er_pf_monthly: 1950,
      er_esic_monthly: 0,
      gratuity_monthly: 1082,
      leave_encash_monthly: 0,
      mediclaim_monthly: 0,
      lic_monthly: 0,
      special_perf_bonus_monthly: 0,
      bonus_monthly: 0,
      total_b_monthly: 3032,
      ctc_monthly: 48032,
    };
  }, [sampleVars]);

  const openCreate = (parentCode = "PART_A") => {
    if (!employeeId) return;
    setEditingId(null);
    const draft = blankForm(parentCode);
    draft.code = suggestComponentCode("New component", knownCodes);
    draft.sort_order =
      Math.max(
        0,
        ...personComponents.filter((c) => c.parent_code === parentCode).map((c) => c.sort_order || 0)
      ) + 5;
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
      parent_code: row.parent_code || "PART_A",
      kind: row.kind || "custom",
      formula: row.formula || "",
      formula_label: row.formula_label || "",
      active: row.active !== false,
      show_on_profile: row.show_on_profile !== false,
      sort_order: row.sort_order || 0,
    });
    setModalOpen(true);
    setError("");
  };

  const handleSaveForm = (e) => {
    e.preventDefault();
    if (!employeeId) return;
    const code = normalizeComponentCode(form.code);
    const name = String(form.name || "").trim();
    if (!code) {
      setError("Enter a short code (e.g. CON for Conveyance).");
      return;
    }
    if (!name) {
      setError("Enter a component name.");
      return;
    }
    if (defaults.some((d) => d.code === code)) {
      setError(`${code} is a company default code. Choose another code for this person.`);
      return;
    }
    const clash = personComponents.find((c) => c.code === code && c.id !== editingId);
    if (clash) {
      setError(`This employee already has ${code}.`);
      return;
    }
    const formula = String(form.formula || "").trim();
    if (formula && !/^manual$/i.test(formula)) {
      const v = validateComponentFormula(formula, knownCodes.filter((c) => c !== code));
      if (!v.ok) {
        setError(v.error || "Invalid formula.");
        return;
      }
    }

    const now = new Date().toISOString();
    if (editingId) {
      persistPerson(
        personComponents.map((c) =>
          c.id === editingId
            ? {
                ...c,
                code,
                name,
                parent_code: form.parent_code || "PART_A",
                kind: form.kind || "custom",
                formula: formula || "Manual",
                formula_label: form.formula_label || "",
                active: form.active !== false,
                show_on_profile: form.show_on_profile !== false,
                sort_order: Number(form.sort_order) || 0,
                updated_at: now,
              }
            : c
        )
      );
      setNotice(`Updated ${code}.`);
    } else {
      persistPerson([
        ...personComponents,
        {
          id: newComponentId(),
          code,
          name,
          parent_code: form.parent_code || "PART_A",
          kind: form.kind || "custom",
          formula: formula || "Manual",
          formula_label: form.formula_label || "Person-specific",
          is_system: false,
          active: form.active !== false,
          show_on_profile: true,
          sort_order: Number(form.sort_order) || 55,
          employee_master_id: Number(employeeId) || employeeId,
          created_at: now,
          updated_at: now,
        },
      ]);
      setNotice(`${code} added — reflected on this CTC sheet and salary processing.`);
    }
    setModalOpen(false);
    window.setTimeout(() => setNotice(""), 3500);
  };

  const handleDelete = (row) => {
    if (!window.confirm(`Remove ${row.code} from this employee's CTC?`)) return;
    persistPerson(personComponents.filter((c) => c.id !== row.id));
    setNotice(`Removed ${row.code}.`);
    window.setTimeout(() => setNotice(""), 3500);
  };

  if (!employeeId) return null;

  return (
    <div className="rounded-lg border border-border bg-white shadow-[0_1px_3px_rgba(40,35,25,0.04)] overflow-hidden">
      <div className="px-4 sm:px-6 py-3 border-b border-divider flex flex-wrap items-center justify-between gap-2 bg-surface-sunken/50">
        <div>
          <h3 className="text-sm font-semibold text-ink-strong">Person-specific salary components</h3>
          <p className="text-[11px] text-ink-muted mt-0.5">
            Extra earnings or deductions for {employeeName} only — company defaults (BAS, HRA…) stay unchanged.
          </p>
        </div>
        <button type="button" className={btnPrimary} onClick={() => openCreate("PART_A")}>
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

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-ink-secondary">
            Nest under PART_A (earnings/deductions) or PART_B (employer). Formula e.g.{" "}
            <span className="font-mono">BAS * 10%</span> or <span className="font-mono">Manual</span>.
          </p>
          <button
            type="button"
            className="text-[11px] text-accent hover:underline shrink-0"
            onClick={() => setDefaultsOpen((v) => !v)}
          >
            {defaultsOpen ? "Hide company defaults" : "View company default codes"}
          </button>
        </div>

        {defaultsOpen ? (
          <div className="overflow-auto max-h-40 rounded border border-slate-200">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-slate-50 text-slate-500 uppercase">
                <tr>
                  <th className="text-left px-2 py-1.5">Code</th>
                  <th className="text-left px-2 py-1.5">Name</th>
                  <th className="text-left px-2 py-1.5">Formula</th>
                </tr>
              </thead>
              <tbody>
                {defaultTree
                  .filter((r) => r.kind !== "group")
                  .map((row) => (
                    <tr key={row.code} className="border-t border-slate-100">
                      <td className="px-2 py-1 font-mono font-semibold">{row.code}</td>
                      <td className="px-2 py-1">{row.name}</td>
                      <td className="px-2 py-1 font-mono text-slate-600 truncate max-w-[16rem]">
                        {row.formula || "—"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {!personTree.length ? null : (
          <div className="overflow-auto max-h-56 rounded border border-slate-200">
            <table className="w-full text-[11px] min-w-[560px]">
              <thead className="sticky top-0 bg-slate-50 text-slate-500 uppercase tracking-wide">
                <tr>
                  <th className="text-left px-2 py-2">Code</th>
                  <th className="text-left px-2 py-2">Name</th>
                  <th className="text-left px-2 py-2">Under</th>
                  <th className="text-left px-2 py-2">Formula</th>
                  <th className="text-right px-2 py-2">Est. ₹</th>
                  <th className="text-right px-2 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {personTree.map((row) => {
                  let sample = null;
                  try {
                    sample = evalComponentFormula(row.formula, formulaSample);
                  } catch {
                    sample = null;
                  }
                  return (
                    <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                      <td className="px-2 py-1.5 font-mono font-semibold">
                        <span style={{ paddingLeft: `${(Number(row.depth) || 0) * 12}px` }}>{row.code}</span>
                      </td>
                      <td className="px-2 py-1.5">{row.name}</td>
                      <td className="px-2 py-1.5 font-mono text-slate-500">{row.parent_code || "—"}</td>
                      <td className="px-2 py-1.5 font-mono text-slate-600 truncate max-w-[10rem]" title={row.formula}>
                        {row.formula || "—"}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {sample == null ? "—" : Number(sample).toLocaleString("en-IN")}
                      </td>
                      <td className="px-2 py-1.5 text-right whitespace-nowrap">
                        <button type="button" className="text-accent hover:underline mr-2" onClick={() => openEdit(row)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="text-red-600 hover:underline inline-flex items-center gap-0.5"
                          onClick={() => handleDelete(row)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={modalOpen}
        title={editingId ? "Edit salary component" : "Add salary component"}
        onClose={() => setModalOpen(false)}
        widthClass="max-w-lg"
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
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[10px] uppercase text-slate-500 space-y-0.5">
              <span className="block">Code</span>
              <input
                className={`${inputCls} font-mono`}
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: normalizeComponentCode(e.target.value) }))}
                placeholder="CON"
              />
            </label>
            <label className="text-[10px] uppercase text-slate-500 space-y-0.5">
              <span className="block">Under parent</span>
              <select
                className={inputCls}
                value={form.parent_code || "PART_A"}
                onChange={(e) => setForm((f) => ({ ...f, parent_code: e.target.value }))}
              >
                {parentOptions.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.code} — {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="text-[10px] uppercase text-slate-500 space-y-0.5 block">
            <span className="block">Name</span>
            <input
              className={inputCls}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Conveyance"
            />
          </label>
          <label className="text-[10px] uppercase text-slate-500 space-y-0.5 block">
            <span className="block">Formula</span>
            <input
              className={`${inputCls} font-mono`}
              value={form.formula}
              onChange={(e) => setForm((f) => ({ ...f, formula: e.target.value }))}
              placeholder="BAS * 10%"
            />
            <span className="text-[10px] normal-case text-slate-400 mt-0.5 block">
              Use BAS, HRA, GROSS… or Manual for a fixed amount on the CTC sheet.
            </span>
          </label>
          <label className="text-[10px] uppercase text-slate-500 space-y-0.5 block">
            <span className="block">Hint on profile</span>
            <input
              className={inputCls}
              value={form.formula_label}
              onChange={(e) => setForm((f) => ({ ...f, formula_label: e.target.value }))}
              placeholder="Optional note"
            />
          </label>
        </form>
      </Modal>
    </div>
  );
}
