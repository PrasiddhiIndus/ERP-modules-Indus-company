import { API_STATUS_LABELS } from "../config/apiConstants";

export function formatMs(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n)) return "—";
  return `${n} ms`;
}

export function uptimeBarColor(percent, t) {
  const n = Number(percent) || 0;
  if (n >= 99) return t.progressGreen;
  if (n >= 95) return t.progressAmber;
  return t.progressRed;
}

export function statusTone(status, t) {
  if (status === "online") return t.statusOnline;
  if (status === "degraded") return t.statusDegraded;
  if (status === "offline") return t.statusOffline;
  return t.badgeNeutral;
}

export function statusDotColor(status) {
  if (status === "online") return "bg-emerald-500";
  if (status === "degraded") return "bg-amber-500";
  if (status === "offline") return "bg-red-500";
  return "bg-gray-400";
}

export function statusLabel(status) {
  return API_STATUS_LABELS[status] || status || "Unknown";
}

/** Friendly service groups for the status overview (non-technical labels). */
export const PLATFORM_SERVICE_LANES = [
  {
    id: "erp",
    title: "ERP Server",
    blurb: "Main app server that powers screens and saves",
    categories: ["Core Backend"],
  },
  {
    id: "auth",
    title: "Sign-in",
    blurb: "Login and keeping you signed in",
    categories: ["Auth"],
  },
  {
    id: "database",
    title: "Database",
    blurb: "Where company data is stored (Supabase)",
    categories: ["Data Platform"],
  },
  {
    id: "modules",
    title: "Business tools",
    blurb: "HR, billing, users, operations, and IT checks",
    categories: ["User Management", "HR Integrations", "Billing", "Operations", "IT/IS"],
  },
  {
    id: "external",
    title: "Outside services",
    blurb: "Connections to other company systems",
    categories: ["Third-party Services"],
  },
];

/**
 * Build a simple overall + per-lane status from current snapshots.
 * @returns {{
 *   overall: 'healthy'|'attention'|'problems'|'checking',
 *   overallLabel: string,
 *   overallHint: string,
 *   total: number,
 *   checked: number,
 *   online: number,
 *   degraded: number,
 *   offline: number,
 *   successRate: number|null,
 *   lanes: Array<object>,
 *   items: Array<object>,
 *   downItems: Array<object>,
 *   slowItems: Array<object>,
 *   okItems: Array<object>
 * }}
 */
export function buildPlatformOverview(apis, snapshots, { loading = false } = {}) {
  const list = apis || [];
  const snaps = list.map((api) => snapshots?.[api.id]).filter(Boolean);
  const checked = snaps.length;
  const online = snaps.filter((s) => s.status === "online").length;
  const degraded = snaps.filter((s) => s.status === "degraded").length;
  const offline = snaps.filter((s) => s.status === "offline").length;
  const total = list.length;

  let overall = "checking";
  let overallLabel = "Checking…";
  let overallHint = "Running quick checks on connected services.";
  if (!loading && checked > 0) {
    if (offline > 0) {
      overall = "problems";
      overallLabel = "Problems";
      overallHint = "Some services are not responding. Ask IT if this lasts more than a few minutes.";
    } else if (degraded > 0) {
      overall = "attention";
      overallLabel = "Needs attention";
      overallHint = "Everything is reachable, but some services are slow.";
    } else {
      overall = "healthy";
      overallLabel = "Healthy";
      overallHint = "All checked services are working normally.";
    }
  } else if (loading && checked === 0) {
    overall = "checking";
    overallLabel = "Checking…";
    overallHint = "Please wait while we check each service.";
  } else if (!loading && checked === 0) {
    overall = "attention";
    overallLabel = "No results yet";
    overallHint = "Use Refresh to run checks.";
  }

  const successRate =
    checked > 0 ? Math.round(((online + degraded * 0.5) / checked) * 1000) / 10 : null;

  const statusRank = { offline: 0, degraded: 1, online: 2, pending: 3 };

  const toItem = (api) => {
    const snap = snapshots?.[api.id];
    return {
      id: api.id,
      name: api.name,
      group: api.group || api.category || "",
      status: snap?.status || "pending",
      latencyMs: snap?.latencyMs ?? null,
      errorMessage: snap?.errorMessage || null,
      checked: Boolean(snap),
    };
  };

  const sortItems = (items) =>
    [...items].sort((a, b) => {
      const ra = statusRank[a.status] ?? 9;
      const rb = statusRank[b.status] ?? 9;
      if (ra !== rb) return ra - rb;
      return String(a.name).localeCompare(String(b.name));
    });

  const lanes = PLATFORM_SERVICE_LANES.map((lane) => {
    const laneApis = list.filter((api) => lane.categories.includes(api.group || api.category));
    const items = sortItems(laneApis.map(toItem));
    const laneSnaps = items.filter((item) => item.checked);
    const laneOnline = laneSnaps.filter((s) => s.status === "online").length;
    const laneDegraded = laneSnaps.filter((s) => s.status === "degraded").length;
    const laneOffline = laneSnaps.filter((s) => s.status === "offline").length;
    let laneStatus = "checking";
    let laneStatusLabel = "Checking…";
    if (laneApis.length === 0) {
      laneStatus = "empty";
      laneStatusLabel = "Not monitored";
    } else if (laneSnaps.length === 0 && loading) {
      laneStatus = "checking";
      laneStatusLabel = "Checking…";
    } else if (laneSnaps.length === 0) {
      laneStatus = "checking";
      laneStatusLabel = "Waiting";
    } else if (laneOffline > 0) {
      laneStatus = "problems";
      laneStatusLabel = "Problems";
    } else if (laneDegraded > 0) {
      laneStatus = "attention";
      laneStatusLabel = "Slow";
    } else {
      laneStatus = "healthy";
      laneStatusLabel = "Healthy";
    }
    return {
      ...lane,
      apiCount: laneApis.length,
      checked: laneSnaps.length,
      online: laneOnline,
      warnings: laneDegraded,
      errors: laneOffline,
      status: laneStatus,
      statusLabel: laneStatusLabel,
      items,
      downItems: items.filter((i) => i.status === "offline"),
      slowItems: items.filter((i) => i.status === "degraded"),
      okItems: items.filter((i) => i.status === "online"),
    };
  }).filter((lane) => lane.apiCount > 0);

  const allItems = sortItems(lanes.flatMap((lane) => lane.items));

  return {
    overall,
    overallLabel,
    overallHint,
    total,
    checked,
    online,
    degraded,
    offline,
    successRate,
    lanes,
    items: allItems,
    downItems: allItems.filter((i) => i.status === "offline"),
    slowItems: allItems.filter((i) => i.status === "degraded"),
    okItems: allItems.filter((i) => i.status === "online"),
  };
}
