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
import { resolveSupportTypeAccess } from "./itSupportAccess";
import {
  createItSupportRefreshScheduler,
  dashboardCounts,
  IT_SUPPORT_OPEN_COUNT_EVENT,
  subscribeItSupportRealtime,
} from "./itSupportApi";
import { useSupportType } from "./SupportTypeContext";

export default function DashboardPage() {
  const { user, userProfile } = useAuth();
  const navigate = useNavigate();
  const { supportType, supportTypeLabel, pathFor } = useSupportType();
  const [counts, setCounts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const typeAccess = resolveSupportTypeAccess(userProfile, supportType);
  const allowed = typeAccess.canDashboard;

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!allowed) return;
      if (!silent) setLoading(true);
      setError("");
      try {
        const data = await dashboardCounts({ userId: user?.id, supportType });
        setCounts(data);
      } catch (err) {
        setError(err.message || "Could not load dashboard.");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [allowed, user?.id, supportType]
  );

  useEffect(() => {
    load({ silent: false });
    const scheduler = createItSupportRefreshScheduler(() => load({ silent: true }), 350);
    const onChanged = () => scheduler.schedule();
    const unsub = subscribeItSupportRealtime(onChanged, {
      channelName: `it-support-dashboard-${supportType}-live`,
      includeNotifications: false,
    });
    window.addEventListener(IT_SUPPORT_OPEN_COUNT_EVENT, onChanged);
    const onFocus = () => scheduler.schedule();
    window.addEventListener("focus", onFocus);
    return () => {
      scheduler.cancel();
      unsub();
      window.removeEventListener(IT_SUPPORT_OPEN_COUNT_EVENT, onChanged);
      window.removeEventListener("focus", onFocus);
    };
  }, [load, supportType]);

  if (!allowed) {
    return <EmptyState title="No access" message="The IT dashboard is for agents and admins." />;
  }

  return (
    <>
      <PageTaskHeader
        title={`${supportTypeLabel} dashboard`}
        subtitle={
          supportType === "hardware"
            ? "Open hardware work and SLA pressure for devices, printers and network."
            : "Open software work and SLA pressure for ERP, apps and related requests."
        }
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
              onClick={() => navigate(`${pathFor("queue")}?status=new`)}
              tone="border-violet-200"
            />
            <KpiTile
              label="Assigned to me"
              value={counts.assignedToMe}
              onClick={() => navigate(`${pathFor("queue")}?assignee=me`)}
              tone="border-sky-200"
            />
            <KpiTile
              label="On hold"
              value={counts.onHold}
              onClick={() => navigate(`${pathFor("queue")}?status=on_hold`)}
              tone="border-slate-300"
            />
            <KpiTile
              label="SLA breached"
              value={counts.slaBreached}
              onClick={() => navigate(`${pathFor("queue")}?breached=1`)}
              tone="border-red-200"
            />
            <KpiTile
              label="Resolved today"
              value={counts.resolvedToday}
              onClick={() => navigate(`${pathFor("queue")}?status=resolved`)}
              tone="border-emerald-200"
            />
          </div>
        )}
      </SectionCard>
    </>
  );
}
