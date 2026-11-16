import { ROLES, normalizeAppRole } from "../../config/roles";
import { currentPeriodKey, indexToPeriodKey, periodAbsoluteIndex } from "../finance/lib/periods";
import { discoverPulseCatalog } from "./pulseRegistry";

export function isManagementRole(profile) {
  const role = normalizeAppRole(profile?.role);
  return (
    role === ROLES.ADMIN ||
    role === ROLES.MANAGER ||
    role === ROLES.SUPER_ADMIN ||
    role === ROLES.SUPER_ADMIN_PRO
  );
}

export function healthTone(score) {
  if (score == null) return "var(--cp-brand)";
  if (score >= 85) return "var(--cp-good)";
  if (score >= 75) return "var(--cp-watch)";
  return "var(--cp-risk)";
}

export function moduleCatalog() {
  return discoverPulseCatalog().map((mod) => ({
    id: mod.id,
    name: mod.name,
    short: mod.short,
    revenue: mod.revenue,
    planned: mod.planned,
    path: mod.path,
    subs: mod.subs,
    linkKeys: mod.linkKeys,
    note: mod.note,
    provider: mod.provider,
    discovered: mod.discovered,
    order: mod.order,
    icon: mod.icon,
  }));
}

function chipLabel(label) {
  const clean = String(label || "")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (/^dashboard$/i.test(clean)) return "Dashboard";
  return clean.replace(/\s+dashboard$/i, "");
}

function pickLinks(mod, subs) {
  const byKey = new Map(subs.map((sub) => [sub.key, sub]));
  const wanted = (mod.linkKeys || []).map((key) => byKey.get(key)).filter(Boolean);
  const pool = wanted.length ? wanted : subs;
  return pool
    .filter((sub) => sub.canOpen && sub.path)
    .slice(0, 4)
    .map((sub) => ({ key: sub.key, label: chipLabel(sub.label), path: sub.path }));
}

function pickOpenPath(mod, subs, landingOpen) {
  const dashboard = subs.find((sub) => /dashboard/i.test(sub.label || "") && sub.canOpen);
  if (dashboard?.path) return dashboard.path;
  if (landingOpen && mod.path) return mod.path;
  return subs.find((sub) => sub.canOpen)?.path || "";
}

function defaultSignals(mod) {
  return {
    note: mod.note || (mod.discovered ? "Open the module for live detail. Add a pulseProvider to surface metrics here." : ""),
    metrics: [],
    score: null,
    attention: false,
  };
}

/**
 * One card per product module. Catalog auto-includes every NAV_MODULE_TREE entry.
 * Providers supply metrics; modules without a provider still appear for MD visibility.
 */
export function buildPulseModules(ctx) {
  const allow = typeof ctx.allowPath === "function" ? ctx.allowPath : () => false;
  const management = isManagementRole(ctx.profile);
  const views = moduleCatalog().map((mod) => {
    const fromProvider =
      typeof mod.provider?.signals === "function" ? mod.provider.signals(ctx) : null;
    const signals = {
      ...defaultSignals(mod),
      ...(fromProvider || {}),
    };
    if (fromProvider?.note) signals.note = fromProvider.note;
    else if (!signals.note) signals.note = mod.note || "";

    const subs = mod.subs.map((sub) => ({ ...sub, canOpen: allow(sub.path) }));
    const landingOpen = Boolean(mod.path && allow(mod.path));
    const openPath = pickOpenPath(mod, subs, landingOpen);
    const canOpen = Boolean(openPath);
    const links = pickLinks(mod, subs);
    const planned = Boolean(mod.planned);
    return {
      ...mod,
      ...signals,
      planned,
      subs,
      links,
      openPath,
      canOpen,
      visible: management || canOpen,
      score: planned ? null : signals.score,
      attention: planned ? false : Boolean(signals.attention),
    };
  });

  const hr = views.find((view) => view.id === "hr");
  const admin = views.find((view) => view.id === "admin");
  if (admin?.visible && hr?.visible) {
    admin.metrics = [];
    admin.score = null;
    admin.attention = false;
    admin.note = "People and leave are on HR. Open Admin for office work.";
  }

  const scored = views.filter((view) => view.visible && view.score != null);
  const health = scored.length
    ? Math.round(scored.reduce((sum, view) => sum + view.score, 0) / scored.length)
    : null;

  return {
    views,
    health,
    management,
    openCount: views.filter((view) => view.visible && view.canOpen).length,
    discovery: {
      total: views.length,
      withMetrics: views.filter((v) => (v.metrics || []).length > 0).length,
      autoOnly: views.filter((v) => v.discovered).length,
    },
  };
}

export function buildTimelinePresets() {
  const to = currentPeriodKey();
  const end = periodAbsoluteIndex(to);
  const back = (months) => indexToPeriodKey(Math.max(0, end - months));
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  let quarterStart = `${year}-01`;
  if (month >= 4 && month <= 6) quarterStart = `${year}-04`;
  else if (month >= 7 && month <= 9) quarterStart = `${year}-07`;
  else if (month >= 10) quarterStart = `${year}-10`;
  const yearStart = month >= 4 ? `${year}-04` : `${year - 1}-04`;
  return [
    { id: "month", label: "This month", from: to, to },
    { id: "quarter", label: "This quarter", from: quarterStart, to },
    { id: "fy", label: "This year", from: yearStart, to },
    { id: "6m", label: "6 months", from: back(5), to },
    { id: "12m", label: "12 months", from: back(11), to },
  ];
}
