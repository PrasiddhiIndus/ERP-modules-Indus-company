import React, { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import {
  BookOpen,
  Bug,
  ClipboardCheck,
  FileCheck2,
  FileSearch,
  GitBranch,
  LayoutDashboard,
  ListTodo,
  PlayCircle,
  ScrollText,
  Shield,
} from "lucide-react";
import { InlineAlert, PageShell, TinySelect } from "../../components/erpUi";
import { useAuth } from "../../contexts/AuthContext";
import { canOpenQa, qaLandingPath, resolveQaAccess } from "./qaAccess";
import { ACCESS_KEYS, QA_BASE } from "./qaConstants";
import {
  createQaRefreshScheduler,
  fetchMyQaRole,
  fetchQaBadgeCounts,
  subscribeQaRealtime,
} from "./qaApi";
import { QaReleaseProvider, useQaRelease } from "./QaReleaseContext";
import { QaHelpButton } from "./components/QaHelpButton";

const ALL_TABS = [
  { to: QA_BASE, label: "Dashboard", icon: LayoutDashboard, page: "dashboard", end: true },
  { to: `${QA_BASE}/requests`, label: "Requests", icon: ListTodo, page: "requests" },
  { to: `${QA_BASE}/cases`, label: "Test cases", icon: ClipboardCheck, page: "cases", badge: "draftCases" },
  { to: `${QA_BASE}/execution`, label: "Execution", icon: PlayCircle, page: "execution" },
  { to: `${QA_BASE}/defects`, label: "Defects", icon: Bug, page: "defects", badge: "openDefects" },
  { to: `${QA_BASE}/traceability`, label: "Traceability", icon: GitBranch, page: "traceability" },
  { to: `${QA_BASE}/release-gate`, label: "Release gate", icon: FileCheck2, page: "releaseGate" },
  { to: `${QA_BASE}/audit`, label: "Audit", icon: ScrollText, page: "audit" },
  { to: `${QA_BASE}/standards`, label: "Standards", icon: FileSearch, page: "standards" },
  { to: `${QA_BASE}/manual`, label: "User manual", icon: BookOpen, page: "manual" },
];

const tabClass = ({ isActive }) =>
  `inline-flex h-9 items-center gap-2 px-3.5 rounded-md text-sm font-medium border transition-colors ${
    isActive
      ? "bg-accent text-white border-accent"
      : "bg-surface-sunken text-ink-secondary hover:bg-surface border-border"
  }`;

function QaLayoutInner() {
  const { userProfile } = useAuth();
  const { pathname } = useLocation();
  const { releases, releaseId, setReleaseId, loading: releasesLoading, error: releasesError } =
    useQaRelease();
  const [qaRole, setQaRole] = useState(null);
  const [badges, setBadges] = useState({ draftCases: 0, openDefects: 0 });

  const access = useMemo(() => resolveQaAccess(userProfile, qaRole), [userProfile, qaRole]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const role = await fetchMyQaRole();
        if (!cancelled) setQaRole(role);
      } catch {
        if (!cancelled) setQaRole(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userProfile?.id]);

  const loadBadges = useCallback(async () => {
    if (!releaseId) {
      setBadges({ draftCases: 0, openDefects: 0 });
      return;
    }
    try {
      const counts = await fetchQaBadgeCounts(releaseId);
      setBadges(counts);
    } catch {
      /* badges are best-effort */
    }
  }, [releaseId]);

  useEffect(() => {
    loadBadges();
    const scheduler = createQaRefreshScheduler(loadBadges, 500);
    const unsub = subscribeQaRealtime(() => scheduler.schedule(), { channelName: "qa-layout-badges" });
    return () => {
      scheduler.cancel();
      unsub();
    };
  }, [loadBadges]);

  if (!canOpenQa(userProfile)) {
    return <Navigate to="/app/dashboard" replace />;
  }

  const tabs = ALL_TABS.filter((t) => access.pages[t.page]);

  const onIndex = pathname === QA_BASE || pathname === `${QA_BASE}/`;
  if (onIndex && !access.pages.dashboard) {
    return <Navigate to={qaLandingPath(userProfile)} replace />;
  }

  return (
    <PageShell>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <div className="min-w-0 flex items-start gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft text-accent border border-accent-border/40 shrink-0">
            <Shield className="w-5 h-5" />
          </span>
          <div>
            <h1 className="type-page-title text-ink">QA</h1>
            <p className="type-meta text-ink-secondary mt-1">
              Requests, cases, execution, defects, and release gate — scoped to the selected release.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <label className="text-[11px] font-medium text-ink-muted">Release</label>
          <TinySelect
            value={releaseId}
            disabled={releasesLoading}
            onChange={(e) => setReleaseId(e.target.value)}
            aria-label="Selected release"
          >
            <option value="">All / none</option>
            {releases.map((r) => (
              <option key={r.id} value={r.id}>
                {r.id}
                {r.status !== "open" ? ` (${r.status})` : ""}
              </option>
            ))}
          </TinySelect>
          {qaRole ? (
            <span className="text-[11px] text-ink-muted border border-border rounded-md px-2 py-1 bg-surface">
              Role: {qaRole.replace(/_/g, " ")}
            </span>
          ) : (
            <span className="text-[11px] text-warning border border-warning-border rounded-md px-2 py-1 bg-warning-soft">
              Not a QA member
            </span>
          )}
          <QaHelpButton />
        </div>
      </div>

      {releasesError ? <InlineAlert tone="error" className="mb-2">{releasesError}</InlineAlert> : null}

      <div className="qa-layout-tabs flex flex-wrap gap-2 mb-3 print:hidden">
        {tabs.map((t) => {
          const count = t.badge ? badges[t.badge] : 0;
          return (
            <NavLink key={t.to} to={t.to} end={Boolean(t.end)} className={tabClass}>
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
              {count > 0 ? (
                <span className="ml-0.5 inline-flex min-w-[1.1rem] h-[1.1rem] px-1 items-center justify-center rounded-full bg-critical text-white text-[10px] font-semibold">
                  {count > 99 ? "99+" : count}
                </span>
              ) : null}
            </NavLink>
          );
        })}
      </div>

      <Outlet context={{ access, qaRole, pageKeys: ACCESS_KEYS }} />
    </PageShell>
  );
}

export default function QaLayout() {
  return (
    <QaReleaseProvider>
      <QaLayoutInner />
    </QaReleaseProvider>
  );
}
