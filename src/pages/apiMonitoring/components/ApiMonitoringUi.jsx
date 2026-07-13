import React from "react";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  Moon,
  Pause,
  Play,
  RefreshCw,
  Search,
  Server,
  Sun,
  X,
  XCircle,
} from "lucide-react";
import { CollapsibleHelp } from "../../adminOperations/components/AdminUi";
import { formatDateTimeDdMmYyyy } from "../../../utils/dateDisplay";
import {
  formatMs,
  statusDotColor,
  statusLabel,
  statusTone,
  uptimeBarColor,
} from "./apiMonitoringUtils";

export function MonitoringShell({ t, children, className = "" }) {
  return (
    <div className={`${t.shell} space-y-5 pb-10 animate-fade-in ${className}`.trim()}>
      {children}
    </div>
  );
}

export function ThemeToggleButton({ theme, onToggle, t }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`inline-flex items-center justify-center min-h-9 min-w-9 rounded-lg border ${t.border} ${t.card} ${t.focusRing} ${t.focusRingDark} transition-colors`}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Light mode" : "Dark mode"}
    >
      {theme === "dark" ? (
        <Sun className="w-4 h-4 text-amber-400" />
      ) : (
        <Moon className="w-4 h-4 text-gray-600" />
      )}
    </button>
  );
}

export function LiveStatusPill({ loading, refreshing, autoRefreshPaused, autoRefreshMs, t }) {
  let label = "Live";
  let tone = t.pillLive;
  if (loading || refreshing) {
    label = "Checking…";
    tone = t.pillChecking;
  } else if (autoRefreshPaused || autoRefreshMs === "0") {
    label = "Paused";
    tone = t.pillPaused;
  }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-medium ${tone}`}>
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          loading || refreshing ? "bg-current animate-pulse" : label === "Live" ? "bg-emerald-500" : "bg-amber-500"
        }`}
      />
      {label}
    </span>
  );
}

export function MonitoringHeader({
  t,
  theme,
  onToggleTheme,
  loading,
  refreshing,
  autoRefreshMs,
  autoRefreshPaused,
  onAutoRefreshChange,
  onTogglePause,
  onRefreshAll,
  refreshOptions,
  lastRefreshAt,
}) {
  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className={`text-xl sm:text-2xl font-bold tracking-tight ${t.text}`}>API Health & Status</h1>
          <LiveStatusPill
            loading={loading}
            refreshing={refreshing}
            autoRefreshPaused={autoRefreshPaused}
            autoRefreshMs={autoRefreshMs}
            t={t}
          />
        </div>
        <p className={`text-sm max-w-2xl ${t.muted}`}>
          Real-time monitoring for internal and external APIs — status, latency, uptime, and check history.
        </p>
        {lastRefreshAt ? (
          <p className={`text-[11px] flex items-center gap-1 ${t.muted}`} aria-live="polite">
            <Activity className="w-3 h-3 shrink-0" />
            Last refreshed: {formatDateTimeDdMmYyyy(lastRefreshAt)}
            {autoRefreshMs !== "0" && !autoRefreshPaused ? (
              <span className={t.dark ? "text-emerald-400" : "text-emerald-700"}> · Auto-refresh active</span>
            ) : null}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <ThemeToggleButton theme={theme} onToggle={onToggleTheme} t={t} />
        <label className={`flex items-center gap-1.5 text-xs ${t.muted}`}>
          <Clock className="w-3.5 h-3.5" />
          <span className="sr-only sm:not-sr-only">Auto-refresh</span>
          <select
            value={autoRefreshMs}
            onChange={onAutoRefreshChange}
            className={`h-9 rounded-lg border px-2 text-xs min-w-[5.5rem] ${t.input} ${t.focusRing}`}
          >
            {refreshOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={onTogglePause}
          className={`inline-flex items-center gap-1 min-h-9 px-2.5 rounded-lg border text-xs font-medium transition-colors ${t.border} ${t.card} ${t.textSecondary} ${t.focusRing} ${t.focusRingDark}`}
          title={autoRefreshPaused ? "Resume auto-refresh" : "Pause auto-refresh"}
        >
          {autoRefreshPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{autoRefreshPaused ? "Resume" : "Pause"}</span>
        </button>
        <button
          type="button"
          onClick={onRefreshAll}
          disabled={refreshing}
          className={`inline-flex items-center gap-1.5 min-h-9 px-3 rounded-lg text-white text-xs font-medium disabled:opacity-60 transition-colors ${t.accentBg} ${t.focusRing} ${t.focusRingDark}`}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh all
        </button>
      </div>
    </header>
  );
}

export function MonitoringHelp({ t }) {
  return (
    <div className={t.muted}>
    <CollapsibleHelp label="about this dashboard">
      <p>
        Monitored APIs are defined in a central registry — add new endpoints there without changing this screen.
        History is kept for the current browser session. Internal APIs are checked against your ERP backend;
        external APIs are probed directly where allowed.
      </p>
    </CollapsibleHelp>
    </div>
  );
}

export function ErrorBanner({ message, t }) {
  if (!message) return null;
  return (
    <div className={`rounded-xl border px-3 py-2.5 text-xs flex gap-2 ${t.errorBanner}`} role="alert">
      <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
      <span>{message}</span>
    </div>
  );
}

export function StatusBadge({ status, t }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full shrink-0 ${statusDotColor(status)}`} aria-hidden />
      <span className={`inline-flex px-2 py-0.5 rounded-md border text-[11px] font-medium ${statusTone(status, t)}`}>
        {statusLabel(status)}
      </span>
    </span>
  );
}

export function UptimeProgressBar({ percent, t, showLabel = true, className = "" }) {
  const n = Math.min(100, Math.max(0, Number(percent) || 0));
  const barColor = uptimeBarColor(n, t);
  return (
    <div className={`flex items-center gap-2 min-w-[4rem] ${className}`}>
      <div className={`flex-1 h-1.5 rounded-full overflow-hidden ${t.progressTrack}`} role="progressbar" aria-valuenow={n} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${n}%` }} />
      </div>
      {showLabel ? (
        <span className={`text-[11px] font-semibold tabular-nums shrink-0 w-10 text-right ${t.textSecondary}`}>
          {n.toFixed(1)}%
        </span>
      ) : null}
    </div>
  );
}

export function LatencyBar({ latencyMs, thresholdMs, t, status }) {
  const latency = Number(latencyMs) || 0;
  const threshold = Number(thresholdMs) || 2000;
  const pct = Math.min(100, (latency / threshold) * 100);
  const barColor =
    status === "offline"
      ? t.progressRed
      : status === "degraded" || latency > threshold
        ? t.progressAmber
        : t.progressGreen;
  return (
    <div className={`h-1 rounded-full overflow-hidden mt-1 max-w-[72px] ${t.progressTrack}`} aria-hidden>
      <div className={`h-full rounded-full transition-all duration-300 ${barColor}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function SummaryCard({ icon: Icon, label, value, sub, accentBorder, t, loading }) {
  if (loading) return <SkeletonKpi t={t} />;
  return (
    <div
      className={`rounded-xl p-4 transition-shadow duration-200 ${t.card} ${t.cardHover} ${
        accentBorder ? `border-l-4 ${accentBorder}` : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={`text-[11px] font-medium uppercase tracking-wide ${t.muted}`}>{label}</p>
          <p className={`text-2xl font-bold mt-1 tabular-nums ${t.text}`}>{value}</p>
          {sub ? <p className={`text-[11px] mt-1 ${t.muted}`}>{sub}</p> : null}
        </div>
        {Icon ? (
          <div className={`p-2 rounded-lg shrink-0 ${t.accentSoft}`}>
            <Icon className={`w-4 h-4 ${t.accent}`} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function SummaryCardsGrid({ summary, filteredCount, avgUptime, t, loading }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
      <SummaryCard
        icon={Server}
        label="Total APIs"
        value={summary.total}
        sub={`${filteredCount} shown`}
        t={t}
        loading={loading}
      />
      <SummaryCard
        icon={CheckCircle2}
        label="Healthy"
        value={summary.healthy}
        sub="Online"
        accentBorder="border-l-emerald-500"
        t={t}
        loading={loading}
      />
      <SummaryCard
        icon={AlertCircle}
        label="Unhealthy"
        value={summary.unhealthy}
        sub="Offline or degraded"
        accentBorder={summary.unhealthy > 0 ? "border-l-red-500" : undefined}
        t={t}
        loading={loading}
      />
      <SummaryCard
        icon={Clock}
        label="Avg response time"
        value={formatMs(summary.avgLatency)}
        sub="Across visible APIs"
        t={t}
        loading={loading}
      />
      <div className={loading ? "" : `rounded-xl p-4 ${t.card} ${t.cardHover}`}>
        {loading ? (
          <SkeletonKpi t={t} />
        ) : (
          <>
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <p className={`text-[11px] font-medium uppercase tracking-wide ${t.muted}`}>Avg uptime</p>
                <p className={`text-2xl font-bold mt-1 tabular-nums ${t.text}`}>{summary.avgUptime}%</p>
                <p className={`text-[11px] mt-1 ${t.muted}`}>Session history</p>
              </div>
              <div className={`p-2 rounded-lg shrink-0 ${t.accentSoft}`}>
                <Activity className={`w-4 h-4 ${t.accent}`} />
              </div>
            </div>
            <UptimeProgressBar percent={avgUptime} t={t} showLabel={false} />
          </>
        )}
      </div>
    </div>
  );
}

export function FilterPanel({
  t,
  typeFilter,
  envFilter,
  statusFilter,
  search,
  onTypeChange,
  onEnvChange,
  onStatusChange,
  onSearchChange,
  onClearSearch,
  environments,
  statusLabels,
  activeFilterCount,
}) {
  return (
    <div className={`rounded-xl p-3 sm:p-4 ${t.card}`}>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className={`block text-[10px] font-medium mb-1 ${t.muted}`}>API type</label>
          <select
            value={typeFilter}
            onChange={onTypeChange}
            className={`h-9 rounded-lg border px-2 text-xs min-w-[7rem] ${t.input} ${t.focusRing}`}
          >
            <option value="all">All types</option>
            <option value="internal">Internal</option>
            <option value="external">External</option>
          </select>
        </div>
        <div>
          <label className={`block text-[10px] font-medium mb-1 ${t.muted}`}>Environment</label>
          <select
            value={envFilter}
            onChange={onEnvChange}
            className={`h-9 rounded-lg border px-2 text-xs min-w-[7rem] ${t.input} ${t.focusRing}`}
          >
            <option value="all">All environments</option>
            {environments.map((env) => (
              <option key={env} value={env}>
                {env}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={`block text-[10px] font-medium mb-1 ${t.muted}`}>Status</label>
          <select
            value={statusFilter}
            onChange={onStatusChange}
            className={`h-9 rounded-lg border px-2 text-xs min-w-[7rem] ${t.input} ${t.focusRing}`}
          >
            <option value="all">All statuses</option>
            {Object.entries(statusLabels).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className={`block text-[10px] font-medium mb-1 ${t.muted}`}>Search</label>
          <div className="relative">
            <Search className={`absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${t.muted}`} />
            <input
              type="search"
              value={search}
              onChange={onSearchChange}
              placeholder="Name, group, description…"
              className={`h-9 w-full min-w-[180px] rounded-lg border pl-8 pr-8 text-xs ${t.input} ${t.focusRing}`}
            />
            {search ? (
              <button
                type="button"
                onClick={onClearSearch}
                className={`absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded ${t.muted} hover:opacity-80 ${t.focusRing}`}
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : null}
          </div>
        </div>
        {activeFilterCount > 0 ? (
          <span className={`self-center px-2 py-1 rounded-full text-[10px] font-medium border ${t.accentSoft}`}>
            {activeFilterCount} filter{activeFilterCount === 1 ? "" : "s"} active
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function SectionCard({ title, right, children, t, className = "" }) {
  return (
    <section className={`rounded-xl overflow-hidden ${t.card} ${className}`}>
      <div className={`px-4 py-3 border-b flex items-center justify-between gap-2 min-h-[48px] ${t.border}`}>
        <h2 className={`text-sm font-semibold ${t.text}`}>{title}</h2>
        {right}
      </div>
      <div className="p-3 sm:p-4">{children}</div>
    </section>
  );
}

export function EmptyState({ icon: Icon, title, description, action, t }) {
  return (
    <div className="py-12 px-4 text-center flex flex-col items-center gap-3">
      {Icon ? <Icon className={`w-10 h-10 ${t.muted}`} strokeWidth={1.25} /> : null}
      <div>
        <p className={`text-sm font-medium ${t.text}`}>{title}</p>
        {description ? <p className={`text-xs mt-1 max-w-sm mx-auto ${t.muted}`}>{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function SkeletonKpi({ t }) {
  return (
    <div className={`rounded-xl p-4 ${t.card} animate-pulse`}>
      <div className={`h-3 w-20 rounded ${t.skeleton}`} />
      <div className={`h-8 w-16 rounded mt-3 ${t.skeleton}`} />
      <div className={`h-2.5 w-24 rounded mt-2 ${t.skeleton}`} />
    </div>
  );
}

export function SkeletonTable({ t, rows = 5 }) {
  return (
    <div className="space-y-2 animate-pulse">
      <div className={`h-9 rounded-lg ${t.skeleton}`} />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={`h-12 rounded-lg ${t.skeleton}`} style={{ opacity: 1 - i * 0.12 }} />
      ))}
    </div>
  );
}

export function MonitoringDrawer({ open, title, onClose, children, t }) {
  React.useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex md:hidden" role="dialog" aria-modal="true" aria-labelledby="api-monitoring-drawer-title">
      <button type="button" className={`absolute inset-0 ${t.drawerOverlay}`} aria-label="Close" onClick={onClose} />
      <div className={`relative ml-auto h-full w-full max-w-lg flex flex-col border-l shadow-2xl ${t.drawerPanel}`}>
        <div className={`flex items-center justify-between px-4 py-3 border-b shrink-0 ${t.border}`}>
          <h3 id="api-monitoring-drawer-title" className={`text-sm font-semibold truncate pr-2 ${t.text}`}>
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className={`p-1.5 rounded-lg ${t.muted} hover:opacity-80 ${t.focusRing}`}
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

export function MetaBadge({ children, tone, t }) {
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-md border text-[10px] font-medium ${tone}`}>{children}</span>
  );
}

export function MetaBadges({ apiDef, t, API_TYPES }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <MetaBadge tone={t.badgeNeutral}>{API_TYPES[apiDef.type]}</MetaBadge>
      <MetaBadge tone={t.badgeViolet}>{apiDef.environment}</MetaBadge>
      {apiDef.group ? <MetaBadge tone={t.badgeBlue}>{apiDef.group}</MetaBadge> : null}
    </div>
  );
}
