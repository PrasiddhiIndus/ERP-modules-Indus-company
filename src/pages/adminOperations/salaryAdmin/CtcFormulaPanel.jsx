import React, { useEffect, useMemo, useState } from "react";
import { Modal } from "../components/AdminUi";
import { formatINR } from "./salaryData";
import {
  CTC_FORMULA_LINES,
  canonFormula,
  previewFormulaValues,
  standardFormulas,
  validateProfileFormula,
} from "./ctcProfileFormulas";

function FormulaColumn({ title, children }) {
  return (
    <div className="min-w-0">
      <p className="md:hidden text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-muted mb-1">
        {title}
      </p>
      {children}
    </div>
  );
}

export default function CtcFormulaPanel({
  open,
  onClose,
  employeeName,
  structure,
  savedOverrides,
  modes,
  canEdit,
  saving,
  onSave,
}) {
  const standard = useMemo(() => standardFormulas(structure || {}), [structure]);
  const [draft, setDraft] = useState({});
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!open) return;
    const next = {};
    for (const line of CTC_FORMULA_LINES) {
      if (line.locked) continue;
      next[line.code] = savedOverrides?.[line.code] || standard[line.code] || "";
    }
    setDraft(next);
    setErrors({});
  }, [open, savedOverrides, standard]);

  const preview = useMemo(() => {
    if (!structure?.declared) return null;
    return previewFormulaValues(structure, draft, modes);
  }, [structure, draft, modes]);

  const changedCodes = useMemo(() => {
    const set = new Set();
    for (const line of CTC_FORMULA_LINES) {
      if (line.locked) continue;
      const text = String(draft[line.code] || "").trim();
      if (text && canonFormula(text) !== canonFormula(standard[line.code])) set.add(line.code);
    }
    return set;
  }, [draft, standard]);

  const save = () => {
    const next = {};
    const nextErrors = {};
    for (const line of CTC_FORMULA_LINES) {
      if (line.locked) continue;
      const text = String(draft[line.code] || "").trim();
      if (!text || canonFormula(text) === canonFormula(standard[line.code])) continue;
      const check = validateProfileFormula(text);
      if (!check.ok) nextErrors[line.code] = check.error || "This formula could not be read.";
      else next[line.code] = text;
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    onSave(next);
  };

  const partBlock = (part, title) => {
    const lines = CTC_FORMULA_LINES.filter((line) => line.part === part);
    return (
      <section key={part} className="space-y-2">
        <h3 className="text-sm font-semibold text-ink-strong">{title}</h3>
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="hidden md:grid grid-cols-[9.5rem_1fr_1fr_6.5rem] gap-3 px-3 py-2 bg-surface-sunken text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
            <span>Component</span>
            <span>Current formula</span>
            <span>New formula</span>
            <span className="text-right">Monthly</span>
          </div>
          {lines.map((line) => {
            const changed = changedCodes.has(line.code);
            const monthly = preview ? preview[line.code] : null;
            return (
              <div
                key={line.code}
                className={`grid grid-cols-1 md:grid-cols-[9.5rem_1fr_1fr_6.5rem] gap-2 md:gap-3 px-3 py-3 border-t border-divider ${
                  changed ? "bg-emerald-50" : "bg-white"
                }`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-strong">{line.name}</p>
                  {line.note ? <p className="mt-0.5 text-[11px] text-ink-muted">{line.note}</p> : null}
                </div>
                <FormulaColumn title="Current formula">
                  <div className="min-h-9 rounded-md border border-border bg-surface-sunken px-2.5 py-2 text-[12px] font-mono text-ink-secondary break-words">
                    {standard[line.code]}
                  </div>
                </FormulaColumn>
                <FormulaColumn title="New formula">
                  {line.locked ? (
                    <div className="min-h-9 rounded-md border border-dashed border-border px-2.5 py-2 text-[12px] text-ink-muted">
                      Uses the amount entered on the CTC sheet
                    </div>
                  ) : (
                    <>
                      <input
                        value={draft[line.code] || ""}
                        disabled={!canEdit || saving}
                        onChange={(e) =>
                          setDraft((cur) => ({ ...cur, [line.code]: e.target.value }))
                        }
                        aria-label={`New formula for ${line.name}`}
                        className="w-full h-9 rounded-md border border-border-strong bg-white px-2.5 text-[12px] font-mono text-ink focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500 disabled:bg-surface-sunken"
                      />
                      {errors[line.code] ? (
                        <p className="mt-1 text-[11px] text-red-700">{errors[line.code]}</p>
                      ) : null}
                    </>
                  )}
                </FormulaColumn>
                <div className="md:text-right">
                  <p className="md:hidden text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
                    Monthly
                  </p>
                  <p className={`text-sm font-semibold ${changed ? "text-emerald-800" : "text-ink-strong"}`}>
                    {structure?.declared ? formatINR(monthly) : "—"}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  };

  return (
    <Modal
      open={open}
      title={`CTC formulas${employeeName ? ` · ${employeeName}` : ""}`}
      onClose={onClose}
      widthClass="max-w-6xl"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            disabled={!canEdit || saving || !Object.keys(savedOverrides || {}).length}
            onClick={() => onSave({})}
            className="h-9 px-3 rounded-md border border-border-strong bg-white text-xs font-medium text-ink hover:bg-row-hover disabled:opacity-40"
          >
            Use standard formulas
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-3 rounded-md border border-border-strong bg-white text-xs font-medium text-ink hover:bg-row-hover"
            >
              Close
            </button>
            <button
              type="button"
              disabled={!canEdit || saving}
              onClick={save}
              className="h-9 px-4 rounded-md bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save formula"}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <p className="text-xs text-ink-secondary leading-relaxed">
          The current company formula is on the left. Type a new formula on the right and save it
          for this profile only. The CTC sheet recalculates from the new formula. Bank accounts,
          attendance, and other employees stay unchanged. Save CTC when the new amounts should be
          kept on the salary record.
        </p>
        <p className="text-[11px] text-ink-muted">
          Use component names such as GROSS, BAS, and HRA. You can use MAX, MIN, IF, and % —
          for example <span className="font-mono">BAS * 40%</span> or{" "}
          <span className="font-mono">MAX(GROSS * 50%, 15000)</span>.
        </p>
        {partBlock("A", "Part A — Gross and take home")}
        {partBlock("B", "Part B — Employer cost")}
      </div>
    </Modal>
  );
}
