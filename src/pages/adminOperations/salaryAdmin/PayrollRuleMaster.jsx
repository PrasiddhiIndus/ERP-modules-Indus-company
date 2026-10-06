import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Lock, Plus, Save } from "lucide-react";
import {
  CollapsibleHelp,
  DenseTable,
  InlineAlert,
  Modal,
  PageTaskHeader,
  SectionCard,
  StatusChip,
  TinyInput,
} from "../components/AdminUi";
import toast from "../../../lib/toast";
import { MASKED_SECRET, salaryFiguresHidden } from "./salaryPrivacy";
import {
  RULE_CODES,
  SCHEME_NEW,
  SCHEME_OLD,
  benchmarkLimit,
  minimumValidGross,
  roundRupee,
  schemeLabel,
} from "./ctcEngine";
import { createRuleVersion, fetchRuleVersions, updateRuleVersion } from "./payrollRulesDb";
import CtcMigrationPanel from "./CtcMigrationPanel";

export const RULE_LABELS = Object.freeze({
  BENCH_SKILLED: { label: "Basic benchmark – Skilled", unit: "₹" },
  BENCH_SEMI: { label: "Basic benchmark – Semi-skilled", unit: "₹" },
  BASIC_PCT: { label: "Basic % of Gross (above benchmark limit)", unit: "%" },
  HRA_PCT: { label: "HRA % of Basic", unit: "%" },
  BONUS_PCT: { label: "Advance Against Statutory Bonus % of Basic", unit: "%" },
  MED_B2: { label: "Medical Allowance – Band 2", unit: "₹" },
  MED_B3: { label: "Medical Allowance – Band 3 (Medical cap)", unit: "₹" },
  BAND1_MAX: { label: "Band 1 upper limit (Gross)", unit: "₹" },
  BAND2_MAX: { label: "Band 2 upper limit (Gross)", unit: "₹" },
  BAND3_MAX: { label: "Band 3 upper limit (Gross); above = Band 4", unit: "₹" },
  PF_THRESHOLD: { label: "PF threshold on Basic", unit: "₹" },
  EE_PF_PCT: { label: "Employee PF % of Basic (Basic ≤ threshold)", unit: "%" },
  EE_PF_FIXED: { label: "Employee PF fixed (Basic > threshold)", unit: "₹" },
  ER_PF_PCT: { label: "Employer PF % of Basic (Basic ≤ threshold)", unit: "%" },
  ER_PF_FIXED: { label: "Employer PF fixed (Basic > threshold)", unit: "₹" },
  ESIC_THRESHOLD: { label: "ESIC threshold on Basic (no ESIC above)", unit: "₹" },
  EE_ESIC_PCT: { label: "Employee ESIC % of Basic", unit: "%" },
  ER_ESIC_PCT: { label: "Employer ESIC % of Basic", unit: "%" },
  PT_MONTHLY: { label: "Professional Tax per month", unit: "₹" },
  GRATUITY_PCT: { label: "Gratuity % of Basic", unit: "%" },
  EXGRATIA_CAP: { label: "Ex Gratia cap (MIN(Basic, cap) ÷ 12)", unit: "₹" },
  MEDICLAIM_YEAR: { label: "Mediclaim per year (Confirmed only)", unit: "₹" },
  LE_DAYS: { label: "Leave Encashment days (Confirmed only)", unit: "days" },
  LE_DIVISOR: { label: "Leave Encashment divisor", unit: "" },
});

const GROUPS = [
  { title: "Basic & allowances", codes: ["BENCH_SKILLED", "BENCH_SEMI", "BASIC_PCT", "HRA_PCT", "BONUS_PCT", "MED_B2", "MED_B3"] },
  { title: "Salary bands", codes: ["BAND1_MAX", "BAND2_MAX", "BAND3_MAX"] },
  { title: "PF, ESIC & PT", codes: ["PF_THRESHOLD", "EE_PF_PCT", "EE_PF_FIXED", "ER_PF_PCT", "ER_PF_FIXED", "ESIC_THRESHOLD", "EE_ESIC_PCT", "ER_ESIC_PCT", "PT_MONTHLY"] },
  { title: "Employer cost (Part B)", codes: ["GRATUITY_PCT", "EXGRATIA_CAP", "MEDICLAIM_YEAR", "LE_DAYS", "LE_DIVISOR"] },
];

const VIEW_RULES = "rules";
const VIEW_MIGRATION = "migration";

function fmtDate(d) {
  const s = String(d || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "—";
  const [y, m, day] = s.split("-");
  return `${day}-${m}-${y}`;
}

function fmtMoney(v) {
  return roundRupee(v).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function draftFromVersion(v) {
  const rules = {};
  for (const code of RULE_CODES) rules[code] = v?.rules?.[code] ?? "";
  return {
    rules,
    annexureTitle: v?.annexure_title || "",
    annexureNote: v?.annexure_note || "",
    signatoryCompany: v?.signatory_company || "",
    signatoryTitle: v?.signatory_title || "",
    remarks: v?.remarks || "",
  };
}

function rulesComplete(rules) {
  return RULE_CODES.every((c) => rules[c] !== "" && Number.isFinite(Number(rules[c])));
}

export default function PayrollRuleMaster() {
  const [view, setView] = useState(VIEW_RULES);
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [scheme, setScheme] = useState(SCHEME_OLD);
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(() => draftFromVersion(null));
  const [saving, setSaving] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [newFrom, setNewFrom] = useState("");
  const [newBothSchemes, setNewBothSchemes] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      setVersions(await fetchRuleVersions());
    } catch (err) {
      console.error("Payroll rules: load failed", err);
      setLoadError("Could not load payroll rules. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const schemeVersions = useMemo(
    () => versions.filter((v) => v.scheme === scheme),
    [versions, scheme]
  );

  useEffect(() => {
    if (!schemeVersions.length) {
      setSelectedId(null);
      return;
    }
    if (!schemeVersions.some((v) => v.id === selectedId)) setSelectedId(schemeVersions[0].id);
  }, [schemeVersions, selectedId]);

  const selected = useMemo(
    () => schemeVersions.find((v) => v.id === selectedId) || null,
    [schemeVersions, selectedId]
  );

  useEffect(() => {
    setDraft(draftFromVersion(selected));
  }, [selected]);

  const locked = Boolean(selected?.locked);
  const numericRules = useMemo(() => {
    const out = {};
    for (const code of RULE_CODES) out[code] = Number(draft.rules[code]);
    return out;
  }, [draft.rules]);
  const derivedOk = rulesComplete(draft.rules) && numericRules.BASIC_PCT > 0;

  const setRule = (code, value) =>
    setDraft((d) => ({ ...d, rules: { ...d.rules, [code]: value } }));

  const saveInPlace = async () => {
    if (salaryFiguresHidden()) {
      toast.error("Not saved", "Payroll rules are not saved for this login.");
      return;
    }
    if (!selected) return;
    if (!locked && !rulesComplete(draft.rules)) {
      toast.error("Rules incomplete", "Fill every rule value before saving.");
      return;
    }
    setSaving(true);
    try {
      await updateRuleVersion(selected.id, {
        ...(locked ? {} : { rules: numericRules }),
        annexureTitle: draft.annexureTitle,
        annexureNote: draft.annexureNote,
        signatoryCompany: draft.signatoryCompany,
        signatoryTitle: draft.signatoryTitle,
        remarks: draft.remarks,
      });
      toast.success("Saved", locked ? "Annexure text updated." : "Rule version updated.");
      await load();
    } catch (err) {
      console.error("Payroll rules: update failed", err);
      toast.error("Could not save", err?.message || "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const saveNewVersion = async () => {
    if (salaryFiguresHidden()) {
      toast.error("Not saved", "Payroll rules are not saved for this login.");
      return;
    }
    if (!newFrom) {
      toast.error("Effective From required", "Pick the date the new rules start.");
      return;
    }
    if (!rulesComplete(draft.rules)) {
      toast.error("Rules incomplete", "Fill every rule value before saving.");
      return;
    }
    setSaving(true);
    try {
      const schemes = newBothSchemes ? [SCHEME_OLD, SCHEME_NEW] : [scheme];
      for (const s of schemes) {
        await createRuleVersion({
          scheme: s,
          effectiveFrom: newFrom,
          rules: numericRules,
          annexureTitle: draft.annexureTitle,
          annexureNote: draft.annexureNote,
          signatoryCompany: draft.signatoryCompany,
          signatoryTitle: draft.signatoryTitle,
          remarks: draft.remarks,
        });
      }
      toast.success("New version saved", `Effective from ${fmtDate(newFrom)}.`);
      setNewOpen(false);
      setNewFrom("");
      await load();
    } catch (err) {
      console.error("Payroll rules: create failed", err);
      toast.error("Could not save", err?.message || "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const versionColumns = [
    { key: "effective_from", label: "Effective From", render: (r) => fmtDate(r.effective_from) },
    {
      key: "locked",
      label: "Status",
      render: (r) =>
        r.locked ? <StatusChip label="In use" severity="neutral" /> : <StatusChip label="Editable" severity="info" />,
    },
    { key: "remarks", label: "Remarks", render: (r) => r.remarks || "—" },
  ];

  return (
    <div className="space-y-4">
      <PageTaskHeader
        title="Payroll Rules"
        subtitle="Rates and limits used to build every salary breakup (Annexure-I). Changes apply from a new Effective From date."
      >
        <div className="inline-flex rounded-lg border border-border overflow-hidden">
          {[
            [VIEW_RULES, "Rules"],
            [VIEW_MIGRATION, "Existing employees"],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              className={`h-8 px-3 text-xs font-medium ${
                view === id ? "bg-accent text-white" : "bg-white text-ink-secondary hover:bg-surface-sunken"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </PageTaskHeader>

      {loadError ? <InlineAlert tone="error">{loadError}</InlineAlert> : null}

      {view === VIEW_MIGRATION ? (
        <CtcMigrationPanel ruleVersions={versions} />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-4">
          <SectionCard
            title="Versions"
            right={
              <div className="inline-flex rounded-md border border-border overflow-hidden">
                {[SCHEME_OLD, SCHEME_NEW].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setScheme(s)}
                    className={`h-7 px-2.5 text-[11px] font-medium ${
                      scheme === s ? "bg-accent text-white" : "bg-white text-ink-secondary"
                    }`}
                  >
                    {schemeLabel(s)}
                  </button>
                ))}
              </div>
            }
          >
            {loading ? (
              <p className="text-xs text-ink-muted">Loading…</p>
            ) : (
              <DenseTable
                columns={versionColumns}
                rows={schemeVersions}
                onRowClick={(r) => setSelectedId(r.id)}
                activeRowId={selectedId}
                showSerialNumber={false}
              />
            )}
            <CollapsibleHelp label="how versions work">
              A version that has been used for a saved CTC cannot be changed. To change a rate, save a new
              version with a new Effective From date. Existing CTC records keep the version they were saved
              with; employees move to new rates only when HR creates a new CTC revision.
            </CollapsibleHelp>
          </SectionCard>

          <div className="space-y-4">
            {selected ? (
              <>
                <SectionCard
                  title={`${schemeLabel(scheme)} · from ${fmtDate(selected.effective_from)}`}
                  right={
                    <div className="flex items-center gap-2">
                      {locked ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-ink-muted">
                          <Lock className="h-3 w-3" /> In use — rates are read-only
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={saveInPlace}
                        disabled={saving}
                        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-white text-xs font-medium hover:bg-surface-sunken disabled:opacity-50"
                      >
                        <Save className="h-3.5 w-3.5" />
                        {locked ? "Save Annexure text" : "Save changes"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewOpen(true)}
                        disabled={saving}
                        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-deep disabled:opacity-50"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        New version
                      </button>
                    </div>
                  }
                >
                  <div className="space-y-5">
                    {GROUPS.map((g) => (
                      <div key={g.title}>
                        <p className="type-mono-caption text-ink-muted mb-2">{g.title}</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
                          {g.codes.map((code) => (
                            <label key={code} className="flex items-center justify-between gap-3 text-xs">
                              <span className="text-ink-secondary">{RULE_LABELS[code].label}</span>
                              <span className="inline-flex items-center gap-1">
                                <TinyInput
                                  type="text"
                                  step="any"
                                  value={salaryFiguresHidden() ? MASKED_SECRET : draft.rules[code]}
                                  onChange={(e) => {
                                    if (salaryFiguresHidden()) return;
                                    setRule(code, e.target.value);
                                  }}
                                  disabled={locked || salaryFiguresHidden()}
                                  readOnly={salaryFiguresHidden()}
                                  className={`w-28 text-right tabular-nums ${salaryFiguresHidden() ? "bg-slate-100 text-slate-400" : ""}`}
                                />
                                <span className="w-8 text-ink-muted">{RULE_LABELS[code].unit}</span>
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </SectionCard>

                <SectionCard title="Derived values">
                  {derivedOk ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                      <div>
                        <p className="text-ink-muted">Benchmark limit – Skilled</p>
                        <p className="font-semibold tabular-nums">₹{fmtMoney(benchmarkLimit(numericRules, "skilled"))}</p>
                      </div>
                      <div>
                        <p className="text-ink-muted">Benchmark limit – Semi-skilled</p>
                        <p className="font-semibold tabular-nums">₹{fmtMoney(benchmarkLimit(numericRules, "semi_skilled"))}</p>
                      </div>
                      <div>
                        <p className="text-ink-muted">Minimum Gross (Bands 2/3) – Skilled / Semi-skilled</p>
                        <p className="font-semibold tabular-nums">
                          ₹{fmtMoney(minimumValidGross(numericRules, "skilled"))} / ₹
                          {fmtMoney(minimumValidGross(numericRules, "semi_skilled"))}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-ink-muted">Fill every rule value to see derived limits.</p>
                  )}
                </SectionCard>

                <SectionCard title="Annexure-I text">
                  <div className="space-y-3 text-xs">
                    <label className="block">
                      <span className="text-ink-secondary">Title</span>
                      <input
                        className="mt-1 w-full h-8 border border-gray-300 rounded px-2"
                        value={draft.annexureTitle}
                        onChange={(e) => setDraft((d) => ({ ...d, annexureTitle: e.target.value }))}
                      />
                    </label>
                    <label className="block">
                      <span className="text-ink-secondary">Footer note</span>
                      <textarea
                        rows={3}
                        className="mt-1 w-full border border-gray-300 rounded px-2 py-1.5"
                        value={draft.annexureNote}
                        onChange={(e) => setDraft((d) => ({ ...d, annexureNote: e.target.value }))}
                      />
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <label className="block">
                        <span className="text-ink-secondary">Signatory – company line</span>
                        <input
                          className="mt-1 w-full h-8 border border-gray-300 rounded px-2"
                          value={draft.signatoryCompany}
                          onChange={(e) => setDraft((d) => ({ ...d, signatoryCompany: e.target.value }))}
                        />
                      </label>
                      <label className="block">
                        <span className="text-ink-secondary">Signatory – title</span>
                        <input
                          className="mt-1 w-full h-8 border border-gray-300 rounded px-2"
                          value={draft.signatoryTitle}
                          onChange={(e) => setDraft((d) => ({ ...d, signatoryTitle: e.target.value }))}
                        />
                      </label>
                    </div>
                    <label className="block">
                      <span className="text-ink-secondary">Remarks</span>
                      <input
                        className="mt-1 w-full h-8 border border-gray-300 rounded px-2"
                        value={draft.remarks}
                        onChange={(e) => setDraft((d) => ({ ...d, remarks: e.target.value }))}
                      />
                    </label>
                  </div>
                </SectionCard>
              </>
            ) : (
              <SectionCard title="No rules yet">
                <p className="text-xs text-ink-secondary">
                  No rule version exists for {schemeLabel(scheme)}. Ask the system administrator to apply the latest
                  database update.
                </p>
              </SectionCard>
            )}
          </div>
        </div>
      )}

      <Modal
        open={newOpen}
        title="Save as new version"
        onClose={() => setNewOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setNewOpen(false)}
              className="h-8 px-3 rounded-lg border border-border bg-white text-xs"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveNewVersion}
              disabled={saving}
              className="h-8 px-3 rounded-lg bg-accent text-white text-xs font-medium disabled:opacity-50"
            >
              Save version
            </button>
          </div>
        }
      >
        <div className="space-y-3 text-xs">
          <p className="text-ink-secondary">
            The values on screen are saved as a new version. Earlier versions stay unchanged.
          </p>
          <label className="block">
            <span className="text-ink-secondary">Effective From</span>
            <div className="mt-1">
              <TinyInput type="date" value={newFrom} onChange={(e) => setNewFrom(e?.target?.value || "")} />
            </div>
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={newBothSchemes}
              onChange={(e) => setNewBothSchemes(e.target.checked)}
            />
            <span>Apply to both Old and New Scheme</span>
          </label>
        </div>
      </Modal>
    </div>
  );
}
