import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { Columns3, Table2 } from "lucide-react";
import {
  DenseTable,
  EmptyState,
  FilterBar,
  InlineAlert,
  LoadingBlock,
  PageTaskHeader,
  PrimaryButton,
  SectionCard,
  TinyInput,
  TinySelect,
} from "../../components/erpUi";
import { toast } from "../../lib/toast";
import { blockedReason } from "./qaAccess";
import { DEFECT_KANBAN, DEFECT_STATUSES, PRIORITIES, QA_BASE, SEVERITIES } from "./qaConstants";
import { useQaRelease } from "./QaReleaseContext";
import { listDefects, updateDefect, userMessage } from "./qaApi";
import { PriorityChip, SeverityChip } from "./components/QaChips";

export default function DefectsPage() {
  const navigate = useNavigate();
  const { access, qaRole } = useOutletContext() || {};
  const { releaseId } = useQaRelease();
  const [view, setView] = useState("board");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ severity: "", priority: "", search: "" });
  const [dragId, setDragId] = useState(null);

  const reload = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await listDefects({ releaseId: releaseId || null });
      setRows(data);
    } catch (err) {
      setError(err.message || "Could not load defects.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, [releaseId]);

  const filtered = useMemo(() => {
    return rows.filter((d) => {
      if (filters.severity && d.severity !== filters.severity) return false;
      if (filters.priority && d.priority !== filters.priority) return false;
      const q = filters.search.trim().toLowerCase();
      if (q) {
        const hay = `${d.code} ${d.title}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filters]);

  const byStatus = useMemo(() => {
    const map = Object.fromEntries(DEFECT_KANBAN.map((s) => [s, []]));
    filtered.forEach((d) => {
      if (map[d.status]) map[d.status].push(d);
    });
    return map;
  }, [filtered]);

  const columns = useMemo(
    () => [
      { key: "code", label: "Code", render: (r) => r.code },
      { key: "title", label: "Title", render: (r) => r.title },
      { key: "severity", label: "Severity", render: (r) => <SeverityChip severity={r.severity} /> },
      { key: "priority", label: "Priority", render: (r) => <PriorityChip priority={r.priority} /> },
      { key: "status", label: "Status", render: (r) => DEFECT_STATUSES.find((s) => s.value === r.status)?.label || r.status },
      { key: "reopen", label: "Reopens", render: (r) => r.reopen_count || 0 },
    ],
    []
  );

  const moveTo = async (defectId, status) => {
    const row = rows.find((d) => d.id === defectId);
    if (!row || row.status === status) return;
    try {
      const patch = { status };
      if (status === "ready_for_retest" && !row.fixed_in_build) {
        navigate(`${QA_BASE}/defects/${row.code}?need=fixed_in_build`);
        toast.error("Enter the build that contains the fix before marking ready for retest.");
        return;
      }
      await updateDefect(defectId, patch);
      toast.success(`Moved to ${status.replace(/_/g, " ")}`);
      reload();
    } catch (err) {
      toast.error(userMessage(err, "Could not update defect."));
      navigate(`${QA_BASE}/defects/${row.code}`);
    }
  };

  return (
    <>
      <PageTaskHeader
        title="Defects"
        subtitle={releaseId ? `Scoped to release ${releaseId}` : "All releases"}
        actions={
          <div className="flex gap-2">
            <button
              type="button"
              className={`inline-flex h-9 items-center gap-1.5 px-3 rounded-md border text-xs ${view === "table" ? "bg-accent text-white border-accent" : "bg-surface border-border"}`}
              onClick={() => setView("table")}
            >
              <Table2 className="w-3.5 h-3.5" /> Table
            </button>
            <button
              type="button"
              className={`inline-flex h-9 items-center gap-1.5 px-3 rounded-md border text-xs ${view === "board" ? "bg-accent text-white border-accent" : "bg-surface border-border"}`}
              onClick={() => setView("board")}
            >
              <Columns3 className="w-3.5 h-3.5" /> Board
            </button>
            <PrimaryButton
              type="button"
              onClick={() => navigate(`${QA_BASE}/defects/new`)}
              disabled={!access?.canWrite}
              title={!access?.canWrite ? blockedReason("canCreateRequest", qaRole) : undefined}
            >
              Log defect
            </PrimaryButton>
          </div>
        }
      />
      <FilterBar>
        <TinyInput
          placeholder="Search code or title"
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
        />
        <TinySelect value={filters.severity} onChange={(e) => setFilters((f) => ({ ...f, severity: e.target.value }))}>
          <option value="">All severities</option>
          {SEVERITIES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </TinySelect>
        <TinySelect value={filters.priority} onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value }))}>
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </TinySelect>
      </FilterBar>
      {error ? <InlineAlert tone="error" className="mt-3">{error}</InlineAlert> : null}
      {loading ? (
        <LoadingBlock label="Loading defects…" className="mt-3" />
      ) : view === "table" ? (
        <SectionCard title={`Defects (${filtered.length})`} className="mt-3">
          {filtered.length === 0 ? (
            <EmptyState title="No defects" message="Nothing matches these filters." />
          ) : (
            <DenseTable
              columns={columns}
              rows={filtered}
              rowKey="id"
              onRowClick={(r) => navigate(`${QA_BASE}/defects/${r.code}`)}
            />
          )}
        </SectionCard>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2 mt-3 min-h-[420px]">
          {DEFECT_KANBAN.map((status) => (
            <div
              key={status}
              className="w-[240px] shrink-0 rounded-card border border-border bg-surface-sunken/40 flex flex-col"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const id = Number(dragId || e.dataTransfer.getData("text/defect-id"));
                if (id) void moveTo(id, status);
                setDragId(null);
              }}
            >
              <div className="px-3 py-2 border-b border-border flex justify-between">
                <span className="text-xs font-semibold text-ink-strong">
                  {DEFECT_STATUSES.find((s) => s.value === status)?.label || status}
                </span>
                <span className="text-[10px] text-ink-muted">{byStatus[status]?.length || 0}</span>
              </div>
              <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[70vh]">
                {(byStatus[status] || []).map((d) => (
                  <div
                    key={d.id}
                    draggable
                    onDragStart={(e) => {
                      setDragId(d.id);
                      e.dataTransfer.setData("text/defect-id", String(d.id));
                    }}
                    onClick={() => navigate(`${QA_BASE}/defects/${d.code}`)}
                    className="rounded-lg border border-border bg-surface p-2.5 shadow-sm cursor-grab hover:border-accent-border"
                  >
                    <p className="text-[11px] font-medium text-accent">{d.code}</p>
                    <p className="text-xs text-ink-strong mt-0.5 line-clamp-2">{d.title}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <SeverityChip severity={d.severity} />
                      <PriorityChip priority={d.priority} />
                      {d.reopen_count > 0 ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border border-warning-border bg-warning-soft text-warning">
                          Reopened ×{d.reopen_count}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
