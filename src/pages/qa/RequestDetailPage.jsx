import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import {
  DenseTable,
  EmptyState,
  FormField,
  InlineAlert,
  LoadingBlock,
  PageTaskHeader,
  PrimaryButton,
  SecondaryButton,
  SectionCard,
  TinyInput,
  TinySelect,
} from "../../components/erpUi";
import { toast } from "../../lib/toast";
import { blockedReason } from "./qaAccess";
import {
  CHANGE_CLASSES,
  QA_BASE,
  QA_ROLES,
  REQUEST_TYPES,
  STAGES,
  stageLabel,
} from "./qaConstants";
import {
  advanceRequest,
  getRequest,
  listCoverage,
  listDefects,
  listRequestSignoffs,
  listTestCases,
  signRequest,
  updateRequest,
  userMessage,
} from "./qaApi";
import { signoffRolesFor } from "./qaRules";
import {
  ClassChip,
  CoverageChip,
  RiskChip,
  SeverityChip,
  StageChip,
} from "./components/QaChips";
import { useQaRelease } from "./QaReleaseContext";

function roleLabel(value) {
  return QA_ROLES.find((r) => r.value === value)?.label || String(value || "").replace(/_/g, " ");
}

function typeLabel(value) {
  return REQUEST_TYPES.find((t) => t.value === value)?.label || value || "—";
}

function classLabel(value) {
  return CHANGE_CLASSES.find((c) => c.value === value)?.label || value || "—";
}

function nextStageValue(stage) {
  const idx = STAGES.findIndex((s) => s.value === stage);
  if (idx < 0 || idx >= STAGES.length - 1) return null;
  return STAGES[idx + 1].value;
}

function canAdvanceStage(access, stage) {
  if (!access?.isMember || access.isViewerOnly) return false;
  if (stage === "intake") return access.canTriageRequest;
  if (stage === "close") return false;
  return access.canWrite;
}

function canEditEvidence(access, stage) {
  if (!access?.canWrite) return false;
  return stage === "design" || stage === "execute";
}

function canEditRelease(stage) {
  return stage === "intake" || stage === "plan";
}

export default function RequestDetailPage() {
  const { idOrCode } = useParams();
  const navigate = useNavigate();
  const { access, qaRole } = useOutletContext() || {};
  const { releases } = useQaRelease();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [request, setRequest] = useState(null);
  const [coverage, setCoverage] = useState([]);
  const [signoffs, setSignoffs] = useState([]);
  const [cases, setCases] = useState([]);
  const [defects, setDefects] = useState([]);
  const [advanceReasons, setAdvanceReasons] = useState([]);
  const [busy, setBusy] = useState(false);
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [releaseDraft, setReleaseDraft] = useState("");

  const load = useCallback(async () => {
    if (!idOrCode) return;
    setLoading(true);
    setError("");
    setAdvanceReasons([]);
    try {
      const req = await getRequest(idOrCode);
      if (!req) {
        setRequest(null);
        setError("Request not found.");
        return;
      }
      setRequest(req);
      setEvidenceUrl(req.unit_evidence_url || "");
      setReleaseDraft(req.release_id || "");
      const [cov, signs, caseRows, defRows] = await Promise.all([
        listCoverage({ requestId: req.id }),
        listRequestSignoffs(req.id),
        listTestCases({ requestId: req.id }),
        listDefects({ requestId: req.id }),
      ]);
      setCoverage(cov);
      setSignoffs(signs);
      setCases(caseRows);
      setDefects(defRows || []);
    } catch (err) {
      setError(err.message || "Could not load request.");
      setRequest(null);
    } finally {
      setLoading(false);
    }
  }, [idOrCode]);

  useEffect(() => {
    load();
  }, [load]);

  const nextStage = nextStageValue(request?.stage);
  const expectedSignoffs = useMemo(
    () => signoffRolesFor(request?.change_class),
    [request?.change_class]
  );

  const signedMap = useMemo(() => {
    const m = new Map();
    signoffs.forEach((s) => m.set(s.signer_role, s));
    return m;
  }, [signoffs]);

  const saveEvidence = async () => {
    if (!request || busy) return;
    if (!canEditEvidence(access, request.stage)) return;
    setBusy(true);
    try {
      const saved = await updateRequest(request.id, { unit_evidence_url: evidenceUrl.trim() || null });
      setRequest(saved);
      toast.success("Unit test evidence updated");
    } catch (err) {
      toast.error(userMessage(err, "Could not save evidence link."));
    } finally {
      setBusy(false);
    }
  };

  const saveRelease = async () => {
    if (!request || busy) return;
    if (!canEditRelease(request.stage)) return;
    setBusy(true);
    try {
      const saved = await updateRequest(request.id, {
        release_id: releaseDraft || null,
      });
      setRequest(saved);
      setReleaseDraft(saved.release_id || "");
      toast.success("Target release updated");
    } catch (err) {
      toast.error(userMessage(err, "Could not update release."));
    } finally {
      setBusy(false);
    }
  };

  const handleAdvance = async () => {
    if (!request || !nextStage || busy) return;
    if (!canAdvanceStage(access, request.stage)) return;
    setBusy(true);
    setAdvanceReasons([]);
    try {
      const reasons = await advanceRequest(request.id);
      if (reasons?.length) {
        setAdvanceReasons(reasons);
      } else {
        toast.success(`Moved to ${stageLabel(nextStage)}`);
        await load();
      }
    } catch (err) {
      toast.error(userMessage(err, "Could not advance request."));
    } finally {
      setBusy(false);
    }
  };

  const handleSign = async (signerRole) => {
    if (!request || busy) return;
    if (request.stage !== "execute") return;
    if (!access?.canSignAs?.(signerRole)) return;
    setBusy(true);
    try {
      await signRequest({ requestId: request.id, signerRole });
      toast.success("Sign-off recorded");
      const signs = await listRequestSignoffs(request.id);
      setSignoffs(signs);
    } catch (err) {
      toast.error(userMessage(err, "Could not sign off."));
    } finally {
      setBusy(false);
    }
  };

  const caseColumns = useMemo(
    () => [
      {
        key: "code",
        label: "Case",
        render: (c) => <span className="font-medium text-accent">{c.code}</span>,
      },
      {
        key: "status",
        label: "Status",
        render: (c) => c.status?.replace(/_/g, " ") || "—",
      },
      {
        key: "version",
        label: "Version",
        render: (c) => c.current_version ?? "—",
      },
    ],
    []
  );

  const defectColumns = useMemo(
    () => [
      {
        key: "code",
        label: "Defect",
        render: (d) => <span className="font-medium text-accent">{d.code}</span>,
      },
      {
        key: "title",
        label: "Title",
        render: (d) => <span className="max-w-[200px] truncate block">{d.title}</span>,
      },
      {
        key: "severity",
        label: "Severity",
        render: (d) => <SeverityChip severity={d.severity} />,
      },
      {
        key: "status",
        label: "Status",
        render: (d) => d.status?.replace(/_/g, " ") || "—",
      },
    ],
    []
  );

  const advanceBlockedTitle =
    request?.stage === "intake"
      ? blockedReason("canTriageRequest", qaRole)
      : blockedReason("canWrite", qaRole);

  if (loading) {
    return <LoadingBlock label="Loading request…" />;
  }

  if (!request) {
    return (
      <>
        <PageTaskHeader title="Request" subtitle={idOrCode} />
        {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}
        <EmptyState title="Not found" message="This QA request could not be loaded." />
        <Link to={`${QA_BASE}/requests`} className="text-xs text-accent hover:underline mt-2 inline-flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to board
        </Link>
      </>
    );
  }

  return (
    <>
      <PageTaskHeader
        title={request.title}
        subtitle={`${request.code} · ${typeLabel(request.request_type)} · ${request.module || "No module"}`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <SecondaryButton onClick={() => navigate(`${QA_BASE}/requests`)}>
            <ArrowLeft className="w-3.5 h-3.5 mr-1" />
            Board
          </SecondaryButton>
          {nextStage ? (
            <PrimaryButton
              onClick={handleAdvance}
              disabled={busy || !canAdvanceStage(access, request.stage)}
              title={!canAdvanceStage(access, request.stage) ? advanceBlockedTitle : undefined}
            >
              {busy ? "Working…" : `Move to ${stageLabel(nextStage)}`}
            </PrimaryButton>
          ) : (
            <span className="text-xs text-ink-muted inline-flex items-center gap-1 border border-border rounded-md px-2 py-1.5 bg-surface-sunken">
              <CheckCircle2 className="w-3.5 h-3.5 text-success" />
              Closed
            </span>
          )}
        </div>
      </PageTaskHeader>

      {error ? (
        <InlineAlert tone="error" onDismiss={() => setError("")} className="mb-2">
          {error}
        </InlineAlert>
      ) : null}

      {advanceReasons.length > 0 ? (
        <InlineAlert tone="warning" className="mb-3" onDismiss={() => setAdvanceReasons([])}>
          <p className="font-medium mb-1">Complete these items before advancing:</p>
          <ul className="list-disc pl-4 space-y-0.5">
            {advanceReasons.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </InlineAlert>
      ) : null}

      <SectionCard title="Workflow" className="mb-4">
        <ol className="flex flex-wrap gap-1 items-center">
          {STAGES.map((s, i) => {
            const done = STAGES.findIndex((x) => x.value === request.stage) > i;
            const current = s.value === request.stage;
            return (
              <React.Fragment key={s.value}>
                {i > 0 ? <span className="text-ink-muted text-xs px-0.5" aria-hidden>›</span> : null}
                <li
                  className={`text-xs px-2.5 py-1.5 rounded-md border list-none ${
                    current
                      ? "border-accent bg-accent-soft text-accent font-semibold"
                      : done
                        ? "border-success-border bg-success-soft/50 text-success"
                        : "border-border bg-surface text-ink-muted"
                  }`}
                >
                  {s.label}
                </li>
              </React.Fragment>
            );
          })}
        </ol>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StageChip stage={request.stage} />
          <ClassChip changeClass={request.change_class} />
          <RiskChip risk={request.risk} />
          <span className="text-[11px] text-ink-muted">
            Likelihood {request.likelihood} × impact {request.impact} (score {request.risk_score ?? "—"})
          </span>
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <SectionCard title="Details">
          <dl className="space-y-2 text-xs">
            <div className="flex gap-2">
              <dt className="text-ink-muted w-28 shrink-0">Change class</dt>
              <dd className="text-ink">{classLabel(request.change_class)}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-ink-muted w-28 shrink-0">Target release</dt>
              <dd className="text-ink min-w-0 flex-1">
                {canEditRelease(request.stage) && access?.canWrite ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <TinySelect
                      value={releaseDraft}
                      disabled={busy}
                      onChange={(e) => setReleaseDraft(e.target.value)}
                      className="max-w-[14rem]"
                    >
                      <option value="">Unassigned</option>
                      {releases.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.id}
                        </option>
                      ))}
                    </TinySelect>
                    <SecondaryButton onClick={saveRelease} disabled={busy}>
                      Save
                    </SecondaryButton>
                  </div>
                ) : (
                  request.release_id || "—"
                )}
              </dd>
            </div>
            {request.description ? (
              <div>
                <dt className="text-ink-muted mb-1">Description</dt>
                <dd className="text-ink whitespace-pre-wrap rounded-md border border-border bg-surface-sunken/40 p-2">
                  {request.description}
                </dd>
              </div>
            ) : null}
          </dl>
        </SectionCard>

        <SectionCard title="Unit test evidence">
          {canEditEvidence(access, request.stage) ? (
            <div className="space-y-2">
              <FormField label="Evidence link" hint="Required before leaving design when unit coverage applies.">
                <TinyInput
                  value={evidenceUrl}
                  onChange={(e) => setEvidenceUrl(e.target.value)}
                  placeholder="https://…"
                  disabled={busy}
                />
              </FormField>
              <SecondaryButton
                onClick={saveEvidence}
                disabled={busy}
                title={!access?.canWrite ? blockedReason("canWrite", qaRole) : undefined}
              >
                Save link
              </SecondaryButton>
            </div>
          ) : (
            <p className="text-xs text-ink-secondary break-all">
              {request.unit_evidence_url ? (
                <a href={request.unit_evidence_url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                  {request.unit_evidence_url}
                </a>
              ) : (
                "—"
              )}
            </p>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Coverage by test level" className="mb-4">
        {coverage.length === 0 ? (
          <EmptyState title="No coverage yet" message="Coverage appears after cases are linked to required levels." />
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {coverage.map((c) => (
              <CoverageChip key={`${c.requirement}-${c.coverage}`} requirement={c.requirement} coverage={c.coverage} />
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Sign-offs" className="mb-4">
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {expectedSignoffs.map((role) => {
            const row = signedMap.get(role);
            const canSign =
              request.stage === "execute" && access?.canSignAs?.(role) && !row;
            return (
              <li
                key={role}
                className="rounded-lg border border-border bg-surface p-3 flex flex-col gap-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-ink-strong">{roleLabel(role)}</span>
                  {row ? (
                    <span className="text-[10px] text-success">Signed</span>
                  ) : (
                    <span className="text-[10px] text-ink-muted">Pending</span>
                  )}
                </div>
                {row?.signed_at ? (
                  <p className="text-[10px] text-ink-muted">
                    {new Date(row.signed_at).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                ) : null}
                {canSign ? (
                  <PrimaryButton onClick={() => handleSign(role)} disabled={busy}>
                    Sign as {roleLabel(role)}
                  </PrimaryButton>
                ) : null}
                {request.stage === "execute" && !row && !canSign ? (
                  <p className="text-[10px] text-ink-muted">Waiting for {roleLabel(role)}.</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title={`Linked test cases (${cases.length})`}>
          {cases.length === 0 ? (
            <EmptyState title="No cases" message="Create cases from the test cases tab." />
          ) : (
            <DenseTable
              columns={caseColumns}
              rows={cases}
              rowKey="id"
              onRowClick={(c) => navigate(`${QA_BASE}/cases/${c.code}`)}
            />
          )}
        </SectionCard>

        <SectionCard title={`Linked defects (${defects.length})`}>
          {defects.length === 0 ? (
            <EmptyState title="No defects" message="No defects are logged against this request." />
          ) : (
            <DenseTable
              columns={defectColumns}
              rows={defects}
              rowKey="id"
              onRowClick={(d) => navigate(`${QA_BASE}/defects/${d.code}`)}
            />
          )}
        </SectionCard>
      </div>
    </>
  );
}