import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import {
  EmptyState,
  FormField,
  InlineAlert,
  LoadingBlock,
  Modal,
  PageTaskHeader,
  PrimaryButton,
  SecondaryButton,
  SectionCard,
  TinyInput,
  TinySelect,
} from "../../components/erpUi";
import { toast } from "../../lib/toast";
import { useAuth } from "../../contexts/AuthContext";
import { blockedReason } from "./qaAccess";
import { ENVIRONMENTS, QA_BASE, RESULTS } from "./qaConstants";
import { overallResultFromSteps } from "./qaRules";
import { useQaRelease } from "./QaReleaseContext";
import {
  createRun,
  getCaseVersion,
  getRun,
  getTestCase,
  listExecutions,
  listRunCases,
  listRuns,
  listTestCases,
  listCaseVersions,
  recordExecution,
  userMessage,
} from "./qaApi";
import { ResultChip } from "./components/QaChips";

export default function ExecutionPage() {
  const { idOrCode } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { access, qaRole } = useOutletContext() || {};
  const { releaseId } = useQaRelease();
  const [runs, setRuns] = useState([]);
  const [run, setRun] = useState(null);
  const [runCases, setRunCases] = useState([]);
  const [selectedCaseId, setSelectedCaseId] = useState(null);
  const [version, setVersion] = useState(null);
  const [caseMeta, setCaseMeta] = useState(null);
  const [stepResults, setStepResults] = useState([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [actual, setActual] = useState("");
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [newForm, setNewForm] = useState({ name: "", build: "", environment: "QA-01" });
  const [approvedCases, setApprovedCases] = useState([]);
  const [selectedCases, setSelectedCases] = useState({});

  const canRecord = access?.canRecordResult;
  const canCreate = access?.canCreateRun;
  const latest = history[0] || null;
  const locked = Boolean(latest);

  const loadRuns = useCallback(async () => {
    if (!releaseId) {
      setRuns([]);
      return;
    }
    const rows = await listRuns(releaseId);
    setRuns(rows);
  }, [releaseId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        await loadRuns();
        if (idOrCode) {
          const r = await getRun(idOrCode);
          if (!cancelled) setRun(r);
        } else if (!cancelled) {
          setRun(null);
        }
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not load runs.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [idOrCode, loadRuns]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!run?.id) {
        setRunCases([]);
        return;
      }
      try {
        const rc = await listRunCases(run.id);
        if (!cancelled) {
          setRunCases(rc);
          setSelectedCaseId((prev) => prev || rc[0]?.case_id || null);
        }
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not load run cases.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [run?.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!run?.id || !selectedCaseId) {
        setVersion(null);
        setCaseMeta(null);
        setHistory([]);
        return;
      }
      const rc = runCases.find((c) => c.case_id === selectedCaseId);
      if (!rc) return;
      try {
        const [cse, ver, execs] = await Promise.all([
          getTestCase(selectedCaseId),
          getCaseVersion(selectedCaseId, rc.case_version),
          listExecutions({ runId: run.id, caseId: selectedCaseId }),
        ]);
        if (cancelled) return;
        setCaseMeta(cse);
        setVersion(ver);
        setHistory(execs);
        const steps = Array.isArray(ver?.steps) ? ver.steps : [];
        setStepResults(steps.map(() => "not_run"));
        setCurrentStep(0);
        setActual("");
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not load case.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [run?.id, selectedCaseId, runCases]);

  const overall = useMemo(() => overallResultFromSteps(stepResults), [stepResults]);

  const markStep = (result) => {
    if (locked || !canRecord) return;
    setStepResults((prev) => {
      const next = [...prev];
      next[currentStep] = result;
      if (result === "fail" || result === "blocked") {
        for (let i = currentStep + 1; i < next.length; i += 1) next[i] = "not_run";
      }
      return next;
    });
    if (result === "pass" && currentStep < stepResults.length - 1) {
      setCurrentStep((s) => s + 1);
    }
  };

  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || e.target?.isContentEditable) return;
      if (locked || !canRecord) return;
      const k = e.key.toLowerCase();
      if (k === "p") markStep("pass");
      if (k === "f") markStep("fail");
      if (k === "b") markStep("blocked");
      if (k === "n") {
        const idx = runCases.findIndex((c) => c.case_id === selectedCaseId);
        const next = runCases[idx + 1];
        if (next) setSelectedCaseId(next.case_id);
      }
      if ((e.metaKey || e.ctrlKey) && k === "enter") {
        e.preventDefault();
        void onRecord();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked, canRecord, currentStep, stepResults, runCases, selectedCaseId, actual, overall]);

  const onRecord = async () => {
    if (!canRecord) {
      toast.error(blockedReason("canRecordResult", qaRole));
      return;
    }
    if (!overall) {
      toast.error("Mark each step before recording.");
      return;
    }
    if (overall === "fail" && !String(actual || "").trim()) {
      toast.error("Actual result is required for a failure.");
      return;
    }
    setSaving(true);
    try {
      await recordExecution({
        run_id: run.id,
        case_id: selectedCaseId,
        case_version: version.version,
        result: overall,
        step_results: stepResults,
        actual_result: actual || null,
      });
      toast.success("Result recorded");
      const execs = await listExecutions({ runId: run.id, caseId: selectedCaseId });
      setHistory(execs);
      const idx = runCases.findIndex((c) => c.case_id === selectedCaseId);
      const nextNotRun = runCases.slice(idx + 1).find((c) => c);
      if (nextNotRun) setSelectedCaseId(nextNotRun.case_id);
    } catch (err) {
      toast.error(userMessage(err, "Could not record result."));
    } finally {
      setSaving(false);
    }
  };

  const openNewRun = async () => {
    if (!canCreate) {
      toast.error(blockedReason("canCreateRun", qaRole));
      return;
    }
    if (!releaseId) {
      toast.error("Select a release first.");
      return;
    }
    const cases = await listTestCases({ releaseId, status: "approved" });
    const withVersions = [];
    for (const c of cases) {
      const vers = await listCaseVersions(c.id);
      const approved = vers.find((v) => v.approved_by);
      if (approved) withVersions.push({ ...c, case_version: approved.version, title: approved.title });
    }
    setApprovedCases(withVersions);
    setSelectedCases(Object.fromEntries(withVersions.map((c) => [c.id, true])));
    setNewForm({ name: `${releaseId} run`, build: "", environment: "QA-01" });
    setNewOpen(true);
  };

  const submitNewRun = async () => {
    if (!newForm.name.trim() || !newForm.build.trim()) {
      toast.error("Name and build are required.");
      return;
    }
    setSaving(true);
    try {
      const cases = approvedCases
        .filter((c) => selectedCases[c.id])
        .map((c) => ({ case_id: c.id, case_version: c.case_version, assigned_to: user?.id || null }));
      const created = await createRun({
        name: newForm.name.trim(),
        releaseId,
        build: newForm.build.trim(),
        environment: newForm.environment,
        cases,
      });
      toast.success(`Created ${created.code}`);
      setNewOpen(false);
      navigate(`${QA_BASE}/runs/${created.code}`);
    } catch (err) {
      toast.error(userMessage(err, "Could not create run."));
    } finally {
      setSaving(false);
    }
  };

  if (!releaseId) {
    return (
      <>
        <PageTaskHeader title="Execution" subtitle="Select a release to manage test runs." />
        <EmptyState title="No release selected" message="Choose a release in the header." />
      </>
    );
  }

  return (
    <>
      <PageTaskHeader
        title="Test execution"
        subtitle={run ? `${run.code} · ${run.build} · ${run.environment}` : "Select or create a run"}
        actions={
          <div className="flex flex-wrap gap-2">
            <TinySelect
              value={run?.code || ""}
              onChange={(e) => {
                const code = e.target.value;
                if (code) navigate(`${QA_BASE}/runs/${code}`);
                else navigate(`${QA_BASE}/execution`);
              }}
            >
              <option value="">Select run…</option>
              {runs.map((r) => (
                <option key={r.id} value={r.code}>
                  {r.code} — {r.name}
                </option>
              ))}
            </TinySelect>
            <PrimaryButton type="button" onClick={openNewRun} disabled={!canCreate} title={!canCreate ? blockedReason("canCreateRun", qaRole) : undefined}>
              New test run
            </PrimaryButton>
          </div>
        }
      />
      {error ? <InlineAlert tone="error" className="mb-3">{error}</InlineAlert> : null}
      {loading ? (
        <LoadingBlock label="Loading…" />
      ) : !run ? (
        <EmptyState title="No run selected" message="Pick a run or create one for this release." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <SectionCard title="Cases" className="lg:col-span-1">
            <ul className="space-y-1 max-h-[70vh] overflow-auto">
              {runCases.map((rc) => (
                <li key={rc.case_id}>
                  <button
                    type="button"
                    className={`w-full text-left px-2 py-2 rounded border text-xs ${
                      selectedCaseId === rc.case_id
                        ? "border-accent bg-accent-soft"
                        : "border-border hover:bg-surface-sunken"
                    }`}
                    onClick={() => setSelectedCaseId(rc.case_id)}
                  >
                    Case #{rc.case_id} · v{rc.case_version}
                  </button>
                </li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard title="Execution player" className="lg:col-span-2">
            {!version ? (
              <EmptyState title="Select a case" message="Choose a case from the list." />
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-sm font-semibold text-ink">{caseMeta?.code}</span>
                  <span className="text-xs text-ink-muted">v{version.version}</span>
                  <span className="text-xs text-ink-secondary">{version.level} / {version.test_type}</span>
                  {locked ? <ResultChip result={latest.result} /> : null}
                </div>
                <p className="text-sm text-ink-strong">{version.title}</p>
                {version.preconditions ? (
                  <p className="text-xs text-ink-secondary">
                    <strong>Preconditions:</strong> {version.preconditions}
                  </p>
                ) : null}
                {version.test_data ? (
                  <p className="text-xs text-ink-secondary">
                    <strong>Test data:</strong> {version.test_data}
                  </p>
                ) : null}

                <ol className="space-y-2">
                  {(version.steps || []).map((step, idx) => (
                    <li
                      key={idx}
                      className={`rounded border p-2.5 text-xs ${
                        idx === currentStep && !locked ? "border-accent bg-accent-soft/40" : "border-border"
                      }`}
                    >
                      <div className="font-medium text-ink">
                        Step {idx + 1}: {step.action}
                      </div>
                      <div className="text-ink-muted mt-0.5">Expected: {step.expected}</div>
                      <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                        <ResultChip result={locked ? latest?.step_results?.[idx] : stepResults[idx]} />
                        {!locked && canRecord
                          ? RESULTS.filter((r) => r.value !== "not_run").map((r) => (
                              <SecondaryButton key={r.value} type="button" onClick={() => { setCurrentStep(idx); markStep(r.value); }}>
                                {r.label}
                              </SecondaryButton>
                            ))
                          : null}
                      </div>
                    </li>
                  ))}
                </ol>

                {!locked ? (
                  <>
                    <FormField label="Actual result">
                      <textarea
                        className="w-full min-h-[72px] border border-border rounded-control px-2.5 py-2 text-xs"
                        value={actual}
                        onChange={(e) => setActual(e.target.value)}
                        placeholder={overall === "fail" ? "Required for failures" : "Optional notes"}
                      />
                    </FormField>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-ink-muted">Overall:</span>
                      {overall ? <ResultChip result={overall} /> : <span className="text-xs text-ink-muted">—</span>}
                      <PrimaryButton type="button" disabled={saving || !canRecord} onClick={onRecord}>
                        {saving ? "Saving…" : "Record result"}
                      </PrimaryButton>
                      <span className="text-[10px] text-ink-muted">Shortcuts: P / F / B · N next · ⌘/Ctrl+Enter</span>
                    </div>
                  </>
                ) : (
                  <div className="space-y-2">
                    <InlineAlert tone="info">
                      Attempt {latest.attempt} recorded. Results are locked — use Retest for a new attempt.
                    </InlineAlert>
                    {latest.actual_result ? (
                      <p className="text-xs text-ink-secondary">
                        <strong>Actual:</strong> {latest.actual_result}
                      </p>
                    ) : null}
                    <SecondaryButton
                      type="button"
                      disabled={!canRecord}
                      onClick={() => {
                        const steps = Array.isArray(version.steps) ? version.steps : [];
                        setStepResults(steps.map(() => "not_run"));
                        setCurrentStep(0);
                        setActual("");
                        setHistory([]);
                      }}
                    >
                      Retest (new attempt)
                    </SecondaryButton>
                    <p className="text-[11px] text-ink-muted">
                      Attempt history: {history.map((h) => `#${h.attempt} ${h.result}`).join(" · ") || "—"}
                    </p>
                  </div>
                )}
              </div>
            )}
          </SectionCard>
        </div>
      )}

      <Modal
        open={newOpen}
        title="New test run"
        onClose={() => !saving && setNewOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <SecondaryButton onClick={() => setNewOpen(false)} disabled={saving}>
              Cancel
            </SecondaryButton>
            <PrimaryButton onClick={submitNewRun} disabled={saving}>
              {saving ? "Creating…" : "Create run"}
            </PrimaryButton>
          </div>
        }
      >
        <div className="space-y-3">
          <FormField label="Name">
            <TinyInput value={newForm.name} onChange={(e) => setNewForm((f) => ({ ...f, name: e.target.value }))} />
          </FormField>
          <FormField label="Build">
            <TinyInput value={newForm.build} onChange={(e) => setNewForm((f) => ({ ...f, build: e.target.value }))} />
          </FormField>
          <FormField label="Environment">
            <TinySelect value={newForm.environment} onChange={(e) => setNewForm((f) => ({ ...f, environment: e.target.value }))}>
              {ENVIRONMENTS.map((env) => (
                <option key={env.value} value={env.value}>
                  {env.label}
                </option>
              ))}
            </TinySelect>
          </FormField>
          <div>
            <p className="text-xs font-medium text-ink mb-1">Approved cases</p>
            <ul className="max-h-48 overflow-auto border border-border rounded-md divide-y divide-border">
              {approvedCases.map((c) => (
                <li key={c.id} className="px-2 py-1.5 text-xs flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(selectedCases[c.id])}
                    onChange={(e) => setSelectedCases((s) => ({ ...s, [c.id]: e.target.checked }))}
                  />
                  <span>
                    {c.code} · {c.title}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Modal>
    </>
  );
}
