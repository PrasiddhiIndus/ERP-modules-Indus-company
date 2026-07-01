import React from "react";

/** P&L dashboard design tokens — from SiteLedger UI spec. */
export default function FinanceDashboardStyles() {
  return (
    <style>{`
    .fin-dash{--paper:#f8fafc;--surface:#ffffff;--ink:#111827;--ink-soft:#4b5563;--muted:#6b7280;--line:#e5e7eb;--green:#dc2626;--profit:#15803d;--loss:#b91c1c;--warn:#d97706;--gold:#b45309;--display:"Segoe UI",system-ui,-apple-system,BlinkMacSystemFont,sans-serif;--body:"Segoe UI",system-ui,-apple-system,BlinkMacSystemFont,sans-serif;--mono:ui-monospace,"Cascadia Mono","Segoe UI Mono",Consolas,monospace;font-family:var(--body);font-size:13px;color:var(--ink);background:var(--paper);}
    .fin-dash *{box-sizing:border-box}
    .fin-topbar{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;padding:16px 0 20px;border-bottom:1px solid var(--line);margin-bottom:18px;}
    .fin-topbar h1{font-family:var(--display);font-size:23px;font-weight:700;margin:0;letter-spacing:-.02em;}
    .fin-topbar p{margin:2px 0 0;color:var(--muted);font-size:12.5px;}
    .fin-filters{display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap;}
    .fin-filters label{display:flex;flex-direction:column;gap:3px;font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);font-weight:600;}
    .fin-filters select{font-family:var(--body);font-size:13px;padding:8px 12px;border:1px solid var(--line);border-radius:9px;background:var(--surface);color:var(--ink);font-weight:600;cursor:pointer;}
    .period-month-select{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}
    .fin-seg{display:inline-flex;border:1px solid var(--line);border-radius:9px;overflow:hidden;}
    .fin-seg button{background:var(--surface);border:none;border-right:1px solid var(--line);padding:7px 13px;font-family:var(--body);font-size:12.5px;cursor:pointer;color:var(--ink-soft);}
    .fin-seg button:last-child{border-right:none;}
    .fin-seg button.on{background:var(--green);color:#fff;}
    .fin-kpi-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:18px;}
    .fin-kpi{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:15px 17px;}
    .fin-kpi-top{display:flex;align-items:center;gap:8px;margin-bottom:9px;}
    .fin-kpi-label{font-size:11.5px;color:var(--ink-soft);font-weight:500;}
    .fin-kpi-value{font-family:var(--display);font-size:25px;font-weight:700;letter-spacing:-.02em;line-height:1;}
    .fin-kpi-sub{display:flex;align-items:center;gap:4px;margin-top:7px;font-size:11.5px;color:var(--muted);font-family:var(--mono);}
    .fin-card{background:var(--surface);border:1px solid var(--line);border-radius:14px;margin-bottom:18px;overflow:hidden;}
    .fin-card-head{display:flex;align-items:center;justify-content:space-between;padding:15px 18px 12px;}
    .fin-card-head h3{font-family:var(--display);font-size:15.5px;font-weight:700;margin:0;}
    .fin-muted{font-size:11.5px;color:var(--muted);}
    .fin-card-body{padding:0 18px 18px;}
    .fin-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:18px;}
    @media(max-width:1080px){.fin-grid-2{grid-template-columns:1fr;}}
    .fin-donut-wrap{display:flex;align-items:center;gap:14px;}
    .fin-donut-wrap>div:first-child{flex:0 0 46%;}
    .fin-legend{flex:1;display:flex;flex-direction:column;gap:7px;}
    .fin-legend-row{display:flex;align-items:center;gap:8px;font-size:12.5px;}
    .fin-legend-dot{width:9px;height:9px;border-radius:3px;flex-shrink:0;}
    .fin-legend-name{flex:1;color:var(--ink-soft);}
    .fin-legend-val{font-family:var(--mono);font-weight:600;font-size:12px;}
    .fin-legend-pct{font-family:var(--mono);color:var(--muted);width:46px;text-align:right;font-size:11.5px;}
    .fin-trend-legend{display:flex;gap:18px;justify-content:center;padding:4px 0 2px;font-size:12px;color:var(--ink-soft);}
    .fin-trend-legend span{display:flex;align-items:center;gap:6px;}
    .fin-trend-legend i{width:14px;height:3px;border-radius:2px;display:inline-block;}
    .fin-tbl{width:100%;border-collapse:collapse;font-size:13px;}
    .fin-tbl th{text-align:left;padding:9px 12px;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);border-bottom:1px solid var(--line);font-weight:600;}
    .fin-tbl th.r,.fin-tbl td.r{text-align:right;}
    .fin-tbl td{padding:11px 12px;border-bottom:1px solid var(--line);}
    .fin-tbl tr:last-child td{border-bottom:none;}
    .fin-tbl tbody tr:hover td{background:rgba(31,111,78,.035);}
    .fin-strong{font-weight:600;}
    .fin-mono{font-family:var(--mono);font-size:12.5px;font-variant-numeric:tabular-nums;}
    .fin-link{background:none;border:none;color:var(--green);font-weight:600;cursor:pointer;font-family:var(--body);font-size:inherit;padding:0;}
    .pill{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;padding:3px 9px;border-radius:20px;}
    .pill-ok{background:rgba(22,119,78,.12);color:var(--profit);}
    .pill-watch{background:rgba(169,132,43,.14);color:var(--gold);}
    .pill-warn{background:rgba(194,130,15,.15);color:var(--warn);}
    .pill-loss{background:rgba(178,63,42,.13);color:var(--loss);}
    .pill-pending{background:rgba(194,130,15,.16);color:var(--warn);}
    .fin-pend-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:8px;}
    .fin-pend-item{display:flex;align-items:center;gap:9px;text-align:left;background:rgba(194,130,15,.07);border:1px solid rgba(194,130,15,.25);border-radius:10px;padding:9px 12px;cursor:pointer;font-family:var(--body);width:100%;}
    .fin-pend-item:hover{background:rgba(194,130,15,.13);}
    .fin-pend-dot{width:8px;height:8px;border-radius:50%;background:var(--warn);flex-shrink:0;}
    .fin-pend-name{flex:1;font-size:13px;font-weight:600;}
    .fin-pend-badge{font-size:10.5px;font-family:var(--mono);color:var(--warn);background:rgba(194,130,15,.15);padding:1px 7px;border-radius:20px;}
    .fin-pend-cta{font-size:12px;color:var(--green);font-weight:600;}
    .fin-all-clear{display:flex;align-items:center;gap:9px;color:var(--profit);font-size:13px;padding:6px 0;}
    .fin-empty{text-align:center;padding:60px 20px;color:var(--muted);}
    .fin-empty svg{color:var(--line);margin-bottom:14px;}
    .fin-empty h3{font-family:var(--display);color:var(--ink);margin:0 0 6px;font-size:18px;}
    .fin-empty p{margin:0;font-size:13.5px;}
    .row-pending td{background:rgba(194,130,15,.06)!important;box-shadow:inset 3px 0 0 var(--warn);}
    .fin-tip{background:var(--ink);color:#fff;padding:9px 11px;border-radius:9px;font-size:12px;box-shadow:0 8px 24px rgba(0,0,0,.2);}
    .fin-tip-title{font-weight:700;margin-bottom:5px;font-family:var(--display);}
    .fin-tip-row{display:flex;align-items:center;gap:7px;padding:1px 0;}
    .fin-tip-dot{width:8px;height:8px;border-radius:2px;}
    .fin-tip-row strong{margin-left:auto;font-family:var(--mono);}
    `}</style>
  );
}
