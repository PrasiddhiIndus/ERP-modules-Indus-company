import { FileBarChart, Settings } from "lucide-react";

export const FINANCE_BASE = "/app/accounts-finance";

/** Site Ledger covers sites, heads, entries, budgets, spreads, variance, and reports. */
export const FINANCE_NAV = [
  { id: "site-ledger", label: "Site Ledger", path: `${FINANCE_BASE}/reports/site-ledger`, icon: FileBarChart },
  { id: "settings", label: "Settings", path: `${FINANCE_BASE}/settings`, icon: Settings },
];

const LEGACY_PATHS = new Set([
  FINANCE_BASE,
  `${FINANCE_BASE}/sites`,
  `${FINANCE_BASE}/revenue-heads`,
  `${FINANCE_BASE}/expense-heads`,
  `${FINANCE_BASE}/budget-versions`,
  `${FINANCE_BASE}/revenue`,
  `${FINANCE_BASE}/expenses`,
  `${FINANCE_BASE}/budget-vs-actual`,
  `${FINANCE_BASE}/cost-allocation`,
  `${FINANCE_BASE}/import-export`,
  `${FINANCE_BASE}/reports`,
]);

export function getFinanceTabFromPath(pathname) {
  const p = String(pathname || "").replace(/\/$/, "");
  if (p === `${FINANCE_BASE}/settings`) return "settings";
  if (p.startsWith(`${FINANCE_BASE}/reports/site-ledger`) || LEGACY_PATHS.has(p)) return "site-ledger";
  if (p.startsWith(FINANCE_BASE)) return "site-ledger";
  return "site-ledger";
}

export function financePath(tabId) {
  const item = FINANCE_NAV.find((n) => n.id === tabId);
  return item?.path || `${FINANCE_BASE}/reports/site-ledger`;
}
