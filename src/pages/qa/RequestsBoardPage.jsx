import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { Columns3, Plus, Table2 } from "lucide-react";
import {
  DenseTable,
  EmptyState,
  FilterBar,
  FormField,
  InlineAlert,
  LoadingBlock,
  PageTaskHeader,
  PrimaryButton,
  SectionCard,
  TinyInput,
  TinySelect,
} from "../../components/erpUi";
import { blockedReason } from "./qaAccess";
import {
  CHANGE_CLASSES,
  KANBAN_STAGES,
  QA_BASE,
  RISK_LEVELS,
  stageLabel,
  STAGES,
} from "./qaConstants";
import {
  createQaRefreshScheduler,
  listCoverage,
  listDefects,
  listMembers,
  listRequests,
  subscribeQaRealtime,
} from "./qaApi";
import { ClassChip, RiskChip, StageChip } from "./components/QaChips";
import { useQaRelease } from "./QaReleaseContext";
import RequestFormModal from "./RequestFormModal";

function matchesBoardFilters(row, filters, memberName) {
  if (filters.module && row.module !== filters.module) return false;
  if (filters.changeClass && row.change_class !== filters.changeClass) return false;
  if (filters.risk && row.risk !== filters.risk) return false;
  const q = String(filters.ownerSearch || "").trim().toLowerCase();
  if (q) {
    const hay = [memberName, row.owner_id, row.code, row.title].filter(Boolean).join(" ").toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function scopeToRelease(row, releaseId) {
  if (!releaseId) return true;
  return row.release_id === releaseId || row.stage === "intake";
}

function coverageHint(rows) {
  if (!rows?.length) return null;
  const pass = rows.filter((r) => r.coverage === "pass").length;
  const approved = rows.filter((r) => r.coverage === "pass" || r.coverage === "open").length;
  if (pass === rows.length) return `${pass}/${rows.length} covered`;
  return `${approved}/${rows.length} in progress`;
}

export default function RequestsBoardPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { access } = useOutletContext() || {};
  const { releaseId, release } = useQaRelease();

  const [view, setView] = useState("table");
  const [rows, setRows] = useState([]);
  const [coverage, setCoverage] = useState([]);
  const [defects, setDefects] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);

  const [filters, setFilters] = useState(() => ({
    module: "",
    changeClass: "",
    risk: "",
    ownerSearch: "",
    stage: searchParams.get("stage") || "",
  }));

  const requestIdRef = useRef(0);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const memberMap = useMemo(() => {
    const m = new Map();
    members.forEach((mem) => m.set(mem.user_id, mem.full_name || mem.user_id));
    return m;
  }, [members]);

  const moduleOptions = useMemo(() => {
    const set = new Set();
    rows.forEach((r) => {
      if (r.module) set.add(r.module);
    });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  useEffect(() => {
    setFilters((f) => ({ ...f, stage: searchParams.get("stage") || "" }));
  }, [searchParams]);

  const syncStageUrl = (stage) => {
    const next = new URLSearchParams(searchParams);
    if (stage) next.set("stage", stage);
    else next.delete("stage");
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mem = await listMembers();
        if (!cancelled) setMembers(mem);
      } catch {
        /* optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(
    async ({ silent = false } = {}) => {
      const reqId = ++requestIdRef.current;
      if (silent) setRefreshing(true);
      else setLoading(true);
      setError("");
      try {
        const stageApi = filters.stage || undefined;
        const [reqs, cov, defs] = await Promise.all([
          listRequests({ stage: stageApi }),
          releaseId ? listCoverage({ releaseId }) : [],
          releaseId ? listDefects({ releaseId, openOnly: true }) : listDefects({ openOnly: true }),
        ]);
        if (reqId !== requestIdRef.current) return;
        const scoped = (reqs || []).filter((r) => scopeToRelease(r, releaseId));
        setRows(scoped);
        setCoverage(cov || []);
        setDefects(defs || []);
      } catch (err) {
        if (reqId !== requestIdRef.current) return;
        setError(err.message || "Could not load requests.");
      } finally {
        if (reqId !== requestIdRef.current) return;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [releaseId, filters.stage]
  );

  useEffect(() => {
    const silent = rowsRef.current.length > 0;
    load({ silent });
  }, [load]);

  useEffect(() => {
    const scheduler = createQaRefreshScheduler(() => load({ silent: true }), 400);
    const unsub = subscribeQaRealtime(() => scheduler.schedule(), { channelName: "qa-requests-board" });
    const onFocus = () => scheduler.schedule();
    window.addEventListener("focus", onFocus);
    return () => {
      scheduler.cancel();
      unsub();
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  const coverageByRequest = useMemo(() => {
    const m = new Map();
    coverage.forEach((c) => {
      if (!m.has(c.request_id)) m.set(c.request_id, []);
      m.get(c.request_id).push(c);
    });
    return m;
  }, [coverage]);

  const openDefectsByRequest = useMemo(() => {
    const m = new Map();
    defects.forEach((d) => {
      if (!d.request_id || d.status === "closed") return;
      m.set(d.request_id, (m.get(d.request_id) || 0) + 1);
    });
    return m;
  }, [defects]);

  const filteredRows = useMemo(
    () =>
      rows.filter((r) =>
        matchesBoardFilters(r, filters, memberMap.get(r.owner_id) || "")
      ),
    [rows, filters, memberMap]
  );

  const byStage = useMemo(() => {
    const map = Object.fromEntries(KANBAN_STAGES.map((s) => [s, []]));
    filteredRows.forEach((r) => {
      if (map[r.stage]) map[r.stage].push(r);
    });
    return map;
  }, [filteredRows]);

  const openDetail = (row) => {
    navigate(`${QA_BASE}/requests/${row.code || row.id}`);
  };

  const canCreate = access?.canCreateRequest;
  const createBlocked = blockedReason("canCreateRequest", access?.role);

  const columns = useMemo(
    () => [
      {
        key: "code",
        label: "Request",
        render: (r) => <span className="font-medium text-accent">{r.code}</span>,
      },
      {
        key: "title",
        label: "Title",
        render: (r) => <span className="max-w-[220px] truncate block">{r.title}</span>,
      },
      {
        key: "module",
        label: "Module",
        render: (r) => <span className="max-w-[140px] truncate block">{r.module || "—"}</span>,
      },
      {
        key: "class",
        label: "Class",
        render: (r) => <ClassChip changeClass={r.change_class} />,
      },
      {
        key: "risk",
        label: "Risk",
        render: (r) => <RiskChip risk={r.risk} />,
      },
      {
        key: "stage",
        label: "Stage",
        render: (r) => <StageChip stage={r.stage} />,
      },
      {
        key: "release",
        label: "Release",
        render: (r) => r.release_id || "—",
      },
      {
        key: "progress",
        label: "Coverage",
        render: (r) => {
          const hint = coverageHint(coverageByRequest.get(r.id));
          const dc = openDefectsByRequest.get(r.id);
          return (
            <span className="text-[11px] text-ink-secondary">
              {hint || "—"}
              {dc ? ` · ${dc} open defect${dc === 1 ? "" : "s"}` : ""}
            </span>
          );
        },
      },
    ],
    [coverageByRequest, openDefectsByRequest]
  );

  const showInitialLoader = loading && rows.length === 0;

  return (
    <>
      <PageTaskHeader
        title="QA requests"
        subtitle={
          releaseId
            ? `Release ${releaseId}${release?.target_date ? ` · target ${release.target_date}` : ""} · intake items without a release stay visible`
            : "Select a release in the header to scope the board, or browse all requests."
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border border-border overflow-hidden">
            <button
              type="button"
              className={`inline-flex items-center gap-1.5 h-9 px-3 text-xs ${
                view === "table" ? "bg-accent text-white" : "bg-surface text-ink-secondary"
              }`}
              onClick={() => setView("table")}
            >
              <Table2 className="w-3.5 h-3.5" />
              Table
            </button>
            <button
              type="button"
              className={`inline-flex items-center gap-1.5 h-9 px-3 text-xs border-l border-border ${
                view === "kanban" ? "bg-accent text-white" : "bg-surface text-ink-secondary"
              }`}
              onClick={() => setView("kanban")}
            >
              <Columns3 className="w-3.5 h-3.5" />
              Kanban
            </button>
          </div>
          <PrimaryButton
            onClick={() => setFormOpen(true)}
            disabled={!canCreate}
            title={!canCreate ? createBlocked : undefined}
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            New QA request
          </PrimaryButton>
        </div>
      </PageTaskHeader>

      <FilterBar>
        <FormField label="Module">
          <TinySelect value={filters.module} onChange={(e) => setFilters((f) => ({ ...f, module: e.target.value }))}>
            <option value="">All</option>
            {moduleOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </TinySelect>
        </FormField>
        <FormField label="Class">
          <TinySelect
            value={filters.changeClass}
            onChange={(e) => setFilters((f) => ({ ...f, changeClass: e.target.value }))}
          >
            <option value="">All</option>
            {CHANGE_CLASSES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.value}
              </option>
            ))}
          </TinySelect>
        </FormField>
        <FormField label="Risk">
          <TinySelect value={filters.risk} onChange={(e) => setFilters((f) => ({ ...f, risk: e.target.value }))}>
            <option value="">All</option>
            {RISK_LEVELS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </TinySelect>
        </FormField>
        <FormField label="Stage">
          <TinySelect
            value={filters.stage}
            onChange={(e) => {
              const v = e.target.value;
              setFilters((f) => ({ ...f, stage: v }));
              syncStageUrl(v);
            }}
          >
            <option value="">All</option>
            {STAGES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </TinySelect>
        </FormField>
        <FormField label="Owner search">
          <TinyInput
            value={filters.ownerSearch}
            onChange={(e) => setFilters((f) => ({ ...f, ownerSearch: e.target.value }))}
            placeholder="Name or request code…"
            className="min-w-[12rem]"
          />
        </FormField>
      </FilterBar>

      {error ? (
        <InlineAlert tone="error" onDismiss={() => setError("")} className="mb-2">
          {error}
        </InlineAlert>
      ) : null}

      {refreshing ? <p className="text-[11px] text-ink-muted -mt-1 mb-1">Updating…</p> : null}

      {showInitialLoader ? (
        <LoadingBlock label="Loading requests…" />
      ) : view === "table" ? (
        <SectionCard title={`Requests (${filteredRows.length})`}>
          {filteredRows.length === 0 ? (
            <EmptyState title="No requests" message="No QA requests match these filters." />
          ) : (
            <DenseTable columns={columns} rows={filteredRows} rowKey="id" onRowClick={openDetail} />
          )}
        </SectionCard>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2 min-h-[420px]">
          {KANBAN_STAGES.map((stage) => (
            <div
              key={stage}
              className="w-[260px] shrink-0 rounded-card border border-border bg-surface-sunken/40 flex flex-col"
            >
              <div className="px-3 py-2 border-b border-border flex items-center justify-between">
                <span className="text-xs font-semibold text-ink-strong">{stageLabel(stage)}</span>
                <span className="text-[10px] text-ink-muted">{byStage[stage]?.length || 0}</span>
              </div>
              <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[70vh]">
                {(byStage[stage] || []).map((r) => {
                  const hint = coverageHint(coverageByRequest.get(r.id));
                  const dc = openDefectsByRequest.get(r.id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => openDetail(r)}
                      className="w-full text-left rounded-lg border border-border bg-surface p-2.5 shadow-sm hover:border-accent-border"
                    >
                      <p className="text-[11px] font-medium text-accent">{r.code}</p>
                      <p className="text-xs text-ink-strong mt-0.5 line-clamp-2">{r.title}</p>
                      <p className="text-[10px] text-ink-muted mt-1 line-clamp-1">{r.module || "—"}</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <ClassChip changeClass={r.change_class} />
                        <RiskChip risk={r.risk} />
                      </div>
                      {hint ? <p className="mt-1.5 text-[10px] text-ink-muted">{hint}</p> : null}
                      {dc ? (
                        <p className="text-[10px] text-warning">
                          {dc} open defect{dc === 1 ? "" : "s"}
                        </p>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <RequestFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onCreated={() => load({ silent: true })}
      />
    </>
  );
}