import React, { useEffect, useMemo, useState } from "react";
import FormDateInput from "../../../../components/FormDateInput";
import { toast } from "../../../../lib/toast";
import { isoToDisplayDate } from "../../../../utils/dateInput";
import { ruleDepartmentKey } from "../../../../lib/attendanceRules";
import { saveRuleValue } from "../rulesApi";
import {
  SETUP_DATE,
  departmentHasOwnValue as hasOwnValue,
  formatRuleValue,
  parseFormValue,
  ruleHistory,
  summarizeRule,
  toFormValue,
  todayIso,
  validateRuleEdit,
  valueFor,
} from "../rulesModel";
import { RulesDrawer, Field, btnPrimary, btnSecondary, btnGhost, describedBy, inputClass } from "./RulesUi";

const COMPANY = "";
const INHERIT = "__inherit";
const HISTORY_PREVIEW = 6;

/** Side panel: see a rule's current values, change one value, review history. */
export default function RuleDrawer({ rule, values, departments, onClose, onSaved }) {
  const today = todayIso();
  const summary = useMemo(() => summarizeRule(rule, values, today), [rule, values, today]);
  const history = useMemo(() => ruleHistory(rule, values), [rule, values]);

  const [target, setTarget] = useState(COMPANY);
  const [formValue, setFormValue] = useState(() => toFormValue(rule, summary.companyValue));
  const [initialValue, setInitialValue] = useState(formValue);
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);

  const targetHasOwn = target !== COMPANY && hasOwnValue(values, rule.rule_key, target, today);
  const dirty = formValue !== initialValue || reason.trim() !== "" || effectiveFrom !== today;

  const pickTarget = (next) => {
    if (dirty && !window.confirm("Discard the change you started?")) return;
    const own = next !== COMPANY && hasOwnValue(values, rule.rule_key, next, today);
    const current = valueFor(rule, values, { department: next || null, onDate: today });
    const start = next === COMPANY || own ? toFormValue(rule, current) : INHERIT;
    setTarget(next);
    setFormValue(start);
    setInitialValue(start);
    setEffectiveFrom(today);
    setReason("");
    setErrors({});
  };

  useEffect(() => {
    setErrors({});
  }, [formValue, effectiveFrom, reason]);

  const requestClose = () => {
    if (saving) return;
    if (dirty && !window.confirm("Discard the change you started?")) return;
    onClose();
  };

  const save = async () => {
    const value = parseFormValue(rule, formValue);
    const department = target || null;
    const nextErrors = validateRuleEdit(rule, { department, value, effectiveFrom, reason }, today);
    if (!Object.keys(nextErrors).length && formValue === initialValue) {
      nextErrors.value = "Pick a different value to save a change.";
    }
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    setSaving(true);
    try {
      await saveRuleValue({ ruleKey: rule.rule_key, department, value, effectiveFrom, reason: reason.trim() });
      const startsLater = effectiveFrom > today;
      toast.success(
        "Rule saved",
        startsLater ? `Takes effect from ${isoToDisplayDate(effectiveFrom)}.` : "In effect from today."
      );
      setInitialValue(formValue);
      setReason("");
      setEffectiveFrom(today);
      await onSaved();
    } catch (e) {
      toast.error("Could not save", e?.message || "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const departmentOptions = useMemo(() => {
    const seen = new Set();
    const list = [];
    for (const d of departments) {
      const key = ruleDepartmentKey(d.name);
      if (seen.has(key)) continue;
      seen.add(key);
      list.push(d);
    }
    for (const diff of summary.differences) {
      const key = ruleDepartmentKey(diff.department);
      if (!seen.has(key)) {
        seen.add(key);
        list.push({ name: diff.department, activeEmployees: 0 });
      }
    }
    return list;
  }, [departments, summary.differences]);

  const companyLabel = formatRuleValue(rule, summary.companyValue);
  const targetLabel = target || "the whole company";

  return (
    <RulesDrawer
      open
      title={rule.label}
      subtitle={rule.description}
      onClose={requestClose}
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <button type="button" className={btnSecondary} onClick={requestClose} disabled={saving}>
            Close
          </button>
          <button type="button" className={btnPrimary} onClick={save} disabled={saving || !dirty}>
            {saving ? "Saving…" : "Save change"}
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <section aria-labelledby="rule-current">
          <h3 id="rule-current" className="type-mono-caption mb-2">
            In effect today
          </h3>
          <ul className="divide-y divide-divider rounded-lg border border-border">
            <li className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="text-xs text-ink-secondary">
                {rule.allows_department ? "Company default (all other departments)" : "Whole company"}
              </span>
              <span className="flex items-center gap-2">
                <span className="text-xs font-semibold text-ink">{companyLabel}</span>
                {target !== COMPANY ? (
                  <button type="button" className={btnGhost} onClick={() => pickTarget(COMPANY)}>
                    Change
                  </button>
                ) : null}
              </span>
            </li>
            {summary.differences.map((d) => (
              <li key={d.department} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0 text-xs text-ink">
                  {d.department}
                  {d.since > SETUP_DATE ? (
                    <span className="text-ink-muted"> · since {isoToDisplayDate(d.since)}</span>
                  ) : null}
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-ink">{formatRuleValue(rule, d.value)}</span>
                  {target !== d.department ? (
                    <button type="button" className={btnGhost} onClick={() => pickTarget(d.department)}>
                      Change
                    </button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
          {rule.allows_department && !summary.differences.length ? (
            <p className="mt-2 text-xs text-ink-secondary">Every department follows the company default.</p>
          ) : null}
          {summary.scheduled.length ? (
            <div className="mt-3 rounded-lg border border-info-border bg-info-soft px-3 py-2 text-xs text-info">
              <p className="font-semibold">Coming up</p>
              <ul className="mt-1 space-y-0.5">
                {summary.scheduled.map((s) => (
                  <li key={s.id}>
                    From {isoToDisplayDate(s.effective_from)}: {s.department || "Company default"} →{" "}
                    {formatRuleValue(rule, s.value)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <section aria-labelledby="rule-change" className="space-y-3 rounded-lg border border-border bg-surface-raised p-3">
          <h3 id="rule-change" className="type-mono-caption">
            Make a change
          </h3>

          {rule.allows_department ? (
            <Field id="rule-target" label="Apply to">
              <select
                id="rule-target"
                className={inputClass}
                value={target}
                onChange={(e) => pickTarget(e.target.value)}
                disabled={saving}
              >
                <option value={COMPANY}>Company default (all departments)</option>
                {departmentOptions.map((d) => (
                  <option key={d.name} value={d.name}>
                    {d.name}
                    {d.activeEmployees ? ` · ${d.activeEmployees} active` : ""}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}

          <ValueInput
            rule={rule}
            value={formValue}
            onChange={setFormValue}
            allowInherit={target !== COMPANY}
            inheritLabel={`Same as company default (${companyLabel})`}
            error={errors.value}
            disabled={saving}
            hint={
              target !== COMPANY && !targetHasOwn
                ? `${target} follows the company default today.`
                : `Now: ${formatRuleValue(rule, parseFormValue(rule, initialValue))} for ${targetLabel}.`
            }
          />

          <Field
            id="rule-effective"
            label="Starts from"
            required
            error={errors.effectiveFrom}
            hint={rule.module === "comp_off" ? "C/O already earned is not recalculated." : "Earlier days keep the old rule."}
          >
            <FormDateInput
              id="rule-effective"
              value={effectiveFrom}
              min={today}
              onChange={(e) => setEffectiveFrom(e.target.value)}
              disabled={saving}
              aria-label="Starts from"
            />
          </Field>

          <Field id="rule-reason" label="Reason" required error={errors.reason} hint="Shown in the history below.">
            <textarea
              id="rule-reason"
              rows={2}
              className={`${inputClass} h-auto py-2`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Plant now works the 3rd Saturday from October"
              aria-describedby={describedBy("rule-reason", errors.reason, "Shown in the history below.")}
              aria-invalid={Boolean(errors.reason)}
              disabled={saving}
            />
          </Field>
        </section>

        <section aria-labelledby="rule-history">
          <h3 id="rule-history" className="type-mono-caption mb-2">
            History
          </h3>
          {history.length ? (
            <ol className="space-y-2">
              {(showAllHistory ? history : history.slice(0, HISTORY_PREVIEW)).map((h) => (
                <li key={h.id} className="rounded-lg border border-border px-3 py-2 text-xs">
                  <p className="text-ink">
                    <span className="font-semibold">{h.department || "Company default"}</span>
                    {h.previous_value !== null && h.previous_value !== undefined ? (
                      <>
                        : {formatRuleValue(rule, h.previous_value)} → {formatRuleValue(rule, h.value)}
                      </>
                    ) : (
                      <>: {formatRuleValue(rule, h.value)}</>
                    )}
                    <span className="text-ink-secondary"> from {isoToDisplayDate(h.effective_from)}</span>
                  </p>
                  <p className="mt-0.5 text-ink-secondary">{h.reason}</p>
                  <p className="mt-0.5 text-[11px] text-ink-muted">
                    {h.created_by_name || "Admin"}
                    {h.created_at ? ` · ${isoToDisplayDate(String(h.created_at).slice(0, 10))}` : ""}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-xs text-ink-secondary">No changes since the console was set up.</p>
          )}
          {history.length > HISTORY_PREVIEW ? (
            <button type="button" className={`${btnGhost} mt-2`} onClick={() => setShowAllHistory((v) => !v)}>
              {showAllHistory ? "Show fewer" : `Show all ${history.length}`}
            </button>
          ) : null}
        </section>
      </div>
    </RulesDrawer>
  );
}

function ValueInput({ rule, value, onChange, allowInherit, inheritLabel, error, hint, disabled }) {
  const id = "rule-value";
  const aria = describedBy(id, error, hint);

  if (rule.value_type === "multi_number") {
    const inherit = value === INHERIT;
    const picked = new Set(inherit ? [] : String(value).split(",").filter((s) => s !== "").map(Number));
    const toggle = (v) => {
      const next = new Set(picked);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      onChange([...next].sort((a, b) => a - b).join(","));
    };
    return (
      <fieldset className="space-y-1" aria-describedby={aria}>
        <legend className="block text-[11px] font-semibold text-ink-secondary">
          Value<span className="text-critical"> *</span>
        </legend>
        {allowInherit ? (
          <label className="flex items-center gap-2 text-xs text-ink-secondary">
            <input
              type="checkbox"
              checked={inherit}
              onChange={() => onChange(inherit ? "" : INHERIT)}
              disabled={disabled}
              className="accent-accent"
            />
            {inheritLabel}
          </label>
        ) : null}
        {!inherit ? (
          <div className="flex flex-wrap gap-2">
            {(rule.options || []).map((o) => (
              <label
                key={o.value}
                className={`inline-flex cursor-pointer items-center gap-2 rounded-control border px-3 py-1.5 text-xs ${
                  picked.has(o.value) ? "border-accent bg-accent-soft text-ink" : "border-border-strong bg-surface text-ink-secondary"
                }`}
              >
                <input
                  type="checkbox"
                  checked={picked.has(o.value)}
                  onChange={() => toggle(o.value)}
                  disabled={disabled}
                  className="accent-accent"
                />
                {o.label}
              </label>
            ))}
          </div>
        ) : null}
        {hint && !error ? <p id={`${id}-hint`} className="text-[11px] text-ink-secondary">{hint}</p> : null}
        {error ? (
          <p id={`${id}-error`} className="text-[11px] text-critical" role="alert">
            {error}
          </p>
        ) : null}
      </fieldset>
    );
  }

  if (rule.value_type === "boolean" || rule.value_type === "select") {
    const options = [
      ...(rule.value_type === "boolean"
        ? [
            { value: "true", label: "Yes" },
            { value: "false", label: "No" },
          ]
        : (rule.options || []).map((o) => ({ value: String(o.value), label: o.label }))),
      ...(allowInherit ? [{ value: INHERIT, label: inheritLabel }] : []),
    ];
    return (
      <fieldset className="space-y-1" aria-describedby={aria}>
        <legend className="block text-[11px] font-semibold text-ink-secondary">
          Value<span className="text-critical"> *</span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {options.map((o) => (
            <label
              key={o.value}
              className={`inline-flex cursor-pointer items-center gap-2 rounded-control border px-3 py-1.5 text-xs ${
                value === o.value ? "border-accent bg-accent-soft text-ink" : "border-border-strong bg-surface text-ink-secondary"
              }`}
            >
              <input
                type="radio"
                name={id}
                value={o.value}
                checked={value === o.value}
                onChange={() => onChange(o.value)}
                disabled={disabled}
                className="accent-accent"
              />
              {o.label}
            </label>
          ))}
        </div>
        {hint && !error ? <p id={`${id}-hint`} className="text-[11px] text-ink-secondary">{hint}</p> : null}
        {error ? (
          <p id={`${id}-error`} className="text-[11px] text-critical" role="alert">
            {error}
          </p>
        ) : null}
      </fieldset>
    );
  }

  return (
    <Field id={id} label="Value" required error={error} hint={hint}>
      {rule.value_type === "date" ? (
        <FormDateInput id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} aria-label="Value" />
      ) : rule.value_type === "time" ? (
        <input
          id={id}
          type="time"
          step={60}
          className={`${inputClass} w-32`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={aria}
          aria-invalid={Boolean(error)}
          disabled={disabled}
        />
      ) : (
        <div className="flex items-center gap-2">
          <input
            id={id}
            type="number"
            inputMode="numeric"
            step={1}
            min={rule.min_value ?? undefined}
            max={rule.max_value ?? undefined}
            className={`${inputClass} w-28`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-describedby={aria}
            aria-invalid={Boolean(error)}
            disabled={disabled}
          />
          {rule.unit ? <span className="text-xs text-ink-secondary">{rule.unit}</span> : null}
        </div>
      )}
    </Field>
  );
}
