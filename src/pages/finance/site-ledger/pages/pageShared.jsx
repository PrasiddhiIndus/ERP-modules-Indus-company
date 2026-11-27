/**
 * Helpers shared by SiteLedgerApp and the extracted Site Ledger pages
 * (SiteSetupPage, FiguresEntryPage). Behaviour is identical to the previous in-file copies.
 */
import React from "react";
import { periodKeyToDateStart } from "../../lib/periods";

export function contractDateInputValue(periodOrDate) {
  if (!periodOrDate) return "";
  const s = String(periodOrDate).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}$/.test(s)) return periodKeyToDateStart(s) || "";
  return "";
}

export { monthLabelOf } from "../components/SiteLedgerShared.jsx";

/** Calculation wrappers live in one place — site-ledger/calculations/siteLedgerCalcs.js. */
export {
  parseEntryAmount,
  recognizedExpenses,
  calcSite,
  estTotals,
} from "../calculations/siteLedgerCalcs.js";

export function Card({ title, right, children, pad = true, className = "" }) {
  return (
    <div className={"card " + className}>
      {(title || right) && <div className="card-head"><h3>{title}</h3>{right}</div>}
      <div style={{ padding: pad ? "0 18px 18px" : 0 }}>{children}</div>
    </div>
  );
}
