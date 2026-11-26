import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import {
  InlineAlert,
  LoadingBlock,
  PageTaskHeader,
  PrimaryButton,
  SecondaryButton,
  SectionCard,
} from "../../components/erpUi";
import { useAuth } from "../../contexts/AuthContext";
import { toast } from "../../lib/toast";
import { blockedReason } from "./qaAccess";
import { QaBlockedLine } from "./components/QaHelpButton";
import { QA_BASE } from "./qaConstants";
import {
  approveCaseVersion,
  getCaseVersion,
  getRequest,
  getTestCase,
  listCaseVersions,
  setCaseStatus,
} from "./qaApi";
import { CaseStatusChip } from "./components/QaChips";
import { reviewRuleText } from "./qaRules";

export default function TestCaseDetailPage() {
  const { idOrCode } = useParams();
  const navigate = useNavigate();
  const { access } = useOutletContext();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [caseRow, setCaseRow] = useState(null);
  const [versions, setVersions] = useState([]);
  const [versionN, setVersionN] = useState(null);
  const [version, setVersion] = useState(null);
  const [request, setRequest] = useState(null);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    if (!idOrCode) return;
    setLoading(true);
    setError("");
    try {
      const c = await getTestCase(idOrCode);
      if (!c) {
        setError("Test case not found.");
        setCaseRow(null);
        return;
      }
      const vers = await listCaseVersions(c.id);
      const vn = c.current_version;
      const ver = await getCaseVersion(c.id, vn);
      const req = c.request_id ? await getRequest(c.request_id) : null;
      setCaseRow(c);
      setVersions(vers);
      setVersionN(vn);
      setVersion(ver);
      setRequest(req);
    } catch (err) {
      setError(err.message || "Could not load test case.");
    } finally {
      setLoading(false);
    }
  }, [idOrCode]);

  useEffect(() => {
    load();
  }, [load]);

  const onPickVersion = async (n) => {
    setVersionN(Number(n));
    try {
      const ver = await getCaseVersion(caseRow.id, Number(n));
      setVersion(ver);
    } catch (err) {
      toast.error(err.message || "Could not load version.");
    }
  };

  const onApprove = async () => {
    if (!access.canApproveCase || !caseRow || !version || version.approved_by) return;
    setActing(true);
    try {
      await approveCaseVersion(caseRow.id, version.version, user?.id);
      toast.success("Case version approved.");
      await load();
    } catch (err) {
      toast.error(err.message || "Could not approve.");
    } finally {
      setActing(false);
    }
  };

  const onRequestChanges = async () => {
    if (!access.canApproveCase || !caseRow) return;
    setActing(true);
    try {
      await setCaseStatus(caseRow.id, "changes_requested");
      toast.success("Changes requested.");
      await load();
    } catch (err) {
      toast.error(err.message || "Could not update status.");
    } finally {
      setActing(false);
    }
  };

  const onObsolete = async () => {
    if (!access.canWrite || !caseRow) return;
    setActing(true);
    try {
      await setCaseStatus(caseRow.id, "obsolete");
      toast.success("Case marked obsolete.");
      await load();
    } catch (err) {
      toast.error(err.message || "Could not update status.");
    } finally {
      setActing(false);
    }
  };

  const steps = Array.isArray(version?.steps) ? version.steps : [];

  if (loading) return <LoadingBlock label="Loading test case…" />;
  if (!caseRow) {
    return (
      <>
        <PageTaskHeader title="Test case" />
        <InlineAlert tone="error">{error || "Not found."}</InlineAlert>
      </>
    );
  }

  const canApproveThis =
    access.canApproveCase &&
    version &&
    !version.approved_by &&
    caseRow.status !== "obsolete";

  return (
    <>
      <PageTaskHeader
        title={caseRow.code}
        subtitle={version?.title || "Test case detail"}
      >
        <SecondaryButton onClick={() => navigate(`${QA_BASE}/cases`)}>Back to list</SecondaryButton>
        {access.canCreateCase ? (
          <PrimaryButton onClick={() => navigate(`${QA_BASE}/cases/${caseRow.code}/version`)}>
            New version
          </PrimaryButton>
        ) : null}
      </PageTaskHeader>

      {error ? <InlineAlert tone="error" className="mb-3">{error}</InlineAlert> : null}

      <p className="text-xs text-ink-secondary mb-3 flex flex-wrap items-center gap-2">
        <CaseStatusChip status={caseRow.status} />
        {request ? (
          <Link className="text-accent hover:underline" to={`${QA_BASE}/requests/${request.code}`}>
            {request.code} — {request.title}
          </Link>
        ) : null}
        <span className="text-ink-muted">· {reviewRuleText(request?.risk || "medium")}</span>
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SectionCard
          title="Version"
          className="lg:col-span-2"
          right={
            versions.length > 1 ? (
              <select
                className="h-8 text-xs border border-border rounded-control px-2 bg-surface"
                value={versionN ?? ""}
                onChange={(e) => onPickVersion(e.target.value)}
              >
                {versions.map((v) => (
                  <option key={v.version} value={v.version}>
                    v{v.version}
                    {v.approved_at ? " · approved" : ""}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-[11px] text-ink-muted">v{versionN}</span>
            )
          }
        >
          {version ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs mb-4">
              <div>
                <dt className="text-ink-muted">Level</dt>
                <dd className="text-ink">{version.level}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Type</dt>
                <dd className="text-ink">{version.test_type}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Technique</dt>
                <dd className="text-ink">{version.technique?.replace(/_/g, " ")}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Priority</dt>
                <dd className="text-ink">{version.priority || "—"}</dd>
              </div>
            </dl>
          ) : null}
          {version?.preconditions ? (
            <p className="text-xs text-ink-secondary mb-3">
              <span className="font-medium text-ink">Preconditions:</span> {version.preconditions}
            </p>
          ) : null}
          <ol className="list-decimal list-inside space-y-2 text-sm text-ink">
            {steps.length === 0 ? (
              <li className="text-ink-muted list-none">No steps recorded.</li>
            ) : (
              steps.map((s, i) => (
                <li key={i} className="border border-border rounded-md px-3 py-2 bg-surface-sunken/50">
                  <div>{s.action || s.step || "—"}</div>
                  <div className="text-xs text-ink-muted mt-1">Expected: {s.expected || "—"}</div>
                </li>
              ))
            )}
          </ol>
        </SectionCard>

        <SectionCard title="Review">
          {version?.approved_at ? (
            <p className="text-xs text-success">
              Approved{" "}
              {new Date(version.approved_at).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
          ) : (
            <p className="text-xs text-ink-muted mb-3">This version is awaiting approval.</p>
          )}
          <div className="flex flex-col gap-2">
            {canApproveThis ? (
              <PrimaryButton disabled={acting} onClick={onApprove}>
                Approve version
              </PrimaryButton>
            ) : access.canApproveCase ? null : (
              <QaBlockedLine>{blockedReason("canApproveCase", access.role)}</QaBlockedLine>
            )}
            {access.canApproveCase && caseRow.status !== "obsolete" ? (
              <SecondaryButton disabled={acting} onClick={onRequestChanges}>
                Request changes
              </SecondaryButton>
            ) : null}
            {access.canWrite && caseRow.status !== "obsolete" ? (
              <SecondaryButton disabled={acting} onClick={onObsolete}>
                Mark obsolete
              </SecondaryButton>
            ) : null}
          </div>
        </SectionCard>
      </div>
    </>
  );
}