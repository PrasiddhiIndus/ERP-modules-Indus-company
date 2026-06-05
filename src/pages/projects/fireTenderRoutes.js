/** Fire Tender costing workflow paths (shared — avoid circular imports). */
export const FIRE_TENDER_COSTING_HUB_BASE = "/app/fire-tender/costing-hub";
export const FIRE_TENDER_DASHBOARD_PATH = "/app/fire-tender";

export const FIRE_TENDER_HUB_TENDER = `${FIRE_TENDER_COSTING_HUB_BASE}/tender`;
export const FIRE_TENDER_HUB_COSTING = `${FIRE_TENDER_COSTING_HUB_BASE}/costing`;
export const FIRE_TENDER_HUB_QUOTATION = `${FIRE_TENDER_COSTING_HUB_BASE}/quotation`;

function normPath(pathname) {
  return String(pathname || "").replace(/\/$/, "");
}

/** Sidebar: dashboard link active only on the dashboard route. */
export function isFireTenderDashboardNavActive(pathname) {
  return normPath(pathname) === FIRE_TENDER_DASHBOARD_PATH;
}

/** Sidebar: costing workflow link (hub, lists, detail sheets — not dashboard/config). */
export function isFireTenderCostingNavActive(pathname) {
  const p = normPath(pathname);
  if (!p.startsWith("/app/fire-tender")) return false;
  if (p === FIRE_TENDER_DASHBOARD_PATH) return false;
  if (p.startsWith("/app/fire-tender/configuration")) return false;
  return true;
}

/**
 * Top workflow tab: tender | costing | quotation | null (dashboard, config, manufacturing).
 */
export function resolveFireTenderWorkflowTab(pathname) {
  const p = normPath(pathname);

  if (p === FIRE_TENDER_DASHBOARD_PATH) return null;
  if (p.startsWith("/app/fire-tender/configuration")) return null;
  if (p.startsWith("/app/fire-tender-manufacturing")) return null;

  if (p.includes("/costing-hub/quotation") || /\/fire-tender\/quotation(\/|$)/.test(p)) {
    return "quotation";
  }
  if (p.includes("/costing-hub/costing") || /\/fire-tender\/costing(\/|$)/.test(p)) {
    return "costing";
  }
  if (
    p.includes("/costing-hub/tender") ||
    p.endsWith("/fire-tender/new") ||
    p.endsWith("/fire-tender/list") ||
    /^\/app\/fire-tender\/\d+$/.test(p)
  ) {
    return "tender";
  }
  if (p.startsWith("/app/fire-tender/costing-hub")) return "tender";

  return null;
}

export function formatTenderAddress(data) {
  if (!data) return "";
  const cityState = [data.city, data.state].filter((x) => x && String(x).trim()).join(", ");
  const parts = [data.street, data.street2, cityState, data.zip, data.country].filter(
    (x) => x != null && String(x).trim() !== "" && String(x) !== "undefined"
  );
  return parts.join(", ").trim();
}
