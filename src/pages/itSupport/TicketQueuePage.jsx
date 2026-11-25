import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Columns3, Table2 } from "lucide-react";
import {
  DenseTable,
  EmptyState,
  FormField,
  InlineAlert,
  LoadingBlock,
  Modal,
  PageTaskHeader,
  PrimaryButton,
  SecondaryButton,
  SectionCard,
} from "../../components/erpUi";
import { useAuth } from "../../contexts/AuthContext";
import { toast } from "../../lib/toast";
import { canAgent, canAdmin } from "./itSupportAccess";
import { KANBAN_STATUSES, statusLabel } from "./itSupportConstants";
import {
  changeStatus,
  createItSupportRefreshScheduler,
  listAgents,
  listCategories,
  listQueueTickets,
  subscribeItSupportRealtime,
} from "./itSupportApi";
import { formatErpModulePath, getItSupportModuleOptions } from "./itSupportModuleOptions";
import PriorityBadge from "./components/PriorityBadge";
import StatusBadge from "./components/StatusBadge";
import SlaTimer from "./components/SlaTimer";
import TicketFilters from "./components/TicketFilters";

function raiserFromTicket(ticket) {
  const id = ticket?.requester_id;
  if (!id) return null;
  const label =
    ticket.requester?.username ||
    ticket.requester_display_name ||
    ticket.requester?.email ||
    id;
  return {
    id,
    label: String(label),
    employee_code: ticket.requester?.employee_code || ticket.requester_employee_code || "",
  };
}

function mergeRaisers(prev, tickets) {
  const map = new Map((prev || []).map((r) => [r.id, r]));
  for (const t of tickets || []) {
    const r = raiserFromTicket(t);
    if (r) map.set(r.id, r);
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
}

function ticketMatchesFilters(ticket, filters) {
  if (!ticket) return false;
  if (filters.status && ticket.status !== filters.status) return false;
  if (filters.priority && ticket.priority !== filters.priority) return false;
  if (filters.categoryId && ticket.category_id !== filters.categoryId) return false;
  if (filters.erpModuleKey && ticket.erp_module_key !== filters.erpModuleKey) return false;
  if (filters.breachedOnly) {
    if (!ticket.first_response_breached && !ticket.resolution_breached) return false;
  }
  if (filters.assigneeId === "unassigned") {
    if (ticket.assignee_id) return false;
  } else if (filters.assigneeId && ticket.assignee_id !== filters.assigneeId) {
    return false;
  }
  if (filters.requesterId && ticket.requester_id !== filters.requesterId) return false;
  const q = String(filters.search || "").trim().toLowerCase();
  if (q) {
    const hay = [
      ticket.ticket_no,
      ticket.title,
      ticket.erp_module_label,
      ticket.erp_submodule_label,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

export default function TicketQueuePage() {
  const { user, userProfile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const allowed = canAgent(userProfile) || canAdmin(userProfile);

  const [view, setView] = useState("table");
  const [rows, setRows] = useState([]);
  const [agents, setAgents] = useState([]);
  const [categories, setCategories] = useState([]);
  const [raisers, setRaisers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const moduleOptions = useMemo(() => getItSupportModuleOptions(), []);
  const [filters, setFilters] = useState(() => ({
    search: "",
    status: searchParams.get("status") || "",
    priority: "",
    assigneeId:
      searchParams.get("assignee") === "me" && user?.id ? user.id : searchParams.get("assignee") || "",
    requesterId: searchParams.get("raisedBy") || "",
    categoryId: "",
    erpModuleKey: "",
    breachedOnly: searchParams.get("breached") === "1",
  }));
  const [dragTicketId, setDragTicketId] = useState(null);
  const [statusModal, setStatusModal] = useState({ open: false, ticketId: null, status: "", remark: "" });
  const [statusSaving, setStatusSaving] = useState(false);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const requestIdRef = useRef(0);

  // Masters / agents once — not on every filter keystroke.
  useEffect(() => {
    if (!allowed) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const [agentList, cats, seedTickets] = await Promise.all([
          listAgents(),
          listCategories(),
          // Seed Raised by options from the full live queue (not narrowed by filters).
          listQueueTickets({}),
        ]);
        if (cancelled) return;
        setAgents(agentList);
        setCategories((cats.categories || []).filter((c) => c.is_active !== false));
        setRaisers(mergeRaisers([], seedTickets));
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not load queue filters.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [allowed]);

  const loadTickets = useCallback(
    async ({ silent = false } = {}) => {
      if (!allowed) return;
      const reqId = ++requestIdRef.current;
      if (silent) setRefreshing(true);
      else setLoading(true);
      setError("");
      try {
        const tickets = await listQueueTickets(filters);
        if (reqId !== requestIdRef.current) return;
        setRows(tickets);
        setRaisers((prev) => mergeRaisers(prev, tickets));
      } catch (err) {
        if (reqId !== requestIdRef.current) return;
        setError(err.message || "Could not load queue.");
      } finally {
        if (reqId !== requestIdRef.current) return;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [allowed, filters]
  );

  useEffect(() => {
    const delay = filters.search ? 300 : 0;
    const silent = rowsRef.current.length > 0;
    const t = setTimeout(() => loadTickets({ silent }), delay);
    return () => clearTimeout(t);
  }, [loadTickets, filters.search]);

  // Live queue — realtime DB changes, not static/mock snapshots.
  useEffect(() => {
    if (!allowed) return undefined;
    const scheduler = createItSupportRefreshScheduler(
      () => loadTickets({ silent: true }),
      400
    );
    const unsub = subscribeItSupportRealtime(() => scheduler.schedule(), {
      channelName: "it-support-queue-live",
      includeNotifications: false,
    });
    const onFocus = () => scheduler.schedule();
    window.addEventListener("focus", onFocus);
    return () => {
      scheduler.cancel();
      unsub();
      window.removeEventListener("focus", onFocus);
    };
  }, [allowed, loadTickets]);

  const columns = useMemo(
    () => [
      {
        key: "ticket_no",
        label: "Ticket",
        render: (r) => <span className="font-medium text-ink-strong">{r.ticket_no}</span>,
      },
      {
        key: "title",
        label: "Title",
        render: (r) => <span className="max-w-[200px] truncate block">{r.title}</span>,
      },
      {
        key: "erp_module",
        label: "Module",
        render: (r) => (
          <span className="max-w-[160px] truncate block" title={formatErpModulePath(r)}>
            {formatErpModulePath(r)}
          </span>
        ),
      },
      {
        key: "requester",
        label: "Raised by",
        render: (r) =>
          r.requester?.username ||
          r.requester?.email ||
          r.requester_display_name ||
          "—",
      },
      { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
      { key: "priority", label: "Priority", render: (r) => <PriorityBadge priority={r.priority} /> },
      {
        key: "assignee",
        label: "Assigned to",
        render: (r) =>
          r.assignee?.username || r.assignee?.email || r.assignee_display_name || "—",
      },
      {
        key: "sla",
        label: "SLA",
        render: (r) => (
          <SlaTimer
            dueAt={r.resolution_due_at}
            breached={r.resolution_breached}
            paused={Boolean(r.sla_paused_at)}
            label="Res"
          />
        ),
      },
      {
        key: "created_at",
        label: "Created",
        render: (r) =>
          r.created_at
            ? new Date(r.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
            : "—",
      },
    ],
    []
  );

  const byStatus = useMemo(() => {
    const map = Object.fromEntries(KANBAN_STATUSES.map((s) => [s, []]));
    rows.forEach((r) => {
      if (map[r.status]) map[r.status].push(r);
    });
    return map;
  }, [rows]);

  const closeStatusModal = () =>
    setStatusModal({ open: false, ticketId: null, status: "", remark: "" });

  const applyStatusChange = async () => {
    if (statusSaving || !statusModal.ticketId || !statusModal.status) return;
    const ticketId = statusModal.ticketId;
    const nextStatus = statusModal.status;
    const remark = statusModal.remark;
    const previous = rows.find((r) => r.id === ticketId);
    if (!previous) return;

    setStatusSaving(true);
    // Optimistic move in the list / kanban.
    setRows((curr) => {
      const patched = curr.map((r) =>
        r.id === ticketId
          ? { ...r, status: nextStatus, last_status_remark: remark || r.last_status_remark }
          : r
      );
      const updated = { ...previous, status: nextStatus };
      if (!ticketMatchesFilters(updated, { ...filters, search: filters.search })) {
        return patched.filter((r) => r.id !== ticketId);
      }
      return patched;
    });

    try {
      const saved = await changeStatus({
        ticketId,
        status: nextStatus,
        remark,
      });
      setRows((curr) => {
        const merged = curr.map((r) => (r.id === ticketId ? { ...r, ...saved } : r));
        if (!ticketMatchesFilters(saved, filters)) {
          return merged.filter((r) => r.id !== ticketId);
        }
        // If optimistic remove already happened but ticket still matches, re-insert.
        if (!merged.some((r) => r.id === ticketId) && ticketMatchesFilters(saved, filters)) {
          return [saved, ...merged];
        }
        return merged;
      });
      toast.success("Status updated");
      closeStatusModal();
    } catch (err) {
      setRows((curr) => {
        const without = curr.filter((r) => r.id !== ticketId);
        return [previous, ...without];
      });
      toast.error(err.message || "Could not update status.");
    } finally {
      setStatusSaving(false);
    }
  };

  if (!allowed) {
    return <EmptyState title="No access" message="The ticket queue is for IT agents." />;
  }

  const showInitialLoader = loading && rows.length === 0;

  return (
    <>
      <PageTaskHeader
        title="Ticket queue"
        subtitle="Work the open IT Support backlog."
      >
        <div className="inline-flex rounded-md border border-border overflow-hidden">
          <button
            type="button"
            className={`inline-flex items-center gap-1.5 h-9 px-3 text-xs ${view === "table" ? "bg-accent text-white" : "bg-surface text-ink-secondary"}`}
            onClick={() => setView("table")}
          >
            <Table2 className="w-3.5 h-3.5" />
            Table
          </button>
          <button
            type="button"
            className={`inline-flex items-center gap-1.5 h-9 px-3 text-xs border-l border-border ${view === "kanban" ? "bg-accent text-white" : "bg-surface text-ink-secondary"}`}
            onClick={() => setView("kanban")}
          >
            <Columns3 className="w-3.5 h-3.5" />
            Kanban
          </button>
        </div>
      </PageTaskHeader>

      <TicketFilters
        {...filters}
        agents={agents}
        raisers={raisers}
        categories={categories}
        modules={moduleOptions}
        showAgentFilters
        onChange={(patch) => setFilters((f) => ({ ...f, ...patch }))}
      />

      {error ? (
        <InlineAlert tone="error" onDismiss={() => setError("")}>
          {error}
        </InlineAlert>
      ) : null}

      {refreshing ? (
        <p className="text-[11px] text-ink-muted -mt-1 mb-1">Updating queue…</p>
      ) : null}

      {showInitialLoader ? (
        <LoadingBlock label="Loading queue…" />
      ) : view === "table" ? (
        <SectionCard title={`Queue (${rows.length})`}>
          {rows.length === 0 ? (
            <EmptyState title="Queue is clear" message="No tickets match these filters." />
          ) : (
            <DenseTable
              columns={columns}
              rows={rows}
              rowKey="id"
              onRowClick={(r) => navigate(`/app/it-support/tickets/${r.id}`)}
            />
          )}
        </SectionCard>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2 min-h-[420px]">
          {KANBAN_STATUSES.map((status) => (
            <div
              key={status}
              className="w-[260px] shrink-0 rounded-card border border-border bg-surface-sunken/40 flex flex-col"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (statusSaving) return;
                const ticketId = dragTicketId || e.dataTransfer.getData("text/ticket-id");
                if (!ticketId) return;
                const current = rows.find((r) => r.id === ticketId);
                if (!current || current.status === status) return;
                setStatusModal({ open: true, ticketId, status, remark: "" });
                setDragTicketId(null);
              }}
            >
              <div className="px-3 py-2 border-b border-border flex items-center justify-between">
                <span className="text-xs font-semibold text-ink-strong">{statusLabel(status)}</span>
                <span className="text-[10px] text-ink-muted">{byStatus[status]?.length || 0}</span>
              </div>
              <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[70vh]">
                {(byStatus[status] || []).map((t) => (
                  <div
                    key={t.id}
                    draggable={!statusSaving}
                    onDragStart={(e) => {
                      setDragTicketId(t.id);
                      e.dataTransfer.setData("text/ticket-id", t.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onClick={() => navigate(`/app/it-support/tickets/${t.id}`)}
                    className="rounded-lg border border-border bg-surface p-2.5 shadow-sm cursor-grab active:cursor-grabbing hover:border-accent-border"
                  >
                    <p className="text-[11px] font-medium text-accent">{t.ticket_no}</p>
                    <p className="text-xs text-ink-strong mt-0.5 line-clamp-2">{t.title}</p>
                    <p className="text-[10px] text-ink-muted mt-1 line-clamp-1" title={formatErpModulePath(t)}>
                      {formatErpModulePath(t)}
                    </p>
                    <p className="text-[10px] text-ink-muted line-clamp-1">
                      {t.requester?.username || t.requester_display_name || "—"}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <PriorityBadge priority={t.priority} />
                    </div>
                    <p className="mt-1.5 text-[10px] text-ink-muted truncate">
                      {t.assignee?.username || t.assignee_display_name || "Unassigned"}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={statusModal.open}
        title="Move ticket"
        onClose={() => {
          if (!statusSaving) closeStatusModal();
        }}
        footer={
          <div className="flex justify-end gap-2">
            <SecondaryButton onClick={closeStatusModal} disabled={statusSaving}>
              Cancel
            </SecondaryButton>
            <PrimaryButton onClick={applyStatusChange} disabled={statusSaving}>
              {statusSaving ? "Saving…" : "Confirm"}
            </PrimaryButton>
          </div>
        }
      >
        <p className="text-xs text-ink-secondary mb-3">
          Move to <strong>{statusLabel(statusModal.status)}</strong>. Add a remark if helpful.
        </p>
        <FormField label="Remark">
          <textarea
            className="w-full min-h-[80px] border border-border rounded-control px-2.5 py-2 text-xs"
            value={statusModal.remark}
            disabled={statusSaving}
            onChange={(e) => setStatusModal((m) => ({ ...m, remark: e.target.value }))}
            placeholder="Optional note for the timeline…"
          />
        </FormField>
      </Modal>
    </>
  );
}
