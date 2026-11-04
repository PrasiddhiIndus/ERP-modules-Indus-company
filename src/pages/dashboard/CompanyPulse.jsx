import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Building2,
  CalendarClock,
  Cog,
  Flame,
  FolderKanban,
  HardHat,
  LineChart,
  Lock,
  Mail,
  Megaphone,
  Monitor,
  Package,
  Receipt,
  RefreshCw,
  ShieldCheck,
  Truck,
  Users,
  Wrench,
} from "lucide-react";
import { inrShort } from "../finance/lib/formatters";
import { buildPulseModules, healthTone } from "./companyPulseModel";
import CompanyAttendance from "./CompanyAttendance.jsx";
import CompanyBooks from "./CompanyBooks.jsx";
import "./companyPulse.css";

const FILTERS = [
  ["all", "All"],
  ["rev", "Revenue"],
  ["att", "Needs attention"],
  ["mine", "My access"],
];

const ICONS = {
  hr: Users,
  compliance: ShieldCheck,
  admin: Building2,
  commercialMt: HardHat,
  commercialRm: Wrench,
  marketing: Megaphone,
  maintenance: Cog,
  billing: Receipt,
  operations: Truck,
  projects: FolderKanban,
  procurement: Package,
  amc: CalendarClock,
  finance: LineChart,
  fireTender: Flame,
  itIs: Monitor,
  crmOutreach: Mail,
};

const ORBIT = 40;

const WHEEL_LABEL = {
  compliance: "Comply",
  operations: "Ops",
  procurement: "Procure",
  marketing: "Market",
};

function matches(view, filter) {
  if (filter === "rev") return view.revenue;
  if (filter === "att") return view.attention;
  if (filter === "mine") return view.canOpen;
  return true;
}

function statusOf(view) {
  if (view.planned) return { label: "Planned", color: "var(--text-muted)" };
  if (view.score == null) {
    return view.attention
      ? { label: "Needs a look", color: "var(--cp-watch)" }
      : { label: "Overview", color: "var(--cp-brand)" };
  }
  if (view.score < 75) return { label: "Needs a look", color: healthTone(view.score) };
  if (view.attention || view.score < 85) return { label: "Watch", color: "var(--cp-watch)" };
  return { label: "Steady", color: healthTone(view.score) };
}

function polar(index, count) {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / Math.max(count, 1);
  return {
    x: 50 + ORBIT * Math.cos(angle),
    y: 50 + ORBIT * Math.sin(angle),
  };
}

export default function CompanyPulse({
  loading,
  financeError,
  rangeLabel,
  fromKey,
  toKey,
  monthChoices,
  presets,
  activePresetId,
  onPreset,
  onFrom,
  onTo,
  onRefresh,
  profile,
  allowPath,
  modules,
  commercialStats,
  pl,
  billRate,
  collectRate,
  onOpen,
  showAttendance,
  attendance,
  attendanceLoading,
  attendanceError,
  onOpenAttendance,
}) {
  const pulse = useMemo(
    () =>
      buildPulseModules({
        profile,
        allowPath,
        modules,
        commercialStats,
        pl,
        billRate,
        collectRate,
      }),
    [allowPath, billRate, collectRate, commercialStats, modules, pl, profile]
  );

  const listed = useMemo(() => pulse.views.filter((view) => view.visible), [pulse.views]);
  const [filter, setFilter] = useState("all");
  const [picked, setPicked] = useState("");
  const [clock, setClock] = useState(() => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClock(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    }, 30000);
    return () => window.clearInterval(timer);
  }, []);

  const focus = listed.filter((view) => matches(view, filter));
  const selected = focus.find((view) => view.id === picked) || focus[0] || null;
  const attentionCount = listed.filter((view) => view.attention).length;
  const seriesFor = (view) => {
    if (!view) return null;
    if (view.id === "hr") {
      const values = (attendance?.trend || []).filter((point) => point.expected > 0).map((point) => point.pct);
      return values.length > 1 ? { label: "Attendance", values } : null;
    }
    if (view.id === "finance" || view.revenue) {
      const values = (pl?.trend || []).map((row) => Number(row.profit) || 0);
      if (values.length < 2 || values.every((value) => value === 0)) return null;
      return { label: "Profit this period", values };
    }
    return null;
  };

  const ledgerPath = "/app/accounts-finance/reports/site-ledger";
  const ledgerOpen = Boolean(allowPath?.(ledgerPath));
  const billingReports = "/app/billing/reports";
  const billingHome = "/app/billing";
  const receivablesPath = allowPath?.(billingReports) ? billingReports : allowPath?.(billingHome) ? billingHome : "";
  const hrView = pulse.views.find((view) => view.id === "hr");
  const adminView = pulse.views.find((view) => view.id === "admin");
  const peoplePath = hrView?.canOpen ? hrView.openPath : adminView?.canOpen ? adminView.openPath : "";

  const kpis = [
    {
      label: "Active people",
      value: loading ? "—" : (Number(modules.people) || 0).toLocaleString("en-IN"),
      color: "var(--cp-brand)",
      path: peoplePath,
      enabled: Boolean(peoplePath),
    },
    {
      label: "Revenue",
      value: loading ? "—" : inrShort(pl.revenue),
      color: "var(--cp-watch)",
      path: ledgerPath,
      enabled: ledgerOpen,
    },
    {
      label: "Net result",
      value: loading ? "—" : inrShort(pl.profit),
      color: (Number(pl.profit) || 0) < 0 ? "var(--cp-risk)" : "var(--cp-good)",
      path: ledgerPath,
      enabled: ledgerOpen,
    },
    {
      label: "Receivables",
      value: loading ? "—" : inrShort(commercialStats.outstanding),
      color: "var(--cp-risk)",
      path: receivablesPath,
      enabled: Boolean(receivablesPath),
    },
  ].filter((kpi) => pulse.management || kpi.enabled);

  const choose = (view) => {
    if (picked === view.id) {
      openView(view);
      return;
    }
    setPicked(view.id);
    if (!matches(view, filter)) setFilter("all");
  };

  const openView = (view) => {
    if (view?.canOpen && view.openPath) onOpen?.(view.openPath);
  };

  const onWheelKey = (event) => {
    if (!listed.length) return;
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const ids = listed.map((view) => view.id);
    const current = ids.indexOf(selected?.id);
    const step = event.key === "ArrowRight" ? 1 : -1;
    const next = ids[(Math.max(0, current) + step + ids.length) % ids.length];
    setPicked(next);
    setFilter("all");
  };

  return (
    <div className="cp">
      <header className="cp-head">
        <div className="cp-title">
          <p className="cp-kicker">Main dashboard</p>
          <h1>Company Pulse</h1>
          <p className="cp-sub">
            {pulse.management
              ? "Each module once. Open its dashboard for the detail."
              : "Your modules only. Open one for its dashboard."}
          </p>
        </div>
        <div className="cp-status-row">
          <div className="cp-live" style={{ "--dot": financeError ? "var(--cp-watch)" : "var(--cp-good)" }}>
            <i />
            <span>{financeError ? "Finance delayed" : "Live"} · {clock}</span>
          </div>
          <button type="button" className="cp-icon-btn" onClick={onRefresh} disabled={loading}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
        <div className="cp-timeline">
          <div className="cp-timeline-main">
            <span className="cp-timeline-label">Timeline</span>
            <div className="cp-presets" role="group" aria-label="Timeline">
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={activePresetId === preset.id ? "is-on" : ""}
                  onClick={() => onPreset?.(preset)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
          <div className="cp-ranges">
            <label className="cp-range">
              From
              <select className="cp-select" value={fromKey} onChange={(event) => onFrom?.(event.target.value)} aria-label="From month">
                {monthChoices.map((month) => (
                  <option key={`from-${month.key}`} value={month.key}>
                    {month.label}
                  </option>
                ))}
              </select>
            </label>
            <span className="cp-range-join" aria-hidden="true" />
            <label className="cp-range">
              To
              <select className="cp-select" value={toKey} onChange={(event) => onTo?.(event.target.value)} aria-label="To month">
                {monthChoices.map((month) => (
                  <option key={`to-${month.key}`} value={month.key}>
                    {month.label}
                  </option>
                ))}
              </select>
            </label>
            <span className="cp-window">{rangeLabel}</span>
          </div>
        </div>
      </header>

      {financeError ? <p className="cp-warn">{financeError}</p> : null}

      {kpis.length ? (
        <section className="cp-kpis" aria-label="Company figures">
          {kpis.map((kpi) => (
            <button
              key={kpi.label}
              type="button"
              className="cp-kpi"
              style={{ "--c": kpi.color }}
              disabled={!kpi.enabled}
              onClick={() => kpi.enabled && kpi.path && onOpen?.(kpi.path)}
            >
              <span>{kpi.label}</span>
              <b>{kpi.value}</b>
            </button>
          ))}
        </section>
      ) : null}

      {listed.length === 0 ? (
        <p className="cp-empty">No modules are assigned to this login.</p>
      ) : (
        <section className="cp-board">
          <div className="cp-flow">
            <div className="cp-panel">
              <div className="cp-panel-head">
                <h2>Modules</h2>
                <div className="cp-tabs" role="tablist" aria-label="Module filter">
                  {FILTERS.map(([id, label]) => (
                    <button key={id} type="button" className={filter === id ? "is-on" : ""} onClick={() => setFilter(id)}>
                      {label}
                      {id === "att" && attentionCount > 0 ? <em>{attentionCount}</em> : null}
                    </button>
                  ))}
                </div>
              </div>

              {focus.length === 0 ? <p className="cp-empty cp-empty-in">Nothing in this filter for this login.</p> : null}

              <div
                className="cp-orbit"
                role="listbox"
                aria-label="Modules"
                tabIndex={0}
                onKeyDown={onWheelKey}
              >
                <svg className="cp-spokes" viewBox="0 0 100 100" aria-hidden="true">
                  <circle className="cp-track" cx="50" cy="50" r={ORBIT} />
                  {listed.map((view, index) => {
                    const point = polar(index, listed.length);
                    const tone = statusOf(view).color;
                    const dim = !matches(view, filter);
                    return (
                      <line
                        key={view.id}
                        x1="50"
                        y1="50"
                        x2={point.x}
                        y2={point.y}
                        className={dim ? "is-dim" : ""}
                        style={{ "--c": tone }}
                      />
                    );
                  })}
                  <circle className="cp-hub" cx="50" cy="50" r="15" />
                </svg>

                <div
                  className="cp-core"
                  style={{
                    "--c": pulse.health == null ? "var(--border-strong)" : healthTone(pulse.health),
                    "--p": pulse.health ?? 100,
                  }}
                >
                  <b>{pulse.health == null ? "—" : pulse.health}</b>
                  <span>health</span>
                </div>

                {listed.map((view, index) => {
                  const point = polar(index, listed.length);
                  const status = statusOf(view);
                  const dim = !matches(view, filter);
                  const hot = !view.planned && view.score != null && view.score < 75;
                  const on = selected?.id === view.id;
                  const Icon = ICONS[view.id] || FolderKanban;
                  const shortName = WHEEL_LABEL[view.id] || view.short;
                  return (
                    <button
                      key={view.id}
                      type="button"
                      role="option"
                      aria-selected={on}
                      aria-label={view.name}
                      title={view.canOpen ? view.name : `${view.name} — no access`}
                      className={`cp-node${on ? " is-on" : ""}${view.canOpen ? "" : " is-locked"}${dim ? " is-dim" : ""}${hot ? " is-hot" : ""}`}
                      style={{
                        left: `${point.x}%`,
                        top: `${point.y}%`,
                        "--c": status.color,
                        "--p": view.score ?? 0,
                        animationDelay: `${Math.min(index, 16) * 32}ms`,
                      }}
                      onClick={() => choose(view)}
                    >
                      <span className={`cp-disc${view.planned ? " is-plan" : view.score == null ? " is-plain" : ""}`}>
                        <Icon size={16} strokeWidth={2.25} />
                        <small>{shortName}</small>
                      </span>
                      {view.revenue ? <i className="cp-rev" aria-hidden="true">₹</i> : null}
                      {!view.canOpen ? (
                        <i className="cp-lockdot" aria-hidden="true">
                          <Lock size={9} />
                        </i>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

          </div>

          <aside className="cp-panel cp-detail">
            {selected ? <Detail view={selected} loading={loading} series={seriesFor(selected)} onOpen={(path) => path && onOpen?.(path)} /> : (
              <p className="cp-empty cp-empty-in">Pick a module, or clear the filter.</p>
            )}
          </aside>
        </section>
      )}

      {showAttendance ? (
        <CompanyAttendance
          loading={attendanceLoading}
          error={attendanceError}
          snapshot={attendance}
          canOpen={Boolean(onOpenAttendance)}
          onOpen={onOpenAttendance}
        />
      ) : null}

      {pulse.management || ledgerOpen ? (
        <CompanyBooks
          pl={pl}
          rangeLabel={rangeLabel}
          canOpen={ledgerOpen}
          onOpen={() => onOpen?.(ledgerPath)}
          onOpenMonth={(row) => {
            const key = row?.key;
            onOpen?.(key ? `${ledgerPath}?slFrom=${key}&slTo=${key}&slMonth=${key}` : ledgerPath);
          }}
          onOpenSite={(row) => {
            const id = row?.id ? encodeURIComponent(row.id) : "";
            onOpen?.(id ? `${ledgerPath}?slSite=${id}` : ledgerPath);
          }}
        />
      ) : null}
    </div>
  );
}

function metricSize(value) {
  const text = String(value ?? "");
  const number = Number(text.replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(number)) return 0;
  const amount = Math.abs(number);
  if (/cr/i.test(text)) return amount * 100;
  if (/\bL\b|₹[\d.]+ L/.test(text)) return amount * 10;
  if (/k$/i.test(text.trim())) return amount;
  return amount;
}

function shortChip(label) {
  return String(label || "")
    .replace(/\s*\([^)]*\)/g, " ")
    .replace(/\s+dashboard$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function Spark({ series }) {
  const values = (series?.values || []).filter((value) => Number.isFinite(value));
  if (values.length < 2) return null;
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high - low || 1;
  const width = 280;
  const height = 52;
  const step = (width - 8) / (values.length - 1);
  const points = values.map((value, index) => {
    const x = 4 + index * step;
    const y = 6 + (1 - (value - low) / span) * (height - 14);
    return `${x},${y}`;
  });
  const line = points.join(" ");
  return (
    <div className="cp-spark">
      <span>{series.label}</span>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={series.label}>
        <polygon points={`4,${height - 2} ${line} ${width - 4},${height - 2}`} />
        <polyline points={line} />
      </svg>
    </div>
  );
}

function ScoreRing({ score, color }) {
  const value = score == null ? 0 : Math.max(0, Math.min(100, Number(score) || 0));
  const radius = 26;
  const circ = 2 * Math.PI * radius;
  return (
    <svg className="cp-score" viewBox="0 0 68 68" role="img" aria-label={score == null ? "No score" : `Score ${score}`}>
      <circle cx="34" cy="34" r={radius} fill="none" stroke="var(--border)" strokeWidth="5" />
      {value > 0 ? (
        <circle
          className="cp-score-arc"
          cx="34"
          cy="34"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${(value / 100) * circ} ${circ}`}
          transform="rotate(-90 34 34)"
        />
      ) : null}
      <text x="34" y="38" textAnchor="middle">
        {score == null ? "—" : score}
      </text>
    </svg>
  );
}

function Detail({ view, loading, series, onOpen }) {
  const status = statusOf(view);
  const Icon = ICONS[view.id] || FolderKanban;
  const metrics = (view.metrics || []).slice(0, 4);
  const links = (view.links || []).slice(0, 4);
  const covers = links.length
    ? links.map((link) => ({ ...link, locked: false }))
    : (view.subs || []).slice(0, 4).map((sub) => ({
        key: sub.key,
        label: shortChip(sub.label),
        path: sub.path,
        locked: true,
      }));
  const sizes = metrics.map((metric) => metricSize(metric.value));
  const peak = Math.max(0, ...sizes);

  return (
    <div className="cp-detail-body" key={view.id} style={{ "--c": status.color }}>
      <div className="cp-dh">
        <span className="cp-mark">
          <Icon size={22} />
        </span>
        <div className="cp-dh-copy">
          <p>{status.label}{view.revenue ? " · Revenue" : ""}</p>
          <h3>{view.name}</h3>
        </div>
        <ScoreRing score={view.score} color={status.color} />
      </div>

      {metrics.length ? (
        <div className={`cp-mets${metrics.length === 1 ? " is-one" : ""}`}>
          {metrics.map((metric) => (
            <div key={metric.label} className="cp-met">
              <span>{metric.label}</span>
              <b>{loading ? "—" : metric.value}</b>
            </div>
          ))}
        </div>
      ) : (
        <p className="cp-callout">{view.note || "Open the module dashboard for the live figures."}</p>
      )}

      {view.note && metrics.length ? <p className="cp-note">{view.note}</p> : null}

      <Spark series={series} />

      {peak > 0 ? (
        <div className="cp-bars" aria-label="What stands out">
          {metrics.map((metric, index) => (
            <div key={metric.label} className="cp-bar">
              <span>{metric.label}</span>
              <i>
                <b style={{ width: `${Math.max(8, (sizes[index] / peak) * 100)}%` }} />
              </i>
              <em>{loading ? "—" : metric.value}</em>
            </div>
          ))}
        </div>
      ) : null}

      {covers.length ? (
        <div className="cp-inside">
          <span>Inside this module</span>
          <div className="cp-subs">
            {covers.map((link) => (
              <button
                key={link.key}
                type="button"
                className={link.locked ? "is-lock" : ""}
                disabled={link.locked}
                onClick={() => !link.locked && onOpen?.(link.path)}
              >
                {link.locked ? <Lock size={11} /> : null}
                {link.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <button type="button" className="cp-go" disabled={!view.canOpen} onClick={() => view.canOpen && onOpen?.(view.openPath)}>
        {view.canOpen ? (
          <>
            Open {view.short} dashboard
            <ArrowUpRight size={15} />
          </>
        ) : (
          <span className="cp-lock">
            <Lock size={14} />
            No access
          </span>
        )}
      </button>
    </div>
  );
}

