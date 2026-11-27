/**
 * Small pieces shared by the Site Ledger pages (PortfolioOverview, SitesManagement,
 * SiteWorkspace) and SiteLedgerApp. Legacy CSS classes (`tip`, `sm-pend`, `mono`, …)
 * are provided by the parent `<Styles />` block in SiteLedgerApp.
 */
import React from "react";
import { StatusChip } from "../../../../components/erpUi";
import { TARGET_MARGIN, WARN_MARGIN, MONTHS } from "../domain/constants.js";
import { pendingMonths } from "../domain/siteLifecycle.js";
import { inr } from "../domain/formatMoney.js";
import { formatPeriodDateDDMMYYYY } from "../../components/PeriodDateSelect";
import { monthLabelOf as periodMonthLabelOf } from "../../lib/periods";

/* ───────── margin thresholds ───────── */
export const PlMarginContext = React.createContext({ targetMargin: TARGET_MARGIN, warnMargin: WARN_MARGIN });

export function usePlMargins() {
  return React.useContext(PlMarginContext);
}

/* ───────── period label ───────── */
export const monthLabelOf = (k) => formatPeriodDateDDMMYYYY(k) || periodMonthLabelOf(k, MONTHS);

/* ───────── margin status chip ───────── */
export function marginStatus(margin, profit, { targetMargin, warnMargin }) {
  if (profit < 0) return { label: "Loss", severity: "critical" };
  if (margin < warnMargin) return { label: "Thin", severity: "high" };
  if (margin < targetMargin) return { label: "Watch", severity: "warning" };
  return { label: "On target", severity: "neutral" };
}

export function StatusPill({ margin, profit }) {
  const margins = usePlMargins();
  const s = marginStatus(margin, profit, margins);
  return <StatusChip label={s.label} severity={s.severity} />;
}

/* ───────── recharts tooltip ───────── */
export function TipBox({ active, payload, fmt }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="tip">
      {payload[0].payload.name && <div className="tip-title">{payload[0].payload.name}</div>}
      {payload.map((p, i) => (
        <div key={i} className="tip-row">
          <span className="tip-dot" style={{ background: p.color || p.fill }} />
          <span>{p.name}</span>
          <strong>{fmt ? fmt(p.value) : p.value}</strong>
        </div>
      ))}
    </div>
  );
}

/* ───────── estimate / actual / variance cells ───────── */
export const vcell = (actual, estimate, lowerIsBetter) => {
  const v = actual - estimate;
  const fav = lowerIsBetter ? v <= 0 : v >= 0;
  const vp = estimate !== 0 ? (v / Math.abs(estimate)) * 100 : null;
  return { v, fav, vp };
};

export function VarCells({ est, actual, lowerIsBetter, hasEst }) {
  const c = vcell(actual, est, lowerIsBetter);
  return (
    <>
      <td className="r mono dim vtbl-num">{hasEst ? inr(est) : "—"}</td>
      <td className="r mono vtbl-num">{inr(actual)}</td>
      <td className="r mono vtbl-num" style={{ color: hasEst ? (c.fav ? "var(--profit)" : "var(--loss)") : "var(--muted)" }}>
        {hasEst ? `${c.v >= 0 ? "+" : ""}${inr(c.v)}` : "—"}
      </td>
      <td className="r mono dim vtbl-num">{c.vp == null ? "—" : `${c.vp >= 0 ? "+" : ""}${c.vp.toFixed(0)}%`}</td>
    </>
  );
}

/* ───────── pending-months cell ───────── */
export function pendingMonthsTone(count) {
  if (count <= 0) return "ok";
  if (count <= 3) return "low";
  if (count <= 6) return "med";
  return "high";
}

export function PendingMonthsCell({ site, records, uptoMk }) {
  const pending = pendingMonths(site, records, uptoMk);
  const labels = pending.map(monthLabelOf);
  const tone = pendingMonthsTone(pending.length);
  if (!pending.length) {
    return <span className="sm-pend sm-pend-ok">0 · All data completed</span>;
  }
  const preview = labels.slice(0, 3).join(", ");
  const more = labels.length > 3 ? ` +${labels.length - 3} more` : "";
  return (
    <span className={`sm-pend sm-pend-${tone}`} title={labels.join(", ")}>
      {pending.length} Pending: {preview}{more}
    </span>
  );
}

/* ───────── responsive layout CSS for the extracted pages ─────────
   Rendered by each page so they stay self-contained; duplicates are harmless. */
export function SiteLedgerPageStyles() {
  return (
    <style>{`
      .slp-stack{display:flex;flex-direction:column;gap:16px;}
      .slp-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(168px,1fr));gap:12px;}
      .slp-kpis .slp-tone-profit{color:var(--profit);}
      .slp-kpis .slp-tone-loss{color:var(--loss);}
      .slp-kpis .slp-tone-warn{color:var(--warn);}
      .slp-filters{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px 14px;align-items:end;width:100%;}
      .slp-filters .ov-filter,.slp-filters .ov-filter-ac{min-width:0;max-width:none;width:100%;}
      .slp-filters .slp-span-2{grid-column:span 2;}
      .slp-filters .ov-filter select,.slp-filters .ov-filter input{width:100%;}
      .slp-filters .ov-filter.range .ov-range{display:flex;gap:6px;align-items:center;}
      .slp-filters .ov-filter.range .ov-range input{width:100%;min-width:0;}
      .slp-filters-foot{grid-column:1/-1;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;}
      @media(max-width:1180px){.slp-filters{grid-template-columns:repeat(4,minmax(0,1fr));}}
      @media(max-width:900px){.slp-filters{grid-template-columns:repeat(2,minmax(0,1fr));}.slp-filters .slp-span-2{grid-column:span 2;}}
      @media(max-width:560px){.slp-filters{grid-template-columns:1fr;}.slp-filters .slp-span-2{grid-column:auto;}}
      .slp-tabs{display:flex;flex-wrap:wrap;gap:4px;border-bottom:1px solid var(--border,var(--line));}
      .slp-tab{display:inline-flex;align-items:center;gap:6px;padding:9px 14px;font-size:13px;font-weight:600;color:var(--muted);background:transparent;border:0;border-bottom:2px solid transparent;margin-bottom:-1px;cursor:pointer;font-family:inherit;}
      .slp-tab:hover:not(:disabled){color:var(--ink);}
      .slp-tab.on{color:var(--ink);border-bottom-color:var(--gold,var(--ink));}
      .slp-tab:disabled{opacity:.45;cursor:not-allowed;}
      .slp-tab .slp-tab-hint{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);}
      .slp-mode{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--muted);}
      .slp-row-actions{display:inline-flex;align-items:center;gap:2px;}
      .slp-more-list{display:flex;flex-direction:column;gap:6px;}
      .slp-more-list button{display:flex;align-items:center;gap:8px;width:100%;text-align:left;padding:9px 12px;border:1px solid var(--line);border-radius:8px;background:var(--surface);font-family:inherit;font-size:13px;color:var(--ink);cursor:pointer;}
      .slp-more-list button:hover{background:var(--row-hover);}
      .slp-more-list button.danger{color:var(--loss);}
      .slp-sort-btn{background:none;border:0;padding:0;font:inherit;font-weight:600;color:inherit;cursor:pointer;white-space:nowrap;}
      .slp-site-link{background:none;border:0;padding:0;font:inherit;font-weight:600;color:var(--ink);cursor:pointer;text-align:left;text-decoration:underline;text-decoration-color:transparent;}
      .slp-site-link:hover{text-decoration-color:currentColor;}
      .slp-chart-card{padding:14px 16px;}
      .slp-flush{margin:-1px;}
      @media(max-width:1080px){.slp-two{grid-template-columns:1fr!important;}}
    `}</style>
  );
}
