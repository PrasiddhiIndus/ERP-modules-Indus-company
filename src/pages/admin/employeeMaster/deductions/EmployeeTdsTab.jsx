import React, { useEffect, useState } from "react";
import { SectionCard } from "../../../adminOperations/components/AdminUi";
import { currentYm, newId, parseMoney, round2 } from "./deductionsStore";
import {
  DangerButton,
  Field,
  inputClass,
  MoneyText,
  MonthInput,
  PrimaryButton,
  SecondaryButton,
  ShellBanner,
  StatusBadge,
} from "./deductionsUi";
import { toast } from "../../../../lib/toast";

/**
 * TDS on Employee Master:
 * - none: do not deduct
 * - auto: use statutory / slab engine when salary processing is live
 * - manual: fixed monthly amount from WEF month until stopped
 * Stopping / switching to none freezes further TDS feed into processing.
 */
export default function EmployeeTdsTab({ tds, onChange, panHint = "" }) {
  const value = tds || {
    mode: "none",
    monthly_amount: null,
    wef_month: "",
    remarks: "",
    active: false,
    history: [],
  };

  const [draft, setDraft] = useState({
    mode: value.mode || "none",
    monthly_amount: value.monthly_amount != null ? String(value.monthly_amount) : "",
    wef_month: value.wef_month || currentYm(),
    remarks: value.remarks || "",
  });

  useEffect(() => {
    setDraft({
      mode: value.mode || "none",
      monthly_amount: value.monthly_amount != null ? String(value.monthly_amount) : "",
      wef_month: value.wef_month || currentYm(),
      remarks: value.remarks || "",
    });
  }, [value.mode, value.monthly_amount, value.wef_month, value.remarks]);

  const pushHistory = (base, note) => {
    const entry = {
      id: newId("tds"),
      at: new Date().toISOString(),
      note,
      mode: base.mode,
      monthly_amount: base.monthly_amount,
      wef_month: base.wef_month,
      active: base.active,
    };
    return [entry, ...(Array.isArray(base.history) ? base.history : [])].slice(0, 40);
  };

  const handleSave = (e) => {
    e.preventDefault();
    const mode = draft.mode;
    let monthly = parseMoney(draft.monthly_amount);
    if (mode === "manual") {
      if (monthly == null || monthly < 0) {
        toast.warning("Enter a monthly TDS amount (0 or more) for manual mode.");
        return;
      }
      if (!draft.wef_month) {
        toast.warning("Set a W.E.F. month for manual TDS.");
        return;
      }
    } else {
      monthly = null;
    }

    const next = {
      ...value,
      mode,
      monthly_amount: mode === "manual" ? round2(monthly) : null,
      wef_month: mode === "none" ? "" : draft.wef_month || currentYm(),
      remarks: draft.remarks || "",
      active: mode !== "none",
      updated_at: new Date().toISOString(),
    };
    next.history = pushHistory(
      next,
      mode === "none"
        ? "TDS stopped — will not update salary processing"
        : mode === "auto"
          ? "TDS set to Auto (slab / statutory when processing runs)"
          : `Manual TDS ₹${round2(monthly)} / month from ${next.wef_month}`
    );
    onChange(next);
    toast.success(mode === "none" ? "TDS stopped." : "TDS settings saved.");
  };

  const stopTds = () => {
    const ok = window.confirm(
      "Stop TDS for this employee? Salary processing will no longer pick up a TDS amount from this profile."
    );
    if (!ok) return;
    const next = {
      ...value,
      mode: "none",
      monthly_amount: null,
      active: false,
      updated_at: new Date().toISOString(),
    };
    next.history = pushHistory(next, "TDS stopped manually");
    onChange(next);
    setDraft((prev) => ({ ...prev, mode: "none", monthly_amount: "" }));
    toast.success("TDS stopped.");
  };

  const feeds =
    value.active && value.mode !== "none"
      ? value.mode === "manual"
        ? "Yes (manual amount)"
        : "Yes (auto when processing runs)"
      : "No";

  return (
    <div className="space-y-4">
      <ShellBanner>
        Configure how TDS should apply for this employee. Manual locks a monthly amount from a W.E.F.
        month. Auto defers to statutory slabs when salary processing is live. Stop TDS to freeze — it
        will not update processing afterwards until you turn it back on.
      </ShellBanner>

      <SectionCard
        title="TDS setup"
        right={<StatusBadge status={value.active ? "active" : "stopped"} />}
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 text-sm">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Current mode</p>
            <p className="mt-1 font-medium text-gray-900 capitalize">{value.mode || "none"}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Monthly amount</p>
            <p className="mt-1">
              {value.mode === "manual" ? <MoneyText value={value.monthly_amount} strong /> : "—"}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Salary feed</p>
            <p className="mt-1 font-medium text-gray-900">{feeds}</p>
          </div>
        </div>
        {panHint ? (
          <p className="text-xs text-gray-500 mb-4">
            PAN on personal details: <span className="font-mono text-gray-800">{panHint}</span>
          </p>
        ) : (
          <p className="text-xs text-amber-800 mb-4">
            No PAN on personal details — add it under Personal details for statutory TDS.
          </p>
        )}

        <form onSubmit={handleSave} className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Field label="TDS mode">
              <select
                value={draft.mode}
                onChange={(e) => setDraft((prev) => ({ ...prev, mode: e.target.value }))}
                className={inputClass}
              >
                <option value="none">None — do not deduct</option>
                <option value="auto">Auto — statutory / slabs at processing</option>
                <option value="manual">Manual — fixed monthly amount</option>
              </select>
            </Field>
            <Field
              label="Monthly TDS (₹)"
              hint={draft.mode === "manual" ? "Deducted each pay month from W.E.F." : "Only used in manual mode."}
            >
              <input
                type="number"
                min="0"
                step="0.01"
                value={draft.monthly_amount}
                disabled={draft.mode !== "manual"}
                onChange={(e) => setDraft((prev) => ({ ...prev, monthly_amount: e.target.value }))}
                className={inputClass}
              />
            </Field>
            <Field label="W.E.F. month">
              <MonthInput
                value={draft.wef_month}
                disabled={draft.mode === "none"}
                onChange={(e) => setDraft((prev) => ({ ...prev, wef_month: e.target.value }))}
              />
            </Field>
            <Field label="Remarks">
              <input
                type="text"
                value={draft.remarks}
                onChange={(e) => setDraft((prev) => ({ ...prev, remarks: e.target.value }))}
                className={inputClass}
              />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <PrimaryButton type="submit">Save TDS settings</PrimaryButton>
            {value.active ? (
              <DangerButton onClick={stopTds}>Stop TDS</DangerButton>
            ) : (
              <SecondaryButton type="button" disabled>
                Already stopped
              </SecondaryButton>
            )}
          </div>
        </form>
      </SectionCard>

      <SectionCard title="TDS change history">
        {(value.history || []).length ? (
          <ul className="space-y-2 text-xs text-gray-700">
            {value.history.map((h) => (
              <li key={h.id} className="border-b border-gray-100 pb-2 last:border-0">
                <p className="font-medium text-gray-900">{h.note}</p>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  {h.at ? new Date(h.at).toLocaleString("en-IN") : "—"}
                  {h.mode === "manual" && h.monthly_amount != null
                    ? ` · ₹${Number(h.monthly_amount).toLocaleString("en-IN")}`
                    : ""}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-gray-500 py-2">No TDS changes recorded yet.</p>
        )}
      </SectionCard>
    </div>
  );
}
