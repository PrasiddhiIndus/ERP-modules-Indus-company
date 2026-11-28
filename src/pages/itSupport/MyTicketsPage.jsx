import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Ticket } from "lucide-react";
import {
  DenseTable,
  EmptyState,
  InlineAlert,
  LoadingBlock,
  PageTaskHeader,
  SectionCard,
} from "../../components/erpUi";
import { useAuth } from "../../contexts/AuthContext";
import { resolveItSupportAccess } from "./itSupportAccess";
import {
  createItSupportRefreshScheduler,
  listMyTickets,
  subscribeItSupportRealtime,
} from "./itSupportApi";
import StatusBadge from "./components/StatusBadge";
import PriorityBadge from "./components/PriorityBadge";
import TicketFilters from "./components/TicketFilters";
import { impactLabel, supportTypeLabel } from "./itSupportConstants";
import { formatErpModulePath } from "./itSupportModuleOptions";

export default function MyTicketsPage() {
  const { user, userProfile } = useAuth();
  const navigate = useNavigate();
  const access = resolveItSupportAccess(userProfile);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ search: "", status: "" });
  const hasLoadedRef = useRef(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    if (hasLoadedRef.current) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const data = await listMyTickets({
        userId: user.id,
        search: filters.search,
        status: filters.status,
      });
      setRows(data);
      hasLoadedRef.current = true;
    } catch (err) {
      setError(err.message || "Could not load tickets.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id, filters.search, filters.status]);

  useEffect(() => {
    const t = setTimeout(load, filters.search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, filters.search]);

  useEffect(() => {
    if (!user?.id) return undefined;
    const scheduler = createItSupportRefreshScheduler(load, 400);
    const unsub = subscribeItSupportRealtime(() => scheduler.schedule(), {
      channelName: "it-support-my-tickets-live",
      includeNotifications: false,
    });
    const onFocus = () => scheduler.schedule();
    window.addEventListener("focus", onFocus);
    return () => {
      scheduler.cancel();
      unsub();
      window.removeEventListener("focus", onFocus);
    };
  }, [user?.id, load]);

  if (!(access.software.canMyTickets || access.hardware.canMyTickets)) {
    return <EmptyState title="No access" message="You cannot view IT support tickets." />;
  }

  const columns = [
    {
      key: "ticket_no",
      label: "Ticket",
      render: (r) => <span className="font-medium text-ink-strong">{r.ticket_no || "—"}</span>,
    },
    {
      key: "viewer_role",
      label: "Role",
      render: (r) =>
        r.viewer_role === "cc" ? (
          <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-800">
            On CC
          </span>
        ) : (
          <span className="text-[11px] text-ink-muted">Raised by you</span>
        ),
    },
    {
      key: "support_type",
      label: "Type",
      render: (r) => (
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${
            r.support_type === "hardware"
              ? "border-amber-200 bg-amber-50 text-amber-900"
              : "border-indigo-200 bg-indigo-50 text-indigo-900"
          }`}
        >
          {r.support_type === "hardware" ? "Hardware" : "Software"}
        </span>
      ),
    },
    {
      key: "title",
      label: "Title",
      render: (r) => <span className="max-w-[220px] truncate block">{r.title}</span>,
    },
    {
      key: "erp_module",
      label: "Area",
      render: (r) => (
        <span
          className="max-w-[180px] truncate block"
          title={
            r.support_type === "hardware"
              ? r.category?.name || supportTypeLabel(r.support_type)
              : formatErpModulePath(r)
          }
        >
          {r.support_type === "hardware"
            ? r.category?.name || "Hardware"
            : formatErpModulePath(r)}
        </span>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: "priority",
      label: "Priority",
      render: (r) => <PriorityBadge priority={r.priority} />,
    },
    {
      key: "impact",
      label: "Impact",
      render: (r) => impactLabel(r.impact),
    },
    {
      key: "created_at",
      label: "Created",
      render: (r) =>
        r.created_at ? new Date(r.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—",
    },
  ];

  return (
    <>
      <PageTaskHeader
        title="My tickets"
        subtitle="All software and hardware tickets you raised or were kept on CC — with live status."
      />
      <TicketFilters
        search={filters.search}
        status={filters.status}
        onChange={(patch) => setFilters((f) => ({ ...f, ...patch }))}
      />
      {error ? (
        <InlineAlert tone="error" onDismiss={() => setError("")}>
          {error}
        </InlineAlert>
      ) : null}
      {refreshing ? (
        <p className="text-[11px] text-ink-muted -mt-1 mb-1">Updating…</p>
      ) : null}
      <SectionCard title={`Tickets (${rows.length})`}>
        {loading && rows.length === 0 ? (
          <LoadingBlock label="Loading your tickets…" />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Ticket}
            title="No tickets yet"
            message="Tickets you raise or are CC’d on will show up here."
          />
        ) : (
          <DenseTable
            columns={columns}
            rows={rows}
            rowKey="id"
            onRowClick={(r) => navigate(`/app/it-support/tickets/${r.id}`)}
          />
        )}
      </SectionCard>
    </>
  );
}
