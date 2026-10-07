import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarClock, Eye, UserCheck } from "lucide-react";
import { STAGE_INDEX, appointmentStatusMeta, offerStatusMeta } from "./recruitmentConfig";
import { listCandidates } from "./recruitmentService";
import {
  AsyncBoundary,
  Avatar,
  DataTable,
  IconButton,
  ProgressBar,
  ReadinessIndicator,
  SearchBox,
  StatTile,
  StatusPill,
  Tabs,
  btn,
  fmtDate,
  useCapabilities,
  useRecruitmentData,
} from "./RecruitmentUi";
import { JoiningDateModal, MarkJoinedModal } from "./RecruitmentForms";

export default function JoiningPage() {
  const navigate = useNavigate();
  const caps = useCapabilities();
  const { data, loading, error, reload } = useRecruitmentData(listCandidates);
  const [tab, setTab] = useState("upcoming");
  const [search, setSearch] = useState("");
  const [joinFor, setJoinFor] = useState(null);
  const [dateFor, setDateFor] = useState(null);

  const pool = useMemo(() => (data || []).filter((c) => !c.outcome && STAGE_INDEX[c.stage] >= STAGE_INDEX.offer_accepted), [data]);

  const groups = useMemo(() => {
    const preJoin = pool.filter((c) => STAGE_INDEX[c.stage] < STAGE_INDEX.joined);
    return {
      upcoming: preJoin,
      ready: preJoin.filter((c) => c.stage === "ready_to_join"),
      blocked: preJoin.filter((c) => c.stage !== "ready_to_join"),
      joined: pool.filter((c) => STAGE_INDEX[c.stage] >= STAGE_INDEX.joined),
    };
  }, [pool]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (groups[tab] || []).filter((c) => !q || [c.name, c.designation, c.site].join(" ").toLowerCase().includes(q));
  }, [groups, tab, search]);

  const columns = [
    {
      key: "name",
      label: "Candidate",
      render: (c) => (
        <span className="flex items-center gap-2">
          <Avatar name={c.name} size="sm" />
          <span className="font-medium">{c.name}</span>
        </span>
      ),
    },
    { key: "designation", label: "Designation" },
    { key: "site", label: "Site" },
    { key: "expectedJoining", label: "Expected joining", render: (c) => fmtDate(c.expectedJoining) },
    ...(tab === "joined" ? [{ key: "actualJoining", label: "Actual joining", render: (c) => fmtDate(c.actualJoining) }] : []),
    {
      key: "documents",
      label: "Documents",
      sortValue: (c) => (c.documents.total ? c.documents.verified / c.documents.total : 0),
      render: (c) => (c.documents.total ? <div className="w-28"><ProgressBar value={c.documents.verified} total={c.documents.total} tone={c.documents.pending ? "warning" : "success"} /></div> : <span className="text-ink-muted">—</span>),
    },
    { key: "offerStatus", label: "Offer", render: (c) => (c.offerStatus ? <StatusPill meta={offerStatusMeta(c.offerStatus)} /> : "—") },
    { key: "appointmentStatus", label: "Appointment", render: (c) => (c.appointmentStatus ? <StatusPill meta={appointmentStatusMeta(c.appointmentStatus)} /> : "—") },
    {
      key: "readiness",
      label: "Readiness",
      sortValue: (c) => c.readiness.done,
      render: (c) => (STAGE_INDEX[c.stage] >= STAGE_INDEX.joined ? <StatusPill meta={{ label: c.stage === "employee_created" ? "Employee created" : "Joined", tone: "success" }} /> : <ReadinessIndicator readiness={c.readiness} compact />),
    },
    {
      key: "actions",
      label: "Actions",
      sortable: false,
      render: (c) => (
        <span className="flex items-center gap-1">
          <IconButton icon={Eye} label={`Open ${c.name}`} onClick={() => navigate(`../candidates/${c.id}`)} />
          {caps.joining && STAGE_INDEX[c.stage] < STAGE_INDEX.joined ? (
            <>
              <IconButton icon={CalendarClock} label="Change joining date" onClick={() => setDateFor(c)} />
              <button
                type="button"
                className={btn.ghost}
                disabled={c.stage !== "ready_to_join"}
                title={c.stage === "ready_to_join" ? "Mark as joined" : "Complete all readiness items first"}
                onClick={(e) => {
                  e.stopPropagation();
                  setJoinFor(c);
                }}
              >
                <UserCheck className="h-3.5 w-3.5" /> Mark joined
              </button>
            </>
          ) : null}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Upcoming" value={groups.upcoming.length} tone="info" onClick={() => setTab("upcoming")} />
        <StatTile label="Ready to join" value={groups.ready.length} tone="success" onClick={() => setTab("ready")} />
        <StatTile label="Not ready" value={groups.blocked.length} tone="warning" sub="Pending letter or documents" onClick={() => setTab("blocked")} />
        <StatTile label="Joined" value={groups.joined.length} tone="accent" onClick={() => setTab("joined")} />
      </div>

      <div className="rounded-card border border-border bg-surface shadow-card">
        <div className="px-4 pt-1">
          <Tabs
            ariaLabel="Joining status"
            value={tab}
            onChange={setTab}
            tabs={[
              { key: "upcoming", label: "Upcoming", count: groups.upcoming.length },
              { key: "ready", label: "Ready", count: groups.ready.length },
              { key: "blocked", label: "Not ready", count: groups.blocked.length },
              { key: "joined", label: "Joined", count: groups.joined.length },
            ]}
          />
        </div>
        <div className="px-4 py-3">
          <SearchBox value={search} onChange={setSearch} placeholder="Search candidate, designation, site…" className="w-full sm:w-72" />
        </div>
        <div className="px-4 pb-4">
          <AsyncBoundary loading={loading} error={error} onRetry={reload}>
            <DataTable
              columns={columns}
              rows={filtered}
              onRowClick={(c) => navigate(`../candidates/${c.id}`)}
              initialSort={{ key: "expectedJoining", dir: "asc" }}
              emptyTitle="No candidates here"
              emptyMessage="Candidates appear here after accepting an offer."
            />
          </AsyncBoundary>
        </div>
      </div>

      <MarkJoinedModal open={Boolean(joinFor)} candidate={joinFor} onClose={() => setJoinFor(null)} />
      <JoiningDateModal open={Boolean(dateFor)} candidate={dateFor} onClose={() => setDateFor(null)} />
    </div>
  );
}
