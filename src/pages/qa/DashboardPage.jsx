import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  EmptyState,
  InlineAlert,
  KpiTile,
  LoadingBlock,
  PageTaskHeader,
  SectionCard,
} from "../../components/erpUi";
import { QA_BASE, STAGES } from "./qaConstants";
import { useQaRelease } from "./QaReleaseContext";
import {
  listDefects,
  listLatestResults,
  listReleaseGate,
  listRequests,
  listRuns,
  listRunCases,
} from "./qaApi";
import { SeverityChip } from "./components/QaChips";

export default function DashboardPage() {
  const navigate = useNavigate();
  const { releaseId, release } = useQaRelease();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [gate, setGate] = useState([]);
  const [requests, setRequests] = useState([]);
  const [defects, setDefects] = useState([]);
  const [results, setResults] = useState([]);
  const [planned, setPlanned] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!releaseId) {
        setGate([]);
        setRequests([]);
        setDefects([]);
        setResults([]);
        setPlanned(0);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError("");
      try {
        const [g, reqs, defs, lr, runs] = await Promise.all([
          listReleaseGate(releaseId),
          listRequests({ releaseId }),
          listDefects({ releaseId, openOnly: true }),
          listLatestResults(releaseId),
          listRuns(releaseId),
        ]);
        let plan = 0;
        for (const run of runs) {
          const rc = await listRunCases(run.id);
          plan += rc.length;
        }
        if (!cancelled) {
          setGate(g);
          setRequests(reqs);
          setDefects(defs);
          setResults(lr);
          setPlanned(plan);
        }
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not load dashboard.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [releaseId]);

  const okCount = gate.filter((g) => g.ok).length;
  const ready = gate.length > 0 && gate.every((g) => g.ok);
  const executed = results.filter((r) => r.result === "pass" || r.result === "fail").length;
  const passed = results.filter((r) => r.result === "pass").length;
  const blocked = results.filter((r) => r.result === "blocked").length;
  const passRate = executed ? Math.round((1000 * passed) / executed) / 10 : null;
  const s1s2 = defects.filter((d) => d.severity === "S1" || d.severity === "S2");

  const stageCounts = useMemo(() => {
    const map = Object.fromEntries(STAGES.map((s) => [s.value, 0]));
    requests.forEach((r) => {
      if (map[r.stage] != null) map[r.stage] += 1;
    });
    return map;
  }, [requests]);

  const moduleBars = useMemo(() => {
    const byMod = {};
    requests.forEach((r) => {
      if (!byMod[r.module]) byMod[r.module] = { module: r.module, pass: 0, fail: 0, blocked: 0, not_run: 0 };
    });
    // Approximate: attribute latest results via request through coverage isn't direct; show request risk mix instead if empty.
    results.forEach((lr) => {
      // without case→request join here, skip detailed stack; keep structure for later enrichment
      void lr;
    });
    const keys = Object.keys(byMod);
    if (!keys.length) return [];
    return keys.map((k) => ({
      module: k.length > 18 ? `${k.slice(0, 16)}…` : k,
      requests: requests.filter((r) => r.module === k).length,
    }));
  }, [requests, results]);

  if (!releaseId) {
    return (
      <>
        <PageTaskHeader title="Dashboard" subtitle="Select a release in the header to see the gate verdict." />
        <EmptyState title="No release selected" message="Choose an open release to scope the dashboard." />
      </>
    );
  }

  return (
    <>
      <PageTaskHeader
        title="Dashboard"
        subtitle={
          ready
            ? `Release ${releaseId} is ready to ship`
            : `Release ${releaseId} is not ready to ship`
        }
      />
      {error ? <InlineAlert tone="error" className="mb-3">{error}</InlineAlert> : null}
      {loading ? (
        <LoadingBlock label="Loading dashboard…" />
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-ink-secondary">
            {okCount} of {gate.length || 7} exit criteria met
            {s1s2.length ? ` · ${s1s2.length} critical/major defects open` : ""}
            {passRate != null ? ` · ${passRate}% pass rate` : ""}
            {release?.target_date ? ` · target ${release.target_date}` : ""}
          </p>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiTile
              label="Executed"
              value={`${executed}/${planned || "—"}`}
              sub={blocked ? `${blocked} blocked` : undefined}
            />
            <KpiTile
              label="Pass rate"
              value={passRate != null ? `${passRate}%` : "—"}
              sub="Target ≥ 95%"
              tone={passRate != null && passRate < 95 ? "border-critical-border" : "border-border/80"}
            />
            <KpiTile
              label="Open defects"
              value={defects.length}
              sub={s1s2.length ? `${s1s2.length} S1/S2` : "No S1/S2"}
              tone={s1s2.length ? "border-critical-border" : "border-border/80"}
            />
            <KpiTile label="Gate criteria OK" value={`${okCount}/${gate.length || 7}`} />
          </div>

          <SectionCard title="Workflow">
            <div className="flex flex-wrap gap-2">
              {STAGES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  className="px-3 py-2 rounded-md border border-border bg-surface text-left hover:border-accent-border min-w-[7rem]"
                  onClick={() => navigate(`${QA_BASE}/requests?stage=${s.value}`)}
                >
                  <div className="text-[11px] text-ink-muted">{s.label}</div>
                  <div className="text-lg font-semibold text-ink">{stageCounts[s.value] || 0}</div>
                </button>
              ))}
            </div>
          </SectionCard>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SectionCard title="Requests by module">
              {moduleBars.length === 0 ? (
                <EmptyState title="No requests" message="No requests in this release yet." />
              ) : (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={moduleBars}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="module" tick={{ fontSize: 10 }} />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="requests" fill="var(--accent)" name="Requests" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </SectionCard>

            <SectionCard title="Open S1 / S2 defects">
              {s1s2.length === 0 ? (
                <EmptyState title="None open" message="No critical or major defects in this release." />
              ) : (
                <ul className="divide-y divide-border">
                  {s1s2.map((d) => (
                    <li key={d.id}>
                      <button
                        type="button"
                        className="w-full text-left py-2.5 px-1 hover:bg-surface-sunken rounded"
                        onClick={() => navigate(`${QA_BASE}/defects/${d.code}`)}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-accent">{d.code}</span>
                          <SeverityChip severity={d.severity} />
                        </div>
                        <p className="text-sm text-ink mt-0.5">{d.title}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>

          <SectionCard title="Exit criteria snapshot">
            <ul className="space-y-1.5">
              {gate.map((g) => (
                <li key={g.key} className="flex flex-wrap items-center gap-2 text-xs">
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${
                      g.ok ? "bg-success" : "bg-critical"
                    }`}
                    aria-hidden
                  />
                  <span className="font-medium text-ink">{g.description}</span>
                  <span className="text-ink-muted">
                    actual {g.actual ?? "—"} / target {g.target}
                    {g.waived ? " · waived" : ""}
                  </span>
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>
      )}
    </>
  );
}
