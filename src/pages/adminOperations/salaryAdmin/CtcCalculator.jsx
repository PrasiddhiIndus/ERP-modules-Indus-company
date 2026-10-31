import React, { useEffect, useMemo, useState } from "react";
import { Eraser, RefreshCw, Save } from "lucide-react";
import {
  CollapsibleHelp,
  KpiTile,
  PageTaskHeader,
  SectionCard,
  StatusChip,
  TinyInput,
  TinySelect,
} from "../components/AdminUi";
import {
  CATEGORY_NEW_JOINER_NEW_SCHEME,
  CATEGORY_NEW_PROBATION,
  CATEGORY_PROBATION_TO_CONFIRMED,
  RETAIN_CTC,
  RETAIN_GROSS,
  SCHEME_NEW,
  SCHEME_OLD,
  SEED_RULES_2026_27,
  SKILL_SEMI,
  SKILL_SKILLED,
  annexureMonthlyValue,
  annexurePaValue,
  annexureRowsFor,
  calculateConfirmation,
  calculateCtc,
  minimumValidGross,
  resolveCategory,
  roundRupee,
  schemeLabel,
} from "./ctcEngine";
import {
  CATEGORY_OPTIONS,
  skillLabel,
  statusLabel,
} from "./annexureCtcRecord";
import { fetchRuleVersions, resolveRuleVersion } from "./payrollRulesDb";

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function money(v) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return roundRupee(v).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function signedMoney(v) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  const r = roundRupee(v);
  return `${r > 0 ? "+" : ""}${money(r)}`;
}

function parseAmount(v) {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function validationSeverity(v) {
  if (!v) return "neutral";
  if (v.level === "error") return "critical";
  if (v.level === "warning") return "warning";
  return "info";
}

function emptyForm() {
  return {
    skill: SKILL_SKILLED,
    category: CATEGORY_NEW_PROBATION,
    scheme: SCHEME_OLD,
    wef: todayIso(),
    ctc: "",
    gross: "",
    retain: RETAIN_GROSS,
    schemeAfter: "same",
  };
}

function seedVersion(scheme) {
  return {
    id: `seed_${scheme}`,
    scheme,
    effective_from: "2000-01-01",
    rules: { ...SEED_RULES_2026_27 },
    label: "Seed 2026-27",
  };
}

function AnnexureBreakupTable({ groups, change }) {
  const rows = annexureRowsFor(...groups.map((g) => g.values));
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-xs">
        <thead className="bg-surface-raised text-ink-secondary">
          {groups.length > 1 || change ? (
            <tr>
              <th className="px-2.5 py-2 text-left" rowSpan={2}>
                Particulars
              </th>
              {groups.map((g) => (
                <th
                  key={g.title}
                  colSpan={2}
                  className="px-2.5 py-2 text-center border-l border-border"
                >
                  {g.title}
                </th>
              ))}
              {change ? (
                <th rowSpan={2} className="px-2.5 py-2 text-right border-l border-border">
                  {change.title}
                </th>
              ) : null}
            </tr>
          ) : null}
          <tr>
            {groups.length > 1 || change ? null : (
              <th className="px-2.5 py-2 text-left">Particulars</th>
            )}
            {groups.map((g) => (
              <React.Fragment key={g.title}>
                <th className="px-2.5 py-2 text-right border-l border-border">Monthly</th>
                <th className="px-2.5 py-2 text-right">P.A.</th>
              </React.Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            if (row.heading) {
              return (
                <tr key={row.label} className="bg-surface-sunken/50">
                  <td
                    colSpan={1 + groups.length * 2 + (change ? 1 : 0)}
                    className="px-2.5 py-1.5 font-semibold text-ink"
                  >
                    {row.label}
                  </td>
                </tr>
              );
            }
            return (
              <tr
                key={row.key}
                className={row.total ? "bg-accent-soft/30 font-semibold" : "border-t border-divider"}
              >
                <td className="px-2.5 py-1.5 text-ink whitespace-nowrap">{row.label}</td>
                {groups.map((g) => {
                  const v = g.values?.[row.key];
                  const m = annexureMonthlyValue(g.values, row.key);
                  const pa = v == null ? null : annexurePaValue(g.values, row.key);
                  return (
                    <React.Fragment key={g.title}>
                      <td className="px-2.5 py-1.5 text-right tabular-nums border-l border-divider">
                        {v != null && m == null ? "" : money(v)}
                      </td>
                      <td className="px-2.5 py-1.5 text-right tabular-nums text-ink-secondary">
                        {v == null ? "—" : pa == null ? "" : money(pa)}
                      </td>
                    </React.Fragment>
                  );
                })}
                {change ? (
                  <td className="px-2.5 py-1.5 text-right tabular-nums border-l border-divider">
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

/**
 * Salary Admin · CTC Calculator — same Compensation Scheme math as Employee Master CTC.
 * Standalone page: estimation only. Pass `onSave` (e.g. In-house Recruitment candidate) to persist.
 *
 * @param {{
 *   embedded?: boolean,
 *   initialCtc?: string|number|null,
 *   initialGross?: string|number|null,
 *   onSave?: (result: { gross: number, ctc: number, takeHome: number, display: object }) => void|Promise<void>,
 *   saveLabel?: string,
 * }} [props]
 */
export default function CtcCalculator({
  embedded = false,
  initialCtc = "",
  initialGross = "",
  onSave = null,
  saveLabel = "Save CTC",
} = {}) {
  const [form, setForm] = useState(() => ({
    ...emptyForm(),
    ctc: initialCtc != null && initialCtc !== "" ? String(initialCtc) : "",
    gross: initialGross != null && initialGross !== "" ? String(initialGross) : "",
  }));
  const [ruleVersions, setRuleVersions] = useState([]);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [rulesError, setRulesError] = useState("");
  const [usingSeed, setUsingSeed] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setRulesLoading(true);
      setRulesError("");
      try {
        const versions = await fetchRuleVersions();
        if (cancelled) return;
        if (versions?.length) {
          setRuleVersions(versions);
          setUsingSeed(false);
        } else {
          setRuleVersions([seedVersion(SCHEME_OLD), seedVersion(SCHEME_NEW)]);
          setUsingSeed(true);
        }
      } catch (err) {
        if (cancelled) return;
        console.warn("CTC calculator: payroll rules unavailable, using seed", err);
        setRuleVersions([seedVersion(SCHEME_OLD), seedVersion(SCHEME_NEW)]);
        setUsingSeed(true);
        setRulesError(err?.message || "Could not load payroll rules; using built-in seed rates.");
      } finally {
        if (!cancelled) setRulesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!embedded) return;
    setForm((f) => ({
      ...f,
      ctc: initialCtc != null && initialCtc !== "" ? String(initialCtc) : f.ctc,
      gross: initialGross != null && initialGross !== "" ? String(initialGross) : f.gross,
    }));
  }, [embedded, initialCtc, initialGross]);

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const resolved = useMemo(
    () => resolveCategory(form.category, form.scheme, form.schemeAfter),
    [form.category, form.scheme, form.schemeAfter]
  );

  const isConfirmation = form.category === CATEGORY_PROBATION_TO_CONFIRMED;
  const monthlyCtc = parseAmount(form.ctc);
  const monthlyGross = parseAmount(form.gross);

  const versionBefore = useMemo(() => {
    const fromDb = resolveRuleVersion(ruleVersions, resolved.scheme, form.wef);
    return fromDb || seedVersion(resolved.scheme);
  }, [ruleVersions, resolved.scheme, form.wef]);

  const versionAfter = useMemo(() => {
    const scheme = resolved.schemeAfter || resolved.scheme;
    const fromDb = resolveRuleVersion(ruleVersions, scheme, form.wef);
    return fromDb || seedVersion(scheme);
  }, [ruleVersions, resolved.schemeAfter, resolved.scheme, form.wef]);

  const hasAmount = Boolean(monthlyGross || monthlyCtc);

  const calc = useMemo(() => {
    if (!hasAmount) {
      return { empty: true, error: null, final: null };
    }
    try {
      if (isConfirmation) {
        const confirmation = calculateConfirmation({
          rulesBefore: versionBefore.rules,
          rulesAfter: versionAfter.rules,
          skill: form.skill,
          monthlyGross,
          monthlyCtc,
          retain: form.retain,
        });
        return { confirmation, final: confirmation.after, empty: false, error: null };
      }
      const final = calculateCtc(versionBefore.rules, {
        skill: form.skill,
        status: resolved.status,
        monthlyGross,
        monthlyCtc,
      });
      return { final, empty: false, error: null };
    } catch (err) {
      return { empty: true, error: err?.message || "Could not calculate.", final: null };
    }
  }, [
    form.skill,
    form.retain,
    hasAmount,
    isConfirmation,
    monthlyCtc,
    monthlyGross,
    resolved.status,
    versionBefore,
    versionAfter,
  ]);

  const minGross = useMemo(() => {
    try {
      return minimumValidGross(versionBefore.rules, form.skill);
    } catch {
      return null;
    }
  }, [versionBefore, form.skill]);

  const display = calc.confirmation ? calc.confirmation.after : calc.final;
  const validation = display?.validation;

  const tableGroups = useMemo(() => {
    if (calc.confirmation) {
      return [
        { title: "Probation", values: calc.confirmation.before },
        { title: "Confirmed", values: calc.confirmation.after },
      ];
    }
    if (calc.final) return [{ title: "Estimate", values: calc.final }];
    return [];
  }, [calc]);

  const changeCol = calc.confirmation
    ? { title: "Change", values: calc.confirmation.change }
    : null;

  const reset = () =>
    setForm({
      ...emptyForm(),
      ctc: initialCtc != null && initialCtc !== "" ? String(initialCtc) : "",
      gross: initialGross != null && initialGross !== "" ? String(initialGross) : "",
    });
  const clearAmounts = () => setForm((f) => ({ ...f, ctc: "", gross: "" }));

  const canSave = Boolean(onSave) && Boolean(display) && !calc.error && !saving;

  const handleSave = async () => {
    if (!canSave || !display) return;
    setSaving(true);
    try {
      await onSave({
        gross: roundRupee(display.gross),
        ctc: roundRupee(display.ctc),
        takeHome: roundRupee(display.take_home),
        display,
      });
    } finally {
      setSaving(false);
    }
  };

  const headerSubtitle = embedded
    ? onSave
      ? "Same Compensation Scheme rules as Admin Salary. Save stores the calculated monthly CTC on this candidate."
      : "Same Compensation Scheme rules as Admin Salary (estimate only for this login)."
    : "Estimate Compensation Scheme breakup from Monthly CTC or Gross. Same rules as Employee Master CTC details — nothing is saved.";

  return (
    <div className="space-y-4">
      <PageTaskHeader title="CTC Calculator" subtitle={headerSubtitle}>
        {onSave ? (
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-medium rounded-lg border border-accent-border bg-accent text-white hover:bg-accent disabled:opacity-50 disabled:pointer-events-none"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? "Saving…" : saveLabel}
          </button>
        ) : null}
        <button
          type="button"
          onClick={clearAmounts}
          className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-medium rounded-lg border border-border bg-surface hover:bg-surface-sunken"
        >
          <Eraser className="w-3.5 h-3.5" />
          Clear amounts
        </button>
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-medium rounded-lg border border-border bg-surface hover:bg-surface-sunken"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Reset
        </button>
      </PageTaskHeader>

      <CollapsibleHelp label="how this calculator works">
        <ul className="list-disc pl-4 space-y-1">
          <li>Enter <strong>Monthly CTC</strong> and/or <strong>Monthly Gross</strong> (Gross wins if both are filled).</li>
          <li>
            Skill, category and scheme pick the same payroll rule version used on CTC details (W.E.F.
            date).
          </li>
          <li>
            Breakup shows Basic, HRA, allowances, deductions, Part B and CTC — monthly and per annum.
          </li>
          {embedded && onSave ? (
            <li>
              <strong>Save CTC</strong> writes the calculated monthly CTC to this candidate&apos;s expected
              salary (used when preparing the offer).
            </li>
          ) : (
            <li>This page never saves to an employee record. Use Employee Master → CTC details to store.</li>
          )}
        </ul>
      </CollapsibleHelp>

      {(usingSeed || rulesError) && !rulesLoading ? (
        <div className="rounded-lg border border-warning-border bg-warning-soft px-3 py-2 text-[11px] text-warning">
          {rulesError || "Using built-in seed rates (Payroll Rule Master empty or unavailable)."}
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(18rem,22rem)_1fr] gap-4 items-start">
        <SectionCard title="Inputs">
          <div className="space-y-3 text-xs">
            <label className="block">
              <span className="text-ink-secondary">Skill Category</span>
              <TinySelect
                className="mt-1 w-full"
                value={form.skill}
                onChange={(e) => setField("skill", e.target.value)}
              >
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
                <span className="block mt-1 text-[11px] text-ink-muted">
                  New joiners are always on the New Scheme.
                </span>
              ) : null}
            </label>

            {isConfirmation ? (
              <>
                <label className="block">
                  <span className="text-ink-secondary">Scheme after confirmation</span>
                  <TinySelect
                    className="mt-1 w-full"
                    value={form.schemeAfter}
                    onChange={(e) => setField("schemeAfter", e.target.value)}
                  >
                    <option value="same">Same as before</option>
                    <option value={SCHEME_OLD}>Old Scheme</option>
                    <option value={SCHEME_NEW}>New Scheme</option>
                  </TinySelect>
                </label>
                <label className="block">
                  <span className="text-ink-secondary">On confirmation retain</span>
                  <TinySelect
                    className="mt-1 w-full"
                    value={form.retain}
                    onChange={(e) => setField("retain", e.target.value)}
                  >
                    <option value={RETAIN_GROSS}>Retain Gross</option>
                    <option value={RETAIN_CTC}>Retain CTC</option>
                  </TinySelect>
                </label>
              </>
            ) : null}

            <label className="block">
              <span className="text-ink-secondary">W.E.F. (rule version date)</span>
              <TinyInput
                type="date"
                className="mt-1 w-full"
                value={form.wef}
                onChange={(e) => setField("wef", e.target.value)}
              />
            </label>

            <label className="block">
              <span className="text-ink-secondary">Monthly CTC (₹)</span>
              <TinyInput
                type="number"
                step="any"
                className="mt-1 w-full text-right tabular-nums"
                value={form.ctc}
                onChange={(e) => setField("ctc", e.target.value)}
                placeholder="e.g. 45000"
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
                placeholder="Wins over CTC if filled"
              />
              {minGross != null ? (
                <span className="block mt-1 text-[11px] text-ink-muted">
                  Minimum Gross for {skillLabel(form.skill)}: ₹{money(minGross)}
                </span>
              ) : null}
            </label>

            <div className="rounded-lg border border-border bg-surface-sunken/40 px-3 py-2 space-y-1 text-[11px] text-ink-secondary">
              <p>
                Status: <strong className="text-ink">{statusLabel(resolved.status)}</strong>
                {isConfirmation ? " → Confirmed" : ""}
              </p>
              <p>
                Scheme: <strong className="text-ink">{schemeLabel(resolved.scheme)}</strong>
              </p>
              <p>
                Benefits: <strong className="text-ink">{resolved.benefits}</strong>
              </p>
              <p className="text-ink-muted">
                Rules: {versionBefore.label || versionBefore.effective_from || "—"}
                {rulesLoading ? " · loading…" : ""}
              </p>
            </div>
          </div>
        </SectionCard>

        <div className="space-y-4 min-w-0">
          {hasAmount ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiTile
                label="Gross (Part A)"
                value={display ? `₹${money(display.gross)}` : "—"}
                sub={display?.band != null ? `Band ${display.band}` : "Monthly"}
              />
              <KpiTile
                label="Take home"
                value={display ? `₹${money(display.take_home)}` : "—"}
                sub="After PF / PT / ESIC"
              />
              <KpiTile
                label="Total (B)"
                value={display ? `₹${money(display.total_b)}` : "—"}
                sub="Employer cost"
              />
              <KpiTile
                label="CTC"
                value={display ? `₹${money(display.ctc)}` : "—"}
                sub={display ? `P.A. ₹${money(display.ctc * 12)}` : "Part A + B"}
                tone="border-accent-border"
              />
            </div>
          ) : null}

          <SectionCard
            title="Annexure breakup"
            right={
              validation ? (
                <StatusChip label={validation.label || "—"} severity={validationSeverity(validation)} />
              ) : null
            }
          >
            {calc.error ? (
              <p className="text-sm text-critical py-6 text-center">{calc.error}</p>
            ) : !hasAmount ? (
              <p className="text-sm text-ink-muted py-10 text-center">
                Enter Monthly CTC or Monthly Gross to calculate the breakup.
              </p>
            ) : (
              <div className="space-y-3">
                <AnnexureBreakupTable groups={tableGroups} change={changeCol} />
                {display?.check && display.input_basis === "ctc" && Math.abs(display.check.ctc_difference) > 0 ? (
                  <p className="text-[11px] text-ink-muted">
                    Nearest-rupee match: calculated CTC ₹{money(display.check.calculated_ctc)} vs entered ₹
                    {money(display.check.input_amount)} (diff{" "}
                    {signedMoney(display.check.ctc_difference)}).
                  </p>
                ) : null}
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
