import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  DenseTable,
  EmptyState,
  InlineAlert,
  LoadingBlock,
  PageTaskHeader,
  SecondaryButton,
  SectionCard,
} from "../../components/erpUi";
import { toast } from "../../lib/toast";
import { QA_BASE } from "./qaConstants";
import { useQaRelease } from "./QaReleaseContext";
import {
  listCoverage,
  listDefects,
  listLatestResults,
  listRequests,
  listTestCases,
  listCaseVersions,
} from "./qaApi";
import { ClassChip, CoverageChip, RiskChip, ResultChip } from "./components/QaChips";

function verdictFor({ coverages, results, openDefects }) {
  if (coverages.some((c) => c.coverage === "gap" || c.coverage === "draft")) return "Coverage gap";
  if (results.some((r) => r.result === "fail") || openDefects.length) return "Failing";
  if (results.some((r) => !r.result || r.result === "not_run" || r.result === "blocked")) return "In progress";
  if (results.length && results.every((r) => r.result === "pass") && coverages.every((c) => c.coverage === "pass")) {
    return "Verified";
  }
  return "In progress";
}

export default function TraceabilityPage() {
  const navigate = useNavigate();
  const { releaseId } = useQaRelease();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!releaseId) {
        setRows([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError("");
      try {
        const [reqs, cov, defs, results, cases] = await Promise.all([
          listRequests({ releaseId }),
          listCoverage({ releaseId }),
          listDefects({ releaseId, openOnly: true }),
          listLatestResults(releaseId),
          listTestCases({ releaseId }),
        ]);
        const versionMap = {};
        await Promise.all(
          cases.map(async (c) => {
            const vers = await listCaseVersions(c.id);
            versionMap[c.id] = vers[0] || null;
          })
        );
        const built = reqs
          .filter((r) => r.stage !== "intake")
          .map((r) => {
            const coverages = cov.filter((c) => c.request_id === r.id);
            const caseRows = cases.filter((c) => c.request_id === r.id && c.status !== "obsolete");
            const caseResults = caseRows.map((c) => results.find((lr) => lr.case_id === c.id)).filter(Boolean);
            const openDefects = defs.filter((d) => d.request_id === r.id);
            const passed = caseResults.filter((x) => x.result === "pass").length;
            return {
              id: r.id,
              code: r.code,
              title: r.title,
              change_class: r.change_class,
              risk: r.risk,
              coverages,
              caseRows,
              caseResults,
              versionMap,
              openDefects,
              passed,
              total: caseRows.length,
              verdict: verdictFor({ coverages, results: caseResults, openDefects }),
            };
          });
        if (!cancelled) setRows(built);
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not load matrix.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [releaseId]);

  const columns = useMemo(
    () => [
      { key: "code", label: "Request", render: (r) => r.code },
      { key: "title", label: "Title", render: (r) => r.title },
      {
        key: "class",
        label: "Class / risk",
        render: (r) => (
          <span className="inline-flex flex-wrap gap-1">
            <ClassChip changeClass={r.change_class} />
            <RiskChip risk={r.risk} />
          </span>
        ),
      },
      {
        key: "cov",
        label: "Required levels",
        render: (r) => (
          <span className="inline-flex flex-wrap gap-1">
            {r.coverages.map((c) => (
              <CoverageChip key={c.requirement} requirement={c.requirement} coverage={c.coverage} />
            ))}
          </span>
        ),
      },
      {
        key: "cases",
        label: "Cases",
        render: (r) => (
          <span className="inline-flex flex-wrap gap-1">
            {r.caseRows.map((c) => {
              const lr = r.caseResults.find((x) => x.case_id === c.id);
              return <ResultChip key={c.id} result={lr?.result || "not_run"} />;
            })}
          </span>
        ),
      },
      { key: "pass", label: "Passed", render: (r) => `${r.passed}/${r.total}` },
      {
        key: "defects",
        label: "Open defects",
        render: (r) => r.openDefects.map((d) => d.code).join(", ") || "—",
      },
      { key: "verdict", label: "Verdict", render: (r) => r.verdict },
    ],
    []
  );

  const exportCsv = () => {
    const lines = [["request", "title", "required_level", "test_case", "case_status", "latest_result", "defects"]];
    rows.forEach((r) => {
      const defectCodes = r.openDefects.map((d) => d.code).join(" ");
      if (!r.caseRows.length) {
        r.coverages.forEach((c) => {
          lines.push([r.code, r.title, c.requirement, "MISSING", "", "", defectCodes]);
        });
        if (!r.coverages.length) lines.push([r.code, r.title, "", "MISSING", "", "", defectCodes]);
        return;
      }
      r.caseRows.forEach((c) => {
        const lr = r.caseResults.find((x) => x.case_id === c.id);
        const ver = r.versionMap[c.id];
        const level = ver?.level || ver?.test_type || "";
        lines.push([r.code, r.title, level, c.code, c.status, lr?.result || "not_run", defectCodes]);
      });
    });
    const csv = lines.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `qa-traceability-${releaseId || "all"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  };

  if (!releaseId) {
    return (
      <>
        <PageTaskHeader title="Traceability" subtitle="Select a release to view the matrix." />
        <EmptyState title="No release selected" message="Choose a release in the header." />
      </>
    );
  }

  return (
    <>
      <PageTaskHeader
        title="Traceability matrix"
        subtitle={`Release ${releaseId}`}
        actions={
          <SecondaryButton type="button" onClick={exportCsv} disabled={!rows.length}>
            Export CSV
          </SecondaryButton>
        }
      />
      {error ? <InlineAlert tone="error" className="mb-3">{error}</InlineAlert> : null}
      {loading ? (
        <LoadingBlock label="Building matrix…" />
      ) : (
        <SectionCard title={`Requests (${rows.length})`}>
          {rows.length === 0 ? (
            <EmptyState title="Nothing in scope" message="No non-intake requests for this release." />
          ) : (
            <DenseTable
              columns={columns}
              rows={rows}
              rowKey="id"
              onRowClick={(r) => navigate(`${QA_BASE}/requests/${r.code}`)}
            />
          )}
        </SectionCard>
      )}
    </>
  );
}
