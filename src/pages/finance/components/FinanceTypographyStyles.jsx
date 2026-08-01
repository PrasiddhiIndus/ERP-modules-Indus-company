import React from "react";

const FONT = "var(--font-sans)";
const MONO = "var(--font-mono)";

/** Shared typography tokens for the Finance module. */
export default function FinanceTypographyStyles() {
  return (
    <style>{`
    .finance-module,
    .finance-module .app,
    .finance-module .fin-dash {
      --display: ${FONT};
      --body: ${FONT};
      --mono: ${MONO};
      font-family: var(--body);
      font-size: 13px;
      line-height: 1.45;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
      font-style: normal;
    }
    .finance-module i,
    .finance-module em {
      font-style: normal !important;
    }
    .finance-module h1,
    .finance-module h2,
    .finance-module h3,
    .finance-module .fin-topbar h1,
    .finance-module .topbar h1,
    .finance-module .sm-title,
    .finance-module .card-head h3,
    .finance-module .fin-card-head h3 {
      font-family: var(--body);
      font-weight: 600;
      letter-spacing: -0.01em;
      font-style: normal;
    }
    .finance-module .kpi-value,
    .finance-module .fin-kpi-value,
    .finance-module .sm-kpi-val {
      font-family: var(--mono);
      font-weight: 400;
      font-size: 21px;
      line-height: 1.2;
      font-variant-numeric: tabular-nums;
    }
    .finance-module .mono,
    .finance-module .fin-mono,
    .finance-module .vtbl-num,
    .finance-module .field-in input {
      font-family: var(--mono);
      font-variant-numeric: tabular-nums;
    }
    .finance-module .ov-filter>span,
    .finance-module .entry-sel label,
    .finance-module .sm-filter>span,
    .finance-module .fin-filters label,
    .finance-module .month-pick label,
    .finance-module .sf>span,
    .finance-module .m-field>span,
    .finance-module .fgroup-h,
    .finance-module .entry-totals-h,
    .finance-module .pl-audit-title,
    .finance-module .hist-section-label,
    .finance-module .blab,
    .finance-module .m-divider {
      font-family: var(--mono) !important;
      text-transform: uppercase !important;
      letter-spacing: 0.1em !important;
      font-size: 9.5px !important;
      font-weight: 500 !important;
      line-height: 1 !important;
      font-variant-numeric: tabular-nums;
    }
    .finance-module .tbl th,
    .finance-module .fin-tbl th,
    .finance-module .site-ie-card .vtbl thead th {
      font-family: var(--mono) !important;
      text-transform: uppercase !important;
      letter-spacing: 0.1em !important;
      font-size: 9.5px !important;
      font-weight: 500 !important;
      font-variant-numeric: tabular-nums;
    }
    .finance-module .site-ie-card .vtbl tr.vsec td {
      font-family: var(--body) !important;
      text-transform: uppercase !important;
      letter-spacing: 0.06em !important;
      font-size: 12px !important;
      font-weight: 600 !important;
    }
    .finance-module .spread-state {
      text-transform: capitalize !important;
      letter-spacing: 0 !important;
      font-size: 12px !important;
    }
    .finance-module .spread-active-yes,
    .finance-module .spread-active-no {
      text-transform: none !important;
    }
    `}</style>
  );
}
