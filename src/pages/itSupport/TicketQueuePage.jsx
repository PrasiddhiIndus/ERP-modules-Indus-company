import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  listAgents,
  listCategories,
  listQueueTickets,
} from "./itSupportApi";
import PriorityBadge from "./components/PriorityBadge";
import StatusBadge from "./components/StatusBadge";
import SlaTimer from "./components/SlaTimer";
import TicketFilters from "./components/TicketFilters";

export default function TicketQueuePage() {
  const { user, userProfile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const allowed = canAgent(userProfile) || canAdmin(userProfile);

  const [view, setView] = useState("table");
  const [rows, setRows] = useState([]);
  const [agents, setAgents] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState(() => ({
    search: "",
    status: searchParams.get("status") || "",
    priority: "",
    assigneeId:
      searchParams.get("assignee") === "me" && user?.id ? user.id : searchParams.get("assignee") || "",
    categoryId: "",
    breachedOnly: searchParams.get("breached") === "1",
  }));
  const [dragTicketId, setDragTicketId] = useState(null);
  const [statusModal, setStatusModal] = useState({ open: false, ticketId: null, status: "", remark: "" });

  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setError("");
    try {
      const [tickets, agentList, cats] = await Promise.all([
        listQueueTickets(filters),
        listAgents(),
        listCategories(),
      ]);
      setRows(tickets);
      setAgents(agentList);
      setCategories((cats.categories || []).filter((c) => c.is_active !== false));
    } catch (err) {
      setError(err.message || "Could not load queue.");
    } finally {
      setLoading(false);
    }
  }, [allowed, filters]);

  useEffect(() => {
    const t = setTimeout(load, filters.search ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, filters.search]);

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
        render: (r) => <span className="max-w-[240px] truncate block">{r.title}</span>,
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
      else if (!map.closed) {
        /* skip closed/other in kanban */
      }
    });
    return map;
  }, [rows]);

  const applyStatusChange = async () => {
    try {
      await changeStatus({
        ticketId: statusModal.ticketId,
        status: statusModal.status,
        remark: statusModal.remark,
      });
      toast.success("Status updated");
      setStatusModal({ open: false, ticketId: null, status: "", remark: "" });
      await load();
    } catch (err) {
      toast.error(err.message || "Could not update status.");
    }
  };

  if (!allowed) {
    return <EmptyState title="No access" message="The ticket queue is for IT agents." />;
  }

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
        categories={categories}
        showAgentFilters
        onChange={(patch) => setFilters((f) => ({ ...f, ...patch }))}
      />

      {error ? (
        <InlineAlert tone="error" onDismiss={() => setError("")}>
          {error}
        </InlineAlert>
      ) : null}

      {loading ? (
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
                    draggable
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
        onClose={() => setStatusModal({ open: false, ticketId: null, status: "", remark: "" })}
        footer={
          <div className="flex justify-end gap-2">
            <SecondaryButton
              onClick={() => setStatusModal({ open: false, ticketId: null, status: "", remark: "" })}
            >
              Cancel
            </SecondaryButton>
            <PrimaryButton onClick={applyStatusChange}>Confirm</PrimaryButton>
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
            onChange={(e) => setStatusModal((m) => ({ ...m, remark: e.target.value }))}
            placeholder="Optional note for the timeline…"
          />
        </FormField>
      </Modal>
    </>
  );
}
