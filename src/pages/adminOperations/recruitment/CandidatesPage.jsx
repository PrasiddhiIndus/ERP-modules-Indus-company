import React, { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, CalendarPlus, Eye, Filter, KanbanSquare, List, Plus, X } from "lucide-react";
import { toast } from "../../../lib/toast";
import {
  CANDIDATE_OUTCOMES,
  INTERVIEW_STATUSES,
  OFFER_STATUSES,
  PIPELINE_STAGES,
  STAGE_INDEX,
  candidateStatusMeta,
  interviewStatusMeta,
  offerStatusMeta,
  outcomeMeta,
  stageMeta,
} from "./recruitmentConfig";
import { listCandidates, listRequisitions, moveCandidateStage } from "./recruitmentService";
import {
  AsyncBoundary,
  Avatar,
  DataTable,
  EmptyState,
  Field,
  IconButton,
  SearchBox,
  SegmentedToggle,
  SelectField,
  StatusPill,
  Tabs,
  btn,
  fmtDate,
  fmtRelative,
  inputClass,
  searchClass,
  toolbarClass,
  useCapabilities,
  useRecruitmentData,
} from "./RecruitmentUi";
import ScheduleInterviewModal from "./ScheduleInterviewModal";
import { AddCandidateModal } from "./RecruitmentForms";

const EMPTY_FILTERS = {
  source: "",
  requisition: "",
  stage: "",
  interviewStatus: "",
  offerStatus: "",
  site: "",
  expMin: "",
  expMax: "",
  dateField: "added",
  dateFrom: "",
  dateTo: "",
};

const FILTER_LABELS = {
  source: "Source",
  requisition: "Requisition",
  stage: "Stage",
  interviewStatus: "Interview",
  offerStatus: "Offer",
  site: "Site",
  expMin: "Exp ≥",
  expMax: "Exp ≤",
  dateFrom: "from",
  dateTo: "to",
};

const DATE_FIELDS = [
  { value: "added", label: "Added on" },
  { value: "joining", label: "Expected joining" },
];

/** Status tabs (replace the former status dropdown). */
const STATUS_TABS = [
  { key: "active", label: "In progress", test: (c) => c.live },
  { key: "closed", label: "Closed", test: (c) => Boolean(c.outcome) },
  { key: "converted", label: "Employees created", test: (c) => c.stage === "employee_created" },
  { key: "all", label: "All", test: () => true },
];

/** Stage / outcome choices that make sense on each status tab. */
function stagesForStatus(status) {
  if (status === "closed") return CANDIDATE_OUTCOMES;
  if (status === "active") return PIPELINE_STAGES.filter((s) => s.key !== "employee_created");
  return [...PIPELINE_STAGES, ...CANDIDATE_OUTCOMES];
}

/** Filters shown inline on the toolbar; the rest live under "More filters". */
const QUICK_FILTER_KEYS = ["stage", "requisition"];

async function loadCandidatesPage() {
  const [candidates, requisitions] = await Promise.all([listCandidates(), listRequisitions()]);
  return { candidates, requisitions };
}

/** Next stage a recruiter can set by hand; later stages follow from interviews, offers and joining. */
function nextManualStage(c) {
  if (!c.live) return null;
  if (c.stage === "new") return stageMeta("screening");
  if (c.stage === "screening") return stageMeta("shortlisted");
  if (c.stage === "interview") return stageMeta("selected");
  return null;
}

export default function CandidatesPage() {
  const navigate = useNavigate();
  const caps = useCapabilities();
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "board" ? "board" : "list";
  const { data, loading, error, reload } = useRecruitmentData(loadCandidatesPage);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("active");
  const [filters, setFilters] = useState(() => ({ ...EMPTY_FILTERS, requisition: params.get("requisition") || "" }));
  const [showFilters, setShowFilters] = useState(false);
  const [scheduleFor, setScheduleFor] = useState(null);
  const [adding, setAdding] = useState(false);

  const candidates = data?.candidates || [];
  const requisitions = data?.requisitions || [];

  const options = useMemo(
    () => ({
      sites: [...new Set(candidates.map((c) => c.site).filter(Boolean))].sort(),
      sources: [...new Set(candidates.map((c) => c.source).filter(Boolean))].sort(),
      requisitions: requisitions.map((r) => ({ value: r.id, label: `${r.requisitionNo} · ${r.designation}` })),
    }),
    [candidates, requisitions]
  );

  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }));
  const activeFilters = Object.entries(filters).filter(([k, v]) => k !== "dateField" && v !== "");
  const moreFilterCount = activeFilters.filter(([k]) => !QUICK_FILTER_KEYS.includes(k)).length;
  const stageOptions = useMemo(() => stagesForStatus(status).map((s) => ({ value: s.key, label: s.label })), [status]);

  const changeStatus = (key) => {
    setStatus(key);
    // Drop a stage filter that does not exist on the new tab.
    setFilters((f) => (f.stage && !stagesForStatus(key).some((s) => s.key === f.stage) ? { ...f, stage: "" } : f));
  };

  const baseFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return candidates.filter((c) => {
      if (q && ![c.name, c.phone, c.email, c.designation, c.requisitionNo, c.currentCompany, c.candidateNo].join(" ").toLowerCase().includes(q)) return false;
      if (filters.source && c.source !== filters.source) return false;
      if (filters.requisition && c.requisitionId !== filters.requisition) return false;
      if (filters.stage && c.stage !== filters.stage && c.outcome !== filters.stage) return false;
      if (filters.interviewStatus && c.interviewStatus !== filters.interviewStatus) return false;
      if (filters.offerStatus && c.offerStatus !== filters.offerStatus) return false;
      if (filters.site && c.site !== filters.site) return false;
      if (filters.expMin !== "" && (c.experienceYears ?? 0) < Number(filters.expMin)) return false;
      if (filters.expMax !== "" && (c.experienceYears ?? 0) > Number(filters.expMax)) return false;
      if (filters.dateFrom || filters.dateTo) {
        const value = filters.dateField === "joining" ? c.expectedJoining || "" : String(c.addedOn || "").slice(0, 10);
        if (!value) return false;
        if (filters.dateFrom && value < filters.dateFrom) return false;
        if (filters.dateTo && value > filters.dateTo) return false;
      }
      return true;
    });
  }, [candidates, search, filters]);

  const statusCounts = useMemo(() => Object.fromEntries(STATUS_TABS.map((t) => [t.key, baseFiltered.filter(t.test).length])), [baseFiltered]);
  const filtered = useMemo(() => baseFiltered.filter(STATUS_TABS.find((t) => t.key === status).test), [baseFiltered, status]);

  const move = async (candidate, stageKey) => {
    if (!stageKey || stageKey === candidate.stage) return;
    try {
      await moveCandidateStage(candidate.id, stageKey, null, candidate.version);
      toast.success(`${candidate.name} moved to ${stageMeta(stageKey).label}.`);
    } catch (err) {
      toast.error("Could not move candidate", err?.message);
    }
  };

  const setView = (v) => {
    const next = new URLSearchParams(params);
    if (v === "board") next.set("view", "board");
    else next.delete("view");
    setParams(next, { replace: true });
  };

  const openCandidate = (c) => navigate(c.id);

  const columns = [
    {
      key: "name",
      label: "Candidate",
      render: (c) => (
        <span className="flex items-center gap-2.5">
          <Avatar name={c.name} size="sm" />
          <span className="min-w-0">
            <span className="block font-medium text-ink">{c.name}</span>
            <span className="block text-[11px] text-ink-muted">
              {[c.candidateNo, c.experienceYears != null ? `${c.experienceYears} yrs` : null, c.qualification].filter(Boolean).join(" · ")}
            </span>
          </span>
        </span>
      ),
    },
    {
      key: "phone",
      label: "Contact",
      sortable: false,
      render: (c) => (
        <span className="block">
          <span className="block tabular-nums">{c.phone || "—"}</span>
          <span className="block max-w-[180px] truncate text-[11px] text-ink-muted">{c.email}</span>
        </span>
      ),
    },
    {
      key: "designation",
      label: "Position",
      render: (c) => (
        <span>
          <span className="block">{c.designation || "—"}</span>
          <span className="block font-mono text-[10px] text-ink-muted">{c.requisitionNo || "No requisition"}</span>
        </span>
      ),
    },
    {
      key: "stage",
      label: "Status",
      sortValue: (c) => (c.outcome ? 100 : STAGE_INDEX[c.stage]),
      render: (c) => {
        const detail = [
          c.interviewStatus ? `Interview: ${interviewStatusMeta(c.interviewStatus).label}` : null,
          c.offerStatus ? `Offer: ${offerStatusMeta(c.offerStatus).label}` : null,
        ].filter(Boolean);
        return (
          <span className="block">
            <StatusPill meta={candidateStatusMeta(c)} />
            {detail.length ? <span className="mt-0.5 block text-[11px] text-ink-muted">{detail.join(" · ")}</span> : null}
          </span>
        );
      },
    },
    { key: "expectedJoining", label: "Expected joining", render: (c) => fmtDate(c.expectedJoining) },
    { key: "recruiter", label: "Recruiter" },
    { key: "lastActivityAt", label: "Last activity", render: (c) => <span className="text-ink-secondary">{fmtRelative(c.lastActivityAt)}</span> },
    {
      key: "actions",
      label: "Actions",
      sortable: false,
      render: (c) => {
        const next = nextManualStage(c);
        return (
          <span className="flex items-center gap-0.5">
            <IconButton icon={Eye} label={`Open ${c.name}`} onClick={() => openCandidate(c)} />
            {caps.interviews && c.live && c.stage === "shortlisted" ? <IconButton icon={CalendarPlus} label="Schedule interview" onClick={() => setScheduleFor(c)} /> : null}
            {caps.candidates && next ? <IconButton icon={ArrowRight} label={`Move to ${next.label}`} onClick={() => move(c, next.key)} /> : null}
          </span>
        );
      },
    },
  ];

  return (
    <div className="space-y-3">
      <div className="rounded-card border border-border bg-surface shadow-card">
        <div className="px-4 pt-1">
          <Tabs
            ariaLabel="Candidate status"
            value={status}
            onChange={changeStatus}
            tabs={STATUS_TABS.map((t) => ({ key: t.key, label: t.label, count: statusCounts[t.key] }))}
          />
        </div>
        <div className={toolbarClass}>
          <SearchBox value={search} onChange={setSearch} placeholder="Search name, phone, email, requisition…" className={searchClass} />
          <SelectField label="Stage" value={filters.stage} onChange={(v) => setFilter("stage", v)} options={stageOptions} className="w-40" />
          <SelectField label="Requisition" value={filters.requisition} onChange={(v) => setFilter("requisition", v)} options={options.requisitions} className="w-52" />
          <button type="button" className={btn.secondary} onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}>
            <Filter className="h-3.5 w-3.5" /> More filters{moreFilterCount ? ` (${moreFilterCount})` : ""}
          </button>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[11px] text-ink-muted">
              {filtered.length} of {candidates.length}
            </span>
            <SegmentedToggle
              ariaLabel="Candidate view"
              value={view}
              onChange={setView}
              options={[
                { value: "list", label: "List", icon: List },
                { value: "board", label: "Pipeline", icon: KanbanSquare },
              ]}
            />
            {caps.candidates ? (
              <button type="button" className={btn.primary} onClick={() => setAdding(true)}>
                <Plus className="h-3.5 w-3.5" /> Add candidate
              </button>
            ) : null}
          </div>
        </div>

        {showFilters ? (
          <div className="mx-4 mb-3 grid grid-cols-2 gap-3 border-t border-divider pt-3 md:grid-cols-4 xl:grid-cols-8">
            <SelectField label="Source" value={filters.source} onChange={(v) => setFilter("source", v)} options={options.sources} />
            <SelectField label="Site" value={filters.site} onChange={(v) => setFilter("site", v)} options={options.sites} />
            <Field label="Experience (yrs)">
              <span className="flex gap-1.5">
                <input type="number" min="0" value={filters.expMin} onChange={(e) => setFilter("expMin", e.target.value)} placeholder="Min" className={inputClass} aria-label="Minimum experience" />
                <input type="number" min="0" value={filters.expMax} onChange={(e) => setFilter("expMax", e.target.value)} placeholder="Max" className={inputClass} aria-label="Maximum experience" />
              </span>
            </Field>
            <SelectField label="Interview status" value={filters.interviewStatus} onChange={(v) => setFilter("interviewStatus", v)} options={INTERVIEW_STATUSES.map((s) => ({ value: s.key, label: s.label }))} />
            <SelectField label="Offer status" value={filters.offerStatus} onChange={(v) => setFilter("offerStatus", v)} options={OFFER_STATUSES.map((s) => ({ value: s.key, label: s.label }))} />
            <SelectField label="Date field" value={filters.dateField} onChange={(v) => setFilter("dateField", v)} options={DATE_FIELDS} allLabel={null} />
            <Field label="From">
              <input type="date" value={filters.dateFrom} onChange={(e) => setFilter("dateFrom", e.target.value)} className={inputClass} />
            </Field>
            <Field label="To">
              <input type="date" value={filters.dateTo} onChange={(e) => setFilter("dateTo", e.target.value)} className={inputClass} />
            </Field>
          </div>
        ) : null}

        {activeFilters.length ? (
          <div className="mx-4 mb-3 flex flex-wrap items-center gap-1.5">
            {activeFilters.map(([key, value]) => {
              let display = value;
              if (key === "requisition") display = options.requisitions.find((o) => o.value === value)?.label || value;
              if (key === "stage") display = (PIPELINE_STAGES.some((s) => s.key === value) ? stageMeta(value) : outcomeMeta(value)).label;
              if (key === "interviewStatus") display = interviewStatusMeta(value).label;
              if (key === "offerStatus") display = offerStatusMeta(value).label;
              const label =
                key === "dateFrom" || key === "dateTo"
                  ? `${DATE_FIELDS.find((d) => d.value === filters.dateField)?.label} ${FILTER_LABELS[key]}`
                  : FILTER_LABELS[key];
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key, "")}
                  className="inline-flex items-center gap-1 rounded-full border border-accent-border bg-accent-soft px-2 py-0.5 text-[11px] text-accent-deep hover:bg-surface"
                  aria-label={`Remove filter ${label}`}
                >
                  {label}: {display}
                  <X className="h-3 w-3" />
                </button>
              );
            })}
            <button type="button" className={btn.ghost} onClick={() => setFilters(EMPTY_FILTERS)}>
              Clear all
            </button>
          </div>
        ) : null}

        <div className="px-4 pb-4">
          <AsyncBoundary loading={loading} error={error} onRetry={reload} rows={8}>
            {view === "list" ? (
              <DataTable
                columns={columns}
                rows={filtered}
                onRowClick={openCandidate}
                initialSort={{ key: "lastActivityAt", dir: "desc" }}
                emptyTitle={candidates.length ? "No candidates match" : "No candidates yet"}
                emptyMessage={candidates.length ? "Try a different search or clear some filters." : "Add a candidate to start the recruitment pipeline."}
              />
            ) : (
              <PipelineBoard candidates={filtered.filter((c) => c.live)} onOpen={openCandidate} onMove={move} canMove={Boolean(caps.candidates)} />
            )}
          </AsyncBoundary>
        </div>
      </div>

      <ScheduleInterviewModal open={Boolean(scheduleFor)} candidate={scheduleFor} candidates={candidates} onClose={() => setScheduleFor(null)} />
      <AddCandidateModal
        open={adding}
        defaultRequisitionId={filters.requisition}
        onClose={() => setAdding(false)}
        onCreated={(cand) => {
          setAdding(false);
          if (cand?.id) navigate(cand.id);
        }}
      />
    </div>
  );
}

function PipelineBoard({ candidates, onOpen, onMove, canMove }) {
  const [dragId, setDragId] = useState(null);
  const [overStage, setOverStage] = useState(null);

  if (!candidates.length) {
    return <EmptyState title="No candidates in progress" message="Try a different search or clear some filters." />;
  }

  const dragged = candidates.find((c) => c.id === dragId);
  const target = dragged ? nextManualStage(dragged)?.key : null;

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-ink-muted">
        Drag a card to its next step (Screening, Shortlisted or Selected). Interviews, offers, letters and joining move candidates automatically.
      </p>
      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-max gap-3">
          {PIPELINE_STAGES.filter((s) => s.key !== "employee_created").map((stage) => {
            const items = candidates.filter((c) => c.stage === stage.key);
            const droppable = canMove && target === stage.key;
            const isOver = overStage === stage.key && droppable;
            return (
              <section
                key={stage.key}
                aria-label={`${stage.label} (${items.length})`}
                onDragOver={(e) => {
                  if (!droppable) return;
                  e.preventDefault();
                  setOverStage(stage.key);
                }}
                onDragLeave={() => setOverStage((s) => (s === stage.key ? null : s))}
                onDrop={(e) => {
                  e.preventDefault();
                  setOverStage(null);
                  setDragId(null);
                  if (dragged && droppable) onMove(dragged, stage.key);
                }}
                className={`flex w-60 shrink-0 flex-col rounded-card border bg-surface-sunken ${isOver ? "border-accent" : droppable ? "border-accent-border" : "border-border"}`}
              >
                <header className="flex items-center justify-between border-b border-divider px-3 py-2">
                  <StatusPill meta={stage} size="xs" />
                  <span className="text-[11px] tabular-nums text-ink-muted">{items.length}</span>
                </header>
                <div className="flex max-h-[62vh] min-h-[120px] flex-col gap-2 overflow-y-auto p-2">
                  {items.length ? (
                    items.map((c) => {
                      const next = canMove ? nextManualStage(c) : null;
                      return (
                        <article
                          key={c.id}
                          draggable={Boolean(next)}
                          onDragStart={() => setDragId(c.id)}
                          onDragEnd={() => setDragId(null)}
                          className={`rounded-md border border-border bg-surface p-2.5 shadow-sm ${dragId === c.id ? "opacity-50" : ""}`}
                        >
                          <button type="button" onClick={() => onOpen(c)} className="flex w-full items-start gap-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-border">
                            <Avatar name={c.name} size="sm" />
                            <span className="min-w-0">
                              <span className="block truncate text-xs font-medium text-ink">{c.name}</span>
                              <span className="block truncate text-[11px] text-ink-muted">{c.designation || "No requisition"}</span>
                            </span>
                          </button>
                          <div className="mt-2 flex flex-wrap items-center gap-1">
                            {c.interviewStatus ? <StatusPill meta={interviewStatusMeta(c.interviewStatus)} size="xs" /> : null}
                            {c.offerStatus ? <StatusPill meta={offerStatusMeta(c.offerStatus)} size="xs" /> : null}
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-ink-muted">
                            <span className="truncate">{c.source}</span>
                            <span className="shrink-0">{fmtRelative(c.lastActivityAt)}</span>
                          </div>
                          {next ? (
                            <button type="button" className={`${btn.ghost} mt-1 w-full justify-center`} onClick={() => onMove(c, next.key)}>
                              Move to {next.label} <ArrowRight className="h-3 w-3" />
                            </button>
                          ) : null}
                        </article>
                      );
                    })
                  ) : (
                    <p className="py-6 text-center text-[11px] text-ink-muted">No candidates</p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
