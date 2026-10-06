import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Columns3, Download, Eye, GitCompare, PencilLine, Printer, X } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import toast from "../../../lib/toast";
import { employmentTypeLabel } from "../../../utils/employeeMasterReminders";
import {
  CollapsibleHelp,
  DenseTable,
  Drawer,
  InlineAlert,
  Modal,
  SectionCard,
  StatusChip,
  TinyInput,
  TinySelect,
} from "../components/AdminUi";
import {
  ANNEXURE_ROWS,
  CATEGORY_EXISTING_CONFIRMED,
  CATEGORY_NEW_JOINER_NEW_SCHEME,
  CATEGORY_NEW_PROBATION,
  CATEGORY_PROBATION_TO_CONFIRMED,
  DEDUCTION_KEYS,
  INPUT_CTC,
  PART_A_KEYS,
  PART_B_KEYS,
  RETAIN_CTC,
  RETAIN_GROSS,
  SCHEME_NEW,
  SCHEME_OLD,
  SKILL_SEMI,
  SKILL_SKILLED,
  STATUS_CONFIRMED,
  STATUS_PROBATION,
  applyComponentOverrides,
  calculateConfirmation,
  calculateCtc,
  findOverlappingRecord,
  minimumValidGross,
  resolveCategory,
  roundRupee,
  schemeLabel,
  validateCustomOverride,
} from "./ctcEngine";
import { fetchRuleVersions, findRuleVersionById, resolveRuleVersion } from "./payrollRulesDb";
import { dbReviseSalaryStructure, dbSaveSalaryStructure } from "./salaryDb";
import { MASKED_SECRET, salaryFiguresHidden } from "./salaryPrivacy";
import { getSalaryStructure } from "./salaryData";
import { listMonthRuns } from "./salaryMonthProcessing";
import {
  CATEGORY_OPTIONS,
  REVISION_TYPE_OPTIONS,
  buildCtcHistory,
  historyRowSummary,
  isAnnexureRecord,
  recordToComponents,
  resultToStructurePayload,
  skillLabel,
  statusLabel,
} from "./annexureCtcRecord";
import { printAnnexure } from "./annexurePrint";
import { exportCtcDetailsExcel } from "./annexureCtcExcel";

const COMPONENT_LABELS = {
  basic: "Basic",
  hra: "HRA",
  conveyance: "Conveyance Allowance",
  bonus: "Advance Against Statutory Bonus",
  medical: "Medical Allowance",
  special: "Special Allowance",
  ee_pf: "Employee PF",
  pt: "P.Tax",
  ee_esic: "Employee ESIC",
  er_pf: "Employer PF",
  er_esic: "Employer ESIC",
  mediclaim: "Mediclaim",
  leave_encashment: "Leave Encashment",
  gratuity: "Gratuity",
  ex_gratia: "Ex Gratia",
};

const CUSTOM_GROUPS = [
  { title: "Part A (Gross)", keys: PART_A_KEYS },
  { title: "Deductions", keys: DEDUCTION_KEYS },
  { title: "Part B (employer cost)", keys: PART_B_KEYS },
];

function money(v) {
  if (salaryFiguresHidden()) return v == null || !Number.isFinite(Number(v)) ? "—" : MASKED_SECRET;
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return roundRupee(v).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function signedMoney(v) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  const r = roundRupee(v);
  return `${r > 0 ? "+" : ""}${money(r)}`;
}

function fmtDate(d) {
  const s = String(d || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "—";
  const [y, m, day] = s.split("-");
  return `${day}-${m}-${y}`;
}

function toDay(d) {
  const s = String(d || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseAmount(v) {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseEntered(v) {
  if (v == null || String(v).trim() === "") return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const ENTRY_CALCULATE = "calculate";
const ENTRY_MANUAL = "manual";
const STAT_KEYS = [...DEDUCTION_KEYS, ...PART_B_KEYS];

/** Part A amounts plus any deduction / Part B values that were set by hand. */
function manualSeed(values, statOverrides) {
  const out = {};
  for (const k of PART_A_KEYS) {
    const v = Number(values?.[k]);
    if (Number.isFinite(v) && v > 0) out[k] = String(roundRupee(v));
  }
  for (const k of STAT_KEYS) {
    const v = statOverrides?.[k];
    if (v != null && v !== "" && Number.isFinite(Number(v))) out[k] = String(roundRupee(v));
  }
  return out;
}

function validationSeverity(v) {
  if (!v) return "neutral";
  if (v.level === "error") return "critical";
  if (v.level === "warning") return "warning";
  return "info";
}

function emptyForm(employee) {
  const confirmed =
    Boolean(employee?.confirmation_date) && toDay(employee.confirmation_date) <= todayIso();
  return {
    skill: SKILL_SKILLED,
    category: confirmed ? CATEGORY_EXISTING_CONFIRMED : CATEGORY_NEW_PROBATION,
    scheme: SCHEME_OLD,
    ctc: "",
    gross: "",
    wef: todayIso(),
    revisionType: "initial",
    reason: "",
    retain: RETAIN_GROSS,
    schemeAfter: "same",
    confirmationDate: toDay(employee?.confirmation_date),
    overrides: {},
    overrideReason: "",
    entryMode: ENTRY_CALCULATE,
    manual: {},
  };
}

function formFromRecord(record, employee) {
  const base = emptyForm(employee);
  if (!record?.declared) return base;
  if (!isAnnexureRecord(record)) {
    return { ...base, gross: record.gross_monthly ? String(roundRupee(record.gross_monthly)) : "", revisionType: "increment" };
  }
  const byCtc = record.input_basis === INPUT_CTC;
  return {
    ...base,
    skill: record.skill_category || SKILL_SKILLED,
    category:
      record.employee_status === STATUS_CONFIRMED ? CATEGORY_EXISTING_CONFIRMED : record.employee_category || CATEGORY_NEW_PROBATION,
    scheme: record.salary_scheme || SCHEME_OLD,
    ctc: byCtc ? String(roundRupee(record.ctc_monthly)) : "",
    gross: byCtc ? "" : String(roundRupee(record.gross_monthly)),
    revisionType: "increment",
    entryMode: record.is_custom ? ENTRY_MANUAL : ENTRY_CALCULATE,
    manual: record.is_custom ? manualSeed(recordToComponents(record), record.custom_overrides_json) : {},
  };
}

/** Annexure-I table. `groups` = [{ title, values }]; optional change column. */
function AnnexureTable({ groups, change, highlightCustom }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full text-xs">
        <thead className="bg-gray-50 text-gray-600">
          {groups.length > 1 || change ? (
            <tr>
              <th className="px-2 py-1.5 text-left" rowSpan={2}>
                Particulars
              </th>
              {groups.map((g) => (
                <th key={g.title} colSpan={2} className="px-2 py-1.5 text-center border-l border-gray-200">
                  {g.title}
                </th>
              ))}
              {change ? (
                <th rowSpan={2} className="px-2 py-1.5 text-right border-l border-gray-200">
                  {change.title}
                </th>
              ) : null}
            </tr>
          ) : null}
          <tr>
            {groups.length > 1 || change ? null : <th className="px-2 py-1.5 text-left">Particulars</th>}
            {groups.map((g) => (
              <React.Fragment key={g.title}>
                <th className="px-2 py-1.5 text-right border-l border-gray-200">Monthly</th>
                <th className="px-2 py-1.5 text-right">P.A.</th>
              </React.Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {ANNEXURE_ROWS.map((row) => {
            if (row.heading) {
              return (
                <tr key={row.label} className="bg-gray-50">
                  <td
                    colSpan={1 + groups.length * 2 + (change ? 1 : 0)}
                    className="px-2 py-1 font-semibold text-gray-700"
                  >
                    {row.label}
                  </td>
                </tr>
              );
            }
            return (
              <tr key={row.key} className={row.total ? "bg-slate-50 font-semibold" : "border-t border-gray-100"}>
                <td className="px-2 py-1 text-gray-800 whitespace-nowrap">
                  {row.label}
                  {highlightCustom?.[row.key] != null ? (
                    <span className="ml-1.5 text-[10px] font-semibold text-amber-700">
                      Custom · system ₹{money(highlightCustom[row.key])}
                    </span>
                  ) : null}
                </td>
                {groups.map((g) => {
                  const v = g.values?.[row.key];
                  return (
                    <React.Fragment key={g.title}>
                      <td className="px-2 py-1 text-right tabular-nums border-l border-gray-100">{money(v)}</td>
                      <td className="px-2 py-1 text-right tabular-nums text-gray-600">
                        {v == null ? "—" : money(v * 12)}
                      </td>
                    </React.Fragment>
                  );
                })}
                {change ? (
                  <td className="px-2 py-1 text-right tabular-nums border-l border-gray-100">
                    {signedMoney(change.values?.[row.key])}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function diffValues(a, b) {
  const out = {};
  for (const row of ANNEXURE_ROWS) {
    if (row.key) out[row.key] = (Number(b?.[row.key]) || 0) - (Number(a?.[row.key]) || 0);
  }
  return out;
}

/**
 * Direct entry of one employee's components. Part A left blank counts as 0; a blank deduction or
 * Part B line keeps its normal calculation from Basic. Totals are shown, never entered.
 */
function ManualComponentEntry({ values, onChange, result, reason, onReasonChange }) {
  const totals = [
    { label: "Gross (Part A)", value: result?.gross },
    { label: "Take Home", value: result?.take_home },
    { label: "Total B", value: result?.total_b },
    { label: "CTC", value: result?.ctc },
  ];
  return (
    <div className="space-y-3 rounded-lg border border-gray-200 p-2.5">
      <p className="text-[11px] text-ink-muted">
        Type this employee&apos;s monthly amounts. Gross is the sum of Part A. Leave a deduction or Part B line
        blank to calculate it from Basic as usual.
      </p>
      {CUSTOM_GROUPS.map((group) => {
        const isPartA = group.keys === PART_A_KEYS;
        return (
          <div key={group.title} className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{group.title}</p>
            {group.keys.map((key) => {
              const calculated = !isPartA ? result?.system_reference?.[key] : null;
              return (
                <label key={key} className="flex items-center justify-between gap-2">
                  <span className="text-ink-secondary">
                    {COMPONENT_LABELS[key]}
                    {calculated != null ? (
                      <span className="block text-[10px] text-ink-muted">Calculated ₹{money(calculated)}</span>
                    ) : null}
                  </span>
                  <TinyInput
                    type="number"
                    step="1"
                    min="0"
                    className="w-28 text-right tabular-nums"
                    value={values[key] ?? ""}
                    placeholder={isPartA ? "0" : calculated != null ? money(calculated) : "Auto"}
                    onChange={(e) => onChange(key, e.target.value)}
                  />
                </label>
              );
            })}
          </div>
        );
      })}
      <div className="grid grid-cols-2 gap-2 rounded-md bg-gray-50 p-2">
        {totals.map((t) => (
          <Fact key={t.label} label={t.label}>
            {t.value != null ? `₹${money(t.value)}` : "—"}
          </Fact>
        ))}
      </div>
      <label className="block">
        <span className="text-ink-secondary">Reason for custom values (required)</span>
        <TinyInput className="mt-1 w-full" value={reason} onChange={(e) => onReasonChange(e.target.value)} />
      </label>
    </div>
  );
}

function Fact({ label, children }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="text-xs text-ink font-medium truncate">{children || "—"}</p>
    </div>
  );
}

/**
 * Employee Master → CTC Details (Compensation Scheme / Annexure-I).
 */
export default function AnnexureCtcPanel({ employee, onEmployeeUpdated }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [structure, setStructure] = useState(null);
  const [ruleVersions, setRuleVersions] = useState([]);
  const [processedMonths, setProcessedMonths] = useState(() => new Set());
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => emptyForm(employee));
  const [saving, setSaving] = useState(false);
  const [matrixOpen, setMatrixOpen] = useState(false);
  const [viewRow, setViewRow] = useState(null);
  const [compareRow, setCompareRow] = useState(null);

  const segment = employmentTypeLabel(employee?.employment_type) || "—";

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [s, versions, runs] = await Promise.all([
        getSalaryStructure(employee.id),
        fetchRuleVersions(),
        listMonthRuns().catch(() => []),
      ]);
      setStructure(s?.declared ? s : null);
      setRuleVersions(versions);
      setProcessedMonths(
        new Set((runs || []).filter((r) => r.status === "processed").map((r) => String(r.month_key)))
      );
    } catch (err) {
      console.error("CTC details: load failed", err);
      setLoadError("Could not load CTC details. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [employee.id]);

  useEffect(() => {
    load();
  }, [load]);

  const history = useMemo(() => buildCtcHistory(structure).map(historyRowSummary), [structure]);
  const current = structure?.declared ? structure : null;
  const currentIsAnnexure = isAnnexureRecord(current);

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const startEdit = () => {
    const next = formFromRecord(current, employee);
    if (!current) next.revisionType = "initial";
    setForm(next);
    setEditing(true);
  };

  // ── Live calculation ────────────────────────────────────────────────────
  const isConfirmationFlow = form.category === CATEGORY_PROBATION_TO_CONFIRMED;
  const isManual = !isConfirmationFlow && form.entryMode === ENTRY_MANUAL;
  const resolved = resolveCategory(form.category, form.scheme, form.schemeAfter);
  const confirmationWef = isConfirmationFlow ? toDay(form.confirmationDate) : "";

  const calc = useMemo(() => {
    if (isManual) {
      const entered = {};
      for (const k of PART_A_KEYS) entered[k] = roundRupee(parseEntered(form.manual[k]) ?? 0);
      for (const k of STAT_KEYS) {
        const v = parseEntered(form.manual[k]);
        if (v != null) entered[k] = v;
      }
      const gross = PART_A_KEYS.reduce((s, k) => s + entered[k], 0);
      if (!(gross > 0)) return { empty: true };
      const versionBefore = resolveRuleVersion(ruleVersions, resolved.scheme, form.wef);
      if (!versionBefore) return { error: "Payroll rules are not set up for this scheme." };
      try {
        const base = calculateCtc(versionBefore.rules, {
          skill: form.skill,
          status: resolved.status,
          monthlyGross: gross,
        });
        const final = applyComponentOverrides(versionBefore.rules, base, entered);
        return { base, final, versionBefore };
      } catch (err) {
        return { error: err?.message || "Could not calculate." };
      }
    }
    const gross = parseAmount(form.gross);
    const ctc = parseAmount(form.ctc);
    if (!gross && !ctc) return { empty: true };
    const versionBefore = resolveRuleVersion(ruleVersions, resolved.scheme, form.wef);
    if (!versionBefore) return { error: "Payroll rules are not set up for this scheme." };
    try {
      if (isConfirmationFlow) {
        const versionAfter = resolveRuleVersion(
          ruleVersions,
          resolved.schemeAfter,
          confirmationWef || form.wef
        );
        if (!versionAfter) return { error: "Payroll rules are not set up for the scheme after confirmation." };
        const out = calculateConfirmation({
          rulesBefore: versionBefore.rules,
          rulesAfter: versionAfter.rules,
          skill: form.skill,
          monthlyGross: gross,
          monthlyCtc: ctc,
          retain: form.retain,
        });
        return { confirmation: out, versionBefore, versionAfter, final: out.after };
      }
      const base = calculateCtc(versionBefore.rules, {
        skill: form.skill,
        status: resolved.status,
        monthlyGross: gross,
        monthlyCtc: ctc,
      });
      const final = applyComponentOverrides(versionBefore.rules, base, form.overrides);
      return { base, final, versionBefore };
    } catch (err) {
      return { error: err?.message || "Could not calculate." };
    }
  }, [form, ruleVersions, resolved.scheme, resolved.schemeAfter, resolved.status, isConfirmationFlow, isManual, confirmationWef]);

  const setEntryMode = (mode) => {
    setForm((f) => {
      if (mode !== ENTRY_MANUAL || Object.keys(f.manual).length) return { ...f, entryMode: mode };
      let manual = {};
      if (calc.final && !calc.empty) {
        const stat = {};
        for (const k of STAT_KEYS) if (calc.final.overrides?.[k] != null) stat[k] = calc.final.overrides[k];
        manual = manualSeed(calc.final, stat);
      } else if (currentIsAnnexure) {
        manual = manualSeed(recordToComponents(current), current.is_custom ? current.custom_overrides_json : null);
      }
      return { ...f, entryMode: mode, manual };
    });
  };

  const setManualValue = (key, value) =>
    setForm((f) => {
      const manual = { ...f.manual };
      if (value === "") delete manual[key];
      else manual[key] = value;
      return { ...f, manual };
    });

  const previousValues = current ? recordToComponents(current) : null;
  const backdatedMonth = useMemo(() => {
    const keys = [toDay(form.wef), confirmationWef].filter(Boolean).map((d) => d.slice(0, 7));
    return keys.find((k) => processedMonths.has(k)) || null;
  }, [form.wef, confirmationWef, processedMonths]);

  const existingRecords = useMemo(
    () =>
      history.map((h) => ({
        id: h.key,
        effective_from: h.effective_from,
        effective_to: h.current ? null : h.effective_to,
      })),
    [history]
  );

  // ── Save ────────────────────────────────────────────────────────────────
  const save = async () => {
    if (salaryFiguresHidden()) {
      toast.error("Not saved", "CTC revision is not saved for this login.");
      return;
    }
    const wef = toDay(form.wef);
    if (!wef) return toast.error("W.E.F. required", "Pick the Effective From date.");
    if (calc.empty) {
      return toast.error(
        "Amount required",
        isManual ? "Enter the component amounts." : "Enter Monthly CTC or Monthly Gross."
      );
    }
    if (calc.error) return toast.error("Cannot save", calc.error);

    const checks = isConfirmationFlow ? [calc.confirmation.before, calc.confirmation.after] : [calc.final];
    const blocked = checks.find((r) => r.validation.blocksSave);
    if (blocked) return toast.error("Cannot save", blocked.validation.message);

    if (!isConfirmationFlow) {
      const custom = validateCustomOverride({ overrides: calc.final.overrides, reason: form.overrideReason });
      if (!custom.ok) return toast.error("Reason required", custom.message);
    }

    const reuseProbation =
      isConfirmationFlow &&
      currentIsAnnexure &&
      current.employee_status === STATUS_PROBATION;

    if (isConfirmationFlow) {
      if (!confirmationWef) return toast.error("Confirmation date required", "Enter the confirmation date.");
      const probationFrom = reuseProbation ? toDay(current.wef_date) : wef;
      if (confirmationWef <= probationFrom) {
        return toast.error("Check dates", "Confirmation date must be after the probation W.E.F. date.");
      }
    }

    const firstFrom = isConfirmationFlow && reuseProbation ? confirmationWef : wef;
    const overlap = findOverlappingRecord(existingRecords, { effective_from: firstFrom });
    if (overlap) return toast.error("Dates overlap", overlap.message);

    if (backdatedMonth) {
      const ok = window.confirm(
        `Salary for ${backdatedMonth} is already processed. This revision is back-dated; the difference is not paid automatically and must be adjusted in Salary Processing. Continue?`
      );
      if (!ok) return;
    }

    setSaving(true);
    try {
      const reason = [form.reason.trim(), calc.final?.is_custom ? `Custom: ${form.overrideReason.trim()}` : ""]
        .filter(Boolean)
        .join(" · ");
      let hasRecord = Boolean(current);
      const write = async (payload, wefDate) => {
        const meta = { wef_date: wefDate, reason: payload.revision_reason };
        if (hasRecord) await dbReviseSalaryStructure(employee.id, payload, meta);
        else await dbSaveSalaryStructure(employee.id, payload);
        hasRecord = true;
      };

      if (isConfirmationFlow) {
        const { before, after } = calc.confirmation;
        if (!reuseProbation) {
          await write(
            resultToStructurePayload(before, {
              rules: calc.versionBefore.rules,
              ruleVersionId: calc.versionBefore.id,
              scheme: resolved.scheme,
              category: CATEGORY_PROBATION_TO_CONFIRMED,
              revisionType: current ? form.revisionType : "initial",
              wefDate: wef,
              reason: reason || "Probation structure",
              employee,
            }),
            wef
          );
        }
        await write(
          resultToStructurePayload(after, {
            rules: calc.versionAfter.rules,
            ruleVersionId: calc.versionAfter.id,
            scheme: resolved.schemeAfter,
            category: CATEGORY_PROBATION_TO_CONFIRMED,
            revisionType: "confirmation",
            wefDate: confirmationWef,
            reason: reason || `Confirmation (${form.retain === RETAIN_CTC ? "Retain CTC" : "Retain Gross"})`,
            employee,
          }),
          confirmationWef
        );
        if (!toDay(employee.confirmation_date)) {
          const { data, error } = await supabase
            .from("admin_ifsp_employee_master")
            .update({ confirmation_date: confirmationWef })
            .eq("id", employee.id)
            .select("*")
            .maybeSingle();
          if (error) console.warn("CTC details: confirmation date not saved on employee", error);
          else if (data) onEmployeeUpdated?.(data);
        }
      } else {
        await write(
          resultToStructurePayload(calc.final, {
            rules: calc.versionBefore.rules,
            ruleVersionId: calc.versionBefore.id,
            scheme: resolved.scheme,
            category: form.category,
            revisionType: current ? form.revisionType : "initial",
            wefDate: wef,
            reason,
            employee,
          }),
          wef
        );
      }
      toast.success("CTC saved", "The new salary structure is in effect from the W.E.F. date.");
      setEditing(false);
      await load();
    } catch (err) {
      console.error("CTC details: save failed", err);
      const msg = /permission|row-level|42501/i.test(`${err?.message || ""} ${err?.code || ""}`)
        ? "You do not have access to change salary records."
        : err?.message || "Please try again.";
      toast.error("Could not save CTC", msg);
    } finally {
      setSaving(false);
    }
  };

  const ruleVersionFor = (row) =>
    findRuleVersionById(ruleVersions, row?.rule_version_id) ||
    resolveRuleVersion(ruleVersions, row?.salary_scheme || SCHEME_OLD, row?.wef_date);

  const print = (row, { previous = null, internal = false } = {}) => {
    if (salaryFiguresHidden()) return;
    printAnnexure({
      employee,
      record: row,
      previous,
      ruleVersion: ruleVersionFor(row),
      segment,
      internal,
    });
  };

  const exportExcel = async () => {
    if (salaryFiguresHidden() || !current) return;
    try {
      await exportCtcDetailsExcel({ employee, record: current, segment, ruleVersion: ruleVersionFor(current) });
    } catch (err) {
      console.error("CTC details: export failed", err);
      toast.error("Could not export", "Please try again.");
    }
  };

  const previousOf = (key) => {
    const idx = history.findIndex((h) => h.key === key);
    return idx >= 0 ? history[idx + 1] || null : null;
  };

  // ── Render ──────────────────────────────────────────────────────────────
  if (loading) {
    return <div className="p-6 text-sm text-ink-muted">Loading CTC details…</div>;
  }

  const final = calc.final;
  const validation = isConfirmationFlow
    ? calc.confirmation?.before?.validation?.blocksSave
      ? calc.confirmation.before.validation
      : calc.confirmation?.after?.validation
    : final?.validation;

  const historyColumns = [
    { key: "from", label: "From", render: (r) => fmtDate(r.effective_from) },
    {
      key: "to",
      label: "To",
      render: (r) => (r.current ? "Current" : r.row.replaced ? "Replaced" : fmtDate(r.effective_to)),
    },
    { key: "type", label: "Type", render: (r) => r.revision_type },
    { key: "gross", label: "Gross", cellClassName: "text-right tabular-nums", render: (r) => money(r.gross) },
    { key: "ctc", label: "CTC", cellClassName: "text-right tabular-nums", render: (r) => money(r.ctc) },
    { key: "th", label: "Take Home", cellClassName: "text-right tabular-nums", render: (r) => money(r.take_home) },
    {
      key: "status",
      label: "Status",
      render: (r) => (
        <span className="inline-flex items-center gap-1">
          {r.status}
          {r.is_custom ? <StatusChip label="Custom" severity="warning" /> : null}
        </span>
      ),
    },
    { key: "scheme", label: "Scheme", render: (r) => r.scheme },
    {
      key: "actions",
      label: "",
      render: (r) => (
        <span className="inline-flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <button type="button" title="View" className="text-accent" onClick={() => setViewRow(r)}>
            <Eye className="h-3.5 w-3.5" />
          </button>
          {r.annexure ? (
            <button type="button" title="Print Annexure" className="text-accent" onClick={() => print(r.row)}>
              <Printer className="h-3.5 w-3.5" />
            </button>
          ) : null}
          {previousOf(r.key) ? (
            <button type="button" title="Compare with previous" className="text-accent" onClick={() => setCompareRow(r)}>
              <GitCompare className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4 p-4">
      {loadError ? <InlineAlert tone="error">{loadError}</InlineAlert> : null}

      <SectionCard
        title="Employee"
        right={
          !editing ? (
            <div className="flex items-center gap-2">
              {currentIsAnnexure ? (
                <button
                  type="button"
                  onClick={() => {
                    if (salaryFiguresHidden()) return;
                    print(current);
                  }}
                  disabled={salaryFiguresHidden()}
                  className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs ${
                    salaryFiguresHidden()
                      ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                      : "border-border bg-white"
                  }`}
                >
                  <Printer className="h-3.5 w-3.5" /> Print Annexure
                </button>
              ) : null}
              {current ? (
                <button
                  type="button"
                  onClick={exportExcel}
                  disabled={salaryFiguresHidden()}
                  className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs ${
                    salaryFiguresHidden()
                      ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                      : "border-border bg-white"
                  }`}
                >
                  <Download className="h-3.5 w-3.5" /> Export CTC Details
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  if (salaryFiguresHidden()) return;
                  startEdit();
                }}
                disabled={salaryFiguresHidden()}
                title={salaryFiguresHidden() ? "Revision is not available for this login" : undefined}
                className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium ${
                  salaryFiguresHidden()
                    ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                    : "bg-accent text-white hover:bg-accent-deep"
                }`}
              >
                <PencilLine className="h-3.5 w-3.5" />
                {current ? "New revision" : "Create CTC"}
              </button>
            </div>
          ) : null
        }
      >
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Fact label="Location">{employee.location}</Fact>
          <Fact label="Employee Code">{employee.employee_code || employee.employee_id}</Fact>
          <Fact label="Employee Name">{employee.full_name}</Fact>
          <Fact label="Department">{employee.department}</Fact>
          <Fact label="Designation">{employee.designation}</Fact>
          <Fact label="Segment">{segment}</Fact>
          <Fact label="DOB">{fmtDate(employee.date_of_birth)}</Fact>
          <Fact label="DOJ">{fmtDate(employee.date_of_joining)}</Fact>
          <Fact label="Confirmation Date">{fmtDate(employee.confirmation_date)}</Fact>
        </div>
      </SectionCard>

      {!editing ? (
        current ? (
          <SectionCard
            title="Current CTC"
            right={
              currentIsAnnexure ? (
                <div className="flex items-center gap-2">
                  <StatusChip label={statusLabel(current.employee_status)} severity="info" />
                  <StatusChip label={schemeLabel(current.salary_scheme)} severity="neutral" />
                  {current.salary_band ? <StatusChip label={`Band ${current.salary_band}`} severity="neutral" /> : null}
                  {current.is_custom ? <StatusChip label="Custom" severity="warning" /> : null}
                </div>
              ) : (
                <StatusChip label="Earlier structure" severity="warning" />
              )
            }
          >
            {currentIsAnnexure ? (
              <div className="space-y-2">
                <p className="text-xs text-ink-secondary">
                  W.E.F. {fmtDate(current.wef_date)} · {skillLabel(current.skill_category)}
                  {current.revision_reason ? ` · ${current.revision_reason}` : ""}
                </p>
                <AnnexureTable
                  groups={[{ title: "Current", values: recordToComponents(current) }]}
                  highlightCustom={current.is_custom ? current.system_values_json : null}
                />
              </div>
            ) : (
              <div className="space-y-2 text-xs">
                <p className="text-ink-secondary">
                  This employee&apos;s CTC (W.E.F. {fmtDate(current.wef_date)}) uses the earlier salary structure.
                  Create a new revision to move them to the Compensation Scheme.
                </p>
                <div className="grid grid-cols-3 gap-3 max-w-md">
                  <Fact label="Gross / month">₹{money(current.gross_monthly)}</Fact>
                  <Fact label="Take Home / month">₹{money(current.take_home_monthly)}</Fact>
                  <Fact label="CTC / month">₹{money(current.ctc_monthly)}</Fact>
                </div>
              </div>
            )}
          </SectionCard>
        ) : (
          <SectionCard title="No CTC yet">
            <p className="text-xs text-ink-secondary">Create the CTC to generate the salary breakup (Annexure-I).</p>
          </SectionCard>
        )
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[340px_1fr] gap-4">
          <SectionCard
            title={current ? "New revision" : "Create CTC"}
            right={
              <button type="button" className="text-ink-muted hover:text-ink" onClick={() => setEditing(false)} title="Cancel">
                <X className="h-4 w-4" />
              </button>
            }
          >
            <div className="space-y-3 text-xs">
              <label className="block">
                <span className="text-ink-secondary">Skill Category</span>
                <TinySelect className="mt-1 w-full" value={form.skill} onChange={(e) => setField("skill", e.target.value)}>
                  <option value={SKILL_SKILLED}>Skilled</option>
                  <option value={SKILL_SEMI}>Semi-skilled</option>
                </TinySelect>
              </label>
              <label className="block">
                <span className="text-ink-secondary">Employee Category</span>
                <TinySelect
                  className="mt-1 w-full"
                  value={form.category}
                  onChange={(e) => {
                    const category = e.target.value;
                    setForm((f) => ({
                      ...f,
                      category,
                      scheme: category === CATEGORY_NEW_JOINER_NEW_SCHEME ? SCHEME_NEW : f.scheme,
                      revisionType:
                        category === CATEGORY_PROBATION_TO_CONFIRMED && current ? "confirmation" : f.revisionType,
                      overrides: category === CATEGORY_PROBATION_TO_CONFIRMED ? {} : f.overrides,
                    }));
                  }}
                >
                  {CATEGORY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </TinySelect>
              </label>
              <label className="block">
                <span className="text-ink-secondary">Salary Scheme</span>
                <TinySelect
                  className="mt-1 w-full"
                  value={resolved.scheme}
                  disabled={resolved.schemeLocked}
                  onChange={(e) => setField("scheme", e.target.value)}
                >
                  <option value={SCHEME_OLD}>Old Scheme</option>
                  <option value={SCHEME_NEW}>New Scheme</option>
                </TinySelect>
                {resolved.schemeLocked ? (
                  <span className="block mt-1 text-[11px] text-ink-muted">New joiners are always on the New Scheme.</span>
                ) : null}
              </label>
              {!isConfirmationFlow ? (
                <div className="block">
                  <span className="text-ink-secondary">Entry method</span>
                  <div className="mt-1 grid grid-cols-2 gap-1 rounded-lg border border-gray-200 p-0.5">
                    {[
                      { id: ENTRY_CALCULATE, label: "Calculate from CTC / Gross" },
                      { id: ENTRY_MANUAL, label: "Enter each component" },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setEntryMode(opt.id)}
                        className={`rounded-md px-2 py-1.5 text-[11px] font-medium ${
                          (isManual ? ENTRY_MANUAL : ENTRY_CALCULATE) === opt.id
                            ? "bg-accent text-white"
                            : "text-ink-secondary hover:bg-gray-50"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {isManual ? (
                <ManualComponentEntry
                  values={form.manual}
                  onChange={setManualValue}
                  result={calc.final && !calc.empty && !calc.error ? calc.final : null}
                  reason={form.overrideReason}
                  onReasonChange={(v) => setField("overrideReason", v)}
                />
              ) : (
                <>
                  <label className="block">
                    <span className="text-ink-secondary">Monthly CTC (₹)</span>
                    <TinyInput
                      type="number"
                      step="any"
                      className="mt-1 w-full text-right tabular-nums"
                      value={form.ctc}
                      onChange={(e) => setField("ctc", e.target.value)}
                    />
                  </label>
                  <label className="block">
                    <span className="text-ink-secondary">Monthly Gross (₹) — optional</span>
                    <TinyInput
                      type="number"
                      step="any"
                      className="mt-1 w-full text-right tabular-nums"
                      value={form.gross}
                      onChange={(e) => setField("gross", e.target.value)}
                    />
                    <span className="block mt-1 text-[11px] text-ink-muted">
                      If Gross is filled it overrides CTC; clear it to use CTC.
                    </span>
                  </label>
                </>
              )}
              <label className="block">
                <span className="text-ink-secondary">
                  {isConfirmationFlow ? "Probation W.E.F." : "W.E.F. / Effective From"}
                </span>
                <div className="mt-1">
                  <TinyInput type="date" value={form.wef} onChange={(e) => setField("wef", e?.target?.value || "")} />
                </div>
              </label>

              {isConfirmationFlow ? (
                <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-2.5 space-y-2.5">
                  <label className="block">
                    <span className="text-ink-secondary">On Confirmation</span>
                    <TinySelect className="mt-1 w-full" value={form.retain} onChange={(e) => setField("retain", e.target.value)}>
                      <option value={RETAIN_GROSS}>Retain Gross</option>
                      <option value={RETAIN_CTC}>Retain CTC</option>
                    </TinySelect>
                  </label>
                  <label className="block">
                    <span className="text-ink-secondary">Scheme after Confirmation</span>
                    <TinySelect
                      className="mt-1 w-full"
                      value={form.schemeAfter}
                      onChange={(e) => setField("schemeAfter", e.target.value)}
                    >
                      <option value="same">Same as current</option>
                      <option value={SCHEME_OLD}>Old Scheme</option>
                      <option value={SCHEME_NEW}>New Scheme</option>
                    </TinySelect>
                  </label>
                  <label className="block">
                    <span className="text-ink-secondary">Confirmation Date (confirmed structure W.E.F.)</span>
                    <div className="mt-1">
                      <TinyInput
                        type="date"
                        value={form.confirmationDate}
                        onChange={(e) => setField("confirmationDate", e?.target?.value || "")}
                      />
                    </div>
                  </label>
                </div>
              ) : null}

              {current ? (
                <label className="block">
                  <span className="text-ink-secondary">Revision Type</span>
                  <TinySelect
                    className="mt-1 w-full"
                    value={form.revisionType}
                    onChange={(e) => setField("revisionType", e.target.value)}
                  >
                    {REVISION_TYPE_OPTIONS.filter((o) => o.value !== "initial").map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </TinySelect>
                </label>
              ) : null}
              <label className="block">
                <span className="text-ink-secondary">Reason / remarks</span>
                <textarea
                  rows={2}
                  className="mt-1 w-full border border-gray-300 rounded px-2 py-1.5"
                  value={form.reason}
                  onChange={(e) => setField("reason", e.target.value)}
                />
              </label>

              {!isConfirmationFlow && !isManual && calc.base ? (
                <details className="rounded-lg border border-amber-200 bg-amber-50/40 p-2.5">
                  <summary className="cursor-pointer font-medium text-amber-900">Custom component values</summary>
                  <div className="mt-2 space-y-2">
                    <p className="text-[11px] text-amber-900/80">
                      Enter an amount only for the components you want to change, for this employee only. Blank
                      components keep the normal calculation. Totals are not entered: Gross, Take Home, Total B and
                      CTC stay the sum of the components. The record is marked Custom.
                    </p>
                    {CUSTOM_GROUPS.map((group) => (
                      <div key={group.title} className="space-y-1.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-900/70">
                          {group.title}
                        </p>
                        {group.keys.map((key) => {
                          const system = calc.final?.system_reference?.[key] ?? calc.base[key];
                          return (
                            <label key={key} className="flex items-center justify-between gap-2">
                              <span className="text-ink-secondary">
                                {COMPONENT_LABELS[key]}
                                <span className="block text-[10px] text-ink-muted">System ₹{money(system)}</span>
                              </span>
                              <TinyInput
                                type="number"
                                step="1"
                                min="0"
                                className="w-28 text-right tabular-nums"
                                value={form.overrides[key] ?? ""}
                                placeholder={money(system)}
                                onChange={(e) =>
                                  setForm((f) => {
                                    const overrides = { ...f.overrides };
                                    if (e.target.value === "") delete overrides[key];
                                    else overrides[key] = e.target.value;
                                    return { ...f, overrides };
                                  })
                                }
                              />
                            </label>
                          );
                        })}
                      </div>
                    ))}
                    <label className="block">
                      <span className="text-ink-secondary">Reason for custom values (required)</span>
                      <TinyInput
                        className="mt-1 w-full"
                        value={form.overrideReason}
                        onChange={(e) => setField("overrideReason", e.target.value)}
                      />
                    </label>
                  </div>
                </details>
              ) : null}

              {backdatedMonth ? (
                <InlineAlert tone="warning">
                  Salary for {backdatedMonth} is already processed. This revision is back-dated — the difference is
                  not paid automatically.
                </InlineAlert>
              ) : null}

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={save}
                  disabled={saving || Boolean(validation?.blocksSave)}
                  className="h-8 px-4 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-deep disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save CTC"}
                </button>
                <button
                  type="button"
                  onClick={() => setMatrixOpen(true)}
                  disabled={calc.empty || Boolean(calc.error)}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-white text-xs disabled:opacity-50"
                >
                  <Columns3 className="h-3.5 w-3.5" /> Scenario Matrix
                </button>
              </div>
            </div>
          </SectionCard>

          <div className="space-y-4 min-w-0">
            {calc.empty ? (
              <SectionCard title="Annexure-I preview">
                <p className="text-xs text-ink-muted">Enter Monthly CTC or Monthly Gross to see the breakup.</p>
              </SectionCard>
            ) : calc.error ? (
              <InlineAlert tone="error">{calc.error}</InlineAlert>
            ) : (
              <>
                <SectionCard title="Annexure-I preview">
                  {isConfirmationFlow ? (
                    <AnnexureTable
                      groups={[
                        { title: "During Probation", values: calc.confirmation.before },
                        { title: "After Confirmation", values: calc.confirmation.after },
                      ]}
                      change={{ title: "Change / Month", values: calc.confirmation.change }}
                    />
                  ) : previousValues ? (
                    <AnnexureTable
                      groups={[
                        { title: "Previous", values: previousValues },
                        { title: "New", values: final },
                      ]}
                      change={{ title: "Difference / Month", values: diffValues(previousValues, final) }}
                      highlightCustom={final.is_custom ? final.system_values : null}
                    />
                  ) : (
                    <AnnexureTable
                      groups={[{ title: "New", values: final }]}
                      highlightCustom={final.is_custom ? final.system_values : null}
                    />
                  )}
                  {calc.versionBefore?.beforeFirstVersion ? (
                    <p className="mt-2 text-[11px] text-amber-700">
                      The W.E.F. date is earlier than the first payroll rule version; rules from{" "}
                      {fmtDate(calc.versionBefore.effective_from)} are used.
                    </p>
                  ) : null}
                </SectionCard>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <SectionCard title="Result">
                    <div className="grid grid-cols-2 gap-3">
                      <Fact label="Employee Status">
                        {isConfirmationFlow ? "Probation → Confirmed" : statusLabel(resolved.status)}
                      </Fact>
                      <Fact label="Applied Scheme">
                        {isConfirmationFlow && resolved.schemeAfter !== resolved.scheme
                          ? `${schemeLabel(resolved.scheme)} → ${schemeLabel(resolved.schemeAfter)}`
                          : schemeLabel(resolved.scheme)}
                      </Fact>
                      <Fact label="Mediclaim + Leave Enc.">{resolved.benefits}</Fact>
                      <Fact label="Salary Band">
                        {isConfirmationFlow
                          ? `Band ${calc.confirmation.before.band} → Band ${calc.confirmation.after.band}`
                          : `Band ${final.band}`}
                      </Fact>
                    </div>
                    <div className="mt-3">
                      <p className="text-[10px] uppercase tracking-wide text-ink-muted mb-1">Validation</p>
                      <StatusChip label={validation?.label || "—"} severity={validationSeverity(validation)} />
                      <p className="mt-1 text-[11px] text-ink-secondary">{validation?.message}</p>
                      {validation?.blocksSave ? (
                        <p className="mt-1 text-[11px] text-critical">
                          Minimum Gross for {skillLabel(form.skill)}: ₹
                          {money(minimumValidGross(calc.versionBefore.rules, form.skill))}
                        </p>
                      ) : null}
                    </div>
                  </SectionCard>

                  <SectionCard title="Calculation check">
                    {(() => {
                      const ck = (isConfirmationFlow ? calc.confirmation.before : final).check;
                      return (
                        <div className="grid grid-cols-2 gap-3">
                          <Fact label="Input basis">{ck.input_basis === INPUT_CTC ? "CTC" : "Gross"}</Fact>
                          <Fact label="Input amount">₹{money(ck.input_amount)}</Fact>
                          <Fact label="Sum of Part A">₹{money(ck.sum_part_a)}</Fact>
                          <Fact label="Gross used">₹{money(ck.gross_used)}</Fact>
                          <Fact label="Calculated CTC">₹{money(ck.calculated_ctc)}</Fact>
                          <Fact label="CTC difference">₹{money(ck.ctc_difference)}</Fact>
                        </div>
                      );
                    })()}
                  </SectionCard>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <SectionCard title="CTC history">
        <DenseTable columns={historyColumns} rows={history} rowKey="key" showSerialNumber={false} />
        <CollapsibleHelp label="how history works">
          Every save adds a record; earlier records are never overwritten. A record applies from its W.E.F. date until
          the day before the next one. Salary Processing uses the record in force for the pay month.
        </CollapsibleHelp>
      </SectionCard>

      <Drawer
        open={Boolean(viewRow)}
        title={viewRow ? `CTC from ${fmtDate(viewRow.effective_from)}` : ""}
        onClose={() => setViewRow(null)}
        widthClass="max-w-2xl"
      >
        {viewRow ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <Fact label="Type">{viewRow.revision_type}</Fact>
              <Fact label="Status">{viewRow.status}</Fact>
              <Fact label="Scheme">{viewRow.scheme}</Fact>
              <Fact label="Band">{viewRow.band ? `Band ${viewRow.band}` : "—"}</Fact>
              <Fact label="To">{viewRow.current ? "Current" : fmtDate(viewRow.effective_to)}</Fact>
              <Fact label="Custom">{viewRow.is_custom ? "Yes" : "No"}</Fact>
            </div>
            {viewRow.reason ? <p className="text-xs text-ink-secondary">{viewRow.reason}</p> : null}
            <AnnexureTable
              groups={[{ title: "Record", values: recordToComponents(viewRow.row) }]}
              highlightCustom={viewRow.is_custom ? viewRow.row.system_values_json : null}
            />
            {viewRow.annexure ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => print(viewRow.row)}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-white text-xs"
                >
                  <Printer className="h-3.5 w-3.5" /> Print Annexure
                </button>
                <button
                  type="button"
                  onClick={() => print(viewRow.row, { internal: true })}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-white text-xs"
                >
                  <Printer className="h-3.5 w-3.5" /> Print internal copy
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </Drawer>

      <Drawer
        open={Boolean(compareRow)}
        title="Compare with previous"
        onClose={() => setCompareRow(null)}
        widthClass="max-w-3xl"
      >
        {compareRow
          ? (() => {
              const prev = previousOf(compareRow.key);
              const a = recordToComponents(prev.row);
              const b = recordToComponents(compareRow.row);
              return (
                <div className="space-y-3">
                  <AnnexureTable
                    groups={[
                      { title: `Previous (${fmtDate(prev.effective_from)})`, values: a },
                      { title: `New (${fmtDate(compareRow.effective_from)})`, values: b },
                    ]}
                    change={{ title: "Difference / Month", values: diffValues(a, b) }}
                  />
                  {compareRow.annexure ? (
                    <button
                      type="button"
                      onClick={() => print(compareRow.row, { previous: prev.row })}
                      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-white text-xs"
                    >
                      <Printer className="h-3.5 w-3.5" /> Print revision Annexure (Previous vs New)
                    </button>
                  ) : null}
                </div>
              );
            })()
          : null}
      </Drawer>

      <ScenarioMatrix
        open={matrixOpen}
        onClose={() => setMatrixOpen(false)}
        ruleVersions={ruleVersions}
        wef={form.wef}
        skill={form.skill}
        gross={parseAmount(form.gross)}
        ctc={parseAmount(form.ctc)}
        retain={form.retain}
      />
    </div>
  );
}

/** Read-only comparison of the six lifecycle/scheme combinations. Nothing is saved. */
function ScenarioMatrix({ open, onClose, ruleVersions, wef, skill, gross, ctc, retain }) {
  const columns = useMemo(() => {
    if (!open) return [];
    const rulesFor = (scheme) => resolveRuleVersion(ruleVersions, scheme, wef)?.rules;
    const run = (title, fn) => {
      try {
        return { title, result: fn() };
      } catch (err) {
        return { title, error: err?.message || "Could not calculate." };
      }
    };
    const single = (scheme, status) => () =>
      calculateCtc(rulesFor(scheme), { skill, status, monthlyGross: gross, monthlyCtc: ctc });
    const confirm = (scheme) => () =>
      calculateConfirmation({
        rulesBefore: rulesFor(scheme),
        rulesAfter: rulesFor(scheme),
        skill,
        monthlyGross: gross,
        monthlyCtc: ctc,
        retain,
      }).after;
    return [
      run("Confirmed – Old", single(SCHEME_OLD, STATUS_CONFIRMED)),
      run("Confirmed – New", single(SCHEME_NEW, STATUS_CONFIRMED)),
      run("Probation – Old", single(SCHEME_OLD, STATUS_PROBATION)),
      run("Probation – New (incl. New Joiner)", single(SCHEME_NEW, STATUS_PROBATION)),
      run("Probation → Confirmed – Old", confirm(SCHEME_OLD)),
      run("Probation → Confirmed – New", confirm(SCHEME_NEW)),
    ];
  }, [open, ruleVersions, wef, skill, gross, ctc, retain]);

  return (
    <Modal open={open} title="Scenario Matrix" onClose={onClose} widthClass="max-w-6xl">
      <p className="text-xs text-ink-secondary mb-2">
        Monthly values for the entered amount ({gross ? `Gross ₹${money(gross)}` : `CTC ₹${money(ctc)}`},{" "}
        {skillLabel(skill)}). Probation → Confirmed columns show the structure after confirmation (
        {retain === RETAIN_CTC ? "Retain CTC" : "Retain Gross"}). Nothing is saved.
      </p>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-2 py-1.5 text-left">Particulars</th>
              {columns.map((c) => (
                <th key={c.title} className="px-2 py-1.5 text-right border-l border-gray-200">
                  {c.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ANNEXURE_ROWS.filter((r) => !r.heading).map((row) => (
              <tr key={row.key} className={row.total ? "bg-slate-50 font-semibold" : "border-t border-gray-100"}>
                <td className="px-2 py-1 whitespace-nowrap">{row.label}</td>
                {columns.map((c) => (
                  <td key={c.title} className="px-2 py-1 text-right tabular-nums border-l border-gray-100">
                    {c.result ? money(c.result[row.key]) : "—"}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="border-t border-gray-200">
              <td className="px-2 py-1">Band</td>
              {columns.map((c) => (
                <td key={c.title} className="px-2 py-1 text-right border-l border-gray-100">
                  {c.result ? `Band ${c.result.band}` : "—"}
                </td>
              ))}
            </tr>
            <tr>
              <td className="px-2 py-1">Validation</td>
              {columns.map((c) => (
                <td key={c.title} className="px-2 py-1 text-right border-l border-gray-100">
                  {c.result ? (
                    <StatusChip label={c.result.validation.label} severity={validationSeverity(c.result.validation)} />
                  ) : (
                    <span className="text-critical">{c.error}</span>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
