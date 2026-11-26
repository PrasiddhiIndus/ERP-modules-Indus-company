import React, { useEffect, useMemo, useState } from "react";
import {
  FormField,
  Modal,
  PrimaryButton,
  SecondaryButton,
  TinyInput,
  TinySelect,
} from "../../components/erpUi";
import { toast } from "../../lib/toast";
import { getItSupportModuleOptions } from "../itSupport/itSupportModuleOptions";
import { createRequest, listRequiredLevelRules, listSignoffRules, userMessage } from "./qaApi";
import { CHANGE_CLASSES, QA_ROLES, REQUEST_TYPES } from "./qaConstants";
import { ClassChip, RiskChip } from "./components/QaChips";
import {
  defaultChangeClass,
  requiredLevelsFor,
  reviewRuleText,
  riskFromLikelihoodImpact,
  riskScore,
  signoffRolesFor,
} from "./qaRules";
import { useQaRelease } from "./QaReleaseContext";

export function getQaModuleOptions() {
  return getItSupportModuleOptions().map((m) => m.label);
}

function levelLabel(value) {
  const map = {
    unit: "Unit",
    integration: "Integration",
    system: "System",
    regression: "Regression",
    acceptance: "Acceptance",
    security: "Security",
    performance: "Performance",
    smoke: "Smoke",
  };
  return map[value] || value;
}

function roleLabel(value) {
  return QA_ROLES.find((r) => r.value === value)?.label || String(value || "").replace(/_/g, " ");
}

function RiskMatrix({ likelihood, impact, onSelect }) {
  const levels = [1, 2, 3];
  const cellTone = (l, i) => {
    const band = riskFromLikelihoodImpact(l, i);
    if (band === "high") return "bg-critical-soft border-critical-border";
    if (band === "medium") return "bg-warning-soft border-warning-border";
    return "bg-success-soft border-success-border";
  };
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium text-ink-muted">Risk matrix (likelihood × impact)</p>
      <table className="w-full border-collapse text-[10px]">
        <thead>
          <tr>
            <th className="w-8 text-[9px] text-ink-muted font-normal align-bottom">Like.</th>
            <th colSpan={3} className="text-ink-muted font-medium pb-1 text-center">
              Impact
            </th>
          </tr>
          <tr>
            <th />
            {levels.map((n) => (
              <th key={n} className="text-ink-muted font-medium pb-1">
                {n}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {levels.map((l) => (
            <tr key={l}>
              <td className="text-ink-muted font-medium pr-1 align-middle w-8 text-center">{l}</td>
              {levels.map((i) => {
                const selected = Number(likelihood) === l && Number(impact) === i;
                return (
                  <td key={i} className="p-0.5">
                    <button
                      type="button"
                      title={`Likelihood ${l}, impact ${i} — score ${l * i}`}
                      onClick={() => onSelect(l, i)}
                      className={`w-full min-h-[2rem] rounded border text-[10px] font-medium transition-shadow ${
                        cellTone(l, i)
                      } ${selected ? "ring-2 ring-accent ring-offset-1" : "hover:opacity-90"}`}
                    >
                      {l * i}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] text-ink-muted">Row = likelihood · column = impact</p>
    </div>
  );
}

function Segmented({ value, options, onChange, ariaLabel }) {
  return (
    <div className="inline-flex rounded-md border border-border overflow-hidden" role="group" aria-label={ariaLabel}>
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          className={`h-8 min-w-[2.25rem] px-2.5 text-xs border-l border-border first:border-l-0 ${
            Number(value) === opt ? "bg-accent text-white" : "bg-surface text-ink-secondary hover:bg-surface-sunken"
          }`}
          onClick={() => onChange(opt)}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function buildRequiredMap(rules) {
  const map = {};
  for (const row of rules || []) {
    const k = `${row.change_class}:${row.risk}`;
    if (!map[k]) map[k] = [];
    map[k].push(row.requirement);
  }
  return map;
}

function buildSignoffMap(rules) {
  const map = {};
  for (const row of rules || []) {
    if (!map[row.change_class]) map[row.change_class] = [];
    if (!map[row.change_class].includes(row.signer_role)) map[row.change_class].push(row.signer_role);
  }
  return map;
}

export default function RequestFormModal({ open, onClose, onCreated }) {
  const { releases, releaseId: contextReleaseId } = useQaRelease();
  const moduleLabels = useMemo(() => getItSupportModuleOptions().map((m) => m.label), []);

  const [title, setTitle] = useState("");
  const [requestType, setRequestType] = useState("enhancement");
  const [module, setModule] = useState("");
  const [moduleMode, setModuleMode] = useState("select");
  const [changeClass, setChangeClass] = useState(() => defaultChangeClass("enhancement"));
  const [classTouched, setClassTouched] = useState(false);
  const [likelihood, setLikelihood] = useState(1);
  const [impact, setImpact] = useState(2);
  const [releaseId, setReleaseId] = useState(contextReleaseId || "");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [ruleRows, setRuleRows] = useState([]);
  const [signoffRows, setSignoffRows] = useState([]);

  useEffect(() => {
    if (!open) return;
    setReleaseId(contextReleaseId || "");
    let cancelled = false;
    (async () => {
      try {
        const [reqRules, signRules] = await Promise.all([listRequiredLevelRules(), listSignoffRules()]);
        if (!cancelled) {
          setRuleRows(reqRules);
          setSignoffRows(signRules);
        }
      } catch {
        /* preview falls back to qaRules.js */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, contextReleaseId]);

  useEffect(() => {
    if (!classTouched) setChangeClass(defaultChangeClass(requestType));
  }, [requestType, classTouched]);

  const risk = useMemo(() => riskFromLikelihoodImpact(likelihood, impact), [likelihood, impact]);
  const score = useMemo(() => riskScore(likelihood, impact), [likelihood, impact]);

  const requiredMap = useMemo(() => buildRequiredMap(ruleRows), [ruleRows]);
  const signoffMap = useMemo(() => buildSignoffMap(signoffRows), [signoffRows]);

  const requiredLevels = useMemo(() => {
    const fromApi = requiredMap[`${changeClass}:${risk}`];
    if (fromApi?.length) return fromApi;
    return requiredLevelsFor(changeClass, risk);
  }, [requiredMap, changeClass, risk]);

  const signoffRoles = useMemo(() => {
    const fromApi = signoffMap[changeClass];
    if (fromApi?.length) return fromApi;
    return signoffRolesFor(changeClass);
  }, [signoffMap, changeClass]);

  const resetForm = () => {
    setTitle("");
    setRequestType("enhancement");
    setModule("");
    setModuleMode("select");
    setChangeClass(defaultChangeClass("enhancement"));
    setClassTouched(false);
    setLikelihood(1);
    setImpact(2);
    setDescription("");
    setReleaseId(contextReleaseId || "");
  };

  const handleClose = () => {
    if (saving) return;
    resetForm();
    onClose?.();
  };

  const submit = async () => {
    const trimmedTitle = title.trim();
    const mod = module.trim();
    if (!trimmedTitle) {
      toast.error("Enter a title.");
      return;
    }
    if (!mod) {
      toast.error("Choose or enter an ERP module.");
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      const row = await createRequest({
        title: trimmedTitle,
        request_type: requestType,
        change_class: changeClass,
        module: mod,
        likelihood: Number(likelihood),
        impact: Number(impact),
        release_id: releaseId || null,
        description: description.trim() || null,
      });
      toast.success(`Request ${row.code} created`);
      resetForm();
      onCreated?.(row);
      onClose?.();
    } catch (err) {
      toast.error(userMessage(err, "Could not create request."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title="New QA request"
      onClose={handleClose}
      footer={
        <div className="flex justify-end gap-2">
          <SecondaryButton onClick={handleClose} disabled={saving}>
            Cancel
          </SecondaryButton>
          <PrimaryButton onClick={submit} disabled={saving}>
            {saving ? "Creating…" : "Create request"}
          </PrimaryButton>
        </div>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-3 min-w-0">
          <FormField label="Title" required>
            <TinyInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short summary" />
          </FormField>
          <FormField label="Type" required>
            <TinySelect value={requestType} onChange={(e) => setRequestType(e.target.value)}>
              {REQUEST_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </TinySelect>
          </FormField>
          <FormField
            label="ERP module"
            required
            hint={
              <button
                type="button"
                className="text-accent hover:underline"
                onClick={() => setModuleMode((m) => (m === "select" ? "text" : "select"))}
              >
                {moduleMode === "select" ? "Type a custom module" : "Pick from list"}
              </button>
            }
          >
            {moduleMode === "select" ? (
              <TinySelect value={module} onChange={(e) => setModule(e.target.value)}>
                <option value="">— Select —</option>
                {moduleLabels.map((label) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))}
              </TinySelect>
            ) : (
              <TinyInput value={module} onChange={(e) => setModule(e.target.value)} placeholder="e.g. HR Payroll" />
            )}
          </FormField>
          <FormField label="Change class">
            <TinySelect
              value={changeClass}
              onChange={(e) => {
                setClassTouched(true);
                setChangeClass(e.target.value);
              }}
            >
              {CHANGE_CLASSES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </TinySelect>
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Likelihood (1–3)">
              <Segmented value={likelihood} options={[1, 2, 3]} onChange={setLikelihood} ariaLabel="Likelihood" />
            </FormField>
            <FormField label="Impact (1–3)">
              <Segmented value={impact} options={[1, 2, 3]} onChange={setImpact} ariaLabel="Impact" />
            </FormField>
          </div>
          <FormField label="Target release">
            <TinySelect value={releaseId} onChange={(e) => setReleaseId(e.target.value)}>
              <option value="">Unassigned (intake)</option>
              {releases.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.id}
                  {r.status !== "open" ? ` (${r.status})` : ""}
                </option>
              ))}
            </TinySelect>
          </FormField>
          <FormField label="Description">
            <textarea
              className="w-full min-h-[88px] border border-border rounded-control px-2.5 py-2 text-xs bg-surface"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Scope, acceptance notes, links…"
            />
          </FormField>
        </div>

        <div className="rounded-lg border border-border bg-surface-sunken/50 p-3 space-y-3 min-w-0">
          <p className="text-xs font-semibold text-ink-strong">Live preview</p>
          <div className="flex flex-wrap items-center gap-2">
            <ClassChip changeClass={changeClass} />
            <RiskChip risk={risk} />
            <span className="text-[11px] text-ink-muted">Score {score}</span>
          </div>
          <RiskMatrix
            likelihood={likelihood}
            impact={impact}
            onSelect={(l, i) => {
              setLikelihood(l);
              setImpact(i);
            }}
          />
          <div>
            <p className="text-[11px] font-medium text-ink-muted mb-1">Required test levels</p>
            <div className="flex flex-wrap gap-1">
              {requiredLevels.length ? (
                requiredLevels.map((lvl) => (
                  <span
                    key={lvl}
                    className="inline-flex px-2 py-0.5 rounded border border-border bg-surface text-[11px] text-ink-secondary"
                  >
                    {levelLabel(lvl)}
                  </span>
                ))
              ) : (
                <span className="text-[11px] text-ink-muted">No levels for this class and risk.</span>
              )}
            </div>
          </div>
          <div>
            <p className="text-[11px] font-medium text-ink-muted mb-1">Sign-offs before close</p>
            <ul className="text-[11px] text-ink-secondary space-y-0.5">
              {signoffRoles.map((role) => (
                <li key={role}>{roleLabel(role)}</li>
              ))}
            </ul>
          </div>
          <p className="text-[11px] text-ink-secondary border-t border-border pt-2">{reviewRuleText(risk)}</p>
        </div>
      </div>
    </Modal>
  );
}