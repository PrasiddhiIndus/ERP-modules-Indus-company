import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  EmptyState,
  InlineAlert,
  KpiTile,
  LoadingBlock,
  PageTaskHeader,
  SectionCard,
} from "../../components/erpUi";
import { useAuth } from "../../contexts/AuthContext";
import { canAgent, canAdmin } from "./itSupportAccess";
import { dashboardCounts } from "./itSupportApi";

export default function DashboardPage() {
  const { user, userProfile } = useAuth();
  const navigate = useNavigate();
  const [counts, setCounts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const allowed = canAgent(userProfile) || canAdmin(userProfile);

  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setError("");
    try {
      const data = await dashboardCounts({ userId: user?.id });
      setCounts(data);
    } catch (err) {
      setError(err.message || "Could not load dashboard.");
    } finally {
      setLoading(false);
    }
  }, [allowed, user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!allowed) {
    return <EmptyState title="No access" message="The IT dashboard is for agents and admins." />;
  }

  return (
    <>
      <PageTaskHeader
        title="IT Support dashboard"
        subtitle="A quick view of open work and SLA pressure."
      />
      {error ? (
        <InlineAlert tone="error" onDismiss={() => setError("")}>
          {error}
        </InlineAlert>
      ) : null}
      <SectionCard title="Today">
        {loading || !counts ? (
          <LoadingBlock label="Loading counts…" />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
            <KpiTile
              label="New"
              value={counts.newCount}
              onClick={() => navigate("/app/it-support/queue?status=new")}
              tone="border-violet-200"
            />
            <KpiTile
              label="Assigned to me"
              value={counts.assignedToMe}
              onClick={() => navigate("/app/it-support/queue?assignee=me")}
              tone="border-sky-200"
            />
            <KpiTile
              label="On hold"
              value={counts.onHold}
              onClick={() => navigate("/app/it-support/queue?status=on_hold")}
              tone="border-slate-300"
            />
            <KpiTile
              label="SLA breached"
              value={counts.slaBreached}
              onClick={() => navigate("/app/it-support/queue?breached=1")}
              tone="border-red-200"
            />
            <KpiTile
              label="Resolved today"
              value={counts.resolvedToday}
              onClick={() => navigate("/app/it-support/queue?status=resolved")}
              tone="border-emerald-200"
            />
          </div>
        )}
      </SectionCard>
    </>
  );
}
