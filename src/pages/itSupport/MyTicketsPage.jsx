import React, { useCallback, useEffect, useState } from "react";
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
import { canRaise } from "./itSupportAccess";
import { listMyTickets } from "./itSupportApi";
import StatusBadge from "./components/StatusBadge";
import PriorityBadge from "./components/PriorityBadge";
import TicketFilters from "./components/TicketFilters";
import { impactLabel } from "./itSupportConstants";

export default function MyTicketsPage() {
  const { user, userProfile } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ search: "", status: "" });

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError("");
    try {
      const data = await listMyTickets({
        userId: user.id,
        search: filters.search,
        status: filters.status,
      });
      setRows(data);
    } catch (err) {
      setError(err.message || "Could not load tickets.");
    } finally {
      setLoading(false);
    }
  }, [user?.id, filters.search, filters.status]);

  useEffect(() => {
    const t = setTimeout(load, filters.search ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, filters.search]);

  if (!canRaise(userProfile)) {
    return <EmptyState title="No access" message="You cannot view IT support tickets." />;
  }

  const columns = [
    {
      key: "ticket_no",
      label: "Ticket",
      render: (r) => <span className="font-medium text-ink-strong">{r.ticket_no || "—"}</span>,
    },
    {
      key: "title",
      label: "Title",
      render: (r) => <span className="max-w-[280px] truncate block">{r.title}</span>,
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
        subtitle="Track requests you have raised with IT Support."
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
      <SectionCard title={`Tickets (${rows.length})`}>
        {loading ? (
          <LoadingBlock label="Loading your tickets…" />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Ticket}
            title="No tickets yet"
            message="When you raise a request, it will show up here."
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
