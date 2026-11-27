/**
 * Site workspace — one task: understand a single site's performance for a period.
 *
 * Extracted from SiteLedgerApp.jsx (SiteDetail). Tabs separate *viewing* (Dashboard, Budget,
 * History) from *editing* (Setup and Figures open the existing edit screens). Calculations and the
 * month-wise income–expenditure statement are unchanged.
 */
import React, { useState, useEffect, useMemo } from "react";
import {
  LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  ChevronLeft, ChevronRight, ChevronDown, History, Pencil, Sliders, CheckCircle, Trash2,
  Receipt, FileClock, CalendarClock, LayoutDashboard, Wallet, Eye,
} from "lucide-react";
import {
  SectionCard,
  KpiTile,
  FilterBar,
  DenseTable,
  StatusChip,
  EmptyState,
  InlineAlert,
  PrimaryButton,
  SecondaryButton,
} from "../../../../components/erpUi";
import { confirmDialog } from "../../../../lib/dialog";
import { PeriodMonthSelect } from "../../components/PeriodMonthSelect";
import { reimbursementTotal, reimbursementRowLabel, reimbursementDisplayLines } from "../../api/siteLedgerStore";
import {
  monthLabelOf as periodMonthLabelOf,
  periodAbsoluteIndex as monthIdx,
} from "../../lib/periods";
import {
  REVENUE_ITEMS, PARENTS, TARGET_MARGIN, WARN_MARGIN, MONTHS, parentLabel,
} from "../domain/constants.js";
import { childLabel } from "../domain/siteStructure.js";
import { isSiteActive, versionLabel, estimateFor, sitesInGroup } from "../domain/siteLifecycle.js";
import { inr, inrShort, pct } from "../domain/formatMoney.js";
import {
  calcSite,
  calcSiteOverPeriodKeys,
  estTotals,
  estTotalsForPeriodKeys,
  expenseTree,
  expenseTreeForPeriod,
  parentTotalsSite,
  parseEntryAmount,
  revBreakForPeriod,
} from "../calculations/siteLedgerCalcs.js";
import {
  StatusPill,
  TipBox,
  VarCells,
  SiteLedgerPageStyles,
  monthLabelOf,
} from "../components/SiteLedgerShared.jsx";

const TABS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "config", label: "Setup", icon: Sliders, shortcut: "config" },
  { id: "figures", label: "Figures", icon: Pencil, shortcut: "figures" },
  { id: "budget", label: "Budget", icon: Wallet },
  { id: "history", label: "History", icon: History },
];

/* ───────────────────────── MONTH-WISE INCOME–EXPENDITURE ─────────────────────────
   One fixed "Estimate / month" column (contract budget), then one actual column per
   month in the selected period. Months with no data entered show "—".            */
export function MonthlyIeTable({ site, records, keys, estVer, revBreak, tree, expanded, toggle }) {
  const monthly = keys.map((mk) => {
    const hasRec = !!records[`${site.id}__${mk}`];
    const rec = records[`${site.id}__${mk}`] || {};
    const calc = calcSite(site, mk, records);
    return { mk, label: periodMonthLabelOf(mk, MONTHS), rec, hasRec, calc };
  });
  const showTotal = monthly.length > 1;
  const colSpanAll = 2 + monthly.length + (showTotal ? 1 : 0);
  const estM = estTotals(estVer);
  const hasEst = !!estM;
  const childEstM = (ck) => Number(estVer?.expenses?.[ck]) || 0;
  const revVal = (it, m) => (it.key === "esicBill" ? reimbursementTotal(m.rec) : parseEntryAmount(m.rec[it.key]));
  const overStyle = (actual, estVal) => (hasEst && estVal > 0 && actual > estVal ? { color: "var(--loss)" } : undefined);
  const totRevenue = monthly.reduce((a, m) => a + m.calc.revenue, 0);
  const totExpense = monthly.reduce((a, m) => a + m.calc.expense, 0);
  const totProfit = totRevenue - totExpense;
  const totMargin = totRevenue > 0 ? (totProfit / totRevenue) * 100 : 0;
  const gap = <span className="mie-dim">—</span>;
  return (
    <div className="vtbl-wrap">
      <table className="tbl vtbl vtbl-monthly">
        <thead>
          <tr>
            <th className="vtbl-part">Particulars</th>
            <th className="r">Estimate / mo</th>
            {monthly.map((m) => <th key={m.mk} className="r">{m.label}</th>)}
            {showTotal && <th className="r">Total · {monthly.length} mo</th>}
          </tr>
        </thead>
        <tbody>
          <tr className="vsec"><td colSpan={colSpanAll}><span className="vsec-label">Revenue</span></td></tr>
          {revBreak.filter((it) => it.raw !== 0 || it.est !== 0).map((it) => (
            <tr key={it.key}>
              <td className="vtbl-part">{it.label}</td>
              <td className="r mono dim vtbl-num">{hasEst ? inr(it.sign * (Number(estVer?.revenue?.[it.key]) || 0)) : "—"}</td>
              {monthly.map((m) => (
                <td key={m.mk} className="r mono vtbl-num">{m.hasRec ? inr(it.sign * revVal(it, m)) : gap}</td>
              ))}
              {showTotal && <td className="r mono vtbl-num">{inr(it.sign * monthly.reduce((a, m) => a + revVal(it, m), 0))}</td>}
            </tr>
          ))}
          <tr className="vtot green">
            <td className="vtbl-part">Total Revenue (a)</td>
            <td className="r mono dim vtbl-num">{hasEst ? inr(estM.revenue) : "—"}</td>
            {monthly.map((m) => <td key={m.mk} className="r mono vtbl-num">{m.hasRec ? inr(m.calc.revenue) : gap}</td>)}
            {showTotal && <td className="r mono vtbl-num">{inr(totRevenue)}</td>}
          </tr>
          <tr className="vsec"><td colSpan={colSpanAll}><span className="vsec-label">Expenses <span className="vhint">— click a head to expand its components</span></span></td></tr>
          {tree.map((g) => {
            const pEst = g.children.reduce((a, ch) => a + childEstM(ch.key), 0);
            return (
              <React.Fragment key={g.parent}>
                <tr className="vparent" onClick={() => toggle(g.parent)}>
                  <td className="vtbl-part">
                    <div className="vparent-label">
                      <span className="pchev">{expanded.has(g.parent) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
                      <span className="pdot" style={{ background: g.color }} />
                      <b className="vparent-name">{g.label}</b>
                      <span className="pcount">{g.children.length}</span>
                      {g.amort > 0 && <em className="amort-tag">⏳ {inr(g.amort)} spread</em>}
                    </div>
                  </td>
                  <td className="r mono dim vtbl-num">{hasEst ? inr(pEst) : "—"}</td>
                  {monthly.map((m) => {
                    const val = g.children.reduce((a, ch) => a + (m.calc.ex.total[ch.key] || 0), 0);
                    return <td key={m.mk} className="r mono vtbl-num" style={overStyle(val, pEst)}>{m.hasRec ? inr(val) : gap}</td>;
                  })}
                  {showTotal && <td className="r mono vtbl-num">{inr(g.actual)}</td>}
                </tr>
                {expanded.has(g.parent) && g.children.filter((ch) => ch.actual !== 0 || ch.est !== 0).map((ch) => (
                  <tr className="vchild" key={ch.key}>
                    <td className="vtbl-part vtbl-part-child">
                      <span className="cbranch" />
                      <span className="vchild-name">{ch.label}</span>
                      {ch.amort > 0 && <em className="amort-tag">⏳ {inr(ch.amort)}</em>}
                    </td>
                    <td className="r mono dim vtbl-num">{hasEst ? inr(childEstM(ch.key)) : "—"}</td>
                    {monthly.map((m) => {
                      const val = m.calc.ex.total[ch.key] || 0;
                      return <td key={m.mk} className="r mono vtbl-num" style={overStyle(val, childEstM(ch.key))}>{m.hasRec ? inr(val) : gap}</td>;
                    })}
                    {showTotal && <td className="r mono vtbl-num">{inr(ch.actual)}</td>}
                  </tr>
                ))}
              </React.Fragment>
            );
          })}
          <tr className="vtot green">
            <td className="vtbl-part">Sub-total (b)</td>
            <td className="r mono dim vtbl-num">{hasEst ? inr(estM.expense) : "—"}</td>
            {monthly.map((m) => <td key={m.mk} className="r mono vtbl-num">{m.hasRec ? inr(m.calc.expense) : gap}</td>)}
            {showTotal && <td className="r mono vtbl-num">{inr(totExpense)}</td>}
          </tr>
          <tr className={"vtot " + (totProfit >= 0 ? "profit" : "loss")}>
            <td className="vtbl-part">Profit (a − b)</td>
            <td className="r mono dim vtbl-num">{hasEst ? inr(estM.profit) : "—"}</td>
            {monthly.map((m) => (
              <td key={m.mk} className="r mono vtbl-num" style={m.hasRec ? { color: m.calc.profit >= 0 ? "var(--profit)" : "var(--loss)" } : undefined}>
                {m.hasRec ? inr(m.calc.profit) : gap}
              </td>
            ))}
            {showTotal && <td className="r mono vtbl-num">{inr(totProfit)}</td>}
          </tr>
          <tr className="vmargin">
            <td className="vtbl-part">Margin %</td>
            <td className="r mono dim vtbl-num">{hasEst ? pct(estM.margin) : "—"}</td>
            {monthly.map((m) => (
              <td
                key={m.mk}
                className="r mono vtbl-num"
                style={hasEst && m.hasRec ? { color: m.calc.margin >= estM.margin ? "var(--profit)" : "var(--loss)" } : undefined}
              >
                {m.hasRec ? pct(m.calc.margin) : gap}
              </td>
            ))}
            {showTotal && <td className="r mono vtbl-num">{pct(totMargin)}</td>}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* ───────────────────────── BUDGET (view only) ───────────────────────── */
function BudgetTab({ site, estVer, historical, onConfig, onViewBudget }) {
  const estimates = useMemo(
    () => [...(site.estimates || [])].sort((a, b) => monthIdx(b.effectiveFrom) - monthIdx(a.effectiveFrom)),
    [site.estimates],
  );
  const columns = [
    { key: "note", label: "Budget", render: (e) => <span className="strong">{e.note || "Estimate"}</span> },
    { key: "from", label: "Effective from", cellClassName: "mono", render: (e) => monthLabelOf(e.effectiveFrom) },
    {
      key: "contract",
      label: "Contract",
      cellClassName: "mono text-ink-secondary",
      render: () => (site.contractStart && site.contractEnd ? `${monthLabelOf(site.contractStart)} – ${monthLabelOf(site.contractEnd)}` : "—"),
    },
    { key: "revenue", label: "Revenue / mo", headerClassName: "text-right", cellClassName: "text-right mono", render: (e) => inr(estTotals(e).revenue) },
    { key: "expense", label: "Expenses / mo", headerClassName: "text-right", cellClassName: "text-right mono", render: (e) => inr(estTotals(e).expense) },
    {
      key: "profit",
      label: "Profit / mo",
      headerClassName: "text-right",
      cellClassName: "text-right mono",
      render: (e) => { const t = estTotals(e); return <span style={{ color: t.profit >= 0 ? "var(--profit)" : "var(--loss)" }}>{inr(t.profit)}</span>; },
    },
    { key: "margin", label: "Margin", headerClassName: "text-right", cellClassName: "text-right mono", render: (e) => pct(estTotals(e).margin) },
    {
      key: "current",
      label: "",
      render: (e) => (estVer && estVer.id === e.id ? <StatusChip label="In use for period" severity="info" /> : null),
    },
  ];
  return (
    <SectionCard
      title="Contract budget"
      right={(
        <div className="flex items-center gap-2">
          {onViewBudget && (
            <SecondaryButton onClick={() => onViewBudget(site.id)}><Eye size={13} /> View full budget</SecondaryButton>
          )}
          {!historical && onConfig && <SecondaryButton onClick={onConfig}><Pencil size={13} /> Edit in setup</SecondaryButton>}
        </div>
      )}
    >
      {estimates.length ? (
        <DenseTable
          columns={columns}
          rows={estimates.map((e, i) => ({ ...e, id: e.id || `est-${i}` }))}
          rowKey="id"
          showSerialNumber={false}
          density="comfortable"
        />
      ) : (
        <EmptyState
          icon={FileClock}
          title="No budget set"
          message={historical ? "This archived version has no budget." : "Add a contract budget in Setup to compare actuals against it."}
        />
      )}
    </SectionCard>
  );
}

/* ───────────────────────── HISTORY (versions, monthly results, status) ───────────────────────── */
function HistoryTab({
  site, sitesAll, records, historical, onViewHistory, onOpenVersion, onDeactivate, onActivate, onDelete,
}) {
  const versions = useMemo(() => (sitesAll ? sitesInGroup(sitesAll, site.siteGroup || site.id) : []), [sitesAll, site]);
  const monthlyRows = useMemo(
    () => MONTHS
      .filter((m) => records[`${site.id}__${m.key}`])
      .map((m) => ({ id: m.key, label: monthLabelOf(m.key), calc: calcSite(site, m.key, records) }))
      .reverse(),
    [site, records],
  );
  const monthlyColumns = [
    { key: "label", label: "Period", cellClassName: "mono", render: (r) => r.label },
    { key: "revenue", label: "Revenue", headerClassName: "text-right", cellClassName: "text-right mono", render: (r) => inr(r.calc.revenue) },
    { key: "expense", label: "Expenses", headerClassName: "text-right", cellClassName: "text-right mono", render: (r) => inr(r.calc.expense) },
    {
      key: "profit",
      label: "Profit",
      headerClassName: "text-right",
      cellClassName: "text-right mono",
      render: (r) => <span style={{ color: r.calc.profit < 0 ? "var(--loss)" : "var(--ink)" }}>{inr(r.calc.profit)}</span>,
    },
    { key: "margin", label: "Margin", headerClassName: "text-right", cellClassName: "text-right mono", render: (r) => pct(r.calc.margin) },
  ];
  const versionColumns = [
    { key: "version", label: "Version", render: (v) => <span className="strong">{versionLabel(v)}{v.id === site.id ? " (this)" : ""}</span> },
    { key: "status", label: "Status", render: (v) => <StatusChip label={isSiteActive(v) ? "Active" : "Inactive"} severity={isSiteActive(v) ? "info" : "neutral"} /> },
    { key: "wo", label: "PO / W.O.", cellClassName: "mono text-ink-secondary", render: (v) => v.wo || "—" },
    {
      key: "contract",
      label: "Contract",
      cellClassName: "mono text-ink-secondary",
      render: (v) => (v.contractStart ? `${monthLabelOf(v.contractStart)} – ${monthLabelOf(v.contractEnd)}` : "—"),
    },
    {
      key: "open",
      label: "",
      cellClassName: "text-right",
      render: (v) => (v.id === site.id || !onOpenVersion ? null : <button type="button" className="link" onClick={() => onOpenVersion(v.id)}>Open →</button>),
    },
  ];
  const confirmDelete = async () => {
    if (!(await confirmDialog({ title: "Delete site", message: `Delete "${site.name}" (${versionLabel(site)}) and all its data?`, confirmLabel: "Delete", tone: "danger" }))) return;
    await onDelete(site.id);
  };
  return (
    <div className="slp-stack">
      <SectionCard
        title="Versions of this site"
        right={<SecondaryButton onClick={() => onViewHistory(site.siteGroup)}><History size={13} /> Full version history</SecondaryButton>}
      >
        {versions.length > 0 ? (
          <DenseTable columns={versionColumns} rows={versions} rowKey="id" showSerialNumber={false} density="comfortable" />
        ) : (
          <p className="type-meta text-ink-muted">Only {versionLabel(site)} exists for this site.</p>
        )}
      </SectionCard>

      <SectionCard title="Monthly results" right={<span className="type-meta text-ink-muted">{monthlyRows.length} period{monthlyRows.length === 1 ? "" : "s"} with figures</span>}>
        {monthlyRows.length ? (
          <DenseTable
            columns={monthlyColumns}
            rows={monthlyRows}
            rowKey="id"
            showSerialNumber={false}
            stickyHeader
            scrollMaxHeight="22rem"
          />
        ) : (
          <EmptyState icon={Receipt} title="No figures yet" message="Monthly results appear once figures are entered." />
        )}
      </SectionCard>

      {(onActivate || onDeactivate || onDelete) && (
        <SectionCard title="Site status">
          <p className="type-meta text-ink-secondary mb-3">
            {historical
              ? "This version is archived and read-only. Make it active to edit figures again, or delete it with all its data."
              : "This version is active. Making it inactive archives it and makes it read-only."}
          </p>
          <div className="flex flex-wrap gap-2">
            {historical && onActivate && (
              <button type="button" className="ghost-d sm-act-activate-text" onClick={() => onActivate(site.id)}><CheckCircle size={14} /> Make active</button>
            )}
            {!historical && onDeactivate && (
              <button type="button" className="ghost-d danger-text" onClick={() => onDeactivate(site.id)}>Make inactive</button>
            )}
            {historical && onDelete && (
              <button type="button" className="ghost-d danger-text" onClick={confirmDelete}><Trash2 size={14} /> Delete site</button>
            )}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

/* ───────────────────────── WORKSPACE ───────────────────────── */
export default function SiteWorkspace({
  site,
  sitesAll,
  records,
  periodKeys,
  periodFrom,
  periodTo,
  setPeriodFrom,
  setPeriodTo,
  mLabel,
  back,
  onEdit,
  onConfig,
  onViewHistory,
  onViewBudget,
  onOpenVersion,
  onDeactivate,
  onActivate,
  onDelete,
}) {
  const [expanded, setExpanded] = useState(() => new Set());
  const [ieMode, setIeMode] = useState("monthly");
  const [tab, setTab] = useState("dashboard");
  const siteId = site?.id;
  useEffect(() => { setTab("dashboard"); }, [siteId]);
  if (!site) return null;

  const keys = periodKeys?.length ? periodKeys : [];
  const refMonth = keys[keys.length - 1] || periodTo || periodFrom;
  const historical = !isSiteActive(site);
  const hasPeriodData = keys.some((mk) => !!records[`${site.id}__${mk}`]);
  const c = keys.length > 1
    ? calcSiteOverPeriodKeys(site, keys, records)
    : calcSite(site, refMonth, records);
  const est = keys.length > 1
    ? estTotalsForPeriodKeys(site, keys)
    : estTotals(estimateFor(site, refMonth));
  const estVer = estimateFor(site, refMonth);
  const revBreak = keys.length > 1
    ? revBreakForPeriod(site, keys, records)
    : REVENUE_ITEMS.map((it) => {
      const rec = records[`${site.id}__${refMonth}`] || {};
      if (it.key === "esicBill") {
        const lines = reimbursementDisplayLines(rec);
        return {
          ...it,
          label: lines.length === 1 ? `Reimbursement · ${lines[0].label}` : reimbursementRowLabel(rec),
          raw: reimbursementTotal(rec),
          est: Number(estVer?.revenue?.[it.key]) || 0,
        };
      }
      return {
        ...it,
        label: it.label,
        raw: Number(rec[it.key]) || 0,
        est: Number(estVer?.revenue?.[it.key]) || 0,
      };
    });
  const tree = (keys.length > 1
    ? expenseTreeForPeriod(site, keys, records)
    : expenseTree(site, refMonth, records, estVer)
  ).filter((g) => g.actual !== 0 || g.est !== 0);
  const cats = PARENTS.reduce((acc, p) => ({ ...acc, [p.key]: 0 }), {});
  keys.forEach((mk) => {
    const pt = parentTotalsSite(site, mk, records);
    PARENTS.forEach((p) => { cats[p.key] += pt[p.key] || 0; });
  });
  const catData = PARENTS.map((p) => ({ name: parentLabel(p.key), value: cats[p.key] || 0, color: p.color })).filter((d) => d.value > 0);
  const siteTrend = MONTHS
    .filter((m) => { const cc = calcSite(site, m.key, records); return cc.revenue || cc.expense; })
    .map((m) => {
      const cc = calcSite(site, m.key, records);
      const e = estTotals(estimateFor(site, m.key));
      return { name: m.label, profit: cc.profit, estProfit: e ? e.profit : null };
    });
  const profitVar = est ? c.profit - est.profit : null;
  const hasFigureContent = hasPeriodData
    || tree.length > 0
    || revBreak.some((it) => it.raw || it.est)
    || !!(est && (est.revenue || est.expense));
  const rangeMonthCount = keys.length;
  const toggle = (k) => setExpanded((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const allExpanded = tree.length > 0 && tree.every((g) => expanded.has(g.parent));
  const toggleAll = () => setExpanded(allExpanded ? new Set() : new Set(tree.map((g) => g.parent)));

  const onTab = (t) => {
    if (t.shortcut === "config") { if (!historical && onConfig) onConfig(); return; }
    if (t.shortcut === "figures") { if (!historical && onEdit) onEdit(); return; }
    setTab(t.id);
  };

  const tone = (v, cls) => <span className={cls}>{v}</span>;
  const marginCls = c.margin >= TARGET_MARGIN ? "slp-tone-profit" : c.margin >= WARN_MARGIN ? "slp-tone-warn" : "slp-tone-loss";

  return (
    <div className="site-detail slp-stack">
      <SiteLedgerPageStyles />

      <div>
        <button type="button" className="back" onClick={back}><ChevronLeft size={16} /> Back</button>
      </div>

      {historical && (
        <InlineAlert tone="warning">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              <b>Historical version · {versionLabel(site)}</b> — read-only archive. PO {site.wo || "—"} · contract {site.contractStart ? `${monthLabelOf(site.contractStart)}–${monthLabelOf(site.contractEnd)}` : "—"}
            </span>
            <button type="button" className="ghost-d sm" onClick={() => onViewHistory(site.siteGroup)}>All versions</button>
          </div>
        </InlineAlert>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-x-3 gap-y-1" style={{ fontFamily: "var(--display)", fontSize: 24, fontWeight: 700, margin: 0 }}>
            <span className="site-head-name">{site.name}</span>
            <span className="ver-pill inline">{versionLabel(site)}{historical ? " · Inactive" : " · Active"}</span>
            <StatusPill margin={c.margin} profit={c.profit} />
          </h2>
          <div className="site-head-meta">
            {site.ocNumber && <span>Client: <b>{site.ocNumber}</b></span>}
            {site.wo && <span>W.O.: <b>{site.wo}</b></span>}
            {site.contractStart && (
              <span>Contract: <b>{monthLabelOf(site.contractStart)} – {monthLabelOf(site.contractEnd)}</b></span>
            )}
            <span>
              Period: <b>{mLabel}</b>
              {rangeMonthCount > 1 ? ` · ${rangeMonthCount} months aggregated` : ""}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="slp-mode">
            {historical ? <><Eye size={13} /> Viewing archive</> : <><Eye size={13} /> Viewing</>}
          </span>
          {!historical && onEdit && <PrimaryButton icon={Pencil} onClick={onEdit}>Edit figures</PrimaryButton>}
        </div>
      </div>

      <div className="slp-tabs" role="tablist" aria-label="Site workspace">
        {TABS.map((t) => {
          const Icon = t.icon;
          const disabled = !!t.shortcut && historical;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={"slp-tab" + (tab === t.id ? " on" : "")}
              disabled={disabled}
              title={disabled ? "Archived versions are read-only" : t.shortcut ? `Opens ${t.label.toLowerCase()} editor` : undefined}
              onClick={() => onTab(t)}
            >
              <Icon size={14} /> {t.label}
              {t.shortcut && !disabled ? <span className="slp-tab-hint">edit</span> : null}
            </button>
          );
        })}
      </div>

      {tab === "dashboard" && (
        <>
          {setPeriodFrom && setPeriodTo && (
            <FilterBar>
              <div className="slp-filters">
                <label className="ov-filter range">
                  <span>From month / year</span>
                  <PeriodMonthSelect
                    className="ov-period-pick"
                    selectClassName="ov-period-sel"
                    value={periodFrom}
                    onChange={setPeriodFrom}
                  />
                </label>
                <label className="ov-filter range">
                  <span>To month / year</span>
                  <PeriodMonthSelect
                    className="ov-period-pick"
                    selectClassName="ov-period-sel"
                    value={periodTo}
                    onChange={setPeriodTo}
                  />
                </label>
              </div>
            </FilterBar>
          )}

          <div className="slp-kpis">
            <KpiTile label="Total revenue (a)" value={inrShort(c.revenue)} sub={est ? `est ${inrShort(est.revenue)}` : null} />
            <KpiTile
              label="Expenses (b)"
              value={inrShort(c.expense)}
              sub={est ? `est ${inrShort(est.expense)}` : (c.revenue ? `${pct((c.expense / c.revenue) * 100)} of revenue` : null)}
            />
            <KpiTile
              label="Profit (a − b)"
              value={tone(inrShort(c.profit), c.profit >= 0 ? "slp-tone-profit" : "slp-tone-loss")}
              sub={est ? `est ${inrShort(est.profit)}` : null}
            />
            <KpiTile
              label="Profit vs estimate"
              value={profitVar == null ? "—" : tone(`${profitVar >= 0 ? "+" : ""}${inrShort(profitVar)}`, profitVar >= 0 ? "slp-tone-profit" : "slp-tone-loss")}
              sub={profitVar == null ? "no estimate" : profitVar >= 0 ? "favourable" : "adverse"}
            />
            <KpiTile
              label="Margin"
              value={tone(pct(c.margin), marginCls)}
              sub={est ? `est ${pct(est.margin)}` : `target ${TARGET_MARGIN}%`}
            />
          </div>

          {!hasFigureContent ? (
            <SectionCard title="Income – expenditure">
              <EmptyState
                icon={Receipt}
                title={`No figures for ${mLabel}`}
                message={historical
                  ? "Adjust the period range above."
                  : "Use Edit figures to add this period, or adjust the period range above."}
              />
            </SectionCard>
          ) : (
            <>
              <SectionCard
                title="Income – expenditure · actual vs estimate"
                right={(
                  <div className="site-ie-card-tools">
                    <div className="ie-mode">
                      <button type="button" className={ieMode === "monthly" ? "on" : ""} onClick={() => setIeMode("monthly")}>Month-wise</button>
                      <button type="button" className={ieMode === "summary" ? "on" : ""} onClick={() => setIeMode("summary")}>Summary</button>
                    </div>
                    <button type="button" className="link" onClick={toggleAll}>{allExpanded ? "Collapse all" : "Expand all"}</button>
                    {estVer ? (
                      <span className="site-ie-budget">
                        <FileClock size={12} />
                        budget {monthLabelOf(estVer.effectiveFrom)}
                        {estVer.note ? ` · ${estVer.note}` : ""}
                      </span>
                    ) : (
                      <span className="muted-s">no estimate</span>
                    )}
                  </div>
                )}
              >
                {ieMode === "monthly" ? (
                  <MonthlyIeTable
                    site={site}
                    records={records}
                    keys={keys}
                    estVer={estVer}
                    revBreak={revBreak}
                    tree={tree}
                    expanded={expanded}
                    toggle={toggle}
                  />
                ) : (
                  <div className="vtbl-wrap">
                    <table className="tbl vtbl">
                      <colgroup>
                        <col className="vtbl-col-part" />
                        <col className="vtbl-col-num" />
                        <col className="vtbl-col-num" />
                        <col className="vtbl-col-num" />
                        <col className="vtbl-col-num" />
                      </colgroup>
                      <thead>
                        <tr>
                          <th>Particulars</th>
                          <th className="r">Estimate</th>
                          <th className="r">Actual</th>
                          <th className="r">Variance</th>
                          <th className="r">Var %</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="vsec"><td colSpan={5}>Revenue</td></tr>
                        {revBreak.filter((it) => it.raw !== 0 || it.est !== 0).map((it) => (
                          <tr key={it.key}>
                            <td className="vtbl-part">{it.label}</td>
                            <VarCells est={it.sign * it.est} actual={it.sign * it.raw} lowerIsBetter={false} hasEst={!!it.est} />
                          </tr>
                        ))}
                        <tr className="vtot green"><td className="vtbl-part">Total Revenue (a)</td><VarCells est={est?.revenue || 0} actual={c.revenue} lowerIsBetter={false} hasEst={!!est} /></tr>
                        <tr className="vsec"><td colSpan={5}>Expenses <span className="vhint">— click a head to expand its components</span></td></tr>
                        {tree.map((g) => (
                          <React.Fragment key={g.parent}>
                            <tr className="vparent" onClick={() => toggle(g.parent)} onDoubleClick={() => toggle(g.parent)}>
                              <td className="vtbl-part">
                                <div className="vparent-label">
                                  <span className="pchev">{expanded.has(g.parent) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
                                  <span className="pdot" style={{ background: g.color }} />
                                  <b className="vparent-name">{g.label}</b>
                                  <span className="pcount">{g.children.length}</span>
                                  {g.amort > 0 && <em className="amort-tag">⏳ {inr(g.amort)} spread</em>}
                                </div>
                              </td>
                              <VarCells est={g.est} actual={g.actual} lowerIsBetter={true} hasEst={g.est > 0} />
                            </tr>
                            {expanded.has(g.parent) && g.children.filter((ch) => ch.actual !== 0 || ch.est !== 0).map((ch) => (
                              <tr className="vchild" key={ch.key}>
                                <td className="vtbl-part vtbl-part-child">
                                  <span className="cbranch" />
                                  <span className="vchild-name">{ch.label}</span>
                                  {ch.amort > 0 && <em className="amort-tag">⏳ {inr(ch.amort)}</em>}
                                </td>
                                <VarCells est={ch.est} actual={ch.actual} lowerIsBetter={true} hasEst={ch.est > 0} />
                              </tr>
                            ))}
                          </React.Fragment>
                        ))}
                        <tr className="vtot green"><td className="vtbl-part">Sub-total (b)</td><VarCells est={est?.expense || 0} actual={c.expense} lowerIsBetter={true} hasEst={!!est} /></tr>
                        <tr className={"vtot " + (c.profit >= 0 ? "profit" : "loss")}><td className="vtbl-part">Profit (a − b)</td><VarCells est={est?.profit || 0} actual={c.profit} lowerIsBetter={false} hasEst={!!est} /></tr>
                        <tr className="vmargin">
                          <td className="vtbl-part">Margin %</td>
                          <td className="r mono dim vtbl-num">{est ? pct(est.margin) : "—"}</td>
                          <td className="r mono vtbl-num">{pct(c.margin)}</td>
                          <td className="r mono vtbl-num" style={{ color: est ? (c.margin >= est.margin ? "var(--profit)" : "var(--loss)") : "var(--muted)" }}>{est ? `${c.margin - est.margin >= 0 ? "+" : ""}${(c.margin - est.margin).toFixed(1)} pp` : "—"}</td>
                          <td className="r mono dim vtbl-num">—</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>

              <div className="grid-2 site-detail-charts">
                <SectionCard title="Expense mix · by parent">
                  {catData.length ? (
                    <div className="donut-wrap">
                      <ResponsiveContainer width="100%" height={200}>
                        <PieChart>
                          <Pie data={catData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={78} paddingAngle={2} stroke="none">
                            {catData.map((d, i) => <Cell key={i} fill={d.color} />)}
                          </Pie>
                          <Tooltip content={<TipBox fmt={inr} />} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="legend">
                        {[...catData].sort((a, b) => b.value - a.value).map((d) => (
                          <div key={d.name} className="legend-row">
                            <span className="legend-dot" style={{ background: d.color }} />
                            <span className="legend-name">{d.name}</span>
                            <span className="legend-val">{pct((d.value / c.expense) * 100)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <EmptyState className="py-6" title="No expenses" message="Nothing recorded for this period." />
                  )}
                </SectionCard>
                <div className="slp-stack">
                  {site.spreads && site.spreads.length > 0 && (
                    <SectionCard title="Active spread costs">
                      <div className="spread-list">
                        {site.spreads.map((sp) => {
                          const si = monthIdx(sp.start);
                          const active = monthIdx(refMonth) >= si && monthIdx(refMonth) < si + Number(sp.months);
                          return (
                            <div className={"spread-item" + (active ? " on" : "")} key={sp.id}>
                              <CalendarClock size={15} />
                              <div>
                                <div className="spread-name">{childLabel(site, sp.head)}</div>
                                <div className="spread-meta">{inr(sp.total)} ÷ {sp.months}m from {monthLabelOf(sp.start)} · {inr(sp.total / sp.months)}/mo</div>
                              </div>
                              <span className="spread-state">{active ? "active" : monthIdx(refMonth) < si ? "upcoming" : "ended"}</span>
                            </div>
                          );
                        })}
                      </div>
                    </SectionCard>
                  )}
                  {siteTrend.length > 1 && (
                    <SectionCard title="Profit trend · actual vs estimate">
                      <ResponsiveContainer width="100%" height={180}>
                        <LineChart data={siteTrend} margin={{ left: 0, right: 8, top: 6, bottom: 0 }}>
                          <CartesianGrid stroke="var(--line)" vertical={false} />
                          <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--muted)" }} stroke="var(--line)" />
                          <YAxis tickFormatter={inrShort} tick={{ fontSize: 10, fill: "var(--muted)" }} stroke="var(--line)" width={54} />
                          <Tooltip content={<TipBox fmt={inr} />} />
                          <Line type="monotone" dataKey="profit" name="Actual" stroke="var(--profit)" strokeWidth={2.4} dot={{ r: 3, fill: "var(--profit)", stroke: "var(--profit)" }} />
                          <Line type="monotone" dataKey="estProfit" name="Estimate" stroke="var(--gold)" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 2.5, fill: "var(--gold)", stroke: "var(--gold)" }} connectNulls />
                        </LineChart>
                      </ResponsiveContainer>
                      <div className="trend-legend"><span><i style={{ background: "var(--profit)" }} />Actual</span><span><i style={{ background: "var(--gold)" }} />Estimate</span></div>
                    </SectionCard>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {tab === "budget" && (
        <BudgetTab site={site} estVer={estVer} historical={historical} onConfig={onConfig} onViewBudget={onViewBudget} />
      )}

      {tab === "history" && (
        <HistoryTab
          site={site}
          sitesAll={sitesAll}
          records={records}
          historical={historical}
          onViewHistory={onViewHistory}
          onOpenVersion={onOpenVersion}
          onDeactivate={onDeactivate}
          onActivate={onActivate}
          onDelete={onDelete}
        />
      )}
    </div>
  );
}
