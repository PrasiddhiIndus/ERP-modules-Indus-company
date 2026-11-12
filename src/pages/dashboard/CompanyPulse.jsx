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
import {
  BarCompareChart,
  ComposedTrendChart,
  makeMoneyAxisFormatter,
  RadialScoreChart,
} from "../../components/charts/DashboardCharts";
import { TOKENS } from "../../theme/tokens";
import { inrShort, pct } from "../finance/lib/formatters";
import { buildPulseModules } from "./companyPulseModel";
import { buildPulseDetail } from "./companyPulseDetailModel";
import CompanyPulseDetail from "./CompanyPulseDetail.jsx";
import "./companyPulse.css";

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

const CHART = {
  rev: TOKENS.accent,
  exp: TOKENS.critical,
  net: TOKENS.success,
  bill: TOKENS.accentElectric,
  collect: TOKENS.teal,
  watch: TOKENS.warning,
};

function statusOf(view) {
  if (view.planned) return { label: "Planned", color: TOKENS.textMuted };
  if (view.score == null) {
    return view.attention
      ? { label: "Needs look", color: TOKENS.warning }
      : { label: "Live", color: TOKENS.accent };
  }
  const color = resolveTone(view.score);
  if (view.score < 75) return { label: "At risk", color };
  if (view.attention || view.score < 85) return { label: "Watch", color };
  return { label: "Steady", color };
}

function resolveTone(score) {
  if (score == null) return TOKENS.accent;
  if (score >= 85) return TOKENS.success;
  if (score >= 75) return TOKENS.warning;
  return TOKENS.critical;
}

function primaryMetric(view) {
  const first = view.metrics?.[0];
  if (first) return first;
  if (view.planned) return { label: "Status", value: "Soon" };
  return { label: "Status", value: view.canOpen ? "Open" : "Locked" };
}

function AttDonut({ stats }) {
  const expected = stats?.expected || 0;
  const segments = [
    ["on", TOKENS.success],
    ["late", TOKENS.warning],
    ["leave", TOKENS.info],
    ["absent", TOKENS.critical],
  ];
  const radius = 34;
  const circ = 2 * Math.PI * radius;
  let cursor = 0;
  const rings = segments.map(([key, color]) => {
    const count = stats?.[key] || 0;
    const length = expected ? (count / expected) * circ : 0;
    const ring = { key, color, count, length, offset: cursor };
    cursor += length;
    return ring;
  });
  const idle = !expected;
  return (
    <svg className="cp-att-donut" viewBox="0 0 100 100" role="img" aria-label="Attendance today">
      <circle cx="50" cy="50" r={radius} fill="none" stroke={TOKENS.border} strokeWidth="10" />
      {rings.map((ring) =>
        ring.length > 0 ? (
          <circle
            key={ring.key}
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke={ring.color}
            strokeWidth="10"
            strokeDasharray={`${ring.length} ${circ - ring.length}`}
            strokeDashoffset={-ring.offset}
            transform="rotate(-90 50 50)"
          />
        ) : null
      )}
      <text x="50" y="48" textAnchor="middle" className="cp-att-pct">
        {idle ? "—" : `${(stats.pct || 0).toFixed(0)}%`}
      </text>
      <text x="50" y="62" textAnchor="middle" className="cp-att-sub">
        {idle ? "Off" : `${stats.present}/${expected}`}
      </text>
    </svg>
  );
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
  attendance,
}) {
  const [chartsReady, setChartsReady] = useState(false);
  const [detail, setDetail] = useState(null);
  const [clock, setClock] = useState(() => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));

  useEffect(() => {
    setChartsReady(true);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClock(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    }, 30000);
    return () => window.clearInterval(timer);
  }, []);

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
  const attention = useMemo(() => listed.filter((view) => view.attention), [listed]);

  const ledgerPath = "/app/accounts-finance/reports/site-ledger";
  const ledgerOpen = Boolean(allowPath?.(ledgerPath));
  const billingReports = "/app/billing/reports";
  const billingHome = "/app/billing";
  const receivablesPath = allowPath?.(billingReports) ? billingReports : allowPath?.(billingHome) ? billingHome : "";
  const hrView = pulse.views.find((view) => view.id === "hr");
  const adminView = pulse.views.find((view) => view.id === "admin");
  const peoplePath = hrView?.canOpen ? hrView.openPath : adminView?.canOpen ? adminView.openPath : "";
  const attendancePath = allowPath?.("/app/attendance")
    ? "/app/attendance"
    : allowPath?.("/app/hr")
      ? "/app/hr"
      : "";

  const detailCtx = useMemo(
    () => ({
      modules,
      commercialStats,
      pl,
      billRate,
      collectRate,
      attendance,
      rangeLabel,
      health: pulse.health,
      views: pulse.views,
      paths: {
        people: peoplePath,
        attendance: attendancePath,
        ledger: ledgerOpen ? ledgerPath : "",
        receivables: receivablesPath,
      },
    }),
    [
      attendance,
      attendancePath,
      billRate,
      collectRate,
      commercialStats,
      ledgerOpen,
      modules,
      peoplePath,
      pl,
      pulse.health,
      pulse.views,
      rangeLabel,
      receivablesPath,
    ]
  );

  const openDetail = (kind, extra = {}) => {
    const next = buildPulseDetail(kind, { ...detailCtx, ...extra });
    if (next) setDetail(next);
  };

  const heroes = [
    {
      id: "people",
      kind: "people",
      label: "People",
      value: loading ? "—" : (Number(modules.people) || 0).toLocaleString("en-IN"),
      hint: modules.leavePending ? `${modules.leavePending} leave waiting` : "Active roster",
      color: TOKENS.accent,
      enabled: pulse.management || Boolean(peoplePath) || Boolean(attendancePath),
    },
    {
      id: "revenue",
      kind: "revenue",
      label: "Revenue",
      value: loading ? "—" : inrShort(pl.revenue),
      hint: rangeLabel,
      color: CHART.rev,
      enabled: pulse.management || ledgerOpen,
    },
    {
      id: "profit",
      kind: "profit",
      label: "Net result",
      value: loading ? "—" : inrShort(pl.profit),
      hint: pl.revenue ? `Margin ${pct(pl.margin)}` : "No books yet",
      color: (Number(pl.profit) || 0) < 0 ? CHART.exp : CHART.net,
      enabled: pulse.management || ledgerOpen,
    },
    {
      id: "billed",
      kind: "billed",
      label: "Billed",
      value: loading ? "—" : inrShort(commercialStats.billed),
      hint: `Book cover ${billRate}%`,
      color: CHART.bill,
      enabled: pulse.management || Boolean(receivablesPath),
    },
    {
      id: "outstanding",
      kind: "outstanding",
      label: "Outstanding",
      value: loading ? "—" : inrShort(commercialStats.outstanding),
      hint: `Collected ${collectRate}%`,
      color: CHART.exp,
      enabled: pulse.management || Boolean(receivablesPath),
    },
    {
      id: "sites",
      kind: "sites",
      label: "Sites / loss",
      value: loading ? "—" : `${pl.sitesReporting || 0} / ${pl.lossSites || 0}`,
      hint: pl.thinSites ? `${pl.thinSites} thin margin` : "Reporting sites",
      color: pl.lossSites ? CHART.exp : CHART.net,
      enabled: pulse.management || ledgerOpen,
    },
  ].filter((item) => item.enabled);

  const sites = useMemo(() => {
    const rows = pl?.siteRows || [];
    const profitable = rows.filter((row) => row.profit > 0);
    return (profitable.length ? profitable : rows).slice(0, 6);
  }, [pl?.siteRows]);

  const trendAxis = useMemo(() => {
    const values = [];
    for (const row of pl?.trend || []) values.push(row.revenue, row.expense, row.profit);
    return makeMoneyAxisFormatter(values);
  }, [pl?.trend]);

  const siteAxis = useMemo(() => makeMoneyAxisFormatter(sites.map((row) => row.profit)), [sites]);
  const companyAtt = attendance?.company;
  const healthColor = resolveTone(pulse.health);

  return (
    <div className="cp cp-bird">
      <header className="cp-chrome">
        <div className="cp-chrome-title">
          <div>
            <p className="cp-kicker">Company ops · bird’s-eye</p>
            <h1>Company Pulse</h1>
          </div>
          <button
            type="button"
            className="cp-health-pill"
            style={{ "--c": healthColor }}
            onClick={() => openDetail("health")}
            title="Company health detail"
          >
            <b>{pulse.health == null ? "—" : pulse.health}</b>
            <span>health</span>
          </button>
        </div>

        <div className="cp-chrome-tools">
          <div className="cp-live" style={{ "--dot": financeError ? TOKENS.warning : TOKENS.success }}>
            <i />
            <span>
              {financeError ? "Finance delayed" : "Live"} · {clock}
            </span>
          </div>
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
          <label className="cp-range">
            <select className="cp-select" value={fromKey} onChange={(event) => onFrom?.(event.target.value)} aria-label="From month">
              {monthChoices.map((month) => (
                <option key={`from-${month.key}`} value={month.key}>
                  {month.label}
                </option>
              ))}
            </select>
          </label>
          <label className="cp-range">
            <select className="cp-select" value={toKey} onChange={(event) => onTo?.(event.target.value)} aria-label="To month">
              {monthChoices.map((month) => (
                <option key={`to-${month.key}`} value={month.key}>
                  {month.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="cp-icon-btn" onClick={onRefresh} disabled={loading}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </header>

      {financeError ? <p className="cp-warn">{financeError}</p> : null}

      {heroes.length ? (
        <section className="cp-heroes" aria-label="Company figures">
          {heroes.map((item) => (
            <button
              key={item.id}
              type="button"
              className="cp-hero"
              style={{ "--c": item.color }}
              onClick={() => openDetail(item.kind)}
            >
              <span>{item.label}</span>
              <b>{item.value}</b>
              <em>{item.hint}</em>
            </button>
          ))}
        </section>
      ) : null}

      {listed.length === 0 ? (
        <p className="cp-empty">No modules are assigned to this login.</p>
      ) : (
        <section className="cp-ops" aria-label="Company operations overview">
          <div className="cp-matrix-panel">
            <div className="cp-panel-head">
              <h2>Ops matrix</h2>
              <span>
                {listed.length} modules
                {attention.length ? ` · ${attention.length} need a look` : ""}
              </span>
            </div>
            <div className="cp-matrix" role="list">
              {listed.map((view, index) => {
                const status = statusOf(view);
                const Icon = ICONS[view.id] || FolderKanban;
                const metric = primaryMetric(view);
                const score = view.score;
                return (
                  <button
                    key={view.id}
                    type="button"
                    role="listitem"
                    className={`cp-cell${view.attention ? " is-att" : ""}${view.canOpen ? "" : " is-locked"}${view.planned ? " is-plan" : ""}`}
                    style={{
                      "--c": status.color,
                      "--p": score == null ? 0 : score,
                      animationDelay: `${Math.min(index, 18) * 18}ms`,
                    }}
                    title={`${view.name} detail`}
                    onClick={() => openDetail("module", { view })}
                  >
                    <span className="cp-cell-top">
                      <span className="cp-cell-icon">
                        <Icon size={14} strokeWidth={2.25} />
                      </span>
                      <strong>{view.short}</strong>
                      {!view.canOpen ? <Lock size={11} /> : view.revenue ? <i className="cp-rev">₹</i> : null}
                    </span>
                    <span className="cp-cell-metric">
                      <small>{metric.label}</small>
                      <b>{loading ? "—" : metric.value}</b>
                    </span>
                    <span className="cp-cell-bar" aria-hidden="true">
                      <i style={{ width: `${score == null ? 8 : Math.max(8, score)}%` }} />
                    </span>
                    <span className="cp-cell-foot">
                      <em>{status.label}</em>
                      <span>{score == null ? "—" : score}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="cp-books-panel">
            <div className="cp-panel-head">
              <h2>Books · {rangeLabel}</h2>
              <button type="button" className="cp-text-link" onClick={() => openDetail("books")}>
                Detail <ArrowUpRight size={13} />
              </button>
            </div>
            <div className="cp-books-body">
              <div className="cp-books-legend" aria-hidden="true">
                <span>
                  <i style={{ background: CHART.rev }} />
                  Revenue
                </span>
                <span>
                  <i style={{ background: CHART.exp }} />
                  Expense
                </span>
                <span>
                  <i style={{ background: CHART.net }} />
                  Profit
                </span>
              </div>
              <div className="cp-chart-block">
                {chartsReady && (pl?.trend || []).length ? (
                  <ComposedTrendChart
                    data={pl.trend}
                    areas={[{ key: "revenue", name: "Revenue", color: CHART.rev, fillOpacity: 0.18 }]}
                    bars={[{ key: "expense", name: "Expense", color: CHART.exp }]}
                    lines={[{ key: "profit", name: "Profit", color: CHART.net, width: 2.5 }]}
                    height={168}
                    showLegend={false}
                    compact
                    formatter={(value) => inrShort(value)}
                    yTickFormatter={trendAxis}
                    onPointClick={(row) => openDetail("month", { month: row })}
                  />
                ) : (
                  <p className="cp-note">{chartsReady ? "No ledger movement in this range." : " "}</p>
                )}
              </div>
              <div className="cp-chart-block cp-chart-sites">
                <p className="cp-mini-label">Profit by site</p>
                {chartsReady && sites.length ? (
                  <BarCompareChart
                    data={sites}
                    layout="horizontal"
                    xKey="name"
                    series={[{ key: "profit", name: "Profit", color: CHART.net }]}
                    height={140}
                    categoryWidth={88}
                    formatter={(value) => inrShort(value)}
                    yTickFormatter={siteAxis}
                    onBarClick={(row) => openDetail("site", { site: row })}
                  />
                ) : (
                  <p className="cp-note">{chartsReady ? "No site profit in this range." : " "}</p>
                )}
              </div>
            </div>
          </div>

          <aside className="cp-today-panel">
            <div className="cp-panel-head">
              <h2>Today</h2>
              <button type="button" className="cp-text-link" onClick={() => openDetail("attendance")}>
                Detail <ArrowUpRight size={13} />
              </button>
            </div>

            <div className="cp-today-body">
              <button type="button" className="cp-att-block" onClick={() => openDetail("attendance")}>
                <AttDonut stats={companyAtt} />
                <div className="cp-att-copy">
                  <span>Present today</span>
                  <b>{companyAtt?.expected ? `${companyAtt.present} / ${companyAtt.expected}` : "—"}</b>
                  <small>
                    Late {companyAtt?.late || 0} · Leave {companyAtt?.leave || 0} · Absent {companyAtt?.absent || 0}
                  </small>
                </div>
              </button>

              <div className="cp-gauges">
                {chartsReady ? (
                  <>
                    <div className="cp-gauge">
                      <RadialScoreChart
                        value={billRate}
                        label="Billed vs book"
                        color={CHART.bill}
                        height={118}
                        onClick={() => openDetail("billRate")}
                      />
                    </div>
                    <div className="cp-gauge">
                      <RadialScoreChart
                        value={collectRate}
                        label="Collected"
                        color={collectRate >= 70 ? CHART.collect : CHART.watch}
                        height={118}
                        onClick={() => openDetail("collectRate")}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="cp-gauge cp-gauge-hold" />
                    <div className="cp-gauge cp-gauge-hold" />
                  </>
                )}
              </div>

              <div className="cp-attention">
                <p className="cp-mini-label">Needs a look</p>
                {attention.length === 0 ? (
                  <p className="cp-note">Nothing flagged in modules you can see.</p>
                ) : (
                  <ul>
                    {attention.slice(0, 6).map((view) => {
                      const metric = primaryMetric(view);
                      return (
                        <li key={view.id}>
                          <button type="button" onClick={() => openDetail("module", { view })}>
                            <span>{view.short}</span>
                            <em>
                              {metric.label} {loading ? "—" : metric.value}
                            </em>
                            {view.canOpen ? <ArrowUpRight size={12} /> : <Lock size={11} />}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </aside>
        </section>
      )}

      <CompanyPulseDetail detail={detail} onClose={() => setDetail(null)} onOpen={onOpen} />
    </div>
  );
}
